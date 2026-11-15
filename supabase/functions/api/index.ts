// ByteVoice Bangla — single Edge Function, routed by path:
//   POST /api/session   start a call: creates the call row, returns a locked ephemeral Gemini token
//   POST /api/tool      execute one agent tool call (server-side validation, DB writes)
//   POST /api/turns     append/replace transcript turns (sent incrementally during the call)
//   POST /api/state     call state changes (connected / client error)
//   POST /api/finalize  end the call → extraction, validation, status
//   GET  /api/health    liveness + config check (no secrets)

import { env } from "./lib/env.ts";
import { corsHeaders, HttpError, json, originAllowed, readJson } from "./lib/http.ts";
import { admin, authoriseCall, loadClinic, logEvent, randomSecret, sha256Hex } from "./lib/db.ts";
import { buildSystemPrompt } from "./lib/prompt.ts";
import { runTool, toolDeclarations } from "./lib/tools.ts";
import { createEphemeralToken, liveConfig } from "./lib/gemini.ts";
import { finalizeCall } from "./lib/finalize.ts";

async function startSession(req: Request) {
  if (!originAllowed(req)) throw new HttpError(403, "origin_not_allowed");
  if (!env.geminiApiKey) throw new HttpError(503, "voice_unavailable");

  // Abuse protection for a public demo: per-IP and per-day caps (protects the free quota).
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "unknown";
  const ipHash = (await sha256Hex(ip + env.serviceRoleKey.slice(-12))).slice(0, 24); // salted, not reversible
  const hourAgo = new Date(Date.now() - 3600_000).toISOString();
  const dayAgo = new Date(Date.now() - 86400_000).toISOString();
  const [{ count: ipCount }, { count: dayCount }] = await Promise.all([
    admin.from("calls").select("id", { count: "exact", head: true }).eq("client_meta->>ip_hash", ipHash).gte("started_at", hourAgo),
    admin.from("calls").select("id", { count: "exact", head: true }).gte("started_at", dayAgo),
  ]);
  if ((ipCount ?? 0) >= env.maxCallsPerIpPerHour) throw new HttpError(429, "rate_limited_ip");
  if ((dayCount ?? 0) >= env.maxCallsPerDay) throw new HttpError(429, "rate_limited_daily");

  const ctx = await loadClinic(env.clinicSlug);
  const systemInstruction = buildSystemPrompt(ctx);
  const tools = toolDeclarations(ctx);
  let token: string;
  try {
    token = await createEphemeralToken(systemInstruction, tools);
  } catch (e) {
    console.error("ephemeral token failed", e); // e.g. bad key, model not enabled, quota
    throw new HttpError(503, "voice_unavailable");
  }

  const secret = randomSecret();
  const { data: call, error } = await admin.from("calls").insert({
    clinic_id: ctx.clinic.id, channel: "web", status: "in_progress", model: env.liveModel,
    session_secret_hash: await sha256Hex(secret),
    client_meta: { ip_hash: ipHash, ua: (req.headers.get("user-agent") ?? "").slice(0, 200) },
  }).select("id, started_at").single();
  if (error) throw new HttpError(500, "db_error", error.message);

  return {
    callId: call.id,
    callSecret: secret,
    token,
    model: env.liveModel,
    // The browser sends this setup too, but the token's locked constraints take precedence.
    config: { ...liveConfig("(locked server-side)", []), systemInstruction: undefined, tools: undefined },
    maxCallSeconds: env.maxCallSeconds,
    clinic: { name_bn: ctx.clinic.name_bn, name_en: ctx.clinic.name_en },
  };
}

type TurnIn = { seq: number; speaker: string; text: string; offsetMs: number; interrupted?: boolean };

async function saveTurns(callId: string, startedAt: string, turns: TurnIn[]) {
  const t0 = new Date(startedAt).getTime();
  const rows = turns
    .filter((t) => Number.isInteger(t.seq) && t.seq >= 0 && t.seq < 2000 && ["agent", "caller", "system"].includes(t.speaker))
    .map((t) => ({
      call_id: callId, seq: t.seq, speaker: t.speaker,
      text_bn: String(t.text ?? "").slice(0, 4000).trim(),
      offset_ms: Math.max(0, Math.round(Number(t.offsetMs) || 0)),
      ts: new Date(t0 + Math.max(0, Number(t.offsetMs) || 0)).toISOString(),
      interrupted: !!t.interrupted,
    }))
    .filter((r) => r.text_bn.length > 0)
    .slice(0, 200);
  if (!rows.length) return 0;
  const { error } = await admin.from("transcript_turns").upsert(rows, { onConflict: "call_id,seq" });
  if (error) throw new HttpError(500, "db_error", error.message);
  return rows.length;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(req) });
  const action = new URL(req.url).pathname.split("/").filter(Boolean).pop();

  try {
    if (req.method === "GET" && action === "health") {
      return json(req, { ok: true, voiceConfigured: !!env.geminiApiKey, liveModel: env.liveModel, textModel: env.textModel });
    }
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
    const body = await readJson<Record<string, any>>(req);

    switch (action) {
      case "session":
        return json(req, await startSession(req));

      case "tool": {
        const call = await authoriseCall(body.callId, body.secret, req.headers.get("authorization"));
        if (call.finalized_at) throw new HttpError(409, "call_finished");
        if (typeof body.name !== "string") throw new HttpError(400, "bad_tool");
        const ctx = await loadClinic(call.clinic_id);
        const result = await runTool(ctx, call.id, body.name, (body.args ?? {}) as Record<string, unknown>);
        return json(req, { result });
      }

      case "turns": {
        const call = await authoriseCall(body.callId, body.secret, req.headers.get("authorization"));
        const saved = await saveTurns(call.id, call.started_at, Array.isArray(body.turns) ? body.turns : []);
        return json(req, { saved });
      }

      case "state": {
        const call = await authoriseCall(body.callId, body.secret, req.headers.get("authorization"));
        if (body.state === "connected" && !call.connected_at) {
          await admin.from("calls").update({ connected_at: new Date().toISOString() }).eq("id", call.id);
        }
        await logEvent(call.id, `state:${String(body.state).slice(0, 40)}`, { detail: String(body.detail ?? "").slice(0, 500) }, null, body.state !== "error");
        return json(req, { ok: true });
      }

      case "finalize": {
        const call = await authoriseCall(body.callId, body.secret, req.headers.get("authorization"));
        if (Array.isArray(body.turns)) await saveTurns(call.id, call.started_at, body.turns);
        const reasons = ["caller_hangup", "agent_ended", "error", "timeout", "abandoned"];
        const endReason = reasons.includes(body.endReason) ? body.endReason : "caller_hangup";
        // Don't keep the caller waiting on the LLM: answer within 12 s, let the rest finish in the background.
        const work = finalizeCall(call, endReason, body.error ? String(body.error).slice(0, 500) : null)
          .catch((e) => { console.error("finalize failed", e); return null; });
        // deno-lint-ignore no-explicit-any
        (globalThis as any).EdgeRuntime?.waitUntil?.(work);
        const out = await Promise.race([work, new Promise<null>((r) => setTimeout(() => r(null), 12_000))]);
        return json(req, { ok: true, status: out?.status ?? "processing" });
      }

      default:
        throw new HttpError(404, "not_found");
    }
  } catch (e) {
    if (e instanceof HttpError) return json(req, { error: e.code, message: e.message }, e.status);
    console.error("unhandled", e);
    return json(req, { error: "internal_error" }, 500);
  }
});

import { createClient, SupabaseClient } from "npm:@supabase/supabase-js@2.49.4";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";

/** Service-role client: bypasses RLS. Only ever used server-side inside this function. */
export const admin: SupabaseClient = createClient(env.supabaseUrl, env.serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomSecret(bytes = 24): string {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/[+/=]/g, (c) => ({ "+": "-", "/": "_", "=": "" }[c]!));
}

/** Constant-time string compare. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

export type CallRow = {
  id: string; clinic_id: string; patient_id: string | null; status: string;
  started_at: string; connected_at: string | null; ended_at: string | null; finalized_at: string | null;
  session_secret_hash: string;
};

/**
 * Authorise a write to a call. Either the browser that started the call (holds the
 * per-call secret) or a logged-in staff member of the call's clinic.
 */
export async function authoriseCall(callId: unknown, secret: unknown, authHeader: string | null): Promise<CallRow> {
  if (typeof callId !== "string" || !/^[0-9a-f-]{36}$/i.test(callId)) throw new HttpError(400, "bad_call_id");
  const { data: call, error } = await admin.from("calls").select("*").eq("id", callId).maybeSingle();
  if (error) throw new HttpError(500, "db_error", error.message);
  if (!call) throw new HttpError(404, "call_not_found");

  if (typeof secret === "string" && secret.length > 10) {
    if (safeEqual(await sha256Hex(secret), call.session_secret_hash)) return call as CallRow;
    throw new HttpError(403, "bad_call_secret");
  }
  const token = authHeader?.replace(/^Bearer\s+/i, "");
  if (token) {
    const { data: u } = await admin.auth.getUser(token);
    if (u?.user) {
      const { data: s } = await admin.from("staff").select("clinic_id").eq("user_id", u.user.id).maybeSingle();
      if (s && s.clinic_id === call.clinic_id) return call as CallRow;
    }
  }
  throw new HttpError(403, "not_authorised");
}

export type ClinicContext = {
  clinic: {
    id: string; slug: string; name_bn: string; name_en: string; phone: string;
    address_bn: string; address_en: string; directions_bn: string | null; slot_minutes: number;
  };
  doctors: { id: string; full_name_bn: string; full_name_en: string; title_bn: string; title_en: string }[];
  schedules: { doctor_id: string; weekday: number; start_time: string; end_time: string }[];
  services: {
    id: string; code: string; name_bn: string; name_en: string; fee_from_bdt: number;
    fee_to_bdt: number | null; duration_min: number; prep_bn: string | null;
  }[];
};

let cache: { at: number; slug: string; ctx: ClinicContext } | null = null;

/** Clinic facts the agent is allowed to state. Cached for 60 s per isolate. */
export async function loadClinic(slugOrId: string): Promise<ClinicContext> {
  if (cache && Date.now() - cache.at < 60_000 && (cache.slug === slugOrId || cache.ctx.clinic.id === slugOrId)) {
    return cache.ctx;
  }
  const isId = /^[0-9a-f-]{36}$/i.test(slugOrId);
  const { data: clinic, error } = await admin.from("clinics").select("*")
    .eq(isId ? "id" : "slug", slugOrId).single();
  if (error || !clinic) throw new HttpError(500, "clinic_missing", error?.message);
  const [d, s, sv] = await Promise.all([
    admin.from("doctors").select("id, full_name_bn, full_name_en, title_bn, title_en").eq("clinic_id", clinic.id).eq("active", true),
    admin.from("doctor_schedules").select("doctor_id, weekday, start_time, end_time, doctors!inner(clinic_id)").eq("doctors.clinic_id", clinic.id),
    admin.from("services").select("*").eq("clinic_id", clinic.id).order("fee_from_bdt"),
  ]);
  const ctx: ClinicContext = {
    clinic,
    doctors: d.data ?? [],
    schedules: (s.data ?? []).map(({ doctor_id, weekday, start_time, end_time }) => ({ doctor_id, weekday, start_time, end_time })),
    services: sv.data ?? [],
  };
  cache = { at: Date.now(), slug: clinic.slug, ctx };
  return ctx;
}

export async function logEvent(
  callId: string, type: string, payload: unknown, result: unknown, ok: boolean, latencyMs?: number,
) {
  await admin.from("call_events").insert({ call_id: callId, type, payload, result, ok, latency_ms: latencyMs ?? null });
}

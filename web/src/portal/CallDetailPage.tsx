import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { api, supabase } from "../lib/api";
import { StatusBadge } from "./CallsPage";
import { fmtDateTime, fmtDuration, fmtOffset, fmtPhone, fmtTime, INTENT } from "./format";

type Call = {
  id: string; started_at: string; connected_at: string | null; ended_at: string | null; duration_s: number | null;
  status: string; end_reason: string | null; summary_bn: string | null; summary_en: string | null; model: string | null;
  channel: string; language: string; error_detail: string | null; finalized_at: string | null; patient_id: string | null;
};
type Extraction = Record<string, any> & { validation: Record<string, any> };
type TurnRow = { seq: number; speaker: string; text_bn: string; text_en: string | null; offset_ms: number; ts: string; interrupted: boolean };
type EventRow = { id: number; type: string; payload: any; result: any; ok: boolean; latency_ms: number | null; created_at: string };

const END_REASON: Record<string, string> = {
  caller_hangup: "caller hung up", agent_ended: "agent ended the call", timeout: "time limit reached",
  error: "connection error", abandoned: "tab closed mid-call",
};

function Check({ ok, label }: { ok: boolean | null | undefined; label?: string }) {
  if (ok === null || ok === undefined) return <span className="text-sm text-ink-soft">—</span>;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${ok ? "bg-ok/12 text-ok" : "bg-bad/12 text-bad"}`}>
      {ok ? "✓" : "✕"} {label ?? (ok ? "valid" : "invalid")}
    </span>
  );
}

function Source({ s }: { s?: string | null }) {
  if (!s) return null;
  const label = s === "tool" ? "captured live" : s === "appointment" ? "from booking" : s === "llm" ? "from transcript" : s;
  return <span className="ml-2 text-xs text-ink-soft">({label})</span>;
}

function Card({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl bg-white p-4 ring-1 ring-ink/5 md:p-6">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        <div className="ml-auto">{right}</div>
      </div>
      {children}
    </section>
  );
}

export default function CallDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [call, setCall] = useState<Call | null | undefined>(undefined);
  const [ex, setEx] = useState<Extraction | null>(null);
  const [turns, setTurns] = useState<TurnRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [appts, setAppts] = useState<any[]>([]);
  const [callbacks, setCallbacks] = useState<any[]>([]);
  const [doctors, setDoctors] = useState<Record<string, string>>({});
  const [services, setServices] = useState<Record<string, string>>({});
  const [view, setView] = useState<"both" | "bn" | "en">("both");
  const [rerun, setRerun] = useState<"idle" | "busy" | "done" | "error">("idle");

  const load = useCallback(async () => {
    if (!id) return;
    const [c, e, t, ev, a, cb, d, s] = await Promise.all([
      supabase.from("calls").select("id, started_at, connected_at, ended_at, duration_s, status, end_reason, summary_bn, summary_en, model, channel, language, error_detail, finalized_at, patient_id").eq("id", id).maybeSingle(),
      supabase.from("call_extractions").select("*").eq("call_id", id).maybeSingle(),
      supabase.from("transcript_turns").select("seq, speaker, text_bn, text_en, offset_ms, ts, interrupted").eq("call_id", id).order("seq"),
      supabase.from("call_events").select("*").eq("call_id", id).order("id"),
      supabase.from("appointments").select("id, slot_start, slot_end, status, ref_code, doctor_id, service_id, call_id, updated_by_call_id, reason").or(`call_id.eq.${id},updated_by_call_id.eq.${id}`),
      supabase.from("callbacks").select("*").eq("call_id", id),
      supabase.from("doctors").select("id, full_name_bn, full_name_en"),
      supabase.from("services").select("id, code, name_bn, name_en"),
    ]);
    setCall(c.data as Call | null);
    setEx(e.data as Extraction | null);
    setTurns((t.data ?? []) as TurnRow[]);
    setEvents((ev.data ?? []) as EventRow[]);
    setAppts(a.data ?? []);
    setCallbacks(cb.data ?? []);
    setDoctors(Object.fromEntries((d.data ?? []).map((x) => [x.id, `${x.full_name_bn} (${x.full_name_en})`])));
    setServices(Object.fromEntries((s.data ?? []).flatMap((x) => [[x.id, `${x.name_en} — ${x.name_bn}`], [x.code, `${x.name_en} — ${x.name_bn}`]])));
  }, [id]);

  useEffect(() => { void load(); }, [load]);
  // While a call is still being finalised, keep refreshing.
  useEffect(() => {
    if (!call || call.finalized_at) return;
    const t = window.setInterval(load, 4000);
    return () => window.clearInterval(t);
  }, [call, load]);

  async function doRerun() {
    if (!id) return;
    setRerun("busy");
    try { await api.refinalize(id); await load(); setRerun("done"); } catch { setRerun("error"); }
  }

  if (call === undefined) return <p className="text-ink-soft">Loading call…</p>;
  if (call === null) return <p>Call not found. <Link to="/portal" className="text-pond underline">Back to calls</Link></p>;

  const v = ex?.validation ?? {};
  const phoneV = v.phone ?? {};
  const fields: [string, ReactNode, ReactNode, ReactNode][] = ex ? [
    ["Patient name", <>{ex.patient_name_bn ?? "—"}{ex.patient_name_en && <span className="block text-sm text-ink-soft">{ex.patient_name_en}</span>}</>,
      <Source s={v.patient_name?.source} />, <Check ok={ex.patient_name_bn ? v.patient_name?.bangla_script ?? true : null} label={ex.patient_name_bn ? "Bangla script" : undefined} />],
    ["Phone", <span className="tabular-nums">{ex.phone_e164 ?? "—"}<span className="block text-sm text-ink-soft">{fmtPhone(ex.phone_e164)}{phoneV.operator && `, ${phoneV.operator}`}</span></span>,
      <span className="text-sm">heard: <span className="tabular-nums">{ex.phone_raw ?? "—"}</span><Source s={phoneV.source} /></span>,
      <Check ok={ex.phone_raw ? ex.phone_valid : null} label={ex.phone_valid ? "BD mobile, 11 digits" : phoneV.problem ?? undefined} />],
    ["Reason for visit", ex.reason_for_visit ?? "—", null, null],
    ["Service", ex.service_code ? services[ex.service_code] ?? ex.service_code : "—", null, <Check ok={ex.service_code ? v.service_code?.valid : null} />],
    ["Doctor", ex.doctor_id ? doctors[ex.doctor_id] ?? ex.doctor_id : "—", null, null],
    ["Preferred date & time",
      <span className="tabular-nums">{ex.preferred_date ?? "—"}{ex.preferred_time && `, ${String(ex.preferred_time).slice(0, 5)}`}</span>,
      ex.preferred_text_raw ? <span className="text-sm">said: “{ex.preferred_text_raw}”<Source s={v.preferred_date?.source} /></span> : <Source s={v.preferred_date?.source} />,
      ex.preferred_date ? <span className="flex flex-wrap gap-1"><Check ok={v.preferred_date?.clinic_open} label={v.preferred_date?.clinic_open ? "clinic open" : "clinic closed"} />
        {ex.preferred_time && <Check ok={v.preferred_time?.within_hours} label={v.preferred_time?.within_hours ? "within hours" : "outside hours"} />}</span> : null],
    ["Intent", ex.intent ? INTENT[ex.intent] ?? ex.intent : "—", null, null],
    ["Outcome", <StatusBadge status={ex.outcome ?? call.status} />, <span className="text-sm text-ink-soft">source: {v.outcome_source ?? "—"}</span>, null],
    ["Confirmed by caller", ex.confirmed_by_caller ? "Yes" : "No", null, null],
    ["Needs staff follow-up", ex.needs_human ? "Yes" : "No", null, null],
    ["Notes", ex.notes ?? "—", null, null],
  ] : [];

  return (
    <div className="space-y-5">
      <Link to="/portal" className="text-sm text-pond hover:underline">← All calls</Link>

      <div className="flex flex-wrap items-start gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl">{ex?.patient_name_bn ?? "Unknown caller"}</h1>
          <p className="mt-1 text-ink-soft">
            {fmtDateTime(call.started_at)} (Dhaka) · {fmtDuration(call.duration_s)} · {call.channel === "web" ? "Browser call" : "Phone"}{call.model === "seed-script" ? " (scripted demo)" : call.model ? ` · ${call.model}` : ""} · {END_REASON[call.end_reason ?? ""] ?? "in progress"}
          </p>
        </div>
        <div className="ml-auto flex items-center gap-3">
          <StatusBadge status={call.status} />
          <button onClick={doRerun} disabled={rerun === "busy"}
            className="rounded-full border border-ink/15 bg-white px-3.5 py-1.5 text-sm hover:bg-mist disabled:opacity-60"
            title="Run extraction and validation again from the stored transcript">
            {rerun === "busy" ? "Re-running…" : rerun === "done" ? "Updated" : rerun === "error" ? "Failed, retry" : "Re-run extraction"}
          </button>
        </div>
      </div>

      {!call.finalized_at && (
        <p className="rounded-xl bg-turmeric/15 px-4 py-3 text-warn">This call is still in progress or being processed. The page refreshes automatically.</p>
      )}
      {call.error_detail && <p className="rounded-xl bg-bad/10 px-4 py-3 text-sm text-bad">Error: {call.error_detail}</p>}

      {(call.summary_bn || call.summary_en) && (
        <Card title="Summary">
          {call.summary_bn && <p className="prose-bn text-lg">{call.summary_bn}</p>}
          {call.summary_en && <p className="mt-2 text-ink-soft">{call.summary_en}</p>}
        </Card>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.25fr_1fr]">
        <Card title="Extracted fields" right={ex?.extracted_by && <span className="text-xs text-ink-soft">validated · {ex.extracted_by}</span>}>
          {!ex ? <p className="text-ink-soft">No fields captured for this call.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-[15px]">
                <tbody>
                  {fields.map(([k, val, raw, chk]) => (
                    <tr key={k} className="border-b border-ink/5 align-top last:border-0">
                      <th className="w-24 py-2.5 pr-3 text-left text-sm font-medium text-ink-soft md:w-40 md:text-[15px]">{k}</th>
                      <td className="py-2.5 pr-3">{val}{raw && <div className="mt-0.5 text-ink-soft">{raw}</div>}</td>
                      <td className="py-2.5 text-right">{chk}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card title="Appointment">
            {appts.length === 0 ? <p className="text-ink-soft">No appointment created or changed by this call.</p> : appts.map((a) => (
              <div key={a.id} className="rounded-xl bg-paper p-4">
                <div className="flex items-center gap-2">
                  <StatusBadge status={a.status === "booked" ? "booked" : a.status} />
                  {a.ref_code && <span className="text-sm">Serial <b className="tabular-nums">{a.ref_code}</b></span>}
                </div>
                <p className="mt-2 text-lg font-semibold">{fmtDateTime(a.slot_start)}–{fmtTime(a.slot_end)}</p>
                <p className="text-ink-soft">{doctors[a.doctor_id]}</p>
                <p className="text-ink-soft">{services[a.service_id]}</p>
                {a.call_id !== call.id && <p className="mt-1 text-sm text-ink-soft">Originally booked on another call; changed on this one.</p>}
              </div>
            ))}
          </Card>
          <Card title="Staff follow-up">
            {callbacks.length === 0 ? <p className="text-ink-soft">None requested.</p> : callbacks.map((c) => (
              <div key={c.id} className="rounded-xl bg-shapla/8 p-4">
                <p className="text-sm"><b className={c.priority === "urgent" ? "text-bad" : ""}>{c.priority === "urgent" ? "Urgent" : "Normal"}</b> · {c.category.replace("_", " ")} · {c.status}</p>
                <p className="prose-bn mt-1">{c.reason}</p>
              </div>
            ))}
          </Card>
        </div>
      </div>

      <Card title={`Transcript (${turns.length} turns)`} right={
        <div className="flex rounded-full bg-mist p-0.5 text-sm" role="group" aria-label="Transcript language">
          {(["both", "bn", "en"] as const).map((k) => (
            <button key={k} onClick={() => setView(k)} aria-pressed={view === k}
              className={`rounded-full px-3 py-1 ${view === k ? "bg-ink text-paper" : "text-ink-soft"}`}>
              {k === "both" ? "Both" : k === "bn" ? "বাংলা" : "English"}
            </button>
          ))}
        </div>
      }>
        {turns.length === 0 ? <p className="text-ink-soft">No speech was captured.</p> : (
          <ol className="space-y-3">
            {turns.map((t) => (
              <li key={t.seq} className="grid grid-cols-[4.5rem_1fr] gap-3 md:grid-cols-[5.5rem_1fr]">
                <div className="pt-0.5 text-sm">
                  <span className={`font-semibold ${t.speaker === "agent" ? "text-pond" : t.speaker === "caller" ? "text-shapla" : "text-ink-soft"}`}>
                    {t.speaker === "agent" ? "Agent" : t.speaker === "caller" ? "Caller" : "System"}
                  </span>
                  <span className="block tabular-nums text-ink-soft" title={fmtDateTime(t.ts)}>{fmtOffset(t.offset_ms)}</span>
                </div>
                <div className={`rounded-xl px-4 py-2.5 ${t.speaker === "agent" ? "bg-paper" : "bg-shapla/6 ring-1 ring-shapla/15"}`}>
                  {view !== "en" && <p className="prose-bn">{t.text_bn}{t.interrupted && <span className="ml-1 text-xs text-ink-soft">(interrupted)</span>}</p>}
                  {view !== "bn" && <p className={view === "both" ? "mt-1 text-[15px] text-ink-soft" : ""}>{t.text_en ?? <span className="italic text-ink-soft">translation pending</span>}</p>}
                </div>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <Card title="What the agent did" right={<span className="text-xs text-ink-soft">call_events</span>}>
        {events.length === 0 ? <p className="text-ink-soft">No actions recorded.</p> : (
          <ol className="space-y-2">
            {events.map((e) => (
              <li key={e.id}>
                <details className="rounded-xl bg-paper px-4 py-2.5">
                  <summary className="flex cursor-pointer flex-wrap items-center gap-2 text-[15px]">
                    <span className={`h-2 w-2 rounded-full ${e.ok ? "bg-ok" : "bg-bad"}`} aria-hidden />
                    <span className="font-medium">{e.type}</span>
                    <span className="text-sm text-ink-soft">{fmtTime(e.created_at)}{e.latency_ms !== null && ` · ${e.latency_ms} ms`}</span>
                  </summary>
                  <div className="mt-2 grid gap-2 md:grid-cols-2">
                    <pre className="thin-scroll overflow-x-auto rounded-lg bg-white p-3 text-xs">{JSON.stringify(e.payload, null, 2)}</pre>
                    <pre className="thin-scroll overflow-x-auto rounded-lg bg-white p-3 text-xs">{JSON.stringify(e.result, null, 2)}</pre>
                  </div>
                </details>
              </li>
            ))}
          </ol>
        )}
      </Card>

      {ex && (
        <Card title="Stored record" right={<span className="text-xs text-ink-soft">public.call_extractions</span>}>
          <pre className="thin-scroll max-h-96 overflow-auto rounded-xl bg-ink p-4 text-xs text-paper">{JSON.stringify(ex, null, 2)}</pre>
        </Card>
      )}
    </div>
  );
}

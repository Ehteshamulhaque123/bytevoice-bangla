import { useEffect, useState } from "react";
import { supabase } from "../lib/api";

type Entity = { name: string; purpose: string; fields: string[]; x: number; y: number; tone: "core" | "ref" | "log" };

const ENTITIES: Entity[] = [
  { name: "clinics", purpose: "Tenant: one row per clinic/hospital", fields: ["id", "name_bn / name_en", "address, directions", "timezone, slot_minutes"], x: 20, y: 20, tone: "ref" },
  { name: "doctors", purpose: "Who can be booked", fields: ["id, clinic_id →", "full_name_bn / _en", "title_bn / _en"], x: 20, y: 200, tone: "ref" },
  { name: "doctor_schedules", purpose: "Weekly chamber hours", fields: ["doctor_id →", "weekday (0=Sun)", "start_time, end_time"], x: 20, y: 360, tone: "ref" },
  { name: "services", purpose: "What can be booked, fees", fields: ["code (scaling…)", "fee_from/to_bdt", "duration_min, prep_bn"], x: 20, y: 510, tone: "ref" },
  { name: "patients", purpose: "The person behind the calls", fields: ["id, clinic_id →", "full_name_bn / _en", "phone_e164 (unique/clinic)"], x: 300, y: 20, tone: "core" },
  { name: "calls", purpose: "One record per call", fields: ["id, clinic_id →, patient_id →", "started/connected/ended_at", "duration_s (generated)", "status, end_reason", "summary_bn / _en, model"], x: 300, y: 190, tone: "core" },
  { name: "appointments", purpose: "Bookings made", fields: ["patient_id →, doctor_id →", "service_id →, call_id →", "slot_start / slot_end", "status, ref_code", "UNIQUE(doctor, slot) active"], x: 300, y: 400, tone: "core" },
  { name: "transcript_turns", purpose: "Full transcript", fields: ["call_id →, seq", "speaker", "text_bn, text_en", "offset_ms, ts, interrupted"], x: 590, y: 20, tone: "core" },
  { name: "call_extractions", purpose: "Structured fields, 1:1 with call", fields: ["call_id (PK) →", "patient_name_bn / _en", "phone_raw → phone_e164", "reason, service_code", "preferred_date/time, outcome", "validation (jsonb)"], x: 590, y: 190, tone: "core" },
  { name: "callbacks", purpose: "Staff follow-ups", fields: ["call_id →, patient_id →", "reason, category", "priority, status"], x: 590, y: 420, tone: "core" },
  { name: "call_events", purpose: "Audit log of agent actions", fields: ["call_id →", "type (tool:…)", "payload, result, ok", "latency_ms"], x: 590, y: 560, tone: "log" },
];

const W = 250;
const boxH = (e: Entity) => 46 + e.fields.length * 19;
const box = (n: string) => ENTITIES.find((e) => e.name === n)!;

// [from, to, label] — "to" holds the foreign key
const LINKS: [string, string, string][] = [
  ["clinics", "patients", "1:n"], ["clinics", "doctors", "1:n"], ["doctors", "doctor_schedules", "1:n"],
  ["patients", "calls", "1:n"], ["patients", "appointments", "1:n"], ["calls", "transcript_turns", "1:n"],
  ["calls", "call_extractions", "1:1"], ["calls", "appointments", "1:n"], ["calls", "callbacks", "1:n"],
  ["calls", "call_events", "1:n"], ["doctors", "appointments", "1:n"], ["services", "appointments", "1:n"],
];

function ERD() {
  const anchor = (e: Entity, side: "l" | "r") => ({ x: side === "r" ? e.x + W : e.x, y: e.y + 26 });
  return (
    <svg viewBox="0 0 860 690" className="h-auto w-full min-w-[720px]" role="img" aria-label="Entity relationship diagram">
      {LINKS.map(([a, b, label]) => {
        const A = box(a), B = box(b);
        let p1, p2;
        if (A.x === B.x) { // same column: connect along the left edge
          p1 = { x: A.x, y: A.y + boxH(A) / 2 }; p2 = { x: B.x, y: B.y + 20 };
          const d = `M${p1.x},${p1.y} C${p1.x - 18},${p1.y} ${p2.x - 18},${p2.y} ${p2.x},${p2.y}`;
          return <path key={a + b} d={d} fill="none" stroke="#9fb5ad" strokeWidth="1.5" />;
        }
        p1 = anchor(A, A.x < B.x ? "r" : "l");
        p2 = { x: A.x < B.x ? B.x : B.x + W, y: B.y + 26 };
        const mx = (p1.x + p2.x) / 2;
        return (
          <g key={a + b}>
            <path d={`M${p1.x},${p1.y} C${mx},${p1.y} ${mx},${p2.y} ${p2.x},${p2.y}`} fill="none" stroke="#9fb5ad" strokeWidth="1.5" />
            <text x={mx} y={(p1.y + p2.y) / 2 - 4} fontSize="10" fill="#3d5a58" textAnchor="middle">{label}</text>
          </g>
        );
      })}
      {ENTITIES.map((e) => (
        <g key={e.name} transform={`translate(${e.x},${e.y})`}>
          <rect width={W} height={boxH(e)} rx="12" fill="#fff" stroke={e.tone === "core" ? "#1d6b63" : e.tone === "log" ? "#e9a93b" : "#c5d3cc"} strokeWidth={e.tone === "core" ? 2 : 1.5} />
          <rect width={W} height="40" rx="12" fill={e.tone === "core" ? "#1d6b63" : e.tone === "log" ? "#e9a93b" : "#d7e2db"} />
          <rect y="28" width={W} height="12" fill={e.tone === "core" ? "#1d6b63" : e.tone === "log" ? "#e9a93b" : "#d7e2db"} />
          <text x="14" y="18" fontSize="14" fontWeight="700" fill={e.tone === "ref" ? "#12302f" : "#fff"}>{e.name}</text>
          <text x="14" y="33" fontSize="10.5" fill={e.tone === "ref" ? "#3d5a58" : "#e8f3ef"}>{e.purpose}</text>
          {e.fields.map((f, i) => <text key={f} x="14" y={60 + i * 19} fontSize="12" fill="#12302f">{f}</text>)}
        </g>
      ))}
    </svg>
  );
}

const FLOW = [
  { t: "Browser asks for a call", d: "POST /api/session creates a calls row (status in_progress) and a per-call secret, builds the system prompt from the clinic tables, and returns a single-use Gemini token with prompt, tools and model locked server-side." },
  { t: "Live audio", d: "The browser streams 16 kHz PCM to Gemini Live over WebSocket and plays the 24 kHz reply. No audio is stored." },
  { t: "Tools write as the call happens", d: "Each tool call (check_availability, save_caller_details, book_appointment, request_callback…) goes to /api/tool, which validates input, writes patients / appointments / callbacks / call_extractions, and logs to call_events." },
  { t: "Transcript streams in", d: "Caller and agent transcript turns are upserted every 4 s into transcript_turns (keyed by call_id + seq, so retries are idempotent)." },
  { t: "Finalise on hang-up", d: "/api/finalize reads the transcript and tool log, asks Gemini for a structured read + English translation, then validates and merges it. Facts from tools beat the LLM; the outcome comes from the appointments table when there is one." },
  { t: "Portal reads", d: "Staff sign in with Supabase Auth; Row Level Security limits every select to rows of their own clinic. Writes from the portal are limited to closing callbacks." },
];

const VALIDATION = [
  ["Bangla digits", "০-৯ and Arabic-Indic digits are converted to 0-9; spoken words (শূন্য, ডাবল সাত, “ওয়ান”, “double five”) are expanded."],
  ["Phone format", "Strip +880 / 880 / 00880, repair a missing leading 0, then require ^01[3-9]\\d{8}$ and store E.164 (+8801…). Postgres CHECK constraints enforce the same pattern."],
  ["Read-back", "The agent reads the number back digit by digit in groups before saving; book_appointment refuses an invalid number and returns a polite Bangla re-ask."],
  ["Dates & times", "The prompt contains a 15-day calendar so “আগামী রবিবার” resolves to an exact date; tools reject impossible or past dates and re-check the slot is free before inserting."],
  ["Double booking", "A partial unique index on (doctor_id, slot_start) for active bookings makes a double booking impossible even under concurrent calls."],
  ["Confirmation", "book / reschedule / cancel require confirmed_by_caller = true; otherwise the tool refuses."],
  ["Names", "Stored in Bangla script as said, plus a romanised spelling for search; honorifics like “আমার নাম … বলছি” are stripped."],
];

export default function DataModelPage() {
  const [counts, setCounts] = useState<Record<string, number>>({});
  useEffect(() => {
    const tables = ["patients", "calls", "transcript_turns", "call_extractions", "appointments", "callbacks", "call_events"];
    Promise.all(tables.map((t) => supabase.from(t).select("*", { count: "exact", head: true }).then(({ count }) => [t, count ?? 0] as const)))
      .then((r) => setCounts(Object.fromEntries(r)));
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="display text-3xl md:text-4xl">How call data is organised and stored</h1>
        <p className="prose-bn mt-2 max-w-[75ch] text-ink-soft">
          Postgres on Supabase, region ap-southeast-1 (Singapore, the closest region to Dhaka). Every table has Row Level Security on.
          Call audio is not recorded in this demo by design; the transcript is the record. All times are stored in UTC and shown in Asia/Dhaka.
        </p>
      </div>

      <section className="rounded-2xl bg-white p-4 ring-1 ring-ink/5 md:p-6">
        <h2 className="text-lg font-semibold">Schema</h2>
        <p className="mt-1 text-sm text-ink-soft">Teal: call data. Grey: clinic reference data that also feeds the agent's prompt. Amber: audit log.</p>
        <div className="mt-4 overflow-x-auto"><ERD /></div>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-ink/5 md:p-6">
        <h2 className="text-lg font-semibold">Rows stored right now</h2>
        <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {Object.entries(counts).map(([k, v]) => (
            <div key={k} className="rounded-xl bg-paper px-3 py-2">
              <dt className="text-xs text-ink-soft">{k}</dt>
              <dd className="text-xl font-semibold tabular-nums">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-ink/5 md:p-6">
        <h2 className="text-lg font-semibold">From live call to storage</h2>
        <ol className="mt-4 space-y-4">
          {FLOW.map((f, i) => (
            <li key={f.t} className="grid grid-cols-[2.25rem_1fr] gap-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-ink text-sm font-semibold text-paper">{i + 1}</span>
              <div><p className="font-semibold">{f.t}</p><p className="text-ink-soft">{f.d}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section className="rounded-2xl bg-white p-5 ring-1 ring-ink/5 md:p-6">
        <h2 className="text-lg font-semibold">How extracted fields are validated</h2>
        <dl className="mt-3 divide-y divide-ink/5">
          {VALIDATION.map(([k, v]) => (
            <div key={k} className="grid gap-1 py-3 md:grid-cols-[12rem_1fr] md:gap-6">
              <dt className="font-medium">{k}</dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

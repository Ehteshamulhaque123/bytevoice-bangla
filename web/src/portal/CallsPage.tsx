import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../lib/api";
import { fmtDate, fmtDuration, fmtPhone, fmtTime, INTENT, STATUS } from "./format";

export type CallOverview = {
  id: string; started_at: string; ended_at: string | null; duration_s: number | null; status: string;
  caller_name_bn: string | null; caller_name_en: string | null; caller_phone: string | null;
  intent: string | null; reason_for_visit: string | null; needs_human: boolean | null; turn_count: number;
  summary_en: string | null; finalized_at: string | null; model: string | null;
};

const RANGES = { today: "Today", "7d": "Last 7 days", "30d": "Last 30 days", all: "All time" } as const;
type Range = keyof typeof RANGES;

function rangeStart(r: Range): string | null {
  if (r === "all") return null;
  if (r === "today") {
    const d = new Date(Date.now() + 6 * 3600_000); // Dhaka midnight
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - 6 * 3600_000).toISOString();
  }
  return new Date(Date.now() - (r === "7d" ? 7 : 30) * 86400_000).toISOString();
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-mist" };
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${s.cls}`}>{s.label}</span>;
}

export default function CallsPage() {
  const [rows, setRows] = useState<CallOverview[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<string>("all");
  const [range, setRange] = useState<Range>("all");
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let alive = true;
    async function load() {
      let query = supabase.from("call_overview").select("*").order("started_at", { ascending: false }).limit(500);
      const from = rangeStart(range);
      if (from) query = query.gte("started_at", from);
      const { data, error } = await query;
      if (!alive) return;
      if (error) setError(error.message);
      else { setRows(data as CallOverview[]); setError(null); setUpdatedAt(new Date()); }
    }
    void load();
    const id = window.setInterval(load, 8000); // new calls appear within seconds of hang-up
    return () => { alive = false; window.clearInterval(id); };
  }, [range]);

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (rows ?? []).forEach((r) => { c[r.status] = (c[r.status] ?? 0) + 1; });
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase().replace(/[-\s]/g, "");
    return (rows ?? []).filter((r) => {
      if (status !== "all" && r.status !== status) return false;
      if (!needle) return true;
      const hay = [r.caller_name_bn, r.caller_name_en, r.caller_phone, r.reason_for_visit, r.summary_en]
        .filter(Boolean).join(" ").toLowerCase().replace(/[-\s]/g, "");
      return hay.includes(needle);
    });
  }, [rows, q, status]);

  const total = rows?.length ?? 0;
  const booked = (counts.booked ?? 0) + (counts.rescheduled ?? 0);
  const followUp = counts.follow_up ?? 0;
  const avgDur = rows?.length ? Math.round(rows.reduce((s, r) => s + (r.duration_s ?? 0), 0) / rows.length) : 0;

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <div>
          <h1 className="display text-3xl md:text-4xl">Calls</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Every call handled by Sumi, newest first. Refreshes automatically
            {updatedAt && <> (updated {updatedAt.toLocaleTimeString("en-GB", { timeZone: "Asia/Dhaka" })})</>}.
          </p>
        </div>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Calls", total],
          ["Booked or moved", booked],
          ["Need a callback", followUp],
          ["Average length", fmtDuration(avgDur)],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-2xl bg-white px-4 py-3 ring-1 ring-ink/5">
            <dt className="text-sm text-ink-soft">{k}</dt>
            <dd className="mt-0.5 text-2xl font-semibold tabular-nums">{v}</dd>
          </div>
        ))}
      </dl>

      <div className="mt-6 flex flex-wrap items-center gap-3">
        <input
          type="search" value={q} onChange={(e) => setQ(e.target.value)}
          placeholder="Search name (বাংলা or English), phone, reason…"
          className="min-w-[16rem] flex-1 rounded-full border border-ink/15 bg-white px-4 py-2.5 text-[15px] outline-none focus:border-pond"
          aria-label="Search calls"
        />
        <select value={range} onChange={(e) => setRange(e.target.value as Range)} aria-label="Date range"
          className="rounded-full border border-ink/15 bg-white px-4 py-2.5 text-[15px]">
          {Object.entries(RANGES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5" role="group" aria-label="Filter by status">
        {["all", "booked", "rescheduled", "cancelled", "enquiry", "follow_up", "incomplete", "failed", "in_progress"].map((s) => (
          <button key={s} onClick={() => setStatus(s)} aria-pressed={status === s}
            className={`rounded-full px-3 py-1 text-sm ${status === s ? "bg-ink text-paper" : "bg-white text-ink-soft ring-1 ring-ink/10 hover:bg-mist"}`}>
            {s === "all" ? "All" : STATUS[s]?.label ?? s}
            <span className="ml-1.5 tabular-nums opacity-60">{s === "all" ? total : counts[s] ?? 0}</span>
          </button>
        ))}
      </div>

      {error && <p className="mt-6 rounded-xl bg-bad/10 p-4 text-bad">Couldn't load calls: {error}</p>}

      <div className="mt-5 overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/5">
        <table className="w-full min-w-[760px] text-left text-[15px]">
          <thead className="border-b border-ink/10 text-sm text-ink-soft">
            <tr>
              <th className="px-4 py-3 font-medium">Date</th>
              <th className="px-4 py-3 font-medium">Time</th>
              <th className="px-4 py-3 font-medium">Caller</th>
              <th className="px-4 py-3 font-medium">Phone</th>
              <th className="px-4 py-3 font-medium">Reason</th>
              <th className="px-4 py-3 font-medium">Duration</th>
              <th className="px-4 py-3 font-medium">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows === null && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-soft">Loading calls…</td></tr>
            )}
            {rows && filtered.length === 0 && (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-ink-soft">
                {total === 0 ? <>No calls yet. <Link to="/" className="text-pond underline">Make a test call</Link> from the landing page.</> : "No calls match these filters."}
              </td></tr>
            )}
            {filtered.map((r) => (
              <tr key={r.id} onClick={() => navigate(`/portal/calls/${r.id}`)}
                className="cursor-pointer border-b border-ink/5 last:border-0 hover:bg-paper">
                <td className="px-4 py-3 whitespace-nowrap">{fmtDate(r.started_at)}</td>
                <td className="px-4 py-3 tabular-nums">{fmtTime(r.started_at)}</td>
                <td className="px-4 py-3">
                  <Link to={`/portal/calls/${r.id}`} className="font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
                    {r.caller_name_bn ?? <span className="text-ink-soft">Unknown caller</span>}
                  </Link>
                  {r.caller_name_en && <span className="block text-sm text-ink-soft">{r.caller_name_en}</span>}
                  {r.model && r.model !== "seed-script" && r.model !== "api-pipeline-test" && (
                    <span className="mt-0.5 inline-block rounded bg-pond/10 px-1.5 text-[11px] font-semibold text-pond">live call</span>
                  )}
                  {r.model === "seed-script" && <span className="mt-0.5 inline-block rounded bg-mist px-1.5 text-[11px] text-ink-soft">scripted demo</span>}
                </td>
                <td className="px-4 py-3 whitespace-nowrap tabular-nums">{fmtPhone(r.caller_phone)}</td>
                <td className="max-w-[16rem] px-4 py-3">
                  <span className="line-clamp-2">{r.reason_for_visit ?? (r.intent ? INTENT[r.intent] : "—")}</span>
                </td>
                <td className="px-4 py-3 tabular-nums">{fmtDuration(r.duration_s)}</td>
                <td className="px-4 py-3"><StatusBadge status={r.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

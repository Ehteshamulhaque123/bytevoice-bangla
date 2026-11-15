import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/api";
import { StatusBadge } from "./CallsPage";
import { fmtDateTime, fmtPhone, fmtTime, fmtWeekday } from "./format";

export function AppointmentsPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [scope, setScope] = useState<"upcoming" | "all">("upcoming");

  useEffect(() => {
    let q = supabase.from("appointments")
      .select("id, slot_start, slot_end, status, ref_code, reason, call_id, patients(full_name_bn, full_name_en, phone_e164), doctors(full_name_en), services(name_en, name_bn)")
      .order("slot_start", { ascending: scope === "upcoming" }).limit(300);
    if (scope === "upcoming") q = q.gte("slot_start", new Date().toISOString()).in("status", ["booked", "rescheduled"]);
    q.then(({ data }) => setRows(data ?? []));
  }, [scope]);

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="display text-3xl md:text-4xl">Appointments</h1>
        <div className="ml-auto flex rounded-full bg-mist p-0.5 text-sm">
          {(["upcoming", "all"] as const).map((s) => (
            <button key={s} onClick={() => setScope(s)} aria-pressed={scope === s}
              className={`rounded-full px-3.5 py-1.5 ${scope === s ? "bg-ink text-paper" : "text-ink-soft"}`}>{s === "upcoming" ? "Upcoming" : "All"}</button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Bookings made or changed by Sumi. One active booking per doctor per slot is enforced by the database.</p>
      <div className="mt-5 overflow-x-auto rounded-2xl bg-white ring-1 ring-ink/5">
        <table className="w-full min-w-[760px] text-left text-[15px]">
          <thead className="border-b border-ink/10 text-sm text-ink-soft">
            <tr>{["When", "Patient", "Phone", "Doctor", "Service", "Serial", "Status", ""].map((h) => <th key={h} className="px-4 py-3 font-medium">{h}</th>)}</tr>
          </thead>
          <tbody>
            {rows === null && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-soft">Loading…</td></tr>}
            {rows?.length === 0 && <tr><td colSpan={8} className="px-4 py-10 text-center text-ink-soft">No appointments here yet.</td></tr>}
            {rows?.map((a) => (
              <tr key={a.id} className="border-b border-ink/5 last:border-0">
                <td className="px-4 py-3 whitespace-nowrap">{fmtWeekday(a.slot_start)}, {fmtDateTime(a.slot_start)}–{fmtTime(a.slot_end)}</td>
                <td className="px-4 py-3">{a.patients?.full_name_bn}<span className="block text-sm text-ink-soft">{a.patients?.full_name_en}</span></td>
                <td className="px-4 py-3 tabular-nums whitespace-nowrap">{fmtPhone(a.patients?.phone_e164)}</td>
                <td className="px-4 py-3">{a.doctors?.full_name_en}</td>
                <td className="px-4 py-3">{a.services?.name_en}</td>
                <td className="px-4 py-3 tabular-nums">{a.ref_code ?? "—"}</td>
                <td className="px-4 py-3"><StatusBadge status={a.status} /></td>
                <td className="px-4 py-3">{a.call_id && <Link className="text-sm text-pond hover:underline" to={`/portal/calls/${a.call_id}`}>Call</Link>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function CallbacksPage() {
  const [rows, setRows] = useState<any[] | null>(null);
  const [show, setShow] = useState<"open" | "done">("open");
  const load = () => supabase.from("callbacks")
    .select("id, created_at, reason, category, priority, status, phone_e164, call_id, patients(full_name_bn, phone_e164)")
    .eq("status", show).order("priority", { ascending: false }).order("created_at", { ascending: false })
    .then(({ data }) => setRows(data ?? []));
  useEffect(() => { void load(); }, [show]); // eslint-disable-line react-hooks/exhaustive-deps

  async function toggle(id: string, done: boolean) {
    await supabase.from("callbacks").update({ status: done ? "done" : "open", resolved_at: done ? new Date().toISOString() : null }).eq("id", id);
    void load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-end gap-4">
        <h1 className="display text-3xl md:text-4xl">Callbacks</h1>
        <div className="ml-auto flex rounded-full bg-mist p-0.5 text-sm">
          {(["open", "done"] as const).map((s) => (
            <button key={s} onClick={() => setShow(s)} aria-pressed={show === s}
              className={`rounded-full px-3.5 py-1.5 ${show === s ? "bg-ink text-paper" : "text-ink-soft"}`}>{s === "open" ? "To do" : "Done"}</button>
          ))}
        </div>
      </div>
      <p className="mt-1 text-sm text-ink-soft">Requests Sumi couldn't or shouldn't handle: medical questions, complaints, unknown information, emergencies.</p>
      <ul className="mt-5 space-y-3">
        {rows === null && <li className="text-ink-soft">Loading…</li>}
        {rows?.length === 0 && <li className="rounded-2xl bg-white p-6 text-ink-soft ring-1 ring-ink/5">{show === "open" ? "Nothing waiting. Nice." : "No completed callbacks yet."}</li>}
        {rows?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-start gap-4 rounded-2xl bg-white p-5 ring-1 ring-ink/5">
            <div className="min-w-0 flex-1">
              <p className="text-sm">
                <b className={c.priority === "urgent" ? "text-bad" : "text-ink"}>{c.priority === "urgent" ? "Urgent" : "Normal"}</b>
                <span className="text-ink-soft"> · {c.category.replace("_", " ")} · {fmtDateTime(c.created_at)}</span>
              </p>
              <p className="prose-bn mt-1 text-lg">{c.reason}</p>
              <p className="mt-1 text-sm text-ink-soft">
                {c.patients?.full_name_bn ?? "Unknown caller"}, {fmtPhone(c.phone_e164 ?? c.patients?.phone_e164)}
                {c.call_id && <> · <Link to={`/portal/calls/${c.call_id}`} className="text-pond hover:underline">open call</Link></>}
              </p>
            </div>
            <button onClick={() => toggle(c.id, show === "open")} className="rounded-full border border-ink/15 px-4 py-2 text-sm hover:bg-mist">
              {show === "open" ? "Mark done" : "Reopen"}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// Display helpers for the portal. Everything is shown in Asia/Dhaka time.

const TZ = "Asia/Dhaka";

export const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, day: "numeric", month: "short", year: "numeric" });
export const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
export const fmtDateTime = (iso: string) => `${fmtDate(iso)}, ${fmtTime(iso)}`;
export const fmtWeekday = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { timeZone: TZ, weekday: "short" });

export function fmtDuration(s: number | null | undefined) {
  if (s === null || s === undefined) return "—";
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const fmtOffset = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

/** "+8801712345678" → "01712-345678" (how Bangladeshis write mobile numbers). */
export function fmtPhone(e164: string | null | undefined) {
  if (!e164) return "—";
  const n = e164.replace(/^\+88/, "");
  return n.length === 11 ? `${n.slice(0, 5)}-${n.slice(5)}` : e164;
}

export const STATUS: Record<string, { label: string; cls: string }> = {
  in_progress: { label: "In progress", cls: "bg-turmeric/15 text-warn" },
  booked: { label: "Booked", cls: "bg-ok/12 text-ok" },
  rescheduled: { label: "Rescheduled", cls: "bg-pond/12 text-pond" },
  cancelled: { label: "Cancelled", cls: "bg-ink/10 text-ink-soft" },
  enquiry: { label: "Enquiry", cls: "bg-mist text-ink" },
  follow_up: { label: "Follow-up needed", cls: "bg-shapla/12 text-shapla" },
  incomplete: { label: "Incomplete", cls: "bg-warn/12 text-warn" },
  failed: { label: "Failed", cls: "bg-bad/12 text-bad" },
};

export const INTENT: Record<string, string> = {
  book: "Book", reschedule: "Reschedule", cancel: "Cancel", enquiry: "Enquiry", callback: "Callback", other: "Other",
};

// After a call ends: combine (a) what the tools actually did, (b) an LLM read of the transcript,
// validate every field, and write one clean structured record. Tool facts always win over the LLM.

import { admin, CallRow, loadClinic, logEvent } from "./db.ts";
import { Extraction, extractFromTranscript } from "./gemini.ts";
import { cleanName, dhakaParts, normalizeBdPhone, normalizeDate, normalizeTime, weekdayOf } from "./bangla.ts";
import { env } from "./env.ts";

type Status = "booked" | "rescheduled" | "cancelled" | "enquiry" | "follow_up" | "incomplete" | "failed";

export async function finalizeCall(call: CallRow, endReason: string | null, errorDetail: string | null) {
  const ctx = await loadClinic(call.clinic_id);
  const endedAt = call.ended_at ?? new Date().toISOString();
  await admin.from("calls").update({
    ended_at: endedAt,
    end_reason: call.ended_at ? undefined : (endReason ?? "caller_hangup"),
    error_detail: errorDetail ?? undefined,
  }).eq("id", call.id);

  const [{ data: turns }, { data: events }, { data: existing }, { data: created }, { data: updated }, { data: callbacks }] =
    await Promise.all([
      admin.from("transcript_turns").select("seq, speaker, text_bn, ts").eq("call_id", call.id).order("seq"),
      admin.from("call_events").select("type, ok, payload, result").eq("call_id", call.id).like("type", "tool:%").order("id"),
      admin.from("call_extractions").select("*").eq("call_id", call.id).maybeSingle(),
      admin.from("appointments").select("id, status, slot_start, doctor_id, service_id").eq("call_id", call.id),
      admin.from("appointments").select("id, status, slot_start, doctor_id").eq("updated_by_call_id", call.id).neq("call_id", call.id),
      admin.from("callbacks").select("id").eq("call_id", call.id),
    ]);

  const callerTurns = (turns ?? []).filter((t) => t.speaker === "caller").length;

  // ── 1. LLM extraction (best effort; the record is still written if it fails) ──
  let llm: Extraction | null = null;
  let llmError: string | null = null;
  if ((turns ?? []).length > 0 && env.geminiApiKey) {
    try {
      llm = await extractFromTranscript({
        transcript: (turns ?? []).map((t) => ({ seq: t.seq, speaker: t.speaker, text: t.text_bn, at: t.ts })),
        toolEvents: (events ?? []).map((e) => ({ type: e.type, ok: e.ok, payload: e.payload, result: e.result })),
        serviceCodes: ctx.services.map((s) => s.code),
        todayIso: dhakaParts(new Date(call.started_at)).isoDate,
      });
    } catch (e) {
      llmError = String(e).slice(0, 300);
      console.error("extraction failed", e);
    }
  }

  // ── 2. Outcome: ground truth first ──
  const booked = (created ?? []).find((a) => a.status === "booked" || a.status === "rescheduled");
  const rescheduled = (updated ?? []).find((a) => a.status === "rescheduled");
  const cancelled = (updated ?? []).find((a) => a.status === "cancelled") ?? (created ?? []).find((a) => a.status === "cancelled");
  let status: Status;
  if (booked) status = "booked";
  else if (rescheduled) status = "rescheduled";
  else if (cancelled) status = "cancelled";
  else if ((callbacks ?? []).length || existing?.needs_human || llm?.needs_human) status = "follow_up";
  else if (!call.connected_at || (errorDetail && callerTurns === 0)) status = "failed";
  else if (callerTurns === 0) status = "incomplete";
  else if (llm && ["enquiry", "incomplete", "follow_up"].includes(llm.outcome)) status = llm.outcome as Status;
  else status = "incomplete";

  // ── 3. Merge fields: tool-captured values (existing row) override LLM values ──
  const pick = <T>(toolVal: T | null | undefined, llmVal: T | null | undefined) =>
    toolVal !== null && toolVal !== undefined && toolVal !== "" ? { v: toolVal, src: "tool" } : { v: llmVal ?? null, src: llmVal ? "llm" : null };

  const name = pick(existing?.patient_name_bn, cleanName(llm?.patient_name_bn));
  const nameEn = pick(existing?.patient_name_en, cleanName(llm?.patient_name_en));
  const phoneRaw = pick(existing?.phone_raw, llm?.phone_raw);
  const phone = normalizeBdPhone(phoneRaw.v as string | null);
  const reason = pick(existing?.reason_for_visit, llm?.reason_for_visit);
  const serviceCode = pick(existing?.service_code, llm?.service_code && ctx.services.some((s) => s.code === llm!.service_code) ? llm.service_code : null);

  const apptForDate = booked ?? rescheduled;
  let prefDate = pick(existing?.preferred_date, normalizeDate(llm?.preferred_date));
  let prefTime = pick(existing?.preferred_time?.slice(0, 5), normalizeTime(llm?.preferred_time));
  if (apptForDate) {
    const p = dhakaParts(new Date(apptForDate.slot_start));
    prefDate = { v: p.isoDate, src: "appointment" };
    prefTime = { v: p.hhmm, src: "appointment" };
  }

  // ── 4. Validation report (shown in the portal) ──
  const d = prefDate.v as string | null;
  const t = prefTime.v as string | null;
  const dow = d ? weekdayOf(d) : null;
  const openThatDay = dow !== null ? ctx.schedules.filter((s) => s.weekday === dow) : [];
  const validation = {
    patient_name: { present: !!name.v, bangla_script: !!name.v && /[ঀ-৿]/.test(String(name.v)), source: name.src },
    phone: {
      present: !!phoneRaw.v, valid: phone.valid, problem: phone.problem, normalized: phone.e164,
      operator: phone.operator, digits_heard: phone.digits, source: phoneRaw.src,
    },
    preferred_date: d ? { valid: true, clinic_open: openThatDay.length > 0, source: prefDate.src } : { valid: false, present: false },
    preferred_time: t ? {
      valid: true, source: prefTime.src,
      within_hours: openThatDay.some((s) => t >= s.start_time.slice(0, 5) && t < s.end_time.slice(0, 5)),
    } : { valid: false, present: false },
    service_code: { valid: !serviceCode.v || ctx.services.some((s) => s.code === serviceCode.v), source: serviceCode.src },
    outcome_source: booked || rescheduled || cancelled ? "appointments_table" : (callbacks?.length ? "callbacks_table" : (llm ? "llm" : "rules")),
    llm_error: llmError,
  };

  const intent = existing?.intent ?? llm?.intent ??
    (status === "booked" ? "book" : status === "rescheduled" ? "reschedule" : status === "cancelled" ? "cancel" : status === "follow_up" ? "callback" : null);

  const extraction = {
    call_id: call.id,
    intent,
    patient_name_bn: name.v,
    patient_name_en: nameEn.v,
    phone_raw: phoneRaw.v,
    phone_e164: phone.e164,
    phone_valid: phoneRaw.v ? phone.valid : null,
    reason_for_visit: reason.v,
    service_code: serviceCode.v,
    doctor_id: existing?.doctor_id ?? apptForDate?.doctor_id ?? null,
    preferred_text_raw: existing?.preferred_text_raw ?? llm?.preferred_text_raw ?? null,
    preferred_date: d,
    preferred_time: t,
    outcome: status,
    needs_human: status === "follow_up" || !!existing?.needs_human,
    confirmed_by_caller: !!existing?.confirmed_by_caller || !!llm?.caller_confirmed_details,
    notes: existing?.notes ?? llm?.notes ?? null,
    validation,
    extracted_by: llm ? env.textModel : "rules",
  };
  const { error: exErr } = await admin.from("call_extractions").upsert(extraction, { onConflict: "call_id" });
  if (exErr) throw exErr;

  // English gloss for each transcript line.
  if (llm?.translations?.length) {
    await Promise.all(llm.translations.map((tr) =>
      admin.from("transcript_turns").update({ text_en: tr.text_en }).eq("call_id", call.id).eq("seq", tr.seq)
    ));
  }

  // Link patient if we have a valid phone + name but the tools never created one (e.g. enquiry calls).
  let patientId = call.patient_id;
  if (!patientId && phone.valid && name.v) {
    const { data: p } = await admin.from("patients").upsert(
      { clinic_id: call.clinic_id, full_name_bn: name.v, full_name_en: nameEn.v, phone_e164: phone.e164 },
      { onConflict: "clinic_id,phone_e164" },
    ).select("id").single();
    patientId = p?.id ?? null;
  }

  await admin.from("calls").update({
    status, patient_id: patientId,
    summary_bn: llm?.summary_bn ?? null, summary_en: llm?.summary_en ?? null,
    finalized_at: new Date().toISOString(),
  }).eq("id", call.id);

  await logEvent(call.id, "finalize", { endReason }, { status, llm: !!llm, llmError }, !llmError);
  return { status, extraction };
}

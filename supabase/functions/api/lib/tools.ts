// Tools the live agent can call. Declarations are sent to Gemini; handlers run here,
// server-side, with validation. The model never writes to the database directly.

import { admin, ClinicContext, logEvent } from "./db.ts";
import {
  addDays, cleanName, dhakaParts, dhakaToUtc, normalizeBdPhone, normalizeDate, normalizeTime,
  PART_OF_DAY_WINDOWS, phoneReadback, spokenDateBn, spokenTimeBn, toBnDigits, weekdayOf,
} from "./bangla.ts";

const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: "STRING", description, ...extra });
const B = (description: string) => ({ type: "BOOLEAN", description });

export function toolDeclarations(ctx: ClinicContext) {
  const serviceCodes = ctx.services.map((s) => s.code);
  return [{
    functionDeclarations: [
      {
        name: "check_availability",
        description: "Find free appointment slots on a date. Call before offering any time to the caller.",
        parameters: {
          type: "OBJECT",
          properties: {
            date: S("Local date YYYY-MM-DD, resolved from the CALENDAR."),
            part_of_day: S("Preferred part of day.", { enum: ["morning", "noon", "afternoon", "evening", "night", "any"] }),
            preferred_time: S("Preferred local time HH:MM (24h), if the caller named one."),
            doctor_id: S("doctor_id if the caller asked for a specific doctor."),
            service_code: S("Service code.", { enum: serviceCodes }),
          },
          required: ["date"],
        },
      },
      {
        name: "save_caller_details",
        description: "Save the caller's confirmed name and phone (and reason) as soon as they are confirmed, even before booking.",
        parameters: {
          type: "OBJECT",
          properties: {
            patient_name_bn: S("Full name in Bangla script, as the caller said it."),
            patient_name_en: S("Same name in sensible English spelling."),
            phone: S("Mobile number exactly as confirmed, digits only (Bangla or English digits)."),
            reason_for_visit: S("Short reason in the caller's words, e.g. 'দাঁতে ব্যথা'."),
          },
          required: ["patient_name_bn"],
        },
      },
      {
        name: "book_appointment",
        description: "Book a slot returned by check_availability. Only after reading back all details and getting a clear yes.",
        parameters: {
          type: "OBJECT",
          properties: {
            patient_name_bn: S("Full name in Bangla script."),
            patient_name_en: S("Name in English spelling."),
            phone: S("Confirmed 11-digit mobile number."),
            service_code: S("Service code.", { enum: serviceCodes }),
            reason_for_visit: S("Short reason in the caller's words."),
            doctor_id: S("doctor_id from check_availability."),
            date: S("YYYY-MM-DD"),
            time: S("HH:MM 24h, exactly as returned by check_availability."),
            confirmed_by_caller: B("True only if the caller explicitly said yes to the read-back summary."),
          },
          required: ["patient_name_bn", "phone", "service_code", "doctor_id", "date", "time", "confirmed_by_caller"],
        },
      },
      {
        name: "find_appointments",
        description: "Look up the caller's upcoming appointments by mobile number (for reschedule/cancel/confirmation).",
        parameters: { type: "OBJECT", properties: { phone: S("Mobile number.") }, required: ["phone"] },
      },
      {
        name: "reschedule_appointment",
        description: "Move an existing appointment to a new free slot, after explicit confirmation.",
        parameters: {
          type: "OBJECT",
          properties: {
            appointment_id: S("id from find_appointments."),
            date: S("New date YYYY-MM-DD."),
            time: S("New time HH:MM from check_availability."),
            doctor_id: S("doctor_id from check_availability."),
            confirmed_by_caller: B("True only after an explicit yes."),
          },
          required: ["appointment_id", "date", "time", "doctor_id", "confirmed_by_caller"],
        },
      },
      {
        name: "cancel_appointment",
        description: "Cancel an existing appointment, after explicit confirmation.",
        parameters: {
          type: "OBJECT",
          properties: {
            appointment_id: S("id from find_appointments."),
            reason: S("Why the caller is cancelling, if given."),
            confirmed_by_caller: B("True only after an explicit yes."),
          },
          required: ["appointment_id", "confirmed_by_caller"],
        },
      },
      {
        name: "request_callback",
        description: "Create a follow-up task for clinic staff (medical questions, human requested, complaints, unknown info, emergencies).",
        parameters: {
          type: "OBJECT",
          properties: {
            reason: S("What staff need to follow up on, one sentence in Bangla."),
            category: S("Category.", { enum: ["medical_question", "billing", "complaint", "emergency", "other"] }),
            priority: S("Priority.", { enum: ["normal", "urgent"] }),
            phone: S("Callback number if known."),
            patient_name_bn: S("Caller name if known."),
          },
          required: ["reason", "category"],
        },
      },
      {
        name: "end_call",
        description: "Hang up after you have said goodbye.",
        parameters: { type: "OBJECT", properties: { reason: S("Why the call is ending.") } },
      },
    ],
  }];
}

type Args = Record<string, unknown>;
type ToolResult = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);


function phoneProblem(problem: string | null, heard: string) {
  const say = problem === "too_long"
    ? "দুঃখিত, নম্বরে একটা ডিজিট বেশি চলে এসেছে মনে হচ্ছে। নম্বরটা আরেকবার ধীরে ধীরে বলবেন?"
    : problem === "too_short"
    ? "নম্বরটা মনে হয় পুরো আসেনি — ০১ দিয়ে শুরু ১১ ডিজিটের নম্বরটা আরেকবার বলবেন?"
    : "এটা মনে হয় বাংলাদেশের মোবাইল নম্বর না — ০১ দিয়ে শুরু ১১ ডিজিটের নম্বরটা আরেকবার বলবেন?";
  return {
    ok: false, error: "invalid_phone", problem, heard_digits: heard, digit_count: heard.length,
    note: "You sent " + heard.length + " digits; a BD mobile has exactly 11. If the caller already confirmed a correct 11-digit number and you mistyped it, call this tool again at once with exactly those 11 digits and do NOT ask the caller. Only if you are unsure, ask them to repeat it using 'say'.",
    say,
  };
}

// ───────────────────────── Handlers ─────────────────────────

async function checkAvailability(ctx: ClinicContext, a: Args): Promise<ToolResult> {
  const date = normalizeDate(str(a.date));
  if (!date) return { ok: false, error: "invalid_date", say: "তারিখটা বুঝতে পারিনি, কোন দিন আসতে চান আরেকবার বলবেন?" };
  const today = dhakaParts(new Date()).isoDate;
  if (date < today) return { ok: false, error: "date_in_past", say: "এই তারিখটা তো পার হয়ে গেছে। সামনের কোন দিন আসতে চান?" };
  if (date > addDays(today, 60)) return { ok: false, error: "too_far", say: "আমরা দুই মাসের মধ্যে অ্যাপয়েন্টমেন্ট দিই।" };

  const pod = str(a.part_of_day) ?? "any";
  const win = PART_OF_DAY_WINDOWS[pod];
  const doctorId = str(a.doctor_id);
  const validDoctor = doctorId && ctx.doctors.some((d) => d.id === doctorId) ? doctorId : null;

  const { data, error } = await admin.rpc("available_slots", {
    p_clinic: ctx.clinic.id, p_date: date, p_doctor: validDoctor,
    p_from: win ? win[0] : null, p_to: win ? win[1] : null,
  });
  if (error) throw error;

  let slots = (data ?? []) as { doctor_id: string; doctor_name_bn: string; local_time: string }[];
  // Braces only with the orthodontist; root canal/extraction prefer the oral surgeon.
  const svc = str(a.service_code);
  const specialist = svc === "braces" ? "Orthodontist" : (svc === "root_canal" || svc === "extraction") ? "Oral surgeon" : null;
  if (specialist && !validDoctor) {
    const ids = ctx.doctors.filter((d) => d.title_en.startsWith(specialist)).map((d) => d.id);
    const filtered = slots.filter((s) => ids.includes(s.doctor_id));
    if (filtered.length) slots = filtered;
  }

  // Rank by closeness to the preferred time, then keep variety across doctors.
  const pref = normalizeTime(str(a.preferred_time));
  const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  if (pref) slots.sort((x, y) => Math.abs(mins(x.local_time) - mins(pref)) - Math.abs(mins(y.local_time) - mins(pref)));
  const picked = slots.slice(0, 6).map((s) => ({
    doctor_id: s.doctor_id, doctor: s.doctor_name_bn,
    time: s.local_time.slice(0, 5), say_time: spokenTimeBn(s.local_time.slice(0, 5)),
  }));

  const dow = weekdayOf(date);
  const closed = !ctx.schedules.some((s) => s.weekday === dow);
  let nextOpen: string[] = [];
  if (!picked.length) {
    for (let i = 1; i <= 14 && nextOpen.length < 2; i++) {
      const d = addDays(date, i);
      if (ctx.schedules.some((s) => s.weekday === weekdayOf(d))) nextOpen.push(d);
    }
  }
  return {
    ok: true, date, say_date: spokenDateBn(date), closed,
    slots: picked,
    exact_time_available: pref ? picked.some((p) => p.time === pref) : undefined,
    next_open_dates: nextOpen.map((d) => ({ date: d, say_date: spokenDateBn(d) })),
    note: picked.length ? "Offer 2-3 of these, using say_time." : (closed ? "Clinic closed this day." : "No free slot in that window; offer another time or day."),
  };
}

async function upsertPatient(ctx: ClinicContext, nameBn: string, nameEn: string | null, e164: string) {
  const { data, error } = await admin.from("patients").upsert(
    { clinic_id: ctx.clinic.id, full_name_bn: nameBn, full_name_en: nameEn, phone_e164: e164 },
    { onConflict: "clinic_id,phone_e164" },
  ).select("id").single();
  if (error) throw error;
  return data.id as string;
}

async function upsertExtraction(callId: string, patch: Record<string, unknown>) {
  const { error } = await admin.from("call_extractions").upsert({ call_id: callId, ...patch }, { onConflict: "call_id" });
  if (error) throw error;
}

async function saveCallerDetails(ctx: ClinicContext, callId: string, a: Args): Promise<ToolResult> {
  const nameBn = cleanName(str(a.patient_name_bn));
  const nameEn = cleanName(str(a.patient_name_en));
  const phone = normalizeBdPhone(str(a.phone));
  const patch: Record<string, unknown> = {
    patient_name_bn: nameBn, patient_name_en: nameEn,
    reason_for_visit: str(a.reason_for_visit),
  };
  // Only store a phone once it validates, so a misheard retry never overwrites a good number.
  if (str(a.phone) && phone.valid) Object.assign(patch, { phone_raw: str(a.phone), phone_e164: phone.e164, phone_valid: true });
  await upsertExtraction(callId, Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== null)));

  if (str(a.phone) && !phone.valid) {
    return phoneProblem(phone.problem, phone.digits);
  }
  if (nameBn && phone.valid) {
    const pid = await upsertPatient(ctx, nameBn, nameEn, phone.e164!);
    await admin.from("calls").update({ patient_id: pid }).eq("id", callId);
  }
  return { ok: true, saved: true, readback: phone.valid ? phoneReadback(phone.national!) : undefined };
}

async function assertSlotFree(ctx: ClinicContext, date: string, time: string, doctorId: string) {
  const { data, error } = await admin.rpc("available_slots", {
    p_clinic: ctx.clinic.id, p_date: date, p_doctor: doctorId, p_from: time, p_to: null,
  });
  if (error) throw error;
  return (data ?? []).some((s: { local_time: string }) => s.local_time.slice(0, 5) === time);
}

async function newRefCode(clinicId: string): Promise<string> {
  for (let i = 0; i < 8; i++) {
    const code = String(1000 + Math.floor(Math.random() * 9000));
    const { count } = await admin.from("appointments").select("id", { count: "exact", head: true })
      .eq("clinic_id", clinicId).eq("ref_code", code).in("status", ["booked", "rescheduled"]);
    if (!count) return code;
  }
  return String(Date.now()).slice(-6);
}

async function bookAppointment(ctx: ClinicContext, callId: string, a: Args): Promise<ToolResult> {
  if (a.confirmed_by_caller !== true) {
    return { ok: false, error: "not_confirmed", say: "Read back the details and get a clear yes before booking." };
  }
  const nameBn = cleanName(str(a.patient_name_bn));
  if (!nameBn) return { ok: false, error: "missing_name", say: "আপনার পুরো নামটা একটু বলবেন?" };
  const phone = normalizeBdPhone(str(a.phone));
  if (!phone.valid) {
    return phoneProblem(phone.problem, phone.digits);
  }
  const date = normalizeDate(str(a.date));
  const time = normalizeTime(str(a.time));
  const doctor = ctx.doctors.find((d) => d.id === str(a.doctor_id));
  const service = ctx.services.find((s) => s.code === str(a.service_code)) ?? ctx.services.find((s) => s.code === "consultation")!;
  if (!date || !time) return { ok: false, error: "invalid_slot", say: "সময়টা আরেকবার ঠিক করে নিই — কোন দিন কয়টায়?" };
  if (!doctor) return { ok: false, error: "unknown_doctor", say: "Call check_availability again and use a doctor_id it returns." };
  if (!(await assertSlotFree(ctx, date, time, doctor.id))) {
    return { ok: false, error: "slot_taken", say: "দুঃখিত, এই সময়টা এইমাত্র বুক হয়ে গেছে। কাছাকাছি আরেকটা সময় দেখে দিই?" };
  }

  const patientId = await upsertPatient(ctx, nameBn, cleanName(str(a.patient_name_en)), phone.e164!);
  const start = dhakaToUtc(date, time);
  const end = new Date(start.getTime() + Math.max(service.duration_min, ctx.clinic.slot_minutes) * 60_000);
  const refCode = await newRefCode(ctx.clinic.id);
  const { data: appt, error } = await admin.from("appointments").insert({
    clinic_id: ctx.clinic.id, patient_id: patientId, doctor_id: doctor.id, service_id: service.id,
    call_id: callId, updated_by_call_id: callId, slot_start: start.toISOString(), slot_end: end.toISOString(),
    status: "booked", reason: str(a.reason_for_visit), ref_code: refCode,
  }).select("id").single();
  if (error) {
    if (error.code === "23505") return { ok: false, error: "slot_taken", say: "দুঃখিত, এই সময়টা এইমাত্র বুক হয়ে গেছে। কাছাকাছি আরেকটা সময় দেখে দিই?" };
    throw error;
  }

  await admin.from("calls").update({ patient_id: patientId }).eq("id", callId);
  await upsertExtraction(callId, {
    intent: "book", patient_name_bn: nameBn, patient_name_en: cleanName(str(a.patient_name_en)),
    phone_raw: str(a.phone), phone_e164: phone.e164, phone_valid: true,
    reason_for_visit: str(a.reason_for_visit), service_code: service.code, doctor_id: doctor.id,
    preferred_date: date, preferred_time: time, outcome: "booked", confirmed_by_caller: true,
  });
  return {
    ok: true, appointment_id: appt.id, serial: refCode, say_serial: toBnDigits(refCode).split("").join(" "),
    summary: `${nameBn}, ${doctor.full_name_bn}, ${service.name_bn}, ${spokenDateBn(date)}, ${spokenTimeBn(time)}`,
    prep: service.prep_bn,
  };
}

async function findAppointments(ctx: ClinicContext, callId: string, a: Args): Promise<ToolResult> {
  const phone = normalizeBdPhone(str(a.phone));
  if (!phone.valid) return { ok: false, error: "invalid_phone", say: "যে নম্বর দিয়ে অ্যাপয়েন্টমেন্ট নিয়েছিলেন, সেটা আরেকবার বলবেন?" };
  const { data: patient } = await admin.from("patients").select("id, full_name_bn")
    .eq("clinic_id", ctx.clinic.id).eq("phone_e164", phone.e164!).maybeSingle();
  if (!patient) return { ok: true, appointments: [], note: "No patient with this number." };
  await admin.from("calls").update({ patient_id: patient.id }).eq("id", callId);
  await upsertExtraction(callId, { phone_raw: str(a.phone), phone_e164: phone.e164, phone_valid: true, patient_name_bn: patient.full_name_bn });
  const { data } = await admin.from("appointments")
    .select("id, slot_start, status, ref_code, doctors(full_name_bn), services(name_bn)")
    .eq("patient_id", patient.id).in("status", ["booked", "rescheduled"])
    .gte("slot_start", new Date().toISOString()).order("slot_start").limit(5);
  return {
    ok: true, patient_name: patient.full_name_bn,
    appointments: (data ?? []).map((r: Record<string, any>) => {
      const p = dhakaParts(new Date(r.slot_start));
      return { appointment_id: r.id, serial: r.ref_code, doctor: r.doctors?.full_name_bn, service: r.services?.name_bn,
        say_when: `${spokenDateBn(p.isoDate)}, ${spokenTimeBn(p.hhmm)}` };
    }),
  };
}

async function loadOwnedAppointment(ctx: ClinicContext, id: string | null) {
  if (!id) return null;
  const { data } = await admin.from("appointments").select("*, services(duration_min)")
    .eq("id", id).eq("clinic_id", ctx.clinic.id).maybeSingle();
  return data;
}

async function rescheduleAppointment(ctx: ClinicContext, callId: string, a: Args): Promise<ToolResult> {
  if (a.confirmed_by_caller !== true) return { ok: false, error: "not_confirmed", say: "Confirm the new time with the caller first." };
  const appt = await loadOwnedAppointment(ctx, str(a.appointment_id));
  if (!appt || !["booked", "rescheduled"].includes(appt.status)) return { ok: false, error: "appointment_not_found" };
  const date = normalizeDate(str(a.date)); const time = normalizeTime(str(a.time));
  const doctor = ctx.doctors.find((d) => d.id === str(a.doctor_id));
  if (!date || !time || !doctor) return { ok: false, error: "invalid_slot" };
  if (!(await assertSlotFree(ctx, date, time, doctor.id))) return { ok: false, error: "slot_taken", say: "এই সময়টা খালি নেই, আরেকটা সময় দেখি?" };
  const start = dhakaToUtc(date, time);
  const dur = Math.max(appt.services?.duration_min ?? 30, ctx.clinic.slot_minutes);
  const { error } = await admin.from("appointments").update({
    slot_start: start.toISOString(), slot_end: new Date(start.getTime() + dur * 60_000).toISOString(),
    doctor_id: doctor.id, status: "rescheduled", updated_by_call_id: callId,
  }).eq("id", appt.id);
  if (error) {
    if (error.code === "23505") return { ok: false, error: "slot_taken" };
    throw error;
  }
  await admin.from("calls").update({ patient_id: appt.patient_id }).eq("id", callId);
  await upsertExtraction(callId, { intent: "reschedule", preferred_date: date, preferred_time: time, doctor_id: doctor.id, outcome: "rescheduled", confirmed_by_caller: true });
  return { ok: true, serial: appt.ref_code, say_when: `${spokenDateBn(date)}, ${spokenTimeBn(time)}`, doctor: doctor.full_name_bn };
}

async function cancelAppointment(ctx: ClinicContext, callId: string, a: Args): Promise<ToolResult> {
  if (a.confirmed_by_caller !== true) return { ok: false, error: "not_confirmed", say: "Confirm the cancellation with the caller first." };
  const appt = await loadOwnedAppointment(ctx, str(a.appointment_id));
  if (!appt || !["booked", "rescheduled"].includes(appt.status)) return { ok: false, error: "appointment_not_found" };
  await admin.from("appointments").update({ status: "cancelled", updated_by_call_id: callId }).eq("id", appt.id);
  await admin.from("calls").update({ patient_id: appt.patient_id }).eq("id", callId);
  await upsertExtraction(callId, { intent: "cancel", outcome: "cancelled", confirmed_by_caller: true, notes: str(a.reason) });
  return { ok: true, cancelled: true, serial: appt.ref_code };
}

async function requestCallback(ctx: ClinicContext, callId: string, a: Args): Promise<ToolResult> {
  const phone = normalizeBdPhone(str(a.phone));
  const { data: call } = await admin.from("calls").select("patient_id").eq("id", callId).single();
  const category = ["medical_question", "billing", "complaint", "emergency", "other"].includes(String(a.category)) ? a.category : "other";
  const priority = a.priority === "urgent" || category === "emergency" ? "urgent" : "normal";
  await admin.from("callbacks").insert({
    clinic_id: ctx.clinic.id, call_id: callId, patient_id: call?.patient_id ?? null,
    phone_e164: phone.e164, reason: str(a.reason) ?? "Caller requested a callback", category, priority,
  });
  await upsertExtraction(callId, { needs_human: true, ...(phone.valid ? { phone_e164: phone.e164, phone_valid: true, phone_raw: str(a.phone) } : {}) });
  return { ok: true, created: true, priority, note: phone.valid || call?.patient_id ? "Staff will call back." : "Ask for a callback number and save it with save_caller_details." };
}

export async function runTool(ctx: ClinicContext, callId: string, name: string, args: Args): Promise<ToolResult> {
  const t0 = Date.now();
  let result: ToolResult;
  let ok = true;
  try {
    switch (name) {
      case "check_availability": result = await checkAvailability(ctx, args); break;
      case "save_caller_details": result = await saveCallerDetails(ctx, callId, args); break;
      case "book_appointment": result = await bookAppointment(ctx, callId, args); break;
      case "find_appointments": result = await findAppointments(ctx, callId, args); break;
      case "reschedule_appointment": result = await rescheduleAppointment(ctx, callId, args); break;
      case "cancel_appointment": result = await cancelAppointment(ctx, callId, args); break;
      case "request_callback": result = await requestCallback(ctx, callId, args); break;
      case "end_call": result = { ok: true, ending: true }; break;
      default: result = { ok: false, error: "unknown_tool" };
    }
    ok = result.ok !== false;
  } catch (e) {
    ok = false;
    console.error(`tool ${name} failed`, e);
    result = { ok: false, error: "internal_error", say: "দুঃখিত, সিস্টেমে একটু সমস্যা হচ্ছে। আমি স্টাফকে বলে দিচ্ছি আপনাকে ফোন করতে।" };
  }
  await logEvent(callId, `tool:${name}`, args, result, ok, Date.now() - t0);
  return result;
}

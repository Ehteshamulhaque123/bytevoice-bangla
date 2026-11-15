// Gemini integration: (1) mint a short-lived, locked ephemeral token for the browser's
// live voice session; (2) post-call structured extraction + English gloss + summary.

import { GoogleGenAI, Modality, StartSensitivity, EndSensitivity, ActivityHandling, ThinkingLevel, Type } from "npm:@google/genai@3.3.0";
import { env } from "./env.ts";
import { HttpError } from "./http.ts";

function client(apiVersion?: string) {
  if (!env.geminiApiKey) throw new HttpError(503, "voice_unavailable", "GEMINI_API_KEY is not configured");
  return new GoogleGenAI({ apiKey: env.geminiApiKey, ...(apiVersion ? { httpOptions: { apiVersion } } : {}) });
}

/** The full live-session config. Locked into the token so the browser cannot alter prompt, tools or model. */
export function liveConfig(systemInstruction: string, tools: unknown[]) {
  return {
    responseModalities: [Modality.AUDIO],
    speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: env.voiceName } } },
    systemInstruction,
    tools,
    // Pin transcription to Bangla (+ English loanwords). Without this, auto-detect sometimes
    // writes short Bangla replies like "ঠিক আছে" in Hindi/Devanagari.
    inputAudioTranscription: { languageCodes: ["bn-BD", "en-US"] },
    outputAudioTranscription: { languageCodes: ["bn-BD"] },
    realtimeInputConfig: {
      automaticActivityDetection: {
        disabled: false,
        startOfSpeechSensitivity: StartSensitivity.START_SENSITIVITY_HIGH, // barge-in quickly
        endOfSpeechSensitivity: EndSensitivity.END_SENSITIVITY_LOW,        // let callers pause mid-number
        prefixPaddingMs: 120,
        silenceDurationMs: 750,
      },
      activityHandling: ActivityHandling.START_OF_ACTIVITY_INTERRUPTS,
    },
    contextWindowCompression: { slidingWindow: {} },
  };
}

export async function createEphemeralToken(systemInstruction: string, tools: unknown[]) {
  const ai = client("v1alpha");
  const now = Date.now();
  const token = await ai.authTokens.create({
    config: {
      uses: 1,
      expireTime: new Date(now + (env.maxCallSeconds + 120) * 1000).toISOString(),
      newSessionExpireTime: new Date(now + 90 * 1000).toISOString(), // must connect within 90 s
      // No lockAdditionalFields → every field comes from this constraint, client setup is ignored.
      liveConnectConstraints: { model: env.liveModel, config: liveConfig(systemInstruction, tools) as never },
      httpOptions: { apiVersion: "v1alpha" },
    },
  });
  if (!token.name) throw new HttpError(502, "token_failed");
  return token.name;
}

// ───────────────────────── Post-call extraction ─────────────────────────

export type Extraction = {
  intent: "book" | "reschedule" | "cancel" | "enquiry" | "callback" | "other";
  patient_name_bn: string | null;
  patient_name_en: string | null;
  phone_raw: string | null;
  reason_for_visit: string | null;
  service_code: string | null;
  preferred_text_raw: string | null;
  preferred_date: string | null;
  preferred_time: string | null;
  outcome: "booked" | "rescheduled" | "cancelled" | "enquiry" | "follow_up" | "incomplete" | "failed";
  needs_human: boolean;
  caller_confirmed_details: boolean;
  notes: string | null;
  summary_bn: string;
  summary_en: string;
  translations: { seq: number; text_en: string }[];
};

const nullableString = { type: Type.STRING, nullable: true };

const extractionSchema = {
  type: Type.OBJECT,
  properties: {
    intent: { type: Type.STRING, enum: ["book", "reschedule", "cancel", "enquiry", "callback", "other"] },
    patient_name_bn: nullableString,
    patient_name_en: nullableString,
    phone_raw: { ...nullableString, description: "Phone digits exactly as the caller finally confirmed them" },
    reason_for_visit: nullableString,
    service_code: nullableString,
    preferred_text_raw: { ...nullableString, description: "The caller's own words for when, e.g. 'সামনের রবিবার সন্ধ্যায়'" },
    preferred_date: { ...nullableString, description: "YYYY-MM-DD" },
    preferred_time: { ...nullableString, description: "HH:MM 24h" },
    outcome: { type: Type.STRING, enum: ["booked", "rescheduled", "cancelled", "enquiry", "follow_up", "incomplete", "failed"] },
    needs_human: { type: Type.BOOLEAN },
    caller_confirmed_details: { type: Type.BOOLEAN },
    notes: nullableString,
    summary_bn: { type: Type.STRING },
    summary_en: { type: Type.STRING },
    translations: {
      type: Type.ARRAY,
      items: { type: Type.OBJECT, properties: { seq: { type: Type.INTEGER }, text_en: { type: Type.STRING } }, required: ["seq", "text_en"] },
    },
  },
  required: ["intent", "outcome", "needs_human", "caller_confirmed_details", "summary_bn", "summary_en", "translations"],
};

export async function extractFromTranscript(input: {
  transcript: { seq: number; speaker: string; text: string; at: string }[];
  toolEvents: { type: string; ok: boolean; payload: unknown; result: unknown }[];
  serviceCodes: string[];
  todayIso: string;
}): Promise<Extraction> {
  const ai = client();
  const prompt = `
You are a careful data clerk for a Bangladeshi dental clinic. Below is the transcript of a phone call between the
AI receptionist (agent) and a caller, plus the actions (tool calls) the system actually performed.

Return JSON following the schema:
- Extract only what was actually said and confirmed. Use null when unknown. Never guess digits or names.
- patient_name_bn in Bangla script; patient_name_en a sensible English spelling of the same name.
- phone_raw: the final number the caller confirmed (if they corrected it, use the corrected one).
- service_code must be one of: ${input.serviceCodes.join(", ")} (or null).
- preferred_date/time: resolve relative dates against today = ${input.todayIso} (Asia/Dhaka). Prefer what the tools booked.
- outcome rules: "booked"/"rescheduled"/"cancelled" ONLY if a successful tool action shows it; "follow_up" if a callback
  was requested or staff must act; "enquiry" if the caller only asked for information and got it; "incomplete" if the
  caller hung up before finishing; "failed" if the call could not proceed due to errors.
- needs_human: true if staff must follow up.
- notes: anything staff should know (allergies mentioned, anxiety, prefers a female doctor…), short, in English.
- summary_bn: 1–2 natural Bangla sentences. summary_en: 1–2 English sentences for the clinic manager.
- translations: an accurate, natural English translation for EVERY transcript line, keyed by seq.

TOOL ACTIONS:
${JSON.stringify(input.toolEvents).slice(0, 12000)}

TRANSCRIPT:
${input.transcript.map((t) => `[${t.seq}] ${t.speaker.toUpperCase()}: ${t.text}`).join("\n").slice(0, 40000)}
`.trim();

  const res = await ai.models.generateContent({
    model: env.textModel,
    contents: prompt,
    config: {
      responseMimeType: "application/json",
      responseSchema: extractionSchema,
      temperature: 0.1,
      // Extraction is a reading task: low thinking keeps it to a few seconds on Gemini 3.x models.
      ...(env.textModel.startsWith("gemini-3") ? { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } } : {}),
      httpOptions: { timeout: 60_000 },
    },
  });
  const text = res.text ?? "";
  try {
    return JSON.parse(text) as Extraction;
  } catch {
    throw new Error("extraction_unparseable: " + text.slice(0, 200));
  }
}

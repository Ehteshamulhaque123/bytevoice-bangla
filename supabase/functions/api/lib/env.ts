// Runtime configuration. Secrets come from Supabase Edge Function secrets, never from the repo.
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by the platform automatically.

function opt(name: string, fallback: string): string {
  const v = Deno.env.get(name);
  return v && v.trim() ? v.trim() : fallback;
}

export const env = {
  supabaseUrl: Deno.env.get("SUPABASE_URL")!,
  serviceRoleKey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  geminiApiKey: Deno.env.get("GEMINI_API_KEY") ?? "",
  /** Realtime speech-to-speech model used for the call. */
  liveModel: opt("GEMINI_LIVE_MODEL", "gemini-3.8-live"),
  /** Text model used after the call for extraction, translation and summary. */
  textModel: opt("GEMINI_TEXT_MODEL", "gemini-3.8-flash"),
  voiceName: opt("GEMINI_VOICE", "Sulafat"),
  clinicSlug: opt("CLINIC_SLUG", "hashi-dental"),
  /** Comma-separated list of origins allowed to start calls; "*" during development. */
  allowedOrigins: opt("ALLOWED_ORIGINS", "*").split(",").map((s) => s.trim()),
  maxCallsPerIpPerHour: Number(opt("MAX_CALLS_PER_IP_PER_HOUR", "12")),
  maxCallsPerDay: Number(opt("MAX_CALLS_PER_DAY", "300")),
  maxCallSeconds: Number(opt("MAX_CALL_SECONDS", "480")),
};

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY — copy web/.env.example to web/.env.local");
}

/** Browser client: publishable key only. Row Level Security decides what a logged-in user can read. */
export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});

export const publishableKey = SUPABASE_KEY;
export const functionsUrl = `${SUPABASE_URL}/functions/v1/api`;

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

async function post<T>(path: string, body: unknown, auth?: string): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${functionsUrl}/${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: SUPABASE_KEY,
        ...(auth ? { Authorization: `Bearer ${auth}` } : {}),
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, "network");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? "unknown");
  return data as T;
}

export type SessionResponse = {
  callId: string;
  callSecret: string;
  token: string;
  model: string;
  config: Record<string, unknown>;
  maxCallSeconds: number;
  clinic: { name_bn: string; name_en: string };
};

export const api = {
  startSession: () => post<SessionResponse>("session", {}),
  tool: (callId: string, secret: string, name: string, args: Record<string, unknown>) =>
    post<{ result: Record<string, unknown> }>("tool", { callId, secret, name, args }),
  turns: (callId: string, secret: string, turns: unknown[]) => post<{ saved: number }>("turns", { callId, secret, turns }),
  state: (callId: string, secret: string, state: string, detail?: string) => post("state", { callId, secret, state, detail }),
  finalize: (callId: string, secret: string, endReason: string, turns: unknown[], error?: string) =>
    post<{ ok: boolean; status: string }>("finalize", { callId, secret, endReason, turns, error }),
  /** Staff-only: re-run extraction for a call from the portal. */
  refinalize: async (callId: string) => {
    const { data } = await supabase.auth.getSession();
    return post<{ ok: boolean; status: string }>("finalize", { callId, endReason: "caller_hangup" }, data.session?.access_token);
  },
};

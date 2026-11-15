import { env } from "./env.ts";

export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowAll = env.allowedOrigins.includes("*");
  const allowed = allowAll || env.allowedOrigins.includes(origin);
  return {
    "Access-Control-Allow-Origin": allowAll ? "*" : (allowed ? origin : env.allowedOrigins[0]),
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

export function originAllowed(req: Request): boolean {
  if (env.allowedOrigins.includes("*")) return true;
  const origin = req.headers.get("origin");
  return !!origin && env.allowedOrigins.includes(origin);
}

export function json(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(req), "Content-Type": "application/json; charset=utf-8" },
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request): Promise<T> {
  // sendBeacon posts text/plain; accept any content-type and parse ourselves.
  const text = await req.text();
  if (text.length > 200_000) throw new HttpError(413, "payload_too_large");
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const SUPABASE_REQUEST_TIMEOUT_MS = 8_000;

let cachedToken: { value: string; expiresAt: number } | null = null;

/** Working memory is advisory: a stalled request must never block Drive. */
async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init?.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), SUPABASE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", onAbort);
  }
}

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const response = await fetchWithTimeout("/api/auth/supabase/token", {
    cache: "no-store",
    credentials: "same-origin",
  });
  if (!response.ok) throw new Error("Supabase working-memory identity is unavailable");

  const token = await response.json() as { token?: unknown; expiresAt?: unknown };
  if (typeof token.token !== "string" || typeof token.expiresAt !== "number") {
    throw new Error("Supabase working-memory identity response is invalid");
  }
  cachedToken = { value: token.token, expiresAt: token.expiresAt };
  return cachedToken.value;
}

export const createClient = () =>
  createSupabaseClient(
    supabaseUrl!,
    supabaseKey!,
    { accessToken, global: { fetch: fetchWithTimeout } },
  );

export function clearWorkingMemoryAccessToken(): void {
  cachedToken = null;
}

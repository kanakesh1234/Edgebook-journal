import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

let cachedToken: { value: string; expiresAt: number } | null = null;

async function accessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 30_000) return cachedToken.value;

  const response = await fetch("/api/auth/supabase/token", {
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
    { accessToken },
  );

export function clearWorkingMemoryAccessToken(): void {
  cachedToken = null;
}

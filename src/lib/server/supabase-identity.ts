import "server-only";

import crypto from "node:crypto";

import type { AppSession } from "./session";

const TOKEN_LIFETIME_SECONDS = 5 * 60;

function readPrivateKey(): crypto.KeyObject | null {
  const value = process.env.SUPABASE_RLS_JWT_PRIVATE_KEY?.replace(/\\n/g, "\n").trim();
  if (!value) return null;
  try {
    return crypto.createPrivateKey(value);
  } catch {
    return null;
  }
}

function base64Url(value: string | Buffer): string {
  return Buffer.from(value).toString("base64url");
}

/**
 * A stable UUID is required in the JWT `sub` claim by Supabase. It is derived
 * only on the server from the verified Google subject; authorization itself
 * uses the signed Edgebook user ID claim below, so no user migration is needed.
 */
function supabaseSubject(googleSubject: string): string {
  const bytes = crypto.createHash("sha256").update(`edgebook:supabase:${googleSubject}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function issueSupabaseWorkingMemoryToken(session: AppSession): { token: string; expiresAt: number } | null {
  const privateKey = readPrivateKey();
  const keyId = process.env.SUPABASE_RLS_JWT_KEY_ID?.trim();
  if (!privateKey || !keyId || !session.sub) return null;

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + TOKEN_LIFETIME_SECONDS;
  const header = base64Url(JSON.stringify({ alg: "ES256", typ: "JWT", kid: keyId }));
  const payload = base64Url(JSON.stringify({
    aud: "authenticated",
    exp: expiresAt,
    iat: now,
    role: "authenticated",
    sub: supabaseSubject(session.sub),
    edgebook_user_id: `g_${session.sub}`,
  }));
  const input = `${header}.${payload}`;
  const signature = crypto.sign("sha256", Buffer.from(input), { key: privateKey, dsaEncoding: "ieee-p1363" });

  return { token: `${input}.${base64Url(signature)}`, expiresAt: expiresAt * 1000 };
}

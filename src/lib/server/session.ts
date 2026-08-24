/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */
import crypto from "node:crypto";
import { decryptToken, encryptToken } from "./tokens";

/* ------------------------------------------------------------------ */
/*  Drive session cookie — httpOnly, signed, encrypted payload.        */
/*                                                                      */
/*  Contents: the user's email, their EdgeBook folder id, and their     */
/*  encrypted Google refresh token. The browser can carry it but can    */
/*  never read it. Each user's cookie is theirs alone → isolation.      */
/* ------------------------------------------------------------------ */

export const SESSION_COOKIE = "edgebook.drive";
const SESSION_VERSION = 1;

export interface DriveSession {
  email: string;
  sub: string;
  /** Root "EdgeBook" folder id in the user's Drive. */
  folderId: string;
  /** AES-GCM encrypted refresh token (decryption key never leaves server env). */
  encRefreshToken: string;
}

interface Sealed {
  v: number;
  payload: DriveSession;
  mac: string;
}

export function sealSession(session: DriveSession, secret: string): string {
  const body = JSON.stringify({ v: SESSION_VERSION, payload: session });
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return Buffer.from(JSON.stringify({ v: SESSION_VERSION, payload: session, mac })).toString("base64url");
}

export function openSession(cookie: string | undefined, secret: string): DriveSession | null {
  if (!cookie) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")) as Sealed;
    if (parsed.v !== SESSION_VERSION || !parsed.mac) return null;
    const body = JSON.stringify({ v: parsed.v, payload: parsed.payload });
    const expected = crypto.createHmac("sha256", secret).update(body).digest("base64url");
    const a = Buffer.from(parsed.mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    // Structural validation — a tampered-but-valid-MAC cookie is still rejected.
    const s = parsed.payload;
    if (!s?.email || !s?.sub || !s?.folderId || !s?.encRefreshToken) return null;
    if (decryptToken(s.encRefreshToken, secret) === null) return null;
    return s;
  } catch {
    return null;
  }
}

/** Re-encrypt the refresh token under a new secret (secret rotation helper). */
export function rotateSessionSecret(session: DriveSession, from: string, to: string): DriveSession | null {
  const token = decryptToken(session.encRefreshToken, from);
  if (!token) return null;
  return { ...session, encRefreshToken: encryptToken(token, to) };
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: 60 * 60 * 24 * 180, // 180 days; refresh tokens may outlive this → reconnect
  };
}

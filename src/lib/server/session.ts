import crypto from "node:crypto";

/* ------------------------------------------------------------------ */
/*  Session cookies                                                    */
/*                                                                      */
/*  edgebook.session — the Edge Book app session. Signed JSON containing */
/*  ONLY identity (email/name/sub). No tokens, no secrets: the Drive    */
/*  authorization lives in the server-side account store, resolved by   */
/*  email. Logout clears this cookie; the stored authorization remains. */
/*                                                                      */
/*  `secure` follows the request protocol so the OAuth flow works over  */
/*  plain http://localhost while staying secure in HTTPS production.    */
/* ------------------------------------------------------------------ */

export const APP_SESSION_COOKIE = "edgebook.session";
export const OAUTH_STATE_COOKIE = "edgebook.oauth.state";

export interface AppSession {
  email: string;
  name: string;
  sub: string;
  /** Expiry (epoch ms), enforced server-side. A copied/stolen cookie stops working after this, whatever the browser does. */
  exp?: number;
}

/** App sessions last 30 days. */
export const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function hmac(input: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(input).digest("base64url");
}

export function sealAppSession(session: AppSession, secret: string): string {
  const body = JSON.stringify({ ...session, exp: Date.now() + SESSION_MAX_AGE_SECONDS * 1000 });
  const mac = hmac(body, secret);
  return Buffer.from(JSON.stringify({ body, mac })).toString("base64url");
}

export function openAppSession(cookie: string | undefined, secret: string): AppSession | null {
  if (!cookie) return null;
  try {
    const { body, mac } = JSON.parse(Buffer.from(cookie, "base64url").toString("utf8")) as {
      body: string;
      mac: string;
    };
    if (!body || !mac) return null;
    const expected = hmac(body, secret);
    const a = Buffer.from(mac);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const session = JSON.parse(body) as AppSession;
    if (!session.email) return null;
    // Cookies sealed before expiry existed (no `exp`) are rejected: one re-login, and no cookie lives forever.
    if (typeof session.exp !== "number" || session.exp < Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

/**
 * Cookie options — `secure` follows the actual request protocol so the
 * OAuth flow works over plain http://localhost (browsers drop Secure
 * cookies on insecure origins) while staying secure in HTTPS production.
 */
export function sessionCookieOptions(request?: Request) {
  let secure = false;
  if (request) {
    const forwarded = request.headers.get("x-forwarded-proto");
    const proto = forwarded ?? new URL(request.url).protocol.replace(":", "");
    secure = proto === "https";
  }
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS, // app session: 30 days (Drive auth itself is server-side)
  };
}

/** Read a named cookie from a Request. */
export function readCookie(request: Request, name: string): string | undefined {
  const header = request.headers.get("cookie");
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return undefined;
}

/**
 * Only same-site relative paths are allowed as a post-login destination.
 * `//evil.com` and `/\\evil.com` start with "/" but are treated by browsers as another host (open redirect).
 */
export function safeNextPath(value: string | null | undefined, fallback = "/dashboard"): string {
  if (!value || value.length > 300) return fallback;
  if (!/^\/(?![\/\\])/.test(value)) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  return value;
}

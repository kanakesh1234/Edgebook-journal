/* SERVER-ONLY helpers shared by every API route: who is calling, and how often. */
import { getGoogleConfig } from "./google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie, type AppSession } from "./session";

/** The signed-in user for this request, or null. Expired / tampered cookies return null. */
export function sessionOf(request: Request): AppSession | null {
  const config = getGoogleConfig();
  const cookie = readCookie(request, APP_SESSION_COOKIE);
  return config && cookie ? openAppSession(cookie, config.tokenSecret) : null;
}

export function sessionEmail(request: Request): string | null {
  return sessionOf(request)?.email ?? null;
}

/**
 * True when the server is running in production / on Vercel or when Google OAuth is configured.
 * Ensures that deployed environments NEVER allow unauthenticated access to AI or user endpoints
 * even if an environment variable is temporarily missing.
 */
export function requiresAuth(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL || !!getGoogleConfig();
}

/** Extracts a safe client IP identifier from Vercel / reverse-proxy headers for rate-limiting. */
export function clientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "anon";
}

/** Composite rate-limit key binding both authenticated identity and client IP. */
export function clientKey(request: Request, email?: string | null): string {
  const ip = clientIp(request);
  return email ? `${email.toLowerCase()}:${ip}` : `ip:${ip}`;
}

/* ---------------------------- rate limiting ---------------------------- */
/* In-memory sliding window. Per server instance (stops scripts from draining APIs). */
const hits = new Map<string, number[]>();

/** Returns true when `key` has used up `max` calls inside `windowMs`. Records the call otherwise. */
export function rateLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 2000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
  return false;
}

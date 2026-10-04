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

/* ---------------------------- rate limiting ---------------------------- */
/* In-memory sliding window. Per server instance (good enough to stop a script from draining paid APIs). */
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

/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Authenticated Drive session helper for data route handlers.        */
/*  Resolves the session cookie → live access token + folder ids.      */
/*  User isolation is enforced HERE: every request operates strictly   */
/*  inside the folder id bound to that user's own session cookie.      */
/* ------------------------------------------------------------------ */

import { cookies } from "next/headers";
import { getGoogleConfig } from "./google-config";
import { decryptToken } from "./tokens";
import { SESSION_COOKIE, openSession, type DriveSession } from "./session";
import { ensureAppFolders, fetchAccessToken, type EdgeBookFolders } from "./drive";

export interface AuthedDrive {
  session: DriveSession;
  accessToken: string;
  folders: EdgeBookFolders;
}

let cachedToken: { email: string; token: string; expires: number } | null = null;

export async function getAuthedDrive(): Promise<
  { ok: true; drive: AuthedDrive } | { ok: false; status: 401 | 503; error: string }
> {
  const config = getGoogleConfig();
  if (!config) return { ok: false, status: 503, error: "google_not_configured" };

  const store = await cookies();
  const session = openSession(store.get(SESSION_COOKIE)?.value, config.tokenSecret);
  if (!session) return { ok: false, status: 401, error: "not_connected" };

  const refreshToken = decryptToken(session.encRefreshToken, config.tokenSecret);
  if (!refreshToken) return { ok: false, status: 401, error: "invalid_session" };

  // Small in-process cache; per-user keyed by email so two users never share.
  if (cachedToken && cachedToken.email === session.email && cachedToken.expires > Date.now() + 30_000) {
    const folders = await ensureAppFolders(cachedToken.token);
    if (!folders) return { ok: false, status: 401, error: "folder_setup_failed" };
    return { ok: true, drive: { session, accessToken: cachedToken.token, folders } };
  }

  const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
  if (!accessToken) return { ok: false, status: 401, error: "token_refresh_failed" };

  cachedToken = { email: session.email, token: accessToken, expires: Date.now() + 55 * 60 * 1000 };

  const folders = await ensureAppFolders(accessToken);
  if (!folders) return { ok: false, status: 401, error: "folder_setup_failed" };

  return { ok: true, drive: { session, accessToken, folders } };
}

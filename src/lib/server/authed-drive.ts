/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Authenticated Drive resolution                                     */
/*                                                                      */
/*  App session cookie (identity only) → server-side account store →    */
/*  encrypted refresh token → real Google token refresh.                */
/*                                                                      */
/*  "Connected" means the stored authorization was JUST verified to     */
/*  obtain a valid access token — never a stale UI flag.                */
/*  User isolation: every request operates strictly inside the folder   */
/*  bound to the authenticated account.                                 */
/* ------------------------------------------------------------------ */

import { cookies } from "next/headers";
import { getGoogleConfig, type GoogleConfig } from "./google-config";
import { decryptToken } from "./tokens";
import { APP_SESSION_COOKIE, openAppSession, readCookie, type AppSession } from "./session";
import { accountRefreshToken, getAccount } from "./accounts";
import { ensureAppFolders, fetchAccessToken, type EdgeBookFolders } from "./drive";

export interface AuthedDrive {
  session: AppSession;
  accessToken: string;
  folders: EdgeBookFolders;
}

export type DriveAuthFailure =
  | "not_logged_in"
  | "google_not_configured"
  | "drive_not_authorized"
  | "drive_revoked"
  | "folder_setup_failed";

let cachedFolders: Map<string, EdgeBookFolders> = new Map();
let verifiedOk: { email: string; expires: number } | null = null;

/** Verify the stored authorization can actually obtain a Drive access token. */
export function verifyDriveAuth(
  accountEmail: string,
  config: GoogleConfig,
  getAccountByEmail: (email: string) => { encRefreshToken: string | null } | null,
  fetchAccessTokenImpl: (rt: string, cid: string, cs: string, f?: typeof fetch) => Promise<string | null>,
  fetchImpl?: typeof fetch,
): Promise<boolean> {
  return (async () => {
    if (verifiedOk && verifiedOk.email === accountEmail && verifiedOk.expires > Date.now()) return true;
    const account = getAccountByEmail(accountEmail);
    if (!account?.encRefreshToken) return false;
    const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
    const refreshToken = decryptToken(account.encRefreshToken, secret);
    if (!refreshToken) return false;
    const accessToken = await fetchAccessTokenImpl(refreshToken, config.clientId, config.clientSecret, fetchImpl);
    if (!accessToken) return false;
    verifiedOk = { email: accountEmail, expires: Date.now() + 60_000 };
    return true;
  })();
}

/** Full resolution for data routes: session → account → live access token → folders. */
export async function getAuthedDrive(): Promise<
  { ok: true; drive: AuthedDrive } | { ok: false; status: 401 | 503; error: DriveAuthFailure }
> {
  const config = getGoogleConfig();
  if (!config) return { ok: false, status: 503, error: "google_not_configured" };

  const store = await cookies();
  const session = openAppSession(store.get(APP_SESSION_COOKIE)?.value, config.tokenSecret);
  if (!session) return { ok: false, status: 401, error: "not_logged_in" };

  return resolveDriveForSession(session, config);
}

/** Resolve Drive for an app session (testable — no next/headers dependency). */
export async function resolveDriveForSession(
  session: AppSession,
  config: GoogleConfig,
): Promise<{ ok: true; drive: AuthedDrive } | { ok: false; status: 401; error: DriveAuthFailure }> {
  const account = getAccount(session.email);
  const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
  const refreshToken = account ? accountRefreshToken(account, secret) : null;
  if (!refreshToken) return { ok: false, status: 401, error: "drive_not_authorized" };

  const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
  if (!accessToken) return { ok: false, status: 401, error: "drive_revoked" };

  let folders: EdgeBookFolders | null | undefined = cachedFolders.get(session.email);
  if (!folders) {
    folders = await ensureAppFolders(accessToken);
    if (!folders) return { ok: false, status: 401, error: "folder_setup_failed" };
    cachedFolders.set(session.email, folders);
  }

  return { ok: true, drive: { session, accessToken, folders } };
}

export { readCookie, APP_SESSION_COOKIE };

/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Authenticated Drive resolution                                     */
/*                                                                      */
/*  CANONICAL FOLDER ARCHITECTURE:                                      */
/*  1. Check account.folderId (persisted across restarts)               */
/*  2. If exists → verify accessible → USE IT (no search, no create)    */
/*  3. If not → search by name → if found, persist ID → USE IT          */
/*  4. If not → create ONCE → persist ID → USE IT                       */
/*                                                                      */
/*  Token refresh NEVER triggers folder creation.                      */
/*  In-memory cache is a per-process optimization only.                */
/*  The canonical source is the account store's folderId.              */
/* ------------------------------------------------------------------ */

import { cookies } from "next/headers";
import { getGoogleConfig, type GoogleConfig } from "./google-config";
import { decryptToken } from "./tokens";
import { APP_SESSION_COOKIE, openAppSession, readCookie, type AppSession } from "./session";
import { accountRefreshToken, getAccount, upsertAccount } from "./accounts";
import { ensureAppFolders, ensureFolder, fetchAccessToken, findFolder, type EdgeBookFolders } from "./drive";

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

/** Per-process in-memory cache. Secondary to the persisted account.folderId. */
const cachedFolders = new Map<string, EdgeBookFolders>();

export async function getAuthedDrive(): Promise<
  { ok: true; drive: AuthedDrive } | { ok: false; status: 401 | 503; error: string }
> {
  const config = getGoogleConfig();
  if (!config) return { ok: false, status: 503, error: "google_not_configured" };

  const store = await cookies();
  const session = openAppSession(store.get(APP_SESSION_COOKIE)?.value, config.tokenSecret);
  if (!session) return { ok: false, status: 401, error: "not_logged_in" };

  return resolveDriveForSession(session, config);
}

export async function resolveDriveForSession(
  session: AppSession,
  config: GoogleConfig,
): Promise<{ ok: true; drive: AuthedDrive } | { ok: false; status: 401; error: string }> {
  const account = getAccount(session.email);
  const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
  const refreshToken = account ? accountRefreshToken(account, secret) : null;
  if (!refreshToken) return { ok: false, status: 401, error: "drive_not_authorized" };

  const accessToken = await fetchAccessToken(refreshToken, config.clientId, config.clientSecret);
  if (!accessToken) return { ok: false, status: 401, error: "drive_revoked" };

  // ── CANONICAL FOLDER RESOLUTION ──
  // Priority: in-memory cache → account.folderId → search → create (last resort)
  let folders = cachedFolders.get(session.email);

  if (!folders && account?.folderId) {
    // Stored folder ID exists — verify it's still accessible
    try {
      const res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${account.folderId}?fields=id,name`,
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      if (res.ok) {
        // Stored folder is valid — construct subfolder paths from it
        const rootId = account.folderId;
        folders = await ensureSubfolders(accessToken, rootId);
        cachedFolders.set(session.email, folders);
      }
      // If 404, the stored folder was deleted — fall through to search/create
    } catch {
      // Network error verifying stored folder — fall through
    }
  }

  if (!folders) {
    // No stored folder ID (or it was invalid) — search by name
    const found = await ensureAppFolders(accessToken);
    if (!found) return { ok: false, status: 401, error: "folder_setup_failed" };
    folders = found;
    cachedFolders.set(session.email, folders);
    // Persist the canonical folder ID so future sessions/restarts use it directly
    upsertAccount({ email: session.email, folderId: found.root });
  }

  return { ok: true, drive: { session, accessToken, folders } };
}

/** Ensure the 5 subfolders exist under a known root. Does NOT recreate the root. */
async function ensureSubfolders(accessToken: string, rootId: string): Promise<EdgeBookFolders> {
  const subs = ["trades", "journals", "screenshots", "challenges", "exports"] as const;
  const result: Record<string, string> = { root: rootId };
  for (const sub of subs) {
    result[sub] = await ensureFolder(accessToken, sub, rootId);
  }
  return result as unknown as EdgeBookFolders;
}

export { readCookie, APP_SESSION_COOKIE };

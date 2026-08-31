/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Admin Drive — storage for app-level metadata (accounts.json,       */
/*  friends.json).                                                     */
/*                                                                      */
/*  Per-user journal data lives in EACH user's own Drive via their own  */
/*  OAuth grant (see drive.ts / authed-drive.ts). accounts.json and     */
/*  friends.json are different: they're app-wide registries (email→    */
/*  handle mapping, encrypted refresh tokens, friend requests) that     */
/*  aren't naturally owned by any single end user. There is nowhere on  */
/*  disk to durably put that on Vercel (read-only, ephemeral fs), so    */
/*  instead of a new paid service we store it in a Drive folder owned   */
/*  by ONE Google account you control — using the exact same drive.ts   */
/*  primitives already used for journals.                               */
/*                                                                      */
/*  BOOTSTRAP: this account's authorization is obtained ONCE, outside   */
/*  the app's normal login flow (see scripts/get-admin-refresh-token    */
/*  .mjs), and its refresh token is stored directly in an env var       */
/*  (ADMIN_GOOGLE_REFRESH_TOKEN) — NOT in accounts.json itself. This     */
/*  breaks the chicken-and-egg problem: the OAuth callback needs to      */
/*  write accounts.json before any per-user account exists, so the      */
/*  admin credential can't live inside the store it's used to read.     */
/* ------------------------------------------------------------------ */

import { createFolder, findFolder, getFile, putFile, refreshAccessTokenDetailed } from "./drive";
import { getGoogleConfig } from "./google-config";

const META_FOLDER = "EdgeBook-Meta";

export class AdminDriveNotConfigured extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AdminDriveNotConfigured";
  }
}

/** Per-process caches — same pattern as authed-drive.ts. */
let cachedToken: { token: string; expiresAt: number } | null = null;
let inflightRefresh: Promise<string> | null = null;
let cachedFolderId: string | null = null;
let inflightFolder: Promise<string> | null = null;

function requireRefreshToken(): string {
  const token = process.env.ADMIN_GOOGLE_REFRESH_TOKEN;
  if (!token) {
    throw new AdminDriveNotConfigured(
      "ADMIN_GOOGLE_REFRESH_TOKEN is not set. Run `node scripts/get-admin-refresh-token.mjs` once " +
        "to authorize an admin Google account for app metadata storage, then set the printed value " +
        "as ADMIN_GOOGLE_REFRESH_TOKEN (locally in .env.local, and in Vercel's project env vars).",
    );
  }
  return token;
}

/** Resolve a live access token for the admin Drive account, refreshing/caching as needed. */
async function getAdminAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  if (inflightRefresh) return inflightRefresh;

  const config = getGoogleConfig();
  if (!config) throw new AdminDriveNotConfigured("Google OAuth is not configured (GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET missing).");
  const refreshToken = requireRefreshToken();

  inflightRefresh = (async () => {
    const r = await refreshAccessTokenDetailed(refreshToken, config.clientId, config.clientSecret);
    if (!r.ok) {
      throw Object.assign(
        new Error(`Admin Drive token refresh failed: ${r.reason ?? "unknown"} — ${r.message ?? ""}`),
        { driveError: { status: r.status ?? 0, reason: r.reason ?? "unknown", message: r.message ?? "" } },
      );
    }
    cachedToken = { token: r.accessToken!, expiresAt: Date.now() + (r.expiresIn ?? 3600) * 1000 };
    return cachedToken.token;
  })().finally(() => {
    inflightRefresh = null;
  });

  return inflightRefresh;
}

/** Find-or-create the single "EdgeBook-Meta" folder in the admin's Drive root. Single-flight + cached. */
async function getMetaFolderId(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;
  if (inflightFolder) return inflightFolder;

  inflightFolder = (async () => {
    const token = await getAdminAccessToken();
    const existing = await findFolder(token, META_FOLDER, null);
    const folderId = existing ?? (await createFolder(token, META_FOLDER, null));
    if (!folderId) {
      throw Object.assign(new Error(`Failed to create "${META_FOLDER}" folder in admin Drive`), {
        driveError: { status: 500, reason: "meta_folder_create_failed", message: `Failed to create "${META_FOLDER}"` },
      });
    }
    cachedFolderId = folderId;
    return folderId;
  })().finally(() => {
    inflightFolder = null;
  });

  return inflightFolder;
}

/** True when ADMIN_GOOGLE_REFRESH_TOKEN + Google OAuth are both configured. */
export function isAdminDriveConfigured(): boolean {
  return !!process.env.ADMIN_GOOGLE_REFRESH_TOKEN && !!getGoogleConfig();
}

/**
 * Read a JSON file from the admin metadata folder.
 * Returns `fallback` ONLY when the file genuinely does not exist yet.
 * Any other failure (auth, network, malformed JSON) throws — this store
 * must never silently look "empty" and cause data loss on write-back.
 */
export async function readMetaJson<T>(name: string, fallback: T): Promise<T> {
  const token = await getAdminAccessToken();
  const folderId = await getMetaFolderId();
  const blob = await getFile(token, folderId, name);
  if (!blob) return fallback;
  const text = await blob.text();
  try {
    return JSON.parse(text) as T;
  } catch {
    throw Object.assign(new Error(`${name} in admin Drive is not valid JSON`), {
      driveError: { status: 0, reason: "corrupt_meta_file", message: `Stored ${name} could not be parsed` },
    });
  }
}

/** Write a JSON file to the admin metadata folder (create or overwrite). */
export async function writeMetaJson(name: string, data: unknown): Promise<void> {
  const token = await getAdminAccessToken();
  const folderId = await getMetaFolderId();
  await putFile(token, folderId, name, Buffer.from(JSON.stringify(data, null, 2)), "application/json");
}

/** TEST-ONLY: clears per-process caches so tests can simulate a cold restart. */
export function __resetAdminDriveCachesForTests(): void {
  cachedToken = null;
  inflightRefresh = null;
  cachedFolderId = null;
  inflightFolder = null;
}

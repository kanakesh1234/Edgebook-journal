/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Authenticated Drive resolution                                     */
/*                                                                      */
/*  CANONICAL FOLDER CONTRACT (Rule #7):                                */
/*  1. account.folderId IS the authoritative root identity.            */
/*  2. If set → GET /files/{id}:                                        */
/*       200 → USE IT (no search, no create)                            */
/*       404 → root genuinely deleted → search by name (no create)      */
/*       401/403/429/5xx/network → FAIL LOUDLY (never treated as        */
/*            "missing", never triggers a new folder)                   */
/*  3. No stored id → single-flight search by name → persist if found.  */
/*  4. Search finds nothing AND no prior id → genuinely new account     */
/*     → create ONCE under the same single-flight lock, persist         */
/*     immediately.                                                     */
/*                                                                      */
/*  CONCURRENCY: per-email in-flight dedupe means N simultaneous        */
/*  requests during bootstrap share ONE resolution — this is what       */
/*  stops the duplicate "EdgeBook" roots (66 existed).                  */
/*                                                                      */
/*  TOKENS: access tokens are cached until near-expiry; every Drive op  */
/*  goes through withDrive() which retries ONCE on 401 after a forced   */
/*  refresh. Token failure NEVER creates folders or fakes empty data.   */
/* ------------------------------------------------------------------ */

import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getGoogleConfig, type GoogleConfig } from "./google-config";
import { APP_SESSION_COOKIE, openAppSession, readCookie, type AppSession } from "./session";
import { accountRefreshToken, getAccount, upsertAccount } from "./accounts";
import {
  createFolder, ensureFolder, findAppRoot, refreshAccessTokenDetailed,
  type DriveError, type EdgeBookFolders,
} from "./drive";

export interface AuthedDrive {
  session: AppSession;
  /** Handle = safe public identifier for logs (never an email/token). */
  handle: string;
  accessToken: string;
  folders: EdgeBookFolders;
}

export type DriveAuthFailure =
  | "not_logged_in"
  | "google_not_configured"
  | "drive_not_authorized"
  | "drive_revoked"
  | "folder_setup_failed"
  | "drive_error";

export interface DriveFailure {
  ok: false;
  status: 401 | 502 | 503;
  error: DriveAuthFailure;
  detail?: DriveError;
}

type Resolution = { ok: true; drive: AuthedDrive } | DriveFailure;

/** Per-process caches. Secondary to the persisted account.folderId. */
const cachedFolders = new Map<string, EdgeBookFolders>();
const inflightResolution = new Map<string, Promise<Resolution>>();
const cachedTokens = new Map<string, { token: string; expiresAt: number }>();
/** Single-flight token refresh — concurrent 401s share ONE Google exchange. */
const inflightTokenRefresh = new Map<string, Promise<{ ok: true; token: string } | { ok: false; failure: DriveFailure }>>();

export function newRequestId(): string {
  return crypto.randomBytes(6).toString("hex");
}

/** Structured diagnostic line (Rule #2/#3) — never contains tokens/secrets. */
function diag(event: string, fields: Record<string, unknown>): void {
  const flat = Object.entries(fields)
    .map(([k, v]) => `${k}=${typeof v === "string" && v.includes(" ") ? `"${v}"` : String(v)}`)
    .join(" ");
  console.log(`[DRIVE] ${event} ${flat}`);
}

async function getAccessToken(
  email: string,
  handle: string,
  refreshToken: string,
  config: GoogleConfig,
  requestId: string,
  forceRefresh = false,
): Promise<{ ok: true; token: string } | { ok: false; failure: DriveFailure }> {
  const hit = !forceRefresh ? cachedTokens.get(email) : undefined;
  if (hit && hit.expiresAt > Date.now() + 60_000) return { ok: true, token: hit.token };

  // Single-flight: N concurrent requests needing a refresh share ONE exchange.
  const inflight = inflightTokenRefresh.get(email);
  if (inflight) return inflight;

  const task = (async (): Promise<{ ok: true; token: string } | { ok: false; failure: DriveFailure }> => {
    diag("TOKEN_REFRESH", { requestId, operation: "refreshAccessToken", handle, forced: forceRefresh });
    const r = await refreshAccessTokenDetailed(refreshToken, config.clientId, config.clientSecret);
    if (!r.ok) {
      cachedTokens.delete(email);
      diag("TOKEN_REFRESH_FAILED", {
        requestId, operation: "refreshAccessToken", handle,
        status: r.status, reason: r.reason, message: r.message,
        tokenRefreshAttempted: true, tokenRefreshSucceeded: false,
      });
      return {
        ok: false,
        failure: { ok: false, status: 401, error: "drive_revoked", detail: { status: r.status ?? 0, reason: r.reason ?? "unknown", message: r.message ?? "" } },
      };
    }
    cachedTokens.set(email, { token: r.accessToken!, expiresAt: Date.now() + (r.expiresIn ?? 3600) * 1000 });
    return { ok: true, token: r.accessToken! };
  })().finally(() => inflightTokenRefresh.delete(email));

  inflightTokenRefresh.set(email, task);
  return task;
}

export type DriveConnectionState = "connected" | "auth_required" | "not_authorized" | "temporarily_unavailable";

/**
 * Fast Drive connection check for /api/auth/google/session.
 * Uses the shared access-token cache — a real Google exchange happens only
 * when the cache is cold or expired. NEVER mutates folders or data.
 */
export async function verifyDriveConnection(
  session: AppSession,
  config: GoogleConfig,
): Promise<{ state: DriveConnectionState; reason: string }> {
  const account = await getAccount(session.email);
  if (!account) return { state: "not_authorized", reason: "no_account" };
  const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
  const refreshToken = accountRefreshToken(account, secret);
  if (!refreshToken) return { state: "not_authorized", reason: "not_authorized" };

  const handle = account.handle;
  const cached = cachedTokens.get(session.email);
  if (cached && cached.expiresAt > Date.now() + 60_000) return { state: "connected", reason: "verified_cached" };

  const result = await getAccessToken(session.email, handle, refreshToken, config, newRequestId());
  if (!result.ok) {
    // Only Google's DEFINITIVE invalid_grant (HTTP 400) means
    // reauthorization is required; any other failure is transient.
    const definitive = result.failure.detail?.status === 400 && result.failure.detail?.reason === "invalid_grant";
    const reason = definitive ? "revoked_invalid_grant" : `refresh_failed_${result.failure.detail?.reason ?? "unknown"}`;
    return { state: definitive ? "auth_required" : "temporarily_unavailable", reason };
  }
  return { state: "connected", reason: "verified" };
}

/**
 * Run a Drive operation with automatic single retry on 401
 * (expired/cached-out access token → forced refresh → retry once).
 */
export async function withDrive<T>(
  drive: AuthedDrive,
  operation: string,
  requestId: string,
  fn: (accessToken: string) => Promise<T>,
): Promise<T> {
  try {
    return await fn(drive.accessToken);
  } catch (err) {
    const de = (err as { driveError?: DriveError }).driveError;
    if (de?.status !== 401) throw err;
    diag("DRIVE_401_RETRY", {
      requestId, operation, handle: drive.handle,
      status: de.status, reason: de.reason, message: de.message,
      tokenRefreshAttempted: true,
    });
    const config = getGoogleConfig();
    if (!config) throw err;
    const email = drive.session.email;
    const account = await getAccount(email);
    if (!account) throw err;
    const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
    const refreshToken = accountRefreshToken(account, secret);
    if (!refreshToken) throw err;
    const fresh = await getAccessToken(email, drive.handle, refreshToken, config, requestId, true);
    if (!fresh.ok) throw err;
    try {
      const result = await fn(fresh.token);
      diag("DRIVE_RETRY_SUCCESS", { requestId, operation, handle: drive.handle, tokenRefreshSucceeded: true });
      return result;
    } catch (retryErr) {
      const rde = (retryErr as { driveError?: DriveError }).driveError;
      diag("DRIVE_RETRY_FAILED", {
        requestId, operation, handle: drive.handle,
        status: rde?.status, reason: rde?.reason, message: rde?.message,
        tokenRefreshSucceeded: true,
      });
      throw retryErr;
    }
  }
}

export async function getAuthedDrive(): Promise<Resolution> {
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
): Promise<Resolution> {
  // Single-flight per email: concurrent API calls during page load share one
  // resolution — no racing ensureAppFolders → no duplicate roots.
  const existing = inflightResolution.get(session.email);
  if (existing) return existing;

  const task = resolveImpl(session, config).finally(() => inflightResolution.delete(session.email));
  inflightResolution.set(session.email, task);
  return task;
}

async function resolveImpl(session: AppSession, config: GoogleConfig): Promise<Resolution> {
  const requestId = newRequestId();
  const account = await getAccount(session.email);
  const handle = account?.handle ?? session.email.split("@")[0];
  diag("RESOLVE_START", { requestId, operation: "resolveDriveForSession", handle, hasAccount: !!account, storedRootId: account?.folderId ?? null });

  if (!account) {
    // Fresh login before the callback's upsert landed (should not happen).
    diag("RESOLVE_FAIL", { requestId, operation: "account_lookup", result: "no_account" });
    return { ok: false, status: 401, error: "drive_not_authorized" };
  }

  const secret = process.env.GOOGLE_TOKEN_SECRET ?? config.clientSecret;
  const refreshToken = accountRefreshToken(account, secret);
  if (!refreshToken) {
    diag("RESOLVE_FAIL", { requestId, operation: "token_lookup", result: "no_refresh_token" });
    return { ok: false, status: 401, error: "drive_not_authorized" };
  }

  const tok = await getAccessToken(session.email, handle, refreshToken, config, requestId);
  if (!tok.ok) return tok.failure;

  // ── CANONICAL FOLDER RESOLUTION ──
  // Diagnostic sequence:
  //   STORED_ROOT_CHECK
  //   → STORED_ROOT_TRASHED / STORED_ROOT_404   (invalid stored root)
  //   → SEARCH_VALID_ROOT
  //   → ROOT_CREATED or ROOT_ADOPTED
  //   → ROOT_ID_PERSISTED
  //   → SUBFOLDERS_READY
  let folders = cachedFolders.get(session.email);
  let stage = "cache";

  if (!folders && account.folderId) {
    stage = "stored_id_verify";
    diag("STORED_ROOT_CHECK", { requestId, operation: "verify_stored_root", handle, rootFolderId: account.folderId });
    // Single fetch, exact URL. NOTE: Drive serves TRASHED files via GET with
    // HTTP 200, so `trashed` must be inspected explicitly; a trashed root is
    // NOT usable (its children are hidden from the user's Drive view).
    let res: Response;
    try {
      res = await fetch(
        `https://www.googleapis.com/drive/v3/files/${account.folderId}?fields=id,name,trashed,mimeType`,
        { headers: { Authorization: `Bearer ${tok.token}` } },
      );
    } catch (netErr) {
      diag("RESOLVE_FAIL", { requestId, operation: "verify_stored_root", handle, rootFolderId: account.folderId, result: "network_error", message: String(netErr), tokenRefreshSucceeded: true });
      return { ok: false, status: 502, error: "drive_error", detail: { status: 0, reason: "network_error", message: String(netErr) } };
    }
    if (res.status === 404) {
      diag("STORED_ROOT_404", { requestId, operation: "verify_stored_root", handle, rootFolderId: account.folderId, status: 404, note: "stored root deleted → falling through to search/create" });
    } else if (!res.ok) {
      // 401/403/429/5xx are transient/authorization problems, NOT "missing".
      // Report exactly and stop — never create a replacement on these.
      const body = await res.text();
      let reason = "unknown"; let message = `HTTP ${res.status}`;
      try { const j = JSON.parse(body) as { error?: { message?: string; errors?: { reason?: string }[] } }; reason = j.error?.errors?.[0]?.reason ?? reason; message = j.error?.message ?? message; } catch { /* raw */ }
      diag("RESOLVE_FAIL", { requestId, operation: "verify_stored_root", handle, rootFolderId: account.folderId, status: res.status, reason, message, tokenRefreshSucceeded: true });
      return { ok: false, status: 502, error: "drive_error", detail: { status: res.status, reason, message } };
    } else {
      const meta = (await res.json()) as { id?: string; name?: string; trashed?: boolean; mimeType?: string };
      if (meta.trashed === true) {
        diag("STORED_ROOT_TRASHED", { requestId, operation: "verify_stored_root", handle, rootFolderId: account.folderId, note: "root in trash → falling through to search/create" });
      } else if (meta.mimeType !== "application/vnd.google-apps.folder") {
        diag("STORED_ROOT_NOT_FOLDER", { requestId, operation: "verify_stored_root", handle, rootFolderId: account.folderId, mimeType: meta.mimeType ?? null, note: "falling through to search/create" });
      } else {
        // Valid canonical root — only NOW touch its subfolders.
        folders = await ensureSubfolders(tok.token, account.folderId, requestId, handle);
        cachedFolders.set(session.email, folders);
        stage = "stored_id_ok";
      }
    }
  }

  if (!folders) {
    // Search for a VALID non-trashed EdgeBook folder root.
    stage = "search_valid_root";
    diag("SEARCH_VALID_ROOT", { requestId, operation: "search_root", handle, previousStoredId: account.folderId ?? null });
    let foundRoot: string | null = null;
    try {
      // Quirk (observed live on this account): Google sometimes answers a
      // valid files.list query with HTTP 404 "File not found: ." instead of
      // an empty result. A 404 from the SEARCH ITSELF therefore means
      // "nothing found / not resolvable" — retry once, then treat as empty.
      // It must NOT abort resolution, otherwise recovery can never happen.
      for (let attempt = 1; attempt <= 2 && foundRoot == null; attempt++) {
        try {
          foundRoot = await findAppRoot(tok.token, "EdgeBook");
        } catch (err) {
          const se = (err as { driveError?: DriveError }).driveError!;
          if (se.status === 404 && attempt === 1) {
            diag("SEARCH_404_RETRY", { requestId, operation: "search_root", handle, status: 404, reason: se.reason, message: se.message, note: "list query 404 quirk → retrying once" });
            continue;
          }
          if (se.status === 404) { diag("SEARCH_EMPTY_404", { requestId, operation: "search_root", handle, note: "treating list-404 as no results" }); break; }
          throw err;
        }
      }
    } catch (err) {
      const de = (err as { driveError?: DriveError }).driveError!;
      diag("RESOLVE_FAIL", { requestId, operation: "search_root", handle, status: de.status, reason: de.reason, message: de.message, tokenRefreshSucceeded: true });
      return { ok: false, status: 502, error: "drive_error", detail: de };
    }
    if (foundRoot) {
      folders = await ensureSubfolders(tok.token, foundRoot, requestId, handle);
      cachedFolders.set(session.email, folders);
      await upsertAccount({ email: session.email, folderId: foundRoot });
      diag("ROOT_ADOPTED", { requestId, operation: "search_root", handle, rootFolderId: foundRoot, previousStoredId: account.folderId ?? null });
      diag("ROOT_ID_PERSISTED", { requestId, operation: "upsertAccount", handle, rootFolderId: foundRoot });
    } else {
      // No usable stored root AND no valid existing EdgeBook folder anywhere
      // → normal recovery: create exactly ONE new root (single-flight deduped
      // so concurrent requests cannot both create) and persist immediately.
      // A server restart / browser refresh / second tab can NEVER reach this
      // branch while a valid root exists or is already persisted here.
      stage = "create_recovered_root";
      // We just searched with findAppRoot — create directly (no second find).
      const root = await createFolder(tok.token, "EdgeBook", null);
      if (!root) {
        diag("RESOLVE_FAIL", { requestId, operation: "create_root", handle, result: "create_failed" });
        return { ok: false, status: 502, error: "folder_setup_failed", detail: { status: 0, reason: "root_create_failed", message: "Google Drive did not return a folder id on creation" } };
      }
      folders = await ensureSubfolders(tok.token, root, requestId, handle);
      cachedFolders.set(session.email, folders);
      await upsertAccount({ email: session.email, folderId: root });
      diag("ROOT_CREATED", { requestId, operation: "create_root", handle, rootFolderId: root, previousStoredId: account.folderId ?? null, condition: "no usable stored id AND no valid non-trashed EdgeBook folder found" });
      diag("ROOT_ID_PERSISTED", { requestId, operation: "upsertAccount", handle, rootFolderId: root });
    }
  }

  diag("RESOLVE_OK", { requestId, operation: "resolveDriveForSession", handle, via: stage, rootFolderId: folders.root, journalsFolderId: folders.journals });
  return { ok: true, drive: { session, handle, accessToken: tok.token, folders } };
}

/** Ensure the 5 subfolders exist under a known root. Does NOT recreate the root. */
async function ensureSubfolders(accessToken: string, rootId: string, requestId: string, handle: string): Promise<EdgeBookFolders> {
  const subs = ["trades", "journals", "screenshots", "challenges", "exports"] as const;
  const result: Record<string, string> = { root: rootId };
  for (const sub of subs) {
    result[sub] = await ensureFolder(accessToken, sub, rootId);
  }
  diag("SUBFOLDERS_READY", { requestId, operation: "ensureSubfolders", handle, rootFolderId: rootId });
  return result as unknown as EdgeBookFolders;
}

export { readCookie, APP_SESSION_COOKIE };

/** TEST-ONLY: clears per-process caches so tests can simulate a cold restart. */
export function __resetDriveCachesForTests(): void {
  cachedFolders.clear();
  cachedTokens.clear();
  inflightResolution.clear();
  inflightTokenRefresh.clear();
}

/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */
import crypto from "node:crypto";
import { zonedToUtc } from "../tz";

/* ------------------------------------------------------------------ */
/*  Google Drive client — minimal surface, injectable fetch.           */
/*                                                                      */
/*  Folder layout created per user:                                     */
/*    EdgeBook/                                                         */
/*      trades/  journals/  screenshots/  challenges/  exports/         */
/*                                                                      */
/*  With the drive.file scope the app can only see files it created     */
/*  (or was explicitly opened with) — unrelated Drive files are         */
/*  invisible to every query here.                                      */
/*                                                                      */
/*  ENDPOINT CONTRACT (forensically verified 2026-08-26):               */
/*  Uploads MUST go to https://www.googleapis.com/upload/drive/v3/...   */
/*  The plain /drive/v3/files endpoint only accepts JSON metadata and   */
/*  rejects upload bodies with 400 parseError — which the app surfaced  */
/*  as "drive_write_failed:502" for every write ever attempted.         */
/* ------------------------------------------------------------------ */

const API = "https://www.googleapis.com";
const UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";

export interface DriveError {
  status: number;
  reason: string;
  message: string;
}

/** Capture the actual Google API error for diagnostics (never tokens). */
async function captureDriveError(res: Response): Promise<DriveError> {
  let reason = "unknown";
  let message = `Google Drive API returned ${res.status}`;
  try {
    const body = await res.text();
    const json = JSON.parse(body) as { error?: { message?: string; errors?: { reason?: string }[] } };
    message = json.error?.message ?? message;
    reason = json.error?.errors?.[0]?.reason ?? reason;
  } catch { /* non-JSON error body */ }
  return { status: res.status, reason, message };
}

/** Wrap a fetch Response — throws DriveError on failure instead of returning false. */
async function assertOk(res: Response, operation: string): Promise<Response> {
  if (res.ok) return res;
  const err = await captureDriveError(res);
  console.error(`[Drive] ${operation} failed: status=${err.status} reason=${err.reason} message="${err.message}"`);
  throw Object.assign(new Error(err.message), { driveError: err, operation });
}

export const APP_FOLDER = "EdgeBook";
export const SUBFOLDERS = ["trades", "journals", "screenshots", "challenges", "exports"] as const;

export interface DriveClient {
  fetch: typeof fetch;
}

/** Exchange an OAuth code for tokens (server-side only). */
export async function exchangeCode(args: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  fetchImpl?: typeof fetch;
}): Promise<{ accessToken: string; refreshToken: string | null; idToken: string } | null> {
  const doFetch = args.fetchImpl ?? fetch;
  const res = await doFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: args.code,
      client_id: args.clientId,
      client_secret: args.clientSecret,
      redirect_uri: args.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token: string; refresh_token?: string; id_token: string };
  return { accessToken: json.access_token, refreshToken: json.refresh_token ?? null, idToken: json.id_token };
}

export interface RefreshResult {
  ok: boolean;
  accessToken?: string;
  expiresIn?: number;
  /** Google's exact OAuth error on failure (e.g. invalid_grant). Never a token. */
  status?: number;
  reason?: string;
  message?: string;
}

/**
 * Refresh-token → access-token exchange WITH full Google error propagation.
 * Callers must log `reason` verbatim — never guess auth failures.
 * Note: Google's OAuth token endpoint returns the FLAT error format
 * {"error":"invalid_grant","error_description":"…"} — unlike Drive's nested
 * {error:{errors:[{reason}]}} shape. Both are parsed here.
 */
export async function refreshAccessTokenDetailed(
  refreshToken: string,
  clientId: string,
  clientSecret: string,
  fetchImpl?: typeof fetch,
): Promise<RefreshResult> {
  const doFetch = fetchImpl ?? fetch;
  const res = await doFetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    let reason = "unknown";
    let message = `Google OAuth returned ${res.status}`;
    try {
      const body = await res.text();
      const flat = JSON.parse(body) as { error?: string | { message?: string }; error_description?: string };
      if (typeof flat.error === "string") {
        reason = flat.error;
        message = flat.error_description ?? flat.error;
      } else {
        reason = flat.error?.message ? "oauth_error" : reason;
        message = flat.error?.message ?? message;
      }
    } catch { /* non-JSON body */ }
    return { ok: false, status: res.status, reason, message };
  }
  const json = (await res.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) return { ok: false, status: 0, reason: "no_access_token", message: "Google returned no access_token" };
  return { ok: true, accessToken: json.access_token, expiresIn: json.expires_in ?? 3600 };
}

/** Back-compat wrapper. */
export async function fetchAccessToken(refreshToken: string, clientId: string, clientSecret: string, fetchImpl?: typeof fetch): Promise<string | null> {
  const r = await refreshAccessTokenDetailed(refreshToken, clientId, clientSecret, fetchImpl);
  return r.ok ? r.accessToken! : null;
}

export async function revokeToken(token: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const doFetch = fetchImpl ?? fetch;
  const res = await doFetch("https://oauth2.googleapis.com/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ token }),
  });
  return res.ok;
}

export async function driveFetch(accessToken: string, path: string, init?: RequestInit, fetchImpl?: typeof fetch) {
  const doFetch = fetchImpl ?? fetch;
  return doFetch(`${API}/drive/v3${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

/** Same as driveFetch but against the UPLOAD endpoint (/upload/drive/v3). */
async function driveUploadFetch(accessToken: string, path: string, init?: RequestInit, fetchImpl?: typeof fetch) {
  const doFetch = fetchImpl ?? fetch;
  return doFetch(`${UPLOAD_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.headers ?? {}),
    },
  });
}

/** Find an app-visible folder by name under an optional parent. Throws DriveError on API failure. */
export async function findFolder(accessToken: string, name: string, parentId: string | null, fetchImpl?: typeof fetch): Promise<string | null> {
  const clauses = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${name.replace(/'/g, "\\'")}'`,
    ...(parentId ? [`'${parentId}' in parents`] : []),
  ];
  const res = await driveFetch(accessToken, `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id)&pageSize=5`, undefined, fetchImpl);
  if (!res.ok) throw Object.assign(new Error(`findFolder(${name}) query failed`), { driveError: await captureDriveError(res), operation: `findFolder(${name})` });
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

/**
 * Find the app's TOP-LEVEL root folder by name.
 *
 * Unlike findFolder(parentId=null) this does NOT add the `'me' in parents`
 * clause — on some accounts Google intermittently answers such queries with
 * HTTP 404 "File not found: ." even when matches exist. Under drive.file
 * scope only app-created files are visible anyway, so omitting the parent
 * clause is semantically identical for top-level roots.
 */
export async function findAppRoot(accessToken: string, name: string = APP_FOLDER, fetchImpl?: typeof fetch): Promise<string | null> {
  const clauses = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${name.replace(/'/g, "\\'")}'`,
  ];
  const res = await driveFetch(accessToken, `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id)&pageSize=5`, undefined, fetchImpl);
  if (!res.ok) throw Object.assign(new Error(`findAppRoot(${name}) query failed`), { driveError: await captureDriveError(res), operation: `findAppRoot(${name})` });
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

export async function createFolder(accessToken: string, name: string, parentId: string | null, fetchImpl?: typeof fetch): Promise<string | null> {
  const res = await driveFetch(
    accessToken,
    "/files?fields=id",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        ...(parentId ? { parents: [parentId] } : {}),
      }),
    },
    fetchImpl,
  );
  if (!res.ok) throw Object.assign(new Error(`createFolder(${name}) failed`), { driveError: await captureDriveError(res), operation: `createFolder(${name})` });
  const json = (await res.json()) as { id?: string };
  return json.id ?? null;
}

/** Locate or create a folder — reuse before create, never duplicates. */
export async function ensureFolder(accessToken: string, name: string, parentId: string | null, fetchImpl?: typeof fetch): Promise<string> {
  const existing = await findFolder(accessToken, name, parentId, fetchImpl);
  if (existing) return existing;
  const created = await createFolder(accessToken, name, parentId, fetchImpl);
  if (!created) throw Object.assign(new Error(`Failed to create folder "${name}"`), { driveError: { status: 500, reason: "folder_create_failed", message: `Failed to create folder "${name}"` } });
  return created;
}

export interface EdgeBookFolders {
  root: string;
  trades: string;
  journals: string;
  screenshots: string;
  challenges: string;
  exports: string;
}

/** Create/find the complete EdgeBook folder tree for a user. */
export async function ensureAppFolders(accessToken: string, fetchImpl?: typeof fetch): Promise<EdgeBookFolders> {
  const root = await ensureFolder(accessToken, APP_FOLDER, null, fetchImpl);
  const result = { root } as Record<string, string>;
  for (const sub of SUBFOLDERS) {
    result[sub] = await ensureFolder(accessToken, sub, root, fetchImpl);
  }
  return result as unknown as EdgeBookFolders;
}

/**
 * Upload/update an app file by name in a folder.
 *
 * Uses the CORRECT upload endpoint (/upload/drive/v3) with a manually
 * constructed multipart/related body — the exact shape verified to return
 * 200 from Google. The previous FormData version silently targeted the
 * non-upload endpoint and failed with 400 parseError on every write.
 */
export async function putFile(
  accessToken: string,
  folderId: string,
  name: string,
  body: Blob | Buffer,
  mimeType: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const existing = await findFileId(accessToken, folderId, name, fetchImpl);
  const fileBuf = typeof body === "string"
    ? Buffer.from(body)
    : body instanceof Uint8Array
      ? Buffer.from(body)
      : Buffer.from(await (body as Blob).arrayBuffer());
  const boundary = `edgebook-${crypto.randomBytes(16).toString("hex")}`;
  // On update, Drive forbids changing parents; include them only on create.
  const metadata = existing ? JSON.stringify({ name }) : JSON.stringify({ name, parents: [folderId] });
  const payload = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n` +
      `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`,
    ),
    fileBuf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const path = existing
    ? `/files/${existing}?uploadType=multipart&fields=id`
    : `/files?uploadType=multipart&fields=id`;
  const res = await driveUploadFetch(
    accessToken,
    path,
    {
      method: existing ? "PATCH" : "POST",
      headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
      body: payload,
    },
    fetchImpl,
  );
  await assertOk(res, `putFile(${name})`);
}

/** Find a file by name inside a folder. Returns null when absent; throws DriveError on API failure. */
async function findFileId(accessToken: string, folderId: string, name: string, fetchImpl?: typeof fetch): Promise<string | null> {
  const clauses = [
    "trashed = false",
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${folderId}' in parents`,
  ];
  const res = await driveFetch(accessToken, `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id)&pageSize=5`, undefined, fetchImpl);
  if (!res.ok) throw Object.assign(new Error(`findFileId(${name}) query failed`), { driveError: await captureDriveError(res), operation: `findFileId(${name})` });
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

/**
 * Get a file's content by name inside a folder.
 * null  → file genuinely does not exist (404)
 * throw → any other failure (401/403/429/5xx/network) — NEVER treated as missing data.
 */
export async function getFile(accessToken: string, folderId: string, name: string, fetchImpl?: typeof fetch): Promise<Blob | null> {
  const id = await findFileId(accessToken, folderId, name, fetchImpl);
  if (!id) return null;
  const res = await driveFetch(accessToken, `/files/${id}?alt=media`, undefined, fetchImpl);
  if (res.status === 404) return null;
  if (!res.ok) throw Object.assign(new Error(`getFile(${name}) download failed`), { driveError: await captureDriveError(res), operation: `getFile(${name})` });
  return await res.blob();
}

export async function deleteFile(accessToken: string, folderId: string, name: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const id = await findFileId(accessToken, folderId, name, fetchImpl);
  if (!id) return true;
  const res = await driveFetch(accessToken, `/files/${id}`, { method: "DELETE" }, fetchImpl);
  if (!res.ok && res.status !== 404) {
    throw Object.assign(new Error(`deleteFile(${name}) failed`), { driveError: await captureDriveError(res), operation: `deleteFile(${name})` });
  }
  return true;
}

/* ------------------------------------------------------------------ */
/*  Journal persistence helpers (JSON document per user)               */
/* ------------------------------------------------------------------ */

export const JOURNAL_FILE = "journal.json";

/** Read the journal document. null ONLY when the file does not exist yet. */
export async function readJournalDoc(accessToken: string, folders: EdgeBookFolders, fetchImpl?: typeof fetch): Promise<unknown | null> {
  const blob = await getFile(accessToken, folders.journals, JOURNAL_FILE, fetchImpl);
  if (!blob) return null;
  try {
    return JSON.parse(await blob.text());
  } catch {
    throw Object.assign(new Error("journal.json is not valid JSON"), {
      driveError: { status: 0, reason: "corrupt_journal", message: "Stored journal.json could not be parsed" },
      operation: "readJournalDoc(parse)",
    });
  }
}

export async function writeJournalDoc(accessToken: string, folders: EdgeBookFolders, payload: unknown, fetchImpl?: typeof fetch): Promise<void> {
  await putFile(accessToken, folders.journals, JOURNAL_FILE, Buffer.from(JSON.stringify(payload, null, 2)), "application/json", fetchImpl);
}

/** Screenshot file naming — kept stable per image id. */
export function screenshotFileName(imageId: string): string {
  return `${imageId}.jpg`;
}

/** Re-export for route handlers that need to align dates with NY trading days. */
export { zonedToUtc };

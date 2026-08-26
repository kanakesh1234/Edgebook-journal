/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */
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
/* ------------------------------------------------------------------ */

const API = "https://www.googleapis.com";

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
  console.error(`[Drive] ${operation} failed: status=${err.status} reason=${err.reason} message=${err.message}`);
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

export async function fetchAccessToken(refreshToken: string, clientId: string, clientSecret: string, fetchImpl?: typeof fetch): Promise<string | null> {
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
  if (!res.ok) return null;
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
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

/** Find an app-visible folder by name under an optional parent. */
export async function findFolder(accessToken: string, name: string, parentId: string | null, fetchImpl?: typeof fetch): Promise<string | null> {
  const clauses = [
    "mimeType = 'application/vnd.google-apps.folder'",
    "trashed = false",
    `name = '${name.replace(/'/g, "\\'")}'`,
    parentId ? `'${parentId}' in parents` : "'me' in parents",
  ];
  const res = await driveFetch(accessToken, `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id)&pageSize=5`, undefined, fetchImpl);
  if (!res.ok) return null;
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
  if (!res.ok) return null;
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

/** Upload/update an app file by name in a folder (multipart, app-visible only). */
export async function putFile(
  accessToken: string,
  folderId: string,
  name: string,
  body: Blob | Buffer,
  mimeType: string,
  fetchImpl?: typeof fetch,
): Promise<void> {
  const existing = await findFileId(accessToken, folderId, name, fetchImpl);
  const metadata = JSON.stringify({ name, parents: [folderId] });
  const form = new FormData();
  form.append("metadata", new Blob([metadata], { type: "application/json" }));
  form.append("file", new Blob([body as BlobPart], { type: mimeType }));
  const res = await driveFetch(
    accessToken,
    existing ? `/files/${existing}?uploadType=multipart` : "/files?uploadType=multipart",
    { method: existing ? "PATCH" : "POST", body: form },
    fetchImpl,
  );
  await assertOk(res, `putFile(${name})`);
}

async function findFileId(accessToken: string, folderId: string, name: string, fetchImpl?: typeof fetch): Promise<string | null> {
  const clauses = [
    "trashed = false",
    `name = '${name.replace(/'/g, "\\'")}'`,
    `'${folderId}' in parents`,
  ];
  const res = await driveFetch(accessToken, `/files?q=${encodeURIComponent(clauses.join(" and "))}&fields=files(id)&pageSize=5`, undefined, fetchImpl);
  if (!res.ok) return null;
  const json = (await res.json()) as { files?: { id: string }[] };
  return json.files?.[0]?.id ?? null;
}

export async function getFile(accessToken: string, folderId: string, name: string, fetchImpl?: typeof fetch): Promise<Blob | null> {
  const id = await findFileId(accessToken, folderId, name, fetchImpl);
  if (!id) return null;
  const res = await driveFetch(accessToken, `/files/${id}?alt=media`, undefined, fetchImpl);
  if (!res.ok) return null;
  return await res.blob();
}

export async function deleteFile(accessToken: string, folderId: string, name: string, fetchImpl?: typeof fetch): Promise<boolean> {
  const id = await findFileId(accessToken, folderId, name, fetchImpl);
  if (!id) return true;
  const res = await driveFetch(accessToken, `/files/${id}`, { method: "DELETE" }, fetchImpl);
  return res.ok;
}

/* ------------------------------------------------------------------ */
/*  Journal persistence helpers (JSON document per user)               */
/* ------------------------------------------------------------------ */

export const JOURNAL_FILE = "journal.json";

export async function readJournalDoc(accessToken: string, folders: EdgeBookFolders, fetchImpl?: typeof fetch): Promise<unknown | null> {
  const blob = await getFile(accessToken, folders.journals, JOURNAL_FILE, fetchImpl);
  if (!blob) return null;
  try {
    return JSON.parse(await blob.text());
  } catch {
    return null;
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

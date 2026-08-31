/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */
import crypto from "node:crypto";
import { decryptToken, encryptToken } from "./tokens";
import { readMetaJson, writeMetaJson } from "./admin-drive";

/* ------------------------------------------------------------------ */
/*  Edge Book account store — server-side, Drive-backed.               */
/*                                                                      */
/*  Persists each Google user's Drive authorization (encrypted refresh  */
/*  token + folder id) independently of browser sessions. Logout,       */
/*  browser restarts, and cookie loss do NOT remove it. Only an         */
/*  explicit disconnect (or Google-side revocation) removes it.         */
/*                                                                      */
/*  Storage: a single JSON file (accounts.json) inside an admin-owned   */
/*  Google Drive folder ("EdgeBook-Meta") — see admin-drive.ts. This    */
/*  survives Vercel's ephemeral/read-only filesystem, unlike the        */
/*  earlier .edgebook/accounts.json local-file approach.                */
/* ------------------------------------------------------------------ */

const STORE_FILE = "accounts.json";

export interface EdgeBookAccount {
  email: string;
  sub: string;
  name: string;
  /** Public unique handle for friend discovery — never the email. */
  handle: string;
  /** Deterministic virtual competition points (never money). */
  edgePoints: number;
  /** Root "EdgeBook" folder id in the user's Drive. */
  folderId: string | null;
  /** AES-GCM encrypted Google refresh token (key never leaves server env). */
  encRefreshToken: string | null;
  driveAuthorizedAt: number | null;
  createdAt: number;
  updatedAt: number;
}

async function readAll(): Promise<Record<string, EdgeBookAccount>> {
  return readMetaJson<Record<string, EdgeBookAccount>>(STORE_FILE, {});
}

async function writeAll(accounts: Record<string, EdgeBookAccount>): Promise<void> {
  await writeMetaJson(STORE_FILE, accounts);
}

export async function listAccounts(): Promise<EdgeBookAccount[]> {
  return Object.values(await readAll());
}

function slugHandle(name: string): string {
  const base = name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 16);
  return `${base || "trader"}_${crypto.randomBytes(2).toString("hex")}`;
}

/** Ensure uniqueness — append a suffix if the handle is taken. */
function ensureHandle(handle: string, accounts: Record<string, EdgeBookAccount>): string {
  const taken = new Set(Object.values(accounts).map((a) => a.handle));
  if (!taken.has(handle)) return handle;
  let i = 2;
  while (taken.has(`${handle}_${i}`)) i += 1;
  return `${handle}_${i}`;
}

export async function findByHandle(handle: string): Promise<EdgeBookAccount | null> {
  const h = handle.toLowerCase().replace(/^@/, "");
  return Object.values(await readAll()).find((a) => a.handle.toLowerCase() === h) ?? null;
}

export async function addEdgePoints(email: string, points: number): Promise<EdgeBookAccount | null> {
  const key = email.toLowerCase();
  const accounts = await readAll();
  const existing = accounts[key];
  if (!existing) return null;
  accounts[key] = { ...existing, edgePoints: Math.max(0, (existing.edgePoints ?? 0) + points), updatedAt: Date.now() };
  await writeAll(accounts);
  return accounts[key];
}

export async function getAccount(email: string): Promise<EdgeBookAccount | null> {
  return (await readAll())[email.toLowerCase()] ?? null;
}

export async function upsertAccount(patch: {
  email: string;
  sub?: string;
  name?: string;
  handle?: string;
  folderId?: string | null;
  refreshToken?: string | null; // plaintext in, encrypted at rest
  edgePoints?: number;
}): Promise<EdgeBookAccount> {
  const key = patch.email.toLowerCase();
  const accounts = await readAll();
  const existing = accounts[key];
  const now = Date.now();
  const account: EdgeBookAccount = {
    email: key,
    sub: patch.sub ?? existing?.sub ?? "",
    name: patch.name ?? existing?.name ?? key.split("@")[0],
    handle: existing?.handle ?? ensureHandle(patch.handle ?? slugHandle(patch.name ?? key.split("@")[0]), accounts),
    edgePoints: patch.edgePoints != null ? patch.edgePoints : existing?.edgePoints ?? 0,
    folderId: patch.folderId ?? existing?.folderId ?? null,
    encRefreshToken:
      patch.refreshToken != null ? encryptToken(patch.refreshToken, tokenSecretFor(key)) : existing?.encRefreshToken ?? null,
    driveAuthorizedAt: patch.refreshToken != null ? now : existing?.driveAuthorizedAt ?? null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  accounts[key] = account;
  await writeAll(accounts);
  return account;
}

/** Explicit disconnect: revoke happened at Google; drop the stored authorization. */
export async function clearDriveAuth(email: string): Promise<void> {
  const key = email.toLowerCase();
  const accounts = await readAll();
  const existing = accounts[key];
  if (!existing) return;
  accounts[key] = { ...existing, encRefreshToken: null, driveAuthorizedAt: null, folderId: null, updatedAt: Date.now() };
  await writeAll(accounts);
}

/** Decrypt the stored refresh token (server-side only). */
export function accountRefreshToken(account: EdgeBookAccount, secret: string): string | null {
  if (!account.encRefreshToken) return null;
  return decryptToken(account.encRefreshToken, tokenSecretFor(account.email));
}

/**
 * Per-user token encryption secret derivation input. Uses the global env
 * secret (see tokens.ts) — namespaced by email so a leaked ciphertext for
 * one user is useless for another.
 */
function tokenSecretFor(email: string): string {
  const base = process.env.GOOGLE_TOKEN_SECRET ?? process.env.GOOGLE_CLIENT_SECRET ?? "";
  return cryptoHash(`${base}:${email.toLowerCase()}`);
}

function cryptoHash(input: string): string {
  return crypto.createHash("sha256").update(input).digest("hex");
}

/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */
import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import { decryptToken, encryptToken } from "./tokens";

/* ------------------------------------------------------------------ */
/*  Edge Book account store — server-side, file-backed.                */
/*                                                                      */
/*  Persists each Google user's Drive authorization (encrypted refresh  */
/*  token + folder id) independently of browser sessions. Logout,       */
/*  browser restarts, and cookie loss do NOT remove it. Only an         */
/*  explicit disconnect (or Google-side revocation) removes it.         */
/*                                                                      */
/*  Two-user deployment: a single JSON file under .edgebook/ (gitignored)*/
/*  is deliberate — no database needed at this scale.                   */
/* ------------------------------------------------------------------ */

const STORE_DIR = path.join(process.cwd(), ".edgebook");
const STORE_FILE = path.join(STORE_DIR, "accounts.json");

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

function readAll(): Record<string, EdgeBookAccount> {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as Record<string, EdgeBookAccount>;
  } catch {
    return {};
  }
}

function writeAll(accounts: Record<string, EdgeBookAccount>): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(accounts, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STORE_FILE);
}

export function listAccounts(): EdgeBookAccount[] {
  return Object.values(readAll());
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

export function findByHandle(handle: string): EdgeBookAccount | null {
  const h = handle.toLowerCase().replace(/^@/, "");
  return Object.values(readAll()).find((a) => a.handle.toLowerCase() === h) ?? null;
}

export function addEdgePoints(email: string, points: number): EdgeBookAccount | null {
  const key = email.toLowerCase();
  const accounts = readAll();
  const existing = accounts[key];
  if (!existing) return null;
  accounts[key] = { ...existing, edgePoints: Math.max(0, (existing.edgePoints ?? 0) + points), updatedAt: Date.now() };
  writeAll(accounts);
  return accounts[key];
}

export function getAccount(email: string): EdgeBookAccount | null {
  return readAll()[email.toLowerCase()] ?? null;
}

export function upsertAccount(patch: {
  email: string;
  sub?: string;
  name?: string;
  handle?: string;
  folderId?: string | null;
  refreshToken?: string | null; // plaintext in, encrypted at rest
  edgePoints?: number;
}): EdgeBookAccount {
  const key = patch.email.toLowerCase();
  const accounts = readAll();
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
  writeAll(accounts);
  return account;
}

/** Explicit disconnect: revoke happened at Google; drop the stored authorization. */
export function clearDriveAuth(email: string): void {
  const key = email.toLowerCase();
  const accounts = readAll();
  const existing = accounts[key];
  if (!existing) return;
  accounts[key] = { ...existing, encRefreshToken: null, driveAuthorizedAt: null, folderId: null, updatedAt: Date.now() };
  writeAll(accounts);
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

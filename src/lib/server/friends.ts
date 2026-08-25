/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Friends store — file-backed, same pattern as the account store.    */
/*                                                                      */
/*  Friendships expose ONLY competition-safe aggregate data.            */
/*  Private journals/reflections/screenshots are never touched here.    */
/* ------------------------------------------------------------------ */

import fs from "node:fs";
import path from "node:path";

const STORE_DIR = path.join(process.cwd(), ".edgebook");
const STORE_FILE = path.join(STORE_DIR, "friends.json");

export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

export interface FriendRecord {
  id: string;
  /** Initiator email. */
  from: string;
  /** Recipient email. */
  to: string;
  status: FriendshipStatus;
  createdAt: number;
  updatedAt: number;
}

function readAll(): FriendRecord[] {
  try {
    return JSON.parse(fs.readFileSync(STORE_FILE, "utf8")) as FriendRecord[];
  } catch {
    return [];
  }
}

function writeAll(records: FriendRecord[]): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  const tmp = `${STORE_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(records, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, STORE_FILE);
}

export function listFor(email: string): FriendRecord[] {
  return readAll().filter((r) => r.from === email || r.to === email);
}

export function findRecord(a: string, b: string): FriendRecord | null {
  return readAll().find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;
}

export function sendRequest(from: string, to: string): FriendRecord | null {
  if (from === to) return null;
  const existing = findRecord(from, to);
  if (existing) {
    if (existing.status === "declined") {
      // Re-request allowed after a decline.
      const records = readAll();
      const updated = records.map((r) => (r.id === existing.id ? { ...r, status: "pending" as const, from, to, updatedAt: Date.now() } : r));
      writeAll(updated);
      return updated.find((r) => r.id === existing.id)!;
    }
    return null; // pending/accepted/blocked — no duplicate
  }
  const record: FriendRecord = {
    id: `fr-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    from,
    to,
    status: "pending",
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const records = readAll();
  records.push(record);
  writeAll(records);
  return record;
}

export function respond(recordId: string, email: string, status: "accepted" | "declined" | "blocked"): FriendRecord | null {
  const records = readAll();
  const record = records.find((r) => r.id === recordId);
  // Only the recipient can respond.
  if (!record || record.to !== email) return null;
  const updated = records.map((r) => (r.id === recordId ? { ...r, status, updatedAt: Date.now() } : r));
  writeAll(updated);
  return updated.find((r) => r.id === recordId)!;
}

/** Remove OR block — both terminate the relationship from either side. */
export function terminate(recordId: string, email: string, block: boolean): FriendRecord | null {
  const records = readAll();
  const record = records.find((r) => r.id === recordId);
  if (!record || (record.from !== email && record.to !== email)) return null;
  const updated = records.map((r) =>
    r.id === recordId ? { ...r, status: block ? ("blocked" as const) : ("declined" as const), updatedAt: Date.now() } : r,
  );
  writeAll(updated);
  return updated.find((r) => r.id === recordId)!;
}

/** Accepted friend emails for a user. */
export function friendEmails(email: string): string[] {
  return listFor(email)
    .filter((r) => r.status === "accepted")
    .map((r) => (r.from === email ? r.to : r.from));
}

/** True when a competition-safe relationship exists (accepted, not blocked). */
export function canSee(email: string, other: string): boolean {
  const record = findRecord(email, other);
  return !!record && record.status === "accepted";
}

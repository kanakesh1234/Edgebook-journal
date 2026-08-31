/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Friends store — Drive-backed, same pattern as the account store.   */
/*                                                                      */
/*  Friendships expose ONLY competition-safe aggregate data.            */
/*  Private journals/reflections/screenshots are never touched here.    */
/* ------------------------------------------------------------------ */

import { readMetaJson, writeMetaJson } from "./admin-drive";

const STORE_FILE = "friends.json";

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

async function readAll(): Promise<FriendRecord[]> {
  return readMetaJson<FriendRecord[]>(STORE_FILE, []);
}

async function writeAll(records: FriendRecord[]): Promise<void> {
  await writeMetaJson(STORE_FILE, records);
}

export async function listFor(email: string): Promise<FriendRecord[]> {
  return (await readAll()).filter((r) => r.from === email || r.to === email);
}

export async function findRecord(a: string, b: string): Promise<FriendRecord | null> {
  return (await readAll()).find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;
}

export async function sendRequest(from: string, to: string): Promise<FriendRecord | null> {
  if (from === to) return null;
  const existing = await findRecord(from, to);
  if (existing) {
    if (existing.status === "declined") {
      // Re-request allowed after a decline.
      const records = await readAll();
      const updated = records.map((r) => (r.id === existing.id ? { ...r, status: "pending" as const, from, to, updatedAt: Date.now() } : r));
      await writeAll(updated);
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
  const records = await readAll();
  records.push(record);
  await writeAll(records);
  return record;
}

export async function respond(recordId: string, email: string, status: "accepted" | "declined" | "blocked"): Promise<FriendRecord | null> {
  const records = await readAll();
  const record = records.find((r) => r.id === recordId);
  // Only the recipient can respond.
  if (!record || record.to !== email) return null;
  const updated = records.map((r) => (r.id === recordId ? { ...r, status, updatedAt: Date.now() } : r));
  await writeAll(updated);
  return updated.find((r) => r.id === recordId)!;
}

/** Remove OR block — both terminate the relationship from either side. */
export async function terminate(recordId: string, email: string, block: boolean): Promise<FriendRecord | null> {
  const records = await readAll();
  const record = records.find((r) => r.id === recordId);
  if (!record || (record.from !== email && record.to !== email)) return null;
  const updated = records.map((r) =>
    r.id === recordId ? { ...r, status: block ? ("blocked" as const) : ("declined" as const), updatedAt: Date.now() } : r,
  );
  await writeAll(updated);
  return updated.find((r) => r.id === recordId)!;
}

/** Accepted friend emails for a user. */
export async function friendEmails(email: string): Promise<string[]> {
  return (await listFor(email))
    .filter((r) => r.status === "accepted")
    .map((r) => (r.from === email ? r.to : r.from));
}

/** True when a competition-safe relationship exists (accepted, not blocked). */
export async function canSee(email: string, other: string): Promise<boolean> {
  const record = await findRecord(email, other);
  return !!record && record.status === "accepted";
}

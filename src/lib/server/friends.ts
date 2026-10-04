/* SERVER-ONLY module — import exclusively from route handlers (src/app/api/**). Never import from client components. */

/* ------------------------------------------------------------------ */
/*  Friends store — Drive-backed, same pattern as the account store.   */
/*                                                                      */
/*  Friendships expose ONLY competition-safe aggregate data.            */
/*  Private journals/reflections/screenshots are never touched here.    */
/* ------------------------------------------------------------------ */

import { randomBytes } from "node:crypto";
import { readMetaJson, updateMetaJson } from "./admin-drive";

const STORE_FILE = "friends.json";

export type FriendshipStatus = "pending" | "accepted" | "declined" | "blocked";

export interface FriendRecord {
  id: string;
  /** Initiator email. */
  from: string;
  /** Recipient email. */
  to: string;
  status: FriendshipStatus;
  /** Who pressed Block. Only that person can lift it — the blocked person can't reset it by accepting / removing. */
  blockedBy?: string;
  createdAt: number;
  updatedAt: number;
}

async function readAll(): Promise<FriendRecord[]> {
  return readMetaJson<FriendRecord[]>(STORE_FILE, []);
}

export async function listFor(email: string): Promise<FriendRecord[]> {
  return (await readAll()).filter((r) => r.from === email || r.to === email);
}

export async function findRecord(a: string, b: string): Promise<FriendRecord | null> {
  return (await readAll()).find((r) => (r.from === a && r.to === b) || (r.from === b && r.to === a)) ?? null;
}

export async function sendRequest(from: string, to: string): Promise<FriendRecord | null> {
  if (from === to) return null;
  return updateMetaJson<FriendRecord[], FriendRecord | null>(STORE_FILE, [], (records) => {
    const existing = records.find((r) => (r.from === from && r.to === to) || (r.from === to && r.to === from));
    if (existing) {
      // Re-request is allowed only after a plain decline/remove. pending / accepted / blocked never duplicate.
      if (existing.status !== "declined") return { result: null };
      const updated = { ...existing, status: "pending" as const, from, to, updatedAt: Date.now() };
      return { next: records.map((r) => (r.id === existing.id ? updated : r)), result: updated };
    }
    const now = Date.now();
    const record: FriendRecord = {
      id: `fr-${now.toString(36)}-${randomBytes(5).toString("hex")}`,
      from, to, status: "pending", createdAt: now, updatedAt: now,
    };
    return { next: [...records, record], result: record };
  });
}

/** The recipient accepts / declines a request that is still PENDING. Anything else (blocked, already accepted) is refused. */
export async function respond(recordId: string, email: string, status: "accepted" | "declined" | "blocked"): Promise<FriendRecord | null> {
  if (status !== "accepted" && status !== "declined" && status !== "blocked") return null;
  return updateMetaJson<FriendRecord[], FriendRecord | null>(STORE_FILE, [], (records) => {
    const record = records.find((r) => r.id === recordId);
    if (!record || record.to !== email || record.status !== "pending") return { result: null };
    const updated: FriendRecord = { ...record, status, blockedBy: status === "blocked" ? email : undefined, updatedAt: Date.now() };
    return { next: records.map((r) => (r.id === recordId ? updated : r)), result: updated };
  });
}

/** Remove OR block — both end the relationship from either side. A block can only be undone by whoever set it. */
export async function terminate(recordId: string, email: string, block: boolean): Promise<FriendRecord | null> {
  return updateMetaJson<FriendRecord[], FriendRecord | null>(STORE_FILE, [], (records) => {
    const record = records.find((r) => r.id === recordId);
    if (!record || (record.from !== email && record.to !== email)) return { result: null };
    if (record.status === "blocked" && record.blockedBy !== email) return { result: null };
    const updated: FriendRecord = block
      ? { ...record, status: "blocked", blockedBy: email, updatedAt: Date.now() }
      : { ...record, status: "declined", blockedBy: undefined, updatedAt: Date.now() };
    return { next: records.map((r) => (r.id === recordId ? updated : r)), result: updated };
  });
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

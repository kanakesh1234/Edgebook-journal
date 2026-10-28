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

/**
 * In-memory cache + single-flight deduplication for `friends.json` (matches `accounts.ts`).
 * Eliminates redundant Google Drive downloads when listing friends, checking permissions, or loading lessons.
 * Every mutation runs under `updateMetaJson` lock and invalidates this cache immediately.
 */
const FRIENDS_CACHE_TTL_MS = 30_000;
let friendsCache: { at: number; data: FriendRecord[] } | null = null;
let friendsInflight: Promise<FriendRecord[]> | null = null;

export function invalidateFriendsCache(): void {
  friendsCache = null;
}

async function readAll(): Promise<FriendRecord[]> {
  if (friendsCache && Date.now() - friendsCache.at < FRIENDS_CACHE_TTL_MS) {
    return friendsCache.data;
  }
  if (friendsInflight) return friendsInflight;
  friendsInflight = readMetaJson<FriendRecord[]>(STORE_FILE, [])
    .then((data) => {
      friendsCache = { at: Date.now(), data };
      return data;
    })
    .finally(() => {
      friendsInflight = null;
    });
  return friendsInflight;
}

async function updateFriends<R>(
  fn: (records: FriendRecord[]) => { next?: FriendRecord[]; result: R } | Promise<{ next?: FriendRecord[]; result: R }>,
): Promise<R> {
  try {
    return await updateMetaJson<FriendRecord[], R>(STORE_FILE, [], async (records) => {
      const out = await fn(records);
      if (out.next !== undefined) {
        friendsCache = { at: Date.now(), data: out.next };
      }
      return out;
    });
  } finally {
    // Keep updated snapshot if set above; if an error occurred, clear cache so next read fetches fresh.
  }
}

export async function listFor(email: string): Promise<FriendRecord[]> {
  const lower = email.toLowerCase();
  return (await readAll()).filter((r) => r.from.toLowerCase() === lower || r.to.toLowerCase() === lower);
}

export async function findRecord(a: string, b: string): Promise<FriendRecord | null> {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  return (
    (await readAll()).find(
      (r) =>
        (r.from.toLowerCase() === la && r.to.toLowerCase() === lb) ||
        (r.from.toLowerCase() === lb && r.to.toLowerCase() === la),
    ) ?? null
  );
}

export async function sendRequest(from: string, to: string): Promise<FriendRecord | null> {
  const lFrom = from.toLowerCase();
  const lTo = to.toLowerCase();
  if (lFrom === lTo) return null;
  return updateFriends<FriendRecord | null>((records) => {
    const existing = records.find(
      (r) =>
        (r.from.toLowerCase() === lFrom && r.to.toLowerCase() === lTo) ||
        (r.from.toLowerCase() === lTo && r.to.toLowerCase() === lFrom),
    );
    if (existing) {
      // Re-request is allowed only after a plain decline/remove. pending / accepted / blocked never duplicate.
      if (existing.status !== "declined") return { result: null };
      const updated = { ...existing, status: "pending" as const, from: lFrom, to: lTo, updatedAt: Date.now() };
      return { next: records.map((r) => (r.id === existing.id ? updated : r)), result: updated };
    }
    const now = Date.now();
    const record: FriendRecord = {
      id: `fr-${now.toString(36)}-${randomBytes(5).toString("hex")}`,
      from: lFrom,
      to: lTo,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    };
    return { next: [...records, record], result: record };
  });
}

/** The recipient accepts / declines a request that is still PENDING. Anything else (blocked, already accepted) is refused. */
export async function respond(recordId: string, email: string, status: "accepted" | "declined" | "blocked"): Promise<FriendRecord | null> {
  if (status !== "accepted" && status !== "declined" && status !== "blocked") return null;
  const lower = email.toLowerCase();
  return updateFriends<FriendRecord | null>((records) => {
    const record = records.find((r) => r.id === recordId);
    if (!record || record.to.toLowerCase() !== lower || record.status !== "pending") return { result: null };
    const updated: FriendRecord = { ...record, status, blockedBy: status === "blocked" ? lower : undefined, updatedAt: Date.now() };
    return { next: records.map((r) => (r.id === recordId ? updated : r)), result: updated };
  });
}

/** Remove OR block — both end the relationship from either side. A block can only be undone by whoever set it. */
export async function terminate(recordId: string, email: string, block: boolean): Promise<FriendRecord | null> {
  const lower = email.toLowerCase();
  return updateFriends<FriendRecord | null>((records) => {
    const record = records.find((r) => r.id === recordId);
    if (!record || (record.from.toLowerCase() !== lower && record.to.toLowerCase() !== lower)) return { result: null };
    if (record.status === "blocked" && record.blockedBy?.toLowerCase() !== lower) return { result: null };
    const updated: FriendRecord = block
      ? { ...record, status: "blocked", blockedBy: lower, updatedAt: Date.now() }
      : { ...record, status: "declined", blockedBy: undefined, updatedAt: Date.now() };
    return { next: records.map((r) => (r.id === recordId ? updated : r)), result: updated };
  });
}

/** Accepted friend emails for a user. */
export async function friendEmails(email: string): Promise<string[]> {
  const lower = email.toLowerCase();
  return (await listFor(lower))
    .filter((r) => r.status === "accepted")
    .map((r) => (r.from.toLowerCase() === lower ? r.to : r.from));
}

/** True when a competition-safe relationship exists (accepted, not blocked). */
export async function canSee(email: string, other: string): Promise<boolean> {
  const record = await findRecord(email, other);
  return !!record && record.status === "accepted";
}

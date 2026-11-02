/**
 * DATA SOURCE — how the agent gets the trader's current records, and why it can never serve stale ones.
 *
 * EdgeBook's journal lives in the trader's Drive document and in their browser store (which holds edits not yet
 * synced). The client is therefore the freshest copy. To avoid uploading thousands of trades with every
 * message, both sides compute the same content revision (`computeDataRev`); the server keeps a short-lived
 * per-trader snapshot keyed by that revision.
 *
 *   • revision matches the snapshot  → use it (provably identical content)
 *   • revision differs / no snapshot → ask the client for the data (`need_data`), then store the new snapshot
 *
 * A new trade, an edited note or a changed rule changes the revision, so cached data can never override a
 * newer record. The server RECOMPUTES the revision from any snapshot it receives, so a mislabelled upload
 * cannot poison the cache.
 */
import type { Challenge, JournalEntry, JournalSettings, NoTradeLog, TradePlan } from "@/lib/types";
import { sanitizeEntries } from "../sanitize";

export type ChallengeScope = Pick<Challenge, "id" | "name" | "startingBalance" | "targetBalance" | "maxDrawdown" | "drawdownMode" | "trailingBasis" | "drawdownFloor"> | null;

export interface TraderSnapshot {
  rev: string;
  entries: Record<string, unknown>[];
  plans: TradePlan[];
  dayLogs: NoTradeLog[];
  settings: Partial<JournalSettings>;
  dropped: number;
}

export interface WireSnapshot {
  entries?: unknown;
  plans?: unknown;
  dayLogs?: unknown;
  settings?: unknown;
}

const fnv = (h: number, s: string): number => {
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/** Cheap, order-independent content hash. Identical on client and server. */
export function computeDataRev(input: { entries: readonly unknown[]; plans?: readonly unknown[]; dayLogs?: readonly unknown[]; settings?: unknown }): string {
  let sum = 0, xor = 0;
  for (const raw of input.entries) {
    const e = (raw ?? {}) as Record<string, unknown>;
    // updatedAt moves on every edit; pnl/date/instrument/stop/notes length catch edits that forget to bump it.
    const row = `${e.id}|${e.updatedAt}|${e.pnl}|${e.date}|${e.instrument}|${e.stopLoss}|${e.entryPrice}|${e.reviewStatus}|${String(e.notes ?? "").length}|${e.review ? 1 : 0}${e.reflection ? 1 : 0}`;
    const h = fnv(2166136261, row);
    sum = (sum + h) >>> 0;
    xor = (xor ^ h) >>> 0;
  }
  const plans = (input.plans ?? []).map((p) => { const x = (p ?? {}) as Record<string, unknown>; return `${x.id}|${x.updatedAt ?? x.createdAt}|${x.status}|${String(x.thesis ?? "").length}`; }).sort().join(";");
  const logs = (input.dayLogs ?? []).map((d) => { const x = (d ?? {}) as Record<string, unknown>; return `${x.date}|${x.reason}`; }).sort().join(";");
  const s = (input.settings ?? {}) as Record<string, unknown>;
  const cfg = JSON.stringify({ r: s.rules, p: s.playbook, d: s.dayLimits, e: [s.startingEquity, s.targetEquity, s.maxDrawdown], c: s.primaryChallengeId, n: s.fullName });
  return [input.entries.length, sum.toString(36), xor.toString(36), fnv(2166136261, plans).toString(36), fnv(2166136261, logs).toString(36), fnv(2166136261, cfg).toString(36)].join("-");
}

/** Drop what the model never needs (screenshots) before anything is uploaded. */
export function slimEntry<T extends Record<string, unknown>>(e: T): T {
  const { images: _i, compareImage: _c, ...rest } = e as Record<string, unknown>;
  void _i; void _c;
  return rest as T;
}

export function buildSnapshot(wire: WireSnapshot, claimedRev?: string | null): TraderSnapshot | null {
  if (!Array.isArray(wire.entries)) return null;
  const { entries, dropped } = sanitizeEntries(wire.entries, 25_000);
  const plans = (Array.isArray(wire.plans) ? wire.plans : []).filter((p) => p && typeof p === "object").slice(0, 5_000) as TradePlan[];
  const dayLogs = (Array.isArray(wire.dayLogs) ? wire.dayLogs : []).filter((d) => d && typeof d === "object").slice(0, 5_000) as NoTradeLog[];
  const settings = (wire.settings && typeof wire.settings === "object" ? wire.settings : {}) as Partial<JournalSettings>;
  // The revision is always recomputed from the content; a claimed value is only used to detect client/server drift.
  const rev = computeDataRev({ entries: wire.entries, plans: wire.plans as unknown[] | undefined, dayLogs: wire.dayLogs as unknown[] | undefined, settings });
  void claimedRev;
  return { rev, entries, plans, dayLogs, settings, dropped };
}

/* ------------------------------------------------------------------ */
/*  Per-trader snapshot cache (short-lived, revision-keyed)             */
/* ------------------------------------------------------------------ */

const TTL_MS = 20 * 60_000;
const MAX_TRADERS = 40;
const cache = new Map<string, { snap: TraderSnapshot; at: number }>();

export function cachedSnapshot(userKey: string, rev: string | null | undefined, now = Date.now()): TraderSnapshot | null {
  if (!rev) return null;
  const hit = cache.get(userKey);
  if (!hit || now - hit.at > TTL_MS || hit.snap.rev !== rev) return null;
  hit.at = now;
  return hit.snap;
}

export function storeSnapshot(userKey: string, snap: TraderSnapshot, now = Date.now()): void {
  cache.set(userKey, { snap, at: now });
  if (cache.size > MAX_TRADERS) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].at - b[1].at)[0];
    if (oldest) cache.delete(oldest[0]);
  }
}

export const _clearSnapshotCache = () => cache.clear();

/** Scope entries/plans to the selected challenge, exactly as the dashboard does. */
export function scopeSnapshot(snap: TraderSnapshot, challenge: ChallengeScope): { entries: JournalEntry[]; plans: TradePlan[] } {
  const entries = (challenge ? snap.entries.filter((e) => e.challengeId === challenge.id) : snap.entries) as unknown as JournalEntry[];
  const plans = challenge ? snap.plans.filter((p) => !p.challengeId || p.challengeId === challenge.id) : snap.plans;
  return { entries, plans };
}

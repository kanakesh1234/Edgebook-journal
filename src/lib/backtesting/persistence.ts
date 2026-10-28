/* ------------------------------------------------------------------ */
/*  Backtesting session persistence                                     */
/*                                                                      */
/*  Two layers:                                                         */
/*   1. IndexedDB (edgebook-backtesting) — instant, offline, and the    */
/*      only copy a guest has. Kept separate from the journal payload   */
/*      so big sessions never slow the journal down.                    */
/*   2. Google Drive (EdgeBook/journals/backtests.json) — the SAME      */
/*      Drive the journal already uses, so sessions follow the trader   */
/*      to another browser/device and survive "clear site data".        */
/*      Reached through /api/drive/backtests; a guest (401) simply      */
/*      stays local.                                                    */
/*                                                                      */
/*  JOURNAL REPLAYS ARE EPHEMERAL. A session opened with "Replay this   */
/*  trade" (config.replayTrade) is scaffolding for watching ONE         */
/*  journal trade. It is never uploaded, never listed, and is deleted   */
/*  as soon as the trader leaves it (see discardReplaySession) — any    */
/*  leftover is swept by purgeReplaySessions().                         */
/* ------------------------------------------------------------------ */

import type { BacktestSessionSummary, BacktestConfig, BacktestStatus, ChartSettings, DrawingObject, PriceAlert } from './types';
import type { SimTrade } from './engine/order-engine';
import type { AccountState } from './engine/account-tracker';

/** Full persisted session data. */
export interface PersistedSession {
  id: string;
  config: BacktestConfig;
  status: BacktestStatus;
  clockPosition: number; // UTC epoch seconds
  activeInstrument: string;
  trades: SimTrade[];
  accountState: AccountState;
  chartSettings: ChartSettings;
  drawings: Record<string, DrawingObject[]>; // per instrument
  /** Price alerts (optional — older sessions don't have them). */
  alerts?: PriceAlert[];
  timeframe: string;
  playbackSpeed: number;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'edgebook-backtesting';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

/* ------------------------------ helpers ------------------------------ */

/** A session created by "Replay this trade" in the journal. */
export function isJournalReplay(s: { config?: { replayTrade?: unknown } | null } | null | undefined): boolean {
  return !!s?.config?.replayTrade;
}

/** Replay ids that were discarded in this tab — a late auto-save must never bring them back. */
const discarded = new Set<string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbPut(session: PersistedSession): Promise<void> {
  return openDb().then((db) => new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const req = tx.objectStore(STORE_NAME).put(session);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

function idbGet(id: string): Promise<PersistedSession | null> {
  return openDb().then((db) => new Promise<PersistedSession | null>((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(id);
    req.onsuccess = () => resolve((req.result as PersistedSession | undefined) ?? null);
    req.onerror = () => reject(req.error);
  }));
}

function idbAll(): Promise<PersistedSession[]> {
  return openDb().then((db) => new Promise<PersistedSession[]>((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).getAll();
    req.onsuccess = () => resolve((req.result ?? []) as PersistedSession[]);
    req.onerror = () => reject(req.error);
  }));
}

function idbDelete(id: string): Promise<void> {
  return openDb().then((db) => new Promise<void>((resolve, reject) => {
    const req = db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  }));
}

/* ------------------------------ cloud queue ------------------------------ */

const DIRTY_KEY = 'edgebook:bt-dirty';   // ids with local changes not yet confirmed in Drive
const DELETE_KEY = 'edgebook:bt-deleted'; // ids deleted locally, deletion not yet confirmed in Drive
const PUSH_DELAY_MS = 1500;
const CLOUD_TIMEOUT_MS = 20_000;

function readSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) || '[]') as string[]); } catch { return new Set(); }
}
function writeSet(key: string, s: Set<string>) {
  try { localStorage.setItem(key, JSON.stringify([...s])); } catch { /* storage full / private mode */ }
}

async function cloudFetch(init?: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), CLOUD_TIMEOUT_MS);
  try { return await fetch('/api/drive/backtests', { cache: 'no-store', ...init, signal: ctrl.signal }); }
  finally { clearTimeout(t); }
}

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;

/** Send every pending change to Drive. Safe to call any time; failures stay queued for next time. */
export async function flushBacktestsToCloud(): Promise<boolean> {
  if (typeof window === 'undefined' || pushing) return false;
  const dirty = readSet(DIRTY_KEY);
  const deletes = readSet(DELETE_KEY);
  if (dirty.size === 0 && deletes.size === 0) return true;
  pushing = true;
  try {
    const upserts: PersistedSession[] = [];
    for (const id of dirty) {
      const s = await idbGet(id);
      if (s && !isJournalReplay(s)) upserts.push(s);
    }
    const res = await cloudFetch({
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ upserts, deletes: [...deletes] }),
    });
    if (res.status === 401) return false; // guest / Drive not connected — stay local, keep the queue
    if (!res.ok) return false;
    writeSet(DIRTY_KEY, new Set());
    writeSet(DELETE_KEY, new Set());
    return true;
  } catch {
    return false;
  } finally {
    pushing = false;
  }
}

function schedulePush() {
  if (typeof window === 'undefined') return;
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { pushTimer = null; void flushBacktestsToCloud(); }, PUSH_DELAY_MS);
}

/**
 * Pull Drive's copy and merge it into IndexedDB (newest `updatedAt` wins, Drive deletions are honoured),
 * then upload anything that only exists locally (this is how sessions made before this fix reach Drive).
 * Resolves true when the local list changed.
 */
export async function syncBacktestsWithCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  try {
    const res = await cloudFetch();
    if (!res.ok) return false; // 401 (guest) / 5xx — local only
    const data = (await res.json()) as { sessions?: PersistedSession[]; deleted?: Record<string, number> };
    const cloud = (data.sessions ?? []).filter((s) => s && s.id && s.config && !isJournalReplay(s));
    const tomb = data.deleted ?? {};
    const pendingDeletes = readSet(DELETE_KEY);
    const dirty = readSet(DIRTY_KEY);

    const local = await idbAll();
    const localById = new Map(local.map((s) => [s.id, s]));
    let changed = false;

    // Drive → local
    for (const c of cloud) {
      if (pendingDeletes.has(c.id)) continue; // we are deleting it; don't resurrect
      const l = localById.get(c.id);
      if (!l || (c.updatedAt ?? 0) > (l.updatedAt ?? 0)) {
        await idbPut(c);
        dirty.delete(c.id);
        changed = true;
      }
    }
    // Deleted on another device
    for (const [id, ts] of Object.entries(tomb)) {
      const l = localById.get(id);
      if (l && (l.updatedAt ?? 0) <= ts && !dirty.has(id)) { await idbDelete(id); changed = true; }
    }
    // local → Drive (never-uploaded sessions, or newer local edits)
    const cloudById = new Map(cloud.map((s) => [s.id, s]));
    for (const l of local) {
      if (isJournalReplay(l) || tomb[l.id] != null && (tomb[l.id] ?? 0) >= (l.updatedAt ?? 0)) continue;
      const c = cloudById.get(l.id);
      if (!c || (l.updatedAt ?? 0) > (c.updatedAt ?? 0)) dirty.add(l.id);
    }
    writeSet(DIRTY_KEY, dirty);
    if (dirty.size || pendingDeletes.size) await flushBacktestsToCloud();
    return changed;
  } catch {
    return false;
  }
}

/** Fetch ONE session from Drive (another device opened a link to a session this browser hasn't synced yet). */
async function fetchSessionFromCloud(id: string): Promise<PersistedSession | null> {
  try {
    const res = await cloudFetch();
    if (!res.ok) return null;
    const data = (await res.json()) as { sessions?: PersistedSession[] };
    const hit = (data.sessions ?? []).find((s) => s.id === id) ?? null;
    if (hit) await idbPut(hit);
    return hit;
  } catch { return null; }
}

/* ------------------------------ public API ------------------------------ */

export async function saveBacktestSession(session: PersistedSession): Promise<void> {
  if (isJournalReplay(session) && discarded.has(session.id)) return; // user already left this replay
  // The store stamps createdAt = now on every save; keep the original so "created" never drifts.
  const prev = await idbGet(session.id).catch(() => null);
  const stamped: PersistedSession = { ...session, createdAt: prev?.createdAt ?? session.createdAt, updatedAt: Date.now() };
  await idbPut(stamped);
  if (isJournalReplay(stamped)) return; // journal replays stay on this device only, and only until they are left
  const dirty = readSet(DIRTY_KEY);
  dirty.add(stamped.id);
  writeSet(DIRTY_KEY, dirty);
  schedulePush();
}

export async function loadBacktestSession(id: string): Promise<PersistedSession | null> {
  const local = await idbGet(id);
  if (local) return local;
  return fetchSessionFromCloud(id);
}

/** Local sessions, newest first. Journal replays are never returned (and are cleaned out on the way). */
export async function listBacktestSessions(): Promise<PersistedSession[]> {
  const all = await idbAll();
  const keep: PersistedSession[] = [];
  for (const s of all) {
    if (isJournalReplay(s)) { discarded.add(s.id); void idbDelete(s.id).catch(() => undefined); continue; }
    keep.push(s);
  }
  keep.sort((a, b) => b.updatedAt - a.updatedAt);
  return keep;
}

export async function deleteBacktestSession(id: string): Promise<void> {
  const existing = await idbGet(id).catch(() => null);
  const replay = isJournalReplay(existing);
  if (replay) discarded.add(id);
  await idbDelete(id);
  if (replay) return; // never reached Drive
  const dirty = readSet(DIRTY_KEY); dirty.delete(id); writeSet(DIRTY_KEY, dirty);
  const del = readSet(DELETE_KEY); del.add(id); writeSet(DELETE_KEY, del);
  schedulePush();
}

/** The trader left a journal replay: it has done its job. */
export async function discardReplaySession(id: string | null | undefined): Promise<void> {
  if (!id) return;
  discarded.add(id);
  try { await idbDelete(id); } catch { /* best effort — the next sweep removes it */ }
}

/** Sweep every leftover journal replay (browser closed mid-replay, back button, crash). Returns how many were removed. */
export async function purgeReplaySessions(exceptId?: string | null): Promise<number> {
  try {
    const all = await idbAll();
    let n = 0;
    for (const s of all) {
      if (!isJournalReplay(s) || s.id === exceptId) continue;
      discarded.add(s.id);
      await idbDelete(s.id);
      n++;
    }
    return n;
  } catch { return 0; }
}

/** Convert a persisted session to a summary for the session list. */
export function sessionToSummary(session: PersistedSession): BacktestSessionSummary {
  const acc = session.accountState;
  return {
    id: session.id,
    sessionName: session.config.sessionName || 'Untitled Session',
    instruments: session.config.instruments || [session.config.instrumentSymbol],
    dateRange: {
      start: session.config.periodStartUtc,
      end: session.config.periodEndUtc,
    },
    sessionWindow: {
      startTime: session.config.customSession?.startTime || '09:30',
      endTime: session.config.customSession?.endTime || '16:00',
    },
    startingBalance: acc.startingBalance,
    endingBalance: acc.balance,
    netPnl: acc.netPnl,
    winRate: acc.winRate,
    totalTrades: acc.totalTrades,
    profitFactor: acc.profitFactor,
    maxDrawdown: acc.maxDrawdown,
    maxDailyLoss: 0, // TODO: compute from daily records
    accountType: session.config.accountType,
    status: session.status,
    timeframe: session.config.timeframe,
    lastModified: session.updatedAt,
    createdAt: session.createdAt,
  };
}

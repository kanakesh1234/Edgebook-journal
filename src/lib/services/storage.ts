import { get, set, del } from "idb-keyval";
import type { EntryImage, JournalEntry, JournalSettings, NoTradeLog, PlanRuleState, TradeDirection, TradePlan } from "../types";

/* ------------------------------------------------------------------ */
/*  Persistence layer (Offline-First + Google Drive Auto-Sync)         */
/*                                                                      */
/*  Every write is saved immediately to browser storage (IndexedDB +    */
/*  localStorage mirror) before syncing to Google Drive. If internet    */
/*  drops while planning or logging a trade, all text and chart blobs   */
/*  stay safe in the browser cache and auto-sync when back online.      */
/* ------------------------------------------------------------------ */

export interface JournalPayload {
  entries: JournalEntry[];
  settings: JournalSettings;
  /** Discipline records for days without trades. Optional for v1 payloads. */
  dayLogs?: NoTradeLog[];
  /** Pre-trade plans. Optional for backward compatibility. */
  plans?: TradePlan[];
  /** Payload schema version. v1 payloads simply omit it. */
  version?: number;
  exportedAt?: number;
  /** Server write marker, returned by Drive so a local recovery copy can be compared safely. */
  storedAt?: number;
}

export interface DataStore {
  readonly kind: "local" | "cloud";
  loadJournal(userId: string): Promise<JournalPayload | null>;
  saveJournal(userId: string, payload: JournalPayload): Promise<void>;
  putImage(imageId: string, blob: Blob): Promise<void>;
  getImage(imageId: string): Promise<Blob | undefined>;
  deleteImage(imageId: string): Promise<void>;
  /** Best-effort total bytes used by this app (for storage meters). */
  estimateUsage(): Promise<number | null>;
}

/* ------------------------------ IndexedDB ------------------------------ */

const journalKey = (userId: string) => `journal:${userId}`;
const imageKey = (imageId: string) => `img:${imageId}`;
const pendingImagesKey = "edgebook:pending-drive-images";

export class IdbDataStore implements DataStore {
  readonly kind = "local" as const;

  async loadJournal(userId: string): Promise<JournalPayload | null> {
    return (await get<JournalPayload>(journalKey(userId))) ?? null;
  }

  async saveJournal(userId: string, payload: JournalPayload): Promise<void> {
    await set(journalKey(userId), payload);
  }

  async putImage(imageId: string, blob: Blob): Promise<void> {
    await set(imageKey(imageId), blob);
  }

  async getImage(imageId: string): Promise<Blob | undefined> {
    return await get<Blob>(imageKey(imageId));
  }

  async deleteImage(imageId: string): Promise<void> {
    await del(imageKey(imageId));
  }

  async estimateUsage(): Promise<number | null> {
    try {
      if (typeof navigator !== "undefined" && navigator.storage?.estimate) {
        const { usage } = await navigator.storage.estimate();
        return usage ?? null;
      }
    } catch {
      /* ignore */
    }
    return null;
  }
}

/* -------------------- Live Sync & Offline State -------------------- */

export type SyncConnectionState = "synced" | "syncing" | "offline-cached";

let _syncState: SyncConnectionState =
  typeof navigator !== "undefined" && navigator.onLine === false ? "offline-cached" : "synced";
const _syncListeners = new Set<() => void>();

function setSyncState(next: SyncConnectionState) {
  if (_syncState === next) return;
  _syncState = next;
  _syncListeners.forEach((fn) => fn());
}

export function getSyncState(): SyncConnectionState {
  return _syncState;
}

export function subscribeSyncState(fn: () => void): () => void {
  _syncListeners.add(fn);
  return () => {
    _syncListeners.delete(fn);
  };
}

/* -------------------- In-Progress Plan Trade Draft Cache -------------------- */

export interface CachedPlanDraft {
  date: string;
  updatedAt: number;
  step: "plan" | "thought" | "setup" | "trade" | "chart";
  thesis: string;
  emotion: string;
  emotionReason: string;
  newsAnswer: boolean | null;
  newsEvents: { id: string; name: string; time: string }[];
  thoughts: { id: string; text: string }[];
  watch: string[];
  instrument: string;
  draw: string;
  playbookId: string;
  ruleStates: Record<string, PlanRuleState>;
  pnl: string;
  direction: TradeDirection | null;
  tradeDate: string;
  rr: string;
  entryTime: string;
  exitTime: string;
  entryPrice: string;
  exitPrice: string;
  stopLoss: string;
  takeProfit: string;
  quantity: string;
  images: EntryImage[];
}

const PLAN_DRAFT_KEY = "edgebook:active-plan-draft:v1";

export function savePlanDraftCache(draft: CachedPlanDraft): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(PLAN_DRAFT_KEY, JSON.stringify(draft));
  } catch {
    /* ignore quota errors */
  }
}

export function loadPlanDraftCache(today: string): CachedPlanDraft | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(PLAN_DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CachedPlanDraft;
    if (!parsed || parsed.date !== today) return null;
    const hasContent =
      Boolean(parsed.thesis?.trim()) ||
      Boolean(parsed.emotion) ||
      Boolean(parsed.thoughts?.some((t) => t.text?.trim())) ||
      Boolean(parsed.pnl?.trim()) ||
      Boolean(parsed.images?.length);
    return hasContent ? parsed : null;
  } catch {
    return null;
  }
}

export function clearPlanDraftCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(PLAN_DRAFT_KEY);
  } catch {
    /* ignore */
  }
}

/* -------------------- Cloud persistence (Google Drive + Offline Queue) -------------------- */

let _prefetchedJournal: { at: number; promise: Promise<Response> } | null = null;

export function prefetchJournal(): void {
  if (typeof window === "undefined" || _prefetchedJournal) return;
  const promise = fetch("/api/drive/data", { cache: "no-store" });
  promise.catch(() => undefined);
  _prefetchedJournal = { at: Date.now(), promise };
}

function takePrefetchedJournal(): Promise<Response> | null {
  const p = _prefetchedJournal;
  _prefetchedJournal = null;
  return p && Date.now() - p.at < 20_000 ? p.promise : null;
}

const PENDING_SYNC_PREFIX = "edgebook:pending-drive-sync:";
function pendingSyncKey(userId: string) {
  return `${PENDING_SYNC_PREFIX}${userId}`;
}

export function markPendingDriveSync(userId: string, pending: boolean): void {
  if (typeof window === "undefined") return;
  try {
    if (pending) {
      window.localStorage.setItem(pendingSyncKey(userId), String(Date.now()));
      setSyncState("offline-cached");
    } else {
      window.localStorage.removeItem(pendingSyncKey(userId));
      setSyncState(navigator.onLine === false ? "offline-cached" : "synced");
    }
  } catch {
    /* ignore */
  }
}

export function hasPendingDriveSync(userId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Boolean(window.localStorage.getItem(pendingSyncKey(userId)));
  } catch {
    return false;
  }
}

async function queueOfflineImage(imageId: string): Promise<void> {
  try {
    const existing = (await get<string[]>(pendingImagesKey)) ?? [];
    if (!existing.includes(imageId)) {
      await set(pendingImagesKey, [...existing, imageId]);
    }
  } catch {
    /* ignore */
  }
}

async function flushOfflineImages(): Promise<void> {
  try {
    const pending = (await get<string[]>(pendingImagesKey)) ?? [];
    if (pending.length === 0) return;
    const remaining: string[] = [];
    for (const imageId of pending) {
      const blob = await get<Blob>(imageKey(imageId));
      if (!blob) continue;
      try {
        const res = await fetchWithTimeout(`/api/drive/image/${encodeURIComponent(imageId)}`, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (!res.ok && RETRYABLE_STATUSES.has(res.status)) {
          remaining.push(imageId);
        }
      } catch {
        remaining.push(imageId);
      }
    }
    await set(pendingImagesKey, remaining);
  } catch {
    /* ignore */
  }
}

export class GoogleDriveDataStore implements DataStore {
  readonly kind = "cloud" as const;

  async loadJournal(userId: string): Promise<JournalPayload | null> {
    // If we have unsynced offline edits in browser cache, load them first and sync in background
    const localMirror = loadJournalMirror(userId) ?? (await get<JournalPayload>(journalKey(userId))) ?? null;
    if (hasPendingDriveSync(userId) && localMirror) {
      void this.saveJournal(userId, localMirror).catch(() => undefined);
      return localMirror;
    }

    let res: Response | null = null;
    const early = takePrefetchedJournal();
    if (early) {
      try {
        const r = await early;
        if (r.ok || r.status === 404) res = r;
      } catch {
        /* fall through */
      }
    }
    if (!res) res = await fetchWithTimeout("/api/drive/data", { cache: "no-store" });
    if (res.ok) {
      const json = (await res.json()) as { payload: JournalPayload | null };
      const payload = json.payload ?? null;
      if (payload) {
        saveJournalMirror(userId, payload);
        void set(journalKey(userId), payload).catch(() => undefined);
      }
      setSyncState("synced");
      return payload;
    }
    if (res.status === 404) return null;
    throw new Error(`drive_read_failed:${res.status}`);
  }

  async saveJournal(userId: string, payload: JournalPayload): Promise<void> {
    assertJsonSafe(payload);
    // 1. Always save immediately to browser cache (localStorage + IndexedDB)
    saveJournalMirror(userId, payload);
    void set(journalKey(userId), payload).catch(() => undefined);

    // 2. If offline, mark pending sync and return cleanly so the user's flow is never interrupted
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      markPendingDriveSync(userId, true);
      return;
    }

    setSyncState("syncing");
    try {
      await flushOfflineImages();
      await journalWriteQueue.enqueue(userId, payload);
      markPendingDriveSync(userId, false);
    } catch (err) {
      const syncErr = err instanceof DriveSyncError ? err : null;
      if (!syncErr || syncErr.status === 0 || RETRYABLE_STATUSES.has(syncErr.status)) {
        // Network drop or transient server error: keep safe in browser cache and auto-sync when online
        markPendingDriveSync(userId, true);
        return;
      }
      throw err;
    }
  }

  async putImage(imageId: string, blob: Blob): Promise<void> {
    // 1. Always store image binary in local IndexedDB first so it is safe offline and renders immediately
    await set(imageKey(imageId), blob).catch(() => undefined);

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      await queueOfflineImage(imageId);
      setSyncState("offline-cached");
      return;
    }

    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));
      try {
        const res = await fetchWithTimeout(`/api/drive/image/${encodeURIComponent(imageId)}`, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (res.ok) return;
        lastStatus = res.status;
        if (!RETRYABLE_STATUSES.has(res.status)) break;
      } catch {
        lastStatus = 0;
      }
    }

    if (lastStatus === 0 || RETRYABLE_STATUSES.has(lastStatus)) {
      // Network unavailable — keep in IndexedDB and queue for background upload when internet returns
      await queueOfflineImage(imageId);
      setSyncState("offline-cached");
      return;
    }
    throw new Error(`drive_image_write_failed:${lastStatus}`);
  }

  async getImage(imageId: string): Promise<Blob | undefined> {
    // 1. Serve from local IndexedDB cache first (instant & works offline)
    try {
      const cached = await get<Blob>(imageKey(imageId));
      if (cached) return cached;
    } catch {
      /* fall through */
    }
    if (typeof navigator !== "undefined" && navigator.onLine === false) return undefined;
    const res = await fetchWithTimeout(`/api/drive/image/${encodeURIComponent(imageId)}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    const blob = await res.blob();
    void set(imageKey(imageId), blob).catch(() => undefined);
    return blob;
  }

  async deleteImage(imageId: string): Promise<void> {
    await del(imageKey(imageId)).catch(() => undefined);
    if (typeof navigator !== "undefined" && navigator.onLine === false) return;
    await fetchWithTimeout(`/api/drive/image/${encodeURIComponent(imageId)}`, { method: "DELETE" }).catch(() => undefined);
  }

  async estimateUsage(): Promise<number | null> {
    return null;
  }
}

/* ------------------ Drive journal write/recovery queue ------------------ */

const MIRROR_PREFIX = "edgebook:drive-journal:";
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([403, 429, 500, 501, 502, 503, 504]);
const DRIVE_REQUEST_TIMEOUT_MS = 30_000;
const JOURNAL_FLUSH_DELAY_MS = 300;

async function fetchWithTimeout(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  init?.signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = window.setTimeout(() => controller.abort(), DRIVE_REQUEST_TIMEOUT_MS);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
    init?.signal?.removeEventListener("abort", onAbort);
  }
}

export class DriveSyncError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly reason?: string,
  ) {
    super(message);
    this.name = "DriveSyncError";
  }
}

type PendingWrite = {
  userId: string;
  payload: JournalPayload;
  waiters: Array<{ resolve: () => void; reject: (error: unknown) => void }>;
};

function mirrorKey(userId: string) {
  return `${MIRROR_PREFIX}${userId}`;
}

/** A browser-only safety copy. It is written before every network attempt. */
export function saveJournalMirror(userId: string, payload: JournalPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(mirrorKey(userId), JSON.stringify({ savedAt: Date.now(), payload }));
  } catch (err) {
    console.warn("[DRIVE] local journal mirror failed", err);
  }
}

/** Used for safe offline recovery when Drive cannot be reached. */
export function loadJournalMirror(userId: string): JournalPayload | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(mirrorKey(userId));
    if (!raw) return null;
    const value = JSON.parse(raw) as { payload?: JournalPayload };
    return value.payload && Array.isArray(value.payload.entries) && typeof value.payload.settings === "object"
      ? value.payload
      : null;
  } catch (err) {
    console.warn("[DRIVE] local journal mirror could not be read", err);
    return null;
  }
}

function assertJsonSafe(value: unknown, path = "payload", seen = new WeakSet<object>()): void {
  if (value === undefined || value === null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new DriveSyncError(400, `${path} contains a non-finite number`, "invalid_payload");
    return;
  }
  if (typeof value === "bigint" || typeof value === "function" || typeof value === "symbol") {
    throw new DriveSyncError(400, `${path} contains a non-JSON value`, "invalid_payload");
  }
  if (!(typeof value === "object")) return;
  if (value instanceof Date || value instanceof Set || value instanceof Map) {
    throw new DriveSyncError(400, `${path} contains ${value.constructor.name}, which cannot be saved as journal JSON`, "invalid_payload");
  }
  if (seen.has(value)) throw new DriveSyncError(400, `${path} contains a circular reference`, "invalid_payload");
  seen.add(value);
  if (Array.isArray(value)) value.forEach((item, index) => assertJsonSafe(item, `${path}[${index}]`, seen));
  else Object.entries(value).forEach(([key, item]) => assertJsonSafe(item, `${path}.${key}`, seen));
  seen.delete(value);
}

class JournalWriteQueue {
  private pending: PendingWrite | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private writing = false;

  enqueue(userId: string, payload: JournalPayload): Promise<void> {
    assertJsonSafe(payload);
    return new Promise((resolve, reject) => {
      if (this.pending && this.pending.userId === userId) {
        this.pending.payload = payload;
        this.pending.waiters.push({ resolve, reject });
      } else {
        if (this.pending) {
          this.pending.waiters.forEach((w) => w.reject(new Error("Superseded by a different user write")));
        }
        this.pending = { userId, payload, waiters: [{ resolve, reject }] };
      }
      if (!this.writing) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          void this.flush();
        }, JOURNAL_FLUSH_DELAY_MS);
      }
    });
  }

  private async flush(): Promise<void> {
    this.timer = null;
    if (this.writing || !this.pending) return;
    this.writing = true;
    const job = this.pending;
    this.pending = null;
    try {
      await this.writeWithRetry(job.payload);
      job.waiters.forEach(({ resolve }) => resolve());
    } catch (err) {
      job.waiters.forEach(({ reject }) => reject(err));
    } finally {
      this.writing = false;
      if (this.pending && !this.timer)
        this.timer = setTimeout(() => {
          void this.flush();
        }, JOURNAL_FLUSH_DELAY_MS);
    }
  }

  private async writeWithRetry(payload: JournalPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(body).byteLength;
    if (bytes > MAX_JOURNAL_BYTES)
      throw new DriveSyncError(413, `Journal payload is ${(bytes / 1024 / 1024).toFixed(2)} MB; the 4 MB sync limit was exceeded`, "payload_too_large");
    let last: DriveSyncError | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetchWithTimeout("/api/drive/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
        if (res.ok) return;
        const detail = (await res.json().catch(() => ({}))) as { message?: string; detail?: string; googleStatus?: number };
        const status = detail.googleStatus ?? res.status;
        last = new DriveSyncError(status, detail.message ?? `Drive write failed (${status})`, detail.detail);
      } catch (err) {
        last = new DriveSyncError(0, err instanceof Error ? err.message : "Network error while saving to Drive", "network_error");
      }
      if (!last || (!RETRYABLE_STATUSES.has(last.status) && last.status !== 0) || attempt === 2) throw last;
      const delay = Math.min(4_000, 500 * 2 ** attempt) + Math.round(Math.random() * 250);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    throw last ?? new DriveSyncError(0, "Drive write failed", "unknown");
  }
}

const journalWriteQueue = new JournalWriteQueue();

/* ------------------------------ store switch ------------------------------ */

let impl: DataStore = new IdbDataStore();

export function setActiveStore(store: DataStore): void {
  impl = store;
}

export function getActiveStore(): DataStore {
  return impl;
}

export function resolveStore(): DataStore {
  return new IdbDataStore();
}

export const dataStore: DataStore = {
  get kind() {
    return impl.kind;
  },
  loadJournal: (userId) => impl.loadJournal(userId),
  saveJournal: (userId, payload) => impl.saveJournal(userId, payload),
  putImage: (imageId, blob) => impl.putImage(imageId, blob),
  getImage: (imageId) => impl.getImage(imageId),
  deleteImage: (imageId) => impl.deleteImage(imageId),
  estimateUsage: () => impl.estimateUsage(),
};

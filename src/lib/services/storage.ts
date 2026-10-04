import { get, set, del } from "idb-keyval";
import type { JournalEntry, JournalSettings, NoTradeLog, TradePlan } from "../types";

/* ------------------------------------------------------------------ */
/*  Persistence layer                                                  */
/*                                                                      */
/*  The app talks only to the `DataStore` interface below.              */
/*  Today: IndexedDB via idb-keyval (offline-first).                    */
/*  Tomorrow: swap `resolveStore()` to return a cloud-backed adapter    */
/*  (Google Drive, Supabase, your API…) without touching UI code.       */
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

/* -------------------- Cloud persistence (Google Drive) -------------------- */

/**
 * Drive-backed DataStore — talks exclusively to this app's own server
 * route handlers. The browser never sees tokens; the server resolves the
 * caller's session-bound EdgeBook folder, so user isolation is enforced
 * server-side. When no Drive session exists the routes return 401 and the
 * bootstrap falls back to the local IndexedDB store.
 */
export class GoogleDriveDataStore implements DataStore {
  readonly kind = "cloud" as const;

  async loadJournal(_userId: string): Promise<JournalPayload | null> {
    const res = await fetch("/api/drive/data", { cache: "no-store" });
    // 200 = file found (or new user with no file) — safe to proceed
    if (res.ok) {
      const json = (await res.json()) as { payload: JournalPayload | null };
      return json.payload ?? null;
    }
    // 404 = file doesn't exist yet (new user) — same as null
    if (res.status === 404) return null;
    // Any other error (401, 502, network) = failed to read — DO NOT return null
    // (that would cause the store to initialize with empty data and overwrite Drive)
    throw new Error(`drive_read_failed:${res.status}`);
  }

  async saveJournal(_userId: string, payload: JournalPayload): Promise<void> {
    assertJsonSafe(payload);
    saveJournalMirror(_userId, payload);
    await journalWriteQueue.enqueue(_userId, payload);
  }

  async putImage(imageId: string, blob: Blob): Promise<void> {
    // Drive occasionally answers 429/5xx (or the network blips) — retry a couple of times before giving up.
    let lastStatus = 0;
    for (let attempt = 0; attempt < 3; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 600 * attempt));
      try {
        const res = await fetch(`/api/drive/image/${encodeURIComponent(imageId)}`, {
          method: "PUT",
          headers: { "Content-Type": "image/jpeg" },
          body: blob,
        });
        if (res.ok) return;
        lastStatus = res.status;
        if (!RETRYABLE_STATUSES.has(res.status)) break; // 400 / 401 won't improve by retrying
      } catch {
        lastStatus = 0; // network error — retry
      }
    }
    throw new Error(`drive_image_write_failed:${lastStatus}`);
  }

  async getImage(imageId: string): Promise<Blob | undefined> {
    const res = await fetch(`/api/drive/image/${encodeURIComponent(imageId)}`, { cache: "no-store" });
    if (!res.ok) return undefined;
    return await res.blob();
  }

  async deleteImage(imageId: string): Promise<void> {
    await fetch(`/api/drive/image/${encodeURIComponent(imageId)}`, { method: "DELETE" });
  }

  async estimateUsage(): Promise<number | null> {
    return null; // Drive quota is not surfaced per-app; the Settings meter stays local.
  }
}

/* ------------------ Drive journal write/recovery queue ------------------ */

const MIRROR_PREFIX = "edgebook:drive-journal:";
const MAX_JOURNAL_BYTES = 4 * 1024 * 1024;
const RETRYABLE_STATUSES = new Set([403, 429, 500, 501, 502, 503, 504]);

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

function mirrorKey(userId: string) { return `${MIRROR_PREFIX}${userId}`; }

/** A browser-only safety copy. It is written before every network attempt. */
export function saveJournalMirror(userId: string, payload: JournalPayload): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(mirrorKey(userId), JSON.stringify({ savedAt: Date.now(), payload }));
  } catch (err) {
    console.warn("[DRIVE] local journal mirror failed", err);
  }
}

/** Used only for a safe, read-only recovery view when Drive cannot be loaded. */
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
        // A signed-in browser has one journal. Flush a previous account before
        // accepting a different one, rather than allowing concurrent writes.
        if (this.pending) {
          this.pending.waiters.forEach((w) => w.reject(new Error("Superseded by a different user write")));
        }
        this.pending = { userId, payload, waiters: [{ resolve, reject }] };
      }
      if (!this.writing) {
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => { void this.flush(); }, 1500);
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
      if (this.pending && !this.timer) this.timer = setTimeout(() => { void this.flush(); }, 1500);
    }
  }

  private async writeWithRetry(payload: JournalPayload): Promise<void> {
    const body = JSON.stringify(payload);
    const bytes = new TextEncoder().encode(body).byteLength;
    if (bytes > MAX_JOURNAL_BYTES) throw new DriveSyncError(413, `Journal payload is ${(bytes / 1024 / 1024).toFixed(2)} MB; the 4 MB sync limit was exceeded`, "payload_too_large");
    let last: DriveSyncError | null = null;
    for (let attempt = 0; attempt < 5; attempt++) {
      try {
        const res = await fetch("/api/drive/data", { method: "PUT", headers: { "Content-Type": "application/json" }, body });
        if (res.ok) return;
        const detail = await res.json().catch(() => ({})) as { message?: string; detail?: string; googleStatus?: number };
        const status = detail.googleStatus ?? res.status;
        last = new DriveSyncError(status, detail.message ?? `Drive write failed (${status})`, detail.detail);
      } catch (err) {
        last = new DriveSyncError(0, err instanceof Error ? err.message : "Network error while saving to Drive", "network_error");
      }
      if (!last || (!RETRYABLE_STATUSES.has(last.status) && last.status !== 0) || attempt === 4) throw last;
      const delay = Math.min(8_000, 500 * 2 ** attempt) + Math.round(Math.random() * 250);
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
    }
    throw last ?? new DriveSyncError(0, "Drive write failed", "unknown");
  }
}

const journalWriteQueue = new JournalWriteQueue();

/* ------------------------------ store switch ------------------------------ */

/**
 * Active store with a contract-preserving delegate. Defaults to local
 * IndexedDB; the bootstrap switches to the Drive store when a Google
 * session is present. All existing `dataStore.*` call sites keep working.
 */
let impl: DataStore = new IdbDataStore();

export function setActiveStore(store: DataStore): void {
  impl = store;
}

export function getActiveStore(): DataStore {
  return impl;
}

/** Single switch point between backends. */
export function resolveStore(): DataStore {
  // const backend = process.env.NEXT_PUBLIC_STORAGE_BACKEND;
  // if (backend === "gdrive") return new GoogleDriveDataStore(getTokenFromSession);
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

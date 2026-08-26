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
    const res = await fetch("/api/drive/data", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error(`drive_write_failed:${res.status}`);
  }

  async putImage(imageId: string, blob: Blob): Promise<void> {
    const res = await fetch(`/api/drive/image/${encodeURIComponent(imageId)}`, {
      method: "PUT",
      headers: { "Content-Type": "image/jpeg" },
      body: blob,
    });
    if (!res.ok) throw new Error(`drive_image_write_failed:${res.status}`);
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

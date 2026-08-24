import { get, set, del } from "idb-keyval";
import type { JournalEntry, JournalSettings, NoTradeLog } from "../types";

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

/* -------------------- Cloud placeholder (Google Drive) -------------------- */
/* eslint-disable @typescript-eslint/no-unused-vars */

/**
 * Shape of a future Google Drive–backed store. Intentionally unimplemented:
 * wiring it up requires an OAuth token flow on a trusted backend
 * (e.g. NextAuth route handlers + Drive REST API). The rest of the app
 * already speaks this interface, so enabling it is an isolated task.
 *
 * Suggested approach when ready:
 *   1. Add an OAuth provider server-side; expose /api/drive/token.
 *   2. Store journal JSON as a single appDataFolder file per user.
 *   3. Upload screenshots to a Drive folder; keep file ids in entry.images.
 */
export class GoogleDriveDataStore implements DataStore {
  readonly kind = "cloud" as const;

  constructor(private readonly getAccessToken: () => Promise<string>) {}

  async loadJournal(_userId: string): Promise<JournalPayload | null> {
    throw new Error("GoogleDriveDataStore is not configured yet. See src/lib/services/storage.ts.");
  }
  async saveJournal(_userId: string, _payload: JournalPayload): Promise<void> {
    throw new Error("GoogleDriveDataStore is not configured yet.");
  }
  async putImage(_imageId: string, _blob: Blob): Promise<void> {
    throw new Error("GoogleDriveDataStore is not configured yet.");
  }
  async getImage(_imageId: string): Promise<Blob | undefined> {
    throw new Error("GoogleDriveDataStore is not configured yet.");
  }
  async deleteImage(_imageId: string): Promise<void> {
    throw new Error("GoogleDriveDataStore is not configured yet.");
  }
  async estimateUsage(): Promise<number | null> {
    return null;
  }
}

/* eslint-enable @typescript-eslint/no-unused-vars */

/** Single switch point between backends. */
export function resolveStore(): DataStore {
  // const backend = process.env.NEXT_PUBLIC_STORAGE_BACKEND;
  // if (backend === "gdrive") return new GoogleDriveDataStore(getTokenFromSession);
  return new IdbDataStore();
}

export const dataStore: DataStore = resolveStore();

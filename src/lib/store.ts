"use client";

import { create } from "zustand";
import type { JournalEntry, JournalSettings } from "./types";
import { defaultSettings } from "./types";
import { dataStore, type JournalPayload } from "./services/storage";
import { auth, AuthError, type User } from "./services/auth";
import { dropImageUrl } from "./images";
import { uid } from "./utils";
import { generateDemoEntries } from "./seed";

export interface EntryDraft {
  date: string;
  pnl: number;
  rr: number | null;
  instrument: string;
  direction: "long" | "short" | null;
  setup: string;
  notes: string;
  images: JournalEntry["images"];
}

interface AppState {
  status: "loading" | "authenticated" | "guest";
  user: User | null;
  entries: JournalEntry[];
  settings: JournalSettings;

  init(): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  createEntry(draft: EntryDraft, blobs?: Map<string, Blob>): Promise<JournalEntry>;
  updateEntry(id: string, draft: EntryDraft, blobs?: Map<string, Blob>): Promise<JournalEntry>;
  deleteEntry(id: string): Promise<void>;

  updateSettings(patch: Partial<JournalSettings>): Promise<void>;
  replaceJournal(payload: JournalPayload): Promise<void>;
  exportPayload(): JournalPayload;
  loadDemoData(): Promise<void>;
  clearAllEntries(): Promise<void>;
}

async function persist(userId: string, entries: JournalEntry[], settings: JournalSettings) {
  await dataStore.saveJournal(userId, { entries, settings });
}

export const useApp = create<AppState>((set, get) => ({
  status: "loading",
  user: null,
  entries: [],
  settings: defaultSettings(),

  async init() {
    const user = await auth.getSession();
    if (!user) {
      set({ status: "guest", user: null, entries: [], settings: defaultSettings() });
      return;
    }
    const payload = (await dataStore.loadJournal(user.id)) ?? {
      entries: [],
      settings: defaultSettings(),
    };
    set({
      status: "authenticated",
      user,
      entries: payload.entries ?? [],
      settings: { ...defaultSettings(), ...payload.settings },
    });
  },

  async signUp(name, email, password) {
    try {
      const user = await auth.signUp(name, email, password);
      await persist(user.id, [], { ...defaultSettings(), traderName: user.name });
      set({ status: "authenticated", user, entries: [], settings: { ...defaultSettings(), traderName: user.name } });
    } catch (err) {
      if (err instanceof AuthError) throw err;
      throw new AuthError("storage", "Could not create the account on this device.");
    }
  },

  async signIn(email, password) {
    const user = await auth.signIn(email, password);
    const payload = (await dataStore.loadJournal(user.id)) ?? { entries: [], settings: defaultSettings() };
    set({
      status: "authenticated",
      user,
      entries: payload.entries ?? [],
      settings: { ...defaultSettings(), ...payload.settings },
    });
  },

  async signOut() {
    await auth.signOut();
    set({ status: "guest", user: null, entries: [], settings: defaultSettings() });
  },

  async createEntry(draft, blobs) {
    const { user, entries, settings } = get();
    if (!user) throw new Error("Not signed in");
    if (blobs) for (const [id, blob] of blobs) await dataStore.putImage(id, blob);

    const entry: JournalEntry = {
      id: uid("e"),
      ...draft,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...entries, entry];
    set({ entries: next });
    await persist(user.id, next, settings);
    return entry;
  },

  async updateEntry(id, draft, blobs) {
    const { user, entries, settings } = get();
    if (!user) throw new Error("Not signed in");

    const prev = entries.find((e) => e.id === id);
    if (!prev) throw new Error("Entry not found");

    // Remove image binaries that were detached during editing
    for (const img of prev.images) {
      if (!draft.images.some((i) => i.id === img.id)) {
        await dataStore.deleteImage(img.id);
        dropImageUrl(img.id);
      }
    }
    if (blobs) for (const [id2, blob] of blobs) await dataStore.putImage(id2, blob);

    const updated: JournalEntry = { ...prev, ...draft, updatedAt: Date.now() };
    const next = entries.map((e) => (e.id === id ? updated : e));
    set({ entries: next });
    await persist(user.id, next, settings);
    return updated;
  },

  async deleteEntry(id) {
    const { user, entries, settings } = get();
    if (!user) throw new Error("Not signed in");
    const target = entries.find((e) => e.id === id);
    if (target?.images.length) {
      for (const img of target.images) {
        await dataStore.deleteImage(img.id);
        dropImageUrl(img.id);
      }
    }
    const next = entries.filter((e) => e.id !== id);
    set({ entries: next });
    await persist(user.id, next, settings);
  },

  async updateSettings(patch) {
    const { user, entries, settings } = get();
    if (!user) return;
    const next = { ...settings, ...patch };
    set({ settings: next });
    await persist(user.id, entries, next);
  },

  async replaceJournal(payload) {
    const { user } = get();
    if (!user) throw new Error("Not signed in");
    const settings = { ...defaultSettings(), ...payload.settings };
    set({ entries: payload.entries ?? [], settings });
    await persist(user.id, payload.entries ?? [], settings);
  },

  exportPayload() {
    const { entries, settings } = get();
    return { entries, settings, exportedAt: Date.now() };
  },

  async loadDemoData() {
    const { user, settings } = get();
    if (!user) return;
    const demo = generateDemoEntries();
    set({ entries: demo, settings: { ...settings, startingEquity: 10000, targetEquity: 20000, maxDrawdown: 1500 } });
    await persist(user.id, demo, get().settings);
  },

  async clearAllEntries() {
    const { user, entries, settings } = get();
    if (!user) return;
    for (const e of entries) {
      for (const img of e.images) {
        await dataStore.deleteImage(img.id);
        dropImageUrl(img.id);
      }
    }
    set({ entries: [] });
    await persist(user.id, [], settings);
  },
}));

/* ------------------------------ helpers ------------------------------ */

/** Sort entries newest-first (call inside useMemo — never as a zustand selector,
 *  since returning a fresh array per call would loop useSyncExternalStore). */
export function sortEntriesNewestFirst(entries: JournalEntry[]): JournalEntry[] {
  return [...entries].sort(
    (a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt,
  );
}

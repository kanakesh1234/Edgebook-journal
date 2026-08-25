"use client";

import { create } from "zustand";
import type { Challenge, JournalEntry, JournalSettings, NoTradeLog, TradeReflection } from "./types";
import { defaultSettings, reviewStatusOf } from "./types";
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
  challengeId?: string;
  tradeNumber?: 1 | 2 | null;
  entryTime?: string;
  exitTime?: string;
  entryPrice?: number | null;
  exitPrice?: number | null;
  stopLoss?: number | null;
  takeProfit?: number | null;
  checklist?: JournalEntry["checklist"];
  review?: JournalEntry["review"];
  reviewStatus?: JournalEntry["reviewStatus"];
}

interface AppState {
  status: "loading" | "authenticated" | "guest";
  user: User | null;
  entries: JournalEntry[];
  settings: JournalSettings;
  /** Explicit "no trade" day records (discipline system). */
  dayLogs: NoTradeLog[];

  init(externalUser?: User): Promise<void>;
  /** Local (dev) session lookup — used by the bootstrap for the email/password path. */
  localSession(): Promise<User | null>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;

  createEntry(draft: EntryDraft, blobs?: Map<string, Blob>): Promise<JournalEntry>;
  updateEntry(id: string, draft: EntryDraft, blobs?: Map<string, Blob>): Promise<JournalEntry>;
  deleteEntry(id: string): Promise<void>;

  /** Attach or update the post-trade reflection on an entry. */
  saveReflection(entryId: string, reflection: TradeReflection): Promise<void>;
  /** Record a trading weekday without trades. */
  logNoTradeDay(date: string, reason?: string): Promise<void>;
  removeNoTradeDay(date: string): Promise<void>;

  saveChallenge(challenge: Challenge): Promise<void>;
  deleteChallenge(id: string): Promise<void>;
  /** Persist structured review data for an entry and refresh its review status. */
  saveTradeReview(entryId: string, patch: { review?: JournalEntry["review"]; checklist?: JournalEntry["checklist"]; reflection?: JournalEntry["reflection"]; reviewStatus?: JournalEntry["reviewStatus"] }): Promise<void>;
  updateSettings(patch: Partial<JournalSettings>): Promise<void>;
  replaceJournal(payload: JournalPayload): Promise<void>;
  exportPayload(): JournalPayload;
  loadDemoData(): Promise<void>;
}

async function persist(userId: string, entries: JournalEntry[], settings: JournalSettings, dayLogs: NoTradeLog[]) {
  await dataStore.saveJournal(userId, { entries, settings, dayLogs, version: 2 });
}

export const useApp = create<AppState>((set, get) => ({
  status: "loading",
  user: null,
  entries: [],
  settings: defaultSettings(),
  dayLogs: [],

  async init(externalUser?: User) {
    const user = externalUser ?? (await auth.getSession());
    if (!user) {
      set({ status: "guest", user: null, entries: [], settings: defaultSettings(), dayLogs: [] });
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
      dayLogs: payload.dayLogs ?? [],
    });
  },

  async localSession() {
    return auth.getSession();
  },

  async signUp(name, email, password) {
    try {
      const user = await auth.signUp(name, email, password);
      await persist(user.id, [], { ...defaultSettings(), traderName: user.name }, []);
      set({ status: "authenticated", user, entries: [], settings: { ...defaultSettings(), traderName: user.name }, dayLogs: [] });
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
      dayLogs: payload.dayLogs ?? [],
    });
  },

  async signOut() {
    // End any Google app session (server-side Drive authorization is
    // intentionally preserved and restored on next Google sign-in).
    try {
      await fetch("/api/auth/google/signout", { method: "POST" });
    } catch {
      /* offline dev — local signout still applies */
    }
    await auth.signOut();
    set({ status: "guest", user: null, entries: [], settings: defaultSettings(), dayLogs: [] });
  },

  async createEntry(draft, blobs) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    if (blobs) for (const [id, blob] of blobs) await dataStore.putImage(id, blob);

    const entry: JournalEntry = {
      id: uid("e"),
      ...draft,
      reviewStatus: draft.reviewStatus ?? "not_reviewed",
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    const next = [...entries, entry];
    set({ entries: next });
    // A traded day supersedes an explicit no-trade record.
    const nextDayLogs = dayLogs.some((d) => d.date === draft.date)
      ? dayLogs.filter((d) => d.date !== draft.date)
      : dayLogs;
    if (nextDayLogs !== dayLogs) set({ dayLogs: nextDayLogs });
    await persist(user.id, next, settings, nextDayLogs);
    return entry;
  },

  async updateEntry(id, draft, blobs) {
    const { user, entries, settings, dayLogs } = get();
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
    await persist(user.id, next, settings, dayLogs);
    return updated;
  },

  async deleteEntry(id) {
    const { user, entries, settings, dayLogs } = get();
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
    await persist(user.id, next, settings, dayLogs);
  },

  async saveReflection(entryId, reflection) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const prev = entries.find((e) => e.id === entryId);
    if (!prev) throw new Error("Entry not found");
    const updated: JournalEntry = { ...prev, reflection, updatedAt: Date.now() };
    const next = entries.map((e) => (e.id === entryId ? updated : e));
    set({ entries: next });
    await persist(user.id, next, settings, dayLogs);
  },

  async logNoTradeDay(date, reason) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    if (entries.some((e) => e.date === date)) return; // traded days are already journaled
    if (dayLogs.some((d) => d.date === date)) return;
    const next = [...dayLogs, { date, reason: reason?.trim() || undefined, createdAt: Date.now() }];
    set({ dayLogs: next });
    await persist(user.id, entries, settings, next);
  },

  async removeNoTradeDay(date) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const next = dayLogs.filter((d) => d.date !== date);
    set({ dayLogs: next });
    await persist(user.id, entries, settings, next);
  },

  async saveChallenge(challenge) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const challenges = [...(settings.challenges ?? []).filter((c) => c.id !== challenge.id), challenge];
    const next = { ...settings, challenges };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs);
  },

  async deleteChallenge(id) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const challenges = (settings.challenges ?? []).filter((c) => c.id !== id);
    const next = { ...settings, challenges };
    // Trades keep their challengeId (historical record); they simply render as "removed challenge".
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs);
  },

  async saveTradeReview(entryId, patch) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const prev = entries.find((e) => e.id === entryId);
    if (!prev) throw new Error("Entry not found");
    const updated: JournalEntry = {
      ...prev,
      review: { ...prev.review, ...patch.review },
      checklist: patch.checklist ?? prev.checklist,
      reflection: patch.reflection ?? prev.reflection,
      reviewStatus: patch.reviewStatus ?? reviewStatusOf({
        review: { ...prev.review, ...patch.review },
        reflection: patch.reflection ?? prev.reflection,
        images: prev.images,
        checklist: patch.checklist ?? prev.checklist,
      }),
      updatedAt: Date.now(),
    };
    const next = entries.map((e) => (e.id === entryId ? updated : e));
    set({ entries: next });
    await persist(user.id, next, settings, dayLogs);
  },

  async updateSettings(patch) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) return;
    const next = { ...settings, ...patch };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs);
  },

  async replaceJournal(payload) {
    const { user } = get();
    if (!user) throw new Error("Not signed in");
    const settings = { ...defaultSettings(), ...payload.settings };
    const dayLogs = payload.dayLogs ?? [];
    set({ entries: payload.entries ?? [], settings, dayLogs });
    await persist(user.id, payload.entries ?? [], settings, dayLogs);
  },

  exportPayload() {
    const { entries, settings, dayLogs } = get();
    return { entries, settings, dayLogs, version: 2, exportedAt: Date.now() };
  },

  async loadDemoData() {
    const { user, settings, dayLogs } = get();
    if (!user) return;
    const demo = generateDemoEntries();
    set({ entries: demo, settings: { ...settings, startingEquity: 10000, targetEquity: 20000, maxDrawdown: 1500 } });
    await persist(user.id, demo, get().settings, dayLogs);
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

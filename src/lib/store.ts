"use client";

import { create } from "zustand";
import type { Challenge, JournalEntry, JournalSettings, NoTradeLog, PlaybookSetup, TradePlan, TradeReflection } from "./types";
import { defaultSettings, reviewStatusOf } from "./types";
import { dataStore, type JournalPayload } from "./services/storage";
import { auth, AuthError, type User } from "./services/auth";
import { dropImageUrl } from "./images";
import { uid } from "./utils";
import { generateDemoEntries } from "./seed";
import { toast } from "@/components/ui/toast";

export interface EntryDraft {
  date: string;
  pnl: number;
  rr: number | null;
  instrument: string;
  direction: "long" | "short" | null;
  setup: string;
  /** Canonical playbook setup reference. */
  setupId?: string;
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
  quantity?: number | null;
  holdDuration?: string | null;
  checklist?: JournalEntry["checklist"];
  /** Canonical pre-trade execution checklist — captured before recording. */
  preTradeChecklist?: JournalEntry["preTradeChecklist"];
  review?: JournalEntry["review"];
  reviewStatus?: JournalEntry["reviewStatus"];
  planId?: string;
}

interface AppState {
  status: "loading" | "authenticated" | "guest";
  user: User | null;
  entries: JournalEntry[];
  settings: JournalSettings;
  /** Explicit "no trade" day records (discipline system). */
  dayLogs: NoTradeLog[];
  /** Pre-trade plans — "what I intend to do if my setup appears". */
  plans: TradePlan[];

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

  savePlan(plan: TradePlan): Promise<void>;
  deletePlan(id: string): Promise<void>;
  linkPlanToTrade(planId: string, tradeId: string): Promise<void>;
  saveChallenge(challenge: Challenge): Promise<void>;
  deleteChallenge(id: string): Promise<void>;
  /** Select the challenge the whole app (Home, calendar, MINATO) is scoped to. */
  setPrimaryChallenge(id: string | null): Promise<void>;
  /** Create or update a playbook setup (canonical setup entity). */
  saveSetup(setup: PlaybookSetup): Promise<void>;
  /** Delete a playbook setup. Trades keep their historical setup labels. */
  deleteSetup(id: string): Promise<void>;
  /** Bulk insert for CSV import — one persist instead of one per row. */
  createEntries(drafts: EntryDraft[]): Promise<JournalEntry[]>;
  /** Persist structured review data for an entry and refresh its review status. */
  saveTradeReview(entryId: string, patch: { review?: JournalEntry["review"]; checklist?: JournalEntry["checklist"]; reflection?: JournalEntry["reflection"]; reviewStatus?: JournalEntry["reviewStatus"] }): Promise<void>;
  updateSettings(patch: Partial<JournalSettings>): Promise<void>;
  replaceJournal(payload: JournalPayload): Promise<void>;
  exportPayload(): JournalPayload;
  loadDemoData(): Promise<void>;
  /**
   * Recover entryTime for trades imported before the CSV-import fix.
   * The old importer buried the correct NY entry time inside the notes
   * text (e.g. "entry 9:35 AM NY") instead of the structured entryTime
   * field. This re-extracts it from notes for any entry that's still
   * missing entryTime — no re-import or original file needed. Returns
   * the number of trades updated.
   */
  backfillEntryTimesFromNotes(): Promise<number>;
}

let _persistFailedAt = 0;
let _loadFailed = false;

/** True on the login/OAuth screens — data-layer toasts must never appear there. */
function onAuthScreen(): boolean {
  return typeof window !== "undefined" && window.location.pathname.startsWith("/login");
}

/** True when a persistence (Drive sync) failure happened at or after `since`. */
export function persistFailedSince(since: number): boolean {
  return _persistFailedAt >= since;
}

/**
 * True while the cloud journal could not be loaded. While set, ALL
 * persistence is blocked — otherwise an empty in-memory state could
 * overwrite good Drive data (the classic "refresh loses my trades" bug).
 */
export function hasLoadFailed(): boolean {
  return _loadFailed;
}

async function persist(userId: string, entries: JournalEntry[], settings: JournalSettings, dayLogs: NoTradeLog[], plans: TradePlan[]) {
  if (_loadFailed && dataStore.kind === "cloud") {
    // The authoritative cloud data was never loaded — saving now could
    // destroy it. Refuse honestly instead of pretending.
    if (!onAuthScreen()) {
      toast.error(
        "Save blocked — journal not loaded",
        "Google Drive data hasn't been loaded in this tab, so writing is disabled to protect your trades. Reload the page.",
      );
    }
    return;
  }
  try {
    await dataStore.saveJournal(userId, { entries, settings, dayLogs, plans, version: 2 });
    _persistFailedAt = 0;
  } catch (err) {
    // Known failure mode: drive_write_failed:<status> (e.g. 502 from Google).
    // The UI state is already updated — report the sync failure clearly and
    // keep the app usable. NEVER fake a successful cloud save.
    _persistFailedAt = Date.now();
    const status = err instanceof Error && err.message.includes(":") ? err.message.split(":")[1] : "";
    toast.error(
      "Google Drive sync failed",
      status
        ? `The change is visible here but was NOT saved to Drive (error ${status}). Try again in a moment.`
        : "The change is visible here but was NOT saved to the cloud. Check your connection and retry.",
    );
  }
}

export const useApp = create<AppState>((set, get) => ({
  status: "loading",
  user: null,
  entries: [],
  settings: defaultSettings(),
  dayLogs: [],
  plans: [],

  async init(externalUser?: User) {
    const user = externalUser ?? (await auth.getSession());
    if (!user) {
      set({ status: "guest", user: null, entries: [], settings: defaultSettings(), dayLogs: [], plans: [] });
      return;
    }
    let payload: { entries?: JournalEntry[]; settings?: JournalSettings; dayLogs?: NoTradeLog[]; plans?: TradePlan[] } | null = null;
    let loadError = false;
    try {
      payload = await dataStore.loadJournal(user.id);
      _loadFailed = false;
    } catch {
      // Drive read failed. Do NOT initialize with empty data as "usable":
      // persistence is now BLOCKED until a load succeeds, so the empty
      // view can never overwrite the cloud journal.
      loadError = true;
      _loadFailed = true;
      if (!onAuthScreen()) {
        toast.error(
          "Google Drive could not be read",
          "Showing an empty view for safety — changes are disabled until your journal loads. Reload to retry.",
        );
      }
    }
    if (loadError) return;
    // On load error the view initializes empty BUT every save stays blocked
    // by _loadFailed until a successful reload — no silent data loss.
    set({
      status: "authenticated",
      user,
      entries: payload?.entries ?? [],
      settings: { ...defaultSettings(), ...(payload?.settings ?? {}) },
      dayLogs: payload?.dayLogs ?? [],
      plans: payload?.plans ?? [],
    });
  },

  async localSession() {
    return auth.getSession();
  },

  async signUp(name, email, password) {
    try {
      const user = await auth.signUp(name, email, password);
      await persist(user.id, [], { ...defaultSettings(), traderName: user.name }, [], []);
      set({ status: "authenticated", user, entries: [], settings: { ...defaultSettings(), traderName: user.name }, dayLogs: [], plans: [] });
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
    try {
      await fetch("/api/auth/google/signout", { method: "POST" });
    } catch { /* offline */ }
    set({ status: "guest", user: null, entries: [], settings: defaultSettings(), dayLogs: [], plans: [] });
  },

  async createEntry(draft, blobs) {
    const { user, entries, settings, dayLogs, plans } = get();
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
    // Link the executed plan (plan ↔ trade, no duplication).
    let plansNext = plans;
    if (draft.planId) {
      plansNext = plans.map((p) =>
        p.id === draft.planId ? { ...p, status: "executed" as const, linkedTradeId: entry.id, updatedAt: Date.now() } : p,
      );
      if (plansNext !== plans) set({ plans: plansNext });
    }

    // A traded day supersedes an explicit no-trade record.
    const nextDayLogs = dayLogs.some((d) => d.date === draft.date)
      ? dayLogs.filter((d) => d.date !== draft.date)
      : dayLogs;
    if (nextDayLogs !== dayLogs) set({ dayLogs: nextDayLogs });
    await persist(user.id, next, settings, nextDayLogs, plansNext);
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
    await persist(user.id, next, settings, dayLogs, get().plans);
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
    await persist(user.id, next, settings, dayLogs, get().plans);
  },

  async saveReflection(entryId, reflection) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const prev = entries.find((e) => e.id === entryId);
    if (!prev) throw new Error("Entry not found");
    const updated: JournalEntry = { ...prev, reflection, updatedAt: Date.now() };
    const next = entries.map((e) => (e.id === entryId ? updated : e));
    set({ entries: next });
    await persist(user.id, next, settings, dayLogs, get().plans);
  },

  async logNoTradeDay(date, reason) {
    const { user, entries, settings, dayLogs, plans } = get();
    if (!user) throw new Error("Not signed in");
    if (entries.some((e) => e.date === date)) return; // traded days are already journaled
    if (dayLogs.some((d) => d.date === date)) return;
    const next = [...dayLogs, { date, reason: reason?.trim() || undefined, createdAt: Date.now() }];
    set({ dayLogs: next });
    await persist(user.id, entries, settings, next, plans);
  },

  async removeNoTradeDay(date) {
    const { user, entries, settings, dayLogs, plans } = get();
    if (!user) throw new Error("Not signed in");
    const next = dayLogs.filter((d) => d.date !== date);
    set({ dayLogs: next });
    await persist(user.id, entries, settings, next, plans);
  },

  async savePlan(plan) {
    const { user, entries, settings, dayLogs, plans } = get();
    if (!user) throw new Error("Not signed in");
    const exists = plans.some((p) => p.id === plan.id);
    const next = exists ? plans.map((p) => (p.id === plan.id ? plan : p)) : [...plans, plan];
    set({ plans: next });
    await persist(user.id, entries, settings, dayLogs, next);
  },

  async deletePlan(id) {
    const { user, entries, settings, dayLogs, plans } = get();
    if (!user) throw new Error("Not signed in");
    const next = plans.filter((p) => p.id !== id);
    set({ plans: next });
    await persist(user.id, entries, settings, dayLogs, next);
  },

  async linkPlanToTrade(planId, tradeId) {
    const { user, plans, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const next = plans.map((p) => (p.id === planId ? { ...p, status: "executed" as const, linkedTradeId: tradeId, updatedAt: Date.now() } : p));
    set({ plans: next });
    const entry = entries.find((e) => e.id === tradeId);
    if (entry) {
      const nextEntries = entries.map((e) => (e.id === tradeId ? { ...e, planId } : e));
      set({ entries: nextEntries });
      await persist(user.id, nextEntries, settings, dayLogs, next);
    } else {
      await persist(user.id, entries, settings, dayLogs, next);
    }
  },

  async saveChallenge(challenge) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const challenges = [...(settings.challenges ?? []).filter((c) => c.id !== challenge.id), challenge];
    const next = { ...settings, challenges };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs, get().plans);
  },

  async deleteChallenge(id) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const challenges = (settings.challenges ?? []).filter((c) => c.id !== id);
    // Deleting a challenge never touches journal trades — they keep their
    // challengeId as a historical record and render as "removed challenge".
    const next = {
      ...settings,
      challenges,
      primaryChallengeId: settings.primaryChallengeId === id ? null : settings.primaryChallengeId,
    };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs, get().plans);
  },

  async setPrimaryChallenge(id) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) return;
    const next = { ...settings, primaryChallengeId: id };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs, get().plans);
  },

  async saveSetup(setup) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const playbook = settings.playbook ?? [];
    const exists = playbook.some((s) => s.id === setup.id);
    const saved: PlaybookSetup = {
      ...setup,
      version: exists ? (setup.version ?? 1) + 1 : setup.version ?? 1,
      updatedAt: Date.now(),
      createdAt: setup.createdAt ?? Date.now(),
    };
    const nextPlaybook = exists ? playbook.map((s) => (s.id === setup.id ? saved : s)) : [...playbook, saved];
    const next = { ...settings, playbook: nextPlaybook };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs, get().plans);
  },

  async deleteSetup(id) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) throw new Error("Not signed in");
    const playbook = (settings.playbook ?? []).filter((s) => s.id !== id);
    const next = { ...settings, playbook };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs, get().plans);
  },

  async createEntries(drafts) {
    const { user, entries, settings, dayLogs, plans } = get();
    if (!user) throw new Error("Not signed in");
    if (drafts.length === 0) return [];
    const now = Date.now();
    const created: JournalEntry[] = drafts.map((draft, i) => ({
      id: uid(`e${now.toString(36)}-${i}`),
      ...draft,
      reviewStatus: draft.reviewStatus ?? "not_reviewed",
      createdAt: now + i,
      updatedAt: now + i,
    }));
    const next = [...entries, ...created];
    // A traded day supersedes an explicit no-trade record.
    const tradedDays = new Set(created.map((c) => c.date));
    const nextDayLogs = dayLogs.some((d) => tradedDays.has(d.date))
      ? dayLogs.filter((d) => !tradedDays.has(d.date))
      : dayLogs;
    set({ entries: next, ...(nextDayLogs !== dayLogs ? { dayLogs: nextDayLogs } : {}) });
    await persist(user.id, next, settings, nextDayLogs, plans);
    return created;
  },

  async backfillEntryTimesFromNotes() {
    const { user, entries, settings, dayLogs, plans } = get();
    if (!user) throw new Error("Not signed in");
    // Matches the exact text the old importer wrote: "entry 9:35 AM NY"
    // (12-hour, no leading zero, from formatNyTime) — convert to the
    // zero-padded 24-hour "HH:MM" that entryTime everywhere else expects.
    const pattern = /entry\s+(\d{1,2}):(\d{2})\s*(AM|PM)\s*NY/i;
    let changed = 0;
    const next = entries.map((e) => {
      if (e.entryTime || !e.notes) return e;
      const m = pattern.exec(e.notes);
      if (!m) return e;
      let h = Number(m[1]);
      const mm = m[2];
      const ampm = m[3].toUpperCase();
      if (ampm === "PM" && h < 12) h += 12;
      if (ampm === "AM" && h === 12) h = 0;
      changed++;
      return { ...e, entryTime: `${String(h).padStart(2, "0")}:${mm}`, updatedAt: Date.now() };
    });
    if (changed > 0) {
      set({ entries: next });
      await persist(user.id, next, settings, dayLogs, plans);
    }
    return changed;
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
    await persist(user.id, next, settings, dayLogs, get().plans);
  },

  async updateSettings(patch) {
    const { user, entries, settings, dayLogs } = get();
    if (!user) return;
    const next = { ...settings, ...patch };
    set({ settings: next });
    await persist(user.id, entries, next, dayLogs, get().plans);
  },

  async replaceJournal(payload) {
    const { user } = get();
    if (!user) throw new Error("Not signed in");
    const settings = { ...defaultSettings(), ...payload.settings };
    const dayLogs = payload.dayLogs ?? [];
    const plans = payload.plans ?? get().plans;
    set({ entries: payload.entries ?? [], settings, dayLogs, plans });
    await persist(user.id, payload.entries ?? [], settings, dayLogs, plans);
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
    await persist(user.id, demo, get().settings, dayLogs, get().plans);
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

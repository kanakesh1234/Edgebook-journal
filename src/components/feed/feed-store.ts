"use client";

/* ------------------------------------------------------------------ */
/*  Feed store                                                          */
/*                                                                      */
/*  UI state updates instantly (optimistic). Anything worth keeping —   */
/*  favorites, collections, preferences, milestones, progress — is      */
/*  written to settings.feed through the app's normal save path, which  */
/*  means Google Drive. Writes are debounced (each save uploads the     */
/*  whole journal) and flushed when the tab is hidden or the page is    */
/*  left. "Seen" markers stay on this device only.                      */
/* ------------------------------------------------------------------ */

import { useEffect } from "react";
import { create } from "zustand";
import { useApp, hasLoadFailed } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { uid } from "@/lib/utils";
import { toast } from "@/components/ui/toast";
import type { FeedKey, FeedPrefs, FeedState } from "@/lib/feed/types";
import {
  createCollection as mkCollection, deleteCollection as rmCollection, emptyFeedState, normalizeFeedState, pruneMissing,
  recordLessonOpened, recordReplayDone, recordView, renameCollection as renameCol, setPrefs as applyPrefs, toggleFavorite, toggleInCollection,
} from "@/lib/feed/state";
import { awardMilestones } from "@/lib/feed/milestones";

const SEEN_KEY = "edgebook.feed.seen.v1";
const SEEN_CAP = 600;
const SAVE_DELAY_MS = 1500;
/** A card seen this recently ranks lower, so each day starts fresh. */
export const SEEN_WINDOW_DAYS = 7;

type SeenMap = Record<FeedKey, string>;

function readSeen(): SeenMap {
  try {
    const v = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "{}") as unknown;
    return v && typeof v === "object" && !Array.isArray(v) ? (v as SeenMap) : {};
  } catch { return {}; }
}
function writeSeen(m: SeenMap) {
  const keys = Object.keys(m);
  if (keys.length > SEEN_CAP) for (const k of keys.sort((a, b) => (m[a] < m[b] ? -1 : 1)).slice(0, keys.length - SEEN_CAP)) delete m[k];
  try { localStorage.setItem(SEEN_KEY, JSON.stringify(m)); } catch { /* private mode: still works this session */ }
}

interface FeedStore {
  state: FeedState;
  hydratedFor: string | null;
  seen: SeenMap;
  /** A replay on the active card is playing — drives optional music. Never persisted. */
  replayPlaying: boolean;

  hydrate(userId: string, raw: unknown): void;
  toggleFavorite(key: FeedKey): boolean;
  createCollection(name: string, thenAdd?: FeedKey): { ok: true; id: string } | { ok: false; reason: "empty" | "duplicate" | "limit" };
  toggleInCollection(collectionId: string, key: FeedKey): void;
  renameCollection(id: string, name: string): void;
  deleteCollection(id: string): void;
  view(key: FeedKey): void;
  replayDone(key: FeedKey): void;
  lessonOpened(key: FeedKey): void;
  setPrefs(patch: Parameters<typeof applyPrefs>[1]): void;
  prune(exists: (key: FeedKey) => boolean): void;
  setReplayPlaying(v: boolean): void;
}

/** Apply a change, then check whether it earned a milestone (announced once, quietly). */
function commit(set: (p: Partial<FeedStore>) => void, next: FeedState) {
  const { state, earned } = awardMilestones(next, Date.now());
  set({ state });
  for (const m of earned) toast.celebrate(m.title, m.detail);
}

export const useFeed = create<FeedStore>((set, get) => ({
  state: emptyFeedState(),
  hydratedFor: null,
  seen: {},
  replayPlaying: false,

  hydrate(userId, raw) {
    if (get().hydratedFor === userId) return;
    set({ state: normalizeFeedState(raw), hydratedFor: userId, seen: readSeen() });
  },
  toggleFavorite(key) {
    const before = get().state;
    const next = toggleFavorite(before, key);
    if (next === before) { toast.info("Favorites are full", "Remove a few to save more."); return false; }
    commit(set, next);
    return next.favorites.includes(key);
  },
  createCollection(name, thenAdd) {
    const r = mkCollection(get().state, name, uid("col"), Date.now());
    if (!r.ok) return r;
    commit(set, thenAdd ? toggleInCollection(r.state, r.id, thenAdd) : r.state);
    return { ok: true, id: r.id };
  },
  toggleInCollection: (cid, key) => commit(set, toggleInCollection(get().state, cid, key)),
  renameCollection: (id, name) => commit(set, renameCol(get().state, id, name)),
  deleteCollection: (id) => commit(set, rmCollection(get().state, id)),

  view(key) {
    const today = todayKey();
    const seen = get().seen;
    if (seen[key] === today) return;
    const nextSeen = { ...seen, [key]: today };
    writeSeen(nextSeen);
    set({ seen: nextSeen });
    commit(set, recordView(get().state, today));
  },
  replayDone: (key) => commit(set, recordReplayDone(get().state, key, todayKey())),
  lessonOpened: (key) => commit(set, recordLessonOpened(get().state, key, todayKey())),
  setPrefs: (patch) => commit(set, applyPrefs(get().state, patch)),
  prune(exists) {
    const next = pruneMissing(get().state, exists);
    if (next !== get().state) set({ state: next });
  },
  setReplayPlaying: (v) => { if (get().replayPlaying !== v) set({ replayPlaying: v }); },
}));

/** Keys seen within the ranking window, for buildFeed(). */
export function recentSeen(seen: SeenMap, today: string): Set<FeedKey> {
  const cutoff = new Date(`${today}T12:00:00Z`).getTime() - SEEN_WINDOW_DAYS * 86_400_000;
  return new Set(Object.keys(seen).filter((k) => new Date(`${seen[k]}T12:00:00Z`).getTime() >= cutoff));
}

/* ------------------------------ Drive sync ------------------------------ */

/**
 * Mount once on the Feed screen. Loads settings.feed when the journal is ready, and saves changes back
 * (debounced). Saving goes through updateSettings(), the same guarded path as every other setting: if the
 * Drive load failed it refuses to write, so this can never overwrite good data with an empty state.
 */
export function useFeedSync() {
  const status = useApp((s) => s.status);
  const userId = useApp((s) => s.user?.id ?? null);
  const raw = useApp((s) => (s.settings as { feed?: unknown }).feed);

  useEffect(() => {
    if (status === "authenticated" && userId) useFeed.getState().hydrate(userId, raw);
    // Hydrate once per user — later settings changes come from this very store.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, userId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let lastSaved: FeedState = useFeed.getState().state;

    const save = () => {
      timer = null;
      const { state, hydratedFor } = useFeed.getState();
      if (!hydratedFor || state === lastSaved || hasLoadFailed()) return;
      lastSaved = state;
      void useApp.getState().updateSettings({ feed: state } as never);
    };
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(save, SAVE_DELAY_MS); };
    const flush = () => { if (timer) { clearTimeout(timer); save(); } };

    const unsub = useFeed.subscribe((s, prev) => {
      if (s.hydratedFor && prev.hydratedFor === s.hydratedFor && s.state !== prev.state) schedule();
      // First hydration is a load, not an edit.
      if (s.hydratedFor !== prev.hydratedFor) lastSaved = s.state;
    });
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      unsub();
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, []);

  return useFeed((s) => s.hydratedFor !== null);
}

/* Pure reducers for the persisted Feed state. No React, no I/O — everything is unit-tested. */

import type { FeedCollection, FeedDayStat, FeedKey, FeedPrefs, FeedProgress, FeedState } from "./types";

export const LIMITS = {
  favorites: 400,
  collections: 24,
  itemsPerCollection: 150,
  nameLength: 40,
  replays: 300,
  lessonsOpened: 300,
  dayHistory: 60,
  keyLength: 80,
} as const;

export const DEFAULT_PREFS: FeedPrefs = {
  dailyMinutes: 20,
  autoplayReplay: true,
  haptics: true,
  music: { enabled: false, source: "ambient-calm", volume: 0.35 },
};

export function emptyFeedState(): FeedState {
  return {
    v: 1,
    favorites: [],
    collections: [],
    progress: { day: {}, replays: [], lessonsOpened: [], totalCards: 0 },
    milestones: {},
    prefs: { ...DEFAULT_PREFS, music: { ...DEFAULT_PREFS.music } },
  };
}

/* ------------------------------ sanitising ------------------------------ */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const num = (v: unknown, d: number, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d;
const keyList = (v: unknown, cap: number): FeedKey[] => {
  if (!Array.isArray(v)) return [];
  const out: FeedKey[] = [];
  const seen = new Set<string>();
  for (const k of v) {
    if (typeof k !== "string" || !k || k.length > LIMITS.keyLength || seen.has(k)) continue;
    seen.add(k);
    out.push(k);
    if (out.length >= cap) break;
  }
  return out;
};
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Accepts anything (Drive data can be old, partial or hand-edited) and returns a valid, bounded state. */
export function normalizeFeedState(raw: unknown): FeedState {
  const base = emptyFeedState();
  if (!isObj(raw)) return base;

  const collections: FeedCollection[] = [];
  if (Array.isArray(raw.collections)) {
    const ids = new Set<string>();
    for (const c of raw.collections) {
      if (!isObj(c) || typeof c.id !== "string" || !c.id || ids.has(c.id)) continue;
      const name = typeof c.name === "string" ? c.name.trim().slice(0, LIMITS.nameLength) : "";
      if (!name) continue;
      ids.add(c.id);
      collections.push({ id: c.id, name, items: keyList(c.items, LIMITS.itemsPerCollection), createdAt: num(c.createdAt, 0) });
      if (collections.length >= LIMITS.collections) break;
    }
  }

  const day: Record<string, FeedDayStat> = {};
  const p = isObj(raw.progress) ? raw.progress : {};
  if (isObj(p.day)) {
    for (const [k, v] of Object.entries(p.day)) {
      if (!DAY.test(k) || !isObj(v)) continue;
      day[k] = { cards: num(v.cards, 0, 0, 1e6), replays: num(v.replays, 0, 0, 1e6), lessons: num(v.lessons, 0, 0, 1e6) };
    }
  }
  const progress: FeedProgress = {
    day,
    replays: keyList(p.replays, LIMITS.replays),
    lessonsOpened: keyList(p.lessonsOpened, LIMITS.lessonsOpened),
    totalCards: num(p.totalCards, 0, 0, 1e9),
  };

  const milestones: Record<string, number> = {};
  if (isObj(raw.milestones)) for (const [k, v] of Object.entries(raw.milestones)) if (k.length < 40 && typeof v === "number" && Number.isFinite(v)) milestones[k] = v;

  const pr = isObj(raw.prefs) ? raw.prefs : {};
  const m = isObj(pr.music) ? pr.music : {};
  const prefs: FeedPrefs = {
    dailyMinutes: num(pr.dailyMinutes, DEFAULT_PREFS.dailyMinutes, 0, 600),
    autoplayReplay: typeof pr.autoplayReplay === "boolean" ? pr.autoplayReplay : DEFAULT_PREFS.autoplayReplay,
    haptics: pr.haptics !== false,
    music: {
      enabled: m.enabled === true,
      source: typeof m.source === "string" && m.source.length < 60 ? m.source : DEFAULT_PREFS.music.source,
      volume: num(m.volume, DEFAULT_PREFS.music.volume, 0, 1),
    },
  };

  return trimProgress({ v: 1, favorites: keyList(raw.favorites, LIMITS.favorites), collections, progress, milestones, prefs });
}

/** Keep only the most recent `dayHistory` days. */
export function trimProgress(s: FeedState): FeedState {
  const days = Object.keys(s.progress.day).sort();
  if (days.length <= LIMITS.dayHistory) return s;
  const keep = new Set(days.slice(-LIMITS.dayHistory));
  const day: Record<string, FeedDayStat> = {};
  for (const k of keep) day[k] = s.progress.day[k];
  return { ...s, progress: { ...s.progress, day } };
}

/* ------------------------------ favorites ------------------------------ */

export const isFavorite = (s: FeedState, key: FeedKey) => s.favorites.includes(key);

/** Newest first. Returns the same state object when the cap blocks an add. */
export function toggleFavorite(s: FeedState, key: FeedKey): FeedState {
  if (s.favorites.includes(key)) return { ...s, favorites: s.favorites.filter((k) => k !== key) };
  if (s.favorites.length >= LIMITS.favorites) return s;
  return { ...s, favorites: [key, ...s.favorites] };
}

/* ----------------------------- collections ----------------------------- */

export type CollectionResult = { state: FeedState; ok: true; id: string } | { state: FeedState; ok: false; reason: "empty" | "duplicate" | "limit" };

export function createCollection(s: FeedState, name: string, id: string, now: number): CollectionResult {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, LIMITS.nameLength);
  if (!clean) return { state: s, ok: false, reason: "empty" };
  if (s.collections.some((c) => c.name.toLowerCase() === clean.toLowerCase())) return { state: s, ok: false, reason: "duplicate" };
  if (s.collections.length >= LIMITS.collections) return { state: s, ok: false, reason: "limit" };
  return { state: { ...s, collections: [...s.collections, { id, name: clean, items: [], createdAt: now }] }, ok: true, id };
}

export function renameCollection(s: FeedState, id: string, name: string): FeedState {
  const clean = name.trim().replace(/\s+/g, " ").slice(0, LIMITS.nameLength);
  if (!clean || s.collections.some((c) => c.id !== id && c.name.toLowerCase() === clean.toLowerCase())) return s;
  return { ...s, collections: s.collections.map((c) => (c.id === id ? { ...c, name: clean } : c)) };
}

export const deleteCollection = (s: FeedState, id: string): FeedState => ({ ...s, collections: s.collections.filter((c) => c.id !== id) });

export function toggleInCollection(s: FeedState, collectionId: string, key: FeedKey): FeedState {
  return {
    ...s,
    collections: s.collections.map((c) => {
      if (c.id !== collectionId) return c;
      if (c.items.includes(key)) return { ...c, items: c.items.filter((k) => k !== key) };
      if (c.items.length >= LIMITS.itemsPerCollection) return c;
      return { ...c, items: [key, ...c.items] };
    }),
  };
}

export const collectionsOf = (s: FeedState, key: FeedKey) => s.collections.filter((c) => c.items.includes(key));

/** Keys of everything the viewer saved anywhere (favorites + any collection). */
export function savedKeys(s: FeedState): Set<FeedKey> {
  const out = new Set<FeedKey>(s.favorites);
  for (const c of s.collections) for (const k of c.items) out.add(k);
  return out;
}

/** Drop references to items that no longer exist (deleted trades, lessons). Returns the same object if nothing changed. */
export function pruneMissing(s: FeedState, exists: (key: FeedKey) => boolean): FeedState {
  const favorites = s.favorites.filter(exists);
  let changed = favorites.length !== s.favorites.length;
  const collections = s.collections.map((c) => {
    const items = c.items.filter(exists);
    if (items.length !== c.items.length) { changed = true; return { ...c, items }; }
    return c;
  });
  return changed ? { ...s, favorites, collections } : s;
}

/* ------------------------------ progress ------------------------------ */

const bump = (s: FeedState, day: string, f: keyof FeedDayStat): FeedState => {
  const cur = s.progress.day[day] ?? { cards: 0, replays: 0, lessons: 0 };
  return trimProgress({ ...s, progress: { ...s.progress, day: { ...s.progress.day, [day]: { ...cur, [f]: cur[f] + 1 } } } });
};

/** Count one unique card view. The caller decides uniqueness (per device, per day). */
export function recordView(s: FeedState, day: string): FeedState {
  const withDay = bump(s, day, "cards");
  return { ...withDay, progress: { ...withDay.progress, totalCards: withDay.progress.totalCards + 1 } };
}

/** First completion of a replay counts; re-watching never inflates progress. */
export function recordReplayDone(s: FeedState, key: FeedKey, day: string): FeedState {
  if (s.progress.replays.includes(key) || s.progress.replays.length >= LIMITS.replays) return s;
  const b = bump(s, day, "replays");
  return { ...b, progress: { ...b.progress, replays: [...b.progress.replays, key] } };
}

export function recordLessonOpened(s: FeedState, key: FeedKey, day: string): FeedState {
  if (s.progress.lessonsOpened.includes(key) || s.progress.lessonsOpened.length >= LIMITS.lessonsOpened) return s;
  const b = bump(s, day, "lessons");
  return { ...b, progress: { ...b.progress, lessonsOpened: [...b.progress.lessonsOpened, key] } };
}

export const daysVisited = (s: FeedState) => Object.values(s.progress.day).filter((d) => d.cards + d.replays + d.lessons > 0).length;

export const setPrefs = (s: FeedState, patch: Partial<Omit<FeedPrefs, "music">> & { music?: Partial<FeedPrefs["music"]> }): FeedState => {
  const { music, ...rest } = patch;
  return normalizeFeedState({ ...s, prefs: { ...s.prefs, ...rest, music: { ...s.prefs.music, ...(music ?? {}) } } });
};

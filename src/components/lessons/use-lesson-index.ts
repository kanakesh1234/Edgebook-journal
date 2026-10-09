"use client";

/* ------------------------------------------------------------------ */
/*  Lesson index — a light, shared list of the lessons you can see.    */
/*                                                                      */
/*  The Journal only needs titles, covers and read times to link a     */
/*  trade to a lesson, so it asks the Lessons API for `?brief=1`       */
/*  (no article bodies, no comments). One request is shared by every   */
/*  component on the page and refreshed at most every 60 seconds.      */
/*  Lessons are never copied into the journal: a trade stores ids.     */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useMemo, useSyncExternalStore } from "react";
import type { LessonView } from "./types";

type State = { lessons: LessonView[] | null; failed: boolean; at: number };

const TTL = 60_000;
let state: State = { lessons: null, failed: false, at: 0 };
let inflight: Promise<void> | null = null;
const listeners = new Set<() => void>();

const emit = () => { for (const fn of listeners) fn(); };
const set = (next: State) => { state = next; emit(); };

function load(force = false): Promise<void> {
  if (inflight) return inflight;
  if (!force && state.lessons && Date.now() - state.at < TTL) return Promise.resolve();
  inflight = fetch("/api/lessons?brief=1", { cache: "no-store" })
    .then(async (r) => {
      if (!r.ok) throw new Error(String(r.status));
      const data = (await r.json()) as { lessons?: LessonView[] };
      set({ lessons: data.lessons ?? [], failed: false, at: Date.now() });
    })
    .catch(() => set({ lessons: state.lessons, failed: true, at: Date.now() }))
    .finally(() => { inflight = null; });
  return inflight;
}

/** Forget the cache (after a lesson is created, edited or deleted). */
export function invalidateLessonIndex() {
  state = { ...state, at: 0 };
}

const subscribe = (cb: () => void) => { listeners.add(cb); return () => { listeners.delete(cb); }; };
const getSnapshot = () => state;
const SERVER: State = { lessons: null, failed: false, at: 0 };
const getServerSnapshot = () => SERVER;

export function useLessonIndex() {
  const s = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  useEffect(() => { void load(); }, []);
  const reload = useCallback(() => load(true), []);
  const byId = useMemo(() => new Map((s.lessons ?? []).map((l) => [l.id, l])), [s.lessons]);
  return { lessons: s.lessons, byId, loading: s.lessons === null && !s.failed, failed: s.failed && s.lessons === null, reload };
}

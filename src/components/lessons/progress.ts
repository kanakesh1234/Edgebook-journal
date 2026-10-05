"use client";

/* ------------------------------------------------------------------ */
/*  Reading progress                                                    */
/*                                                                      */
/*  The Lessons API has no per-reader progress, so it is tracked on    */
/*  this device only (localStorage). It never leaves the browser and   */
/*  is never sent to Minato. Same external-store pattern as            */
/*  lib/theme.ts: stable snapshot, no work during subscribe.           */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react";
import type { ReadStatus } from "./types";

export interface ReadEntry {
  /** Furthest point reached, 0–1. */
  p: number;
  /** When the furthest point last advanced. */
  at: number;
  done?: boolean;
}
type Store = Record<string, ReadEntry>;

const KEY = "edgebook.lessons.progress.v1";
const MAX_ENTRIES = 300;
/** Reaching this far through a lesson counts as finishing it. */
export const READ_AT = 0.96;
/** Below this, a lesson is treated as not started. */
export const STARTED_AT = 0.03;

const EMPTY: Store = {};
let cache: Store = EMPTY;
let ready = false;
const listeners = new Set<() => void>();

function parse(): Store {
  try {
    const raw = localStorage.getItem(KEY);
    const v = raw ? (JSON.parse(raw) as unknown) : {};
    return v && typeof v === "object" && !Array.isArray(v) ? (v as Store) : {};
  } catch {
    return {};
  }
}

function emit() {
  for (const fn of listeners) fn();
}

function ensure() {
  if (ready || typeof window === "undefined") return;
  ready = true;
  cache = parse();
  // Keep other tabs in sync.
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      cache = parse();
      emit();
    }
  });
}

function persist(next: Store) {
  const keys = Object.keys(next);
  if (keys.length > MAX_ENTRIES) {
    keys.sort((a, b) => next[a].at - next[b].at);
    for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete next[k];
  }
  cache = next;
  try {
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* private mode — progress still works for this session */
  }
  emit();
}

/** Record how far a reader has got. Only ever moves forward. */
export function recordProgress(id: string, p: number) {
  ensure();
  const prev = cache[id];
  const clamped = Math.max(0, Math.min(1, p));
  if (!prev && clamped < STARTED_AT) return;
  const done = !!prev?.done || clamped >= READ_AT;
  const best = done ? 1 : Math.max(prev?.p ?? 0, clamped);
  // Ignore tiny moves so scrolling doesn't thrash storage.
  if (prev && !!prev.done === done && best - prev.p < 0.015) return;
  persist({ ...cache, [id]: { p: best, at: Date.now(), done } });
}

/** Forget progress for one lesson ("Mark as unread"). */
export function resetProgress(id: string) {
  ensure();
  if (!cache[id]) return;
  const next = { ...cache };
  delete next[id];
  persist(next);
}

/** Non-reactive read, for one-off checks inside effects. */
export function readEntry(id: string): ReadEntry | undefined {
  ensure();
  return cache[id];
}

export function statusOf(e: ReadEntry | undefined): ReadStatus {
  if (!e) return "unread";
  if (e.done) return "read";
  return e.p >= STARTED_AT ? "reading" : "unread";
}

function subscribe(cb: () => void) {
  ensure();
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}
const getSnapshot = () => {
  ensure();
  return cache;
};
const getServerSnapshot = () => EMPTY;

/** Reactive map of lesson id → progress. */
export function useReadProgress(): Store {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

"use client";

/* ------------------------------------------------------------------ */
/*  Theme controller — Light / Dark / System                           */
/*                                                                      */
/*  Resolution order: persisted choice → system preference → light.    */
/*  The resolved value is applied as data-theme on <html> by the       */
/*  no-flash script in app/layout.tsx (runs before first paint) and    */
/*  kept in sync here afterwards.                                      */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react";

export type ThemeChoice = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "edgebook.theme";

export interface ThemeState {
  /** What the user picked (or the default). */
  choice: ThemeChoice;
  /** What is actually rendered right now. */
  resolved: ResolvedTheme;
}

let snapshot: ThemeState = { choice: "system", resolved: "light" };
const listeners = new Set<() => void>();
let mediaSubscribed = false;

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function readStoredChoice(): ThemeChoice {
  if (typeof window === "undefined") return "system";
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw === "light" || raw === "dark" ? raw : "system";
  } catch {
    return "system";
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice === "system") return systemPrefersDark() ? "dark" : "light";
  return choice;
}

/** Apply the resolved theme to <html> and refresh the snapshot. */
function apply(choice: ThemeChoice): ResolvedTheme {
  const resolved = resolve(choice);
  document.documentElement.dataset.theme = resolved;
  const next = { choice, resolved };
  const changed = next.choice !== snapshot.choice || next.resolved !== snapshot.resolved;
  snapshot = next;
  return changed ? resolved : resolved; // resolution always returned
}

function notify() {
  for (const fn of listeners) fn();
}

function ensureMediaWatch() {
  if (mediaSubscribed || typeof window === "undefined") return;
  mediaSubscribed = true;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (snapshot.choice === "system") {
      apply("system");
      notify();
    }
  });
}

function subscribe(cb: () => void): () => void {
  ensureMediaWatch();
  listeners.add(cb);
  // Re-apply on mount so a stale server snapshot never lingers.
  apply(snapshot.choice);
  notify();
  return () => listeners.delete(cb);
}

function getSnapshot(): ThemeState {
  return snapshot;
}

function getServerSnapshot(): ThemeState {
  return { choice: "system", resolved: "light" };
}

/** Persist a new choice and apply it immediately. */
export function setThemeChoice(choice: ThemeChoice) {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    /* private mode — theme still applies for this session */
  }
  apply(choice);
  notify();
}

/** Reactive theme state for components. */
export function useTheme(): ThemeState & { setChoice: (c: ThemeChoice) => void } {
  const state = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return { ...state, setChoice: setThemeChoice };
}

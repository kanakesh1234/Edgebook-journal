"use client";

/* ------------------------------------------------------------------ */
/*  EJ workspace UI preferences — per device, never touches trading    */
/*  state.  Same external-store pattern as appearance.ts.              */
/*                                                                      */
/*  localStorage keys                                                    */
/*    ej.backtest.favorites      { v:1, tools: string[] }               */
/*    ej.backtest.favorites.ui   { visible, autoHide, compact, vertical, */
/*                                  pos: {x,y}|null }                    */
/*    ej.backtest.rail           "open" | "hidden"                       */
/*    ej.backtest.lastTools      { [groupId]: toolId }                   */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react";

export type RailMode = "open" | "hidden";

export interface FavUI {
  /** Hidden until the user turns it on. */
  visible: boolean;
  /** Fade to 35% while the pointer is away / replay is playing. */
  autoHide: boolean;
  /** Icons only (true) or icons + labels (false). */
  compact: boolean;
  vertical: boolean;
  /** Position as a 0..1 fraction of the free space inside the chart stage (null = default dock). */
  pos: { x: number; y: number } | null;
}

export interface UiPrefs {
  rail: RailMode;
  lastTool: Record<string, string>;
  favTools: string[];
  fav: FavUI;
}

export const DEFAULT_FAVORITES: readonly string[] = [
  "crosshair", "trend-line", "horizontal-line", "fib-retracement", "rectangle", "long-position", "measure", "text",
];

export const DEFAULT_FAV_UI: FavUI = { visible: false, autoHide: true, compact: true, vertical: false, pos: null };

const DEFAULTS: UiPrefs = {
  rail: "open",
  lastTool: {},
  favTools: [...DEFAULT_FAVORITES],
  fav: DEFAULT_FAV_UI,
};

const K_FAV = "ej.backtest.favorites";
const K_FAV_UI = "ej.backtest.favorites.ui";
const K_RAIL = "ej.backtest.rail";
const K_LAST = "ej.backtest.lastTools";

let snap: UiPrefs = DEFAULTS;
let loaded = false;
const subs = new Set<() => void>();

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function write(key: string, v: unknown) {
  try { localStorage.setItem(key, JSON.stringify(v)); } catch { /* private mode / quota */ }
}

const isFrac = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n) && n >= 0 && n <= 1;

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  const favRaw = read<{ v?: number; tools?: unknown }>(K_FAV);
  const favTools = Array.isArray(favRaw?.tools) ? (favRaw!.tools as unknown[]).filter((x): x is string => typeof x === "string") : null;
  const ui = read<Partial<FavUI>>(K_FAV_UI) ?? {};
  const rail = read<string>(K_RAIL);
  const last = read<Record<string, string>>(K_LAST);
  snap = {
    rail: rail === "hidden" ? "hidden" : "open",
    lastTool: last && typeof last === "object" ? last : {},
    favTools: favTools ?? [...DEFAULT_FAVORITES],
    fav: {
      visible: ui.visible === true,
      autoHide: ui.autoHide !== false,
      compact: ui.compact !== false,
      vertical: ui.vertical === true,
      pos: ui.pos && isFrac(ui.pos.x) && isFrac(ui.pos.y) ? { x: ui.pos.x, y: ui.pos.y } : null,
    },
  };
}

function emit() { subs.forEach((f) => f()); }
function subscribe(cb: () => void) { subs.add(cb); return () => { subs.delete(cb); }; }
function get(): UiPrefs { load(); return snap; }

/** Subscribe to a slice. The selector must return a referentially stable value for an unchanged slice. */
export function useUiPrefs<T>(sel: (p: UiPrefs) => T): T {
  return useSyncExternalStore(subscribe, () => sel(get()), () => sel(DEFAULTS));
}
export const getUiPrefs = (): UiPrefs => get();

/* ---------------------------- mutations ---------------------------- */

export function setRail(rail: RailMode) {
  load();
  snap = { ...snap, rail };
  write(K_RAIL, rail);
  emit();
}

export function setLastTool(groupId: string, toolId: string) {
  load();
  if (snap.lastTool[groupId] === toolId) return;
  snap = { ...snap, lastTool: { ...snap.lastTool, [groupId]: toolId } };
  write(K_LAST, snap.lastTool);
  emit();
}

export function setFavorites(tools: string[]) {
  load();
  // de-dupe, keep order
  const next = tools.filter((t, i) => tools.indexOf(t) === i);
  snap = { ...snap, favTools: next };
  write(K_FAV, { v: 1, tools: next });
  emit();
}

export function resetFavorites() { setFavorites([...DEFAULT_FAVORITES]); }

export function setFavUI(patch: Partial<FavUI>) {
  load();
  snap = { ...snap, fav: { ...snap.fav, ...patch } };
  write(K_FAV_UI, snap.fav);
  emit();
}

/* ------------------------- pure list helpers ------------------------ */

/** Move item at `from` to index `to` (both clamped). Returns a new array. */
export function reorder<T>(list: readonly T[], from: number, to: number): T[] {
  const out = list.slice();
  if (from < 0 || from >= out.length) return out;
  const [it] = out.splice(from, 1);
  out.splice(Math.max(0, Math.min(out.length, to)), 0, it);
  return out;
}

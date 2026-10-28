"use client";

/* ------------------------------------------------------------------ */
/*  Chart appearance (Settings → Symbol / Canvas in TradingView terms) */
/*  Stored on this device, shared by every session.                     */
/*  Defaults follow the Edgebook theme: green + black candles on a       */
/*  warm white canvas (dark mode: warm dark canvas, light down candles). */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react";

export interface ChartAppearance {
  /** null = follow the app theme (TradingView dark #131722 / light #FFFFFF). */
  background: string | null;
  /** null = Edgebook default for the current theme (green up / black down; light-on-dark in dark mode). */
  upColor: string | null;
  downColor: string | null;
  wickUp: string | null;
  wickDown: string | null;
  borderUp: string | null;
  borderDown: string | null;
  gridVertical: boolean;
  gridHorizontal: boolean;
  showLegend: boolean;
  showTradePill: boolean;
}

export const DEFAULT_APPEARANCE: ChartAppearance = {
  background: null,
  upColor: null,
  downColor: null,
  wickUp: null,
  wickDown: null,
  borderUp: null,
  borderDown: null,
  gridVertical: true,
  gridHorizontal: true,
  showLegend: true,
  showTradePill: true,
};

const KEY = "edgebook.backtesting.appearance.v1";
let snapshot: ChartAppearance = DEFAULT_APPEARANCE;
let loaded = false;
const listeners = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) snapshot = { ...DEFAULT_APPEARANCE, ...JSON.parse(raw) };
  } catch { /* corrupt / blocked storage → defaults */ }
}

export function setAppearance(patch: Partial<ChartAppearance>) {
  load();
  snapshot = { ...snapshot, ...patch };
  try { localStorage.setItem(KEY, JSON.stringify(snapshot)); } catch { /* ignore */ }
  for (const l of listeners) l();
}

export function resetAppearance() {
  snapshot = DEFAULT_APPEARANCE;
  try { localStorage.removeItem(KEY); } catch { /* ignore */ }
  for (const l of listeners) l();
}

function subscribe(cb: () => void) {
  load();
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function useChartAppearance(): ChartAppearance {
  // Client-side snapshot loads lazily; server snapshot is the stable default.
  return useSyncExternalStore(subscribe, () => { load(); return snapshot; }, () => DEFAULT_APPEARANCE);
}

/** Site surface colours (globals.css --raised / dark surface). */
export const DEFAULT_BG = { light: "#fffefb", dark: "#1c1813" };

const DEFAULT_CANDLES = {
  light: { up: "#2e8b57", down: "#15130f" },
  dark: { up: "#5fb47f", down: "#e9e4d8" },
};

/** Resolved candle colours: the user's pick, else the Edgebook default for the theme. */
export function candleColorsFor(theme: "light" | "dark", a: ChartAppearance) {
  const d = DEFAULT_CANDLES[theme];
  const up = a.upColor ?? d.up, down = a.downColor ?? d.down;
  return {
    up, down,
    borderUp: a.borderUp ?? up, borderDown: a.borderDown ?? down,
    wickUp: a.wickUp ?? up, wickDown: a.wickDown ?? down,
  };
}

/** TradingView's own palettes for the two app themes. */
export function paletteFor(theme: "light" | "dark", a: ChartAppearance) {
  const dark = theme === "dark";
  const bg = a.background ?? (dark ? DEFAULT_BG.dark : DEFAULT_BG.light);
  // Pick readable text/grid for whatever background the user chose.
  const lum = luminance(bg);
  const darkBg = lum < 0.45;
  return {
    bg,
    darkBg,
    text: darkBg ? "#e9e4d8" : "#26221a",
    grid: darkBg ? "rgba(233,228,216,0.07)" : "rgba(38,34,26,0.07)",
    border: darkBg ? "#3a342a" : "#e7e1d4",
    crosshair: darkBg ? "#9598A1" : "#9598A1",
    crosshairLabel: darkBg ? "#363A45" : "#131722",
  };
}

function luminance(hex: string): number {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim()) || /^#?([0-9a-f]{3})$/i.exec(hex.trim());
  if (!m) return 0;
  let h = m[1];
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const n = parseInt(h, 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

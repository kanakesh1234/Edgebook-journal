"use client";

/* ------------------------------------------------------------------ */
/*  Chart appearance (Settings → Symbol / Canvas in TradingView terms) */
/*  Stored on this device, shared by every session.                     */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react";

export interface ChartAppearance {
  /** null = follow the app theme (TradingView dark #131722 / light #FFFFFF). */
  background: string | null;
  upColor: string;
  downColor: string;
  wickUp: string;
  wickDown: string;
  borderUp: string;
  borderDown: string;
  gridVertical: boolean;
  gridHorizontal: boolean;
  showLegend: boolean;
  showTradePill: boolean;
}

export const DEFAULT_APPEARANCE: ChartAppearance = {
  background: null,
  upColor: "#089981",
  downColor: "#F23645",
  wickUp: "#089981",
  wickDown: "#F23645",
  borderUp: "#089981",
  borderDown: "#F23645",
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

/** TradingView's own palettes for the two app themes. */
export function paletteFor(theme: "light" | "dark", a: ChartAppearance) {
  const dark = theme === "dark";
  const bg = a.background ?? (dark ? "#131722" : "#FFFFFF");
  // Pick readable text/grid for whatever background the user chose.
  const lum = luminance(bg);
  const darkBg = lum < 0.45;
  return {
    bg,
    darkBg,
    text: darkBg ? "#D1D4DC" : "#131722",
    grid: darkBg ? "rgba(42,46,57,0.9)" : "rgba(42,46,57,0.1)",
    border: darkBg ? "#2A2E39" : "#E0E3EB",
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

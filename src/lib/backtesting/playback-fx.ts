"use client";

/* ------------------------------------------------------------------ */
/*  EJ playback FX — purely visual candle formation settings + maths.   */
/*  The trading engine never reads anything from here: fills, P&L and  */
/*  stops are always computed on the final bar, so animation can't      */
/*  change a single trading result.                                     */
/* ------------------------------------------------------------------ */

import { useSyncExternalStore } from "react";

export type FormationMode = "off" | "smooth" | "natural";

const KEY = "ej.backtest.formation";
let mode: FormationMode = "natural";
let loaded = false;
const subs = new Set<() => void>();

function load() {
  if (loaded || typeof window === "undefined") return;
  loaded = true;
  try {
    const v = window.localStorage.getItem(KEY);
    if (v === "off" || v === "smooth" || v === "natural") mode = v;
  } catch { /* storage unavailable */ }
}

export const getFormationMode = (): FormationMode => { load(); return mode; };

export function setFormationMode(m: FormationMode) {
  load();
  mode = m;
  try { window.localStorage.setItem(KEY, m); } catch { /* ignore */ }
  subs.forEach((f) => f());
}

export function useFormationMode(): FormationMode {
  return useSyncExternalStore(
    (cb) => { subs.add(cb); return () => { subs.delete(cb); }; },
    getFormationMode,
    () => "natural" as FormationMode,
  );
}

/* ---------------- intra-bar price path ---------------- */

export interface Ohlc { open: number; high: number; low: number; close: number }
export interface PricePath { pts: number[]; cum: number[] }

function rng(seed: number) {
  let s = (seed | 0) >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}

/** O→L→H→C for up bars, O→H→L→C for down bars (natural mode flips ~1 in 4 and adds small retraces). */
export function buildPath(c: Ohlc, seed: number, m: "smooth" | "natural"): PricePath {
  const r = rng(seed);
  const range = c.high - c.low;
  const up = c.close >= c.open;
  const flip = m === "natural" && r() < 0.25;
  const first = (up ? !flip : flip) ? c.low : c.high;
  const second = first === c.low ? c.high : c.low;
  const raw = [c.open, first, second, c.close];

  const pts: number[] = [raw[0]];
  for (let i = 1; i < raw.length; i++) {
    const a = pts[pts.length - 1], b = raw[i];
    if (m === "natural" && range > 0 && Math.abs(b - a) > range * 0.35) {
      const f = 0.4 + r() * 0.25;
      const wobble = (r() - 0.5) * 0.28 * Math.abs(b - a);
      pts.push(Math.min(c.high, Math.max(c.low, a + (b - a) * f - wobble)));
    }
    pts.push(b);
  }

  const cum: number[] = [0];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const d = Math.abs(pts[i] - pts[i - 1]);
    const jitter = m === "natural" ? 0.75 + r() * 0.5 : 1;
    total += (d + range * 0.12 + 1e-9) * jitter;
    cum.push(total);
  }
  for (let i = 0; i < cum.length; i++) cum[i] /= total || 1;
  return { pts, cum };
}

const ease = (t: number) => t * t * t * (t * (t * 6 - 15) + 10); // smootherstep: zero velocity AND acceleration at each turn

/** Forming bar at progress p ∈ [0,1]: running high/low always include everything printed so far. */
export function sampleBar(c: Ohlc, path: PricePath, p: number): Ohlc {
  if (p >= 1) return { open: c.open, high: c.high, low: c.low, close: c.close };
  const { pts, cum } = path;
  let seg = 1;
  while (seg < cum.length - 1 && cum[seg] < p) seg++;
  const t0 = cum[seg - 1], t1 = cum[seg];
  const t = t1 > t0 ? Math.min(1, Math.max(0, (p - t0) / (t1 - t0))) : 1;
  const price = pts[seg - 1] + (pts[seg] - pts[seg - 1]) * ease(t);
  let hi = c.open, lo = c.open;
  for (let i = 0; i < seg; i++) { hi = Math.max(hi, pts[i]); lo = Math.min(lo, pts[i]); }
  hi = Math.max(hi, price); lo = Math.min(lo, price);
  return { open: c.open, high: Math.min(hi, c.high), low: Math.max(lo, c.low), close: price };
}

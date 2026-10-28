/* Pure replay math for the Feed's inline chart replays. The window, symbol and scripted trade come from
   planJournalReplay (the same planner the full replay workspace uses); candles come from loadSymbolCandles. */

import type { CandleData } from "../backtesting/data/types";
import type { ReplayTradeRef } from "../backtesting/types";

/** Bars of setup already drawn on the chart when a replay opens, so candles look large and focused before it plays. */
export const CONTEXT_BARS = 10;
/** Playback itself starts this many bars before the entry. */
export const LEAD_BARS = 2;
export const SPEEDS = [1, 2, 4] as const;
export type Speed = (typeof SPEEDS)[number];
/** Milliseconds per bar at 1× — deliberate, unhurried Apple-grade cadence for smooth 60fps candle formation. */
export const BASE_BAR_MS = 1200;
/** Delay (ms) after a card snaps into the active viewport before playback begins so the scroll transition settles. */
export const INITIAL_PLAY_DELAY_MS = 600;
/** Hold duration (ms) on the final bar before seamlessly looping back to the setup. */
export const LOOP_HOLD_MS = 1600;
export const barDelay = (speed: Speed) => Math.round(BASE_BAR_MS / speed);

export interface ReplayModel {
  candles: CandleData[];
  /** First bar shown on the chart (context before playback). */
  viewFrom: number;
  /** First bar of playback. */
  startIdx: number;
  entryIdx: number;
  exitIdx: number;
  lastIdx: number;
  dir: 1 | -1;
  entry: number;
  stop: number | null;
  target: number | null;
  exit: number | null;
  /** True when the journal had no recorded exit, so the end is a stand-in. */
  exitEstimated: boolean;
}

/** Index of the last candle with time <= t, or -1. Candles are sorted ascending. */
export function indexAtOrBefore(candles: CandleData[], t: number): number {
  let lo = 0, hi = candles.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (candles[mid].time <= t) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

export function buildReplayModel(candles: CandleData[], ref: ReplayTradeRef): ReplayModel | null {
  if (candles.length < 3) return null;
  const entryIdx = indexAtOrBefore(candles, ref.entryUtc);
  if (entryIdx < 0) return null;
  const exitFound = ref.exitUtc != null ? indexAtOrBefore(candles, ref.exitUtc) : -1;
  const lastIdx = candles.length - 1;
  const exitEstimated = exitFound <= entryIdx;
  const exitIdx = exitEstimated ? Math.min(lastIdx, entryIdx + 15) : exitFound;
  const entry = ref.entryPrice ?? candles[entryIdx].close;
  return {
    candles,
    viewFrom: Math.max(0, entryIdx - CONTEXT_BARS),
    startIdx: Math.max(0, entryIdx - LEAD_BARS),
    entryIdx,
    exitIdx,
    lastIdx,
    dir: ref.side === "buy" ? 1 : -1,
    entry,
    stop: ref.stopLoss ?? null,
    target: ref.takeProfit ?? null,
    exit: ref.exitPrice ?? null,
    exitEstimated,
  };
}

export type Phase = "setup" | "open" | "closed";

export interface Frame {
  idx: number;
  phase: Phase;
  price: number;
  /** Points in the trade's favour (negative = against). null before entry. */
  openPts: number | null;
  /** Multiples of initial risk. null before entry or when no stop was recorded. */
  openR: number | null;
  done: boolean;
}

export function frameAt(m: ReplayModel, rawIdx: number): Frame {
  const idx = Math.min(m.lastIdx, Math.max(m.startIdx, Math.round(rawIdx)));
  const price = m.candles[idx].close;
  const phase: Phase = idx < m.entryIdx ? "setup" : idx < m.exitIdx ? "open" : "closed";
  if (phase === "setup") return { idx, phase, price, openPts: null, openR: null, done: false };
  const mark = phase === "closed" && m.exit != null ? m.exit : price;
  const openPts = (mark - m.entry) * m.dir;
  const risk = m.stop != null ? Math.abs(m.entry - m.stop) : 0;
  return { idx, phase, price, openPts, openR: risk > 0 ? openPts / risk : null, done: phase === "closed" };
}

/** Where playback stops: the exit bar plus a short tail so the outcome is visible. */
export const endIdx = (m: ReplayModel) => Math.min(m.lastIdx, m.exitIdx + 3);

export const stepIdx = (m: ReplayModel, idx: number, dir: 1 | -1) => Math.min(endIdx(m), Math.max(m.startIdx, idx + dir));

/** 0–1 position of idx within the playable range. */
export function progressOf(m: ReplayModel, idx: number): number {
  const span = endIdx(m) - m.startIdx;
  return span <= 0 ? 1 : Math.min(1, Math.max(0, (idx - m.startIdx) / span));
}

export const idxFromProgress = (m: ReplayModel, p: number) => Math.round(m.startIdx + Math.min(1, Math.max(0, p)) * (endIdx(m) - m.startIdx));

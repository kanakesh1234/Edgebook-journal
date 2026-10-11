/* ------------------------------------------------------------------ */
/*  Projector — converts between (time, price) and screen pixels.      */
/*                                                                      */
/*  lightweight-charts can only place things on bars it has data for,  */
/*  but drawings (rays, forecasts, position tools) live in the future  */
/*  too. So time → fractional bar index (extrapolated past the ends),  */
/*  and bar index → pixel via the chart's own logical scale.           */
/* ------------------------------------------------------------------ */

import type { IChartApi, ISeriesApi, Logical, SeriesType } from "lightweight-charts";
import type { CandleData } from "@/lib/backtesting/data/types";
import type { Pt } from "@/lib/backtesting/drawings/geometry";

export interface ProjectorDeps {
  chart: IChartApi;
  series: ISeriesApi<SeriesType>;
  /** Sorted bar times (seconds) — history + replayed + not-yet-revealed bars. */
  getTimes: () => number[];
  /** Nominal bar length in seconds, used to extrapolate beyond the data. */
  getBarSec: () => number;
  /** Bars currently drawn (for the magnet). */
  getCandles: () => CandleData[];
}

export type MagnetMode = "off" | "weak" | "strong";

export class Projector {
  private d: ProjectorDeps;
  constructor(d: ProjectorDeps) { this.d = d; }

  /* ---------------- time <-> logical (bar index) ---------------- */

  timeToLogical(t: number): number {
    const times = this.d.getTimes();
    const n = times.length;
    const bar = this.d.getBarSec() || 60;
    if (n === 0) return 0;
    if (t <= times[0]) return (t - times[0]) / bar;
    if (t >= times[n - 1]) return n - 1 + (t - times[n - 1]) / bar;
    let lo = 0, hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (times[mid] <= t) lo = mid; else hi = mid;
    }
    const span = times[hi] - times[lo];
    return span > 0 ? lo + (t - times[lo]) / span : lo;
  }

  logicalToTime(l: number): number {
    const times = this.d.getTimes();
    const n = times.length;
    const bar = this.d.getBarSec() || 60;
    if (n === 0) return 0;
    if (l <= 0) return Math.round(times[0] + l * bar);
    if (l >= n - 1) return Math.round(times[n - 1] + (l - (n - 1)) * bar);
    const i = Math.floor(l);
    return Math.round(times[i] + (l - i) * (times[i + 1] - times[i]));
  }

  /* ---------------- data -> pixels ---------------- */

  logicalToX(l: number): number | null {
    return this.d.chart.timeScale().logicalToCoordinate(l as Logical);
  }
  toX(t: number): number | null { return this.logicalToX(this.timeToLogical(t)); }
  toY(price: number): number | null { return this.d.series.priceToCoordinate(price); }
  toPt(time: number, price: number): Pt | null {
    const x = this.toX(time), y = this.toY(price);
    return x === null || y === null ? null : { x, y };
  }

  /* ---------------- pixels -> data ---------------- */

  xToLogical(x: number): number | null { return this.d.chart.timeScale().coordinateToLogical(x); }
  /** Pixel → bar time, snapped to the nearest bar (TradingView anchors points to bars). */
  xToTime(x: number): number | null {
    const l = this.xToLogical(x);
    return l === null ? null : this.logicalToTime(Math.round(l));
  }
  yToPrice(y: number): number | null { return this.d.series.coordinateToPrice(y); }

  /** Pixel width of one bar. */
  pxPerBar(): number {
    const a = this.logicalToX(0), b = this.logicalToX(1);
    return a !== null && b !== null && b !== a ? Math.abs(b - a) : 8;
  }

  paneSize(): { w: number; h: number } {
    const s = this.d.chart.paneSize();
    return { w: s.width, h: s.height };
  }

  get barSec(): number { return this.d.getBarSec() || 60; }

  /**
   * Resolve a pointer position to an anchor (time, price). With the magnet on,
   * the price jumps to the nearest O/H/L/C of the bar under the cursor.
   */
  snap(x: number, y: number, magnet: MagnetMode, tick: number): { time: number; price: number } | null {
    const logical = this.xToLogical(x);
    const rawPrice = this.yToPrice(y);
    if (logical === null || rawPrice === null) return null;
    const idx = Math.round(logical);
    const time = this.logicalToTime(idx);
    let price = tick > 0 ? Math.round(rawPrice / tick) * tick : rawPrice;
    if (magnet !== "off") {
      const times = this.d.getTimes();
      const candles = this.d.getCandles();
      const bar = times[idx] !== undefined ? candles.find((c) => c.time === times[idx]) : undefined;
      if (bar) {
        let best: number | null = null, bestDist = Infinity;
        for (const p of [bar.open, bar.high, bar.low, bar.close]) {
          const py = this.toY(p);
          if (py === null) continue;
          const dd = Math.abs(py - y);
          if (dd < bestDist) { bestDist = dd; best = p; }
        }
        if (best !== null && (magnet === "strong" || bestDist <= 28)) price = best;
      }
    }
    return { time, price };
  }
}

/** Nominal bar seconds for a UI timeframe label ("1m", "4h", "1D"…). */
export function timeframeSeconds(tf: string): number {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(tf.trim());
  if (!m) return 60;
  const n = Number(m[1]);
  switch (m[2].toLowerCase()) {
    case "s": return n;
    case "m": return n * 60;
    case "h": return n * 3600;
    case "d": return n * 86400;
    default: return n * 604800;
  }
}

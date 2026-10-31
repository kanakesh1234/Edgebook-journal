import type { ISeriesApi, SeriesType, UTCTimestamp } from "lightweight-charts";
import type { CandleData } from "@/lib/backtesting/data/types";
import { buildPath, sampleBar, type PricePath } from "@/lib/backtesting/playback-fx";

interface Run {
  series: ISeriesApi<SeriesType>;
  bar: CandleData;
  priceOnly: boolean;
  start: number;
  dur: number;
  path: PricePath;
}

/**
 * Forms ONE candle progressively (open → wicks → close) with a single rAF loop that
 * calls series.update() on the same bar time. Idempotent: finish() snaps to the true
 * final bar, cancel() just stops (the caller is about to setData anyway).
 */
export class CandleAnimator {
  private raf = 0;
  private run: Run | null = null;
  constructor(private onPrice: (price: number) => void) {}

  private emit(r: Run, o: { open: number; high: number; low: number; close: number }) {
    const time = r.bar.time as UTCTimestamp;
    try {
      r.series.update((r.priceOnly ? { time, value: o.close } : { time, ...o }) as never);
    } catch { /* series disposed */ }
    this.onPrice(o.close);
  }

  start(series: ISeriesApi<SeriesType>, bar: CandleData, priceOnly: boolean, dur: number, mode: "smooth" | "natural") {
    this.finish();
    if (bar.high === bar.low) { // flat bar: nothing to form
      const r: Run = { series, bar, priceOnly, start: 0, dur: 0, path: { pts: [bar.open], cum: [0] } };
      this.emit(r, bar);
      return;
    }
    const r: Run = { series, bar, priceOnly, start: performance.now(), dur, path: buildPath(bar, bar.time, mode) };
    this.run = r;
    this.emit(r, sampleBar(bar, r.path, 0));
    const tick = (now: number) => {
      const cur = this.run;
      if (cur !== r) return;
      const p = Math.min(1, (now - r.start) / r.dur);
      if (p >= 1) { this.finish(); return; }
      this.emit(r, sampleBar(bar, r.path, p));
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  finish() {
    const r = this.run;
    if (!r) return;
    cancelAnimationFrame(this.raf);
    this.run = null;
    this.emit(r, r.bar);
  }

  cancel() {
    cancelAnimationFrame(this.raf);
    this.run = null;
  }
}

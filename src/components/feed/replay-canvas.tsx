"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, createSeriesMarkers, LineStyle, CrosshairMode, TickMarkType,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time,
} from "lightweight-charts";
import { BASE_BAR_MS, endIdx, type ReplayModel } from "@/lib/feed/replay";

/** Loaded lazily (see reels.tsx) so the charting library is fetched only when a replay card is on screen. */

const NY = "America/New_York";
const nyFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: NY, hour12: false, ...o });
const F = { time: nyFmt({ hour: "2-digit", minute: "2-digit" }), day: nyFmt({ day: "numeric", month: "short" }), full: nyFmt({ weekday: "short", hour: "2-digit", minute: "2-digit" }) };
const toDate = (t: Time) => new Date(Number(t) * 1000);

/** Balanced TradingView-style horizontal window: spans 28–34 bar slots across the 16:9 stage so each candle has sleek, proportional TradingView width (~12–15px). */
const MAX_VISIBLE_BARS = 34;
const MIN_VISIBLE_BARS = 28;
const RIGHT_PAD_BARS = 4.5;

function windowForBar(model: ReplayModel, barIdx: number): { from: number; to: number } {
  const localPos = barIdx - model.viewFrom;
  const to = Math.max(MIN_VISIBLE_BARS - 1.5, localPos + RIGHT_PAD_BARS);
  const from = Math.max(-2.5, to - MAX_VISIBLE_BARS);
  return { from, to };
}

/** Apple HIG cubic ease-out curve for fluid camera & candle motion. */
const easeOutCubic = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const easeInOutCubic = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};

/** Interpolates intra-bar price action (open -> first extreme -> second extreme -> close) for 60fps candle formation. */
function interpolateCandle(c: { time: number; open: number; high: number; low: number; close: number }, progress: number) {
  const p = Math.min(1, Math.max(0, progress));
  const bullish = c.close >= c.open;
  const firstExtreme = bullish ? c.low : c.high;
  const secondExtreme = bullish ? c.high : c.low;

  let price: number;
  let high = c.open;
  let low = c.open;

  if (p < 0.28) {
    const k = easeInOutCubic(p / 0.28);
    price = c.open + (firstExtreme - c.open) * k;
    high = Math.max(c.open, price);
    low = Math.min(c.open, price);
  } else if (p < 0.74) {
    const k = easeInOutCubic((p - 0.28) / 0.46);
    price = firstExtreme + (secondExtreme - firstExtreme) * k;
    high = Math.max(c.open, firstExtreme, price);
    low = Math.min(c.open, firstExtreme, price);
  } else {
    const k = easeOutCubic((p - 0.74) / 0.26);
    price = secondExtreme + (c.close - secondExtreme) * k;
    high = c.high;
    low = c.low;
  }

  return {
    time: c.time as Time,
    open: c.open,
    high: Math.max(high, price, c.open),
    low: Math.min(low, price, c.open),
    close: price,
  };
}

function fmtPrice(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1000) return n.toFixed(2);
  if (abs >= 10) return n.toFixed(2);
  return n.toFixed(4);
}

/* The chart takes its colours from the app's design tokens, so it matches the active theme and follows a live switch. */
interface Palette { text: string; grid: string; border: string; up: string; down: string; gold: string; ink: string }
function readPalette(): Palette {
  const cs = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => cs.getPropertyValue(name).trim() || fallback;
  return { text: v("--muted", "#6e6657"), grid: v("--line-soft", "#efeadf"), border: v("--line", "#e7e1d4"), up: v("--profit", "#40795b"), down: v("--loss", "#ac5157"), gold: v("--gold-strong", "#b78e3e"), ink: v("--ink", "#26221a") };
}
function useThemeKey(): string {
  const [key, setKey] = useState(() => document.documentElement.dataset.theme ?? "light");
  useEffect(() => {
    const mo = new MutationObserver(() => setKey(document.documentElement.dataset.theme ?? "light"));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    return () => mo.disconnect();
  }, []);
  return key;
}

export function ReplayChart({ model, idx, label }: { model: ReplayModel; idx: number; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);
  const prevIdxRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  const themeKey = useThemeKey();
  const pal = useMemo(readPalette, [themeKey]);
  const palRef = useRef(pal);
  palRef.current = pal;

  // Tight vertical price bounds across the replay window so candles look large and fill ~88% of the 16:9 height.
  const range = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    const stopBar = Math.min(model.lastIdx, endIdx(model));
    for (let i = model.viewFrom; i <= stopBar; i++) {
      lo = Math.min(lo, model.candles[i].low);
      hi = Math.max(hi, model.candles[i].high);
    }
    for (const p of [model.entry, model.stop, model.target]) {
      if (p != null) {
        lo = Math.min(lo, p);
        hi = Math.max(hi, p);
      }
    }
    const span = Math.max(hi - lo, 0.5);
    const pad = span * 0.06;
    return { min: lo - pad, max: hi + pad };
  }, [model]);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // Create chart once per model with TradingView-grade proportions and scale margins
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const p = palRef.current;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { color: "rgba(0,0,0,0)" },
        textColor: p.text,
        fontFamily: "Inter Variable, -apple-system, system-ui, sans-serif",
        fontSize: 11,
        attributionLogo: true,
      },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      crosshair: { mode: CrosshairMode.Hidden },
      rightPriceScale: {
        borderColor: p.border,
        minimumWidth: 62,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      localization: { timeFormatter: (t: Time) => F.full.format(toDate(t)) },
      timeScale: {
        borderColor: p.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 3,
        barSpacing: 11,
        minBarSpacing: 6,
        fixLeftEdge: false,
        fixRightEdge: false,
        tickMarkFormatter: (t: Time, type: TickMarkType) => (type === TickMarkType.DayOfMonth ? F.day : F.time).format(toDate(t)),
      },
      // Vertical swipes must scroll the Feed, never the chart.
      handleScroll: false,
      handleScale: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: p.up,
      downColor: p.down,
      borderUpColor: p.up,
      borderDownColor: p.down,
      wickUpColor: p.up,
      wickDownColor: p.down,
      // TradingView-style live dotted price line + right-axis price badge tracking the active candle
      priceLineVisible: true,
      lastValueVisible: true,
      priceLineWidth: 1,
      priceLineStyle: LineStyle.Dotted,
      autoscaleInfoProvider: () => ({
        priceRange: { minValue: rangeRef.current.min, maxValue: rangeRef.current.max },
      }),
    });
    chartRef.current = chart;
    seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    prevIdxRef.current = null;
    return () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
      markersRef.current?.detach();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      markersRef.current = null;
      linesRef.current = [];
    };
  }, [model]);

  // Theme switched while open: restyle in place
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions({
      layout: { textColor: pal.text },
      grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } },
      rightPriceScale: { borderColor: pal.border },
      timeScale: { borderColor: pal.border },
    });
    series.applyOptions({
      upColor: pal.up,
      downColor: pal.down,
      borderUpColor: pal.up,
      borderDownColor: pal.down,
      wickUpColor: pal.up,
      wickDownColor: pal.down,
    });
  }, [pal]);

  // Data, markers, and 60fps Apple cubic-bezier candle + camera animation following the playhead
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const prevIdx = prevIdxRef.current;
    prevIdxRef.current = idx;

    const marks: SeriesMarker<Time>[] = [];
    if (idx >= model.entryIdx) {
      marks.push({
        time: model.candles[model.entryIdx].time as Time,
        position: model.dir === 1 ? "belowBar" : "aboveBar",
        shape: model.dir === 1 ? "arrowUp" : "arrowDown",
        color: pal.gold,
        text: "Entry",
      });
    }
    if (idx >= model.exitIdx && !model.exitEstimated) {
      marks.push({
        time: model.candles[model.exitIdx].time as Time,
        position: model.dir === 1 ? "aboveBar" : "belowBar",
        shape: "circle",
        color: pal.ink,
        text: "Exit",
      });
    }

    const prefersReducedMotion =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const isSingleStepForward = prevIdx !== null && idx === prevIdx + 1 && idx > model.startIdx && !prefersReducedMotion;

    if (!isSingleStepForward) {
      // Initial render or loop reset: draw from viewFrom..idx and frame immediately
      const slice = model.candles.slice(model.viewFrom, idx + 1).map((c) => ({
        time: c.time as Time,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
      }));
      series.setData(slice);
      markersRef.current?.setMarkers(marks);
      chart.timeScale().setVisibleLogicalRange(windowForBar(model, idx));
      return;
    }

    // Smooth 60fps step: commit bars up to idx - 1, then animate the new forming candle + camera glide
    const baseSlice = model.candles.slice(model.viewFrom, idx).map((c) => ({
      time: c.time as Time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    series.setData(baseSlice);

    const targetCandle = model.candles[idx];
    const fromWin = windowForBar(model, idx - 1);
    const toWin = windowForBar(model, idx);
    const duration = Math.round(BASE_BAR_MS * 0.88);
    const t0 = performance.now();

    // Seed the forming candle at its open price
    series.update(interpolateCandle(targetCandle, 0));
    markersRef.current?.setMarkers(marks);

    const stepFrame = (now: number) => {
      const raw = Math.min(1, Math.max(0, (now - t0) / duration));
      const camEase = easeOutCubic(raw);

      series.update(interpolateCandle(targetCandle, raw));
      chart.timeScale().setVisibleLogicalRange({
        from: fromWin.from + (toWin.from - fromWin.from) * camEase,
        to: fromWin.to + (toWin.to - fromWin.to) * camEase,
      });

      if (raw < 1) {
        rafRef.current = requestAnimationFrame(stepFrame);
      } else {
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(stepFrame);
    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [model, idx, pal]);

  // Entry / Stop / Target lines appear when the trade opens
  const levelsOn = idx >= model.entryIdx;
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of linesRef.current) {
      try { series.removePriceLine(l); } catch { /* chart already gone */ }
    }
    linesRef.current = [];
    if (!levelsOn) return;
    const mk = (price: number | null, color: string, title: string, width: 1 | 2 = 1, style = LineStyle.Dashed) => {
      if (price != null) {
        linesRef.current.push(
          series.createPriceLine({ price, color, lineWidth: width, lineStyle: style, axisLabelVisible: true, title })
        );
      }
    };
    mk(model.entry, pal.gold, "Entry", 2, LineStyle.Dashed);
    mk(model.stop, pal.down, "Stop", 1, LineStyle.Dashed);
    mk(model.target, pal.up, "Target", 1, LineStyle.Dashed);
  }, [model, levelsOn, pal]);

  const activeCandle = model.candles[Math.min(model.lastIdx, Math.max(model.viewFrom, idx))];
  const barUp = activeCandle ? activeCandle.close >= activeCandle.open : true;

  return (
    <div className="absolute inset-0" style={{ touchAction: "pan-y" }}>
      <div ref={host} role="img" aria-label={label} className="absolute inset-0" style={{ touchAction: "pan-y" }} />
      {activeCandle && (
        <div className="fd-ohlc-bar fd-num" aria-hidden="true">
          <span><b>O</b>{fmtPrice(activeCandle.open)}</span>
          <span><b>H</b>{fmtPrice(activeCandle.high)}</span>
          <span><b>L</b>{fmtPrice(activeCandle.low)}</span>
          <span className={barUp ? "fd-up" : "fd-down"}><b>C</b>{fmtPrice(activeCandle.close)}</span>
        </div>
      )}
    </div>
  );
}

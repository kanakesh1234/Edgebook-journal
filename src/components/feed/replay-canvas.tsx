"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  createChart, CandlestickSeries, createSeriesMarkers, ColorType, LineStyle, CrosshairMode, TickMarkType,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time,
} from "lightweight-charts";
import { endIdx, type ReplayModel } from "@/lib/feed/replay";

/** Loaded lazily (see reels.tsx) so the charting library is fetched only when a replay card is on screen. */
/* -------------------------------- chart -------------------------------- */

const NY = "America/New_York";
const nyFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: NY, hour12: false, ...o });
const F = { time: nyFmt({ hour: "2-digit", minute: "2-digit" }), day: nyFmt({ day: "numeric", month: "short" }), full: nyFmt({ weekday: "short", hour: "2-digit", minute: "2-digit" }) };
const toDate = (t: Time) => new Date(Number(t) * 1000);

const PAL = { text: "rgba(244,238,226,0.62)", grid: "rgba(255,244,220,0.06)", border: "rgba(255,244,220,0.12)", up: "#72c795", down: "#e8908f", gold: "#dcb872", cross: "rgba(255,244,220,0.3)" };

export function ReplayChart({ model, idx, label }: { model: ReplayModel; idx: number; label: string }) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const markersRef = useRef<ISeriesMarkersPluginApi<Time> | null>(null);
  const linesRef = useRef<IPriceLine[]>([]);

  // Fixed price range for the whole replay so the picture doesn't jump as bars arrive.
  const range = useMemo(() => {
    let lo = Infinity, hi = -Infinity;
    for (let i = model.viewFrom; i <= Math.min(model.lastIdx, endIdx(model)); i++) { lo = Math.min(lo, model.candles[i].low); hi = Math.max(hi, model.candles[i].high); }
    for (const p of [model.entry, model.stop, model.target]) if (p != null) { lo = Math.min(lo, p); hi = Math.max(hi, p); }
    const pad = Math.max((hi - lo) * 0.1, 0.5);
    return { min: lo - pad, max: hi + pad };
  }, [model]);
  const rangeRef = useRef(range);
  rangeRef.current = range;

  // create once per model
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: { background: { type: ColorType.Solid, color: "#0e0c08" }, textColor: PAL.text, fontFamily: "Inter Variable, -apple-system, system-ui, sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: PAL.grid }, horzLines: { color: PAL.grid } },
      crosshair: { mode: CrosshairMode.Hidden },
      rightPriceScale: { borderColor: PAL.border, minimumWidth: 56 },
      localization: { timeFormatter: (t: Time) => F.full.format(toDate(t)) },
      timeScale: {
        borderColor: PAL.border, timeVisible: true, secondsVisible: false, rightOffset: 0, barSpacing: 9, fixLeftEdge: false, fixRightEdge: false,
        tickMarkFormatter: (t: Time, type: TickMarkType) => (type === TickMarkType.DayOfMonth ? F.day : F.time).format(toDate(t)),
      },
      // Vertical swipes must scroll the Feed, never the chart.
      handleScroll: false, handleScale: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: PAL.up, downColor: PAL.down, borderUpColor: PAL.up, borderDownColor: PAL.down, wickUpColor: PAL.up, wickDownColor: PAL.down,
      priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: rangeRef.current.min, maxValue: rangeRef.current.max } }),
    });
    chartRef.current = chart; seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    return () => { markersRef.current?.detach(); chart.remove(); chartRef.current = null; seriesRef.current = null; markersRef.current = null; linesRef.current = []; };
  }, [model]);

  // data, markers and the visible window follow the playhead
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    series.setData(model.candles.slice(0, idx + 1).map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    chart.timeScale().setVisibleLogicalRange({ from: model.viewFrom - 1, to: endIdx(model) + 4 });

    const marks: SeriesMarker<Time>[] = [];
    if (idx >= model.entryIdx) marks.push({ time: model.candles[model.entryIdx].time as Time, position: model.dir === 1 ? "belowBar" : "aboveBar", shape: model.dir === 1 ? "arrowUp" : "arrowDown", color: PAL.gold, text: "Entry" });
    if (idx >= model.exitIdx && !model.exitEstimated) marks.push({ time: model.candles[model.exitIdx].time as Time, position: model.dir === 1 ? "aboveBar" : "belowBar", shape: "circle", color: "#f4eee2", text: "Exit" });
    markersRef.current?.setMarkers(marks);
  }, [model, idx]);

  // entry / stop / target appear when the trade opens
  const levelsOn = idx >= model.entryIdx;
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of linesRef.current) { try { series.removePriceLine(l); } catch { /* chart already gone */ } }
    linesRef.current = [];
    if (!levelsOn) return;
    const mk = (price: number | null, color: string, title: string) => { if (price != null) linesRef.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title })); };
    mk(model.entry, PAL.gold, "Entry"); mk(model.stop, PAL.down, "Stop"); mk(model.target, PAL.up, "Target");
  }, [model, levelsOn]);

  return <div ref={host} role="img" aria-label={label} className="absolute inset-0" style={{ touchAction: "pan-y" }} />;
}

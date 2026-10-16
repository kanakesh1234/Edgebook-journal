"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, CandlestickSeries, createSeriesMarkers, LineStyle, CrosshairMode, TickMarkType,
  type IChartApi, type IPriceLine, type ISeriesApi, type ISeriesMarkersPluginApi, type SeriesMarker, type Time,
} from "lightweight-charts";
import { endIdx, type ReplayModel } from "@/lib/feed/replay";

/** Loaded lazily (see reels.tsx) so the charting library is fetched only when a replay card is on screen. */

const NY = "America/New_York";
const nyFmt = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: NY, hour12: false, ...o });
const F = { time: nyFmt({ hour: "2-digit", minute: "2-digit" }), day: nyFmt({ day: "numeric", month: "short" }), full: nyFmt({ weekday: "short", hour: "2-digit", minute: "2-digit" }) };
const toDate = (t: Time) => new Date(Number(t) * 1000);

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

  const themeKey = useThemeKey();
  const pal = useMemo(readPalette, [themeKey]);
  const palRef = useRef(pal);
  palRef.current = pal;

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
    const p = palRef.current;
    const chart = createChart(el, {
      autoSize: true,
      // transparent: the chart sits on the card's own surface, so it can never clash with it
      layout: { background: { color: "rgba(0,0,0,0)" }, textColor: p.text, fontFamily: "Inter Variable, -apple-system, system-ui, sans-serif", fontSize: 11, attributionLogo: true },
      grid: { vertLines: { color: p.grid }, horzLines: { color: p.grid } },
      crosshair: { mode: CrosshairMode.Hidden },
      rightPriceScale: { borderColor: p.border, minimumWidth: 56 },
      localization: { timeFormatter: (t: Time) => F.full.format(toDate(t)) },
      timeScale: {
        borderColor: p.border, timeVisible: true, secondsVisible: false, rightOffset: 0, barSpacing: 9, fixLeftEdge: false, fixRightEdge: false,
        tickMarkFormatter: (t: Time, type: TickMarkType) => (type === TickMarkType.DayOfMonth ? F.day : F.time).format(toDate(t)),
      },
      // Vertical swipes must scroll the Feed, never the chart.
      handleScroll: false, handleScale: false,
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: p.up, downColor: p.down, borderUpColor: p.up, borderDownColor: p.down, wickUpColor: p.up, wickDownColor: p.down,
      priceLineVisible: false, lastValueVisible: false,
      autoscaleInfoProvider: () => ({ priceRange: { minValue: rangeRef.current.min, maxValue: rangeRef.current.max } }),
    });
    chartRef.current = chart; seriesRef.current = series;
    markersRef.current = createSeriesMarkers(series, []);
    return () => { markersRef.current?.detach(); chart.remove(); chartRef.current = null; seriesRef.current = null; markersRef.current = null; linesRef.current = []; };
  }, [model]);

  // theme switched while open: restyle in place
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    chart.applyOptions({ layout: { textColor: pal.text }, grid: { vertLines: { color: pal.grid }, horzLines: { color: pal.grid } }, rightPriceScale: { borderColor: pal.border }, timeScale: { borderColor: pal.border } });
    series.applyOptions({ upColor: pal.up, downColor: pal.down, borderUpColor: pal.up, borderDownColor: pal.down, wickUpColor: pal.up, wickDownColor: pal.down });
  }, [pal]);

  // data, markers and the visible window follow the playhead
  useEffect(() => {
    const chart = chartRef.current, series = seriesRef.current;
    if (!chart || !series) return;
    series.setData(model.candles.slice(0, idx + 1).map((c) => ({ time: c.time as Time, open: c.open, high: c.high, low: c.low, close: c.close })));
    chart.timeScale().setVisibleLogicalRange({ from: model.viewFrom - 1, to: endIdx(model) + 4 });

    const marks: SeriesMarker<Time>[] = [];
    if (idx >= model.entryIdx) marks.push({ time: model.candles[model.entryIdx].time as Time, position: model.dir === 1 ? "belowBar" : "aboveBar", shape: model.dir === 1 ? "arrowUp" : "arrowDown", color: pal.gold, text: "Entry" });
    if (idx >= model.exitIdx && !model.exitEstimated) marks.push({ time: model.candles[model.exitIdx].time as Time, position: model.dir === 1 ? "aboveBar" : "belowBar", shape: "circle", color: pal.ink, text: "Exit" });
    markersRef.current?.setMarkers(marks);
  }, [model, idx, pal]);

  // entry / stop / target appear when the trade opens
  const levelsOn = idx >= model.entryIdx;
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    for (const l of linesRef.current) { try { series.removePriceLine(l); } catch { /* chart already gone */ } }
    linesRef.current = [];
    if (!levelsOn) return;
    const mk = (price: number | null, color: string, title: string) => { if (price != null) linesRef.current.push(series.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title })); };
    mk(model.entry, pal.gold, "Entry"); mk(model.stop, pal.down, "Stop"); mk(model.target, pal.up, "Target");
  }, [model, levelsOn, pal]);

  return <div ref={host} role="img" aria-label={label} className="absolute inset-0" style={{ touchAction: "pan-y" }} />;
}

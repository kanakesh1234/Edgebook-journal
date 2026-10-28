"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AreaSeries,
  BarSeries,
  BaselineSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  LineSeries,
  LineStyle,
  PriceScaleMode,
  TickMarkType,
  createChart,
  createSeriesMarkers,
  type IChartApi,
  type IPriceLine,
  type ISeriesApi,
  type Logical,
  type SeriesMarker,
  type SeriesType,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import type { CandleData } from "@/lib/backtesting/data/types";
import type { ChartType, DrawingObject } from "@/lib/backtesting/types";
import { useBacktest } from "@/lib/backtesting/store";
import { instrumentBySymbol } from "@/lib/backtesting/instruments";
import { candleColorsFor, paletteFor, useChartAppearance } from "@/lib/backtesting/appearance";
import { formatMoney } from "@/lib/format";
import { useTheme } from "@/lib/theme";
import { cn } from "@/lib/utils";
import { DrawingsPrimitive } from "./drawings/primitive";
import { DrawingController } from "./drawings/controller";
import { Projector, timeframeSeconds } from "./drawings/projector";
import { fmtPrice, fmtSigned } from "./drawings/render";
import { onChartCommand } from "./chart-bus";
import ChartContextMenu, { type ContextTarget } from "./context-menu";
import DrawingToolbar from "./drawing-toolbar";
import { IndicatorLayer, IndicatorLegend } from "./indicators-layer";
import { useIndicators } from "@/lib/backtesting/indicator-store";

/* New York wall-clock: lightweight-charts prints UTC unless told otherwise,
   and the whole app speaks America/New_York. */
const NY_TZ = "America/New_York";
const nyFmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, hour12: false, ...opts });
const fmtTick = {
  time: nyFmt({ hour: "2-digit", minute: "2-digit" }),
  timeSec: nyFmt({ hour: "2-digit", minute: "2-digit", second: "2-digit" }),
  day: nyFmt({ day: "numeric", month: "short" }),
  month: nyFmt({ month: "short" }),
  year: nyFmt({ year: "numeric" }),
  full: nyFmt({ weekday: "short", day: "numeric", month: "short", year: "2-digit", hour: "2-digit", minute: "2-digit" }),
};
const toDate = (t: Time) => new Date(Number(t) * 1000);
const nyTickMark = (time: Time, type: TickMarkType): string => {
  const d = toDate(time);
  switch (type) {
    case TickMarkType.Year: return fmtTick.year.format(d);
    case TickMarkType.Month: return fmtTick.month.format(d);
    case TickMarkType.DayOfMonth: return fmtTick.day.format(d);
    case TickMarkType.TimeWithSeconds: return fmtTick.timeSec.format(d);
    default: return fmtTick.time.format(d);
  }
};

const FONT = "-apple-system, BlinkMacSystemFont, 'Trebuchet MS', Roboto, Ubuntu, sans-serif";
const TV_BLUE = "#2962FF";

interface ChartProps {
  /** Bars drawn: context history + everything replayed so far. */
  candles: CandleData[];
  /** Times of every bar incl. not-yet-revealed ones (position drawings in the future). */
  allTimes: number[];
  symbol: string;
  /** First bar of the replay window — the chart re-frames when it changes. */
  anchorTime: number;
  tickSize?: number;
  onUpdatePositionRisk?: (positionOrderId: string, updates: { stopLoss?: number | null; takeProfit?: number | null }) => void;
  onUpdatePendingOrderPrice?: (orderId: string, price: number) => void;
}

type DraggableKind = "sl" | "tp" | "order";
interface DraggableLine {
  id: string; kind: DraggableKind; price: number; line: IPriceLine;
  /** Position context for SL/TP lines (live projected P&L while dragging). */
  entry?: number; long?: boolean; qty?: number;
}

/** "Stop −$300.00" / "Target +$600.00" — the P&L the trade would book if that level is hit. */
function riskTitle(kind: "sl" | "tp", price: number, entry: number, long: boolean, qty: number, pointValue: number) {
  const money = (long ? price - entry : entry - price) * pointValue * qty;
  return `${kind === "sl" ? "Stop" : "Target"} ${money >= 0 ? "+" : "−"}${formatMoney(Math.abs(money))}`;
}

/** Average true range of the last `n` bars — used to size a sensible default SL/TP. */
function atr(candles: CandleData[], n = 14): number {
  const k = Math.min(n, candles.length - 1);
  if (k <= 0) return 0;
  let sum = 0;
  for (let i = candles.length - k; i < candles.length; i++) {
    const c = candles[i], pc = candles[i - 1].close;
    sum += Math.max(c.high - c.low, Math.abs(c.high - pc), Math.abs(c.low - pc));
  }
  return sum / k;
}

const isPriceType = (t: ChartType) => t === "line" || t === "area" || t === "baseline";

function toPoint(type: ChartType, c: CandleData) {
  const time = c.time as UTCTimestamp;
  return isPriceType(type)
    ? { time, value: c.close }
    : { time, open: c.open, high: c.high, low: c.low, close: c.close };
}

const rgba = (hex: string, a: number) => {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
};

/* ------------------------------------------------------------------ */
/*  Position tags — live P&L pinned to each open position's entry line  */
/* ------------------------------------------------------------------ */

function PositionTags({
  symbol, chartRef, seriesRef, candlesRef, tick, epoch, onSetRisk,
}: {
  symbol: string;
  chartRef: React.MutableRefObject<IChartApi | null>;
  seriesRef: React.MutableRefObject<ISeriesApi<SeriesType> | null>;
  candlesRef: React.MutableRefObject<CandleData[]>;
  tick: number;
  epoch: number;
  onSetRisk: (id: string, updates: { stopLoss?: number | null; takeProfit?: number | null }) => void;
}) {
  const positions = useBacktest((s) => s.openPositions).filter((p) => p.symbol === symbol);
  const closePosition = useBacktest((s) => s.closePositionForSymbol);
  const rootRef = useRef<HTMLDivElement>(null);
  const has = positions.length > 0;

  // Follow the entry price as the user scrolls / zooms / the scale autoscales.
  useEffect(() => {
    if (!has) return;
    let raf = 0;
    const loop = () => {
      const series = seriesRef.current, chart = chartRef.current, root = rootRef.current;
      if (series && chart && root) {
        const right = chart.priceScale("right").width() + 8;
        const h = chart.paneSize().height;
        for (const el of Array.from(root.children) as HTMLElement[]) {
          const y = series.priceToCoordinate(parseFloat(el.dataset.price || "NaN"));
          if (y === null || y < 0 || y > h) { el.style.display = "none"; continue; }
          el.style.display = "flex";
          el.style.right = `${right}px`;
          el.style.transform = `translateY(${Math.round(y) - 13}px)`;
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [has, chartRef, seriesRef, epoch]);

  if (!has) return null;

  const snapTo = (v: number) => Math.round(v / (tick || 0.25)) * (tick || 0.25);
  /** Default level: 1×ATR for the stop, 2×ATR for the target, measured from the current price. */
  const addRisk = (pos: (typeof positions)[number], kind: "sl" | "tp") => {
    const cs = candlesRef.current;
    const last = cs.at(-1)?.close ?? pos.entryPrice;
    const a = atr(cs) || (tick || 0.25) * 20;
    const long = pos.side === "buy";
    if (kind === "sl") {
      const px = long ? Math.min(pos.entryPrice, last) - a : Math.max(pos.entryPrice, last) + a;
      onSetRisk(pos.orderId, { stopLoss: snapTo(px) });
    } else {
      const px = long ? Math.max(pos.entryPrice, last) + 2 * a : Math.min(pos.entryPrice, last) - 2 * a;
      onSetRisk(pos.orderId, { takeProfit: snapTo(px) });
    }
  };

  return (
    <div ref={rootRef} className="tv-ptags" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.stopPropagation()}>
      {positions.map((p) => {
        const long = p.side === "buy";
        const pnl = p.unrealizedPnl;
        return (
          <div key={p.orderId} data-price={p.entryPrice} className="tv-ptag">
            <span className={`tv-ptag-pnl ${pnl > 0 ? "up" : pnl < 0 ? "down" : ""}`}>
              {pnl >= 0 ? "+" : "−"}{formatMoney(Math.abs(pnl))}
            </span>
            <span className="tv-ptag-side">{long ? "Long" : "Short"} {p.quantity}</span>
            <button
              type="button" className={`tv-ptag-btn sl${p.stopLoss ? " is-on" : ""}`}
              title={p.stopLoss ? "Remove stop loss" : "Add stop loss — then drag the line"}
              onClick={() => (p.stopLoss ? onSetRisk(p.orderId, { stopLoss: null }) : addRisk(p, "sl"))}
            >SL{p.stopLoss ? " ×" : ""}</button>
            <button
              type="button" className={`tv-ptag-btn tp${p.takeProfit ? " is-on" : ""}`}
              title={p.takeProfit ? "Remove take profit" : "Add take profit — then drag the line"}
              onClick={() => (p.takeProfit ? onSetRisk(p.orderId, { takeProfit: null }) : addRisk(p, "tp"))}
            >TP{p.takeProfit ? " ×" : ""}</button>
            <button type="button" className="tv-ptag-btn close" title="Close position at market" onClick={() => closePosition(symbol, p.orderId)}>✕</button>
          </div>
        );
      })}
    </div>
  );
}

export default function BacktestChart({
  candles, allTimes, symbol, anchorTime, tickSize = 0.25, onUpdatePositionRisk, onUpdatePendingOrderPrice,
}: ChartProps) {
  /* ---------------- store ---------------- */
  const openPositions = useBacktest((s) => s.openPositions);
  const pendingOrders = useBacktest((s) => s.pendingOrders);
  const closedTrades = useBacktest((s) => s.closedTrades);
  const drawingsAll = useBacktest((s) => s.drawings);
  const alerts = useBacktest((s) => s.alerts);
  const tool = useBacktest((s) => s.activeDrawingTool);
  const selectedId = useBacktest((s) => s.selectedDrawingId);
  const drawingsHidden = useBacktest((s) => s.drawingsHidden);
  const scale = useBacktest((s) => s.scale);
  const chartType = useBacktest((s) => s.chartType);
  const timeframe = useBacktest((s) => s.timeframe);
  const selectingBar = useBacktest((s) => s.selectingBar);
  const status = useBacktest((s) => s.status);
  const dataLoading = useBacktest((s) => s.dataLoading);
  const orderQty = useBacktest((s) => s.orderQty);
  const setOrderQty = useBacktest((s) => s.setOrderQty);
  const placeOrder = useBacktest((s) => s.placeOrder);

  const { resolved: theme } = useTheme();
  const appearance = useChartAppearance();
  const pal = useMemo(() => paletteFor(theme, appearance), [theme, appearance]);
  const spec = instrumentBySymbol(symbol);
  const drawings = useMemo(() => drawingsAll[symbol] || [], [drawingsAll, symbol]);

  /* ---------------- refs ---------------- */
  const wrapRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<SeriesType> | null>(null);
  const primitiveRef = useRef<DrawingsPrimitive | null>(null);
  const projRef = useRef<Projector | null>(null);
  const markersRef = useRef<{ setMarkers: (m: SeriesMarker<Time>[]) => void } | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const draggableRef = useRef<DraggableLine[]>([]);
  const dragRef = useRef<{ id: string; kind: DraggableKind } | null>(null);
  const savedRangeRef = useRef<{ from: number; to: number } | null>(null);
  const dataKeyRef = useRef("");
  const lastSetRef = useRef<{ len: number; first: number; last: number; type: ChartType } | null>(null);
  const selectLineRef = useRef<HTMLDivElement>(null);

  const timesRef = useRef(allTimes); timesRef.current = allTimes;
  const candlesRef = useRef(candles); candlesRef.current = candles;
  const barSecRef = useRef(timeframeSeconds(timeframe)); barSecRef.current = timeframeSeconds(timeframe);
  const tickRef = useRef(tickSize); tickRef.current = tickSize;
  const pointValueRef = useRef(spec?.pointValue ?? 1); pointValueRef.current = spec?.pointValue ?? 1;
  const darkRef = useRef(pal.darkBg); darkRef.current = pal.darkBg;
  const symbolRef = useRef(symbol); symbolRef.current = symbol;
  const riskCbRef = useRef(onUpdatePositionRisk); riskCbRef.current = onUpdatePositionRisk;
  const orderCbRef = useRef(onUpdatePendingOrderPrice); orderCbRef.current = onUpdatePendingOrderPrice;

  const [epoch, setEpoch] = useState(0);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const [menu, setMenu] = useState<(ContextTarget & { clientX: number; clientY: number }) | null>(null);
  const [textEdit, setTextEdit] = useState<{ id: string; x: number; y: number; value: string } | null>(null);

  const controllerRef = useRef<DrawingController | null>(null);

  /* ---------------- init / re-init chart ---------------- */
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: pal.bg },
        textColor: pal.text,
        fontFamily: FONT,
        fontSize: 12,
        attributionLogo: true,
      },
      grid: {
        vertLines: { color: pal.grid, visible: appearance.gridVertical },
        horzLines: { color: pal.grid, visible: appearance.gridHorizontal },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: pal.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: pal.crosshairLabel },
        horzLine: { color: pal.crosshair, width: 1, style: LineStyle.Dashed, labelBackgroundColor: pal.crosshairLabel },
      },
      rightPriceScale: { borderColor: pal.border, scaleMargins: { top: 0.1, bottom: 0.1 }, minimumWidth: 72 },
      localization: { timeFormatter: (t: Time) => fmtTick.full.format(toDate(t)) },
      timeScale: {
        tickMarkFormatter: nyTickMark,
        borderColor: pal.border,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 12,
        barSpacing: 8,
        minBarSpacing: 0.4,
        shiftVisibleRangeOnNewBar: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
    });

    const first = candlesRef.current[0]?.close ?? 0;
    const cc = candleColorsFor(theme, appearance);
    const up = cc.up, down = cc.down;
    let series: ISeriesApi<SeriesType>;
    switch (chartType) {
      case "bar":
        series = chart.addSeries(BarSeries, { upColor: up, downColor: down, thinBars: false });
        break;
      case "line":
        series = chart.addSeries(LineSeries, { color: TV_BLUE, lineWidth: 2 });
        break;
      case "area":
        series = chart.addSeries(AreaSeries, { lineColor: TV_BLUE, topColor: "rgba(41,98,255,0.28)", bottomColor: "rgba(41,98,255,0.02)", lineWidth: 2 });
        break;
      case "baseline":
        series = chart.addSeries(BaselineSeries, {
          baseValue: { type: "price", price: first },
          topLineColor: up, bottomLineColor: down,
          topFillColor1: rgba(up, 0.28), topFillColor2: rgba(up, 0.05),
          bottomFillColor1: rgba(down, 0.05), bottomFillColor2: rgba(down, 0.28),
          lineWidth: 2,
        });
        break;
      case "hollow-candles":
        series = chart.addSeries(CandlestickSeries, {
          upColor: "rgba(0,0,0,0)", downColor: down,
          borderUpColor: cc.borderUp, borderDownColor: cc.borderDown,
          wickUpColor: cc.wickUp, wickDownColor: cc.wickDown,
        });
        break;
      default:
        series = chart.addSeries(CandlestickSeries, {
          upColor: up, downColor: down,
          borderUpColor: cc.borderUp, borderDownColor: cc.borderDown,
          wickUpColor: cc.wickUp, wickDownColor: cc.wickDown,
        });
    }

    const proj = new Projector({
      chart, series,
      getTimes: () => timesRef.current,
      getBarSec: () => barSecRef.current,
      getCandles: () => candlesRef.current,
    });
    const primitive = new DrawingsPrimitive({
      getProjector: () => proj,
      getTick: () => tickRef.current,
      getPointValue: () => pointValueRef.current,
      isDark: () => darkRef.current,
    });
    series.attachPrimitive(primitive);

    chart.subscribeCrosshairMove((param) => {
      setHoverTime(param.time ? (param.time as number) : null);
    });

    const controller = new DrawingController({
      container: el, chart, series, proj, primitive,
      getSymbol: () => symbolRef.current,
      getTick: () => tickRef.current,
      getEnv: () => {
        const { w, h } = proj.paneSize();
        return { proj, w, h, tick: tickRef.current, pointValue: pointValueRef.current, dark: darkRef.current };
      },
      editText: (id) => {
        const d = (useBacktest.getState().drawings[symbolRef.current] || []).find((x) => x.id === id);
        const p = d && proj.toPt(d.points[0].time, d.points[0].price);
        if (d && p) setTextEdit({ id, x: p.x, y: p.y, value: d.text ?? "" });
      },
      pickBar: (time) => {
        const st = useBacktest.getState();
        st.setSelectingBar(false);
        if (time > st.currentTime) st.advanceTo(time);
      },
    });
    const detachController = controller.attach();

    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) chart.resize(entry.contentRect.width, entry.contentRect.height);
    });
    ro.observe(el);

    chartRef.current = chart;
    seriesRef.current = series;
    primitiveRef.current = primitive;
    projRef.current = proj;
    controllerRef.current = controller;
    markersRef.current = null;
    priceLinesRef.current = [];
    lastSetRef.current = null;
    setEpoch((e) => e + 1);

    return () => {
      try { savedRangeRef.current = chart.timeScale().getVisibleLogicalRange(); } catch { /* chart already gone */ }
      detachController();
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      primitiveRef.current = null;
      projRef.current = null;
      controllerRef.current = null;
      markersRef.current = null;
      priceLinesRef.current = [];
      draggableRef.current = [];
    };
  // Rebuilt when the look or series type changes; data effects re-run via `epoch`.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme, chartType, appearance]);

  /* ---------------- candle data ---------------- */
  useEffect(() => {
    const series = seriesRef.current;
    const chart = chartRef.current;
    if (!series || !chart) return;
    if (candles.length === 0) {
      series.setData([]);
      lastSetRef.current = null;
      return;
    }
    const prev = lastSetRef.current;
    const n = candles.length;
    const appended =
      prev && prev.type === chartType && n === prev.len + 1 &&
      candles[0].time === prev.first && candles[n - 2].time === prev.last;
    if (appended) {
      series.update(toPoint(chartType, candles[n - 1]) as never);
    } else {
      series.setData(candles.map((c) => toPoint(chartType, c)) as never);
    }
    lastSetRef.current = { len: n, first: candles[0].time, last: candles[n - 1].time, type: chartType };

    // Frame the view: on a new replay window / timeframe / symbol, or when context bars arrive.
    const key = `${symbol}|${timeframe}|${anchorTime}`;
    const prependedHistory = prev && !appended && candles[0].time < prev.first;
    // While a (re)load is in flight the bars on screen are the old dataset — frame once the new one lands.
    if (!dataLoading && (key !== dataKeyRef.current || prependedHistory)) {
      const keepRange = savedRangeRef.current && key === dataKeyRef.current;
      dataKeyRef.current = key;
      const anchorIdx = Math.max(0, candles.findIndex((c) => c.time >= anchorTime));
      const idx = anchorIdx >= 0 ? Math.max(anchorIdx, n - 1) : n - 1;
      const width = chart.paneSize().width || 900;
      const bars = Math.max(30, Math.floor(width / 8));
      if (keepRange && savedRangeRef.current) {
        chart.timeScale().setVisibleLogicalRange(savedRangeRef.current);
      } else {
        chart.timeScale().setVisibleLogicalRange({ from: idx - bars * 0.72, to: idx + bars * 0.28 });
      }
    } else if (savedRangeRef.current) {
      chart.timeScale().setVisibleLogicalRange(savedRangeRef.current);
    }
    savedRangeRef.current = null;
  }, [candles, epoch, chartType, symbol, timeframe, anchorTime, dataLoading]);

  /* ---------------- drawings → primitive ---------------- */
  useEffect(() => {
    primitiveRef.current?.set({ drawings, selectedId, hidden: drawingsHidden });
  }, [drawings, selectedId, drawingsHidden, epoch]);

  // Repaint when bars (and therefore x-positions / autoscale) change.
  useEffect(() => { primitiveRef.current?.repaint(); }, [candles, allTimes, epoch]);

  /* ---------------- order / position / alert lines ---------------- */
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    if (dragRef.current) return; // never rebuild the line being dragged (replay may tick mid-drag)
    for (const l of priceLinesRef.current) { try { series.removePriceLine(l); } catch { /* gone */ } }
    priceLinesRef.current = [];
    draggableRef.current = [];

    const pv = spec?.pointValue ?? 1;
    for (const pos of openPositions) {
      if (pos.symbol !== symbol) continue;
      const long = pos.side === "buy";
      // Entry line: no title — the live P&L tag (PositionTags) sits on it instead.
      const entry = series.createPriceLine({
        price: pos.entryPrice, color: TV_BLUE, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "",
      });
      priceLinesRef.current.push(entry);
      if (pos.stopLoss) {
        const l = series.createPriceLine({
          price: pos.stopLoss, color: "#F23645", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
          title: riskTitle("sl", pos.stopLoss, pos.entryPrice, long, pos.quantity, pv),
        });
        priceLinesRef.current.push(l);
        draggableRef.current.push({ id: pos.orderId, kind: "sl", price: pos.stopLoss, line: l, entry: pos.entryPrice, long, qty: pos.quantity });
      }
      if (pos.takeProfit) {
        const l = series.createPriceLine({
          price: pos.takeProfit, color: "#089981", lineWidth: 2, lineStyle: LineStyle.Dashed, axisLabelVisible: true,
          title: riskTitle("tp", pos.takeProfit, pos.entryPrice, long, pos.quantity, pv),
        });
        priceLinesRef.current.push(l);
        draggableRef.current.push({ id: pos.orderId, kind: "tp", price: pos.takeProfit, line: l, entry: pos.entryPrice, long, qty: pos.quantity });
      }
    }

    for (const o of pendingOrders) {
      if (o.symbol !== symbol || !o.price) continue;
      const l = series.createPriceLine({
        price: o.price, color: o.side === "buy" ? TV_BLUE : "#F23645", lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true,
        title: `${o.side === "buy" ? "Buy" : "Sell"} ${o.type} ${o.quantity}`,
      });
      priceLinesRef.current.push(l);
      draggableRef.current.push({ id: o.id, kind: "order", price: o.price, line: l });
    }

    for (const a of alerts) {
      if (a.symbol !== symbol || a.triggered) continue;
      priceLinesRef.current.push(series.createPriceLine({
        price: a.price, color: "#FF9800", lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: "Alert",
      }));
    }
  }, [openPositions, pendingOrders, alerts, symbol, epoch, spec?.pointValue]);

  /* ---------------- drag SL / TP / pending-order lines ---------------- */
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;

    const near = (y: number): DraggableLine | null => {
      const series = seriesRef.current;
      if (!series) return null;
      for (const dl of draggableRef.current) {
        const c = series.priceToCoordinate(dl.price);
        if (c !== null && Math.abs(c - y) <= 6) return dl;
      }
      return null;
    };
    const snap = (price: number) => Math.round(price / (tickRef.current || 0.01)) * (tickRef.current || 0.01);

    const down = (e: PointerEvent) => {
      if (e.button !== 0) return;
      const r = container.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const paneW = chart.paneSize().width;
      if (x > paneW) return;
      const hit = near(y);
      if (!hit) return;
      e.preventDefault();
      e.stopPropagation();
      dragRef.current = { id: hit.id, kind: hit.kind };
      chart.applyOptions({ handleScroll: false, handleScale: false });
      try { container.setPointerCapture(e.pointerId); } catch { /* ignore */ }
      container.style.cursor = "ns-resize";
    };
    const move = (e: PointerEvent) => {
      const r = container.getBoundingClientRect();
      const y = e.clientY - r.top;
      const series = seriesRef.current;
      const dragging = dragRef.current;
      if (!dragging || !series) {
        if (e.buttons === 0 && !controllerRef.current?.isCreating) {
          const t = useBacktest.getState().activeDrawingTool;
          if (t === "cursor" || t === "crosshair" || t === "dot" || t === "pointer") {
            const hit = near(y);
            if (hit) container.style.cursor = "ns-resize";
          }
        }
        return;
      }
      const raw = series.coordinateToPrice(y);
      if (raw === null) return;
      let price = snap(raw);
      const dl = draggableRef.current.find((d) => d.id === dragging.id && d.kind === dragging.kind);
      if (dl) {
        // Keep SL on the losing side and TP on the winning side of the current
        // price, otherwise the very next bar would close the trade instantly.
        const lastPx = candlesRef.current.at(-1)?.close;
        const tk = tickRef.current || 0.25;
        if (lastPx !== undefined && dl.long !== undefined && dl.kind !== "order") {
          const below = (dl.kind === "sl") === dl.long; // long SL / short TP live below price
          price = below ? Math.min(price, lastPx - tk) : Math.max(price, lastPx + tk);
        }
        dl.price = price;
        if (dl.kind !== "order" && dl.entry !== undefined && dl.long !== undefined && dl.qty !== undefined) {
          dl.line.applyOptions({ price, title: riskTitle(dl.kind, price, dl.entry, dl.long, dl.qty, pointValueRef.current) });
        } else {
          dl.line.applyOptions({ price });
        }
      }
    };
    const up = (e: PointerEvent) => {
      const dragging = dragRef.current;
      if (!dragging) return;
      const dl = draggableRef.current.find((d) => d.id === dragging.id && d.kind === dragging.kind);
      if (dl) {
        if (dl.kind === "sl") riskCbRef.current?.(dl.id, { stopLoss: dl.price });
        else if (dl.kind === "tp") riskCbRef.current?.(dl.id, { takeProfit: dl.price });
        else orderCbRef.current?.(dl.id, dl.price);
      }
      dragRef.current = null;
      chart.applyOptions({
        handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
        handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true, axisDoubleClickReset: true },
      });
      try { container.releasePointerCapture(e.pointerId); } catch { /* ignore */ }
      container.style.cursor = "";
    };
    container.addEventListener("pointerdown", down);
    container.addEventListener("pointermove", move);
    container.addEventListener("pointerup", up);
    return () => {
      container.removeEventListener("pointerdown", down);
      container.removeEventListener("pointermove", move);
      container.removeEventListener("pointerup", up);
    };
  }, [epoch]);

  /* ---------------- trade markers ---------------- */
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;
    const markers: SeriesMarker<Time>[] = [];
    const known = new Set(candles.map((c) => c.time));
    for (const t of closedTrades) {
      if (t.symbol !== symbol) continue;
      if (known.has(t.entryTime)) {
        markers.push({
          time: t.entryTime as UTCTimestamp,
          position: t.side === "buy" ? "belowBar" : "aboveBar",
          color: t.side === "buy" ? TV_BLUE : "#F23645",
          shape: t.side === "buy" ? "arrowUp" : "arrowDown",
          text: `${t.side === "buy" ? "Buy" : "Sell"} ${t.quantity}`,
        });
      }
      if (t.exitTime && known.has(t.exitTime)) {
        markers.push({
          time: t.exitTime as UTCTimestamp,
          position: t.side === "buy" ? "aboveBar" : "belowBar",
          color: t.netPnl >= 0 ? "#089981" : "#F23645",
          shape: t.side === "buy" ? "arrowDown" : "arrowUp",
          text: `${t.netPnl >= 0 ? "+" : "−"}${formatMoney(Math.abs(t.netPnl))}`,
        });
      }
    }
    markers.sort((a, b) => (a.time as number) - (b.time as number));
    if (markersRef.current) markersRef.current.setMarkers(markers);
    else if (markers.length) markersRef.current = createSeriesMarkers(series, markers);
  }, [closedTrades, candles, symbol, epoch]);

  /* ---------------- price scale (%, log, auto, invert) ---------------- */
  useEffect(() => {
    const chart = chartRef.current;
    const series = seriesRef.current;
    if (!chart || !series) return;
    chart.priceScale("right").applyOptions({
      mode: scale.mode === "log" ? PriceScaleMode.Logarithmic : scale.mode === "percent" ? PriceScaleMode.Percentage : PriceScaleMode.Normal,
      invertScale: scale.invert,
      autoScale: scale.auto,
    });
  }, [scale, epoch]);

  /* ---------------- cursor flavour ---------------- */
  useEffect(() => {
    const chart = chartRef.current;
    const el = containerRef.current;
    if (!chart || !el) return;
    const lines = tool !== "dot" && tool !== "pointer";
    chart.applyOptions({
      crosshair: {
        vertLine: { visible: lines, labelVisible: true },
        horzLine: { visible: lines, labelVisible: true },
      },
    });
    el.classList.toggle("tv-cursor-dot", tool === "dot");
    el.style.cursor =
      selectingBar ? "col-resize"
        : tool === "zoom" ? "zoom-in"
          : tool === "eraser" ? "not-allowed"
            : tool && tool !== "cursor" && tool !== "crosshair" && tool !== "dot" && tool !== "pointer" ? "crosshair" : "";
  }, [tool, selectingBar, epoch]);

  /* ---------------- chart commands from toolbars ---------------- */
  useEffect(() => {
    return onChartCommand((cmd) => {
      const chart = chartRef.current;
      const proj = projRef.current;
      if (!chart || !proj) return;
      const cs = candlesRef.current;
      const lastIdx = Math.max(0, cs.length - 1);
      const frame = (fromIdx: number) => {
        chart.timeScale().setVisibleLogicalRange({ from: fromIdx, to: lastIdx + 14 });
        useBacktest.getState().setScale({ auto: true });
        seriesRef.current?.priceScale().setAutoScale(true);
      };
      if (cmd.type === "reset") {
        const w = chart.paneSize().width || 900;
        const bars = Math.max(30, Math.floor(w / 8));
        chart.timeScale().setVisibleLogicalRange({ from: lastIdx - bars * 0.72, to: lastIdx + bars * 0.28 });
        useBacktest.getState().setScale({ auto: true, invert: false });
        seriesRef.current?.priceScale().setAutoScale(true);
      } else if (cmd.type === "scroll-latest") {
        chart.timeScale().scrollToRealTime();
      } else if (cmd.type === "range") {
        if (cs.length === 0) return;
        const last = cs[lastIdx].time;
        let from = cs[0].time;
        if (cmd.seconds === "ytd") {
          from = Date.UTC(new Date(last * 1000).getUTCFullYear(), 0, 1) / 1000;
        } else if (cmd.seconds !== "all") {
          from = last - cmd.seconds;
        }
        frame(Math.max(-5, Math.floor(proj.timeToLogical(from))));
      } else if (cmd.type === "goto") {
        const l = proj.timeToLogical(cmd.time);
        const half = Math.max(30, Math.floor((chart.paneSize().width || 900) / 16));
        chart.timeScale().setVisibleLogicalRange({ from: l - half, to: l + half });
      } else if (cmd.type === "screenshot") {
        const canvas = chart.takeScreenshot(true);
        if (cmd.mode === "download") {
          canvas.toBlob((blob) => {
            if (!blob) return;
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `${symbolRef.current}_${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.png`;
            a.click();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
          });
        } else {
          canvas.toBlob((blob) => {
            if (!blob || !navigator.clipboard || typeof ClipboardItem === "undefined") return;
            void navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]).catch(() => undefined);
          });
        }
      }
    });
  }, []);

  /* ---------------- replay "Jump to" guide line ---------------- */
  useEffect(() => {
    const el = containerRef.current;
    const line = selectLineRef.current;
    if (!el || !line || !selectingBar) return;
    const move = (e: PointerEvent) => {
      const r = el.getBoundingClientRect();
      line.style.transform = `translateX(${Math.round(e.clientX - r.left)}px)`;
      line.style.opacity = "1";
    };
    el.addEventListener("pointermove", move);
    return () => { el.removeEventListener("pointermove", move); line.style.opacity = "0"; };
  }, [selectingBar]);

  /* ---------------- right-click ---------------- */
  const onContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const el = containerRef.current, proj = projRef.current, series = seriesRef.current;
    if (!el || !proj || !series) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const { w, h } = proj.paneSize();
    if (x < 0 || y < 0 || x > w || y > h) return;
    const raw = series.coordinateToPrice(y);
    if (raw === null) return;
    const hit = controllerRef.current?.hitAt({ x, y });
    if (hit) useBacktest.getState().selectDrawing(hit.d.id);
    const tk = tickRef.current || 0.25;
    setMenu({
      price: Math.round(raw / tk) * tk,
      time: proj.xToTime(x) ?? 0,
      drawingId: hit?.d.id ?? null,
      clientX: e.clientX - (wrapRef.current?.getBoundingClientRect().left ?? 0),
      clientY: e.clientY - (wrapRef.current?.getBoundingClientRect().top ?? 0),
    });
  }, []);

  /* ---------------- legend ---------------- */
  const bar = useMemo(() => {
    if (candles.length === 0) return null;
    let idx = candles.length - 1;
    if (hoverTime !== null) {
      let lo = 0, hi = candles.length - 1, ans = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (candles[mid].time <= hoverTime) { ans = mid; lo = mid + 1; } else hi = mid - 1;
      }
      if (ans >= 0) idx = ans;
    }
    const c = candles[idx];
    const prevClose = idx > 0 ? candles[idx - 1].close : c.open;
    return { c, change: c.close - prevClose, pct: prevClose ? ((c.close - prevClose) / prevClose) * 100 : 0 };
  }, [candles, hoverTime]);

  const last = candles.length ? candles[candles.length - 1].close : null;
  const canTrade = status === "paused" || status === "running";
  const { up: upCol, down: dnCol } = candleColorsFor(theme, appearance);
  const legendColor = bar ? (bar.c.close >= bar.c.open ? upCol : dnCol) : pal.text;
  const tfLabel = timeframe.replace(/^(\d+)m$/, "$1").replace("1D", "D");

  /* ---------------- text drawing editor ---------------- */
  const commitText = (value: string) => {
    if (!textEdit) return;
    const st = useBacktest.getState();
    const v = value.trim();
    if (!v) st.removeDrawing(symbol, textEdit.id);
    else st.updateDrawing(symbol, textEdit.id, { text: v }, true);
    setTextEdit(null);
  };

  return (
    <div ref={wrapRef} className="tv-chart-wrap" style={{ background: pal.bg }} onContextMenu={onContextMenu}>
      <div ref={containerRef} className="tv-chart-canvas" />
      <IndicatorLayer chartRef={chartRef} candles={candles} epoch={epoch} />

      {/* Legend + quick trade (top-left, like TradingView) */}
      {appearance.showLegend && (
        <div className="tv-legend" style={{ color: pal.text }}>
          <div className="tv-legend-row">
            <span className="tv-legend-title">{spec?.name ?? symbol}</span>
            <span className="tv-legend-dot">·</span>
            <span>{tfLabel}</span>
            <span className="tv-legend-dot">·</span>
            <span>{spec?.exchange ?? ""}</span>
            {bar && !isPriceType(chartType) && (
              <span className="tv-legend-ohlc" style={{ color: legendColor }}>
                <span>O<b>{fmtPrice(bar.c.open)}</b></span>
                <span>H<b>{fmtPrice(bar.c.high)}</b></span>
                <span>L<b>{fmtPrice(bar.c.low)}</b></span>
                <span>C<b>{fmtPrice(bar.c.close)}</b></span>
                <span>{fmtSigned(bar.change)} ({bar.pct >= 0 ? "+" : "−"}{Math.abs(bar.pct).toFixed(2)}%)</span>
              </span>
            )}
            {bar && isPriceType(chartType) && (
              <span className="tv-legend-ohlc" style={{ color: legendColor }}>
                <span>C<b>{fmtPrice(bar.c.close)}</b></span>
                <span>{fmtSigned(bar.change)} ({bar.pct >= 0 ? "+" : "−"}{Math.abs(bar.pct).toFixed(2)}%)</span>
              </span>
            )}
          </div>

          {appearance.showTradePill && last !== null && (
            <div className="tv-pill">
              <button
                type="button" disabled={!canTrade} className="tv-pill-sell"
                onClick={() => placeOrder("sell", orderQty)} title={`Sell ${orderQty} at market (Shift+S)`}
              >
                <b>{fmtPrice(last)}</b><span>SELL</span>
              </button>
              <input
                aria-label="Quantity" className="tv-pill-qty" type="number" min={1} value={orderQty}
                onChange={(e) => setOrderQty(Number(e.target.value))}
              />
              <button
                type="button" disabled={!canTrade} className="tv-pill-buy"
                onClick={() => placeOrder("buy", orderQty)} title={`Buy ${orderQty} at market (Shift+B)`}
              >
                <b>{fmtPrice(last)}</b><span>BUY</span>
              </button>
            </div>
          )}
          <IndicatorLegend candles={candles} onOpen={() => useIndicators.getState().setPanel(true)} />
        </div>
      )}

      {/* Live P&L tag on every open position + one-click SL / TP / close */}
      <PositionTags
        symbol={symbol} chartRef={chartRef} seriesRef={seriesRef} candlesRef={candlesRef}
        tick={tickSize} epoch={epoch}
        onSetRisk={(id, u) => riskCbRef.current?.(id, u)}
      />

      {/* Properties toolbar for the selected drawing */}
      <DrawingToolbar symbol={symbol} />

      {/* Replay "Jump to" guide */}
      <div ref={selectLineRef} className={cn("tv-select-line", selectingBar && "is-on")}>
        <span>Click a bar to jump there</span>
      </div>

      {textEdit && (
        <textarea
          autoFocus
          className="tv-text-edit"
          style={{ left: textEdit.x, top: textEdit.y - 12 }}
          defaultValue={textEdit.value}
          placeholder="Add text"
          onBlur={(e) => commitText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") { e.preventDefault(); setTextEdit(null); const st = useBacktest.getState(); if (!textEdit.value) st.removeDrawing(symbol, textEdit.id); }
            else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commitText((e.target as HTMLTextAreaElement).value); }
          }}
        />
      )}

      {menu && (
        <ChartContextMenu
          target={menu}
          x={menu.clientX}
          y={menu.clientY}
          symbol={symbol}
          lastPrice={last}
          onClose={() => setMenu(null)}
        />
      )}
    </div>
  );
}

export type { DrawingObject, Logical };

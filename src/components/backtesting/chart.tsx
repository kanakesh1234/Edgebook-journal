"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import {
  createChart,
  CandlestickSeries,
  createSeriesMarkers,
  type IChartApi,
  type ISeriesApi,
  type CandlestickData,
  type UTCTimestamp,
  type IPriceLine,
  type SeriesMarker,
  type Time,
  ColorType,
  CrosshairMode,
  LineStyle,
} from "lightweight-charts";
import type { CandleData } from "@/lib/backtesting/data/types";
import type { SimPosition, SimOrder, SimTrade } from "@/lib/backtesting/engine/order-engine";
import type { DrawingObject } from "@/lib/backtesting/types";
import { useTheme } from "@/lib/theme";
import { uid } from "@/lib/utils";

interface ChartProps {
  candles: CandleData[];
  symbol: string;
  openPositions?: SimPosition[];
  pendingOrders?: SimOrder[];
  closedTrades?: SimTrade[];
  drawings?: DrawingObject[];
  activeDrawingTool?: string | null;
  onDrawingAdded?: (drawing: DrawingObject) => void;
  onCrosshairMove?: (data: { time: number; open: number; high: number; low: number; close: number; volume: number } | null) => void;
  /** Tick size for the active instrument — dragged prices snap to this. */
  tickSize?: number;
  /** Called (live, while dragging) and once more on release with the final price. */
  onUpdatePositionRisk?: (
    positionOrderId: string,
    updates: { stopLoss?: number | null; takeProfit?: number | null },
  ) => void;
  onUpdatePendingOrderPrice?: (orderId: string, price: number) => void;
}

type DraggableKind = "sl" | "tp" | "order";

interface DraggableLine {
  id: string; // positionOrderId or pending order id
  kind: DraggableKind;
  price: number;
  line: IPriceLine;
}

const DARK_THEME = {
  background: "#131722",
  textColor: "#d1d4dc",
  gridColor: "#1e222d",
  borderColor: "#2a2e39",
  crosshairColor: "#758696",
  upColor: "#26a69a",
  downColor: "#ef5350",
};

const LIGHT_THEME = {
  background: "#ffffff",
  textColor: "#131722",
  gridColor: "#e1e3eb",
  borderColor: "#d1d4dc",
  crosshairColor: "#9598a1",
  upColor: "#26a69a",
  downColor: "#ef5350",
};

export default function BacktestChart({
  candles,
  symbol,
  openPositions = [],
  pendingOrders = [],
  closedTrades = [],
  drawings = [],
  activeDrawingTool,
  onDrawingAdded,
  onCrosshairMove,
  tickSize = 0.25,
  onUpdatePositionRisk,
  onUpdatePendingOrderPrice,
}: ChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLinesRef = useRef<IPriceLine[]>([]);
  const draggableLinesRef = useRef<DraggableLine[]>([]);
  const dragStateRef = useRef<{ id: string; kind: DraggableKind } | null>(null);
  const markersPluginRef = useRef<{ setMarkers: (markers: SeriesMarker<Time>[]) => void } | null>(null);
  const { resolved: theme } = useTheme();
  const [legendData, setLegendData] = useState<{ o: number; h: number; l: number; c: number } | null>(null);

  const onUpdatePositionRiskRef = useRef(onUpdatePositionRisk);
  onUpdatePositionRiskRef.current = onUpdatePositionRisk;
  const onUpdatePendingOrderPriceRef = useRef(onUpdatePendingOrderPrice);
  onUpdatePendingOrderPriceRef.current = onUpdatePendingOrderPrice;
  const tickSizeRef = useRef(tickSize);
  tickSizeRef.current = tickSize;

  const snapToTick = useCallback((price: number) => {
    const t = tickSizeRef.current || 0.01;
    return Math.round(price / t) * t;
  }, []);

  const findNearbyLine = useCallback((y: number): DraggableLine | null => {
    const series = seriesRef.current;
    if (!series) return null;
    const HIT_TOLERANCE_PX = 6;
    for (const dl of draggableLinesRef.current) {
      const coord = series.priceToCoordinate(dl.price);
      if (coord !== null && Math.abs(coord - y) <= HIT_TOLERANCE_PX) return dl;
    }
    return null;
  }, []);

  const colors = theme === "dark" ? DARK_THEME : LIGHT_THEME;

  // Initialize chart
  useEffect(() => {
    if (!containerRef.current) return;

    const chart = createChart(containerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: colors.background },
        textColor: colors.textColor,
        fontFamily: "'Inter', sans-serif",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: colors.gridColor },
        horzLines: { color: colors.gridColor },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: colors.crosshairColor, width: 1, style: 3, labelBackgroundColor: colors.crosshairColor },
        horzLine: { color: colors.crosshairColor, width: 1, style: 3, labelBackgroundColor: colors.crosshairColor },
      },
      rightPriceScale: {
        borderColor: colors.borderColor,
        scaleMargins: { top: 0.08, bottom: 0.08 },
      },
      timeScale: {
        borderColor: colors.borderColor,
        timeVisible: true,
        secondsVisible: false,
        rightOffset: 5,
        barSpacing: 8,
      },
      handleScroll: { vertTouchDrag: false },
    });

    const series = chart.addSeries(CandlestickSeries, {
      upColor: colors.upColor,
      downColor: colors.downColor,
      borderUpColor: colors.upColor,
      borderDownColor: colors.downColor,
      wickUpColor: colors.upColor,
      wickDownColor: colors.downColor,
    });

    // Crosshair move handler
    chart.subscribeCrosshairMove((param) => {
      if (!param.time || !param.seriesData.has(series)) {
        setLegendData(null);
        onCrosshairMove?.(null);
        return;
      }
      const data = param.seriesData.get(series) as CandlestickData;
      if (data) {
        const legend = { o: data.open, h: data.high, l: data.low, c: data.close };
        setLegendData(legend);
        onCrosshairMove?.({
          time: data.time as number,
          open: data.open,
          high: data.high,
          low: data.low,
          close: data.close,
          volume: 0,
        });
      }
    });

    // Chart click handler for drawing tools
    chart.subscribeClick((param) => {
      if (!activeDrawingTool || activeDrawingTool === 'cursor' || activeDrawingTool === 'crosshair') return;
      if (!param.point || !param.time) return;

      const price = series.coordinateToPrice(param.point.y);
      if (price === null) return;

      if (activeDrawingTool === 'horizontal-line') {
        onDrawingAdded?.({
          id: uid('drw'),
          type: 'horizontal-line',
          points: [{ time: param.time as number, price }],
          color: '#FFD700',
          lineWidth: 1,
          label: price.toFixed(2),
        });
      }
    });

    chartRef.current = chart;
    seriesRef.current = series;

    // Resize observer
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        chart.resize(width, height);
      }
    });
    ro.observe(containerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
      priceLinesRef.current = [];
      markersPluginRef.current = null;
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [theme]);

  // Update candle data
  useEffect(() => {
    if (!seriesRef.current || candles.length === 0) return;
    const lwcData: CandlestickData[] = candles.map((c) => ({
      time: c.time as UTCTimestamp,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
    }));
    seriesRef.current.setData(lwcData);
  }, [candles]);

  // Update order lines (positions, pending orders, SL/TP)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series) return;

    // Remove old price lines
    for (const line of priceLinesRef.current) {
      try { series.removePriceLine(line); } catch { /* line may already be gone */ }
    }
    priceLinesRef.current = [];
    draggableLinesRef.current = [];

    // Draw open position lines
    for (const pos of openPositions) {
      if (pos.symbol !== symbol) continue;

      // Entry line (not draggable — entry price is fixed once filled)
      const entryLine = series.createPriceLine({
        price: pos.entryPrice,
        color: pos.side === 'buy' ? '#26a69a' : '#ef5350',
        lineWidth: 2,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: true,
        title: `${pos.side === 'buy' ? 'LONG' : 'SHORT'} ${pos.quantity} @ ${pos.entryPrice.toFixed(2)}`,
      });
      priceLinesRef.current.push(entryLine);

      // SL line — draggable
      if (pos.stopLoss) {
        const slLine = series.createPriceLine({
          price: pos.stopLoss,
          color: '#ef5350',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `SL ${pos.stopLoss.toFixed(2)} ⇕`,
        });
        priceLinesRef.current.push(slLine);
        draggableLinesRef.current.push({ id: pos.orderId, kind: 'sl', price: pos.stopLoss, line: slLine });
      }

      // TP line — draggable
      if (pos.takeProfit) {
        const tpLine = series.createPriceLine({
          price: pos.takeProfit,
          color: '#26a69a',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: true,
          title: `TP ${pos.takeProfit.toFixed(2)} ⇕`,
        });
        priceLinesRef.current.push(tpLine);
        draggableLinesRef.current.push({ id: pos.orderId, kind: 'tp', price: pos.takeProfit, line: tpLine });
      }
    }

    // Draw pending order lines — trigger price is draggable
    for (const order of pendingOrders) {
      if (order.symbol !== symbol || !order.price) continue;
      const orderLine = series.createPriceLine({
        price: order.price,
        color: order.side === 'buy' ? '#26a69a80' : '#ef535080',
        lineWidth: 2,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: true,
        title: `${order.type.toUpperCase()} ${order.side.toUpperCase()} ${order.quantity} ⇕`,
      });
      priceLinesRef.current.push(orderLine);
      draggableLinesRef.current.push({ id: order.id, kind: 'order', price: order.price, line: orderLine });
    }

    // Draw user drawings (horizontal lines)
    for (const drawing of drawings) {
      if (drawing.type === 'horizontal-line' && drawing.points[0]) {
        const line = series.createPriceLine({
          price: drawing.points[0].price,
          color: drawing.color || '#FFD700',
          lineWidth: (drawing.lineWidth || 1) as 1 | 2 | 3 | 4,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: drawing.label || '',
        });
        priceLinesRef.current.push(line);
      }
    }
  }, [openPositions, pendingOrders, drawings, symbol]);

  // Pointer-drag handling for SL/TP/pending-order lines. Runs on the raw
  // DOM container rather than lightweight-charts' own click/crosshair APIs
  // since we need continuous move tracking + a hit-test against known
  // line prices, not just chart-native click events.
  useEffect(() => {
    const container = containerRef.current;
    const chart = chartRef.current;
    if (!container || !chart) return;

    function handlePointerDown(e: PointerEvent) {
      if (e.button !== 0) return;
      const rect = container!.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const hit = findNearbyLine(y);
      if (!hit) return;

      e.preventDefault();
      e.stopPropagation();
      dragStateRef.current = { id: hit.id, kind: hit.kind };
      chart!.applyOptions({ handleScroll: false, handleScale: false });
      container!.setPointerCapture(e.pointerId);
      container!.style.cursor = 'ns-resize';
    }

    function handlePointerMove(e: PointerEvent) {
      const rect = container!.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const series = seriesRef.current;

      const dragging = dragStateRef.current;
      if (!dragging || !series) {
        // Not dragging — just update hover cursor when near a draggable line.
        const hit = findNearbyLine(y);
        container!.style.cursor = hit ? 'ns-resize' : 'default';
        return;
      }

      const rawPrice = series.coordinateToPrice(y);
      if (rawPrice === null) return;
      const price = snapToTick(rawPrice);

      // Live-update the visual line so it tracks the cursor while dragging.
      const dl = draggableLinesRef.current.find(
        (d) => d.id === dragging.id && d.kind === dragging.kind,
      );
      if (dl) {
        dl.price = price;
        dl.line.applyOptions({
          price,
          title: dl.kind === 'sl'
            ? `SL ${price.toFixed(2)} ⇕`
            : dl.kind === 'tp'
              ? `TP ${price.toFixed(2)} ⇕`
              : `${price.toFixed(2)} ⇕`,
        });
      }
    }

    function handlePointerUp(e: PointerEvent) {
      const dragging = dragStateRef.current;
      if (!dragging) return;

      const dl = draggableLinesRef.current.find(
        (d) => d.id === dragging.id && d.kind === dragging.kind,
      );

      if (dl) {
        if (dl.kind === 'sl') {
          onUpdatePositionRiskRef.current?.(dl.id, { stopLoss: dl.price });
        } else if (dl.kind === 'tp') {
          onUpdatePositionRiskRef.current?.(dl.id, { takeProfit: dl.price });
        } else if (dl.kind === 'order') {
          onUpdatePendingOrderPriceRef.current?.(dl.id, dl.price);
        }
      }

      dragStateRef.current = null;
      chart!.applyOptions({ handleScroll: { vertTouchDrag: false }, handleScale: true });
      try { container!.releasePointerCapture(e.pointerId); } catch { /* already released */ }
      container!.style.cursor = 'default';
    }

    container.addEventListener('pointerdown', handlePointerDown);
    container.addEventListener('pointermove', handlePointerMove);
    container.addEventListener('pointerup', handlePointerUp);
    function handlePointerLeave() {
      // Only reset hover cursor, not an active drag (pointer capture keeps
      // pointerup firing on the container even if the cursor leaves it).
      if (!dragStateRef.current) container!.style.cursor = 'default';
    }
    container.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      container.removeEventListener('pointerdown', handlePointerDown);
      container.removeEventListener('pointermove', handlePointerMove);
      container.removeEventListener('pointerup', handlePointerUp);
      container.removeEventListener('pointerleave', handlePointerLeave);
    };
  }, [findNearbyLine, snapToTick]);

  // Trade markers (buy/sell arrows on entry/exit candles)
  useEffect(() => {
    const series = seriesRef.current;
    if (!series || candles.length === 0) return;

    const markers: SeriesMarker<Time>[] = [];

    for (const trade of closedTrades) {
      if (trade.symbol !== symbol) continue;

      // Entry marker
      markers.push({
        time: trade.entryTime as UTCTimestamp,
        position: trade.side === 'buy' ? 'belowBar' : 'aboveBar',
        color: trade.side === 'buy' ? '#26a69a' : '#ef5350',
        shape: trade.side === 'buy' ? 'arrowUp' : 'arrowDown',
        text: `${trade.side === 'buy' ? 'BUY' : 'SELL'} ${trade.quantity}`,
      });

      // Exit marker
      if (trade.exitTime) {
        markers.push({
          time: trade.exitTime as UTCTimestamp,
          position: trade.side === 'buy' ? 'aboveBar' : 'belowBar',
          color: trade.netPnl >= 0 ? '#26a69a' : '#ef5350',
          shape: trade.side === 'buy' ? 'arrowDown' : 'arrowUp',
          text: `EXIT ${trade.netPnl >= 0 ? '+' : ''}${trade.netPnl.toFixed(0)}`,
        });
      }
    }

    // Sort markers by time (required by lightweight-charts)
    markers.sort((a, b) => (a.time as number) - (b.time as number));

    // Use v5 createSeriesMarkers API
    if (markersPluginRef.current) {
      markersPluginRef.current.setMarkers(markers);
    } else if (markers.length > 0) {
      markersPluginRef.current = createSeriesMarkers(series, markers);
    }
  }, [closedTrades, candles, symbol]);

  // Color-code OHLC change
  const priceColor = legendData
    ? legendData.c >= legendData.o ? colors.upColor : colors.downColor
    : colors.textColor;

  // Cursor style based on active drawing tool
  const cursorStyle = activeDrawingTool && activeDrawingTool !== 'cursor' && activeDrawingTool !== 'crosshair'
    ? 'crosshair' : 'default';

  return (
    <div className="relative h-full w-full" style={{ cursor: cursorStyle }}>
      {/* OHLC Legend overlay */}
      <div className="absolute left-3 top-2 z-10 flex items-center gap-3 text-[12px] font-mono" style={{ color: colors.textColor }}>
        <span className="font-semibold">{symbol}</span>
        {legendData && (
          <>
            <span>O <span style={{ color: priceColor }}>{legendData.o.toFixed(2)}</span></span>
            <span>H <span style={{ color: priceColor }}>{legendData.h.toFixed(2)}</span></span>
            <span>L <span style={{ color: priceColor }}>{legendData.l.toFixed(2)}</span></span>
            <span>C <span style={{ color: priceColor }}>{legendData.c.toFixed(2)}</span></span>
          </>
        )}
      </div>
      <div ref={containerRef} className="h-full w-full" />
    </div>
  );
}

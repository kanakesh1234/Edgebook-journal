"use client";

import { useEffect, useMemo, useRef } from "react";
import { HistogramSeries, LineSeries, LineStyle, type IChartApi, type ISeriesApi, type UTCTimestamp } from "lightweight-charts";
import type { CandleData } from "@/lib/backtesting/data/types";
import { useIndicators } from "@/lib/backtesting/indicator-store";
import { CATALOG, compute, label, type IndicatorInst, type Line } from "@/lib/backtesting/indicators";
import { I } from "./tv-icons";

interface Built { inst: IndicatorInst; lines: Array<{ line: Line; series: ISeriesApi<"Line" | "Histogram"> }> }

const toData = (candles: CandleData[], l: Line) => {
  const out: Array<{ time: UTCTimestamp; value: number; color?: string }> = [];
  for (let i = 0; i < candles.length; i++) {
    const v = l.values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    out.push(l.colors ? { time: candles[i].time as UTCTimestamp, value: v, color: l.colors[i] } : { time: candles[i].time as UTCTimestamp, value: v });
  }
  return out;
};

/** Draws the user's indicators on the chart. Renders nothing; owns its series. */
export function IndicatorLayer({ chartRef, candles, epoch }: { chartRef: React.MutableRefObject<IChartApi | null>; candles: CandleData[]; epoch: number }) {
  const list = useIndicators((s) => s.list);
  const builtRef = useRef<Built[]>([]);
  const chartOfRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef(candles); candlesRef.current = candles;

  // Only what changes the SET of series (not the data) → rebuild.
  const structKey = useMemo(() => list.filter((i) => i.visible).map((i) => `${i.id}:${i.params.join(",")}:${i.color}`).join("|"), [list]);

  // Structure: create / remove series + panes.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    // A re-initialised chart already destroyed the old series; only remove from a live one.
    if (chartOfRef.current === chart) for (const b of builtRef.current) for (const { series } of b.lines) { try { chart.removeSeries(series); } catch { /* gone */ } }
    chartOfRef.current = chart;
    builtRef.current = [];

    let pane = 0;
    for (const inst of list) {
      if (!inst.visible) continue;
      const def = CATALOG[inst.kind];
      const paneIdx = def.pane ? ++pane : 0;
      const lines = compute(inst.kind, inst.params, []); // shape only (keys / types)
      const built: Built = { inst, lines: [] };
      for (const l of lines) {
        const series = l.type === "hist"
          ? chart.addSeries(HistogramSeries, {
              priceLineVisible: false, lastValueVisible: false,
              ...(inst.kind === "volume" ? { priceScaleId: "", priceFormat: { type: "volume" as const } } : {}),
            }, paneIdx)
          : chart.addSeries(LineSeries, {
              color: l.color ?? inst.color, lineWidth: (l.width ?? 2) as 1 | 2, lineStyle: l.dashed ? LineStyle.Dashed : LineStyle.Solid,
              priceLineVisible: false, lastValueVisible: paneIdx > 0, crosshairMarkerVisible: false,
            }, paneIdx);
        if (inst.kind === "volume") series.priceScale().applyOptions({ scaleMargins: { top: 0.82, bottom: 0 } });
        built.lines.push({ line: l, series: series as ISeriesApi<"Line" | "Histogram"> });
      }
      builtRef.current.push(built);
    }
    try {
      const panes = chart.panes();
      panes.forEach((p, i) => p.setStretchFactor(i === 0 ? 4 : 1));
    } catch { /* older API */ }
    // Fill immediately with the current candles.
    fill();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [structKey, epoch]);

  function fill() {
    const c = candlesRef.current;
    for (const b of builtRef.current) {
      const lines = compute(b.inst.kind, b.inst.params, c);
      lines.forEach((l, i) => {
        const s = b.lines[i]?.series;
        if (!s) return;
        if (l.type === "line" && (l.color ?? null) === null) { /* instance colour already set */ }
        s.setData(toData(c, l) as never);
      });
    }
  }

  // Data: every replay step / history load.
  useEffect(() => { fill(); }, [candles]);

  // Tear down on unmount only when the chart is still alive.
  useEffect(() => () => {
    const chart = chartOfRef.current;
    if (chart && chartRef.current === chart) for (const b of builtRef.current) for (const { series } of b.lines) { try { chart.removeSeries(series); } catch { /* gone */ } }
    builtRef.current = [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

const fmt = (v: number | null | undefined, kind: string) =>
  v === null || v === undefined || !Number.isFinite(v) ? "—" : kind === "volume" ? (v >= 1000 ? `${(v / 1000).toFixed(2)}K` : String(Math.round(v))) : v.toFixed(2);

/** Legend rows (name + latest values + eye / settings / remove). Lives inside the chart legend. */
export function IndicatorLegend({ candles, onOpen }: { candles: CandleData[]; onOpen: () => void }) {
  const list = useIndicators((s) => s.list);
  const update = useIndicators((s) => s.update);
  const remove = useIndicators((s) => s.remove);
  const values = useMemo(() => {
    const m = new Map<string, Array<{ v: number | null; color: string }>>();
    for (const inst of list) {
      if (!inst.visible || candles.length === 0) continue;
      m.set(inst.id, compute(inst.kind, inst.params, candles).filter((l) => l.key !== "hist" || inst.kind === "volume").map((l) => ({ v: l.values[candles.length - 1] ?? null, color: l.color ?? inst.color })));
    }
    return m;
  }, [list, candles]);

  if (list.length === 0) return null;
  return (
    <div className="tv-ind-legend">
      {list.map((i) => (
        <div key={i.id} className={`tv-ind-row${i.visible ? "" : " is-off"}`}>
          <span className="tv-ind-name">{label(i)}</span>
          {(values.get(i.id) ?? []).map((x, k) => <b key={k} style={{ color: x.color }}>{fmt(x.v, i.kind)}</b>)}
          <span className="tv-ind-actions">
            <button type="button" data-tip={i.visible ? "Hide" : "Show"} aria-label={i.visible ? "Hide indicator" : "Show indicator"} onClick={() => update(i.id, { visible: !i.visible })}>{i.visible ? <I name="eye" size={14} /> : <I name="eyeOff" size={14} />}</button>
            <button type="button" data-tip="Settings" aria-label="Indicator settings" onClick={onOpen}><I name="settings" size={14} /></button>
            <button type="button" data-tip="Remove" aria-label="Remove indicator" onClick={() => remove(i.id)}><I name="close" size={14} /></button>
          </span>
        </div>
      ))}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useRef } from "react";
import type { IChartApi, ISeriesApi, SeriesType } from "lightweight-charts";
import type { CandleData } from "@/lib/backtesting/data/types";
import { useBacktest } from "@/lib/backtesting/store";
import { formatMoney } from "@/lib/format";
import { fmtPrice } from "./drawings/render";

/** Live (mid-drag / just-released) state shared with the chart's pointer handlers. */
export interface LiveHandle {
  price: number;
  origin: number;
  dragging: boolean;
  magnet: { label: string; price: number } | null;
  settleAt: number;
}

interface Item {
  key: string; // `${kind}:${id}` — same key the chart's drag code uses
  id: string;
  kind: "sl" | "tp" | "order";
  price: number;
  entry?: number;
  long: boolean;
  qty: number;
  tag: string;
}

interface Props {
  symbol: string;
  chartRef: React.MutableRefObject<IChartApi | null>;
  seriesRef: React.MutableRefObject<ISeriesApi<SeriesType> | null>;
  candlesRef: React.MutableRefObject<CandleData[]>;
  liveRef: React.MutableRefObject<Record<string, LiveHandle>>;
  hoverRef: React.MutableRefObject<string | null>;
  pointValue: number;
  epoch: number;
  onRemove: (id: string, kind: "sl" | "tp") => void;
}

const sign = (n: number) => (n >= 0 ? "+" : "−");
const setText = (el: Element | null, s: string) => { if (el && el.textContent !== s) el.textContent = s; };

/**
 * EJ risk handles: floating labels, subtle guides and an entry→level zone for every
 * Stop / Target / pending order. DOM-only, positioned by one rAF loop straight from the
 * series' price scale, so it tracks scroll / zoom / autoscale / replay ticks with no React work.
 * The labels are display-only — dragging is handled by the chart's pointer code.
 */
export default function RiskHandles({ symbol, chartRef, seriesRef, candlesRef, liveRef, hoverRef, pointValue, epoch, onRemove }: Props) {
  const positions = useBacktest((s) => s.openPositions);
  const orders = useBacktest((s) => s.pendingOrders);
  const rootRef = useRef<HTMLDivElement>(null);

  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const p of positions) {
      if (p.symbol !== symbol) continue;
      const long = p.side === "buy";
      if (p.stopLoss) out.push({ key: `sl:${p.orderId}`, id: p.orderId, kind: "sl", price: p.stopLoss, entry: p.entryPrice, long, qty: p.quantity, tag: "SL" });
      if (p.takeProfit) out.push({ key: `tp:${p.orderId}`, id: p.orderId, kind: "tp", price: p.takeProfit, entry: p.entryPrice, long, qty: p.quantity, tag: "TP" });
    }
    for (const o of orders) {
      if (o.symbol !== symbol || !o.price) continue;
      out.push({ key: `order:${o.id}`, id: o.id, kind: "order", price: o.price, long: o.side === "buy", qty: o.quantity, tag: `${o.side === "buy" ? "Buy" : "Sell"} ${o.type}` });
    }
    return out;
  }, [positions, orders, symbol]);

  const has = items.length > 0;

  useEffect(() => {
    if (!has) return;
    let raf = 0;
    const loop = () => {
      const series = seriesRef.current, chart = chartRef.current, root = rootRef.current;
      if (series && chart && root) {
        const { width: pw, height: ph } = chart.paneSize();
        if (root.style.width !== `${pw}px`) root.style.width = `${pw}px`;
        const last = candlesRef.current.at(-1)?.close;
        const ptag = root.parentElement?.querySelector<HTMLElement>(".tv-ptag");
        const now = performance.now();

        for (const el of Array.from(root.children) as HTMLElement[]) {
          const key = el.dataset.key || "";
          let live: LiveHandle | undefined = liveRef.current[key];
          const dp = parseFloat(el.dataset.price || "NaN");
          if (live && !live.dragging && Math.abs(live.price - dp) < 1e-9) { delete liveRef.current[key]; live = undefined; }
          const price = live ? live.price : dp;
          const y = series.priceToCoordinate(price);
          if (y === null || y < -6 || y > ph + 6) { el.style.display = "none"; continue; }
          const yy = Math.round(y);
          el.style.display = "block";
          el.style.transform = `translate3d(0,${yy}px,0)`;

          const kind = el.dataset.kind;
          const dragging = !!live?.dragging;
          el.classList.toggle("is-drag", dragging);
          el.classList.toggle("is-hover", !dragging && hoverRef.current === key);
          el.classList.toggle("is-settle", !!live && !live.dragging && now - live.settleAt < 460);

          setText(el.querySelector(".ej-rh-price"), fmtPrice(price));

          const entry = parseFloat(el.dataset.entry || "NaN");
          const qty = parseFloat(el.dataset.qty || "1");
          const long = el.dataset.long === "1";
          const pnlEl = el.querySelector(".ej-rh-pnl"), ptsEl = el.querySelector(".ej-rh-pts");
          const zone = el.querySelector<HTMLElement>(".ej-rh-zone");
          let ey: number | null = null;
          if (kind !== "order" && Number.isFinite(entry)) {
            const pts = long ? price - entry : entry - price;
            const money = pts * pointValue * qty;
            setText(pnlEl, `${sign(money)}${formatMoney(Math.abs(money))}`);
            setText(ptsEl, `${sign(pts)}${Math.abs(pts).toFixed(2)} pts`);
            ey = series.priceToCoordinate(entry);
          } else {
            setText(pnlEl, "");
            setText(ptsEl, last !== undefined ? `${sign(price - last)}${Math.abs(price - last).toFixed(2)} from last` : "");
          }
          if (zone) {
            if (ey === null) zone.style.display = "none";
            else {
              zone.style.display = "block";
              zone.style.top = `${Math.min(0, ey - y)}px`;
              zone.style.height = `${Math.abs(ey - y)}px`;
            }
          }

          // Ghost of where the level was before the drag started.
          const ghost = el.querySelector<HTMLElement>(".ej-rh-ghost");
          if (ghost) {
            const oy = live && dragging ? series.priceToCoordinate(live.origin) : null;
            if (oy === null) ghost.style.display = "none";
            else { ghost.style.display = "block"; ghost.style.transform = `translateY(${Math.round(oy) - yy}px)`; }
          }

          // Magnet chip.
          const snap = el.querySelector<HTMLElement>(".ej-rh-snap");
          if (snap) {
            const m = dragging ? live?.magnet : null;
            snap.classList.toggle("is-on", !!m);
            if (m) setText(snap.querySelector("span"), `${m.label} ${fmtPrice(m.price)}`);
          }

          // Keep clear of the position tag when the level sits right next to the entry line.
          const label = el.querySelector<HTMLElement>(".ej-rh-label");
          if (label) {
            let near = false;
            if (ptag && Number.isFinite(entry)) {
              const eyy = series.priceToCoordinate(entry);
              near = eyy !== null && Math.abs(eyy - y) < 34;
            }
            const right = near && ptag ? ptag.offsetWidth + 20 : 12;
            const rs = `${right}px`;
            if (label.style.right !== rs) label.style.right = rs;
          }
        }
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [has, chartRef, seriesRef, candlesRef, liveRef, hoverRef, pointValue, epoch]);

  if (!has) return null;
  return (
    <div ref={rootRef} className="ej-rh-root" aria-hidden="true">
      {items.map((it) => (
        <div
          key={it.key} className={`ej-rh ${it.kind}`}
          data-key={it.key} data-kind={it.kind} data-price={it.price}
          data-entry={it.entry ?? ""} data-qty={it.qty} data-long={it.long ? "1" : "0"}
        >
          <i className="ej-rh-zone" />
          <i className="ej-rh-ghost" />
          <i className="ej-rh-line" />
          <div className="ej-rh-label">
            <span className="ej-rh-grip" />
            <span className="ej-rh-kind">{it.tag}</span>
            <span className="ej-rh-price" />
            <span className="ej-rh-pnl" />
            <span className="ej-rh-pts" />
            {it.kind !== "order" && (
              <button
                type="button" className="ej-rh-x" data-tip={it.kind === "sl" ? "Remove stop loss" : "Remove take profit"} aria-label={it.kind === "sl" ? "Remove stop loss" : "Remove take profit"}
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => onRemove(it.id, it.kind as "sl" | "tp")}
              >×</button>
            )}
          </div>
          <div className="ej-rh-snap"><i /><span /></div>
        </div>
      ))}
    </div>
  );
}

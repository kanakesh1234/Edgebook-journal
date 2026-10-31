"use client";

import { useEffect, useRef } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { uid } from "@/lib/utils";
import { TOOLS } from "@/lib/backtesting/drawings/tools";
import { emitChartCommand } from "./chart-bus";
import { fmtPrice } from "./drawings/render";
import { focusFirstItem, onMenuKeyDown } from "./tv-ui";
import { toast } from "./ej-toast";

export interface ContextTarget {
  price: number;
  time: number;
  drawingId: string | null;
}

interface Props {
  target: ContextTarget;
  x: number;
  y: number;
  symbol: string;
  lastPrice: number | null;
  onClose: () => void;
}

/** Right-click menu: place orders at the clicked price, add alerts/lines, manage drawings. */
export default function ChartContextMenu({ target, x, y, symbol, lastPrice, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const st = useBacktest.getState();
  const qty = st.orderQty;
  const canTrade = st.status === "paused" || st.status === "running";
  const drawing = target.drawingId ? (st.drawings[symbol] || []).find((d) => d.id === target.drawingId) : null;

  useEffect(() => { focusFirstItem(ref.current); }, []);
  useEffect(() => {
    const away = (e: Event) => { if (!ref.current?.contains(e.target as Node)) onClose(); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", key);
    window.addEventListener("wheel", onClose, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", away, true);
      window.removeEventListener("keydown", key);
      window.removeEventListener("wheel", onClose);
    };
  }, [onClose]);

  const run = (fn: () => void) => () => { fn(); onClose(); };
  const p = target.price;
  const above = lastPrice !== null && p > lastPrice;
  const price = fmtPrice(p);

  const items: Array<{ label: string; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean } | "sep"> = [];

  if (drawing) {
    items.push(
      { label: `Clone ${TOOLS[drawing.type].label.toLowerCase()}`, hint: "Ctrl+V", onClick: run(() => st.cloneDrawing(symbol, drawing.id)) },
      { label: drawing.locked ? "Unlock" : "Lock", onClick: run(() => st.updateDrawing(symbol, drawing.id, { locked: !drawing.locked })) },
      { label: "Hide", onClick: run(() => st.updateDrawing(symbol, drawing.id, { hidden: true })) },
      { label: "Remove", hint: "Del", danger: true, disabled: !!drawing.locked, onClick: run(() => st.removeDrawing(symbol, drawing.id)) },
      "sep",
    );
  }

  if (lastPrice !== null) {
    items.push(
      { label: `Buy ${qty} ${symbol} @ market`, hint: "Shift+B", disabled: !canTrade, onClick: run(() => st.placeOrder("buy", qty)) },
      { label: `Sell ${qty} ${symbol} @ market`, hint: "Shift+S", disabled: !canTrade, onClick: run(() => st.placeOrder("sell", qty)) },
    );
    if (above) {
      items.push(
        { label: `Sell ${qty} ${symbol} @ ${price} limit`, disabled: !canTrade, onClick: run(() => st.placeOrder("sell", qty, { type: "limit", price: p })) },
        { label: `Buy ${qty} ${symbol} @ ${price} stop`, disabled: !canTrade, onClick: run(() => st.placeOrder("buy", qty, { type: "stop", price: p })) },
      );
    } else {
      items.push(
        { label: `Buy ${qty} ${symbol} @ ${price} limit`, disabled: !canTrade, onClick: run(() => st.placeOrder("buy", qty, { type: "limit", price: p })) },
        { label: `Sell ${qty} ${symbol} @ ${price} stop`, disabled: !canTrade, onClick: run(() => st.placeOrder("sell", qty, { type: "stop", price: p })) },
      );
    }
    items.push("sep");
  }

  items.push(
    { label: `Copy price ${price}`, onClick: run(() => { void navigator.clipboard?.writeText(p.toFixed(2)).then(() => toast({ text: `Copied ${price}` })).catch(() => {}); }) },
    "sep",
    {
      label: `Add alert on ${symbol} at ${price}`, 
      onClick: run(() => { st.addAlert(symbol, p, lastPrice !== null && p < lastPrice ? "down" : "up"); toast({ text: `Alert set · ${symbol} at ${price}` }); }),
    },
    {
      label: `Draw horizontal line at ${price}`,
      onClick: run(() => {
        const def = TOOLS["horizontal-line"];
        st.addDrawing(symbol, { id: uid("drw"), type: "horizontal-line", points: [{ time: target.time, price: p }], color: def.color, lineWidth: def.lineWidth });
      }),
    },
    "sep",
    { label: "Reset chart view", hint: "Alt+R", onClick: run(() => emitChartCommand({ type: "reset" })) },
    { label: st.drawingsHidden ? "Show all drawings" : "Hide all drawings", onClick: run(() => st.setDrawingsHidden(!st.drawingsHidden)) },
  );
  const drawCount = (st.drawings[symbol] || []).length;
  if (drawCount > 0) items.push({ label: `Remove ${drawCount} drawing${drawCount === 1 ? "" : "s"}`, danger: true, onClick: run(() => { st.clearDrawings(symbol); toast({ kind: "info", text: `Removed ${drawCount} drawing${drawCount === 1 ? "" : "s"}`, action: { label: "Undo", run: () => useBacktest.getState().undoDrawing(symbol) } }); }) });
  items.push("sep", { label: "Settings…", onClick: run(() => emitChartCommand({ type: "settings" })) });

  // Keep the menu on screen.
  const left = Math.min(x, (ref.current?.parentElement?.clientWidth ?? 1200) - 300);
  const top = Math.min(y, (ref.current?.parentElement?.clientHeight ?? 800) - items.length * 30 - 20);

  return (
    <div ref={ref} className="tv-menu tv-ctx" role="menu" aria-label="Chart actions" onKeyDown={(e) => onMenuKeyDown(e, ref.current, onClose)} style={{ left: Math.max(4, left), top: Math.max(4, top) }} onContextMenu={(e) => e.preventDefault()}>
      {items.map((it, i) =>
        it === "sep" ? <div key={i} className="tv-menu-sep" role="separator" /> : (
          <button key={i} type="button" role="menuitem" className={`tv-menu-item${it.danger ? " is-danger" : ""}`} disabled={it.disabled} onClick={it.onClick}>
            <span className="ej-clip" data-tip={it.label.length > 34 ? it.label : undefined}>{it.label}</span>
            {it.hint && <kbd>{it.hint}</kbd>}
          </button>
        ),
      )}
    </div>
  );
}

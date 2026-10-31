"use client";

import { useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { instrumentBySymbol } from "@/lib/backtesting/instruments";
import type { OrderType } from "@/lib/backtesting/types";
import { I } from "./tv-icons";

/** TradingView-style order ticket: market / limit / stop with optional stop loss and take profit. */
export default function OrderTicket({ onClose }: { onClose: () => void }) {
  const symbol = useBacktest((s) => s.activeInstrument);
  const status = useBacktest((s) => s.status);
  const qty = useBacktest((s) => s.orderQty);
  const setQty = useBacktest((s) => s.setOrderQty);
  const placeOrder = useBacktest((s) => s.placeOrder);
  const hasPosition = useBacktest((s) => s.openPositions.some((p) => p.symbol === s.activeInstrument));
  const flatten = useBacktest((s) => s.closePositionForSymbol);

  const [type, setType] = useState<OrderType>("market");
  const [price, setPrice] = useState("");
  const [sl, setSl] = useState("");
  const [tp, setTp] = useState("");
  const spec = instrumentBySymbol(symbol);
  const step = spec?.tickSize ?? 0.25;
  const canTrade = status === "paused" || status === "running";
  const needsPrice = type !== "market";
  const priceOk = !needsPrice || parseFloat(price) > 0;

  const submit = (side: "buy" | "sell") => {
    const opts: { type?: OrderType; price?: number; stopLoss?: number; takeProfit?: number } = {};
    if (needsPrice) { opts.type = type; opts.price = parseFloat(price); }
    if (parseFloat(sl) > 0) opts.stopLoss = parseFloat(sl);
    if (parseFloat(tp) > 0) opts.takeProfit = parseFloat(tp);
    placeOrder(side, qty, opts);
  };

  return (
    <div className="tv-ticket" role="dialog" aria-label="Order ticket" onKeyDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
      {/* Mobile drag handle */}
      <div aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 2, background: "var(--tv-hair)", margin: "0 auto 8px", flexShrink: 0 }} />
      <h4>
        <span>{symbol} <small>{spec ? `$${spec.tickValue}/tick` : ""}</small></span>
        <button type="button" className="tv-tbtn" style={{ height: 44, minWidth: 44, touchAction: "manipulation" }} onClick={onClose} aria-label="Close order ticket" data-tip="Close"><I name="close" size={16} /></button>
      </h4>
      <div className="tv-seg" role="radiogroup" aria-label="Order type">
        {(["market", "limit", "stop"] as OrderType[]).map((t) => (
          <button key={t} type="button" role="radio" aria-checked={type === t} className={type === t ? "is-on" : ""} style={{ touchAction: "manipulation" }} onClick={() => setType(t)}>{t}</button>
        ))}
      </div>
      {needsPrice && (
        <label className="tv-field"><span>{type === "limit" ? "Limit price" : "Stop price"}</span>
          <input type="number" inputMode="decimal" step={step} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Price" style={{ fontSize: 16 }} />
        </label>
      )}
      <label className="tv-field"><span>Units</span>
        <div className="tv-qty">
          <button type="button" aria-label="Decrease units" onClick={() => setQty(qty - 1)}>−</button>
          <input type="number" inputMode="decimal" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} style={{ fontSize: 16 }} />
          <button type="button" aria-label="Increase units" onClick={() => setQty(qty + 1)}>+</button>
        </div>
      </label>
      <div className="tv-row">
        <label className="tv-field"><span>Stop loss</span><input type="number" inputMode="decimal" step={step} value={sl} onChange={(e) => setSl(e.target.value)} placeholder="Price" style={{ fontSize: 16 }} /></label>
        <label className="tv-field"><span>Take profit</span><input type="number" inputMode="decimal" step={step} value={tp} onChange={(e) => setTp(e.target.value)} placeholder="Price" style={{ fontSize: 16 }} /></label>
      </div>
      <div className="tv-ticket-actions">
        <button type="button" className="tv-btn-sell" style={{ touchAction: "manipulation" }} disabled={!canTrade || !priceOk} onClick={() => submit("sell")}>Sell</button>
        <button type="button" className="tv-btn-buy" style={{ touchAction: "manipulation" }} disabled={!canTrade || !priceOk} onClick={() => submit("buy")}>Buy</button>
      </div>
      {hasPosition && <button type="button" className="tv-btn-flat" style={{ touchAction: "manipulation" }} onClick={() => flatten(symbol)}>Close position</button>}
    </div>
  );
}

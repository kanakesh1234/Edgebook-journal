"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { pnlClass } from "@/components/ui/misc";
import { useBacktest } from "@/lib/backtesting/store";
import { instrumentBySymbol } from "@/lib/backtesting/instruments";
import type { OrderType } from "@/lib/backtesting/types";

/**
 * Right-side trading panel: order entry with market/limit/stop + SL/TP,
 * position monitoring, pending orders, and account overview.
 */
export default function TradingPanel() {
  const activeInstrument = useBacktest((s) => s.activeInstrument);
  const status = useBacktest((s) => s.status);
  const openPositions = useBacktest((s) => s.openPositions);
  const pendingOrders = useBacktest((s) => s.pendingOrders);
  const accountState = useBacktest((s) => s.accountState);
  const closedTrades = useBacktest((s) => s.closedTrades);
  const placeOrder = useBacktest((s) => s.placeOrder);
  const closePositionForSymbol = useBacktest((s) => s.closePositionForSymbol);
  const cancelPendingOrder = useBacktest((s) => s.cancelPendingOrder);

  const [quantity, setQuantity] = useState(1);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState<string>("");
  const [stopLoss, setStopLoss] = useState<string>("");
  const [takeProfit, setTakeProfit] = useState<string>("");

  const spec = instrumentBySymbol(activeInstrument);
  const activePosition = openPositions.find((p) => p.symbol === activeInstrument);
  const canTrade = status === "paused" || status === "running";

  const handlePlaceOrder = (side: "buy" | "sell") => {
    const opts: { type?: OrderType; price?: number; stopLoss?: number; takeProfit?: number } = {};
    if (orderType !== "market") {
      opts.type = orderType;
      opts.price = parseFloat(limitPrice) || undefined;
    }
    if (stopLoss) opts.stopLoss = parseFloat(stopLoss);
    if (takeProfit) opts.takeProfit = parseFloat(takeProfit);
    placeOrder(side, quantity, opts);
  };

  const symbolTrades = closedTrades.filter(t => t.symbol === activeInstrument);
  const recentTrades = symbolTrades.slice(-5).reverse();

  return (
    <div className="flex w-60 shrink-0 flex-col gap-2 overflow-y-auto border-l border-white/10 bg-[#131722] p-2.5">
      {/* Order entry */}
      <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
        <div className="flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-white/40">
            {activeInstrument || "—"}
          </p>
          <p className="text-[10px] text-white/30">
            {spec ? `$${spec.tickValue}/tick` : ""}
          </p>
        </div>

        {/* Order type selector */}
        <div className="flex gap-0.5 rounded-md bg-white/5 p-0.5">
          {(["market", "limit", "stop"] as OrderType[]).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setOrderType(type)}
              className={cn(
                "flex-1 rounded px-2 py-1 text-[10px] font-medium uppercase transition-colors",
                orderType === type
                  ? "bg-gold/20 text-gold"
                  : "text-white/40 hover:text-white/60",
              )}
            >
              {type}
            </button>
          ))}
        </div>

        {/* Limit/Stop price input */}
        {orderType !== "market" && (
          <div>
            <label className="text-[9px] uppercase tracking-wider text-white/30">
              {orderType === "limit" ? "Limit Price" : "Stop Price"}
            </label>
            <input
              type="number"
              step={spec?.tickSize || 0.25}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder="Price"
              className="mt-0.5 h-7 w-full rounded border border-white/10 bg-white/5 px-2 text-[12px] font-mono text-white outline-none focus:border-gold/50"
            />
          </div>
        )}

        {/* Quantity */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="grid h-7 w-7 shrink-0 place-items-center rounded border border-white/10 text-[13px] text-white/60 hover:bg-white/10"
          >
            −
          </button>
          <input
            type="number"
            min={1}
            value={quantity}
            onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
            className="h-7 w-full rounded border border-white/10 bg-white/5 text-center text-[12px] font-mono text-white outline-none focus:border-gold/50"
          />
          <button
            type="button"
            onClick={() => setQuantity((q) => q + 1)}
            className="grid h-7 w-7 shrink-0 place-items-center rounded border border-white/10 text-[13px] text-white/60 hover:bg-white/10"
          >
            +
          </button>
        </div>

        {/* SL/TP inputs */}
        <div className="grid grid-cols-2 gap-1.5">
          <div>
            <label className="text-[9px] uppercase tracking-wider text-white/30">Stop Loss</label>
            <input
              type="number"
              step={spec?.tickSize || 0.25}
              value={stopLoss}
              onChange={(e) => setStopLoss(e.target.value)}
              placeholder="SL"
              className="mt-0.5 h-6 w-full rounded border border-white/10 bg-white/5 px-1.5 text-[11px] font-mono text-loss outline-none focus:border-loss/50"
            />
          </div>
          <div>
            <label className="text-[9px] uppercase tracking-wider text-white/30">Take Profit</label>
            <input
              type="number"
              step={spec?.tickSize || 0.25}
              value={takeProfit}
              onChange={(e) => setTakeProfit(e.target.value)}
              placeholder="TP"
              className="mt-0.5 h-6 w-full rounded border border-white/10 bg-white/5 px-1.5 text-[11px] font-mono text-profit outline-none focus:border-profit/50"
            />
          </div>
        </div>

        {/* Buy / Sell buttons */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            disabled={!canTrade}
            onClick={() => handlePlaceOrder("buy")}
            className="rounded-lg bg-profit/90 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-profit disabled:cursor-not-allowed disabled:opacity-30"
          >
            Buy
          </button>
          <button
            type="button"
            disabled={!canTrade}
            onClick={() => handlePlaceOrder("sell")}
            className="rounded-lg bg-loss/90 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-loss disabled:cursor-not-allowed disabled:opacity-30"
          >
            Sell
          </button>
        </div>

        {/* Flatten position */}
        {activePosition && (
          <button
            type="button"
            onClick={() => closePositionForSymbol(activeInstrument)}
            className="w-full rounded-lg border border-white/15 py-1.5 text-[11px] font-medium text-white/70 hover:bg-white/10"
          >
            Flatten position
          </button>
        )}
      </div>

      {/* Account overview */}
      {accountState && (
        <div className="space-y-1 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Account</p>
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <StatRow label="Equity" value={formatMoney(accountState.equity)} />
            <StatRow label="Balance" value={formatMoney(accountState.balance)} />
            <StatRow label="Daily P&L" value={formatMoney(accountState.dailyPnl)} className={pnlClass(accountState.dailyPnl)} />
            <StatRow label="Net P&L" value={formatMoney(accountState.netPnl)} className={pnlClass(accountState.netPnl)} />
            <StatRow label="Drawdown" value={formatMoney(accountState.currentDrawdown)} className="text-loss" />
            <StatRow label="Win Rate" value={`${(accountState.winRate * 100).toFixed(0)}%`} />
          </div>
          {accountState.breached && accountState.breachInfo && (
            <div className="mt-1 rounded border border-loss/30 bg-loss/10 px-2 py-1">
              <p className="text-[10px] font-semibold text-loss">
                ⚠ {accountState.breachInfo.reason}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Open positions */}
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
          Positions ({openPositions.length})
        </p>
        {openPositions.length === 0 ? (
          <p className="text-[10px] text-white/20">No open positions</p>
        ) : (
          openPositions.map((p) => (
            <div key={p.orderId} className="rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1 text-[11px] font-semibold text-white/80">
                  {p.symbol}
                  <span className={cn(
                    "rounded px-1 py-0.5 text-[8px] font-bold uppercase",
                    p.side === "buy" ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
                  )}>
                    {p.side === "buy" ? "L" : "S"} {p.quantity}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => closePositionForSymbol(p.symbol)}
                  className="text-[9px] text-white/40 hover:text-white/80"
                >
                  Close
                </button>
              </div>
              <div className="mt-0.5 flex items-center justify-between text-[10px] font-mono text-white/50">
                <span>@ {p.entryPrice.toFixed(2)}</span>
                <span className={pnlClass(p.unrealizedPnl)}>
                  {p.unrealizedPnl >= 0 ? "+" : ""}{formatMoney(p.unrealizedPnl)}
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pending orders */}
      {pendingOrders.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Orders ({pendingOrders.length})
          </p>
          {pendingOrders.map((o) => (
            <div key={o.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/[0.02] p-2">
              <div className="text-[10px] text-white/60">
                <span className="font-semibold text-white/80">{o.symbol}</span>{" "}
                {o.side} {o.quantity} @ {o.type}
                {o.price != null ? ` ${o.price.toFixed(2)}` : ""}
              </div>
              <button
                type="button"
                onClick={() => cancelPendingOrder(o.symbol, o.id)}
                className="text-[9px] text-white/40 hover:text-white/80"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Recent trades */}
      {recentTrades.length > 0 && (
        <div className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">
            Recent ({symbolTrades.length} total)
          </p>
          {recentTrades.map((t) => (
            <div key={t.orderId} className="rounded border border-white/5 bg-white/[0.01] px-2 py-1">
              <div className="flex items-center justify-between text-[10px]">
                <span className={cn("font-semibold", t.side === 'buy' ? 'text-profit/70' : 'text-loss/70')}>
                  {t.side === 'buy' ? 'L' : 'S'}{t.quantity}
                </span>
                <span className={cn("font-mono font-semibold", pnlClass(t.netPnl))}>
                  {t.netPnl >= 0 ? '+' : ''}{formatMoney(t.netPnl)}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div>
      <p className="text-[8px] uppercase tracking-wider text-white/25">{label}</p>
      <p className={cn("text-[11px] font-mono font-semibold text-white/70", className)}>{value}</p>
    </div>
  );
}

"use client";

import { useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { formatMoney } from "@/lib/format";
import { fmtDuration, fmtPrice } from "./drawings/render";
import { I } from "./tv-icons";
import AnimatedNumber from "./ej-number";
import EJMark from "./ej-mark";

type Tab = "summary" | "positions" | "orders" | "history";

const nyStamp = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const pnlCls = (v: number) => (v > 0 ? "tv-up" : v < 0 ? "tv-down" : "");
export const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatMoney(Math.abs(v))}`;

/** TradingView's "Paper Trading" bottom panel: account summary, positions, orders, history. */
export default function PaperPanel() {
  const open = useBacktest((s) => s.tradePanelOpen);
  const setOpen = useBacktest((s) => s.setTradePanelOpen);
  const account = useBacktest((s) => s.accountState);
  const positions = useBacktest((s) => s.openPositions);
  const orders = useBacktest((s) => s.pendingOrders);
  const trades = useBacktest((s) => s.closedTrades);
  const candleData = useBacktest((s) => s.candleData);
  const closePosition = useBacktest((s) => s.closePositionForSymbol);
  const cancelOrder = useBacktest((s) => s.cancelPendingOrder);
  const [tab, setTab] = useState<Tab>("positions");

  const lastOf = (sym: string) => (candleData[sym] || []).at(-1)?.close;
  const pick = (t: Tab) => { setTab(t); setOpen(true); };

  return (
    <div className="tv-paper">
      <div className="tv-paper-bar">
        {/* Mobile drag handle */}
        <div aria-hidden="true" style={{ width: 36, height: 4, borderRadius: 2, background: "var(--tv-hair)", margin: "4px auto 0", flexShrink: 0 }} />
        <button type="button" className="tv-paper-title" aria-expanded={open} aria-controls="ej-paper-body" data-tip={open ? "Collapse panel" : "Expand panel"} style={{ touchAction: "manipulation" }} onClick={() => setOpen(!open)}>
          <EJMark size={18} title="" />Paper Trading
          <I name="chevronDown" size={16} className="ej-chev" style={{ transform: open ? "none" : "rotate(-90deg)" }} />
        </button>
        {account && (
          <div className="tv-paper-stats">
            <span>Balance<b><AnimatedNumber tau={320} value={account.balance} format={formatMoney} /></b></span>
            <span>Equity<b><AnimatedNumber tau={320} value={account.equity} format={formatMoney} /></b></span>
            <span>Open P&amp;L<b className={pnlCls(account.openPnl)}><AnimatedNumber tau={320} value={account.openPnl} format={signed} /></b></span>
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="tv-tabs" role="tablist" aria-label="Paper trading">
            {([
              ["summary", "Account Summary", null],
              ["positions", "Positions", positions.length],
              ["orders", "Orders", orders.length],
              ["history", "Order History", trades.length],
            ] as Array<[Tab, string, number | null]>).map(([id, label, n]) => (
              <button key={id} type="button" role="tab" aria-selected={tab === id} className={`tv-tab${tab === id ? " is-on" : ""}`} style={{ touchAction: "manipulation" }} onClick={() => pick(id)}>
                {label}{n !== null && <em>{n}</em>}
              </button>
            ))}
          </div>
          <div className="tv-table-wrap" id="ej-paper-body" role="tabpanel">
            {tab === "summary" && account && (
              <div className="tv-summary">
                <div><span>Balance</span><b><AnimatedNumber tau={320} value={account.balance} format={formatMoney} /></b></div>
                <div><span>Equity</span><b><AnimatedNumber tau={320} value={account.equity} format={formatMoney} /></b></div>
                <div><span>Net P&amp;L</span><b className={pnlCls(account.netPnl)}><AnimatedNumber tau={320} value={account.netPnl} format={signed} /></b></div>
                <div><span>Daily P&amp;L</span><b className={pnlCls(account.dailyPnl)}>{signed(account.dailyPnl)}</b></div>
                <div><span>Open P&amp;L</span><b className={pnlCls(account.openPnl)}><AnimatedNumber tau={320} value={account.openPnl} format={signed} /></b></div>
                <div><span>Drawdown</span><b className="tv-down">{formatMoney(account.currentDrawdown)}</b></div>
                <div><span>Win rate</span><b>{(account.winRate * 100).toFixed(0)}%</b></div>
                <div><span>Profit factor</span><b>{account.profitFactor ? account.profitFactor.toFixed(2) : "—"}</b></div>
                <div><span>Trades</span><b>{account.totalTrades}</b></div>
                <div><span>Largest win</span><b className="tv-up">{formatMoney(account.largestWin)}</b></div>
                <div><span>Largest loss</span><b className="tv-down">{formatMoney(account.largestLoss)}</b></div>
                {account.breached && account.breachInfo && <div><span>Breach</span><b className="tv-down">{account.breachInfo.reason}</b></div>}
              </div>
            )}

            {tab === "positions" && (positions.length === 0 ? <div className="tv-empty"><EJMark size={28} title="" /><b>No open positions</b><span>Buy or sell from the chart — your position shows up here.</span></div> : (
              <table className="tv-table">
                <thead><tr><th>Symbol</th><th>Side</th><th className="num">Qty</th><th className="num">Avg fill</th><th className="num">Last</th><th className="num">Stop</th><th className="num">Target</th><th className="num">Unrealized P&amp;L</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.orderId}>
                      <td data-label="Symbol"><b>{p.symbol}</b></td>
                      <td data-label="Side" className={p.side === "buy" ? "tv-up" : "tv-down"}>{p.side === "buy" ? "Long" : "Short"}</td>
                      <td data-label="Qty" className="num">{p.quantity}</td>
                      <td data-label="Avg fill" className="num">{fmtPrice(p.entryPrice)}</td>
                      <td data-label="Last" className="num">{lastOf(p.symbol) !== undefined ? fmtPrice(lastOf(p.symbol)!) : "—"}</td>
                      <td data-label="Stop" className="num">{p.stopLoss ? fmtPrice(p.stopLoss) : "—"}</td>
                      <td data-label="Target" className="num">{p.takeProfit ? fmtPrice(p.takeProfit) : "—"}</td>
                      <td data-label="P&L" className={`num ${pnlCls(p.unrealizedPnl)}`}>{signed(p.unrealizedPnl)}</td>
                      <td data-label="" className="num"><button type="button" className="tv-linkbtn" style={{ touchAction: "manipulation", minHeight: 44, minWidth: 44 }} aria-label={`Close ${p.symbol} position`} onClick={() => closePosition(p.symbol, p.orderId)}>Close</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            {tab === "orders" && (orders.length === 0 ? <div className="tv-empty"><EJMark size={28} title="" /><b>No working orders</b><span>Limit and stop orders wait here until price reaches them.</span></div> : (
              <table className="tv-table">
                <thead><tr><th>Symbol</th><th>Side</th><th>Type</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Stop</th><th className="num">Target</th><th aria-label="Actions" /></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td data-label="Symbol"><b>{o.symbol}</b></td>
                      <td data-label="Side" className={o.side === "buy" ? "tv-up" : "tv-down"}>{o.side === "buy" ? "Buy" : "Sell"}</td>
                      <td data-label="Type" style={{ textTransform: "capitalize" }}>{o.type}</td>
                      <td data-label="Qty" className="num">{o.quantity}</td>
                      <td data-label="Price" className="num">{o.price != null ? fmtPrice(o.price) : "Market"}</td>
                      <td data-label="Stop" className="num">{o.stopLoss ? fmtPrice(o.stopLoss) : "—"}</td>
                      <td data-label="Target" className="num">{o.takeProfit ? fmtPrice(o.takeProfit) : "—"}</td>
                      <td data-label="" className="num"><button type="button" className="tv-linkbtn" style={{ touchAction: "manipulation", minHeight: 44, minWidth: 44 }} aria-label={`Cancel ${o.symbol} order`} onClick={() => cancelOrder(o.symbol, o.id)}>Cancel</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            {tab === "history" && (trades.length === 0 ? <div className="tv-empty"><EJMark size={28} title="" /><b>No closed trades yet</b><span>Closed trades build your history.</span></div> : (
              <table className="tv-table">
                <thead><tr><th>Symbol</th><th>Side</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Exit</th><th>Opened</th><th>Held</th><th className="num">Net P&amp;L</th></tr></thead>
                <tbody>
                  {[...trades].reverse().map((t) => (
                    <tr key={t.orderId + t.entryTime}>
                      <td data-label="Symbol"><b>{t.symbol}</b></td>
                      <td data-label="Side" className={t.side === "buy" ? "tv-up" : "tv-down"}>{t.side === "buy" ? "Long" : "Short"}</td>
                      <td data-label="Qty" className="num">{t.quantity}</td>
                      <td data-label="Entry" className="num">{fmtPrice(t.entryPrice)}</td>
                      <td data-label="Exit" className="num">{t.exitPrice != null ? fmtPrice(t.exitPrice) : "—"}</td>
                      <td data-label="Opened">{nyStamp.format(new Date(t.entryTime * 1000))}</td>
                      <td data-label="Held">{t.exitTime ? fmtDuration(t.exitTime - t.entryTime) : "—"}</td>
                      <td data-label="P&L" className={`num ${pnlCls(t.netPnl)}`}>{signed(t.netPnl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

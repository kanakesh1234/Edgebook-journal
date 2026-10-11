"use client";

import { useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { formatMoney } from "@/lib/format";
import { fmtDuration, fmtPrice } from "./drawings/render";
import { I } from "./tv-icons";

type Tab = "summary" | "positions" | "orders" | "history";

const nyStamp = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
const pnlCls = (v: number) => (v > 0 ? "tv-up" : v < 0 ? "tv-down" : "");
const signed = (v: number) => `${v > 0 ? "+" : v < 0 ? "−" : ""}${formatMoney(Math.abs(v))}`;

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
        <button type="button" className="tv-paper-title" onClick={() => setOpen(!open)}>
          <span className="tv-logo" />Paper Trading
          <I name="chevronDown" size={16} style={{ transform: open ? "none" : "rotate(180deg)" }} />
        </button>
        {account && (
          <div className="tv-paper-stats">
            <span>Balance<b>{formatMoney(account.balance)}</b></span>
            <span>Equity<b>{formatMoney(account.equity)}</b></span>
            <span>Open P&amp;L<b className={pnlCls(account.openPnl)}>{signed(account.openPnl)}</b></span>
          </div>
        )}
      </div>

      {open && (
        <>
          <div className="tv-tabs">
            {([
              ["summary", "Account Summary", null],
              ["positions", "Positions", positions.length],
              ["orders", "Orders", orders.length],
              ["history", "Order History", trades.length],
            ] as Array<[Tab, string, number | null]>).map(([id, label, n]) => (
              <button key={id} type="button" className={`tv-tab${tab === id ? " is-on" : ""}`} onClick={() => pick(id)}>
                {label}{n !== null && <em>{n}</em>}
              </button>
            ))}
          </div>
          <div className="tv-table-wrap">
            {tab === "summary" && account && (
              <div className="tv-summary">
                <div><span>Balance</span><b>{formatMoney(account.balance)}</b></div>
                <div><span>Equity</span><b>{formatMoney(account.equity)}</b></div>
                <div><span>Net P&amp;L</span><b className={pnlCls(account.netPnl)}>{signed(account.netPnl)}</b></div>
                <div><span>Daily P&amp;L</span><b className={pnlCls(account.dailyPnl)}>{signed(account.dailyPnl)}</b></div>
                <div><span>Open P&amp;L</span><b className={pnlCls(account.openPnl)}>{signed(account.openPnl)}</b></div>
                <div><span>Drawdown</span><b className="tv-down">{formatMoney(account.currentDrawdown)}</b></div>
                <div><span>Win rate</span><b>{(account.winRate * 100).toFixed(0)}%</b></div>
                <div><span>Profit factor</span><b>{account.profitFactor ? account.profitFactor.toFixed(2) : "—"}</b></div>
                <div><span>Trades</span><b>{account.totalTrades}</b></div>
                <div><span>Largest win</span><b className="tv-up">{formatMoney(account.largestWin)}</b></div>
                <div><span>Largest loss</span><b className="tv-down">{formatMoney(account.largestLoss)}</b></div>
                {account.breached && account.breachInfo && <div><span>Breach</span><b className="tv-down">{account.breachInfo.reason}</b></div>}
              </div>
            )}

            {tab === "positions" && (positions.length === 0 ? <div className="tv-empty">No open positions</div> : (
              <table className="tv-table">
                <thead><tr><th>Symbol</th><th>Side</th><th className="num">Qty</th><th className="num">Avg fill</th><th className="num">Last</th><th className="num">Stop</th><th className="num">Target</th><th className="num">Unrealized P&amp;L</th><th /></tr></thead>
                <tbody>
                  {positions.map((p) => (
                    <tr key={p.orderId}>
                      <td><b>{p.symbol}</b></td>
                      <td className={p.side === "buy" ? "tv-up" : "tv-down"}>{p.side === "buy" ? "Long" : "Short"}</td>
                      <td className="num">{p.quantity}</td>
                      <td className="num">{fmtPrice(p.entryPrice)}</td>
                      <td className="num">{lastOf(p.symbol) !== undefined ? fmtPrice(lastOf(p.symbol)!) : "—"}</td>
                      <td className="num">{p.stopLoss ? fmtPrice(p.stopLoss) : "—"}</td>
                      <td className="num">{p.takeProfit ? fmtPrice(p.takeProfit) : "—"}</td>
                      <td className={`num ${pnlCls(p.unrealizedPnl)}`}>{signed(p.unrealizedPnl)}</td>
                      <td className="num"><button type="button" className="tv-linkbtn" onClick={() => closePosition(p.symbol)}>Close</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            {tab === "orders" && (orders.length === 0 ? <div className="tv-empty">No working orders</div> : (
              <table className="tv-table">
                <thead><tr><th>Symbol</th><th>Side</th><th>Type</th><th className="num">Qty</th><th className="num">Price</th><th className="num">Stop</th><th className="num">Target</th><th /></tr></thead>
                <tbody>
                  {orders.map((o) => (
                    <tr key={o.id}>
                      <td><b>{o.symbol}</b></td>
                      <td className={o.side === "buy" ? "tv-up" : "tv-down"}>{o.side === "buy" ? "Buy" : "Sell"}</td>
                      <td style={{ textTransform: "capitalize" }}>{o.type}</td>
                      <td className="num">{o.quantity}</td>
                      <td className="num">{o.price != null ? fmtPrice(o.price) : "Market"}</td>
                      <td className="num">{o.stopLoss ? fmtPrice(o.stopLoss) : "—"}</td>
                      <td className="num">{o.takeProfit ? fmtPrice(o.takeProfit) : "—"}</td>
                      <td className="num"><button type="button" className="tv-linkbtn" onClick={() => cancelOrder(o.symbol, o.id)}>Cancel</button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}

            {tab === "history" && (trades.length === 0 ? <div className="tv-empty">No closed trades yet</div> : (
              <table className="tv-table">
                <thead><tr><th>Symbol</th><th>Side</th><th className="num">Qty</th><th className="num">Entry</th><th className="num">Exit</th><th>Opened</th><th>Held</th><th className="num">Net P&amp;L</th></tr></thead>
                <tbody>
                  {[...trades].reverse().map((t) => (
                    <tr key={t.orderId + t.entryTime}>
                      <td><b>{t.symbol}</b></td>
                      <td className={t.side === "buy" ? "tv-up" : "tv-down"}>{t.side === "buy" ? "Long" : "Short"}</td>
                      <td className="num">{t.quantity}</td>
                      <td className="num">{fmtPrice(t.entryPrice)}</td>
                      <td className="num">{t.exitPrice != null ? fmtPrice(t.exitPrice) : "—"}</td>
                      <td>{nyStamp.format(new Date(t.entryTime * 1000))}</td>
                      <td>{t.exitTime ? fmtDuration(t.exitTime - t.entryTime) : "—"}</td>
                      <td className={`num ${pnlCls(t.netPnl)}`}>{signed(t.netPnl)}</td>
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

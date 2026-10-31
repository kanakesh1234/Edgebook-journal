"use client";

import { useBacktest } from "@/lib/backtesting/store";
import { formatMoney } from "@/lib/format";

const signed = (n: number) => `${n >= 0 ? "+" : "−"}${formatMoney(Math.abs(n))}`;
const tone = (n: number) => (n > 0 ? "up" : n < 0 ? "down" : "");

/**
 * Shown only in a session opened from a journal entry ("Replay this trade").
 * Tells the trader what will happen, shows the live P&L while the trade runs,
 * and compares the replay result with what the journal recorded.
 */
export default function ReplayTradeBanner() {
  const ref = useBacktest((s) => s.config?.replayTrade);
  const script = useBacktest((s) => s.tradeScript);
  const openPnl = useBacktest((s) => s.accountState?.openPnl ?? 0);
  const trades = useBacktest((s) => s.closedTrades);
  const setTradeScript = useBacktest((s) => s.setTradeScript);
  if (!ref) return null;

  // Net P&L of the trade(s) booked by this replay so far (after commission).
  const replayPnl = trades.reduce((sum, t) => sum + t.netPnl, 0);

  let body: React.ReactNode;
  if (script === "pending") {
    body = <>Press play — your <b>{ref.entryClock}</b> entry fires automatically{ref.entryPrice != null ? <> at <b>{ref.entryPrice}</b></> : null}.</>;
  } else if (script === "open") {
    body = <>Trade running · open P&amp;L <b className={`tv-rt-pnl ${tone(openPnl)}`}>{signed(openPnl)}</b>{ref.exitClock ? <> · exits {ref.exitClock}</> : null}</>;
  } else if (script === "done") {
    body = (
      <>
        Trade closed · replay <b className={`tv-rt-pnl ${tone(replayPnl)}`}>{signed(replayPnl)}</b>
        <span className="tv-rt-sep">·</span>journal <b className={`tv-rt-pnl ${tone(ref.journalPnl)}`}>{signed(ref.journalPnl)}</b>
      </>
    );
  } else {
    body = <>Practice mode — trade this setup yourself.</>;
  }

  return (
    <div className="tv-rtbanner" role="status">
      <span className="tv-rt-label">{ref.label}</span>
      <span className="tv-rt-body">{body}</span>
      {script === "pending" && (
        <button type="button" className="tv-rt-btn" onClick={() => setTradeScript(false)} data-tip="Skip the scripted trade and take it yourself">
          Trade it myself
        </button>
      )}
      {script === "off" && (
        <button type="button" className="tv-rt-btn" onClick={() => setTradeScript(true)} data-tip="Let the replay execute your original trade">
          Auto-play my trade
        </button>
      )}
    </div>
  );
}

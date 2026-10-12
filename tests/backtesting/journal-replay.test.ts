import { strict as assert } from "node:assert";
import { instrumentFromJournal, planJournalReplay, barCovers } from "../../src/lib/backtesting/journal-replay.ts";
import { useBacktest } from "../../src/lib/backtesting/store.ts";

const S = () => useBacktest.getState();
const entry = (over: Record<string, unknown> = {}) => ({
  id: "e1", date: "2026-10-01", pnl: 540, rr: 2, instrument: "NQ", direction: "long", setup: "", notes: "", images: [],
  entryTime: "09:31", exitTime: "09:41", entryPrice: 30772, exitPrice: 30800, stopLoss: 30760, takeProfit: 30850, quantity: 1,
  createdAt: 0, updatedAt: 0, ...over,
}) as never;
const opts = { startingBalance: 10000, currency: "USD" as const };

// ---- instrument names from the journal
assert.equal(instrumentFromJournal("NQ"), "NQ");
assert.equal(instrumentFromJournal("MNQZ6"), "MNQ", "micro, with month code, is not confused with NQ");
assert.equal(instrumentFromJournal("nq 12-26"), "NQ");
assert.equal(instrumentFromJournal("/ES"), "ES");
assert.equal(instrumentFromJournal("CME:MESH6"), "MES");
assert.equal(instrumentFromJournal("NASDAQ"), null);
assert.equal(instrumentFromJournal(""), null);

// ---- window: 20 min before entry → 20 min after exit, New York time with DST (Oct 1 = EDT, UTC-4)
{
  const p = planJournalReplay(entry(), opts);
  assert.ok(p.ok && p.mode === "trade");
  if (!p.ok) throw new Error();
  assert.equal(p.config.periodStartUtc, "2026-10-01T13:11:00.000Z"); // 09:11 NY
  assert.equal(p.config.periodEndUtc, "2026-10-01T14:01:00.000Z");   // 10:01 NY
  assert.equal(p.config.timeframe, "1m");
  const r = p.config.replayTrade!;
  assert.equal(r.side, "buy"); assert.equal(r.quantity, 1);
  assert.equal(r.entryUtc, Date.parse("2026-10-01T13:31:00Z") / 1000);
  assert.equal(r.exitUtc, Date.parse("2026-10-01T13:41:00Z") / 1000);
  assert.equal(r.entryPrice, 30772); assert.equal(r.stopLoss, 30760); assert.equal(r.journalPnl, 540);
  assert.equal(p.config.customSession?.startTime, "09:11");
}
// winter (EST, UTC-5)
{
  const p = planJournalReplay(entry({ date: "2026-12-03" }), opts);
  assert.ok(p.ok); if (!p.ok) throw new Error();
  assert.equal(p.config.replayTrade!.entryUtc, Date.parse("2026-12-03T14:31:00Z") / 1000);
}
// short, direction inferred from prices + P&L when not recorded
{
  const p = planJournalReplay(entry({ direction: null, entryPrice: 30800, exitPrice: 30780, pnl: 400 }), opts);
  assert.ok(p.ok && p.config.replayTrade!.side === "sell");
}
// overnight hold: exit clock earlier than entry → next calendar day
{
  const p = planJournalReplay(entry({ entryTime: "18:30", exitTime: "02:15" }), opts);
  assert.ok(p.ok); if (!p.ok) throw new Error();
  assert.ok(p.config.replayTrade!.exitUtc! > p.config.replayTrade!.entryUtc);
}
// no exit time → still replayable; no entry time → whole session, nothing scripted
{
  const p = planJournalReplay(entry({ exitTime: undefined }), opts);
  assert.ok(p.ok && p.config.replayTrade!.exitUtc === null);
  const d = planJournalReplay(entry({ entryTime: undefined }), opts);
  assert.ok(d.ok && d.mode === "day" && !d.config.replayTrade);
  if (d.ok) assert.equal(d.config.periodStartUtc, "2026-10-01T13:30:00.000Z");
}
// unknown instrument is explained, not silently wrong
{
  const p = planJournalReplay(entry({ instrument: "AAPL" }), opts);
  assert.ok(!p.ok && /AAPL/.test(p.ok ? "" : p.reason));
}
// bar coverage: the bar containing a moment, or the first one after a gap, never one that already ended
assert.equal(barCovers(60, 60, 60, 300), true);
assert.equal(barCovers(60, 60, 119, 300), true);
assert.equal(barCovers(0, 60, 60, 300), false, "bar ended exactly at the entry minute");
assert.equal(barCovers(1000, 60, 60, 300), false, "too late to fire (e.g. after navigating days)");

// ---- end to end through the real store
const bar = (time: number, o: number, h: number, l: number, c: number) => ({ time, open: o, high: h, low: l, close: c, volume: 1 });
function load() {
  const p = planJournalReplay(entry(), opts);
  if (!p.ok) throw new Error("plan");
  const t0 = Date.parse(p.config.periodStartUtc!) / 1000;
  const bars = Array.from({ length: 50 }, (_, i) => bar(t0 + 60 * i, 30780, 30790, 30775, 30782));
  const exitBar = (Date.parse("2026-10-01T13:41:00Z") / 1000 - t0) / 60;
  bars[exitBar] = bar(bars[exitBar].time, 30790, 30795, 30755, 30790); // wick pierces the 30760 stop
  S().initSession(p.config);
  S().setCandleData("NQ", bars);
  useBacktest.setState({ currentTime: bars[0].time, status: "paused" });
  S().updateVisibleCandles();
  return { p, bars, t0 };
}
const stepTo = (utc: string) => { while (S().currentTime < Date.parse(utc) / 1000) S().advanceClock(); };

{
  const { } = load();
  assert.equal(S().tradeScript, "pending");
  stepTo("2026-10-01T13:30:00Z");
  assert.equal(S().openPositions.length, 0, "nothing before the entry bar");
  S().advanceClock(); // 13:31
  assert.equal(S().tradeScript, "open");
  const pos = S().openPositions[0];
  assert.equal(pos.entryPrice, 30772, "your REAL entry price, not the bar close (30782)");
  assert.equal(pos.stopLoss, 30760); assert.equal(pos.takeProfit, 30850);
  stepTo("2026-10-01T13:40:00Z");
  assert.equal(S().openPositions.length, 1, "still running");
  assert.equal(S().accountState!.openPnl, (30782 - 30772) * 20, "live P&L while the trade runs");
  S().setPlaying(true);
  S().advanceClock(); // 13:41 exit bar — its wick (low 30755) is below the stop
  assert.equal(S().openPositions.length, 0);
  assert.equal(S().tradeScript, "done");
  assert.equal(S().playing, false, "pauses so the result is on screen");
  const t = S().closedTrades[0];
  assert.equal(t.exitPrice, 30800, "closed at your REAL exit, not stopped out by the bar's wick");
  assert.equal(t.grossPnl, (30800 - 30772) * 20);
}

// "Trade it myself": nothing is auto-executed
{
  load();
  S().setTradeScript(false);
  assert.equal(S().tradeScript, "off");
  stepTo("2026-10-01T13:45:00Z");
  assert.equal(S().openPositions.length, 0); assert.equal(S().closedTrades.length, 0);
  S().setTradeScript(true); // can't be re-armed meaningfully once passed? it re-arms, but entry window has gone
  S().advanceClock();
  assert.equal(S().openPositions.length, 0, "an entry that is long past never fires late");
}

// jump-to (bar by bar through advanceTo) behaves like playing
{
  const { bars } = load();
  S().advanceTo(bars[bars.length - 1].time);
  assert.equal(S().closedTrades.length, 1);
  assert.equal(S().closedTrades[0].exitPrice, 30800);
}

console.log("journal-replay tests passed");

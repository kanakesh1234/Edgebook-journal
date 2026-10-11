import { strict as assert } from "node:assert";
import { useBacktest } from "../../src/lib/backtesting/store.ts";

// End-to-end through the real store: what the Buy/Sell pill, the chart tags and the account bar use.
const S = () => useBacktest.getState();
const bar = (time: number, o: number, h: number, l: number, c: number) => ({ time, open: o, high: h, low: l, close: c, volume: 1 });
const bars = [
  bar(60, 30808.75, 30819.5, 30754, 30771.25), // buttons show 30771.25, bar OPEN was 30808.75
  bar(120, 30771.25, 30780, 30765, 30775),
  bar(180, 30775, 30790, 30770, 30785),
  bar(240, 30785, 30860, 30780, 30850),
];

S().initSession({
  instrumentSymbol: "NQ", sessionName: "t", instruments: ["NQ"], sessionId: "custom" as never,
  accountType: "static" as never, startingBalance: 10000, currency: "USD" as never,
  periodStartUtc: "2026-10-01T00:00:00Z", periodEndUtc: "2026-10-02T00:00:00Z", timeframe: "1m" as never,
} as never);
S().setCandleData("NQ", bars);
useBacktest.setState({ currentTime: 60, status: "paused" });
S().updateVisibleCandles();

// 1) BUY fills at the displayed close (not the bar's open) and shows no phantom P&L
S().placeOrder("buy", 1);
let pos = S().openPositions[0];
assert.equal(pos.entryPrice, 30771.25, "entry == price on the Buy button");
assert.equal(S().accountState!.openPnl, 0);
assert.equal(S().accountState!.equity, 10000);

// 2) live P&L moves with each bar and feeds equity / account bar
S().advanceClock();                       // close 30775
assert.equal(S().openPositions[0].unrealizedPnl, 3.75 * 20);
assert.equal(S().accountState!.openPnl, 75);
assert.equal(S().accountState!.equity, 10075);

// 3) add SL / TP (what dragging a line commits) — account stays correct
S().updatePositionRisk("NQ", pos.orderId, { stopLoss: 30760, takeProfit: 30840 });
assert.equal(S().openPositions[0].stopLoss, 30760);
assert.equal(S().accountState!.openPnl, 75, "still marked to the current close");
S().advanceClock();                       // bar 180 touches neither
assert.equal(S().openPositions.length, 1);
S().advanceClock();                       // bar 240 high 30860 ≥ TP 30840
assert.equal(S().openPositions.length, 0, "take-profit hit");
assert.equal(S().closedTrades[0].exitPrice, 30840);
assert.equal(S().closedTrades[0].grossPnl, (30840 - 30771.25) * 20);
assert.equal(S().accountState!.openPnl, 0);

// 4) SELL after BUY flattens instead of leaving a hedged long + short with a wrong P&L
useBacktest.setState({ currentTime: 60, status: "paused" });
S().updateVisibleCandles();
S().placeOrder("buy", 1);
S().placeOrder("sell", 1);
assert.equal(S().openPositions.length, 0, "no hedge");
const t = S().closedTrades.find((x) => x.exitTime === 60)!;
assert.equal(t.entryPrice, 30771.25); assert.equal(t.exitPrice, 30771.25);
assert.equal(S().accountState!.openPnl, 0);

// 5) closing ONE position by id (the Close button in the table / ✕ on the chart tag)
S().placeOrder("buy", 1); S().placeOrder("buy", 2);
const [a, b] = S().openPositions;
S().closePositionForSymbol("NQ", b.orderId);
assert.equal(S().openPositions.length, 1);
assert.equal(S().openPositions[0].orderId, a.orderId, "only the clicked one closed");

console.log("replay-trading tests passed");

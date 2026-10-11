import { strict as assert } from "node:assert";
import { OrderEngine } from "../../src/lib/backtesting/engine/order-engine.ts";
import { INSTRUMENTS } from "../../src/lib/backtesting/instruments.ts";

const NQ = INSTRUMENTS.find((i) => i.symbol === "NQ")!;
const bar = (time: number, o: number, h: number, l: number, c: number) => ({ time, open: o, high: h, low: l, close: c, volume: 1 });

// ---- market order fills at the price on the button (bar CLOSE), not the bar's open
{
  const e = new OrderEngine(NQ);
  // bar printed O 30808.75 … C 30771.25; the Buy/Sell buttons show 30771.25
  e.executeMarket("buy", 1, 30771.25, 100);
  assert.equal(e.openPositions.length, 1);
  assert.equal(e.openPositions[0].entryPrice, 30771.25, "long fills at the displayed close");
  e.markToMarket(30771.25);
  assert.equal(e.openPnl, 0, "no instant phantom P&L the moment you enter");
  e.markToMarket(30772.25);
  assert.equal(e.openPnl, 20, "+1 point on NQ = $20");
}

// ---- opposite market order NETS (closes) instead of opening a hedged short
{
  const e = new OrderEngine(NQ);
  e.executeMarket("buy", 1, 30800, 100);
  const trades = e.executeMarket("sell", 1, 30790, 160);
  assert.equal(e.openPositions.length, 0, "buy then sell flattens");
  assert.equal(trades.length, 1);
  assert.equal(trades[0].exitPrice, 30790);
  assert.equal(trades[0].grossPnl, -200, "−10 points × $20");
  assert.equal(e.closedTrades.length, 1);
}

// ---- partial close + flip
{
  const e = new OrderEngine(NQ);
  e.executeMarket("buy", 3, 100, 1);
  const t1 = e.executeMarket("sell", 1, 101, 2);
  assert.equal(e.openPositions[0].quantity, 2, "1 of 3 closed");
  assert.equal(t1[0].quantity, 1);
  assert.equal(t1[0].grossPnl, 20);
  const t2 = e.executeMarket("sell", 5, 99, 3);
  assert.equal(t2[0].quantity, 2, "remaining 2 closed");
  assert.equal(e.openPositions.length, 1);
  assert.equal(e.openPositions[0].side, "sell", "leftover 3 flips to a short");
  assert.equal(e.openPositions[0].quantity, 3);
  assert.equal(e.openPositions[0].entryPrice, 99);
}

// ---- same-direction orders stack
{
  const e = new OrderEngine(NQ);
  e.executeMarket("buy", 1, 100, 1);
  e.executeMarket("buy", 1, 102, 2);
  assert.equal(e.openPositions.length, 2);
  e.markToMarket(103);
  assert.equal(e.openPnl, (3 + 1) * 20);
}

// ---- SL / TP set on the order are honoured by LATER bars only
{
  const e = new OrderEngine(NQ);
  e.executeMarket("buy", 1, 100, 1, 95, 110);
  assert.equal(e.openPositions[0].stopLoss, 95);
  const t0 = e.processCandle(bar(2, 100, 104, 96, 103));
  assert.equal(t0.length, 0, "neither level touched");
  const t1 = e.processCandle(bar(3, 103, 111, 102, 110));
  assert.equal(t1.length, 1);
  assert.equal(t1[0].exitPrice, 110, "TP fills at the target");
  assert.equal(e.openPositions.length, 0);
  assert.equal(e.closedTrades.length, 1, "recorded exactly once");
}

// ---- dragging SL/TP onto an open position
{
  const e = new OrderEngine(NQ);
  e.executeMarket("sell", 1, 100, 1);
  const id = e.openPositions[0].orderId;
  assert.ok(e.updatePositionRisk(id, { stopLoss: 105, takeProfit: 90 }));
  assert.equal(e.openPositions[0].stopLoss, 105);
  const t = e.processCandle(bar(2, 100, 106, 99, 104));
  assert.equal(t[0].exitPrice, 105, "short stopped at the dragged level");
  assert.equal(t[0].grossPnl, -100);
  const e2 = new OrderEngine(NQ);
  e2.executeMarket("buy", 1, 100, 1, 95);
  assert.ok(e2.updatePositionRisk(e2.openPositions[0].orderId, { stopLoss: null }));
  assert.equal(e2.openPositions[0].stopLoss, null, "SL can be removed");
}

// ---- limit/stop orders only fill on bars revealed AFTER they are placed
{
  const e = new OrderEngine(NQ);
  e.submitOrder("buy", "limit", 1, 1, 99);
  assert.equal(e.openPositions.length, 0, "pending, not filled retroactively");
  e.processCandle(bar(2, 101, 102, 100, 101));
  assert.equal(e.openPositions.length, 0, "not touched yet");
  e.processCandle(bar(3, 101, 101, 98, 99));
  assert.equal(e.openPositions[0].entryPrice, 99, "limit fills at its price");
}

console.log("order-engine tests passed");

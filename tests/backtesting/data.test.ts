import { strict as assert } from "node:assert";
import {
  isLseNativeTimeframe, normaliseTimeframe, planChunks, planTimeframe, roundToTick, windowKey, maxWindowDays,
} from "../../src/lib/backtesting/data/timeframes.ts";
import { lastIndexAtOrBefore, resolveClock } from "../../src/lib/backtesting/data/loader.ts";
import { INSTRUMENTS, instrumentBySymbol } from "../../src/lib/backtesting/instruments.ts";
import { aggregateCandles } from "../../src/lib/backtesting/engine/candle-aggregator.ts";

// ---- LSE has no micros: MNQ/MES must price from NQ.F / ES.F (verified against /catalog)
assert.equal(instrumentBySymbol("MNQ")?.providerSymbol, "NQ.F");
assert.equal(instrumentBySymbol("MES")?.providerSymbol, "ES.F");
assert.equal(instrumentBySymbol("MNQ")?.pointValue, 2, "micro keeps its own $/point for P&L");
for (const i of INSTRUMENTS) assert.match(i.providerSymbol ?? "", /\.F$/, `${i.symbol} must use an LSE .F symbol`);

// ---- timeframes: UI offers more than LSE serves
assert.equal(normaliseTimeframe("1D"), "1d");
assert.equal(normaliseTimeframe("bogus"), null);
assert.deepEqual(planTimeframe("1D"), { fetchTf: "1d", aggregateSecs: null });
assert.deepEqual(planTimeframe("5m"), { fetchTf: "5m", aggregateSecs: null });
assert.deepEqual(planTimeframe("2m"), { fetchTf: "1m", aggregateSecs: 120 });
assert.deepEqual(planTimeframe("10m"), { fetchTf: "1m", aggregateSecs: 600 });
assert.deepEqual(planTimeframe("2h"), { fetchTf: "1h", aggregateSecs: 7200 });
assert.deepEqual(planTimeframe("10s"), { fetchTf: "5s", aggregateSecs: 10 });
assert.equal(planTimeframe("7m"), null);
assert.equal(isLseNativeTimeframe("1D"), true);
assert.equal(isLseNativeTimeframe("2m"), false);

// ---- float noise seen in real LSE rows
assert.equal(roundToTick(31430.500000000004, 0.25), 31430.5);
assert.equal(roundToTick(31427.249999999996, 0.25), 31427.25);
assert.equal(roundToTick(31431.750000000004, 0.25), 31431.75);
assert.equal(roundToTick(1.08504999, undefined), 1.08505);

// ---- cache key must include BOTH bounds (old key = start date only → poisoned cache)
const a = windowKey("2026-10-08T13:30:00.000Z", "2026-10-08T13:45:00.000Z");
const b = windowKey("2026-10-08T13:30:00.000Z", "2026-10-08T20:00:00.000Z");
assert.notEqual(a, b);

// ---- chunking: NY session 09:30-16:00 ET on 2026-10-08 (EDT) = 13:30-20:00 UTC
const sec = (iso: string) => Date.parse(iso) / 1000;
assert.deepEqual(
  planChunks(sec("2026-10-08T13:30:00Z"), sec("2026-10-08T20:00:00Z"), "1m").map(({ start, end }) => ({ start, end })),
  [{ start: "2026-10-08", end: "2026-10-09" }],
);
// window ending exactly at 00:00Z must not request the following day
assert.deepEqual(
  planChunks(sec("2026-10-08T22:00:00Z"), sec("2026-10-09T00:00:00Z"), "1m").map((c) => c.start),
  ["2026-10-08"],
);
// 5 days of 1m (1440 rows/day) → 2-day chunks, contiguous, no gaps
const five = planChunks(sec("2026-10-05T00:00:00Z"), sec("2026-10-10T00:00:00Z"), "1m");
assert.equal(five.length, 3);
assert.equal(five[0].start, "2026-10-05");
assert.equal(five[2].end, "2026-10-10");
for (let i = 1; i < five.length; i++) assert.equal(five[i].start, five[i - 1].end);
for (const c of five) {
  const days = (Date.parse(c.end) - Date.parse(c.start)) / 86400000;
  assert.ok(c.limit >= days * 1440, "limit must cover the whole chunk");
}
assert.deepEqual(planChunks(10, 10, "1m"), []);
assert.ok(maxWindowDays("1m") < maxWindowDays("1d"));

// ---- replay clock: resume must NOT jump back to the first candle
const mk = (t: number) => ({ time: t, open: 1, high: 1, low: 1, close: 1, volume: 1 });
const cs = [100, 160, 220, 280].map(mk);
assert.equal(lastIndexAtOrBefore(cs, 99), -1);
assert.equal(lastIndexAtOrBefore(cs, 160), 1);
assert.equal(lastIndexAtOrBefore(cs, 200), 1);
assert.equal(resolveClock(cs, 0), 100, "fresh session starts at first candle");
assert.equal(resolveClock(cs, 220), 220, "resume keeps position");
assert.equal(resolveClock(cs, 250), 220, "snaps to a real candle");
assert.equal(resolveClock(cs, 9999), 100, "outside range → start");
assert.equal(resolveClock([], 55), 55);

// ---- local aggregation for 2m (UI offers it, LSE doesn't)
const m1 = [0, 60, 120, 180].map((t, i) => ({ time: t, open: 10 + i, high: 20 + i, low: 5 + i, close: 11 + i, volume: 2 }));
const m2 = aggregateCandles(m1, 120);
assert.equal(m2.length, 2);
assert.deepEqual(m2[0], { time: 0, open: 10, high: 21, low: 5, close: 12, volume: 4 });

console.log("backtesting data tests passed");

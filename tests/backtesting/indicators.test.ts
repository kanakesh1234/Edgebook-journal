import { strict as assert } from "node:assert";
import { CATALOG, KINDS, compute, ema, sma } from "../../src/lib/backtesting/indicators.ts";

const close = (a: number | null, b: number, eps = 1e-9) => assert.ok(a !== null && Math.abs(a - b) < eps, `${a} ≉ ${b}`);

// SMA / EMA known values
assert.deepEqual(sma([1, 2, 3, 4, 5], 3), [null, null, 2, 3, 4]);
close(ema([1, 2, 3, 4, 5], 3)[4], 4); // seed 2 → 2.5 → 3.5? computed below
{
  const e = ema([1, 2, 3, 4, 5], 3); // seed=(1+2+3)/3=2, k=.5 → 3, 4
  assert.deepEqual(e, [null, null, 2, 3, 4]);
}

// synthetic candles
const candles = Array.from({ length: 300 }, (_, i) => {
  const base = 100 + Math.sin(i / 7) * 5 + i * 0.05;
  return { time: 1_760_000_000 + i * 60, open: base, high: base + 1.5, low: base - 1.2, close: base + Math.cos(i / 3), volume: 10 + (i % 17) };
});

// RSI stays in 0..100; Bollinger upper >= basis >= lower; ATR > 0
const rsi = compute("rsi", [14], candles)[0].values.filter((v) => v !== null) as number[];
assert.ok(rsi.length > 0 && rsi.every((v) => v >= 0 && v <= 100));
const [up, mid, lo] = compute("bb", [20, 2], candles).map((l) => l.values);
for (let i = 0; i < candles.length; i++) if (mid[i] !== null) assert.ok((up[i] as number) >= (mid[i] as number) && (mid[i] as number) >= (lo[i] as number));
assert.ok((compute("atr", [14], candles)[0].values.at(-1) as number) > 0);

// NO LOOK-AHEAD: indicator on a prefix equals the prefix of the indicator on the full set (replay safety)
for (const kind of KINDS) {
  const params = CATALOG[kind].defaults;
  const full = compute(kind, params, candles);
  const cut = 180;
  const part = compute(kind, params, candles.slice(0, cut));
  full.forEach((l, k) => {
    for (let i = 0; i < cut; i++) {
      const a = l.values[i], b = part[k].values[i];
      assert.ok(a === b || (a !== null && b !== null && Math.abs(a - b) < 1e-9), `${kind}.${l.key}[${i}] differs on prefix`);
    }
  });
}

// empty input never throws
for (const kind of KINDS) compute(kind, CATALOG[kind].defaults, []);

console.log("indicators tests passed");

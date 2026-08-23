/* Sanity tests for the stats engine — run with: node scripts/test-stats.ts */
import { computeStats, currentStreak, groupByDay, monthGrid } from "../src/lib/stats.ts";
import { defaultSettings } from "../src/lib/types.ts";

let failures = 0;
function expect(name: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) {
    failures++;
    console.log(`FAIL ${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  } else {
    console.log(`ok   ${name}`);
  }
}

const settings = { ...defaultSettings(), startingEquity: 10000, targetEquity: 20000, maxDrawdown: 2000 };
const mk = (date: string, pnl: number, rr: number | null = null) => ({
  id: date + pnl, date, pnl, rr, instrument: "NQ", direction: "long" as const,
  setup: "", notes: "", images: [], createdAt: 0, updatedAt: 0,
});

// Scenario A: three green days, one red day
const entries = [
  mk("2026-01-05", 500, 2),
  mk("2026-01-06", -300, -1),
  mk("2026-01-07", 250, 1.5),
  mk("2026-01-08", 150),
];
const s = computeStats(entries, settings);

expect("totalPnl", s.totalPnl, 600);
expect("currentEquity", s.currentEquity, 10600);
expect("tradingDays", s.tradingDays, 4);
expect("winningDays", s.winningDays, 3);
expect("losingDays", s.losingDays, 1);
expect("winRate", Math.round(s.winRate * 100), 75);
expect("avgDayPnl", s.avgDayPnl, 150);
expect("bestDay.pnl", s.bestDay?.pnl, 500);
expect("worstDay.pnl", s.worstDay?.pnl, -300);
expect("avgRR", Math.round((s.avgRR ?? 0) * 100) / 100, 0.83); // (2 -1 +1.5)/3
expect("equity last", s.equityCurve.at(-1)?.equity, 10600);
expect("drawdown", s.drawdown, 0);
expect("remainingToTarget", s.remainingToTarget, 9400);
expect("targetProgress ~0.06", Math.round(s.targetProgress * 1000) / 1000, 0.06);

// Scenario B: drawdown from peak
const entriesB = [
  mk("2026-02-02", 1000), // equity 11000 peak
  mk("2026-02-03", -400), // 10600
  mk("2026-02-04", -200), // 10400
];
const sb = computeStats(entriesB, settings);
expect("B drawdown", sb.drawdown, 600);
expect("B drawdownBudgetUsed", sb.drawdownBudgetUsed, 0.3);
expect("B peakEquity", sb.peakEquity, 11000);

// Streaks
expect("streak win", currentStreak(s.daily), 2); // last two days positive (07,08)
expect("streak loss", currentStreak(sb.daily), -2);

// groupByDay merges same-day entries
const g = groupByDay([mk("2026-03-02", 100), mk("2026-03-02", 50)]);
expect("groupByDay merge", g.get("2026-03-02"), { date: "2026-03-02", pnl: 150, trades: 2 });

// monthGrid: Jan 2026 starts on Thursday (pad 4), 31 days => exactly 5 weeks
const grid = monthGrid(2026, 0);
expect("grid length", grid.length % 7 === 0, true);
expect("first real cell", grid[4], { key: "2026-01-01", day: 1 });
expect("last day", grid.at(-1), { key: "2026-01-31", day: 31 });
// Feb 2027: starts Monday (pad 1), 28 days => 29 -> pad to 35
const gridFeb = monthGrid(2027, 1);
expect("feb last", gridFeb.at(-1), { key: null, day: 0 });

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log("\nAll stats tests passed");

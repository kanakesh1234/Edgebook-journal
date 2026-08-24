/* Sanity tests for the stats engine — run with: node scripts/test-stats.ts */
import { computeStats, currentStreak, groupByDay, monthGrid } from "../src/lib/stats.ts";
import { disciplineSummary, XP } from "../src/lib/discipline.ts";
import { defaultSettings, type NoTradeLog } from "../src/lib/types.ts";

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

/* ------------------------- discipline engine ------------------------- */
// Week of Mon 2026-01-05 → Fri 2026-01-09. Today is fixed at Fri 09th.
const TODAY = "2026-01-09";

const dEntry = (date: string, reflection?: { followedSetup: boolean | null; followedRisk: boolean | null }) => ({
  ...mk(date, 100),
  ...(reflection ? { reflection: { ...reflection, updatedAt: 0 } } : {}),
});
const noTrade = (date: string): NoTradeLog => ({ date, createdAt: 0 });

// Mon traded+reflection(followed both), Tue traded (no reflection), Wed no-trade,
// Thu nothing (missed), Fri traded with reflection (risk broken)
const discEntries = [
  dEntry("2026-01-05", { followedSetup: true, followedRisk: true }),
  dEntry("2026-01-06"),
  dEntry("2026-01-09", { followedSetup: null, followedRisk: false }),
];
const discLogs = [noTrade("2026-01-07")];
const d = disciplineSummary(discEntries, discLogs, TODAY);

// Mon: 20 + 10 + 10(risk) + 10(setup) = 50
// Tue: 20 · Wed: 15 · Thu: −20 · Fri: 20 + 10 − 15 = 15
expect("discipline xpTotal", d.xpTotal, 50 + 20 + 15 - 20 + 15);
expect("discipline tradedDays", d.tradedDays, 3);
expect("discipline noTradeDays", d.noTradeDays, 1);
expect("discipline missedDays", d.missedDays, 1);
expect("discipline streak (Thu missed breaks it)", d.disciplineStreak, 1); // only Fri
expect("discipline completion", Math.round(d.completionRate * 100), 80); // 4 handled / 5 eligible
expect("discipline windowStart", d.windowStart, "2026-01-05");
expect("discipline weekend neutral", d.days.find((x) => x.date === "2026-01-10")?.status ?? "weekend", "weekend");

// No activity at all → zeroed, no crash
const empty = disciplineSummary([], [], TODAY);
expect("discipline empty xp", empty.xpTotal, 0);
expect("discipline empty window", empty.windowStart, null);

// Streak counts no-trade days too: Mon–Wed handled, today Thu open → streak 3
const d2 = disciplineSummary(
  [dEntry("2026-01-05"), dEntry("2026-01-06")],
  [noTrade("2026-01-07")],
  "2026-01-08",
);
expect("discipline streak with no-trade", d2.disciplineStreak, 3);

// XP constants sanity (weights are product decisions — pin them)
expect("xp weights", [XP.tradeLogged, XP.noTradeLogged, XP.missedWeekdayJournal], [20, 15, -20]);

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log("\nAll stats tests passed");

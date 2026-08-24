/* Sanity tests for the stats engine — run with: node scripts/test-stats.ts */
import { computeStats, currentStreak, groupByDay, monthGrid } from "../src/lib/stats.ts";
import { disciplineSummary, XP } from "../src/lib/discipline.ts";
import { parseTradesCsv, normalizePnl } from "../src/lib/csv-import.ts";
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

/* ----------------------------- CSV import ----------------------------- */
const csv = [
  "Date,P&L,R:R,Instrument,Direction,Setup,Notes",
  '2026-08-21,-90.50,1.5,TSLA,long,"Gap fill","chased, then stopped"',
  "08/20/2026,$321,2.8,tsla,Buy,Trend continuation,held the runner",
  "21.08.2026,150,2,NQ,short,Liquidity sweep,",
  "2026-08-18,,1,NQ,long,Bad row,missing pnl",
  "not-a-date,100,,ES,long,,bad date",
  "2026-08-17,55,abc,MNQ,long,,bad rr",
  "2026-08-16,60,1.5,CL,sideways,,bad direction",
].join("\n");
const c = parseTradesCsv(csv);
expect("csv valid count", c.rows.length, 3);
expect("csv invalid count", c.invalid.length, 4);
expect("csv row1 quoted notes", c.rows[0]?.notes, "chased, then stopped");
expect("csv row1 pnl", c.rows[0]?.pnl, -90.5);
expect("csv date mdyyyy", c.rows[1]?.date, "2026-08-20");
expect("csv direction buy→long", c.rows[1]?.direction, "long");
expect("csv date dd.mm.yyyy", c.rows[2]?.date, "2026-08-21");
expect("csv currency symbol stripped", c.rows[1]?.pnl, 321);
expect("csv invalid reasons", c.invalid.map((r) => r.line), [5, 6, 7, 8]);
expect("csv empty input", parseTradesCsv("").rows.length, 0);
// Headerless file assumes canonical order
const headerless = parseTradesCsv("2026-08-10,120,2,ES,long,ORB,clean");
expect("csv headerless", headerless.rows[0]?.pnl, 120);

/* -------------------- broker format (Performance.csv) -------------------- */
// P&L normalisation
expect("pnl $22.50", normalizePnl("$22.50"), 22.5);
expect("pnl $(24.00)", normalizePnl("$(24.00)"), -24);
expect("pnl $122.00", normalizePnl("$122.00"), 122);
expect("pnl $4.50", normalizePnl("$4.50"), 4.5);
expect("pnl $(1,234.56)", normalizePnl("$(1,234.56)"), -1234.56);
expect("pnl $0.00", normalizePnl("$0.00"), 0);

// Timestamps: MM/DD/YYYY HH:mm:ss → journal date
const perfHeaders =
  "symbol,_priceFormat,_priceFormatType,_tickSize,buyFillId,sellFillId,qty,buyPrice,sellPrice,pnl,boughtTimestamp,soldTimestamp,duration";
const perf = parseTradesCsv(
  [
    perfHeaders,
    "MNQ,USD,USD,0.25,f1,f2,2,22525.00,22547.50,$22.50,08/05/2026 19:23:29,08/05/2026 19:28:01,4m 32s",
    "MNQ,USD,USD,0.25,f3,f4,2,22540.00,22516.00,$(24.00),08/11/2026 19:04:49,08/11/2026 19:09:12,4m 23s",
    "NQ,USD,USD,0.25,f5,f6,1,23010.00,23132.00,$122.00,08/20/2026 19:15:32,08/20/2026 19:31:00,15m 28s",
  ].join("\n"),
);
expect("perf no error", perf.error ?? "", "");
expect("perf row count", perf.rows.length, 3);
expect("perf 08/05/2026 → 2026-08-05", perf.rows[0]?.date, "2026-08-05");
expect("perf 08/11/2026 → 2026-08-11", perf.rows[1]?.date, "2026-08-11");
expect("perf 08/20/2026 → 2026-08-20", perf.rows[2]?.date, "2026-08-20");
expect("perf symbol → instrument", [perf.rows[0]?.instrument, perf.rows[2]?.instrument], ["MNQ", "NQ"]);
expect("perf positive pnl", perf.rows[0]?.pnl, 22.5);
expect("perf negative pnl", perf.rows[1]?.pnl, -24);
expect("perf $122 pnl", perf.rows[2]?.pnl, 122);
expect("perf broker columns in notes", perf.rows[0]?.notes, "Qty 2 · 22525.00 → 22547.50 · 4m 32s");
expect("perf no direction column → null", perf.rows[0]?.direction, null);

// Genuinely unsupported CSV → clear error, nothing parsed
const junk = parseTradesCsv("foo,bar\nhello,world\nmore,stuff");
expect("junk unsupported error", typeof junk.error === "string" && junk.error.length > 10, true);
expect("junk no rows", junk.rows.length, 0);

if (failures > 0) {
  console.log(`\n${failures} FAILURES`);
  process.exit(1);
}
console.log("\nAll stats tests passed");

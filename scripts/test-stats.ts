/* Sanity tests for the stats engine — run with: node scripts/test-stats.ts */
import { computeStats, currentStreak, groupByDay, monthGrid } from "../src/lib/stats.ts";
import { disciplineSummary, XP } from "../src/lib/discipline.ts";
import { parseTradesCsv, normalizePnl } from "../src/lib/csv-import.ts";
import { evaluateRules, adherenceSummary } from "../src/lib/rules.ts";
import { normalizeImportedTimestamp, formatHistoricalDate } from "../src/lib/tz.ts";
import { buildContext, findRecurringPatterns, findSimilarTrades, executionVerdict, strategyForEntry } from "../src/lib/minato/context.ts";
import { computeInsights } from "../src/lib/minato/insights.ts";
import { respond, greet } from "../src/lib/minato/respond.ts";
import { DeterministicMinatoProvider } from "../src/lib/services/ai.ts";
import { defaultSettings, defaultRuleSet, type JournalEntry, type NoTradeLog } from "../src/lib/types.ts";

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
expect("perf broker columns in notes", perf.rows[0]?.notes, "Qty 2 · 22525.00 → 22547.50 · 4m 32s · entry 9:53 AM NY");
expect("perf no direction column → null", perf.rows[0]?.direction, null);

// Timezone normalization: IST timestamps → America/New_York (DST-aware)
expect("tz IST evening → NY same day", parseTradesCsv(
  `${perfHeaders}\nMNQ,USD,USD,0.25,f,f,1,1,2,$1,08/05/2026 19:23:29,08/05/2026 19:30:00,1m`,
).rows[0]?.date, "2026-08-05"); // 19:23 IST = 9:53 AM EDT
expect("tz IST early morning rolls back a NY day", parseTradesCsv(
  `${perfHeaders}\nMNQ,USD,USD,0.25,f,f,1,1,2,$1,08/06/2026 03:00:00,08/06/2026 03:05:00,5m`,
).rows[0]?.date, "2026-08-05"); // 03:00 IST = 17:45 EDT previous day
expect("tz winter IST → NY EST", parseTradesCsv(
  `${perfHeaders}\nMNQ,USD,USD,0.25,f,f,1,1,2,$1,01/05/2026 19:23:29,01/05/2026 19:30:00,1m`,
).rows[0]?.date, "2026-01-05"); // 19:23 IST = 8:53 AM EST
expect("tz NY entry time preserved", parseTradesCsv(
  `${perfHeaders}\nMNQ,USD,USD,0.25,f,f,1,1,2,$1,08/05/2026 19:23:29,08/05/2026 19:30:00,1m`,
).rows[0]?.notes.includes("entry 9:53 AM NY"), true);
// Plain calendar dates (no time) must not shift
expect("tz plain date untouched", parseTradesCsv("2026-08-10,120,2,ES,long,ORB,clean").rows[0]?.date, "2026-08-10");

// Genuinely unsupported CSV → clear error, nothing parsed
const junk = parseTradesCsv("foo,bar\nhello,world\nmore,stuff");
expect("junk unsupported error", typeof junk.error === "string" && junk.error.length > 10, true);
expect("junk no rows", junk.rows.length, 0);

/* ----------------------------- rule engine ----------------------------- */
const labSettings = {
  ...defaultSettings(),
  rules: defaultRuleSet(),
};
// defaults: max-daily-loss 300, max-trades 5, max-consecutive 3 enabled; min-rr off
const rEntries = [
  mk("2026-06-01", -400),            // breach: daily loss > 300
  mk("2026-06-02", -100),
  mk("2026-06-03", -150),            // 3rd consecutive loss → stop rule
  mk("2026-06-04", 200, 1),          // rr 1 < min 2 — but min-rr disabled by default
  { ...mk("2026-06-04", 300), instrument: "AAPL", setup: "", reflection: { followedSetup: false, followedRisk: false, updatedAt: 0 } },
];
const rv = evaluateRules(rEntries, labSettings);
expect("rules daily-loss breach", rv.some((v) => v.ruleId === "risk.max-daily-loss" && v.date === "2026-06-01"), true);
expect("rules daily-loss detail", rv.find((v) => v.ruleId === "risk.max-daily-loss")?.detail, "Daily loss −$400 exceeded the −$300 limit by $100.");
expect("rules consecutive-loss fires on 3rd", rv.some((v) => v.ruleId === "risk.max-consecutive-losses" && v.date === "2026-06-03"), true);
expect("rules min-rr off by default", rv.some((v) => v.ruleId === "risk.min-rr"), false);
expect("rules reflection setup breach", rv.some((v) => v.ruleId === "behavior.trade-your-setup" && v.date === "2026-06-04"), true);
expect("rules reflection risk breach", rv.some((v) => v.ruleId === "behavior.respect-risk-rules" && v.date === "2026-06-04"), true);
expect("rules newest first", rv[0]?.date >= rv[rv.length - 1]?.date, true);

// enabled min-rr + allowed instruments
const strictSettings = {
  ...defaultSettings(),
  rules: {
    rules: defaultRuleSet().rules.map((r) => {
      if (r.id === "risk.min-rr") return { ...r, enabled: true, params: { min: 2 } };
      if (r.id === "setup.allowed-instruments") return { ...r, enabled: true, params: { instruments: ["NQ", "ES"] } };
      return r;
    }),
  },
};
const rv2 = evaluateRules(rEntries, strictSettings);
expect("rules min-rr enabled fires", rv2.some((v) => v.ruleId === "risk.min-rr" && v.entryId?.includes("2026-06-04")), true);
expect("rules instrument not allowed", rv2.some((v) => v.ruleId === "setup.allowed-instruments" && v.detail.includes("AAPL")), true);

// adherence window math
const ad = adherenceSummary(rEntries, labSettings, "2026-06-30");
expect("rules adherence violations30", ad.violations30, rv.length);
expect("rules adherence clean rate < 1", ad.cleanDayRate < 1, true);
expect("rules byRule counts", ad.byRule["risk.max-daily-loss"], 1);

// disabled rules never fire
const offSettings = { ...defaultSettings(), rules: { rules: defaultRuleSet().rules.map((r) => ({ ...r, enabled: false })) } };
expect("rules all off", evaluateRules(rEntries, offSettings).length, 0);

/* ------------------------------ MINATO ------------------------------ */
// Timezone display helpers
expect("tz import normalize", normalizeImportedTimestamp("08/05/2026 19:23:29"), { date: "2026-08-05", time: "9:53 AM" });
expect("tz historical format", formatHistoricalDate("2026-08-05"), "05/08/2026");

const mkR = (date: string, pnl: number, reflection?: JournalEntry["reflection"], setup = "Liquidity Sweep"): JournalEntry => ({
  id: `e-${date}-${pnl}`, date, pnl, rr: null, instrument: "NQ", direction: "long",
  setup, notes: "", images: [], createdAt: 0, updatedAt: 0, ...(reflection ? { reflection } : {}),
});

const mEntries = [
  mkR("2026-08-01", -100, { wentPoorly: "entered early, FOMO", cause: "fomo", followedSetup: false, followedRisk: true, updatedAt: 0 }),
  mkR("2026-08-05", 200, { wentWell: "clean", followedSetup: true, followedRisk: true, updatedAt: 0 }),
  mkR("2026-08-08", -80, { wentPoorly: "early entry again", cause: "did not want to miss the move", followedSetup: false, followedRisk: false, updatedAt: 0 }),
  mkR("2026-08-12", 150),
];
const mSettings = { ...defaultSettings() };
const mStats = computeStats(mEntries, mSettings);
const mCtx = buildContext({
  userFirstName: "Test",
  entries: mEntries,
  stats: mStats,
  discipline: disciplineSummary(mEntries, [], "2026-08-12"),
  adherence: adherenceSummary(mEntries, mSettings, "2026-08-12"),
  playbook: [{ id: "pb1", name: "Liquidity Sweep", entryConditions: "Wait for sweep\nSMT confirmation", createdAt: 0, updatedAt: 0 }],
  activeRules: defaultRuleSet().rules.filter((r) => r.enabled),
  violations: evaluateRules(mEntries, mSettings),
  focusEntry: mEntries[2],
  includeNotes: true,
});

// Strategy isolation: entry matched to its own playbook strategy only
expect("minato strategy match", strategyForEntry(mEntries[0], mCtx.playbook)?.name, "Liquidity Sweep");
expect("minato strategy none", strategyForEntry({ ...mEntries[3], setup: "—" }, mCtx.playbook), null);

// Historical retrieval — real records only, DD/MM/YYYY
expect("minato similar count", findSimilarTrades(mEntries[0], mEntries).length, 3);
expect("minato no fabrication", respond(mCtx, "find similar trades").includes("No similar trade dorakaledu") === false, true);
const noneCtx = { ...mCtx, recentTrades: [] };
expect("minato empty history honest", respond(noneCtx, "find similar trades").includes("dorakaledu"), true);

// Execution verdict quadrants (profit ≠ good execution)
expect("minato verdict sloppy win", executionVerdict(mEntries[0]), "loss-and-sloppy");
expect("minato verdict clean win", executionVerdict(mEntries[1]), "clean-win");
expect("minato verdict unreflected", executionVerdict(mEntries[3]), "unreflected");

// Recurring pattern mining — cautious, from actual reflections
expect("minato pattern found", findRecurringPatterns(mEntries)[0]?.pattern, "early entry / FOMO");
expect("minato no pattern when clean", findRecurringPatterns([mEntries[1], mEntries[3]]).length, 0);

// Insights: repeated pattern + missing reflections surface
const mIns = computeInsights(mCtx);
expect("minato insight pattern", mIns.some((i) => i.id.startsWith("pattern-")), true);
expect("minato insight reflection", mIns.some((i) => i.id === "missing-reflection"), true);

// Responses: Telugu-English path, data-grounded
const reply1 = respond(mCtx, "how am i doing");
expect("minato how-doing grounded", reply1.includes("Adherence") && reply1.includes("discipline streak"), true);
const reply2 = respond(mCtx, "review my last trade");
expect("minato review references actual cause", reply2.includes("did not want to miss the move"), true);
const reply3 = respond(mCtx, "discipline?");
expect("minato discipline answer", reply3.includes("Discipline streak"), true);
const reply4 = respond(mCtx, "random gibberish xyzzy");
expect("minato honest fallback", reply4.includes("Full brain connect avvaledu"), true);
expect("minato greeting personal", greet(mCtx).startsWith("Namaste Test"), true);

// Provider seam
const provider = new DeterministicMinatoProvider();
void (async () => {
  /* ------------------- hold time + patterns + competence ------------------- */
  const { holdTimeStats, formatHold } = await import("../src/lib/holdtime.ts");
  const { detectPatterns, matchPlanToPatterns } = await import("../src/lib/minato/patterns.ts");
  const { processScore } = await import("../src/lib/competence.ts");

  const hEntries = [
    { ...mk("2026-07-01", 200, 2), entryTime: "09:35", exitTime: "10:05" },   // win, 30m
    { ...mk("2026-07-02", -100, -1), entryTime: "09:40", exitTime: "09:55" }, // loss, 15m
    { ...mk("2026-07-03", 300, 3), entryTime: "10:00", exitTime: "10:45" },   // win, 45m
    { ...mk("2026-07-06", -150), entryTime: "09:33", exitTime: "09:50" },     // loss, 17m
  ];
  const hs = holdTimeStats(hEntries as never);
  expect("hold avg win", hs.avgWinMin, 38); // (30+45)/2
  expect("hold avg loss", hs.avgLossMin, 16); // (15+17)/2
  expect("hold median win", hs.medianWinMin, 38);
  expect("hold longest win", hs.longestWinMin, 45);
  expect("hold shortest loss", hs.shortestLossMin, 15);
  expect("hold format", formatHold(95), "1h 35m");
  expect("hold no timestamps → null", holdTimeStats([mk("2026-07-07", 50)]).avgHoldMin, null);

  // Pattern confidence: 2 occurrences = possible, 3 = repeated
  const pEntries = [
    { ...mk("2026-08-01", -100), reflection: { wentPoorly: "entered early, fomo", cause: "", followedSetup: null, followedRisk: null, updatedAt: 0 } },
    { ...mk("2026-08-02", -80), reflection: { wentPoorly: "didn't want to miss the move", cause: "", followedSetup: null, followedRisk: null, updatedAt: 0 } },
    { ...mk("2026-08-03", 50) },
  ];
  const pats1 = detectPatterns(pEntries as never);
  expect("pattern 2 occurrences → possible", pats1[0]?.confidence, "possible");
  const pEntries3 = [...pEntries, { ...mk("2026-08-04", -60), reflection: { wentPoorly: "thought if I waited I would miss the move", cause: "", followedSetup: null, followedRisk: null, updatedAt: 0 } }];
  const pats2 = detectPatterns(pEntries3 as never);
  expect("pattern 3 occurrences → repeated", pats2[0]?.confidence, "repeated");
  expect("pattern label", pats2[0]?.label, "Entry urgency / fear of missing the move");
  // Evidence preserved with original text
  expect("pattern evidence intact (newest first)", pats2[0]?.evidence[0]?.excerpt, "thought if I waited I would miss the move");
  // Single occurrence → not reported
  const patsNone = detectPatterns([{ ...mk("2026-08-05", -10), reflection: { wentPoorly: "early entry", cause: "", followedSetup: null, followedRisk: null, updatedAt: 0 } }] as never);
  expect("pattern 1 occurrence not reported", patsNone.length, 0);

  // Plan text matching established pattern
  const match = matchPlanToPatterns("I didn't want to wait too long because price might move", pats2);
  expect("plan matches urgency pattern", match?.pattern.label, "Entry urgency / fear of missing the move");
  expect("unrelated plan no match", matchPlanToPatterns("clean sweep and smt plan", pats2), null);

  // Process score: reviewed + checklist trades score higher than bare trades
  const bare = [mk("2026-08-01", 100), mk("2026-08-02", -50)];
  const rich = [
    { ...mk("2026-08-01", 100), reviewStatus: "reviewed" as const, checklist: { tradeNumber: 1 as const, r1Time: { answer: true }, r2Environment: { answer: true }, r3LiquiditySweep: { answer: true }, r4Manipulation: { answer: true }, r5Target: { answer: true }, r6Smt: { answer: true } }, review: { execution: { planned: true, followedStop: true, movedStop: false, exitedEarly: false, chased: false }, psychology: { fomo: false }, outcome: { followedPlan: true } }, reflection: { wentWell: "clean", cause: "", followedSetup: true, followedRisk: true, lesson: "repeat", updatedAt: 0 }, conceptsUsed: ["SMT"] },
    { ...mk("2026-08-02", -50), reviewStatus: "reviewed" as const, checklist: { tradeNumber: 1 as const, r1Time: { answer: true }, r2Environment: { answer: true }, r3LiquiditySweep: { answer: true }, r4Manipulation: { answer: true }, r5Target: { answer: true }, r6Smt: { answer: true } }, review: { execution: { planned: true, followedStop: true, movedStop: false, exitedEarly: false, chased: false }, psychology: { fomo: false }, outcome: { followedPlan: true } }, reflection: { wentPoorly: "valid loss", cause: "", followedSetup: true, followedRisk: true, lesson: "accept", updatedAt: 0 } },
  ];
  const scoreBare = processScore(bare as never, []);
  const scoreRich = processScore(rich as never, []);
  expect("competence rewards process", scoreRich.score > scoreBare.score, true);
  expect("competence bounded", scoreRich.score <= 100 && scoreRich.score > 0, true);


  const pReply = await provider.reply({ messages: [{ role: "user", text: "discipline?" }] }, mCtx);
  expect("minato provider reply", pReply.text.includes("Discipline streak"), true);
  expect("minato provider meta", [pReply.meta.deterministic, pReply.meta.visionSupported], [true, false]);

// Privacy: notes excluded from context when disallowed (context carries the flag)
const privateCtx = buildContext({
  userFirstName: "T", entries: mEntries, stats: mStats,
  discipline: disciplineSummary(mEntries, [], "2026-08-12"),
  adherence: adherenceSummary(mEntries, mSettings, "2026-08-12"),
  playbook: [], activeRules: [], violations: [], focusEntry: null, includeNotes: false,
});
expect("minato privacy flag", privateCtx.privacy.includeNotes, false);

// User-data isolation is structural: context is built ONLY from passed-in entries
expect("minato isolation by construction", buildContext({
  userFirstName: "A", entries: [mEntries[0]], stats: mStats,
  discipline: disciplineSummary([mEntries[0]], [], "2026-08-12"),
  adherence: adherenceSummary([mEntries[0]], mSettings, "2026-08-12"),
  playbook: [], activeRules: [], violations: [], focusEntry: null, includeNotes: true,
}).recentTrades.length, 1);

  if (failures > 0) {
    console.log(`\n${failures} FAILURES`);
    process.exit(1);
  }
  console.log("\nAll stats tests passed");
})();

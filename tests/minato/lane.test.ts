import { strict as assert } from "node:assert";
import { classifyLane, quickReply } from "../../src/lib/minato/lane.ts";
import { computeIdeal, parseIdeal } from "../../src/lib/minato/ideal-calc.ts";
import { marketClock } from "../../src/lib/minato/market-clock.ts";
import { routeIntent } from "../../src/lib/minato/router.ts";
import { sanitizeGlance, cleanReply } from "../../src/lib/minato/lean.ts";

let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };
const lane = (t: string, o = {}) => classifyLane(t, o).lane;

// ---- the screenshot bug: a greeting must never reach the journal
for (const g of ["good morning sensei", "Good morning Minato!", "hey", "thanks", "thank you so much", "gm", "hello sensei", "ok cool", "how are you"]) {
  ok(lane(g) === "chat", `"${g}" is chat`);
}
ok(routeIntent("good morning sensei").intent === "chitchat", "router also treats a greeting with an address as chitchat");

// ---- normal questions stay light
for (const q of ["what is a fair value gap?", "how do I stop revenge trading", "explain kill zones", "I feel nervous before the open"]) {
  ok(lane(q) === "chat", `"${q}" is chat`);
}

// ---- the trader's own data goes to the data lane
for (const q of ["how am i doing", "review my last trade", "what's my win rate this month", "why did i lose yesterday", "write the pre-session plan for today", "what should i work on", "my worst setup", "drawdown room left?", "review 2026-10-15"]) {
  ok(lane(q) === "data", `"${q}" is data`);
}
ok(lane("with this win rate, what's the max losing streak and NQ size?") === "data", "journal-referencing calc stays on the data lane");

// ---- ideal calculations go to the calc lane
for (const q of ["if win rate is 45% and rr is 1:2 what's my expectancy", "NQ position size with $500 risk and 20 pt stop", "probability of 6 losses in a row at 50% win rate over 100 trades", "what is break even win rate at 1:3 rr"]) {
  ok(lane(q) === "calc", `"${q}" is calc`);
}

// ---- follow-ups and focus
ok(lane("why?", { prevLane: "data" }) === "data", "short follow-up stays in data");
ok(lane("and with 15 pt stop?", { prevLane: "calc" }) === "calc", "short follow-up stays in calc");
ok(lane("what went wrong here", { hasFocus: true }) === "data", "focus trade → data");

// ---- quick replies never dump stats
ok(/good morning, nandigam/i.test(quickReply("good morning sensei", "Nandigam") ?? ""), "quick morning reply");
ok(/ready whenever you want/i.test(quickReply("what are you doing", "Nandigam") ?? ""), "what are you doing gets a conversational reply, never a stats dump");
ok(routeIntent("what are you doing").intent === "chitchat", "router treats 'what are you doing' as chitchat");
ok(quickReply("explain fvg", "Nandigam") === null, "no quick reply for real questions");

// ---- ideal math (exact, no journal)
{
  const p = parseIdeal("win rate 45% and rr 1:2");
  ok(p.winRate === 0.45 && p.rr === 2, "parses win rate and 1:2 rr");
  const r = computeIdeal("if win rate is 45% and rr is 1:2 what's my expectancy")!;
  const e = r.results.expectancy as { expectancyR: number; profitFactor: number; breakEvenWinRate: number };
  ok(Math.abs(e.expectancyR - 0.35) < 1e-9, "expectancy = 0.45*2 - 0.55 = +0.35R");
  ok(Math.abs(e.profitFactor - 1.64) < 0.01, "profit factor = 0.9/0.55");
  ok(Math.abs(e.breakEvenWinRate - 33.33) < 0.01, "break-even win rate at 2R = 33.33%");
  ok(r.missing.length === 0, "nothing missing");
}
{
  const r = computeIdeal("NQ position size with $500 risk and 20 pt stop")!;
  const c = (r.results.sizing as { calc: { symbol: string; contracts: number }[] }).calc;
  ok(c.find((x) => x.symbol === "NQ")?.contracts === 1, "500/(20*20) = 1.25 → 1 NQ");
  const m = computeIdeal("MNQ size with $500 risk and 20 pt stop")!;
  ok((m.results.sizing as { calc: { contracts: number }[] }).calc[0]!.contracts === 12, "500/(20*2) = 12.5 → 12 MNQ");
}
{
  const r = computeIdeal("probability of 6 losses in a row at 50% win rate over 100 trades")!;
  const s = r.results.streak as { atLeast: { probabilityPct: number } };
  ok(Math.abs(s.atLeast.probabilityPct - 54.61) < 0.05, "54.6% chance of a 6-loss run in 100 coin-flip trades (exact DP)");
}
{
  const r = computeIdeal("what's my expectancy at 50% win rate")!;
  ok(r.missing.some((m) => /reward/.test(m)), "asks for reward:risk once when missing");
  const s = computeIdeal("position size for NQ with 20 pt stop")!;
  ok(s.missing.some((m) => /risk/.test(m)), "asks for risk when missing");
}
ok(computeIdeal("what is a fair value gap") === null, "non-calc text returns null");

// ---- market clock
{
  const sun = marketClock(new Date("2026-11-01T12:00:00Z")); // Sun 07:00 ET (EST)
  ok(sun.state === "closed_weekend" && /reopen Sunday 6:00 PM/.test(sun.summary), "Sunday morning is closed, reopens 6 PM ET");
  const wed = marketClock(new Date("2026-11-04T15:00:00Z")); // Wed 10:00 ET
  ok(wed.state === "open" && wed.session === "ny_open", "Wednesday 10:00 ET is the NY morning session");
  const brk = marketClock(new Date("2026-11-04T22:30:00Z")); // Wed 17:30 ET
  ok(brk.state === "daily_break", "17:30 ET is the daily break");
  const sat = marketClock(new Date("2026-11-07T15:00:00Z"));
  ok(sat.state === "closed_weekend", "Saturday is closed");
}

// ---- lean helpers
ok(JSON.stringify(sanitizeGlance({ trades: 8, evil: "x", totalPnl: "n/a" })) === '{"trades":8}', "glance keeps numbers only");
ok(cleanReply("<think>x</think>Minato: Hi\\*") === "Hi*", "cleanReply strips think-tags, labels, escaped stars");

console.log(`lane tests: ${passed} assertions passed`);

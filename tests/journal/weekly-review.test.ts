import { strict as assert } from "node:assert";
import { classifyLocal, mistakeIndex, mistakeOf } from "../../src/lib/mistakes.ts";
import { dayLimitFor, riskFor } from "../../src/lib/risk.ts";
import { buildWeek, recurringMistakes, shiftWeek, weekStartOf, weekTrend } from "../../src/lib/weekly.ts";
import { feelingFromReview } from "../../src/lib/feelings.ts";
import type { JournalEntry, TradePlan } from "../../src/lib/types.ts";

let n = 0;
const trade = (date: string, pnl: number, extra: Partial<JournalEntry> = {}): JournalEntry => ({
  id: `t${++n}`, date, pnl, rr: null, instrument: "MNQ", direction: "long", setup: "", notes: "", images: [], createdAt: n, updatedAt: n, ...extra,
} as JournalEntry);
const plan = (date: string, maxLoss?: number, createdAt = 1): TradePlan => ({ id: `p${++n}`, date, thesis: "x", rules: [], status: "executed", createdAt, updatedAt: createdAt, maxLoss });
const review = (mistake: string, extra: Record<string, unknown> = {}, followedPlan: boolean | null = false) => ({ outcome: { followedPlan }, followUp: { mistake, ...extra } }) as JournalEntry["review"];

// ---- weeks run Monday → Sunday
assert.equal(weekStartOf("2026-10-11"), "2026-10-05"); // a Sunday belongs to the week that began the Monday before
assert.equal(weekStartOf("2026-10-05"), "2026-10-05");
assert.equal(weekStartOf("2026-10-07"), "2026-10-05");
assert.equal(shiftWeek("2026-10-05", -1), "2026-09-28");

// ---- local classifier sorts free text into the shared buckets
assert.equal(classifyLocal("Ignored CPI and traded anyway").key, "news");
assert.equal(classifyLocal("moved my stop loss further away").key, "stop");
assert.equal(classifyLocal("took 5 contracts instead of 2").key, "size");
assert.equal(classifyLocal("cut winner early at 1R").key, "exit");
assert.equal(classifyLocal("froze and missed the entry").key, "hesitation");
assert.equal(classifyLocal("").key, "other");
assert.equal(classifyLocal("zzz qqq").key, "other");

// ---- a trade's mistake: presets map to themselves, "other" is bucketed, "none" is no mistake
assert.equal(mistakeOf(trade("2026-10-05", -50, { review: review("chased") }))?.key, "chased");
assert.equal(mistakeOf(trade("2026-10-05", -50, { review: review("none") })), null);
assert.equal(mistakeOf(trade("2026-10-05", -50, { review: review("other", { mistakeOther: "ignored FOMC", mistakeCategory: "news", mistakeCategorySource: "ai" }) }))?.source, "ai");
assert.equal(mistakeOf(trade("2026-10-05", -50, { review: review("other", { mistakeOther: "traded against the daily bias" }) }))?.key, "bias"); // older trade, no stored bucket
assert.equal(mistakeOf(trade("2026-10-05", -50)), null);

// ---- risk budget: "used" is the deepest the running P&L went, not where the day finished
const day = [trade("2026-10-06", -120, { entryTime: "09:35" }), trade("2026-10-06", -60, { entryTime: "10:05" }), trade("2026-10-06", 300, { entryTime: "10:40" })];
const r = riskFor(200, day)!;
assert.equal(r.used, 180); assert.equal(r.net, 120); assert.equal(r.status, "near"); assert.equal(r.remaining, 20);
assert.equal(riskFor(150, day)!.status, "over");
assert.equal(riskFor(180, day)!.status, "hit");
assert.equal(riskFor(1000, day)!.status, "ok");
assert.equal(riskFor(null, day), null);
assert.equal(riskFor(0, day), null);
assert.equal(riskFor(100, [trade("2026-10-06", 80)])!.used, 0); // a green day spends nothing
// order is by entry time, not by when it was logged
assert.equal(riskFor(500, [trade("2026-10-06", 400, { entryTime: "11:00", createdAt: 1 }), trade("2026-10-06", -300, { entryTime: "09:40", createdAt: 2 })].sort((a, b) => a.entryTime!.localeCompare(b.entryTime!)))!.used, 300);
// the latest plan with a limit wins; a plan without one never clears it
assert.equal(dayLimitFor("2026-10-06", [plan("2026-10-06", 200, 1), plan("2026-10-06", 150, 2), plan("2026-10-06", undefined, 3)]), 150);
assert.equal(dayLimitFor("2026-10-07", [plan("2026-10-06", 200)]), null);

// ---- week review
const entries: JournalEntry[] = [
  trade("2026-10-05", 200, { rr: 2, review: review("none", {}, true), reviewStatus: "reviewed" }),
  trade("2026-10-06", -120, { entryTime: "09:35", review: review("other", { mistakeOther: "ignored news", mistakeCategory: "news" }), reviewStatus: "reviewed" }),
  trade("2026-10-06", -90, { entryTime: "10:05", rr: -1, review: review("chased", {}, false), reviewStatus: "reviewed" }),
  trade("2026-10-08", 50, { review: { outcome: { followedPlan: true }, psychology: { emotionAfter: "proud" } } as JournalEntry["review"], reviewStatus: "reviewed" }),
  trade("2026-09-29", -40, { review: review("chased"), reviewStatus: "reviewed" }), // previous week: "chased" again
  trade("2026-09-22", -40, { review: review("chased"), reviewStatus: "reviewed" }), // two weeks ago
];
const plans = [plan("2026-10-06", 200), plan("2026-10-05", 300)];
const w = buildWeek(entries, plans, "2026-10-05");
assert.equal(w.count, 4); assert.equal(w.net, 40); assert.equal(w.wins, 2); assert.equal(w.losses, 2);
assert.equal(w.winRate, 0.5); assert.equal(w.avgR, 0.5); assert.equal(w.profitFactor, 1.19);
assert.deepEqual([w.plan.followed, w.plan.broke], [2, 2]); assert.equal(w.plan.adherence, 0.5);
assert.equal(w.plan.netFollowed, 250); assert.equal(w.plan.netBroke, -210);
assert.equal(w.days[1]!.risk!.used, 210); assert.equal(w.days[1]!.risk!.status, "over");
assert.equal(w.days[0]!.risk!.status, "ok");
assert.deepEqual(w.risk, { daysWithLimit: 2, held: 1, breached: 1, tradedWithoutLimit: 1 });
assert.equal(w.mistakes.find((m) => m.key === "chased")!.weeksSeen, 3); assert.ok(w.mistakes.find((m) => m.key === "chased")!.recurring);
assert.equal(w.mistakes.find((m) => m.key === "news")!.cost, 120);
assert.equal(w.feelings.find((f) => f.key === "proud")!.count, 1);
assert.ok(w.insights.length > 0 && w.insights.every((i) => i.text.length > 0));
assert.equal(buildWeek(entries, plans, "2026-08-03").count, 0);
assert.equal(buildWeek(entries, plans, "2026-08-03").insights.length, 1);

// ---- trend + recurring
const t = weekTrend(entries, "2026-10-05", 4);
assert.equal(t.length, 4); assert.equal(t[3]!.start, "2026-10-05"); assert.equal(t[3]!.net, 40); assert.equal(t[2]!.net, -40);
assert.deepEqual(recurringMistakes(entries, "2026-10-05").map((x) => [x.key, x.weeks]), [["chased", 3]]);

// ---- journal index + feelings
assert.equal(mistakeIndex(entries)[0]!.key, "chased");
assert.equal(mistakeIndex(entries)[0]!.count, 3);
assert.equal(feelingFromReview({ emotionAfter: "adrenaline" }), "adrenaline");
assert.equal(feelingFromReview({ fomo: true }), "fomo");
assert.equal(feelingFromReview({ convictionOrUrgency: "conviction" }), "calm"); // reviews saved before the longer list
assert.equal(feelingFromReview(undefined), "");

// ---- trade audit: facts first, claims second
import { auditLocal, auditSignals } from "../../src/lib/audit.ts";
{
  const p = { ...plan("2026-10-07", 150, 1), newsEvents: [{ name: "CPI", time: "08:30" }] } as TradePlan;
  const a = trade("2026-10-07", -90, { entryTime: "08:42", exitTime: "08:50", quantity: 2, planId: p.id });
  const b = trade("2026-10-07", -80, { entryTime: "08:55", exitTime: "09:05", quantity: 6, planId: p.id });
  const c = trade("2026-10-07", 40, { entryTime: "10:00", quantity: 2, planId: p.id });
  const hist = [1, 2, 3].map((i) => trade("2026-10-0" + i, 10, { quantity: 2 }));
  const all = [...hist, a, b, c];
  assert.ok(auditSignals(a, all, [p]).some((s) => s.code === "news-window" && s.objective));
  const sb = auditSignals(b, all, [p]).map((s) => s.code);
  assert.ok(sb.includes("quick-reentry") && sb.includes("size-spike") && sb.includes("limit-crossed"), sb.join());
  assert.ok(auditSignals(c, all, [p]).some((s) => s.code === "trade-count") && auditSignals(c, all, [p]).some((s) => s.code === "after-limit"));
  assert.equal(auditLocal(auditSignals(b, all, [p])).objective, true);
  // "No mistake" claimed by the trader is overruled in the journal when the audit proved one
  const claimed = { ...a, review: { followUp: { mistake: "none", audit: { key: "news", confidence: 0.9, reason: "x", objective: true, source: "rules", flags: [], at: 1 } } } } as JournalEntry;
  assert.equal(mistakeOf(claimed)?.key, "news"); assert.equal(mistakeOf(claimed)?.source, "audit");
  const soft = { ...a, review: { followUp: { mistake: "none", audit: { key: "plan", confidence: 0.5, reason: "x", objective: false, source: "rules", flags: [], at: 1 } } } } as JournalEntry;
  assert.equal(mistakeOf(soft), null);
  assert.equal(auditLocal([]).key, "none");
}

import { strict as assert } from "node:assert";
import type { JournalEntry, TradePlan } from "../../src/lib/types.ts";
import { ruleStats, statFor } from "../../src/lib/rule-stats.ts";
import { buildOutlookFacts, localOutlook, type PlanDraft } from "../../src/lib/prediction/outlook.ts";

let n = 0;
const trade = (pnl: number, date: string, extra: Partial<JournalEntry> = {}): JournalEntry => ({ id: `t${++n}`, date, pnl, rr: null, instrument: "MNQ", direction: "long", setup: "Smt", setupId: "pb1", notes: "", images: [], createdAt: n, updatedAt: n, ...extra } as JournalEntry);
const plan = (tradeId: string, date: string, skipRule2: boolean, extra: Partial<TradePlan> = {}): TradePlan => ({
  id: `p-${tradeId}`, date, thesis: "x", playbookId: "pb1", playbookName: "Smt", status: "executed", linkedTradeId: tradeId, createdAt: 1, updatedAt: 1,
  rules: [{ label: "Rule 1: Wait for the sweep", state: "ready" }, { label: "Rule 2: 5m close confirms", state: skipRule2 ? "skipped" : "ready" }], ...extra,
});

// 6 trades: skipping rule 2 lost money, confirming it won.
const entries: JournalEntry[] = [];
const plans: TradePlan[] = [];
const add = (pnl: number, day: number, skip: boolean, emotion?: TradePlan["emotionalState"]) => {
  const e = trade(pnl, `2026-09-${String(day).padStart(2, "0")}`, { planId: `p-t${n + 1}` });
  entries.push(e); plans.push(plan(e.id, e.date, skip, { emotionalState: emotion }));
};
add(-60, 1, true); add(-40, 2, true); add(-50, 3, true, "ANXIOUS"); add(80, 4, false); add(70, 5, false); add(60, 8, false);

{
  const s = ruleStats(plans, entries);
  const r2 = s.find((x) => x.text === "5m close confirms")!;
  assert.equal(r2.planned, 6); assert.equal(r2.skipped, 3); assert.equal(r2.skipRate, 0.5);
  assert.equal(r2.skippedWinRate, 0); assert.equal(r2.confirmedWinRate, 1); assert.equal(r2.skippedAvgPnl, -50);
  assert.equal(s.find((x) => x.text === "Wait for the sweep")!.skipped, 0);
  assert.ok(statFor(s, "pb1", "5m close confirms"));
}
{ // plans that never led to a trade say nothing about results
  const s = ruleStats([plan("missing", "2026-09-20", true)], entries);
  assert.equal(s.length, 0);
}
const draft = (skipped: string[]): PlanDraft => ({ date: "2026-09-10", setupId: "pb1", setupName: "Smt", thesis: "go long", news: [], watch: [], confirmedRules: ["Wait for the sweep"], skippedRules: skipped });
{
  const f = buildOutlookFacts(draft(["5m close confirms"]), entries, plans);
  const skipped = f.factors.find((x) => x.id === "skipped")!;
  assert.equal(skipped.n, 3); assert.equal(skipped.winRate, 0);
  assert.equal(f.skippedRuleHistory[0]!.skippedBefore, 3);
  const o = localOutlook(f, draft(["5m close confirms"]));
  assert.equal(o.lean, "unfavorable"); assert.ok(o.points.some((p) => p.includes("skipped")));
}
{
  const o = localOutlook(buildOutlookFacts(draft([]), entries, plans), draft([]));
  assert.equal(o.lean, "favorable");
}
{ // not enough history: honest, no invented prediction
  const o = localOutlook(buildOutlookFacts(draft([]), entries.slice(0, 2), plans.slice(0, 2)), draft([]));
  assert.equal(o.lean, "unknown");
}
console.log("outlook tests passed");

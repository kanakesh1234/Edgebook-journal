import { strict as assert } from "node:assert";
import type { JournalEntry, JournalSettings, TradePlan } from "../../src/lib/types.ts";
import {
  buildInterventionIndex, candidateInterventions, dataReadiness, emptyPrefs, emptySession, isSuppressed,
  MAX_PER_SESSION, mutedKind, pickIntervention, snoozed, type PlanSnapshot,
} from "../../src/lib/minato/plan-intervention.ts";

let n = 0;
const settings = { traderName: "t", startingEquity: 50000, targetEquity: 53000, maxDrawdown: 2000, currency: "USD", handle: "t" } as unknown as JournalSettings;
const day = (i: number) => `2026-09-${String(i).padStart(2, "0")}`;

/** `count` trades; rule 2 skipped on the first `skipped` of them (those lose), confirmed on the rest (those win). */
function journal(count: number, skipped: number, withText = true) {
  const entries: JournalEntry[] = [], plans: TradePlan[] = [];
  for (let i = 1; i <= count; i++) {
    const skip = i <= skipped;
    const id = `t${++n}`, pid = `p${n}`;
    entries.push({
      id, date: day(i), pnl: skip ? -60 : 70, rr: null, instrument: "MNQ", direction: "long", setup: "Smt", setupId: "pb1",
      notes: withText ? `Took the sweep of the high and the displacement, trade ${i}` : "", images: [], planId: pid, createdAt: n, updatedAt: n,
      review: withText ? { followUp: { mistakeNote: i <= 3 ? "I moved my stop again and never defined the invalidation" : "Followed the plan, patient entry" } } : undefined,
    } as unknown as JournalEntry);
    plans.push({
      id: pid, date: day(i), playbookId: "pb1", playbookName: "Smt", status: "executed", linkedTradeId: id, createdAt: 1, updatedAt: 1,
      thesis: withText ? `Price should sweep the Asia high then reverse and sell off towards the lows, plan ${i}` : "x",
      emotionalState: skip ? "ANXIOUS" : "CALM",
      rules: [{ label: "Rule 1: Wait for the sweep", state: "ready" }, { label: "Rule 2: 5m close confirms", state: skip ? "skipped" : "ready" }],
    } as unknown as TradePlan);
  }
  return { entries, plans };
}

const snap = (over: Partial<PlanSnapshot> = {}): PlanSnapshot => ({
  date: "2026-10-05", thesis: "Price should sweep the Asia high then reverse and sell off towards the lows", thoughts: ["Wait for the displacement"],
  emotion: "CALM", setupId: "pb1", setupName: "Smt", watch: [],
  rules: [{ text: "Wait for the sweep", confirmed: true }, { text: "5m close confirms", confirmed: false }], ...over,
});

// 1. Data gate: a thin journal says nothing, whatever the draft looks like.
{
  const { entries, plans } = journal(6, 3);
  const ix = buildInterventionIndex(entries, plans, settings);
  assert.equal(ix.readiness.ready, false);
  assert.ok(ix.readiness.missing.length > 0 && ix.readiness.progress < 1);
  assert.deepEqual(candidateInterventions(ix, snap()), []);
}
// 2. Enough trades but no written words is still not ready (numbers alone are not enough for this).
{
  const { entries, plans } = journal(14, 5, false);
  const r = dataReadiness(entries, plans, []);
  assert.equal(r.ready, false);
  assert.ok(r.missing.some((m) => m.includes("written") || m.includes("reviewed")));
}
// 3. Ready journal: the skipped-rule history surfaces, with the real numbers behind it.
const { entries, plans } = journal(14, 5);
const ix = buildInterventionIndex(entries, plans, settings, "$");
assert.equal(ix.readiness.ready, true);
{
  const c = candidateInterventions(ix, snap());
  const sk = c.find((x) => x.kind === "skipped-rule");
  assert.ok(sk, "skipped-rule expected");
  assert.match(sk!.insight, /−\$60/); assert.match(sk!.insight, /\+\$70/);
  assert.equal(sk!.sample, 14);
  assert.ok(sk!.evidence.length >= 2 && sk!.evidence[0]!.label.includes("Skipped 5 of 14"));
}
// 4. Not the moment: still working through the checklist (< half confirmed) → no checklist popup.
{
  const c = candidateInterventions(ix, snap({ rules: [{ text: "Wait for the sweep", confirmed: false }, { text: "5m close confirms", confirmed: false }] }));
  assert.ok(!c.some((x) => x.kind === "skipped-rule"));
}
// 5. Everything confirmed → nothing to say about the checklist.
{
  const c = candidateInterventions(ix, snap({ rules: [{ text: "Wait for the sweep", confirmed: true }, { text: "5m close confirms", confirmed: true }] }));
  assert.ok(!c.some((x) => x.kind === "skipped-rule"));
}
// 6. Too little history for one rule (skipped only twice) → evidence gate drops it.
{
  const j = journal(14, 2);
  const c = candidateInterventions(buildInterventionIndex(j.entries, j.plans, settings), snap());
  assert.ok(!c.some((x) => x.kind === "skipped-rule"));
}
// 7. Bias clash is quoted from the trader's own words.
{
  const c = candidateInterventions(ix, snap({ thesis: "Price will rally higher and push up into the highs today", thoughts: ["I expect a drop and sell off lower from the open"] }));
  const b = c.find((x) => x.kind === "bias-clash");
  assert.ok(b); assert.equal(b!.evidence.length, 2); assert.match(b!.evidence[1]!.quote!, /sell off lower/);
}
// 8. Missing invalidation + the trader's own past reviews about it (≥ 2 trades).
{
  const c = candidateInterventions(ix, snap({ thoughts: ["Wait for the displacement candle"], thesis: "Price should sweep the Asia high then reverse towards the lows" }));
  const inv = c.find((x) => x.kind === "invalidation");
  assert.ok(inv); assert.equal(inv!.sample, 3); assert.match(inv!.evidence[0]!.quote!, /stop/);
  const withInv = candidateInterventions(ix, snap({ thoughts: ["Wrong if price closes above the high, cut it"] }));
  assert.ok(!withInv.some((x) => x.kind === "invalidation"));
}
// 9. Emotion pattern needs ≥ 3 plans in that state and a real gap.
{
  const c = candidateInterventions(ix, snap({ emotion: "ANXIOUS" }));
  const e = c.find((x) => x.kind === "emotion");
  assert.ok(e); assert.equal(e!.sample, 5); assert.match(e!.insight, /0 of 5 won/);
  assert.ok(!candidateInterventions(ix, snap({ emotion: "CALM" })).some((x) => x.kind === "emotion"));
}
// 10. Similar earlier plan is found by wording, with its outcome.
{
  const c = candidateInterventions(ix, snap({ thoughts: [] }));
  const s = c.find((x) => x.kind === "similar-plan");
  assert.ok(s); assert.match(s!.insight, /ended [−+]\$\d+/);
}
// 11. Nothing is said before the trader has written enough to compare.
assert.deepEqual(candidateInterventions(ix, snap({ thesis: "go long" })), []);
// 12. Delivery rules: one at a time, per-sitting cap, dismissal, snooze, mute (and expiry).
{
  const now = Date.UTC(2026, 9, 5);
  const c = candidateInterventions(ix, snap({ emotion: "ANXIOUS" }));
  assert.ok(c.length >= 2);
  const sess = emptySession(), prefs = emptyPrefs();
  const first = pickIntervention(c, sess, prefs, now)!;
  assert.ok(first);
  sess.shown.push(first.id);
  assert.notEqual(pickIntervention(c, sess, prefs, now)?.id, first.id);
  sess.shown.push("another");
  assert.equal(sess.shown.length >= MAX_PER_SESSION, true);
  assert.equal(pickIntervention(c, sess, prefs, now), null);
  const sn = snoozed(prefs, first.id, now);
  assert.equal(isSuppressed(first, emptySession(), sn, now + 6 * 86_400_000), true);
  assert.equal(isSuppressed(first, emptySession(), sn, now + 8 * 86_400_000), false);
  const mu = mutedKind(prefs, first.kind, now);
  assert.equal(isSuppressed(first, emptySession(), mu, now + 29 * 86_400_000), true);
  assert.equal(isSuppressed(first, emptySession(), mu, now + 31 * 86_400_000), false);
}
// 13. Same situation → same id (so dismissal sticks across re-evaluation).
assert.equal(candidateInterventions(ix, snap())[0]!.id, candidateInterventions(ix, snap())[0]!.id);

console.log("plan-intervention tests passed");

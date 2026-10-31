import { strict as assert } from "node:assert";
import { journal } from "./fixtures.ts";
import { understand, probGreater, wilson, evidenceLevel } from "../../src/lib/minato/understanding.ts";
import { emptyMemory, observe, decayPass, retention, rejectMemory, restoreMemory, consolidate, activeItems, undoLast, compact, MAX_ACTIVE, type Observation } from "../../src/lib/minato/memory.ts";
import { evolveMemory, applyDirectives } from "../../src/lib/minato/evolve.ts";
import { emptyBrain, applyChat, reconcileBrain, brainForModel, collectWords, buildRecall } from "../../src/lib/minato/brain-ml.ts";
import { applyMemoryOp } from "../../src/lib/minato/bridge.ts";
import { sessionNudge } from "../../src/lib/minato/nudge.ts";
import { routeIntent, planFor, parseTradeRefs } from "../../src/lib/minato/router.ts";
import { retrieveMemories, memoryForModel } from "../../src/lib/minato/retrieve.ts";
import { packFacts } from "../../src/lib/minato/context-pack.ts";
import { buildTradeRows, deepFacts, type RawEntry } from "../../src/lib/minato/facts.ts";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 30);
let passed = 0;
const ok = (c: unknown, m: string) => { assert.ok(c, m); passed++; };

// ---- statistics
ok(probGreater({ k: 9, n: 10 }, { k: 1, n: 10 }) > 0.99, "clear difference → high probability");
ok(Math.abs(probGreater({ k: 5, n: 10 }, { k: 5, n: 10 }) - 0.5) < 0.01, "equal rates → 0.5");
ok(wilson(3, 3).lo < 0.5, "tiny sample keeps a wide interval");
ok(evidenceLevel(0.999, 3, 40, 1, true, true) === null, "n<4 never reported");

// ---- real signal is found, framed as association, with evidence
{
  const entries = journal({ days: 45, breakAfterLoss: 0.8, breakBase: 0.1, seed: 11 });
  const u = understand(entries, [], null);
  const f = u.observations.find((o) => o.id === "sem:post-loss:slips-after-loss");
  ok(f && (f.level === "supported" || f.level === "established"), "post-loss slip detected");
  ok(f!.evidence.length > 0 && f!.evidence.every((e) => e.entryId && e.date), "finding carries evidence refs");
  ok(!/\b(because|caused|causes|makes you)\b/i.test(f!.text), "wording never claims cause");
  ok(u.coverage.withProcess === u.coverage.trades, "coverage reported");
}

// ---- no signal → (almost) no findings. False-positive rate across seeds.
{
  let spurious = 0; const N = 40;
  for (let s = 1; s <= N; s++) {
    const u = understand(journal({ days: 40, breakAfterLoss: 0.25, breakBase: 0.25, seed: 1000 + s }), [], null);
    if (u.observations.some((o) => o.polarity === "risk" && /post-loss|late-day|time-worst|dow-worst|setup-messy|trend/.test(o.axis ?? ""))) spurious++;
  }
  console.log(`  null-journal false-positive rate: ${spurious}/${N}`);
  ok(spurious / N <= 0.12, `false-positive rate ${spurious}/${N} ≤ 12%`);
}

// ---- unreviewed trades are NOT treated as clean
{
  const entries = journal({ days: 45, breakAfterLoss: 0.8, breakBase: 0.1, seed: 11, reviewed: 0 });
  const u = understand(entries, [], null);
  ok(u.coverage.withProcess === 0 && !u.observations.some((o) => o.axis === "post-loss"), "no review answers → no process claims");
  ok(u.gaps.length === 0 || u.gaps.every((g) => g.have <= g.need), "gaps well-formed");
}

// ---- thin data → gaps, not guesses
{
  const u = understand(journal({ days: 3, breakAfterLoss: 0.8, breakBase: 0.1, seed: 5 }), [], null);
  ok(u.observations.length === 0, "3 days of trades → no beliefs");
  ok(u.gaps.length > 0 && u.gaps.length <= 4 && u.gaps.every((g) => g.have < g.need), "…but honest, bounded gaps");
}

// ---- memory lifecycle
const obs = (over: Partial<Observation> = {}): Observation => ({
  id: "sem:x:a", kind: "semantic", topic: "execution", text: "After a loss you slip", short: "Slips after loss", stance: "inference", polarity: "risk",
  level: "supported", confidence: 0.95, n: 20, axis: "x", pole: "a", evidence: [{ entryId: "t1", date: "2026-10-01" }], origin: "derived", ...over,
});
{
  let s = observe(emptyMemory(), obs(), NOW);
  s = observe(s, obs({ n: 25, confidence: 0.97 }), NOW + DAY);
  ok(Object.keys(s.items).length === 1 && s.items["sem:x:a"].n === 25, "same id dedupes and updates");
  ok(s.items["sem:x:a"].log.length >= 2 && s.items["sem:x:a"].log.at(-1)!.prev, "changes are logged with a previous snapshot");

  // supersession: stronger opposite pole replaces
  s = observe(s, obs({ id: "sem:x:b", pole: "b", text: "After a loss you stay steady", short: "Steady after loss", level: "established", confidence: 0.99 }), NOW + 2 * DAY);
  ok(s.items["sem:x:a"].status === "superseded" && s.items["sem:x:a"].supersededBy === "sem:x:b", "stronger opposite pole supersedes");
  ok(s.items["sem:x:a"].evidence.length === 1, "superseded item keeps its evidence");
  s = restoreMemory(s, "sem:x:a", NOW + 3 * DAY);
  ok(s.items["sem:x:a"].status === "supported", "supersession is reversible");

  // weaker opposite → contested, not replaced
  let t = observe(emptyMemory(), obs({ level: "established", confidence: 0.99 }), NOW);
  t = observe(t, obs({ id: "sem:x:c", pole: "c", level: "hypothesis", confidence: 0.93 }), NOW);
  ok(t.items["sem:x:a"].status === "contested" && t.items["sem:x:c"].status === "hypothesis", "weaker opposite evidence → contested");
}
{
  // decay + adaptive half-life
  const fresh = observe(emptyMemory(), obs({ kind: "episodic", id: "ep:1", n: 1, axis: undefined, pole: undefined }), NOW);
  const rep = observe(emptyMemory(), obs({ kind: "episodic", id: "ep:2", n: 12, axis: undefined, pole: undefined }), NOW);
  ok(retention(rep.items["ep:2"], NOW + 90 * DAY) > retention(fresh.items["ep:1"], NOW + 90 * DAY), "repeated confirmation slows forgetting");
  const gone = decayPass(fresh, NOW + 400 * DAY);
  ok(gone.items["ep:1"].status === "retired", "unconfirmed episode is forgotten");
  const back = restoreMemory(gone, "ep:1", NOW + 401 * DAY);
  ok(back.items["ep:1"].status !== "retired", "forgetting is reversible");
  const pinned = decayPass(observe(emptyMemory(), obs({ id: "usr:1", origin: "user", pinned: true, axis: undefined, pole: undefined }), NOW), NOW + 900 * DAY);
  ok(pinned.items["usr:1"].status === "supported", "user-stated, pinned memory never decays");
}
{
  // rejection suppresses until materially new evidence
  let s = observe(emptyMemory(), obs({ n: 10 }), NOW);
  s = rejectMemory(s, "sem:x:a", NOW);
  const same = observe(s, obs({ n: 11 }), NOW + DAY);
  ok(same.items["sem:x:a"].status === "retired", "rejected belief stays down on similar evidence");
  const more = observe(s, obs({ n: 30 }), NOW + 40 * DAY);
  ok(more.items["sem:x:a"].status === "supported", "…and returns when evidence doubles");
  ok(undoLast(s, "sem:x:a").items["sem:x:a"].status === "supported", "undo restores the previous snapshot");
}
{
  // consolidation of episodes under a live belief
  let s = observe(emptyMemory(), obs(), NOW - 60 * DAY);
  s = observe(s, obs({ id: "ep:t1", kind: "episodic", n: 1, axis: undefined, pole: undefined, origin: "journal", at: NOW - 40 * DAY, touch: false }), NOW);
  const c = consolidate(s, NOW);
  ok(c.items["ep:t1"].status === "retired" && c.items["ep:t1"].links.includes("sem:x:a"), "episode folded into the belief it supports");
  // capacity
  let big = emptyMemory();
  for (let i = 0; i < MAX_ACTIVE + 30; i++) big = observe(big, obs({ id: `ep:${i}`, kind: "episodic", n: 1, axis: undefined, pole: undefined, confidence: 0.5 + (i % 10) / 20 }), NOW);
  ok(activeItems(compact(big, NOW)).length <= MAX_ACTIVE, "store stays bounded");
}

// ---- evolution over time: beliefs adapt when behaviour changes (temporal reasoning)
{
  const earlier = journal({ days: 35, breakAfterLoss: 0.85, breakBase: 0.1, seed: 21 });
  let brain = evolveMemory(emptyBrain(), earlier, [], NOW - 60 * DAY);
  const before = brain.memory!.items["sem:post-loss:slips-after-loss"];
  ok(before && before.status !== "retired", "belief formed from early history");
  const later = [...earlier, ...journal({ days: 45, startDay: 40, breakAfterLoss: 0.08, breakBase: 0.08, seed: 22, idPrefix: "u" })];
  brain = evolveMemory(brain, later, [], NOW);
  const after = brain.memory!.items["sem:post-loss:slips-after-loss"];
  ok(!after || after.status === "contested" || after.status === "retired" || after.status === "superseded" || after.status === "hypothesis", `belief weakened after behaviour changed (now: ${after?.status})`);
  ok(!Object.values(brain.memory!.items).some((i) => i.axis === "trend" && i.status !== "retired"), "overall rate unchanged → no false 'trend' claim");
  const same = evolveMemory(brain, later, [], NOW);
  ok(same === brain, "unchanged journal → no work (same object)");
}

// ---- genuine improvement over time is recognised, and worsening is too
{
  const bad = journal({ days: 35, breakAfterLoss: 0.5, breakBase: 0.5, seed: 61 });
  const good = journal({ days: 45, startDay: 40, breakAfterLoss: 0.08, breakBase: 0.08, seed: 62, idPrefix: "u" });
  const up = understand([...bad, ...good], [], null);
  ok(up.shift?.direction === "improving" && up.observations.some((o) => o.pole === "improving"), "improving process recognised");
  const down = understand([...good, ...journal({ days: 45, startDay: 90, breakAfterLoss: 0.5, breakBase: 0.5, seed: 63, idPrefix: "w" })], [], null);
  ok(down.shift?.direction === "worsening", "worsening process recognised");
}

// ---- each day starts clean: yesterday's chat is never linked to today
{
  const mon = Date.UTC(2026, 9, 26, 9), wed = Date.UTC(2026, 9, 28, 15);
  let b = applyChat(emptyBrain(), "I am so frustrated, my internet keeps dropping", mon, "2026-10-26").brain;
  ok(b.mind.notes.some((n) => n.status === "pending") && Object.keys(b.days).length === 1, "feeling held and day brief created on Monday");
  const trade = (date: string, createdAt: number) => ({ id: "x", date, pnl: -50, rr: -1, instrument: "MNQ", direction: "long", notes: "", images: [], createdAt, updatedAt: createdAt }) as never;
  // Wednesday trade must NOT settle Monday's feeling
  const wedState = reconcileBrain(b, [trade("2026-10-28", wed)], wed, "2026-10-28");
  ok(wedState.mind.notes.length === 0 && !Object.keys(wedState.mind.stats).length, "Monday's feeling expires; it is not tied to Wednesday's trade");
  ok(Object.keys(wedState.days).length === 0, "Monday's chat brief is pruned");
  // same-day trade still settles it
  const same = reconcileBrain(b, [trade("2026-10-26", mon + 2 * 3600_000)], mon + 3 * 3600_000, "2026-10-26");
  ok(same.mind.notes.some((n) => n.status === "kept") && Object.values(same.mind.stats)[0]?.seen === 1, "same-day trade still settles the feeling");
  // a quiet day keeps it only until the day ends
  ok(reconcileBrain(b, [], mon + 3600_000, "2026-10-26").mind.notes.length === 1, "kept for the rest of the same day");
  ok(reconcileBrain(b, [], wed, "2026-10-28").mind.notes.length === 0, "dropped once the day is over");
  // nothing from past days reaches the model or the recall index
  ok(brainForModel(b, buildRecall([]), "q", null, "2026-10-28").recentDays.length === 0, "past-day briefs never sent to the model");
  ok(collectWords([], [], {} as never, b, "2026-10-28").every((w) => w.kind !== "chat"), "past chat not in recall");
  ok(collectWords([], [], {} as never, b, "2026-10-26").some((w) => w.kind === "chat"), "today's chat is recalled");
}

// ---- the Mind tab is gone: Minato volunteers a line only when it is relevant, and the trader can still correct/clear it
{
  const entries = journal({ days: 45, breakAfterLoss: 0.8, breakBase: 0.1, seed: 11 });
  const brain = evolveMemory(emptyBrain(), entries, [], NOW);
  const lossToday = (pnl: number) => [{ ...entries[0], id: "today1", date: "2026-10-30", pnl, createdAt: NOW } as never];
  const base = { memory: brain.memory, readiness: null, commitments: [], today: "2026-10-30" };
  ok(sessionNudge({ ...base, entries: lossToday(-100) })?.text.includes("just took a loss"), "just lost + known after-loss pattern → nudge");
  ok(sessionNudge({ ...base, entries: lossToday(150) }) === null, "a winning day → silence");
  ok(sessionNudge({ ...base, entries: [] }) === null, "no trades today → silence");
  ok(sessionNudge({ memory: emptyMemory(), readiness: null, commitments: [], today: "2026-10-30", entries: lossToday(-100) }) === null, "nothing learned yet → silence");
  ok(!/\b(you are|you're a)\b/i.test(sessionNudge({ ...base, entries: lossToday(-100) })!.text), "nudge states no trait");
  const withCommit = sessionNudge({ ...base, entries: [], commitments: [{ id: "c1", date: "2026-10-30", text: "stop after two losses", status: "open", auto: false } as never] });
  ok(withCommit?.text.includes("stop after two losses"), "open commitment is surfaced");

  const id = "sem:post-loss:slips-after-loss";
  const rejected = applyMemoryOp(brain, { type: "reject", id }, NOW);
  ok(rejected.memory!.items[id].status === "retired", "Settings: 'Not accurate' retires the belief");
  ok(applyMemoryOp(rejected, { type: "restore", id }, NOW).memory!.items[id].status !== "retired", "Settings: Restore brings it back");
  let withNote = applyChat(brain, "I am so frustrated today", NOW, "2026-10-30").brain;
  ok(withNote.mind.notes.length > 0, "feeling held");
  const cleared = applyMemoryOp(withNote, { type: "clear" }, NOW);
  ok(Object.keys(cleared.memory!.items).length === 0 && cleared.mind.notes.length === 0, "Clear removes beliefs and held feelings");
  ok(evolveMemory(cleared, entries, [], NOW + 1000).memory!.items[id] === undefined, "a cleared belief does not instantly reappear");
}

// ---- directives
{
  let b = emptyBrain();
  const r = applyDirectives(b, "Remember that I only trade the NY open.", NOW);
  ok(r.remembered && Object.values(r.brain.memory!.items)[0].pinned, "remember → pinned memory with attribution");
  ok(/You told me/.test(Object.values(r.brain.memory!.items)[0].text), "provenance preserved");
  const f = applyDirectives(r.brain, "forget that I only trade the NY open", NOW);
  ok(f.forgotten && Object.values(f.brain.memory!.items)[0].status === "retired", "forget retires the closest memory (restorable)");
}

// ---- router
{
  const t = (q: string, want: string, focus = false) => ok(routeIntent(q, { hasFocus: focus }).intent === want, `"${q}" → ${want} (got ${routeIntent(q, { hasFocus: focus }).intent})`);
  t("hey", "chitchat"); t("thanks!", "chitchat");
  t("Review my last trade", "trade_review"); t("What did I do well?", "trade_review", true);
  t("How am I doing lately?", "performance"); t("How is my mindset?", "behavior");
  t("What pattern keeps repeating?", "behavior"); t("What should I practise next?", "practice");
  t("Help me reset after today", "planning"); t("which setup is my best?", "strategy");
  t("what do you remember about me?", "memory"); t("is this a valid liquidity sweep and fvg?", "technical");
  t("blorp", "general");
  ok(routeIntent("why?", { prev: "behavior" }).inherited, "short follow-up inherits previous intent");
  const refs = parseTradeRefs("how was my 12/10/2026 NQ trade and the last 3 trades, worst loss on Mondays", { instruments: ["NQ", "MNQ"], setups: ["Sweep"] }, "2026-10-30");
  ok(refs.dates.includes("2026-10-12") && refs.lastN === 3 && refs.instruments.includes("NQ") && refs.extreme === "worst" && refs.weekdays.includes(1), "trade references parsed (DD/MM/YYYY)");
  ok(parseTradeRefs("31 Aug", { instruments: [], setups: [] }, "2026-10-30").dates[0] === "2026-08-31", "day-month without year → most recent");
}

// ---- retrieval
{
  const entries = journal({ days: 50, breakAfterLoss: 0.8, breakBase: 0.1, seed: 31 });
  const brain = evolveMemory(emptyBrain(), entries, [], NOW);
  const plan = planFor(routeIntent("why do I revenge trade after a loss?"));
  const got = retrieveMemories(brain.memory, "why do I revenge trade after a loss?", plan, NOW);
  ok(got.length > 0 && /loss/i.test(got[0].item.text), "revenge/loss question retrieves the after-loss belief first");
  const none = retrieveMemories(emptyMemory(), "anything", plan, NOW);
  ok(none.length === 0, "empty store → nothing");
  const payload = memoryForModel(brain.memory, "mindset", planFor(routeIntent("how is my mindset?")), NOW);
  ok(payload.beliefs.every((b) => b.basedOn >= 1 && b.stance), "payload carries counts and stance");
}

// ---- context packing: quality-preserving token reduction
{
  const entries = journal({ days: 160, breakAfterLoss: 0.7, breakBase: 0.15, seed: 41 }).map((e, i) => ({
    ...e, notes: `Trade ${i}: waited for the sweep of the Asia high, displacement then entry on the retest; stop above the high.`,
    reflection: { ...e.reflection!, wentWell: "patient entry on the retest with a clear invalidation", wentPoorly: i % 3 ? "" : "moved my stop and chased", lesson: "wait for confirmation before sizing up", updatedAt: 1 },
    review: { followUp: { biggestMistake: i % 4 ? "" : "entered before the close confirmed", watchNext: "check the SMT before entry" }, concepts: { used: ["sweep", "smt"], learned: "displacement matters" }, execution: { movedStop: i % 5 === 0 } },
  })) as unknown as RawEntry[];
  const { recentTrades, lessons, traderWords, tradeHistory } = buildTradeRows(entries);
  const facts: Record<string, any> = {
    currentContext: { today: "2026-10-30" }, trader: "T", primaryChallenge: null, trades: 160, totalPnl: 1, winRatePct: 50, avgDayPnl: 1, drawdown: 1, hold: { sample: 1 }, patterns: [], processScore: 70, reviewedCount: 160,
    conceptsUsed: ["sweep"], planVsActual: null, companion: { brain: { today: "x", recentDays: [], recalled: [1, 2, 3, 4, 5, 6] }, mind: {}, practice: { xp: 1 } }, deep: deepFacts(entries), recentTrades: tradeHistory, traderWords, lessons,
  };
  void recentTrades;
  const run = (q: string, focusId?: string) => {
    const route = routeIntent(q, { hasFocus: !!focusId });
    return packFacts({ facts, route, plan: planFor(route), refs: parseTradeRefs(q, { instruments: ["MNQ"], setups: ["Sweep", "Retest"] }, "2026-10-30"), focusId, today: "2026-10-30" });
  };
  const cases: [string, number][] = [["hey", 0.97], ["how am I doing lately?", 0.7], ["Review my last trade", 0.9], ["how is my mindset?", 0.8], ["what should I improve and why", 0.6]];
  for (const [q, minCut] of cases) {
    const r = run(q);
    const cut = 1 - r.meta.approxTokens / r.meta.fullApproxTokens;
    console.log(`  ${q.padEnd(34)} intent=${r.meta.intent.padEnd(12)} ${r.meta.fullApproxTokens} → ${r.meta.approxTokens} tokens (−${Math.round(cut * 100)}%), trades shown ${r.meta.tradesShown}/${r.meta.tradesInJournal}`);
    ok(cut >= minCut, `"${q}" cuts ≥ ${minCut * 100}% (got ${Math.round(cut * 100)}%)`);
  }
  const last = run("Review my last trade").facts as Record<string, any>;
  ok(last.referencedTrades?.length === 1 && last.referencedTrades[0].date === tradeHistory[0].date, "last trade resolved to the newest trade");
  ok(last.traderWords?.length >= 1 && last.similarPastTrades?.length >= 1, "review gets the trader's words and analogues");
  const dated = run(`how was the ${tradeHistory[40].date} trade`).facts as Record<string, any>;
  ok(dated.referencedTrades?.some((r: any) => r.date === tradeHistory[40].date), "explicit date resolved even deep in history");
  ok(/never claim/i.test(JSON.stringify(dated.scope)), "scope warns the model it sees a slice");
  const focus = run("What did I do well?", String((recentTrades as any)[7].id)).facts as Record<string, any>;
  ok(focus.referencedTrades?.[0]?.date === tradeHistory[7].date, "focus trade always included");
}

console.log(`mind-engine tests passed (${passed} assertions)`);

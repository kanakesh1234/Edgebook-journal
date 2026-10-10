import { strict as assert } from "node:assert";
import type { JournalEntry } from "../../src/lib/types.ts";
import { assessTrade, assessAll, updateRevision, revisitIds, weightsOf } from "../../src/lib/practice/focus.ts";
import { assembleSession } from "../../src/lib/practice/session.ts";
import { fpKey, updateLedger } from "../../src/lib/practice/ledger.ts";
import { buildPool } from "../../src/lib/practice/engine.ts";
import { evaluateRound, gateFor } from "../../src/lib/practice/arena.ts";
import { tierMix, stageOf, levelUpNote } from "../../src/lib/practice/curriculum.ts";
import { nextStreak } from "../../src/lib/practice/engine.ts";

let n = 0;
const trade = (over: Partial<JournalEntry> & Record<string, unknown> = {}): JournalEntry => ({
  id: `t${++n}`, date: `2026-09-${String(10 + n).padStart(2, "0")}`, pnl: 100, rr: 1, instrument: "MNQ", direction: "long", setup: "Sweep", notes: "", images: [],
  entryTime: "09:40", exitTime: "09:55", entryPrice: 100, exitPrice: 110, stopLoss: 95, takeProfit: 115, quantity: 2, createdAt: 1, updatedAt: 1, ...over,
} as JournalEntry);

const blunder = trade({ pnl: -300, exitPrice: 80, review: { execution: { movedStop: true }, outcome: { followedPlan: false, processVerdict: "process-failure" }, followUp: { mistake: "stop", blunderLevel: 3, mistakeNote: "I moved my stop twice and let it run far past the level." } } });
const slip = trade({ pnl: -40, review: { followUp: { mistake: "early", blunderLevel: 1 } } });
const clean1 = trade({ pnl: 150, review: { outcome: { followedPlan: true, processVerdict: "a-plus" }, followUp: { mistake: "none" } } });
const clean2 = trade({ pnl: 90, review: { outcome: { followedPlan: true, processVerdict: "process-success" } } });
const plain = [trade({ pnl: 60 }), trade({ pnl: -50 }), trade({ pnl: -80 })];
const all = [blunder, slip, clean1, clean2, ...plain];

// ---- focus: the trader's own rating decides
const f = assessAll(all);
assert.equal(f.get(blunder.id)!.kind, "blunder");
assert.equal(f.get(blunder.id)!.mistakeLabel, "Moved stop");
assert.ok(f.get(blunder.id)!.weight >= 3, "a blunder gets at least 3 shares");
assert.equal(f.get(slip.id)!.kind, "slip");
assert.equal(f.get(clean1.id)!.kind, "clean");
assert.equal(f.get(clean1.id)!.weight, 0.5);
// a lucky win with bad process is still a blunder
const lucky = trade({ pnl: 500, review: { outcome: { badTradeDespiteWin: true, followedPlan: false, processVerdict: "process-failure" }, followUp: { mistake: "plan", blunderLevel: 2 } } });
assert.equal(assessTrade(lucky, [lucky, ...plain]).kind, "blunder");
assert.deepEqual([...revisitIds(all)].sort(), [blunder.id, slip.id].sort());

// ---- the round: blunder trade gets far more questions than a clean one
const pool = buildPool({ mode: "time-machine", trades: all, all, seed: 7, drawdownLeft: null });
const tags = new Set(pool.map((q) => q.tag));
for (const t of ["mistake-type", "mistake-severity", "mistake-cost", "stop-overrun", "stop-saved", "pnl-typed"]) assert.ok(tags.has(t), `missing family ${t}`);
for (const q of pool) { if (q.kind === "choice") assert.ok(q.choices!.includes(q.answer), q.id); else assert.ok(Number.isFinite(Number(q.answer)), q.id); }
const overrun = pool.find((q) => q.tag === "stop-overrun" && q.tradeId === blunder.id)!;
assert.equal(Number(overrun.answer), 15, "entry 100 stop 95 exit 80 long → lost 20, stop was 5 → 15 past it");
assert.ok(pool.filter((q) => q.tradeId === blunder.id).every((q) => q.focus === "blunder" && q.pin.startsWith("Mistake replay")));
assert.ok(pool.filter((q) => q.tradeId === clean1.id).every((q) => q.pin.startsWith("Done well")));

const share = (seed: number) => {
  const a = assembleSession({ questions: pool, progress: { xp: 0, streak: 0 }, count: 20, startLevel: 2, level: 4, weights: { tm: 1 }, hasChart: new Set(), tradeWeights: weightsOf(all), today: "2026-10-10", seed });
  const per = (id: string) => a.pool.filter((q) => q.tradeId === id).length;
  return { blunder: per(blunder.id), clean: per(clean1.id) + per(clean2.id), a };
};
let b = 0, c = 0;
for (let seed = 1; seed <= 20; seed++) { const r = share(seed); b += r.blunder; c += r.clean; }
assert.ok(b / 20 >= 3 * (c / 20 / 2), `blunder trade (${b / 20}/round) should get at least 3x a clean one (${c / 40}/round)`);
assert.ok(b / 20 <= 10, "no single trade takes over the round");

// ---- spaced revision: a right answer on a blunder question is held, then returns; a clean one retires
const bq = pool.find((q) => q.tradeId === blunder.id && q.tag === "mistake-type")!;
const cq = pool.find((q) => q.tradeId === clean1.id)!;
const revisit = revisitIds(all);
const day1 = "2026-10-10";
const r1 = updateRevision({ xp: 0, streak: 0 }, [{ key: fpKey(bq.fp), correct: true, tradeId: bq.tradeId }, { key: fpKey(cq.fp), correct: true, tradeId: cq.tradeId }], day1, revisit);
assert.deepEqual(r1.revision[fpKey(bq.fp)], { box: 1, due: "2026-10-11", trade: blunder.id });
assert.ok(!(fpKey(cq.fp) in r1.revision), "clean trades are not scheduled");
const ledger1 = updateLedger({ xp: 0, streak: 0 }, [{ fp: bq.fp, correct: true, retire: false }, { fp: cq.fp, correct: true, retire: true }]);
const prog1 = { xp: 0, streak: 0, ledger: ledger1, revision: r1.revision };
const withBq = (today: string) => assembleSession({ questions: [bq, cq], progress: prog1, count: 5, startLevel: 1, weights: { tm: 1 }, hasChart: new Set(), today, seed: 1 });
assert.ok(!withBq(day1).pool.some((q) => q.fp === bq.fp), "held until its date");
assert.equal(withBq(day1).held, 1);
assert.ok(!withBq(day1).pool.some((q) => q.fp === cq.fp), "clean question retired for good");
const later = withBq("2026-10-11");
assert.ok(later.pool.some((q) => q.fp === bq.fp && q.revise), "due again the next day");
assert.equal(later.revise, 1);
// a miss resets to box 0, a long run of right answers masters it
const miss = updateRevision(prog1, [{ key: fpKey(bq.fp), correct: false, tradeId: bq.tradeId }], "2026-10-12", revisit);
assert.equal(miss.revision[fpKey(bq.fp)]!.box, 0);
let rev = prog1.revision; let mastered = false; let day = 11;
for (let i = 0; i < 6 && !mastered; i++) { const r = updateRevision({ xp: 0, streak: 0, revision: rev }, [{ key: fpKey(bq.fp), correct: true, tradeId: bq.tradeId }], `2026-11-${String(day++).padStart(2, "0")}`, revisit); rev = r.revision; mastered = r.mastered.size > 0; }
assert.ok(mastered && !(fpKey(bq.fp) in rev), "the last box retires it");

// ---- levels: harder questions as you climb, gate stays reachable, running out of questions is free
const mean = (lv: number) => tierMix(lv).reduce((s, v, i) => s + v * (i + 1), 0);
for (let lv = 1; lv < 12; lv++) assert.ok(mean(lv + 1) >= mean(lv) - 1e-9, `mix should not get easier at ${lv}`);
assert.ok(tierMix(1)[0] > 0.5 && tierMix(12)[3] > 0.7);
for (const lv of [1, 5, 12]) assert.ok(Math.abs(tierMix(lv).reduce((a, v) => a + v, 0) - 1) < 1e-9);
assert.equal(stageOf(1).name, "Recognition"); assert.equal(stageOf(8).name, "Analysis"); assert.equal(stageOf(40).name, "Mastery");
assert.ok(levelUpNote(5).title.includes("Application"));
assert.equal(gateFor("time-machine", 500).correct, 9, "chart rounds cap at a reachable 9");
assert.ok(gateFor("time-machine", 40).accuracy > gateFor("time-machine", 8).accuracy, "past the cap the ladder climbs through accuracy");
const dry = evaluateRound({ mode: "time-machine", level: 4, fails: 1, correct: 2, answered: 6, completed: true, exhausted: true });
assert.equal(dry.outcome, "early"); assert.equal(dry.reason, "ran-out"); assert.equal(dry.nextLevel, 4); assert.equal(dry.nextFails, 1);
assert.equal(evaluateRound({ mode: "time-machine", level: 4, fails: 1, correct: 2, answered: 6, completed: true }).outcome, "down");
const poolLv = (level: number) => assembleSession({ questions: pool, progress: { xp: 0, streak: 0 }, count: 12, startLevel: 1, level, weights: { tm: 1 }, hasChart: new Set(), tradeWeights: weightsOf(all), today: day1, seed: 3 }).pool;
const avgLevel = (qs: { level: number }[]) => qs.reduce((s, q) => s + q.level, 0) / qs.length;
assert.ok(avgLevel(poolLv(12)) > avgLevel(poolLv(1)) + 0.8, "a level-12 round is clearly harder than level 1");

// ---- streak freezes are earned back
assert.equal(nextStreak({ xp: 0, streak: 6, freezeDays: 0, lastMissionDate: "2026-10-09" }, "2026-10-10").freezeDays, 1);
assert.equal(nextStreak({ xp: 0, streak: 6, freezeDays: 2, lastMissionDate: "2026-10-09" }, "2026-10-10").freezeDays, 2);
assert.equal(nextStreak({ xp: 0, streak: 3, freezeDays: 1, lastMissionDate: "2026-10-08" }, "2026-10-10").freezeDays, 0);
console.log("focus.test.ts ok");

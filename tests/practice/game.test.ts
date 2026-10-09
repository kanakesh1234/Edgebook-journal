import { strict as assert } from "node:assert";
import { ictQuestions, CONCEPTS } from "../../src/lib/practice/ict.ts";
import { applyRoundToLog, claim, markAllDone, questsFor, questStates, allDone, CHEST_REWARD } from "../../src/lib/practice/quests.ts";
import { updateRecords, recordsOf } from "../../src/lib/practice/records.ts";
import { achievementStates, newlyEarned, stamp } from "../../src/lib/practice/achievements.ts";
import type { GameProgress as PracticeProgress } from "../../src/lib/practice/progress-ext.ts";

const base: PracticeProgress = { xp: 0, streak: 0 };

// ---- ICT: every question is answerable and internally consistent
for (const seed of [1, 7, 42, 999, 123456]) {
  const qs = ictQuestions({ seed, retired: () => false, scenes: 24 });
  assert.ok(qs.length > 40);
  const fps = new Set<string>();
  for (const q of qs) {
    assert.ok(!fps.has(q.fp), `duplicate fp ${q.fp}`);
    fps.add(q.fp);
    assert.equal(q.group, "ict");
    if (q.kind === "choice") { assert.ok(q.choices!.includes(q.answer), q.id); assert.ok(q.choices!.length >= 3, q.id); assert.equal(new Set(q.choices).size, q.choices!.length); }
    else assert.ok(Number.isFinite(Number(q.answer)), q.id);
    for (const k of q.visual?.candles ?? []) assert.ok(k.h >= Math.max(k.o, k.c) && k.l <= Math.min(k.o, k.c), `bad candle in ${q.id}`);
  }
}
// FVG answers match the rule applied to the drawn candles
for (const q of ictQuestions({ seed: 5, retired: () => false, scenes: 40 }).filter((x) => x.id.startsWith("ict:gen:fvg-read"))) {
  const [a, , c] = q.visual!.candles;
  const truth = a!.h < c!.l ? "Bullish FVG" : a!.l > c!.h ? "Bearish FVG" : "No FVG";
  assert.equal(q.answer, truth);
}
// retired concepts re-key instead of running dry
const retiredC0 = new Set(CONCEPTS.map((c) => `ict:${c.id}:c0`));
const next = ictQuestions({ seed: 3, retired: (fp) => retiredC0.has(fp), scenes: 0 });
assert.equal(next.length, CONCEPTS.length);
assert.ok(next.every((q) => q.fp.endsWith(":c1")));

// ---- quests: deterministic, three lanes, derived progress
assert.deepEqual(questsFor("2026-10-10"), questsFor("2026-10-10"));
assert.equal(questsFor("2026-10-10").length, 3);
const day = "2026-10-10";
let p: PracticeProgress = { ...base, dailyStats: { [day]: { xp: 1000, correct: 100, total: 100 } } };
p = { ...p, questLog: applyRoundToLog(p, day, { mode: "ict", passed: true, maxCombo: 12, correct: 20, total: 20, ictCorrect: 20 }) };
p = { ...p, questLog: applyRoundToLog(p, day, { mode: "matrix", passed: true, maxCombo: 3, correct: 10, total: 10, ictCorrect: 0 }) };
let states = questStates(p, day);
assert.ok(allDone(states), JSON.stringify(states));
// claiming: needs done, pays once, chest needs every claim first
assert.equal(claim(p, day, "chest").xp, 0);
for (const s of states) {
  const r = claim(p, day, s.id);
  assert.equal(r.xp, s.reward);
  p = { ...p, questLog: r.questLog };
  assert.equal(claim(p, day, s.id).xp, 0, "no double claim");
}
assert.equal(claim(p, day, "chest").xp, CHEST_REWARD);
assert.equal(claim({ ...base }, day, questsFor(day)[0]!.id).xp, 0, "unfinished quest pays nothing");
// markAllDone fires once
const m1 = markAllDone(p, day); assert.equal(m1.first, true);
assert.equal(markAllDone({ ...p, questLog: m1.questLog }, day).first, false);
// old days are trimmed
let trimmed: PracticeProgress = base;
for (let d = 1; d <= 20; d++) trimmed = { ...trimmed, questLog: applyRoundToLog(trimmed, `2026-09-${String(d).padStart(2, "0")}`, { mode: "matrix", passed: false, maxCombo: 0, correct: 1, total: 2, ictCorrect: 0 }) };
assert.equal(Object.keys(trimmed.questLog!).length, 14);

// ---- records: first round sets a baseline silently, later rounds report what was beaten
const r1 = updateRecords(base, { correct: 8, total: 10, xp: 30, maxCombo: 4, streak: 1 });
assert.deepEqual(r1.broken, []);
assert.equal(r1.records.rounds, 1);
const r2 = updateRecords({ ...base, records: r1.records }, { correct: 9, total: 10, xp: 25, maxCombo: 6, streak: 2 });
assert.deepEqual(new Set(r2.broken), new Set(["bestStreak", "bestCombo", "bestAccuracy", "bestCorrect"]));
assert.equal(r2.records.bestRoundXp, 30, "records never go down");
assert.equal(updateRecords(base, { correct: 5, total: 5, xp: 5, maxCombo: 1, streak: 1 }).records.bestAccuracy, 0, "accuracy needs 8+ answers");
assert.equal(recordsOf({ ...base, streak: 9 }).bestStreak, 9);

// ---- achievements: derived, stamped once
assert.equal(achievementStates(undefined).filter((a) => a.unlocked).length, 0);
const strong: PracticeProgress = { ...base, xp: 600, streak: 3, perfectSets: 1, masteryByTag: { "ict-fvg": 20, "ict-pd": 6, "trade-x": 100 }, records: { rounds: 30, bestStreak: 3, bestCombo: 5, bestAccuracy: 0.9, bestRoundXp: 40, bestCorrect: 12, questDays: 0 } };
const earned = new Set(newlyEarned(strong));
for (const id of ["first-round", "rounds-25", "streak-3", "flow-5", "perfect-1", "sharp-90", "ict-25", "xp-500"]) assert.ok(earned.has(id), id);
assert.ok(!earned.has("ict-100") && !earned.has("streak-7"));
assert.equal(newlyEarned({ ...strong, achievements: stamp(strong, [...earned], "2026-10-10") }).length, 0);

console.log("game.test.ts ok");

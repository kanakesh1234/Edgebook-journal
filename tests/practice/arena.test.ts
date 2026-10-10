import { strict as assert } from "node:assert";
import { applyOutcome, arenaLevels, evaluateRound, failsOf, gateFor, levelOf, nudge, targetDifficulty, tierOf } from "../../src/lib/practice/arena.ts";
import { nextQuestionBank, readMissed } from "../../src/lib/practice/bank.ts";

// ---- gates rise with level and cap per mode
assert.deepEqual(gateFor("time-machine", 1), { correct: 4, accuracy: 0.708 });
assert.equal(gateFor("time-machine", 5).correct, 7);
assert.equal(gateFor("math-duel", 1).correct, 6);
assert.ok(gateFor("math-duel", 10).correct > gateFor("time-machine", 10).correct);
assert.equal(gateFor("time-machine", 500).correct, 9);
assert.equal(gateFor("math-duel", 500).correct, 30);
assert.equal(gateFor("boss", 500).accuracy, 0.85);
for (let lv = 1; lv < 60; lv++) assert.ok(gateFor("matrix", lv + 1).correct >= gateFor("matrix", lv).correct);

// ---- question difficulty climbs, then tops out at 4
assert.equal(targetDifficulty(1), 1.4);
assert.ok(targetDifficulty(5) > targetDifficulty(2));
assert.equal(targetDifficulty(50), 4);
assert.equal(tierOf(1), 1);
assert.equal(tierOf(50), 4);

// ---- live nudge inside a round
assert.deepEqual(nudge(2, { right: 3, wrong: 0 }), { target: 2.5, streak: { right: 0, wrong: 0 } });
assert.deepEqual(nudge(2, { right: 0, wrong: 2 }), { target: 1.5, streak: { right: 0, wrong: 0 } });
assert.equal(nudge(4, { right: 3, wrong: 0 }).target, 4);
assert.equal(nudge(1, { right: 0, wrong: 2 }).target, 1);
assert.deepEqual(nudge(2, { right: 1, wrong: 0 }), { target: 2, streak: { right: 1, wrong: 0 } });

// ---- level changes
const base = { mode: "time-machine" as const, level: 3, fails: 0, completed: true };
const pass = evaluateRound({ ...base, correct: 6, answered: 7 });
assert.equal(pass.outcome, "up");
assert.equal(pass.nextLevel, 4);
assert.equal(pass.nextFails, 0);

// enough correct answers but sloppy accuracy does not pass
assert.equal(evaluateRound({ ...base, correct: 6, answered: 12 }).outcome, "hold");
// accurate but too few answered does not pass
assert.equal(evaluateRound({ ...base, correct: 4, answered: 4 }).outcome, "hold");

const firstMiss = evaluateRound({ ...base, correct: 2, answered: 8 });
assert.equal(firstMiss.outcome, "hold");
assert.equal(firstMiss.nextFails, 1);
const secondMiss = evaluateRound({ ...base, fails: 1, correct: 2, answered: 8 });
assert.equal(secondMiss.outcome, "down");
assert.equal(secondMiss.nextLevel, 2);
assert.equal(secondMiss.nextFails, 0);

// level 1 never drops
const floor = evaluateRound({ ...base, level: 1, fails: 5, correct: 0, answered: 6 });
assert.equal(floor.outcome, "hold");
assert.equal(floor.nextLevel, 1);

// leaving early or barely playing never costs a level
assert.equal(evaluateRound({ ...base, fails: 1, correct: 0, answered: 9, completed: false }).outcome, "early");
assert.equal(evaluateRound({ ...base, fails: 1, correct: 0, answered: 2 }).nextLevel, 3);
assert.equal(evaluateRound({ ...base, fails: 1, correct: 0, answered: 2 }).nextFails, 1);

// ---- storage block
const progress = { xp: 0, streak: 0, arena: { levels: { boss: 4 }, fails: { boss: 1 }, best: { boss: 9 } } };
assert.equal(levelOf(progress, "boss"), 4);
assert.equal(levelOf(progress, "matrix"), 1);
assert.equal(failsOf(progress, "boss"), 1);
assert.equal(levelOf(undefined, "matrix"), 1);
assert.deepEqual(arenaLevels(progress), { matrix: 1, "time-machine": 1, "math-duel": 1, boss: 4, ict: 1 });
const updated = applyOutcome(progress, "boss", evaluateRound({ mode: "boss", level: 4, fails: 1, correct: 12, answered: 13, completed: true }), 12);
assert.equal(updated.levels?.boss, 5);
assert.equal(updated.fails?.boss, 0);
assert.equal(updated.best?.boss, 12);
assert.equal(progress.arena.levels.boss, 4); // input untouched
assert.equal(applyOutcome(progress, "boss", evaluateRound({ mode: "boss", level: 4, fails: 0, correct: 1, answered: 5, completed: true }), 1).best?.boss, 9);

// ---- missed bank: wrong stays (as a full question), right clears it
const q = (n: number) => ({ id: `ai:${n}`, fp: `ai:${n}`, kind: "choice" as const, tag: "concept", level: 2 as const, prompt: `Question number ${n}?`, choices: ["a", "b", "c", "d"], answer: "a", explanation: "because", pin: "t", xp: 20, source: "ai" as const });
let bank = nextQuestionBank({ xp: 0, streak: 0 }, [{ question: q(1), correct: false }, { question: q(2), correct: true }, { question: q(3), correct: false }]);
assert.deepEqual(readMissed({ xp: 0, streak: 0, questionBank: bank }).map((x) => x.fp), ["ai:1", "ai:3"]);
bank = nextQuestionBank({ xp: 0, streak: 0, questionBank: bank }, [{ question: q(1), correct: true }]);
assert.deepEqual(readMissed({ xp: 0, streak: 0, questionBank: bank }).map((x) => x.fp), ["ai:3"]);
// other bank entries are preserved; the list is capped; junk is ignored
const other = { key: "other", cards: [1], createdAt: 1 };
bank = nextQuestionBank({ xp: 0, streak: 0, questionBank: [other, { key: "missed", cards: [{ nope: true }], createdAt: 1 }] }, Array.from({ length: 55 }, (_, i) => ({ question: q(i), correct: false })));
assert.ok(bank.some((b) => b.key === "other"));
assert.equal(readMissed({ xp: 0, streak: 0, questionBank: bank }).length, 40);
bank = nextQuestionBank({ xp: 0, streak: 0, questionBank: bank }, readMissed({ xp: 0, streak: 0, questionBank: bank }).map((question) => ({ question, correct: true })));
assert.deepEqual(bank.map((b) => b.key), ["other"]);

// ---- the progress meter tracks the CURRENT level only
import { levelBestOf } from "../../src/lib/practice/arena.ts";
const lb = { xp: 0, streak: 0, arena: { levels: { boss: 4 }, fails: { boss: 0 }, levelBest: { boss: 3 } } };
assert.equal(levelBestOf(lb, "boss"), 3);
assert.equal(levelBestOf(undefined, "matrix"), 0);
// same level: keep the higher of old and new
const heldOutcome = evaluateRound({ mode: "boss", level: 4, fails: 0, correct: 2, answered: 8, completed: true });
assert.equal(heldOutcome.outcome, "hold");
assert.equal(applyOutcome(lb, "boss", heldOutcome, 2).levelBest?.boss, 3);
assert.equal(applyOutcome(lb, "boss", { ...heldOutcome }, 5).levelBest?.boss, 5);
// level up and level down both start the next level from zero
const upOutcome = evaluateRound({ mode: "boss", level: 4, fails: 0, correct: 12, answered: 13, completed: true });
assert.equal(upOutcome.outcome, "up");
assert.equal(applyOutcome(lb, "boss", upOutcome, 12).levelBest?.boss, 0);
const downOutcome = evaluateRound({ mode: "boss", level: 4, fails: 1, correct: 1, answered: 9, completed: true });
assert.equal(downOutcome.outcome, "down");
assert.equal(applyOutcome(lb, "boss", downOutcome, 1).levelBest?.boss, 0);
assert.equal(lb.arena.levelBest.boss, 3); // input untouched

console.log("arena + bank tests passed");

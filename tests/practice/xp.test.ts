import { strict as assert } from "node:assert";
import { DAILY_XP_GOAL, earnedXp, xpLevel } from "../../src/lib/practice/xp.ts";

// ---- never zero, never negative, never NaN
assert.equal(earnedXp(0), 1);
assert.equal(earnedXp(-5), 1);
assert.equal(earnedXp(1), 1);

// ---- pinned reference points
assert.deepEqual([10, 12, 24, 50, 100, 144].map(earnedXp), [3, 3, 5, 7, 10, 12]);

// ---- harder questions still pay more, but far less than linearly
let prev = 0;
for (let base = 0; base <= 400; base += 5) { const x = earnedXp(base); assert.ok(x >= prev, `monotonic at ${base}`); prev = x; }
assert.ok(earnedXp(200) < 0.2 * 200, "high-level answers pay a small fraction of the old value");
assert.ok(earnedXp(100) <= 4 * earnedXp(12), "10x the difficulty is NOT 10x the reward");

// ---- pacing: rounds needed to fill a player level
const rounds = (perAnswerBase: number, correct: number, need: number) => Math.ceil(need / (correct * earnedXp(perAnswerBase)));
assert.ok(rounds(11, 6, xpLevel(0).need) >= 10, "first player level takes 10+ early rounds");      // level-1 round, 200 XP
assert.ok(rounds(60, 7, 300) >= 6, "mid game still takes 6+ rounds per player level");              // arena level ~5
assert.ok(rounds(120, 10, 500) >= 5, "late game still takes 5+ rounds per player level");           // arena level ~10

// ---- the daily goal is reachable in a few rounds, not dozens
assert.ok(Math.ceil(DAILY_XP_GOAL / (6 * earnedXp(11))) <= 3);

console.log("xp tests passed");

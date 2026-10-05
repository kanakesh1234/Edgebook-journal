import { strict as assert } from "node:assert";
import { attemptRewards, completionStreak, nextDueDate, nextStars, nextUp, realizedR, tradeResult } from "../../src/lib/matrix/progression.ts";
import { fixtureJournal } from "./fixture-journal.ts";
import "./questions.test.ts";
import "./attempt.test.ts";
import "./overview.test.ts";
import "./rewards.test.ts";
import "../practice/arena.test.ts";

const [longWin, shortLoss, incomplete] = fixtureJournal.entries;
const win = realizedR(longWin);
assert.equal(win.r, 2);
assert.equal(tradeResult(win.r), "win");
assert.equal(realizedR(shortLoss).r, -.6);
assert.equal(tradeResult(0.1), "breakeven");
assert.deepEqual(realizedR(incomplete), { r: null, reason: "missing-stop" });
assert.deepEqual(realizedR({ ...longWin, direction: null }), { r: null, reason: "missing-direction" });

assert.equal(nextStars(0, []), 0);
assert.equal(nextStars(0, [{ accuracy: .5, completedOn: "2026-10-01" }]), 1);
assert.equal(nextStars(1, [{ accuracy: .72, completedOn: "2026-10-01" }]), 2);
assert.equal(nextStars(2, [{ accuracy: .91, completedOn: "2026-10-01" }, { accuracy: .95, completedOn: "2026-10-02" }]), 3);
assert.equal(nextStars(3, [{ accuracy: .2, completedOn: "2026-10-03" }]), 3);

assert.equal(nextDueDate("2026-10-01", .6), "2026-10-02");
assert.equal(nextDueDate("2026-10-01", .8), "2026-10-04");
assert.equal(nextDueDate("2026-10-01", .95), "2026-10-08");
assert.equal(nextDueDate("2026-10-01", .95, 1), "2026-10-15");

const candidate = nextUp(fixtureJournal.entries.map(({ id, date }) => ({ id, date })), {
  "long-win": { tradeId: "long-win", stars: 3, dueOn: "2026-10-10", attempts: [{ accuracy: 1, completedOn: "2026-10-01" }] },
  "short-loss": { tradeId: "short-loss", stars: 1, dueOn: "2026-10-01", attempts: [{ accuracy: .4, completedOn: "2026-09-30" }] },
}, "2026-10-03");
assert.equal(candidate?.id, "short-loss");

assert.deepEqual(attemptRewards(6, 8, 0), { xp: 90, tokens: 9 });
assert.deepEqual(attemptRewards(6, 8, 1), { xp: 80, tokens: 8 });
assert.deepEqual(attemptRewards(6, 8, 0, "time-attack"), { xp: 135, tokens: 9 });
assert.equal(completionStreak(["2026-10-01", "2026-10-02", "2026-10-03"], "2026-10-03"), 3);
assert.equal(completionStreak(["2026-10-01", "2026-10-03"], "2026-10-03"), 1);

console.log("Matrix progression tests passed");

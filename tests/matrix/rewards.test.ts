import { strict as assert } from "node:assert";
import { matrixRewardHistory, matrixVaultBadges } from "../../src/lib/matrix/rewards.ts";

const progress = { xp: 40, tokens: 4, tradeStates: { trade: { attempts: [{ accuracy: .5, completedOn: "2026-10-03", correct: 1, total: 2 }, { accuracy: 1, completedOn: "2026-10-02", correct: 2, total: 2 }], } } };
const history = matrixRewardHistory(progress);
assert.equal(history.length, 2);
assert.deepEqual(history[1] && { xp: history[1].xp, tokens: history[1].tokens }, { xp: 40, tokens: 4 });
assert.equal(matrixVaultBadges(progress).find((badge) => badge.id === "first-win")?.earned, true);
assert.equal(matrixVaultBadges(progress).find((badge) => badge.id === "hundred-correct")?.earned, false);
assert.equal(matrixRewardHistory({ xp: 0, tokens: 0, tradeStates: { old: { attempts: [{ accuracy: 1, completedOn: "2026-10-01" }] } } }).length, 0);
console.log("Matrix rewards tests passed");

import { strict as assert } from "node:assert";
import type { JournalEntry } from "../../src/lib/types.ts";
import { buildMatrixTest, buildMatrixTestFromProgress } from "../../src/lib/matrix/questions.ts";

const trade: JournalEntry = {
  id: "matrix-question-fixture", date: "2026-10-01", pnl: 120, rr: 2, instrument: "MNQ", direction: "long", setup: "Liquidity sweep", notes: "Waited for the sweep and displacement before entry.", images: [], entryPrice: 100, stopLoss: 95, exitPrice: 110, takeProfit: 110, quantity: 2, createdAt: 1, updatedAt: 1,
  review: { concepts: { used: ["Liquidity", "FVG"] }, psychology: { emotionBefore: "Focused", notes: "Stayed patient." } },
  reflection: { followedSetup: true, followedRisk: true, wentWell: "Waited for confirmation.", lesson: "Keep the stop fixed.", updatedAt: 1 },
};

const first = buildMatrixTest(trade, [], 1);
const repeat = buildMatrixTest(trade, [], 1);
assert.equal(first.questions.length, 8);
const whatIf = buildMatrixTest(trade, [], 1, "what-if");
assert.equal(whatIf.questions.length, 8);
assert.equal(whatIf.questions.every((question) => question.type === "math"), true);
const pro = buildMatrixTest(trade, [], 1, "pro");
assert.equal(pro.questions.length, 8);
assert.deepEqual(first.questions, repeat.questions);
assert.equal(new Set(first.questions.map((question) => question.signature)).size, 8);
assert.equal(first.questions.find((question) => question.templateId === "realized-r")?.answer, 2);
assert.equal(first.questions.find((question) => question.templateId === "risk-points")?.answer, 5);
assert.equal(buildMatrixTest(trade, [], 2).questions.find((question) => question.templateId === "two-r-target")?.answer, 110);

const retry = buildMatrixTest(trade, first.questions.map((question) => question.signature), 43);
assert.equal(retry.questions.some((question) => first.questions.some((seen) => seen.signature === question.signature)), false);

const otherTrade = { ...trade, id: "matrix-question-fixture-2", date: "2026-10-02", entryPrice: 200, stopLoss: 190, exitPrice: 220, takeProfit: 220 };
const globalRetry = buildMatrixTest(otherTrade, first.questions.map((question) => question.signature), 1);
assert.equal(globalRetry.questions.some((question) => first.questions.some((seen) => seen.signature === question.signature)), false);
const progressRetry = buildMatrixTestFromProgress(otherTrade, { xp: 0, tokens: 0, questionSignatures: first.questions.map((question) => question.signature) }, 1);
assert.equal(progressRetry.questions.some((question) => first.questions.some((seen) => seen.signature === question.signature)), false);

const sparse = buildMatrixTest({ ...trade, notes: "", setup: "", entryPrice: null, stopLoss: null, exitPrice: null, takeProfit: null, direction: null, review: undefined, reflection: undefined }, [], 1);
assert.ok(sparse.unavailableReason);

console.log("Matrix question tests passed");

import { strict as assert } from "node:assert";
import { matrixAccuracy, matrixTodayXp, matrixTopicEvidence } from "../../src/lib/matrix/overview.ts";

const progress = { xp: 0, tokens: 0, tradeStates: { one: { attempts: [{ accuracy: .5, correct: 1, total: 2, completedOn: "2026-10-03", questions: [{ signature: "a", type: "risk-management", prompt: "", answer: 1, expected: 1, correct: true, explanation: "" }, { signature: "b", type: "math", prompt: "", answer: 2, expected: 3, correct: false, explanation: "" }] }] } } };
assert.equal(matrixAccuracy(progress), .5);
assert.equal(matrixTodayXp(progress, "2026-10-03"), 40);
const topics = matrixTopicEvidence([{ id: "t", date: "2026-10-03", pnl: 0, rr: null, instrument: "MNQ", direction: null, setup: "Liquidity sweep", notes: "Respect the stop.", images: [], createdAt: 1, updatedAt: 1 }], progress);
assert.deepEqual(topics.map((topic) => topic.topic), ["Liquidity", "Risk Management"]);
console.log("Matrix overview tests passed");

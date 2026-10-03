import { strict as assert } from "node:assert";
import { answerIsCorrect, completeMatrixAttempt } from "../../src/lib/matrix/attempt.ts";
import type { MatrixQuestion } from "../../src/lib/matrix/questions.ts";

const questions: MatrixQuestion[] = [
  { signature: "one", type: "math", templateId: "r", prompt: "R?", answer: 2, unit: "R", explanation: "Recorded calculation.", },
  { signature: "two", type: "concept", templateId: "setup", prompt: "Setup?", answer: "Liquidity sweep", explanation: "Recorded setup." },
];
assert.equal(answerIsCorrect(questions[0]!, "2.004"), true);
assert.equal(answerIsCorrect(questions[1]!, " liquidity sweep "), true);
assert.equal(answerIsCorrect(questions[1]!, "FVG"), false);
const complete = completeMatrixAttempt({ progress: { xp: 0, tokens: 0 }, tradeId: "trade", questions, answers: { one: "2", two: "wrong" }, durationSeconds: 42, completedOn: "2026-10-03" });
assert.equal(complete.xp, 40);
assert.equal(complete.tokens, 4);
assert.equal(complete.tradeStates?.trade?.attempts?.length, 1);
assert.equal(complete.tradeStates?.trade?.stars, 1);
assert.equal(complete.questionSignatures?.length, 2);
console.log("Matrix attempt tests passed");

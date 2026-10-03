import { strict as assert } from "node:assert";
import { atLeastOneWin, breakevenWinRate, expectancyR, lossStreakProbability, mnqContracts, probabilityNetPositive, requiredRR, bufferLossCount } from "./formulas";
import { seededRng } from "./rng";
import { families } from "./families/core";
import { nextQuestion } from "./generator";
import { builtinTemplate, renderTemplate } from "./phrasebook";

// Kept dependency-free so these checks can also be run by the repository's
// TypeScript compiler; the exported runner is used by test harnesses.
export function runMathDuelTests() {
  assert.equal(Number(((1 - 1 / 3) / (1 / 3)).toFixed(4)), 2);
  assert.equal(expectancyR(.4, 2), .2);
  assert.equal(Number(atLeastOneWin(.35, 4).toFixed(4)), .8215);
  assert.equal(Number(lossStreakProbability(.45, 3).toFixed(4)), .1664);
  assert.equal(mnqContracts(60, 15), 2);
  assert.equal(Number(probabilityNetPositive(10, .45, 1.5).toFixed(3)), .496);
  for (const family of families) for (let seed = 0; seed < 1000; seed++) { const question = family(seededRng(seed + 1), ((seed % 4) + 1) as 1 | 2 | 3 | 4); const p = question.params; const independentlyComputed = question.family === "breakeven" ? (p.rr ? breakevenWinRate(p.rr) * 100 : requiredRR(p.p)) : question.family === "expectancy" ? expectancyR(p.p, p.rr) : question.family === "sizing" ? mnqContracts(p.risk, p.stop) : question.family === "fees" ? expectancyR(p.p, p.rr) - p.fee : question.family === "streak" ? lossStreakProbability(p.win, p.k) * 100 : question.family === "at-least-one" ? atLeastOneWin(p.p, p.n) * 100 : question.family === "buffer" ? bufferLossCount(p.buffer, p.risk) : probabilityNetPositive(p.n, p.p, p.rr) * 100; assert.ok(Math.abs(question.answer - independentlyComputed) <= .01); assert.ok(!/[{}]/.test(renderTemplate(builtinTemplate(question), p))); }
  const signatures = new Set<string>(); for (let seed = 1; seed <= 500; seed++) { const question = nextQuestion(seed, {}, [...signatures]); assert.ok(!signatures.has(question.signature), `duplicate ${question.signature}`); signatures.add(question.signature); }
  assert.equal(breakevenWinRate(2), 1 / 3);
}

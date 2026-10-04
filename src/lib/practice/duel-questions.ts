/** Math Duel questions, converted into the same shape the drill runner uses. */
import type { PracticeQuestion } from "./engine";
import { nextQuestion } from "./math/generator";
import type { FamilyRating } from "./math/difficulty";
import type { MathQuestion } from "./math/families/types";
import { fpKey, type LedgerView } from "./ledger";

const num = (n: number) => String(Number(n.toFixed(2)));
const withUnit = (n: number, unit: string) => (unit === "%" ? `${num(n)}%` : unit === "R" ? `${num(n)}R` : num(n));

function toPractice(q: MathQuestion): PracticeQuestion | null {
  const format = q.format ?? "numeric";
  if (format === "spot-the-error" || format === "reverse") return null;
  const unit = q.unit || (q.answerKind === "percent" ? "%" : "");
  const extra = q.givens.filter((g) => !q.prompt.includes(g));
  const prompt = extra.length ? `${q.prompt} Given: ${extra.join("; ")}.` : q.prompt;
  const level = q.level;
  const id = `duel:${q.signature}`;
  const explanation = `${q.steps.join(" · ")} → ${withUnit(q.answer, unit)}${unit && unit !== "%" && unit !== "R" ? ` ${unit}` : ""}`;
  const base = { id, fp: id, source: "local" as const, tag: `duel-${q.family}`, level, pin: "Math Duel · risk maths", prompt, explanation, xp: 12 * level, group: "duel" as const, chartTradeIds: [] as string[] };
  if (q.choices && q.choices.length >= 3 && (format === "multiple-choice" || format === "which-is-true")) {
    const choices = [...new Set(q.choices.map((c) => withUnit(c, unit)))];
    return { ...base, kind: "choice", choices, answer: withUnit(q.answer, unit) };
  }
  return { ...base, kind: "number", answer: String(q.answer), unit: unit === "%" || unit === "R" ? unit : q.unit, tolerance: q.answerKind === "contracts" ? 0 : q.answerKind === "percent" ? 0.1 : 0.01 };
}

/** `count` unique duel questions that are not retired in the ledger. */
export function duelQuestions(count: number, ratings: FamilyRating, ledger: LedgerView, seed: number): PracticeQuestion[] {
  const out: PracticeQuestion[] = [];
  const signatures: string[] = [];
  let previous: MathQuestion["family"] | undefined;
  for (let attempt = 0; out.length < count && attempt < count * 14; attempt++) {
    const q = nextQuestion(seed + attempt * 7919, ratings, signatures, previous);
    signatures.push(q.signature);
    previous = q.family;
    const converted = toPractice(q);
    if (!converted || ledger.done.has(fpKey(converted.fp))) continue;
    out.push(converted);
  }
  return out;
}

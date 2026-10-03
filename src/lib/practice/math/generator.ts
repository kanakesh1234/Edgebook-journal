import { seededRng } from "./rng";
import { families } from "./families/core";
import type { MathFamily, MathQuestion } from "./families/types";
import type { FamilyRating } from "./difficulty";
export function nextQuestion(seed: number, ratings: FamilyRating, recent: string[] = [], previous?: MathFamily): MathQuestion {
  const familyId = (make: (typeof families)[number]) => make(seededRng(1), 1).family;
  const pool = families.filter((make) => familyId(make) !== previous);
  // Five independent deterministic rerolls are enough to avoid the rolling
  // history in normal play without making the generator stateful.
  for (let attempt = 0; attempt < 5; attempt++) {
    const rng = seededRng(seed + attempt * 104729);
    const make = pool[rng.int(0, pool.length - 1)]!;
    const id = familyId(make);
    const question = make(rng, (ratings[id]?.level ?? 1) as 1 | 2 | 3 | 4);
    if (!recent.includes(question.signature)) return format(question, rng);
  }
  // A collision after all rerolls is exceptionally rare; use a deterministic
  // fresh stream rather than repeating a signature.
  let fallback = 5;
  while (true) { const rng = seededRng(seed + fallback++ * 104729); const make = pool[rng.int(0, pool.length - 1)]!; const id = familyId(make); const question = make(rng, (ratings[id]?.level ?? 1) as 1 | 2 | 3 | 4); if (!recent.includes(question.signature)) return format(question, rng); }
}
function format(question: MathQuestion, rng: ReturnType<typeof seededRng>): MathQuestion { const kind = rng.pick(["numeric", "multiple-choice", "which-is-true", "spot-the-error", "reverse"] as const); if (kind === "numeric") return { ...question, format: kind }; const wrong = question.answerKind === "contracts" ? [Math.max(0, question.answer - 1), question.answer + 1, question.answer + 2] : [question.answer * .8, question.answer * 1.2, question.answer + (question.answerKind === "percent" ? 10 : .25)].map((value) => Number(value.toFixed(4))); const choices = [...new Set([question.answer, ...wrong])].sort(() => rng.next() - .5); if (kind === "spot-the-error") return { ...question, format: kind, prompt: `${question.prompt} A trainee used this step: “${question.steps[0]}” but changed one value. Which final result is wrong?`, choices }; if (kind === "reverse") return { ...question, format: kind, prompt: `Reverse drill: which result is consistent with this setup? ${question.prompt}`, choices }; return { ...question, format: kind, choices }; }

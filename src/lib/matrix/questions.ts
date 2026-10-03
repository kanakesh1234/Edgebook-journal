import type { JournalEntry, MatrixProgress } from "../types.ts";
import { hash } from "../practice/math/signatures.ts";
import { seededRng } from "../practice/math/rng.ts";
import { realizedR, tradeResult } from "./progression.ts";
import type { MatrixGameMode } from "./game-modes.ts";

export type MatrixQuestionType = "chart-reading" | "concept" | "math" | "scenario" | "risk-management" | "psychology";

export interface MatrixQuestion {
  type: MatrixQuestionType;
  templateId: string;
  prompt: string;
  answer: string | number;
  unit?: string;
  explanation: string;
  signature: string;
}

export interface MatrixTest {
  questions: MatrixQuestion[];
  /** Missing requested types are replaced only by another evidence-backed question. */
  substitutions: Array<{ requested: MatrixQuestionType; used: MatrixQuestionType; reason: string }>;
  unavailableReason?: string;
}

export interface MatrixMinatoQuestion {
  signature: string;
  type: MatrixQuestionType;
  prompt: string;
  explanation: string;
}

type Candidate = Omit<MatrixQuestion, "signature"> & { values: Record<string, string | number | null | undefined> };

const questionOrder: MatrixQuestionType[] = ["chart-reading", "concept", "math", "scenario", "risk-management", "psychology", "math", "concept"];
const number = (value: number) => Number(value.toFixed(4));

function candidate(type: MatrixQuestionType, templateId: string, prompt: string, answer: string | number, explanation: string, values: Candidate["values"], unit?: string): Candidate {
  return { type, templateId, prompt, answer, unit, explanation, values };
}

/**
 * Produces a deterministic Matrix attempt from a trade's recorded evidence.
 * It never derives chart facts from pixels or manufactures notes, tags, or pins.
 */
export function buildMatrixTest(entry: JournalEntry, previousSignatures: string[] = [], seed = 1, mode: MatrixGameMode = "classic"): MatrixTest {
  const all = mode === "what-if" || mode === "pro" ? modeCandidatesFor(entry, mode) : candidatesFor(entry);
  const available = all.filter((item) => !previousSignatures.includes(signatureFor(item)));
  const rng = seededRng(seed);
  const questions: MatrixQuestion[] = [];
  const substitutions: MatrixTest["substitutions"] = [];
  const remaining = [...available];

  const order = mode === "what-if" || mode === "pro" ? Array<MatrixQuestionType>(8).fill("math") : questionOrder;
  for (const requested of order) {
    const matching = remaining.filter((item) => item.type === requested);
    const pool = matching.length ? matching : remaining;
    if (!pool.length) break;
    const selected = pool[rng.int(0, pool.length - 1)]!;
    remaining.splice(remaining.indexOf(selected), 1);
    if (selected.type !== requested) substitutions.push({ requested, used: selected.type, reason: `This trade has no unused ${requested.replace("-", " ")} evidence for this attempt.` });
    questions.push({ type: selected.type, templateId: selected.templateId, prompt: selected.prompt, answer: selected.answer, unit: selected.unit, explanation: selected.explanation, signature: signatureFor(selected) });
  }

  return {
    questions,
    substitutions,
    ...(questions.length < 8 ? { unavailableReason: "This trade does not have enough distinct recorded evidence for an eight-question attempt yet." } : {}),
  };
}

/** Global history is preferred, while per-trade history keeps older journals safe. */
export function buildMatrixTestFromProgress(entry: JournalEntry, progress: MatrixProgress | undefined, seed = 1, mode: MatrixGameMode = "classic"): MatrixTest {
  const history = new Set(progress?.questionSignatures ?? []);
  for (const state of Object.values(progress?.tradeStates ?? {})) for (const signature of state.questionSignatures ?? []) history.add(signature);
  return buildMatrixTest(entry, [...history], seed, mode);
}

/** Hypothetical and Pro prompts are calculations, never claims about an unsaved market path. */
function modeCandidatesFor(entry: JournalEntry, mode: "what-if" | "pro"): Candidate[] {
  if (entry.entryPrice == null || entry.stopLoss == null || !entry.direction) return [];
  const risk = Math.abs(entry.entryPrice - entry.stopLoss);
  if (!risk) return [];
  const sign = entry.direction === "long" ? 1 : -1;
  const items: Candidate[] = [];
  const multipliers = mode === "what-if" ? [0.5, 1, 1.5, 2, 2.5, 3, 4, 5] : [1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4];
  for (const multiple of multipliers) {
    const target = number(entry.entryPrice + sign * risk * multiple);
    const prompt = mode === "what-if"
      ? `If this recorded ${entry.direction} entry used the same stop and targeted ${multiple}R, what target price would that produce?`
      : `Pro: starting with the recorded entry and stop, calculate the risk, then project a ${multiple}R target in the recorded ${entry.direction} direction. What price results?`;
    items.push(candidate("math", `${mode}-target-${multiple}`, prompt, target, `The recorded risk is ${number(risk)} points. Applying ${multiple}R from the recorded entry in the ${entry.direction} direction gives this hypothetical target.`, { entry: entry.entryPrice, stop: entry.stopLoss, direction: entry.direction, multiple }, "price"));
  }
  return items;
}

/**
 * MINATO may rephrase a deterministic question or explain a submitted answer,
 * but it never supplies the answer or changes the question signature. The
 * caller keeps the locally-derived answer as the source of truth.
 */
export async function askMinatoAboutMatrixQuestion(
  action: "frame" | "explain",
  questions: MatrixQuestion[],
  submittedAnswers?: Record<string, string | number | null>,
): Promise<MatrixMinatoQuestion[] | null> {
  try {
    const response = await fetch("/api/minato/matrix", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, questions, submittedAnswers }),
    });
    if (!response.ok) return null;
    const result = await response.json() as { items?: MatrixMinatoQuestion[] };
    if (!Array.isArray(result.items)) return null;
    const known = new Set(questions.map((question) => question.signature));
    return result.items.filter((item) => known.has(item.signature) && typeof item.prompt === "string" && typeof item.explanation === "string");
  } catch {
    return null;
  }
}

function signatureFor(item: Candidate) {
  return hash(`${item.type}|${item.templateId}|${Object.entries(item.values).sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}:${String(value)}`).join("|")}`);
}

function candidatesFor(entry: JournalEntry): Candidate[] {
  const items: Candidate[] = [];
  const rResult = realizedR(entry);
  const r = rResult.r;
  const risk = entry.entryPrice != null && entry.stopLoss != null ? Math.abs(entry.entryPrice - entry.stopLoss) : null;
  const result = tradeResult(r);
  // Without a persisted image role here, a screenshot can only safely yield a notes-based chart-reading prompt.
  if (entry.notes.trim()) {
    const note = entry.notes.trim();
    items.push(
      candidate("chart-reading", "notes-observation", "What observation did you record for this trade before reviewing the outcome?", note, "This answer is taken directly from the trade notes because no chart pin data is recorded.", { note }),
      candidate("chart-reading", "notes-recall", "Use the recorded trade notes: what did you want to remember from this chart?", note, "The trade notes are the available chart-reading evidence for this trade.", { note }),
    );
  }
  if (entry.setup.trim()) {
    const setup = entry.setup.trim();
    items.push(
      candidate("concept", "setup-name", "Which setup was recorded for this trade?", setup, "The setup comes directly from this trade record.", { setup }),
      candidate("concept", "setup-recall", "Name the recorded setup before reviewing the result.", setup, "This is the setup saved with the trade.", { setup }),
    );
  }
  for (const concept of entry.review?.concepts?.used ?? []) {
    const value = concept.trim();
    if (value) items.push(candidate("concept", `review-concept-${items.length}`, "Which concept did you record as used in this trade?", value, "This concept was saved in the trade review.", { concept: value }));
  }

  if (r != null) {
    items.push(
      candidate("math", "realized-r", "Using the recorded entry, stop, exit, and direction, what was the realized R multiple?", number(r), "Realized R is the direction-adjusted exit move divided by the recorded entry-to-stop risk.", { entry: entry.entryPrice, stop: entry.stopLoss, exit: entry.exitPrice, direction: entry.direction }, "R"),
      candidate("scenario", "result-from-r", "Given the recorded realized result of ${number(r)}R, was this trade a win, loss, or breakeven?", result, "The result is derived from the recorded R multiple, using the Matrix breakeven tolerance.", { r: number(r) }),
      candidate("scenario", "r-recall", "What realized R multiple was recorded by this trade's entry, stop, exit, and direction?", number(r), "This uses only the recorded price fields and direction.", { entry: entry.entryPrice, stop: entry.stopLoss, exit: entry.exitPrice, direction: entry.direction }, "R"),
    );
  }
  if (risk != null && entry.entryPrice != null && entry.direction) {
    const targetAtTwoR = entry.direction === "long" ? entry.entryPrice + risk * 2 : entry.entryPrice - risk * 2;
    items.push(
      candidate("math", "risk-points", "How many price points of risk were recorded between entry and stop?", number(risk), "Risk in points is the absolute difference between the recorded entry and stop.", { entry: entry.entryPrice, stop: entry.stopLoss }, "points"),
      candidate("math", "two-r-target", "At 2R from the recorded entry and stop, what target price follows the recorded ${entry.direction} direction?", number(targetAtTwoR), "A 2R target is two times the recorded risk added for a long or subtracted for a short.", { entry: entry.entryPrice, stop: entry.stopLoss, direction: entry.direction }, "price"),
    );
  }
  if (entry.stopLoss != null) {
    items.push(
      candidate("risk-management", "recorded-stop", "What stop price was recorded for this trade?", entry.stopLoss, "This is the stop saved on the trade; Matrix does not infer a stop from the chart.", { stop: entry.stopLoss }, "price"),
      candidate("risk-management", "stop-recall", "Before taking this trade, which recorded price defined the invalidation stop?", entry.stopLoss, "The recorded stop is the only saved invalidation level.", { stop: entry.stopLoss }, "price"),
    );
  }
  if (entry.takeProfit != null) items.push(candidate("risk-management", "recorded-target", "What target price was recorded for this trade?", entry.takeProfit, "This is the target saved on the trade.", { target: entry.takeProfit }, "price"));

  const psychology = entry.review?.psychology;
  const psychologyFacts: Array<[string, string]> = [["emotion before the trade", psychology?.emotionBefore ?? ""], ["psychology note", psychology?.notes ?? ""], ["conviction or urgency", psychology?.convictionOrUrgency ?? ""]];
  for (const [label, value] of psychologyFacts) if (value.trim()) items.push(candidate("psychology", `psychology-${label.replaceAll(" ", "-")}`, `What ${label} did you record for this trade?`, value.trim(), "This answer comes from the psychology section of the trade review.", { label, value: value.trim() }));
  const reflection = entry.reflection;
  for (const [label, value] of [["what went well", reflection?.wentWell], ["what went poorly", reflection?.wentPoorly], ["lesson", reflection?.lesson]] as const) if (value?.trim()) items.push(candidate("psychology", `reflection-${label.replaceAll(" ", "-")}`, `According to your reflection, what did you record for ${label}?`, value.trim(), "This is the trader's recorded reflection, not an inferred explanation.", { label, value: value.trim() }));

  return items;
}

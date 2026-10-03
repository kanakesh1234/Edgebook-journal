import type { JournalEntry, MatrixProgress } from "../types.ts";
import { attemptRewards } from "./progression.ts";

export const MATRIX_TOPICS = ["Liquidity", "FVG", "Market Structure", "Risk Management", "Position Sizing", "ICT Concepts"] as const;
export type MatrixTopic = (typeof MATRIX_TOPICS)[number];

const patterns: Record<MatrixTopic, RegExp> = {
  Liquidity: /liquidity|sweep/i,
  FVG: /\bfvg\b|fair value gap/i,
  "Market Structure": /market structure|\bmss\b|\bbos\b|structure/i,
  "Risk Management": /risk|stop|target|invalidation/i,
  "Position Sizing": /position siz|\bsizing\b|quantity|contracts?/i,
  "ICT Concepts": /\bict\b|\bsmt\b|displacement/i,
};

function tradeEvidence(entry: JournalEntry) {
  return [entry.setup, entry.notes, ...(entry.review?.concepts?.used ?? []), entry.review?.concepts?.learned ?? "", entry.review?.concepts?.improve ?? ""].join(" ");
}

/** Topics only appear when the journal contains related evidence. */
export function matrixTopicEvidence(entries: JournalEntry[], progress: MatrixProgress | undefined) {
  const attempts = Object.values(progress?.tradeStates ?? {}).flatMap((state) => state.attempts ?? []);
  return MATRIX_TOPICS.map((topic) => {
    const evidenceTrades = entries.filter((entry) => patterns[topic].test(tradeEvidence(entry))).length;
    const relatedQuestionTypes: Record<MatrixTopic, string[]> = { Liquidity: ["chart-reading", "concept"], FVG: ["chart-reading", "concept"], "Market Structure": ["chart-reading", "concept", "scenario"], "Risk Management": ["risk-management", "math"], "Position Sizing": ["math"], "ICT Concepts": ["concept", "scenario"] };
    const answers = attempts.flatMap((attempt) => attempt.questions ?? []).filter((question) => relatedQuestionTypes[topic].includes(question.type));
    return { topic, evidenceTrades, correct: answers.filter((question) => question.correct).length, total: answers.length, accuracy: answers.length ? answers.filter((question) => question.correct).length / answers.length : null };
  }).filter((row) => row.evidenceTrades > 0);
}

export function matrixTodayXp(progress: MatrixProgress | undefined, today: string) {
  return Object.values(progress?.tradeStates ?? {}).reduce((sum, state) => sum + (state.attempts ?? []).reduce((tradeTotal, attempt, index) => {
    if (attempt.completedOn !== today) return tradeTotal;
    // Legacy attempts only retained accuracy; their reward cannot be
    // reconstructed without inventing a question count.
    if (attempt.correct == null || attempt.total == null) return tradeTotal;
    return tradeTotal + attemptRewards(attempt.correct, attempt.total, index).xp;
  }, 0), 0);
}

export function matrixAccuracy(progress: MatrixProgress | undefined) {
  const attempts = Object.values(progress?.tradeStates ?? {}).flatMap((state) => state.attempts ?? []);
  const correct = attempts.reduce((sum, attempt) => sum + (attempt.correct ?? Math.round(attempt.accuracy * (attempt.total ?? 0))), 0);
  const total = attempts.reduce((sum, attempt) => sum + (attempt.total ?? 0), 0);
  return total ? correct / total : null;
}

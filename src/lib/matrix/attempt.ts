import type { MatrixAttemptQuestionResult, MatrixAttemptRecord, MatrixProgress } from "../types.ts";
import { attemptRewards, completionStreak, nextDueDate, nextStars } from "./progression.ts";
import type { MatrixQuestion } from "./questions.ts";
import type { MatrixGameMode } from "./game-modes.ts";

export type MatrixSubmittedAnswer = string | number | null;

function localDayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function answerIsCorrect(question: MatrixQuestion, submitted: MatrixSubmittedAnswer): boolean {
  if (submitted == null || submitted === "") return false;
  if (typeof question.answer === "number") {
    const value = typeof submitted === "number" ? submitted : Number(submitted);
    return Number.isFinite(value) && Math.abs(value - question.answer) <= 0.005;
  }
  return String(submitted).trim().toLocaleLowerCase() === question.answer.trim().toLocaleLowerCase();
}

export function completeMatrixAttempt(args: {
  progress: MatrixProgress;
  tradeId: string;
  questions: MatrixQuestion[];
  answers: Record<string, MatrixSubmittedAnswer>;
  explanations?: Record<string, string>;
  durationSeconds: number;
  completedOn?: string;
  mode?: MatrixGameMode;
}): MatrixProgress {
  const completedOn = args.completedOn ?? localDayKey();
  const previousState = args.progress.tradeStates?.[args.tradeId] ?? {};
  const results: MatrixAttemptQuestionResult[] = args.questions.map((question) => {
    const answer = args.answers[question.signature] ?? null;
    return { signature: question.signature, type: question.type, prompt: question.prompt, answer, expected: question.answer, correct: answerIsCorrect(question, answer), explanation: args.explanations?.[question.signature] ?? question.explanation };
  });
  const correct = results.filter((result) => result.correct).length;
  const accuracy = args.questions.length ? correct / args.questions.length : 0;
  const oldAttempts = previousState.attempts ?? [];
  const mode = args.mode ?? "classic";
  const record: MatrixAttemptRecord = { accuracy, completedOn, correct, total: args.questions.length, durationSeconds: Math.max(0, Math.round(args.durationSeconds)), questions: results, mode };
  const rewards = attemptRewards(correct, args.questions.length, oldAttempts.length, mode);
  const combinedAttempts = [...oldAttempts, record];
  const completionDays = Object.values(args.progress.tradeStates ?? {}).flatMap((state) => state.attempts?.map((attempt) => attempt.completedOn) ?? []).concat(completedOn);
  const topicMastery = { ...(args.progress.topicMastery ?? {}) };
  for (const result of results) {
    const current = topicMastery[result.type] ?? { correct: 0, total: 0 };
    topicMastery[result.type] = { correct: current.correct + (result.correct ? 1 : 0), total: current.total + 1 };
  }
  const takeaways = [...(args.progress.takeaways ?? []), ...results.map((result) => ({ signature: result.signature, text: result.explanation, createdAt: Date.now() }))].slice(-300);
  const signatures = [...new Set([...(args.progress.questionSignatures ?? []), ...results.map((result) => result.signature)])].slice(-2000);
  return {
    ...args.progress,
    xp: args.progress.xp + rewards.xp,
    tokens: args.progress.tokens + rewards.tokens,
    questionSignatures: signatures,
    topicMastery,
    takeaways,
    tradeStates: {
      ...(args.progress.tradeStates ?? {}),
      [args.tradeId]: {
        ...previousState,
        attempts: combinedAttempts,
        questionSignatures: [...new Set([...(previousState.questionSignatures ?? []), ...results.map((result) => result.signature)])].slice(-300),
        stars: nextStars(previousState.stars ?? 0, combinedAttempts),
        dueOn: nextDueDate(completedOn, accuracy, oldAttempts.length),
      },
    },
  };
}

export function matrixStreak(progress: MatrixProgress, today = localDayKey()): number {
  return completionStreak(Object.values(progress.tradeStates ?? {}).flatMap((state) => state.attempts?.map((attempt) => attempt.completedOn) ?? []), today);
}

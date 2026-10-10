/**
 * No-repeat ledger.
 *
 *  - A question answered CORRECTLY is retired for good: it is never asked again — EXCEPT questions about
 *    mistake trades. Those are revised on a schedule (see focus.ts): a right answer moves them up a box and
 *    they come back later, and only the last box retires them.
 *  - A question answered WRONG goes on the `missed` list and may come back in a later round, until it is
 *    answered correctly (then it is retired, or — for a mistake trade — scheduled).
 *  - Nothing repeats inside a single round (the runner also enforces this).
 *
 * Hashes keep the stored list small. Older progress that only has `seenQuestions` is migrated on read,
 * so past correct answers retire too.
 */
import type { PracticeProgress } from "@/lib/types";
import { hashText } from "./hash.ts";

const MAX_DONE = 6000;
const MAX_MISSED = 600;

export const fpKey = (fp: string): string => hashText(fp);

export interface LedgerView {
  done: Set<string>;
  missed: Set<string>;
  /** Scheduled revision of mistake-trade questions: key → { box, due }. */
  revision: Map<string, { box: number; due: string }>;
}

export function readLedger(progress: PracticeProgress): LedgerView {
  const revision = new Map(Object.entries(progress.revision ?? {}).map(([key, value]) => [key, { box: value.box, due: value.due }] as const));
  if (progress.ledger) return { done: new Set(progress.ledger.done), missed: new Set(progress.ledger.missed), revision };
  // Migration: derive from the old history (variant 1 = last answer wrong).
  const done = new Set<string>();
  const missed = new Set<string>();
  for (const item of progress.seenQuestions ?? []) (item.variant === 1 ? missed : done).add(fpKey(item.factId));
  return { done, missed, revision };
}

/**
 * `retire` says whether a RIGHT answer closes the question for good. Callers pass false for mistake-trade
 * questions that are still on the revision schedule; it defaults to true (the original behaviour).
 */
export function updateLedger(progress: PracticeProgress, answers: Array<{ fp: string; correct: boolean; retire?: boolean }>): NonNullable<PracticeProgress["ledger"]> {
  const base = readLedger(progress);
  const done = [...base.done];
  const missed = [...base.missed];
  const doneSet = new Set(done);
  const missedSet = new Set(missed);
  for (const answer of answers) {
    const key = fpKey(answer.fp);
    if (answer.correct) {
      if (answer.retire !== false && !doneSet.has(key)) { doneSet.add(key); done.push(key); }
      missedSet.delete(key);
    } else if (!doneSet.has(key) && !missedSet.has(key)) {
      missedSet.add(key);
      missed.push(key);
    }
  }
  return {
    done: done.slice(-MAX_DONE),
    missed: [...missedSet].filter((key) => !doneSet.has(key)).slice(-MAX_MISSED),
  };
}

/** Opt-in: let correctly answered questions come back (missed ones stay on the list). */
export function resetDone(progress: PracticeProgress): NonNullable<PracticeProgress["ledger"]> {
  const base = readLedger(progress);
  return { done: [], missed: [...base.missed] };
}

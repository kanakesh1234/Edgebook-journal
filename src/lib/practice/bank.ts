/**
 * Question banks.
 *
 *  1. MISSED bank (saved with the rest of practiceProgress, so it syncs):
 *     the full text of every question answered wrong. A missed AI question can't be
 *     regenerated from a fingerprint, so we keep the question itself and re-ask it
 *     in a later round. Answering it right removes it.
 *
 *  2. AI bank (this device only, localStorage): validated AI questions that were
 *     fetched but not played yet, so the next round starts instantly instead of
 *     waiting on the model. Entries expire after three days because the trades
 *     they were written from may have been edited.
 */
import type { PracticeProgress } from "@/lib/types";
import type { PracticeQuestion } from "./engine";
import type { ArenaMode } from "./arena";

const MISSED_KEY = "missed";
const MAX_MISSED = 40;
const BANK_PREFIX = "edgebook.practice.ai-bank.v1.";
const MAX_BANK = 60;
const BANK_TTL_MS = 3 * 24 * 60 * 60 * 1000;

type BankEntry = NonNullable<PracticeProgress["questionBank"]>[number];

function isQuestion(value: unknown): value is PracticeQuestion {
  if (!value || typeof value !== "object") return false;
  const q = value as Record<string, unknown>;
  return typeof q.id === "string" && typeof q.fp === "string" && typeof q.prompt === "string" && typeof q.answer === "string"
    && typeof q.tag === "string" && typeof q.level === "number" && (q.kind === "choice" || q.kind === "number")
    && typeof q.explanation === "string" && (q.kind !== "choice" || Array.isArray(q.choices));
}

export function readMissed(progress: PracticeProgress | undefined): PracticeQuestion[] {
  const entry = progress?.questionBank?.find((item) => item.key === MISSED_KEY);
  return Array.isArray(entry?.cards) ? entry.cards.filter(isQuestion) : [];
}

/** The `questionBank` after a round: wrong answers are kept, right answers are removed. */
export function nextQuestionBank(progress: PracticeProgress | undefined, answered: Array<{ question: PracticeQuestion; correct: boolean }>): BankEntry[] {
  const missed = new Map(readMissed(progress).map((q) => [q.fp, q]));
  for (const { question, correct } of answered) {
    if (correct) missed.delete(question.fp);
    else missed.set(question.fp, { ...question, retry: undefined });
  }
  const others = (progress?.questionBank ?? []).filter((item) => item.key !== MISSED_KEY);
  const cards = [...missed.values()].slice(-MAX_MISSED);
  return cards.length ? [...others, { key: MISSED_KEY, cards, createdAt: Date.now() }] : others;
}

/* ------------------------------ AI bank (localStorage) ------------------------------ */

interface Stored { createdAt: number; questions: PracticeQuestion[] }

export function readAiBank(mode: ArenaMode): PracticeQuestion[] {
  try {
    const raw = window.localStorage.getItem(BANK_PREFIX + mode);
    const parsed = raw ? (JSON.parse(raw) as Stored) : null;
    if (!parsed || !Array.isArray(parsed.questions) || Date.now() - parsed.createdAt > BANK_TTL_MS) return [];
    return parsed.questions.filter(isQuestion);
  } catch {
    return [];
  }
}

export function writeAiBank(mode: ArenaMode, questions: PracticeQuestion[]): void {
  try {
    const seen = new Set<string>();
    const unique = questions.filter((q) => (seen.has(q.fp) ? false : (seen.add(q.fp), true))).slice(-MAX_BANK);
    if (!unique.length) { window.localStorage.removeItem(BANK_PREFIX + mode); return; }
    const stored: Stored = { createdAt: Date.now(), questions: unique };
    window.localStorage.setItem(BANK_PREFIX + mode, JSON.stringify(stored));
  } catch { /* storage is optional */ }
}

/** Put unplayed AI questions back so the next round can start with them. */
export function stashUnused(mode: ArenaMode, questions: PracticeQuestion[]): void {
  const fresh = questions.filter((q) => q.source === "ai");
  if (!fresh.length) return;
  writeAiBank(mode, [...readAiBank(mode), ...fresh]);
}

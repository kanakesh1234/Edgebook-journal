/**
 * No-repeat history.
 *
 * Every question answered is remembered by fingerprint (stored in the existing
 * `practiceProgress.seenQuestions` field, so no type changes are needed):
 *   factId  = question fingerprint
 *   format  = mastery tag
 *   variant = 1 if the LAST answer was wrong, 0 if right
 *   date    = YYYY-MM-DD last seen
 *
 * Ordering rules when a new session starts:
 *   1. never-seen questions first
 *   2. questions answered wrong on an earlier day ("due" for a retry)
 *   3. everything else, oldest-seen first — only used when the fresh pool runs out
 * Questions seen in the last REPEAT_DAYS and answered right are held back.
 */
import type { PracticeProgress } from "@/lib/types";
import { addDays } from "@/lib/format";
import type { PracticeQuestion } from "./engine";

const REPEAT_DAYS = 14;
const MAX_SEEN = 800;
const PROMPT_KEY = "edgebook.practice.recent-prompts";

type Seen = NonNullable<PracticeProgress["seenQuestions"]>[number];

export function hashText(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export interface AnswerRecord {
  fp: string;
  tag: string;
  correct: boolean;
}

/** Merge a finished session into the stored history. Newest answer per fingerprint wins. */
export function recordAnswers(progress: PracticeProgress, answers: AnswerRecord[], today: string): Seen[] {
  const byFp = new Map<string, Seen>((progress.seenQuestions ?? []).map((item) => [item.factId, item]));
  for (const answer of answers) byFp.set(answer.fp, { factId: answer.fp, format: answer.tag, variant: answer.correct ? 0 : 1, date: today });
  return [...byFp.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_SEEN);
}

/** Order a candidate pool so fresh and due questions are used first and recent repeats last. */
export function orderByFreshness<T extends Pick<PracticeQuestion, "fp">>(questions: T[], progress: PracticeProgress, today: string): T[] {
  const seen = new Map((progress.seenQuestions ?? []).map((item) => [item.factId, item]));
  const holdFrom = addDays(today, -REPEAT_DAYS);
  const fresh: T[] = [];
  const due: T[] = [];
  const later: Array<{ q: T; date: string }> = [];
  for (const q of questions) {
    const record = seen.get(q.fp);
    if (!record) fresh.push(q);
    else if (record.variant === 1 && record.date < today) due.push(q);
    else later.push({ q, date: record.date });
  }
  const expired = later.filter((item) => item.date < holdFrom).sort((a, b) => a.date.localeCompare(b.date)).map((item) => item.q);
  const held = later.filter((item) => item.date >= holdFrom).sort((a, b) => a.date.localeCompare(b.date)).map((item) => item.q);
  return [...fresh, ...due, ...expired, ...held];
}

/** How many questions in the pool are genuinely new to this trader. */
export function countFresh(questions: Array<Pick<PracticeQuestion, "fp">>, progress: PracticeProgress): number {
  const seen = new Set((progress.seenQuestions ?? []).map((item) => item.factId));
  return questions.filter((q) => !seen.has(q.fp)).length;
}

/* ---- recent prompt text, used to tell the AI what NOT to ask again ---- */

export function recentPrompts(): string[] {
  try {
    const raw = window.localStorage.getItem(PROMPT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string").slice(-60) : [];
  } catch {
    return [];
  }
}

export function rememberPrompts(prompts: string[]): void {
  try {
    const merged = [...recentPrompts(), ...prompts.map((p) => p.slice(0, 200))];
    window.localStorage.setItem(PROMPT_KEY, JSON.stringify(merged.slice(-60)));
  } catch { /* storage is optional */ }
}

/**
 * Small shared helpers for building practice questions.
 * Kept free of runtime imports from engine.ts so there is no import cycle.
 */
import type { JournalEntry } from "@/lib/types";
import type { Level, PracticeQuestion } from "./engine";
import type { Rng } from "./math/rng";

export const isNum = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
export const cap = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
export const round = (value: number, decimals = 2) => Number(value.toFixed(decimals));

export function fmtMoney(value: number): string {
  const sign = value < 0 ? "−" : value > 0 ? "+" : "";
  return `${sign}$${Math.abs(value).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}

export function shuffle<T>(items: readonly T[], rng: Rng): T[] {
  const result = [...items];
  for (let i = result.length - 1; i > 0; i--) {
    const j = rng.int(0, i);
    [result[i], result[j]] = [result[j]!, result[i]!];
  }
  return result;
}

export const sideOf = (entry: JournalEntry): string | null => (entry.direction ? String(entry.direction) : null);
export const hasShots = (entry: JournalEntry) => (entry.images?.length ?? 0) > 0;
export const shotCount = (entry: JournalEntry) => (entry.images?.length ?? 0) + (entry.compareImage ? 1 : 0);

export function clockMinutes(value: string | undefined): number | null {
  const match = /^(\d{1,2}):(\d{2})/.exec(value ?? "");
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
}

export function hourOf(entry: JournalEntry): number | null {
  const m = clockMinutes(entry.entryTime);
  return m == null ? null : Math.floor(m / 60);
}

export const windowLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String(hour).padStart(2, "0")}:59 NY`;

export interface QExtras {
  group?: PracticeQuestion["group"];
  chartTradeIds?: string[];
  compareHint?: boolean;
}

export function choiceQ(
  id: string, tradeId: string | undefined, tag: string, level: Level, pin: string, prompt: string,
  answer: string, wrong: string[], explanation: string, rng: Rng, extras: QExtras = {},
): PracticeQuestion | null {
  const distractors = [...new Set(wrong.filter((item) => item && item !== answer))].slice(0, 3);
  if (!distractors.length) return null;
  return {
    id, fp: id, source: "local", tradeId, kind: "choice", tag, level, pin, prompt,
    choices: shuffle([answer, ...distractors], rng), answer, explanation, xp: 10 * level, ...extras,
  };
}

export function numberQ(
  id: string, tradeId: string | undefined, tag: string, level: Level, pin: string, prompt: string,
  answer: number, tolerance: number, unit: string, explanation: string, extras: QExtras = {},
): PracticeQuestion {
  return {
    id, fp: id, source: "local", tradeId, kind: "number", tag, level, pin, prompt,
    answer: String(round(answer, 4)), tolerance, unit, explanation, xp: 12 * level, ...extras,
  };
}

/** Wrong dollar amounts. Distractors get closer as the level rises. */
export function nearMoney(value: number, level: Level, rng: Rng): string[] {
  const factors = level <= 1 ? [-1, 2, 0.5, 3] : level === 2 ? [0.7, 1.3, -1, 1.6] : [0.85, 1.15, 0.9, 1.1];
  return shuffle(factors, rng).map((f) => fmtMoney(round(value * f, 2)));
}

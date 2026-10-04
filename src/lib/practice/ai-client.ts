import type { JournalEntry } from "@/lib/types";
import type { Level, PracticeQuestion } from "./engine";
import { tradeLabel } from "./engine";
import type { EvidenceTrade } from "./ai-validate";

/** Trade notes plus the trader's own review answers, capped (the server keeps 700 chars). */
function richNotes(entry: JournalEntry): string | undefined {
  const r = entry.review;
  const parts = [
    entry.notes,
    r?.execution?.whyEntered && `Why entered: ${r.execution.whyEntered}`,
    r?.followUp?.strongestEvidence && `Strongest evidence: ${r.followUp.strongestEvidence}`,
    r?.followUp?.conceptMisunderstood && `Misunderstood: ${r.followUp.conceptMisunderstood}`,
    r?.plannedVsActual?.deviations && `Deviations: ${r.plannedVsActual.deviations}`,
    entry.reflection?.cause && `Cause: ${entry.reflection.cause}`,
    r?.psychology?.emotionBefore && `Emotion before: ${r.psychology.emotionBefore}`,
  ].filter((p): p is string => typeof p === "string" && p.trim().length > 0);
  return parts.length ? parts.join(" . ").slice(0, 700) : undefined;
}

export function toEvidence(entry: JournalEntry): EvidenceTrade {
  const mistake = entry.review?.followUp?.biggestMistake;
  const followed = typeof entry.review?.outcome?.followedPlan === "boolean" ? entry.review.outcome.followedPlan : entry.reflection?.followedSetup;
  return {
    id: entry.id, label: tradeLabel(entry), date: entry.date, pnl: entry.pnl,
    instrument: entry.instrument, direction: entry.direction ?? null, setup: entry.setup, rr: entry.rr,
    entryTime: entry.entryTime, exitTime: entry.exitTime, entryPrice: entry.entryPrice, exitPrice: entry.exitPrice,
    stopLoss: entry.stopLoss, takeProfit: entry.takeProfit, quantity: entry.quantity,
    notes: richNotes(entry), lesson: entry.reflection?.lesson, mistake,
    followedPlan: typeof followed === "boolean" ? followed : null,
  };
}

export interface AiResult { questions: PracticeQuestion[]; note: string | null }

/** Asks the server for AI-written, evidence-checked questions. Never throws: on any problem returns no questions. */
export async function fetchAiQuestions(args: { mode: string; level: Level; count: number; trades: JournalEntry[]; avoid: string[]; weakTags: string[] }, timeoutMs = 45_000): Promise<AiResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch("/api/practice/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({ mode: args.mode, level: args.level, count: args.count, avoid: args.avoid, weakTags: args.weakTags, trades: args.trades.slice(0, 12).map(toEvidence) }),
    });
    const data = (await res.json().catch(() => null)) as { questions?: PracticeQuestion[]; reason?: string } | null;
    const questions = Array.isArray(data?.questions) ? data.questions : [];
    return { questions, note: questions.length ? null : data?.reason ?? "AI unavailable — using local questions." };
  } catch {
    return { questions: [], note: "AI unavailable — using local questions." };
  } finally {
    clearTimeout(timer);
  }
}

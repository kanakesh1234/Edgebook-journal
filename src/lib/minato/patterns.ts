import type { JournalEntry } from "../types";

/* ------------------------------------------------------------------ */
/*  Evidence-based recurring-pattern engine                            */
/*                                                                      */
/*  Patterns are derived ONLY from recorded reflections/plans.          */
/*  Every pattern keeps its evidence (trade ids, dates, excerpts).      */
/*  Confidence progression (never overclaim):                           */
/*    1 occurrence  → not reported proactively                          */
/*    2 occurrences → POSSIBLE PATTERN                                  */
/*    3+            → REPEATED PATTERN                                  */
/*    5+            → ESTABLISHED PATTERN                               */
/*  If the pattern stops appearing → IMPROVING.                         */
/*                                                                      */
/*  Matching is keyword-group based today (deterministic); the          */
/*  AiCoachProvider seam allows a semantic LLM upgrade later without    */
/*  changing the evidence structure.                                    */
/* ------------------------------------------------------------------ */

export interface PatternEvidence {
  entryId: string;
  date: string;
  excerpt: string;
  pnl: number;
}

export interface RecurringPattern {
  id: string;
  label: string;
  count: number;
  confidence: "possible" | "repeated" | "established";
  improving: boolean;
  evidence: PatternEvidence[];
  /** Total reviewed trades considered — context for the confidence level. */
  considered: number;
}

const PATTERN_DEFS: { id: string; label: string; keys: string[] }[] = [
  { id: "entry-urgency", label: "Entry urgency / fear of missing the move", keys: ["early", "fomo", "miss the move", "didn't want to miss", "did not want to miss", "before the move", "leave without me", "chased", "urgency", "didn't want to wait", "did not want to wait"] },
  { id: "moved-stop", label: "Stop movement", keys: ["moved stop", "moving stop", "widened stop", "shifted stop", "stop loss move"] },
  { id: "revenge", label: "Revenge trading", keys: ["revenge", "make it back", "make money back", "win it back", "immediately after loss"] },
  { id: "oversized", label: "Oversized risk", keys: ["oversize", "too big", "size increase", "large position", "bigger size"] },
  { id: "no-confirmation", label: "Skipped confirmation", keys: ["no confirmation", "without confirmation", "before confirmation", "skipped smt", "no smt", "smt missing"] },
  { id: "impulse", label: "Impulse / no setup", keys: ["no setup", "impulse", "outside setup", "off plan", "unnamed"] },
  { id: "early-exit", label: "Premature exit", keys: ["exited early", "closed early", "too soon", "breakeven", "panic exit"] },
];

function excerpt(text: string, len = 120): string {
  return text.length > len ? `${text.slice(0, len).trim()}…` : text;
}

/**
 * Detect recurring patterns from actual recorded reflections and reviews.
 * Original text is never modified; excerpts reference the source entry.
 */
export function detectPatterns(
  entries: JournalEntry[],
  opts?: { minCount?: number; recentFirst?: boolean },
): RecurringPattern[] {
  const minCount = opts?.minCount ?? 2;
  const considered = entries.length;

  const sorted = [...entries].sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  const out: RecurringPattern[] = [];

  for (const def of PATTERN_DEFS) {
    const evidence: PatternEvidence[] = [];
    for (const e of sorted) {
      const texts: string[] = [];
      const r = e.reflection;
      if (r?.wentPoorly) texts.push(r.wentPoorly);
      if (r?.cause) texts.push(r.cause);
      if (e.review?.execution?.movedStopReason) texts.push(e.review.execution.movedStopReason);
      if (e.review?.execution?.exitedEarlyReason) texts.push(e.review.execution.exitedEarlyReason);
      if (e.review?.psychology?.notes) texts.push(e.review.psychology.notes);
      const lower = texts.map((t) => t.toLowerCase());
      if (lower.some((t) => def.keys.some((k) => t.includes(k)))) {
        evidence.push({
          entryId: e.id,
          date: e.date,
          excerpt: excerpt(texts.find((t) => def.keys.some((k) => t.toLowerCase().includes(k))) ?? ""),
          pnl: e.pnl,
        });
      }
    }

    if (evidence.length >= minCount) {
      // Improving: no occurrence in the newest 5 reviewed trades while older ones exist
      const newest5 = sorted.slice(0, 5).map((e) => e.id);
      const improving = evidence.length >= 3 && !evidence.some((ev) => newest5.includes(ev.entryId));
      out.push({
        id: def.id,
        label: def.label,
        count: evidence.length,
        confidence: evidence.length >= 5 ? "established" : evidence.length >= 3 ? "repeated" : "possible",
        improving,
        evidence,
        considered,
      });
    }
  }

  return out.sort((a, b) => b.count - a.count);
}

/** Does a free-text plan resemble an established/possible recorded pattern? */
export function matchPlanToPatterns(
  planText: string,
  patterns: RecurringPattern[],
): { pattern: RecurringPattern; matchedKeys: string[] } | null {
  const lower = planText.toLowerCase();
  for (const p of patterns) {
    const def = PATTERN_DEFS.find((d) => d.id === p.id);
    if (!def) continue;
    const matchedKeys = def.keys.filter((k) => lower.includes(k));
    if (matchedKeys.length > 0) return { pattern: p, matchedKeys };
  }
  return null;
}

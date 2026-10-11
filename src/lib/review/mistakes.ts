import type { JournalEntry } from "@/lib/types";
import { checklistItems } from "@/lib/types";
import { mistakeOf, MISTAKE_LABELS } from "@/lib/practice/focus";

/**
 * Recurring-mistake classification. Every label comes from something the trader recorded on the trade
 * (the Autopsy mistake type, or a process/psychology flag in the review) — nothing is guessed from P&L.
 * The Journal, the Weekly review and the Monthly review all call this one function, so a mistake count
 * shown anywhere always opens exactly the trades that were counted.
 */
export interface MistakeDef { key: string; label: string }

/** The patterns of the review's psychology table, in display order. */
export const PSYCH_PATTERNS: (MistakeDef & { manual?: boolean })[] = [
  { key: "revenge", label: "Revenge trading" },
  { key: "fomo", label: "FOMO entry (chasing)" },
  { key: "early-exit", label: "Early exit (fear)" },
  { key: "moved-stop", label: "Moved SL (hope)" },
  { key: "overtrade", label: "Overtrading / forcing" },
  { key: "skipped", label: "Skipped valid setup", manual: true },
  { key: "bias-lock", label: "Bias lock (ignored price)", manual: true },
];
const EXTRA: MistakeDef[] = [
  { key: "oversized", label: "Oversized" },
  { key: "broke-plan", label: "Broke plan" },
];
export const MISTAKE_BY_KEY = new Map<string, MistakeDef>([...PSYCH_PATTERNS, ...EXTRA].map((d) => [d.key, d]));

/** Autopsy keys (focus.ts) → review pattern keys. */
const AUTOPSY_TO_KEY: Record<string, string> = {
  early: "fomo", chased: "fomo", stop: "moved-stop", size: "oversized", plan: "broke-plan", revenge: "revenge", overtrade: "overtrade",
};

/** All recorded mistake keys for one trade (deduplicated, stable order). Custom "Other" mistakes get their own `other:` key. */
export function mistakesOfEntry(e: JournalEntry): MistakeDef[] {
  const out = new Map<string, MistakeDef>();
  const add = (key: string) => { const d = MISTAKE_BY_KEY.get(key); if (d) out.set(key, d); };
  const r = e.review;
  const named = mistakeOf(e);
  if (named) {
    const mapped = AUTOPSY_TO_KEY[named.key];
    if (mapped) add(mapped); else out.set(named.key, named);
  }
  if (r?.psychology?.revenge === true || r?.postLossGate?.revenge === true) add("revenge");
  if (r?.psychology?.fomo === true || r?.postLossGate?.fomo === true || r?.execution?.chased === true) add("fomo");
  if (r?.execution?.exitedEarly === true || r?.psychology?.fearExit === true) add("early-exit");
  if (r?.execution?.movedStop === true) add("moved-stop");
  if (r?.outcome?.followedPlan === false || r?.plannedVsActual?.followedChecklist === false) {
    // "Broke plan" only when nothing more specific explains it.
    if (out.size === 0) add("broke-plan");
  }
  return PSYCH_PATTERNS.map((p) => out.get(p.key)).filter((d): d is MistakeDef => !!d).concat(EXTRA.map((d) => out.get(d.key)).filter((d): d is MistakeDef => !!d), [...out.values()].filter((d) => !MISTAKE_BY_KEY.has(d.key)));
}

export interface MistakeGroup extends MistakeDef { count: number; entryIds: string[]; dates: string[]; lost: number }

/** Recurring mistakes across a list of trades, most frequent first. */
export function classifyMistakes(entries: JournalEntry[], opts?: { minCount?: number }): MistakeGroup[] {
  const groups = new Map<string, MistakeGroup>();
  for (const e of entries) for (const m of mistakesOfEntry(e)) {
    const g = groups.get(m.key) ?? { ...m, count: 0, entryIds: [], dates: [], lost: 0 };
    g.count++; g.entryIds.push(e.id); if (!g.dates.includes(e.date)) g.dates.push(e.date);
    if (e.pnl < 0) g.lost += -e.pnl;
    groups.set(m.key, g);
  }
  const min = opts?.minCount ?? 1;
  return [...groups.values()].filter((g) => g.count >= min).sort((a, b) => b.count - a.count || b.lost - a.lost || a.label.localeCompare(b.label));
}

/** Does this trade carry the mistake key? */
export const hasMistake = (e: JournalEntry, key: string) => mistakesOfEntry(e).some((m) => m.key === key);

/** Searchable text for a trade's classified mistakes (feeds the Journal search box). */
export const mistakeSearchText = (e: JournalEntry) => mistakesOfEntry(e).map((m) => m.label).join(" ");

/* ───────── Setup criteria (from the checklist the trader confirmed before the trade) ───────── */

export interface CriterionState { key: string; label: string; present: boolean }

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
/** The criteria a trade was held to, with whether each was confirmed. Labels come from the trader's own setup — never hard-coded. */
export function criteriaOfEntry(e: JournalEntry): CriterionState[] {
  if (e.preTradeChecklist && e.preTradeChecklist.length > 0) {
    return e.preTradeChecklist.map((i) => ({ key: norm(i.label), label: i.label, present: i.confirmed }));
  }
  if (e.checklist) {
    return checklistItems(e.checklist).filter((i) => i.item.answer != null).map((i) => ({ key: norm(i.label), label: i.label, present: i.item.answer === true }));
  }
  return [];
}

export { MISTAKE_LABELS };

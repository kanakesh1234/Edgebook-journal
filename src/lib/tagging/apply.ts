import type { JournalEntry, MistakeTagRecord } from "../types";
import { coerceKey } from "../mistakes";
import type { Decision } from "./policy";

/**
 * Pure edits to a saved review's `followUp` — what happens when the trader acts on a suggestion.
 * The trader's own choices are never overwritten: a re-check can add and update machine tags, nothing more.
 */
export type FollowUp = NonNullable<NonNullable<JournalEntry["review"]>["followUp"]>;

const isOwn = (t: MistakeTagRecord) => t.source === "you" || t.source === "preset" || !!t.confirmed;

/** Keeps `mistakeCategory*` (what the Journal, Weekly Review and Practice read) in step with the primary tag. */
function withPrimary(f: FollowUp, tags: MistakeTagRecord[]): FollowUp {
  const primary = tags.find((t) => t.primary) ?? tags[0];
  const key = coerceKey(primary?.key);
  return {
    ...f, tags: tags.length ? tags : undefined,
    mistakeCategory: key ?? f.mistakeCategory,
    mistakeCategorySource: key ? (primary!.source === "you" || primary!.confirmed ? "you" : primary!.source) : f.mistakeCategorySource,
    mistakeCategoryConfidence: key ? primary!.support : f.mistakeCategoryConfidence,
  };
}

/** One tap on a suggestion: it becomes a filed tag owned by the trader. The first filed tag becomes primary. */
export function confirmSuggestion(f: FollowUp, key: string, now = Date.now()): FollowUp {
  const t = f.tagging;
  const found = t?.suggestions.find((s) => s.key === key);
  const existing = f.tags ?? [];
  const base: MistakeTagRecord = found ?? { key, primary: false, source: "you", voters: ["you"], support: 1, evidence: [] };
  const hasPrimary = existing.some((x) => x.primary);
  // Choosing again over an unconfirmed machine primary replaces it as primary: the trader's pick wins.
  const demoted = existing.map((x) => (hasPrimary && !isOwn(x) && x.primary ? { ...x, primary: false } : x));
  const mine: MistakeTagRecord = { ...base, source: "you", voters: [...new Set([...base.voters, "you"])], support: 1, confirmed: true, primary: !demoted.some((x) => x.primary) };
  const tags = [...demoted.filter((x) => x.key !== key), mine].sort((a, b) => Number(b.primary) - Number(a.primary)).slice(0, 3);
  const left = (t?.suggestions ?? []).filter((s) => s.key !== key);
  const next = withPrimary({ ...f, tags }, tags);
  return { ...next, tagging: t ? { ...t, verdict: "filed", suggestions: left, conflict: t.conflict?.better === key ? undefined : t.conflict, reviewed: left.length === 0 && !t.conflict, at: now } : t };
}

/** "None of these": the trader has looked and nothing more will be asked. */
export function dismissSuggestions(f: FollowUp): FollowUp {
  return f.tagging ? { ...f, tagging: { ...f.tagging, suggestions: [], conflict: undefined, reviewed: true } } : f;
}

/**
 * Re-check result for a saved trade. Tags the trader owns (picked, confirmed, quick-pick) stay exactly as they are;
 * machine tags are replaced by the new decision; anything new that is not filed becomes a suggestion.
 */
export function mergeRecheck(f: FollowUp, d: Decision): FollowUp {
  const own = (f.tags ?? []).filter(isOwn);
  const ownKeys = new Set(own.map((t) => t.key));
  const fresh = d.tags.filter((t) => !ownKeys.has(t.key));
  const tags = [...own, ...fresh].map((t, i) => ({ ...t, primary: i === 0 })).slice(0, 3);
  const sug = d.tagging.suggestions.filter((s) => !tags.some((t) => t.key === s.key));
  const next = tags.length ? withPrimary(f, tags) : { ...f, tags: undefined };
  return { ...next, tagging: { ...d.tagging, suggestions: sug, verdict: tags.length ? "filed" : sug.length ? "suggested" : d.tagging.verdict, reviewed: false } };
}

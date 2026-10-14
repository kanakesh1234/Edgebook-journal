import type { JournalEntry } from "./types";
import { scanSources } from "./tagging/rules";

/**
 * Mistake taxonomy — the one list every screen sorts by.
 *
 * The seven quick-pick mistakes in the autopsy map onto themselves. When a trader picks "Others" and writes
 * their own words, the text is sorted into one of these buckets by AI (see /api/journal/classify-mistake),
 * with `classifyLocal` as the always-available fallback. Either way the result is stored on the trade, so the
 * Journal can group, filter and sort by it and the Weekly Review can count recurring ones.
 */
export type MistakeKey =
  | "early" | "chased" | "stop" | "size" | "plan" | "revenge" | "overtrade"
  | "fomo" | "news" | "hesitation" | "exit" | "risk" | "bias" | "tilt" | "timing" | "other";

export type MistakeCategory = { key: MistakeKey; label: string; short: string; hint: string };

export const MISTAKE_CATEGORIES: MistakeCategory[] = [
  { key: "early", label: "Entered early", short: "Early entry", hint: "Pulled the trigger before the setup was confirmed." },
  { key: "chased", label: "Chased price", short: "Chased", hint: "Entered after the move had already run." },
  { key: "stop", label: "Moved stop", short: "Moved stop", hint: "Widened, removed or ignored the stop." },
  { key: "size", label: "Oversized", short: "Oversized", hint: "Traded bigger than the plan allows." },
  { key: "plan", label: "Broke plan", short: "Broke plan", hint: "Deviated from the written plan or rules." },
  { key: "revenge", label: "Revenge trade", short: "Revenge", hint: "Trading to win back a loss." },
  { key: "overtrade", label: "Overtraded", short: "Overtraded", hint: "Too many trades, or trades with no setup." },
  { key: "fomo", label: "FOMO entry", short: "FOMO", hint: "Jumped in because of fear of missing out." },
  { key: "news", label: "Ignored news", short: "News", hint: "Traded into or through a news event." },
  { key: "hesitation", label: "Hesitated", short: "Hesitated", hint: "Froze, skipped or entered late on a valid setup." },
  { key: "exit", label: "Poor exit", short: "Exit", hint: "Cut a winner early or held a loser too long." },
  { key: "risk", label: "Weak risk control", short: "Risk", hint: "No stop, no defined risk, or risk beyond the day's limit." },
  { key: "bias", label: "Traded against bias", short: "Bias", hint: "Fought the higher-timeframe read." },
  { key: "tilt", label: "Emotional trading", short: "Emotional", hint: "Mood or tilt drove the decision." },
  { key: "timing", label: "Outside session", short: "Timing", hint: "Traded outside the planned window or time rules." },
  { key: "other", label: "Something else", short: "Other", hint: "Does not fit a common pattern." },
];

const BY_KEY = new Map(MISTAKE_CATEGORIES.map((c) => [c.key, c]));
export const isMistakeKey = (k: unknown): k is MistakeKey => typeof k === "string" && BY_KEY.has(k as MistakeKey);
export const categoryOf = (k: string | undefined | null): MistakeCategory | null => (k && BY_KEY.get(k as MistakeKey)) || null;
export const mistakeLabel = (k: string | undefined | null) => categoryOf(k)?.label ?? "Uncategorised";

/* ---------------------------- local classifier ---------------------------- */

export type Classification = { key: MistakeKey; confidence: number; source: "ai" | "rules" };

/**
 * Offline classifier. Reads negation ("did NOT chase"), regret ("should NOT have moved my stop") and forward-looking
 * advice ("next time wait for the sweep"), so it can serve as the fallback without confidently filing the OPPOSITE of
 * what the trader meant. The rules themselves live in lib/tagging/rules.ts, shared with the tagging pipeline.
 *
 * Parts are read in order as: the mistake's name, what happened, the lesson.
 */
export function classifyLocal(...parts: (string | undefined | null)[]): Classification {
  const roles = ["mistake-name", "mistake-detail", "lesson"] as const;
  const sources = parts.map((text, i) => ({ id: `p${i}`, role: roles[Math.min(i, 2)]!, text: (text ?? "").trim() })).filter((s) => s.text);
  if (sources.length === 0) return { key: "other", confidence: 0, source: "rules" };
  const { scores } = scanSources(sources);
  if (scores.length === 0) return { key: "other", confidence: 0.2, source: "rules" };
  const [top, second] = scores;
  const confidence = Math.max(0.35, Math.min(0.85, 0.5 + (top!.score - (second?.score ?? 0)) / 10));
  return { key: top!.key, confidence: Math.round(confidence * 100) / 100, source: "rules" };
}

/** Accepts a model's answer as a key OR a label OR a loose phrase and returns a valid key, if any. */
export function coerceKey(v: unknown): MistakeKey | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (isMistakeKey(t)) return t;
  const byLabel = MISTAKE_CATEGORIES.find((c) => c.label.toLowerCase() === t || c.short.toLowerCase() === t);
  return byLabel?.key ?? null;
}

/**
 * Sorts a typed-in mistake. Tries the AI route first (it understands any wording), but never makes the trader
 * wait on it: after `timeoutMs` — or on any failure — the local classifier answers instead.
 */
export async function classifyMistake(text: string, note?: string, timeoutMs = 30_000): Promise<Classification> {
  const local = classifyLocal(text, note);
  const clean = text.trim();
  if (!clean || typeof fetch === "undefined") return local;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch("/api/journal/classify-mistake", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ text: clean.slice(0, 600), note: note?.trim().slice(0, 4000) || undefined }),
    });
    clearTimeout(timer);
    if (!res.ok) return local;
    const data = (await res.json()) as { key?: string; confidence?: number; source?: string };
    const key = coerceKey(data.key);
    if (!key) return local;
    return { key, confidence: typeof data.confidence === "number" ? Math.max(0, Math.min(1, data.confidence)) : 0.7, source: data.source === "ai" ? "ai" : "rules" };
  } catch {
    return local;
  }
}

/* ------------------------------ per-trade view ------------------------------ */

export type TradeMistake = { key: MistakeKey; label: string; source: "preset" | "ai" | "rules" | "you" | "audit"; text?: string; level: 0 | 1 | 2 | 3 | null; /** The tagger could not file this with confidence; it is waiting for the trader. */ pending?: boolean };

/**
 * The mistake of a trade, as a bucket. Reads what the autopsy stored; for older trades that picked "Others"
 * before classification existed, it sorts the written words locally so they still show up in the Journal.
 */
export function mistakeOf(e: JournalEntry): TradeMistake | null {
  const f = e.review?.followUp;
  const m = f?.mistake;
  // "No mistake" does not settle it when the audit proved one from data (news window, limit, size, trade count…).
  const a = f?.audit;
  if (f && (!m || m === "none")) return a && a.objective && coerceKey(a.key) ? { key: coerceKey(a.key)!, label: mistakeLabel(a.key), source: "audit", text: a.reason, level: null } : null;
  if (!f || !m) return null;
  const level = (f.blunderLevel ?? null) as TradeMistake["level"];
  const primaryTag = f.tags?.find((t) => t.primary) ?? f.tags?.[0];
  const stored = coerceKey(primaryTag?.key) ?? coerceKey(f.mistakeCategory);
  if (stored) return { key: stored, label: mistakeLabel(stored), source: f.mistakeCategorySource ?? (m === "other" ? "ai" : "preset"), text: f.mistakeOther, level };
  if (m !== "other" && isMistakeKey(m)) return { key: m, label: mistakeLabel(m), source: "preset", level };
  // Tagged by the new pipeline but not filed (it was unsure): wait for the trader instead of guessing again.
  if (f.tagging && f.tagging.verdict !== "filed") return { key: "other", label: mistakeLabel("other"), source: "rules", text: f.mistakeOther, level, pending: true };
  const guess = classifyLocal(f.mistakeOther, f.mistakeNote);
  return { key: guess.key, label: mistakeLabel(guess.key), source: "rules", text: f.mistakeOther, level };
}

/** Every FILED tag on a trade, primary first. Falls back to the single bucket for trades tagged before multi-tagging existed. */
export function mistakeTagsOf(e: JournalEntry): { key: MistakeKey; label: string; primary: boolean }[] {
  const tags = e.review?.followUp?.tags ?? [];
  const filed = tags.flatMap((t) => { const key = coerceKey(t.key); return key ? [{ key, label: mistakeLabel(key), primary: !!t.primary }] : []; });
  if (filed.length > 0) return filed;
  const m = mistakeOf(e);
  return m && !m.pending ? [{ key: m.key, label: m.label, primary: true }] : [];
}

/** Trades whose tagger left a suggestion or an open question for the trader. */
export const needsTagReview = (e: JournalEntry) => { const t = e.review?.followUp?.tagging; return !!t && !t.reviewed && (t.suggestions.length > 0 || t.verdict === "unsure"); };

/** Everything the Journal needs to list mistakes: bucket → trades, count, and the money they cost. */
export function mistakeIndex(entries: JournalEntry[]) {
  const map = new Map<MistakeKey, { key: MistakeKey; label: string; count: number; cost: number; ids: Set<string> }>();
  for (const e of entries) {
    const m = mistakeOf(e);
    if (!m) continue;
    const row = map.get(m.key) ?? { key: m.key, label: m.label, count: 0, cost: 0, ids: new Set<string>() };
    row.count++; row.ids.add(e.id); if (e.pnl < 0) row.cost += -e.pnl;
    map.set(m.key, row);
  }
  return [...map.values()].sort((a, b) => b.count - a.count || b.cost - a.cost || a.label.localeCompare(b.label));
}

import type { JournalEntry } from "./types";

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

// Ordered by specificity: the first strongest match wins. Patterns are deliberately plain words a trader would write.
const RULES: { key: MistakeKey; re: RegExp; weight: number }[] = [
  { key: "revenge", re: /\b(revenge|win (it|that|the loss|money) back|make (it|that) back|get (it|my money) back|recover(ed|y)? (the )?loss|angry|got even|pay(ing)? the market back)\b/i, weight: 3 },
  { key: "news", re: /\b(news|cpi|fomc|nfp|ppi|jobs report|powell|fed |rate decision|economic (event|calendar)|red folder|high[- ]impact|earnings|announcement)\b/i, weight: 3 },
  { key: "stop", re: /\b(moved? (my |the )?(stop|sl)|widen(ed)? (my |the )?(stop|sl)|remov(ed|ing) (my |the )?(stop|sl)|no stop|stop[- ]?loss (was )?(moved|removed|ignored)|didn'?t honou?r (my |the )?stop|ignored (my |the )?stop)\b/i, weight: 3 },
  { key: "size", re: /\b(over ?siz(e|ed|ing)|too (big|large|many contracts|much size)|size was (too|way)|increased (my )?(size|contracts|lot)|double(d)? (my )?(size|position)|more contracts|big(ger)? size|risked too much|extra contracts?|\d+\s*(contracts?|lots?|shares)\s+(instead|rather|vs\.?|when)|instead of (my )?(usual |planned )?\d+)\b/i, weight: 3 },
  { key: "fomo", re: /\b(fomo|fear of missing|missing out|afraid (it|price) would (go|run)|didn'?t want to miss|jumped in|hopped on|everyone was buying)\b/i, weight: 3 },
  { key: "chased", re: /\b(chas(e|ed|ing)|late entry|entered late|too late|already (ran|moved|pumped|dumped|extended)|bought the top|sold the bottom|extended (move|candle))\b/i, weight: 3 },
  { key: "early", re: /\b(early|premature(ly)?|too soon|before (the )?(confirmation|close|sweep|setup|signal|retest|9:?3\d)|didn'?t wait|jumped the gun|anticipat(ed|ing)|without confirmation|no confirmation|unconfirmed)\b/i, weight: 2.5 },
  { key: "overtrade", re: /\b(over ?trad(e|ed|ing)|too many trades|extra trade|third trade|3rd trade|trade #?3|trading for the sake|bored|forced (a )?trade|forcing|no setup|random trade|churn(ed|ing)?)\b/i, weight: 2.5 },
  { key: "hesitation", re: /\b(hesitat|froze|freeze|frozen|second[- ]guess|missed (the )?(entry|trade|setup)|didn'?t (take|enter|pull)|waited too long|scared to (enter|pull|click)|skipped (a |the )?(valid|good|a\+)|late to (enter|click))\b/i, weight: 2.5 },
  { key: "exit", re: /\b(exit(ed)? (too )?(early|late)|cut (my )?(winner|profit)s? (short|early)|took profit too|closed too (early|soon)|held (a |the |my )?(loser|loss|too long)|hold(ing)? (a )?loss|didn'?t (take|book) profit|gave back|let (a )?winner (turn|become)|left money|trail(ed)? (too|badly)|cut (a |the |my )?(winner|winning trade|profit)s?)\b/i, weight: 3 },
  { key: "risk", re: /\b(no (risk|stop|plan for risk)|risk management|risk (was )?(too|undefined|unclear)|exceed(ed)? (my )?(daily|day|max)? ?(loss|limit)|beyond (my )?(limit|daily)|broke (my )?(daily )?(loss|risk)|blew (past )?(my )?(limit|risk)|stop too (wide|far)|r:?r (was )?(bad|poor|too low)|bad risk[- ]reward)\b/i, weight: 2.5 },
  { key: "bias", re: /\b(against (the )?(bias|trend|htf|higher timeframe|daily|4h|draw)|counter[- ]?trend|fought (the )?(trend|bias)|wrong (direction|side|bias)|ignored (the )?(bias|htf|trend|draw)|traded (the )?opposite)\b/i, weight: 2.5 },
  { key: "timing", re: /\b(outside (the )?(session|window|killzone|hours)|wrong (time|session)|after (the )?(session|kill ?zone|11|noon|lunch)|before (9:?30|open)|pre[- ]?market|off[- ]?hours|asia session|too early in the day|late in the (day|session)|9:?3[0-2]|time rule)\b/i, weight: 2.5 },
  { key: "tilt", re: /\b(tilt(ed)?|frustrat|angry|emotion(al)?|stress(ed)?|anxious|anxiety|panic(ked)?|greed(y)?|euphori|overconfiden|cocky|tired|exhaust|distract|mood|bad day|upset|impatien|impuls|gut feel|felt like)\b/i, weight: 2 },
  { key: "plan", re: /\b(broke (my |the )?(plan|rules?)|didn'?t follow|not (in|part of) (my |the )?plan|off[- ]plan|ignored (my |the )?(plan|rules?|checklist)|deviat|skipped (the )?(checklist|rules?)|rule(s)? (violation|break)|unplanned)\b/i, weight: 2 },
];

export type Classification = { key: MistakeKey; confidence: number; source: "ai" | "rules" };

/** Plain keyword scoring. Used when no AI key is configured, the user is offline, or the model is slow. */
export function classifyLocal(...parts: (string | undefined | null)[]): Classification {
  const text = parts.filter(Boolean).join(" ").trim();
  if (!text) return { key: "other", confidence: 0, source: "rules" };
  const scores = new Map<MistakeKey, number>();
  for (const r of RULES) {
    const hits = text.match(new RegExp(r.re.source, r.re.flags.includes("g") ? r.re.flags : r.re.flags + "g"));
    if (hits?.length) scores.set(r.key, (scores.get(r.key) ?? 0) + r.weight * Math.min(2, hits.length));
  }
  if (scores.size === 0) return { key: "other", confidence: 0.2, source: "rules" };
  const ranked = [...scores].sort((a, b) => b[1] - a[1]);
  const [key, top] = ranked[0]!;
  const second = ranked[1]?.[1] ?? 0;
  const confidence = Math.max(0.35, Math.min(0.85, 0.5 + (top - second) / 10));
  return { key, confidence: Math.round(confidence * 100) / 100, source: "rules" };
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
export async function classifyMistake(text: string, note?: string, timeoutMs = 9000): Promise<Classification> {
  const local = classifyLocal(text, note);
  const clean = text.trim();
  if (!clean || typeof fetch === "undefined") return local;
  try {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch("/api/journal/classify-mistake", {
      method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal,
      body: JSON.stringify({ text: clean.slice(0, 120), note: note?.trim().slice(0, 400) || undefined }),
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

export type TradeMistake = { key: MistakeKey; label: string; source: "preset" | "ai" | "rules" | "you" | "audit"; text?: string; level: 0 | 1 | 2 | 3 | null };

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
  const stored = coerceKey(f.mistakeCategory);
  if (stored) return { key: stored, label: mistakeLabel(stored), source: f.mistakeCategorySource ?? (m === "other" ? "ai" : "preset"), text: f.mistakeOther, level };
  if (m !== "other" && isMistakeKey(m)) return { key: m, label: mistakeLabel(m), source: "preset", level };
  const guess = classifyLocal(f.mistakeOther, f.mistakeNote);
  return { key: guess.key, label: mistakeLabel(guess.key), source: "rules", text: f.mistakeOther, level };
}

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

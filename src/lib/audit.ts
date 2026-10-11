import type { JournalEntry, TradePlan } from "./types";
import { classifyLocal, coerceKey, isMistakeKey, mistakeLabel, type MistakeKey } from "./mistakes";
import { dayLimitFor, dayTrades, riskFor } from "./risk";
import { feelingFromReview } from "./feelings";

/**
 * Trade audit — an independent read of the WHOLE trade, from plan to autopsy.
 *
 * Self-reports can be wrong or generous, so the audit leans on facts the journal already holds: the news times and
 * loss limit from the plan, the trade's entry time and size, and what the rest of the day looked like. Those produce
 * "objective" signals. What the trader said (plan followed? how it felt? their own words) adds softer signals.
 * An AI then weighs everything and names the single main mistake — or none — with a one-line reason.
 */
export type Signal = { key: MistakeKey; code: string; weight: number; objective: boolean; text: string };
export type Audit = { key: MistakeKey | "none"; confidence: number; reason: string; objective: boolean; source: "ai" | "rules"; flags: string[] };

const toMin = (t?: string | null) => { const m = t?.match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const median = (v: number[]) => { const s = [...v].sort((a, b) => a - b); const h = s.length >> 1; return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2; };

export const planOf = (e: JournalEntry, plans: TradePlan[]) =>
  plans.find((p) => p.id === e.planId) ?? [...plans].filter((p) => p.date === e.date).sort((a, b) => b.createdAt - a.createdAt)[0];

export function auditSignals(e: JournalEntry, entries: JournalEntry[], plans: TradePlan[]): Signal[] {
  const out: Signal[] = [];
  const plan = planOf(e, plans);
  const day = dayTrades(e.date, entries);
  const idx = day.findIndex((t) => t.id === e.id);
  const t0 = toMin(e.entryTime);

  // News: entered shortly before or within 30 minutes after an event the trader listed in the plan.
  if (t0 != null) for (const ev of plan?.newsEvents ?? []) {
    const et = toMin(ev.time);
    if (et != null && t0 - et >= -10 && t0 - et <= 30) {
      const d = t0 - et;
      out.push({ key: "news", code: "news-window", weight: 0.9, objective: true, text: `Entered ${d < 0 ? `${-d} min before` : `${d} min after`} ${ev.name} (${ev.time}), a news event listed in the plan.` });
    }
  }

  // Loss limit: this trade took the day to its limit, or was taken after the limit was already used.
  const limit = dayLimitFor(e.date, plans);
  if (limit && idx >= 0) {
    const before = riskFor(limit, day.slice(0, idx)), after = riskFor(limit, day.slice(0, idx + 1));
    if (before && before.used >= limit) out.push({ key: "plan", code: "after-limit", weight: 0.95, objective: true, text: "Taken after the daily loss limit had already been reached." });
    else if (after && after.used >= limit) out.push({ key: "risk", code: "limit-crossed", weight: 0.85, objective: true, text: "This trade took the day to its loss limit." });
  }

  // Overtrading: third trade or later in the day.
  if (idx >= 2) out.push({ key: "overtrade", code: "trade-count", weight: 0.7, objective: true, text: `Trade #${idx + 1} of the day.` });

  // Revenge: re-entered within ten minutes of a losing trade that day.
  const prev = idx > 0 ? day[idx - 1] : undefined;
  const pt = toMin(prev?.exitTime) ?? toMin(prev?.entryTime);
  if (prev && prev.pnl < 0 && t0 != null && pt != null && t0 - pt >= 0 && t0 - pt <= 10) out.push({ key: "revenge", code: "quick-reentry", weight: 0.8, objective: true, text: `Re-entered ${t0 - pt} min after a ${Math.abs(prev.pnl)} loss.` });

  // Size: clearly bigger than the trader's recent norm.
  const q = e.quantity ?? null;
  if (q != null) {
    const past = entries.filter((x) => x.id !== e.id && x.quantity != null && (x.date < e.date || (x.date === e.date && x.createdAt < e.createdAt))).sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt).slice(0, 10).map((x) => x.quantity as number);
    if (past.length >= 3) { const m = median(past); if (q >= m * 1.5 && q - m >= 1) out.push({ key: "size", code: "size-spike", weight: 0.8, objective: true, text: `Size ${q} against a usual ${m}.` }); }
  }

  // What the trader said — softer evidence.
  if (e.review?.outcome?.followedPlan === false) out.push({ key: "plan", code: "said-broke-plan", weight: 0.55, objective: false, text: "The trader said the plan was not followed." });
  const feel = feelingFromReview(e.review?.psychology);
  const byFeel: Partial<Record<string, MistakeKey>> = { fomo: "fomo", revenge: "revenge", anxious: "tilt", frustrated: "tilt", overconfident: "tilt", regretful: "tilt" };
  if (feel && byFeel[feel]) out.push({ key: byFeel[feel]!, code: "felt-" + feel, weight: 0.4, objective: false, text: `It felt ${feel === "revenge" ? "urgent" : feel}.` });
  const f = e.review?.followUp;
  const words = classifyLocal(f?.mistakeOther, f?.mistakeNote, e.reflection?.lesson);
  if (words.key !== "other" && words.confidence >= 0.5) out.push({ key: words.key, code: "own-words", weight: 0.5, objective: false, text: "The trader's own description points here." });
  return out;
}

/** Deterministic verdict: objective evidence first, then the strongest soft signal. */
export function auditLocal(signals: Signal[]): Audit {
  const top = [...signals].sort((a, b) => Number(b.objective) - Number(a.objective) || b.weight - a.weight)[0];
  if (!top) return { key: "none", confidence: 0.6, reason: "Nothing in the plan, timing, size or limit points to a mistake.", objective: false, source: "rules", flags: [] };
  return { key: top.key, confidence: Math.round(top.weight * 100) / 100, reason: top.text, objective: top.objective, source: "rules", flags: signals.map((s) => s.code) };
}

/** Everything the model may see: facts and the trader's words, compactly. No images. */
export function auditContext(e: JournalEntry, plans: TradePlan[], signals: Signal[]) {
  const plan = planOf(e, plans), r = e.review, f = r?.followUp;
  return {
    plan: plan ? { thesis: plan.thesis?.slice(0, 280), feelingBefore: plan.emotionalState, why: plan.emotionalNote?.slice(0, 160), news: (plan.newsEvents ?? []).map((n) => `${n.name} ${n.time ?? ""}`.trim()), dayLossLimit: plan.maxLoss, mightBreakPlan: plan.whatCouldBreakPlan?.slice(0, 160), watching: plan.watchMistakes } : null,
    trade: { result: e.pnl, direction: e.direction, entry: e.entryTime, exit: e.exitTime, size: e.quantity, setup: e.setup },
    review: r ? { followedPlan: r.outcome?.followedPlan, felt: feelingFromReview(r.psychology), goodProcess: r.outcome?.processVerdict, saidMistake: f?.mistake, mistakeWords: f?.mistakeOther, whatHappened: f?.mistakeNote?.slice(0, 300), lesson: (e.reflection?.lesson ?? f?.biggestMistake)?.slice(0, 200) } : null,
    signals: signals.map((s) => ({ key: s.key, objective: s.objective, fact: s.text })),
  };
}

/** Local verdict now; AI verdict if it answers in time. An AI "none" never erases an objective finding. */
export async function auditTrade(e: JournalEntry, entries: JournalEntry[], plans: TradePlan[], timeoutMs = 9000): Promise<Audit> {
  const signals = auditSignals(e, entries, plans);
  const local = auditLocal(signals);
  if (typeof fetch === "undefined") return local;
  try {
    const ctl = new AbortController(); const timer = setTimeout(() => ctl.abort(), timeoutMs);
    const res = await fetch("/api/journal/audit-trade", { method: "POST", headers: { "Content-Type": "application/json" }, signal: ctl.signal, body: JSON.stringify({ context: auditContext(e, plans, signals) }) });
    clearTimeout(timer);
    if (!res.ok) return local;
    const d = (await res.json()) as { key?: string; confidence?: number; reason?: string; source?: string };
    const key = d.key === "none" ? "none" : coerceKey(d.key);
    if (!key || d.source !== "ai") return local;
    const objective = signals.find((s) => s.objective);
    if (key === "none" && objective) return local;
    const mine = signals.filter((s) => s.key === key);
    return { key, confidence: typeof d.confidence === "number" ? Math.max(0, Math.min(1, d.confidence)) : 0.7, reason: (d.reason ?? "").slice(0, 200) || mine[0]?.text || local.reason, objective: mine.some((s) => s.objective), source: "ai", flags: signals.map((s) => s.code) };
  } catch { return local; }
}

export const auditLabel = (a: Audit) => (a.key === "none" ? "No mistake" : mistakeLabel(a.key));
export const isPresetKey = (k: string) => ["early", "chased", "stop", "size", "plan", "revenge", "overtrade"].includes(k) && isMistakeKey(k);

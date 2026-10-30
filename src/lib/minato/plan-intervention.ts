import type { JournalEntry, JournalSettings, TradePlan } from "../types";
import { buildRecall, collectWords, emptyBrain, type Recall, type RecallItem } from "./brain-ml";
import { planForEntry, readDirectionOf } from "../plan-review";
import { ruleStats, statFor } from "../rule-stats";
import { mistakeLabel, mistakeTagsOf } from "../mistakes";

/**
 * PLAN TRADE — contextual intervention engine.
 *
 * One question, answered locally and deterministically: "given everything this trader has written and done, and
 * what they have planned so far today, is there ONE thing worth saying right now?"
 *
 * Two gates keep it honest:
 *   1. DATA GATE  — `dataReadiness()`. Until the journal holds enough trades, linked plans and written reflections,
 *      the engine returns nothing at all. Thin history produces noise, so silence is the correct output.
 *   2. EVIDENCE GATE — every candidate carries the sample behind it and is dropped below its own minimum
 *      (a statistic needs ≥ 3 comparable trades, a text match needs a real similarity score).
 *
 * No network, no LLM. Wording is assembled from the trader's own numbers and quotes, so nothing can be said that
 * is not in the evidence list. The original written text is only ever quoted, never rewritten or stored elsewhere.
 */

/* ------------------------------------------------------------------ */
/*  Data gate                                                          */
/* ------------------------------------------------------------------ */

/** Minimum journal depth before Minato may speak up in Plan Trade. Tunable; all four must be met. */
export const READY = { trades: 12, linkedPlans: 6, written: 20, reflected: 5 } as const;

export interface DataReadiness {
  ready: boolean;
  /** 0‥1 — the weakest of the four requirements. */
  progress: number;
  counts: { trades: number; linkedPlans: number; written: number; reflected: number };
  /** Plain-language list of what is still short, e.g. "6 more trades with a written plan". */
  missing: string[];
}

const MIN_TEXT = 12;
const hasText = (s?: string | null) => !!s && s.replace(/\s+/g, " ").trim().length >= MIN_TEXT;

const reflectedOn = (e: JournalEntry) => {
  const f = e.review?.followUp;
  const r = e.reflection;
  return [r?.wentWell, r?.wentPoorly, r?.cause, r?.lesson, f?.mistakeNote, f?.biggestMistake, f?.watchNext, e.review?.plannedVsActual?.deviations].some(hasText);
};

export function dataReadiness(entries: JournalEntry[], plans: TradePlan[], words?: RecallItem[]): DataReadiness {
  const ids = new Set(entries.map((e) => e.id));
  const linkedPlans = plans.filter((p) => (p.linkedTradeId && ids.has(p.linkedTradeId)) || entries.some((e) => e.planId === p.id)).length;
  const writtenKinds = new Set<RecallItem["kind"]>(["journal", "reflection", "autopsy", "plan"]);
  const written = (words ?? []).filter((w) => writtenKinds.has(w.kind)).length;
  const counts = { trades: entries.length, linkedPlans, written, reflected: entries.filter(reflectedOn).length };
  const ratio = (k: keyof typeof counts) => Math.min(1, counts[k] / READY[k]);
  const progress = Math.min(ratio("trades"), ratio("linkedPlans"), ratio("written"), ratio("reflected"));
  const missing: string[] = [];
  if (counts.trades < READY.trades) missing.push(`${READY.trades - counts.trades} more logged trades`);
  if (counts.linkedPlans < READY.linkedPlans) missing.push(`${READY.linkedPlans - counts.linkedPlans} more trades with a written plan`);
  if (counts.reflected < READY.reflected) missing.push(`${READY.reflected - counts.reflected} more reviewed trades`);
  if (counts.written < READY.written) missing.push(`${READY.written - counts.written} more written notes`);
  return { ready: missing.length === 0, progress, counts, missing };
}

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export type InterventionKind = "skipped-rule" | "bias-clash" | "invalidation" | "similar-plan" | "emotion" | "self-note";

export type InterventionAction =
  | { id: "edit-thought"; label: string }
  | { id: "edit-plan"; label: string }
  | { id: "watch"; label: string; mistakeKey: string }
  | { id: "compare"; label: string };

export interface Evidence {
  /** One short line: what this row is. */
  label: string;
  /** The trader's own words, verbatim (trimmed for display). */
  quote?: string;
  date?: string;
}

export interface Intervention {
  /** Stable fingerprint: the same situation always yields the same id (dedupe, snooze). */
  id: string;
  kind: InterventionKind;
  heading: string;
  insight: string;
  action?: InterventionAction;
  /** Shown only when the trader expands "Details". */
  evidence: Evidence[];
  /** How many past trades/notes the claim rests on. */
  sample: number;
  /** 0‥1 confidence from sample size and effect size. */
  strength: number;
}

/** What the trader has entered so far in this Plan Trade session. */
export interface PlanSnapshot {
  date: string;
  thesis: string;
  /** Non-empty thought lines, in order. */
  thoughts: string[];
  emotion?: string;
  emotionReason?: string;
  setupId?: string;
  setupName?: string;
  rules: { text: string; confirmed: boolean }[];
  /** Mistake keys already on the trader's watch list for this plan. */
  watch: string[];
}

export interface InterventionIndex {
  readiness: DataReadiness;
  recall: Recall;
  entries: JournalEntry[];
  plans: TradePlan[];
  sym: string;
}

/** Per-sitting memory: what was already shown or dismissed. */
export interface NudgeSession { shown: string[]; dismissed: string[] }
/** Persisted preferences: snoozed fingerprints and muted kinds, each with an expiry (ms epoch). */
export interface NudgePrefs { snoozed: Record<string, number>; muted: Partial<Record<InterventionKind, number>> }

export const emptySession = (): NudgeSession => ({ shown: [], dismissed: [] });
export const emptyPrefs = (): NudgePrefs => ({ snoozed: {}, muted: {} });

const DAY = 86_400_000;
export const SNOOZE_MS = 7 * DAY;
export const MUTE_MS = 30 * DAY;
export const MAX_PER_SESSION = 2;
const MIN_STRENGTH = 0.55;
const MIN_SAMPLE = 3;

/* ------------------------------------------------------------------ */
/*  Index (rebuild only when the journal changes — never per keystroke) */
/* ------------------------------------------------------------------ */

export function buildInterventionIndex(entries: JournalEntry[], plans: TradePlan[], settings: JournalSettings, sym = "$"): InterventionIndex {
  const words = collectWords(entries, plans, settings, settings.aiBrain?.minato ?? emptyBrain());
  return { readiness: dataReadiness(entries, plans, words), recall: buildRecall(words), entries, plans, sym };
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const r2 = (n: number) => Math.round(n * 100) / 100;
const clamp = (v: number, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const pct = (n: number) => `${Math.round(n * 100)}%`;
const money = (n: number, sym: string) => `${n < 0 ? "−" : "+"}${sym}${Math.abs(Math.round(n))}`;
const clip = (s: string, n = 140) => { const t = s.replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t; };
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const dateShort = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const fp = (...parts: string[]) => { let h = 0x811c9dc5; for (const c of parts.join("|")) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(36); };

const entryOfPlan = (p: TradePlan, entries: JournalEntry[]) => entries.find((e) => e.id === p.linkedTradeId) ?? entries.find((e) => e.planId === p.id);
const queryOf = (s: PlanSnapshot) => [s.thesis, ...s.thoughts].join(" . ").trim();

/* ------------------------------------------------------------------ */
/*  Candidates                                                         */
/* ------------------------------------------------------------------ */

/** A rule the trader is about to leave unchecked has a record of costing them. Needs ≥ 3 skips AND ≥ 3 confirms to compare. */
function skippedRule(ix: InterventionIndex, s: PlanSnapshot): Intervention | null {
  if (!s.setupId || s.rules.length === 0) return null;
  const confirmedShare = s.rules.filter((r) => r.confirmed).length / s.rules.length;
  if (confirmedShare < 0.5) return null; // still working through the list — not the moment
  const stats = ruleStats(ix.plans, ix.entries);
  let best: { rule: string; skipped: number; planned: number; sAvg: number; cAvg: number; sWr: number; cWr: number; score: number } | null = null;
  for (const r of s.rules.filter((x) => !x.confirmed)) {
    const st = statFor(stats, s.setupId, r.text);
    if (!st) continue;
    const confirmedN = st.planned - st.skipped;
    if (st.skipped < MIN_SAMPLE || confirmedN < MIN_SAMPLE) continue;
    if (st.skippedAvgPnl == null || st.confirmedAvgPnl == null || st.skippedWinRate == null || st.confirmedWinRate == null) continue;
    const gap = st.confirmedWinRate - st.skippedWinRate;
    if (gap < 0.15 || st.confirmedAvgPnl <= st.skippedAvgPnl) continue;
    const score = clamp(st.planned / 14) * 0.55 + clamp(gap / 0.5) * 0.45;
    if (!best || score > best.score) best = { rule: st.text, skipped: st.skipped, planned: st.planned, sAvg: st.skippedAvgPnl, cAvg: st.confirmedAvgPnl, sWr: st.skippedWinRate, cWr: st.confirmedWinRate, score };
  }
  if (!best) return null;
  const evidence: Evidence[] = [{ label: `Skipped ${best.skipped} of ${best.planned}: ${pct(best.sWr)} won, average ${money(best.sAvg, ix.sym)}. Confirmed: ${pct(best.cWr)} won, average ${money(best.cAvg, ix.sym)}.` }];
  const key = norm(best.rule);
  for (const p of [...ix.plans].sort((a, b) => b.date.localeCompare(a.date))) {
    if (evidence.length >= 4) break;
    if (p.playbookId !== s.setupId) continue;
    const rr = p.rules.find((x) => norm(x.label.replace(/^Rule \d+:?\s*/i, "")) === key);
    const e = entryOfPlan(p, ix.entries);
    if (rr && rr.state !== "ready" && e) evidence.push({ label: `Skipped · trade ended ${money(e.pnl, ix.sym)}`, date: p.date });
  }
  return {
    id: `skipped-rule:${fp(s.setupId, key)}`, kind: "skipped-rule", heading: "Checklist incomplete",
    insight: `“${clip(best.rule, 70)}” is still unchecked. Trades where you skipped it averaged ${money(best.sAvg, ix.sym)}, against ${money(best.cAvg, ix.sym)} when you confirmed it.`,
    action: { id: "edit-thought", label: "Review plan" },
    evidence, sample: best.planned, strength: r2(0.55 + best.score * 0.4),
  };
}

/** The thesis points one way, a note the trader wrote in this same plan points the other. In-draft fact, quoted back. */
function biasClash(_ix: InterventionIndex, s: PlanSnapshot): Intervention | null {
  const t = readDirectionOf(s.thesis);
  if (!t.dir || t.strength < 0.5) return null;
  const clash = [...s.thoughts, s.emotionReason ?? ""].filter((x) => x.trim().length >= 15).map((x) => ({ x, d: readDirectionOf(x) })).find((c) => c.d.dir && c.d.dir !== t.dir && c.d.strength >= 0.6);
  if (!clash) return null;
  const a = t.dir === "long" ? "long" : "short", b = clash.d.dir === "long" ? "long" : "short";
  return {
    id: `bias-clash:${fp(t.dir, norm(clash.x))}`, kind: "bias-clash", heading: "Bias and notes disagree",
    insight: `Your thesis leans ${a}, but one of your notes leans ${b}. Decide which one you are trading before you check the rules.`,
    action: { id: "edit-plan", label: "Edit bias" },
    evidence: [{ label: `Thesis (leans ${a})`, quote: clip(s.thesis) }, { label: `Note (leans ${b})`, quote: clip(clash.x) }],
    sample: 1, strength: 0.68,
  };
}

const INVALIDATION_WORDS = /\b(invalid|invalidates|invalidation|cut|stop|sl|below|above|lose|loses|wrong|abort|cancel)\b/i;
const INVALIDATION_TROUBLE = /(moved|widen(?:ed)?|removed|ignored|forgot|without|no|didn'?t\s+(?:set|define|have|respect))\s+(?:my\s+|the\s+|an?\s+)?(?:stop|invalidation|sl)\b|\b(?:stop|invalidation)\b.{0,24}\b(?:moved|widened|ignored|undefined|missing|unclear)\b/i;

/** No invalidation written, and the trader's own reviews say that has hurt before (≥ 2 different trades, in their words). */
function missingInvalidation(ix: InterventionIndex, s: PlanSnapshot): Intervention | null {
  if (s.thesis.trim().length < 15) return null;
  if (INVALIDATION_WORDS.test([s.thesis, ...s.thoughts].join(" "))) return null;
  const hits: { e: JournalEntry; quote: string }[] = [];
  for (const e of ix.entries) {
    const f = e.review?.followUp, r = e.reflection;
    const quote = [f?.mistakeNote, f?.biggestMistake, f?.watchNext, e.review?.plannedVsActual?.deviations, r?.wentPoorly, r?.cause, r?.lesson].find((x) => hasText(x) && INVALIDATION_TROUBLE.test(x!));
    if (quote) hits.push({ e, quote });
  }
  if (hits.length < 2) return null;
  hits.sort((a, b) => b.e.date.localeCompare(a.e.date));
  return {
    id: `invalidation:${fp(s.setupId ?? "any")}`, kind: "invalidation", heading: "No invalidation yet",
    insight: `Nothing in this plan says what proves it wrong. You flagged a stop or invalidation problem in ${hits.length} of your reviews.`,
    action: { id: "edit-thought", label: "Add invalidation" },
    evidence: hits.slice(0, 3).map((h) => ({ label: h.e.setup ? `Review · ${h.e.setup}` : "Review", quote: clip(h.quote), date: h.e.date })),
    sample: hits.length, strength: r2(clamp(0.5 + 0.1 * hits.length, 0, 0.85)),
  };
}

/** The most similar plan the trader wrote before, with how it ended. One plan: described, never generalised. */
function similarPlan(ix: InterventionIndex, s: PlanSnapshot): Intervention | null {
  const q = queryOf(s);
  if (q.length < 25) return null;
  for (const hit of ix.recall.search(q, 10)) {
    if (hit.kind !== "plan" || hit.score < 0.3 || hit.date > s.date) continue;
    const p = ix.plans.find((x) => hit.id.startsWith(`${x.id}:`));
    const e = p && entryOfPlan(p, ix.entries);
    if (!p || !e) continue;
    const mistake = mistakeTagsOf(e).find((m) => m.primary) ?? mistakeTagsOf(e)[0];
    const note = e.review?.followUp?.mistakeNote ?? e.reflection?.lesson ?? e.reflection?.wentPoorly;
    const evidence: Evidence[] = [{ label: "Then — your plan", quote: clip(p.thesis), date: p.date }, { label: `Outcome ${money(e.pnl, ix.sym)}${mistake ? ` · ${mistake.label}` : ""}` }];
    if (hasText(note)) evidence.push({ label: "Your review", quote: clip(note!) });
    evidence.push({ label: "Now — your plan", quote: clip(s.thesis) });
    return {
      id: `similar-plan:${p.id}`, kind: "similar-plan", heading: "You wrote something similar",
      insight: `On ${dateShort(p.date)} you planned a close match. That trade ended ${money(e.pnl, ix.sym)}${mistake ? `, and you tagged it ${mistake.label.toLowerCase()}` : ""}.`,
      action: { id: "compare", label: "Compare" }, evidence, sample: 1,
      strength: r2(clamp(0.5 + hit.score * 0.5 + (e.pnl < 0 && mistake ? 0.08 : 0), 0, 0.9)),
    };
  }
  return null;
}

/** The feeling chosen for this plan has a track record: ≥ 3 past plans written in that state. */
function emotionPattern(ix: InterventionIndex, s: PlanSnapshot): Intervention | null {
  if (!s.emotion) return null;
  const pairs = ix.entries.map((e) => ({ e, p: planForEntry(e, ix.plans) })).filter((x): x is { e: JournalEntry; p: TradePlan } => !!x.p && x.e.date <= s.date);
  const same = pairs.filter((x) => x.p.emotionalState === s.emotion);
  if (same.length < MIN_SAMPLE || pairs.length < 8) return null;
  const wr = (v: typeof pairs) => v.filter((x) => x.e.pnl > 0).length / v.length;
  const base = wr(pairs), mine = wr(same);
  const counts = new Map<string, number>();
  for (const x of same) for (const m of mistakeTagsOf(x.e)) counts.set(m.key, (counts.get(m.key) ?? 0) + 1);
  const top = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];
  const lowWins = base - mine >= 0.2;
  const repeatMistake = !!top && top[1] >= 2 && top[1] / same.length >= 0.5;
  if (!lowWins && !repeatMistake) return null;
  if (top && s.watch.includes(top[0]) && !lowWins) return null; // already on the watch list: nothing left to add
  const feel = s.emotion.toLowerCase();
  const parts: string[] = [];
  if (lowWins) parts.push(`${same.filter((x) => x.e.pnl > 0).length} of ${same.length} won (your usual is ${pct(base)})`);
  if (repeatMistake && top) parts.push(`${mistakeLabel(top[0]).toLowerCase()} showed up in ${top[1]}`);
  return {
    id: `emotion:${fp(s.emotion)}`, kind: "emotion", heading: `Planning while ${feel}`,
    insight: `Of your last ${same.length} plans written while ${feel}, ${parts.join("; ")}.`,
    action: repeatMistake && top && !s.watch.includes(top[0]) ? { id: "watch", label: "Add to watch list", mistakeKey: top[0] } : undefined,
    evidence: [
      { label: `${same.length} plans written while ${feel}: ${pct(mine)} won. All plans: ${pct(base)}.` },
      ...same.slice(-3).reverse().map((x) => ({ label: `${money(x.e.pnl, ix.sym)}${mistakeTagsOf(x.e)[0] ? ` · ${mistakeTagsOf(x.e)[0].label}` : ""}`, quote: hasText(x.p.emotionalNote) ? clip(x.p.emotionalNote!) : undefined, date: x.p.date })),
    ],
    sample: same.length, strength: r2(clamp(0.5 + clamp(same.length / 10) * 0.2 + clamp((base - mine) / 0.5) * 0.2 + (repeatMistake ? 0.1 : 0), 0, 0.92)),
  };
}

/** A note the trader left for their future self (a "watch next" or a saved insight) that matches today's plan. */
function selfNote(ix: InterventionIndex, s: PlanSnapshot): Intervention | null {
  const q = queryOf(s);
  if (q.length < 25) return null;
  const cutoff = new Date(`${s.date}T12:00:00Z`).getTime() - 45 * DAY;
  for (const hit of ix.recall.search(q, 12)) {
    const isNote = hit.id.endsWith(":x") || hit.kind === "saved";
    if (!isNote || hit.score < 0.28 || hit.date > s.date || new Date(`${hit.date}T12:00:00Z`).getTime() < cutoff) continue;
    return {
      id: `self-note:${hit.id}`, kind: "self-note", heading: "A note you left yourself",
      insight: `On ${dateShort(hit.date)} you wrote: “${clip(hit.text, 90)}” It matches what you are planning now.`,
      evidence: [{ label: hit.kind === "saved" ? "Saved insight" : "Watch-next from a review", quote: clip(hit.text, 240), date: hit.date }],
      sample: 1, strength: r2(clamp(0.5 + hit.score * 0.5, 0, 0.85)),
    };
  }
  return null;
}

const WEIGHT: Record<InterventionKind, number> = { "skipped-rule": 1, "bias-clash": 0.95, invalidation: 0.9, "similar-plan": 0.85, emotion: 0.8, "self-note": 0.7 };

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Every intervention that currently passes the data gate and its own evidence minimum, best first. Empty until ready. */
export function candidateInterventions(ix: InterventionIndex, snap: PlanSnapshot): Intervention[] {
  if (!ix.readiness.ready) return [];
  if (snap.thesis.trim().length < 15) return []; // the trader has not said enough yet to compare anything
  return [skippedRule, biasClash, missingInvalidation, similarPlan, emotionPattern, selfNote]
    .map((f) => f(ix, snap))
    .filter((c): c is Intervention => !!c && c.strength >= MIN_STRENGTH)
    .sort((a, b) => b.strength * WEIGHT[b.kind] - a.strength * WEIGHT[a.kind]);
}

export function isSuppressed(c: Intervention, session: NudgeSession, prefs: NudgePrefs, now: number): boolean {
  if (session.shown.includes(c.id) || session.dismissed.includes(c.id)) return true;
  if ((prefs.snoozed[c.id] ?? 0) > now) return true;
  if ((prefs.muted[c.kind] ?? 0) > now) return true;
  return false;
}

/** The one intervention to show now, or null. Respects the per-sitting cap, dismissals, snoozes and muted kinds. */
export function pickIntervention(cands: Intervention[], session: NudgeSession, prefs: NudgePrefs, now: number): Intervention | null {
  if (session.shown.length >= MAX_PER_SESSION) return null;
  return cands.find((c) => !isSuppressed(c, session, prefs, now)) ?? null;
}

export const snoozed = (prefs: NudgePrefs, id: string, now: number): NudgePrefs => ({ ...prefs, snoozed: { ...prune(prefs.snoozed, now), [id]: now + SNOOZE_MS } });
export const mutedKind = (prefs: NudgePrefs, kind: InterventionKind, now: number): NudgePrefs => ({ ...prefs, muted: { ...prefs.muted, [kind]: now + MUTE_MS } });
function prune(m: Record<string, number>, now: number) { return Object.fromEntries(Object.entries(m).filter(([, t]) => t > now)); }

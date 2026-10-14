import type { JournalEntry, TradePlan } from "../types";
import { auditSignals, planOf } from "../audit";
import { dayTrades } from "../risk";
import { isMistakeKey, type MistakeKey } from "../mistakes";
import type { SourceRole } from "./rules";

/**
 * The evidence bundle — EVERYTHING the tagger may look at, in one labelled, size-capped object.
 *
 *   sources  what the trader wrote, one entry per field, labelled by the ROLE the field plays
 *            (their own naming of the mistake, what went poorly, the lesson, "what I'd improve", what went well…)
 *   facts    what the data says: timing, size, news windows, loss limit, unconfirmed rules, planned-vs-actual numbers
 *   declared what the trader selected (a claim, not proof)
 *
 * Screenshots are deliberately NOT part of the bundle: see TAGGING.md ("Why screenshots cannot create a tag").
 */
export type TagSource = { id: string; role: SourceRole; label: string; text: string };
export type TagFact = { id: string; code: string; text: string; objective: boolean; key?: MistakeKey };
export type TagDeclared = {
  /** "none" | a quick-pick key | "other" | "" */
  mistake: string;
  /** The quick-pick as a taxonomy key, when it is one. */
  mistakeKey?: MistakeKey;
  /** A category the trader chose by hand for a written-in mistake. Final: nothing may override it. */
  pickedCategory?: MistakeKey;
  followedPlan?: boolean | null;
  feeling?: string;
  goodProcess?: boolean | null;
  blunder?: number | null;
  /** Psychology flags the trader ticked (fomo / revenge / fear exit / make-it-back). */
  flags: string[];
};
export type TagBundle = {
  v: 1;
  declared: TagDeclared;
  sources: TagSource[];
  facts: TagFact[];
  /** Compact trade + plan context for the model. Never used as evidence by itself. */
  context: Record<string, unknown>;
};

/** What the trader has filled in so far — live from the autopsy, or read back from a saved review. */
export type TagInputs = {
  mistake: string;
  mistakeOther?: string;
  mistakeNote?: string;
  lesson?: string;
  followedPlan?: boolean | null;
  feeling?: string;
  goodProcess?: boolean | null;
  blunder?: number | null;
  /** A category the trader chose by hand for a written-in mistake. */
  pickedCategory?: MistakeKey;
};

/**
 * Caps exist only to stop a runaway payload — NOT to shorten what the trader wrote. A trader's real explanation is often a
 * long paragraph, and the first version cut every field at 500 characters, so the part that named the mistake could be lost.
 */
export const LIMITS = { source: 4000, fact: 240, sources: 30, facts: 24, bundle: 60000 } as const;

const clean = (s?: string | null) => (typeof s === "string" ? s.replace(/\s+/g, " ").trim() : "");
const cut = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + "…" : s);
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const toMin = (t?: string | null) => { const m = t?.match(/^(\d{1,2}):(\d{2})$/); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
const num = (n: unknown): n is number => typeof n === "number" && Number.isFinite(n);

/** Reads a saved trade back into inputs (for re-checking older trades). */
export function inputsFromEntry(e: JournalEntry): TagInputs {
  const r = e.review, f = r?.followUp;
  return {
    mistake: f?.mistake ?? "",
    mistakeOther: f?.mistakeOther,
    mistakeNote: f?.mistakeNote,
    lesson: f?.biggestMistake ?? e.reflection?.lesson,
    followedPlan: r?.outcome?.followedPlan ?? null,
    feeling: r?.psychology?.emotionAfter,
    goodProcess: r?.outcome?.processVerdict === "a-plus" ? true : r?.outcome?.processVerdict === "process-failure" ? false : null,
    blunder: f?.blunderLevel ?? null,
    // A category the trader chose or confirmed by hand must survive any re-check.
    pickedCategory: ((): MistakeKey | undefined => { const own = f?.tags?.find((t) => (t.source === "you" || t.confirmed) && t.primary); const k = own?.key ?? (f?.mistakeCategorySource === "you" ? f.mistakeCategory : undefined); return k && isMistakeKey(k) && k !== "other" ? k : undefined; })(),
  };
}

export function buildBundle(e: JournalEntry, entries: JournalEntry[], plans: TradePlan[], inputs: TagInputs): TagBundle {
  const r = e.review, refl = e.reflection, plan = planOf(e, plans);

  /* ---- sources: every field the trader wrote, in order of how directly it names a mistake ---- */
  const sources: TagSource[] = [];
  const taken = new Set<string>();
  const add = (role: SourceRole, label: string, text?: string | null) => {
    const t = cut(clean(text), LIMITS.source);
    if (!t) return;
    const n = norm(t);
    if (!n || taken.has(n)) return; // the same sentence saved in two places (lesson / biggestMistake) counts once
    taken.add(n);
    sources.push({ id: `s${sources.length + 1}`, role, label, text: t });
  };
  if (inputs.mistake === "other") add("mistake-name", "Mistake, in the trader's own words", inputs.mistakeOther);
  if (inputs.mistake !== "none") add("mistake-detail", "What went wrong, and what led to it", inputs.mistakeNote);
  add("went-poorly", "What didn't go well", refl?.wentPoorly);
  add("cause", "What caused it", refl?.cause);
  add("deviation", "Deviations from the plan", r?.plannedVsActual?.deviations);
  add("cause", "Concept misunderstood", r?.followUp?.conceptMisunderstood);
  add("post-loss", "Thoughts right after the loss", r?.postLossGate?.immediateThoughts);
  add("post-loss", "What the trader meant to do next", r?.postLossGate?.intendedNextAction);
  add("psych-note", "Psychology notes", r?.psychology?.notes);
  add("psych-note", "Outcome notes", r?.outcome?.notes);
  add("lesson", "Lesson to carry forward", inputs.lesson);
  add("improve", "What to improve", r?.concepts?.improve);
  add("lesson", "What was learned", r?.concepts?.learned);
  add("watch-next", "What to watch next", r?.followUp?.watchNext);
  add("lesson", "Reflection lesson", refl?.lesson);
  add("went-well", "What went well", refl?.wentWell);
  add("note", "Trade notes", e.notes);

  // Everything else the trader typed on this trade. Nothing here is dropped: weak roles only carry less weight in the rules,
  // while the AI is told each field's label and reads every word.
  const ex = r?.execution;
  add("cause", "Why the stop was moved", ex?.movedStopReason);
  add("cause", "Why the trade was exited early", ex?.exitedEarlyReason);
  add("note", "Why the trade was entered", ex?.whyEntered);
  add("deviation", "Planned vs actual notes", r?.plannedVsActual?.notes);
  add("note", "Strongest evidence for the trade", r?.followUp?.strongestEvidence);
  add("note", "Concept applied", r?.followUp?.conceptApplied);
  add("note", "Review insight", r?.compareInsight);
  add("note", "Liquidity swept", r?.setup?.liquiditySwept);
  add("note", "Sweep time", r?.setup?.sweepTimestamp);
  add("note", "SMT evidence", r?.setup?.smtEvidence);
  add("note", "Target description", r?.setup?.targetDescription);
  add("note", "Manipulation identified", r?.setup?.manipulationIdentified);
  add("note", "Plan: thesis", plan?.thesis);
  add("note", "Plan: what could break it", plan?.whatCouldBreakPlan);
  add("note", "Plan: feeling before", plan?.emotionalNote);
  add("note", "Plan: must happen before entry", plan?.mustHappenBeforeEntry);
  add("note", "Plan: invalidation", plan?.invalidation);
  add("psych-note", "Feeling before the trade", r?.psychology?.emotionBefore);
  sources.splice(LIMITS.sources);

  /* ---- facts: measured, not claimed ---- */
  const facts: TagFact[] = [];
  const fact = (code: string, text: string, objective: boolean, key?: MistakeKey) => { facts.push({ id: `f${facts.length + 1}`, code, text: cut(text, LIMITS.fact), objective, key }); };
  const draft: JournalEntry = { ...e, review: { ...r, followUp: { ...r?.followUp, mistake: inputs.mistake || r?.followUp?.mistake, mistakeOther: inputs.mistakeOther, mistakeNote: inputs.mistakeNote }, outcome: { ...r?.outcome, followedPlan: inputs.followedPlan ?? r?.outcome?.followedPlan ?? null } } };
  for (const s of auditSignals(draft, entries, plans)) if (s.objective) fact(s.code, s.text, true, s.key);

  const pre = e.preTradeChecklist ?? [];
  const open = pre.filter((i) => !i.confirmed);
  if (pre.length > 0 && open.length > 0) fact("rules-unconfirmed", `Entered with ${open.length} of ${pre.length} pre-trade rules unconfirmed: ${open.map((i) => `"${cut(i.label, 40)}"`).slice(0, 3).join(", ")}.`, true);

  const entry = e.entryPrice, stop = e.stopLoss, tp = e.takeProfit, exit = e.exitPrice;
  if (num(entry) && num(stop) && stop !== entry) {
    const risk = Math.abs(entry - stop);
    if (num(tp) && tp !== entry) fact("planned-rr", `Planned: risk ${round(risk)} pts, target ${round(Math.abs(tp - entry))} pts (${round(Math.abs(tp - entry) / risk)}R).`, true);
    else fact("planned-risk", `Planned risk ${round(risk)} pts.`, true);
    if (num(exit)) {
      const dir = e.direction === "short" ? -1 : 1;
      const got = ((exit - entry) * dir) / risk;
      fact("realised-r", `Realised ${round(got)}R (exit ${exit}).`, true);
      if (num(tp) && tp !== entry && got > 0) { const reach = (((exit - entry) * dir) / ((tp - entry) * dir)) * 100; if (reach < 95) fact("target-reached", `Exited at ${Math.round(reach)}% of the way to the planned target.`, true); }
    }
  }
  if (e.holdDuration) fact("hold", `Held ${e.holdDuration}.`, true);

  // The trader's own yes/no answers in the review. These are CLAIMS (objective = false): they inform the AI and can be quoted,
  // but they never vote on their own.
  const yn = (code: string, v: boolean | null | undefined, yes: string, no: string) => { if (v === true) fact(code, yes, false); else if (v === false && no) fact(code, no, false); };
  const ex2 = r?.execution;
  yn("ans-chased", ex2?.chased, "Trader answered: I chased this entry.", "");
  yn("ans-moved-stop", ex2?.movedStop, "Trader answered: I moved my stop.", "");
  yn("ans-exited-early", ex2?.exitedEarly, "Trader answered: I exited early.", "");
  yn("ans-planned", ex2?.planned, "", "Trader answered: this trade was not planned.");
  yn("ans-time", ex2?.correctTime, "", "Trader answered: I traded outside the right time.");
  yn("ans-stop", ex2?.followedStop, "", "Trader answered: I did not follow my stop.");
  if (r?.psychology?.convictionOrUrgency === "urgency") fact("ans-urgency", "Trader answered: the entry felt like urgency, not conviction.", false);
  if (refl?.followedSetup === false) fact("ans-setup", "Trader answered: I did not follow my setup.", false);
  if (refl?.followedRisk === false) fact("ans-risk", "Trader answered: I did not follow my risk rules.", false);

  /* ---- context for the model (never evidence by itself) ---- */
  const day = dayTrades(e.date, entries);
  const idx = day.findIndex((t) => t.id === e.id);
  const prev = idx > 0 ? day[idx - 1] : undefined;
  const context: Record<string, unknown> = {
    result: e.pnl > 0 ? "win" : e.pnl < 0 ? "loss" : "flat",
    direction: e.direction ?? undefined, instrument: e.instrument, setup: e.setup || undefined, rr: e.rr ?? undefined,
    entryTime: e.entryTime, exitTime: e.exitTime, size: e.quantity ?? undefined,
    tradeOfDay: idx >= 0 ? idx + 1 : undefined, previousTradeToday: prev ? (prev.pnl > 0 ? "win" : prev.pnl < 0 ? "loss" : "flat") : undefined,
    minutesSincePrevious: prev && toMin(e.entryTime) != null && toMin(prev.exitTime ?? prev.entryTime) != null ? toMin(e.entryTime)! - toMin(prev.exitTime ?? prev.entryTime)! : undefined,
    plan: plan ? {
      thesis: cut(clean(plan.thesis), 200) || undefined, bias: plan.bias, feelingBefore: plan.emotionalState, feelingNote: cut(clean(plan.emotionalNote), 120) || undefined,
      news: (plan.newsEvents ?? []).map((n) => `${n.name} ${n.time ?? ""}`.trim()), dayLossLimit: plan.maxLoss, pledgedToWatch: plan.watchMistakes,
      mightBreakPlan: cut(clean(plan.whatCouldBreakPlan), 120) || undefined,
    } : undefined,
  };
  for (const k of Object.keys(context)) if (context[k] === undefined) delete context[k];

  /* ---- what the trader selected ---- */
  const f = r?.psychology;
  const flags = [f?.fomo && "fomo", f?.revenge && "revenge", f?.fearExit && "fear-exit", f?.makeItBack && "make-it-back"].filter(Boolean) as string[];
  const declared: TagDeclared = {
    mistake: inputs.mistake, mistakeKey: isMistakeKey(inputs.mistake) && inputs.mistake !== "other" ? inputs.mistake : undefined,
    pickedCategory: inputs.pickedCategory && isMistakeKey(inputs.pickedCategory) ? inputs.pickedCategory : undefined,
    followedPlan: inputs.followedPlan ?? null, feeling: inputs.feeling || undefined, goodProcess: inputs.goodProcess ?? null, blunder: inputs.blunder ?? null, flags,
  };
  facts.splice(LIMITS.facts);
  return { v: 1, declared, sources, facts, context };
}

const round = (n: number) => Math.round(n * 100) / 100;

/** True when there is any trader-written text worth reading. Without it only measured facts can speak. */
export const hasWords = (b: TagBundle) => b.sources.some((s) => s.role !== "went-well" && s.role !== "note");

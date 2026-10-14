"use client";

/**
 * Autopsy — four quick questions, revealed one at a time.
 *
 *   1. Did you follow your plan?          (Yes / No)
 *   2. How did it feel?                   (chips — a few up front, the rest behind "More…")
 *   3. Good process, whatever the P&L?    (Yes / No)
 *   4. One lesson to carry forward        (optional, one sentence)
 *
 * IMPORTANT: everything here reads the LIVE trade from the store (by id), never
 * a copy captured earlier. Screenshots attached a moment ago are therefore always
 * seen, so the review is never wrongly marked "incomplete".
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { JournalEntry, TradeReviewData } from "@/lib/types";
import { formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { MORE_FEELINGS, PRIMARY_FEELINGS, feelingFromReview, feelingOf, type FeelingKey } from "@/lib/feelings";
import { MISTAKE_CATEGORIES, categoryOf, isMistakeKey, type MistakeKey } from "@/lib/mistakes";
import { tagTrade, type Decision, type TagInputs } from "@/lib/tagging";
import { TagPanel } from "./tag-panel";
import { dayRisk } from "@/lib/risk";
import { auditLabel, auditTrade, isPresetKey, type Audit } from "@/lib/audit";
import { BinaryChoice, Chip, FLOW_FADE, IconCheck, Label, PrimaryButton, Reveal, Segmented, Stagger, TextBlock, TextBox } from "./flow-ui";
import { RiskMeter } from "./risk-meter";

type Emotion = FeelingKey | "";
/** The bucket this mistake is filed under, and who decided: a quick-pick, the AI, the local fallback, or the trader. */
type Category = { key: MistakeKey; source: "preset" | "ai" | "rules" | "you"; confidence: number; /** Offered by the tagger but not filed: waiting for the trader. */ suggested?: boolean };

const MISTAKES: { key: string; label: string }[] = [
  { key: "none", label: "No mistake" },
  { key: "early", label: "Entered early" },
  { key: "chased", label: "Chased price" },
  { key: "stop", label: "Moved stop" },
  { key: "size", label: "Oversized" },
  { key: "plan", label: "Broke plan" },
  { key: "revenge", label: "Revenge trade" },
  { key: "overtrade", label: "Overtraded" },
  { key: "other", label: "Others" },
];

type Blunder = 0 | 1 | 2 | 3;
const BLUNDER_LEVELS: { level: 1 | 2 | 3; label: string; noun: string; caption: string; tone: string; bar: string }[] = [
  { level: 1, label: "Slip", noun: "slip", caption: "A small deviation with little cost.", tone: "text-gold", bar: "bg-gold" },
  { level: 2, label: "Costly", noun: "costly error", caption: "A rule was broken and it hurt.", tone: "text-loss", bar: "bg-loss/80" },
  { level: 3, label: "Blunder", noun: "blunder", caption: "A serious breach of your process.", tone: "text-loss", bar: "bg-loss" },
];

export function useAutopsy(entryId: string | null, active: boolean, fallback?: JournalEntry | null) {
  const live = useApp((s) => (entryId ? s.entries.find((e) => e.id === entryId) : undefined));
  const currency = useApp((s) => s.settings.currency);
  const entry = live ?? fallback ?? null;
  const entryRef = useRef(entry);
  entryRef.current = entry;
  // The day's loss limit against the day as it really went. Live, so it includes the trade that was just saved.
  const allEntries = useApp((s) => s.entries);
  const plans = useApp((s) => s.plans);
  const risk = useMemo(() => (entry ? dayRisk(entry.date, allEntries, plans) : null), [entry, allEntries, plans]);

  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  const [emotion, setEmotion] = useState<Emotion>("");
  const [goodProcess, setGoodProcess] = useState<boolean | null>(null);
  const [lesson, setLesson] = useState("");
  const [mistake, setMistake] = useState("");
  const [blunder, setBlunder] = useState<Blunder | null>(null);
  const [mistakeNote, setMistakeNote] = useState("");
  /** Custom mistake name, written by the trader when they pick "Others". */
  const [mistakeOther, setMistakeOther] = useState("");
  /** True once the trader has confirmed their custom mistake text. */
  const [otherDone, setOtherDone] = useState(false);
  /** Which answered step is being re-opened from its summary pill. */
  const [editing, setEditing] = useState<"mistake" | "blunder" | "category" | null>(null);
  /** Filing of the mistake into the shared categories. Written-in mistakes ("Others") are sorted by AI in the background. */
  const [category, setCategory] = useState<Category | null>(null);
  const [sorting, setSorting] = useState(false);
  /** What the tagger concluded from EVERYTHING written so far (see lib/tagging). Filed tags and open suggestions. */
  const [tagging, setTagging] = useState<Decision | null>(null);
  const [tagsReviewed, setTagsReviewed] = useState(false);
  const tagCache = useRef<{ hash: string; promise: Promise<Decision | null> } | null>(null);
  const categoryRef = useRef<Category | null>(null);
  categoryRef.current = category;
  const sortRun = useRef(0);
  const sortedText = useRef("");
  /** The audit's independent read of the whole trade. Runs once when the review opens; the saved copy is re-run with the answers. */
  const [audit, setAudit] = useState<Audit | null>(null);
  const [auditDismissed, setAuditDismissed] = useState(false);
  const auditedFor = useRef<string | null>(null);
  useEffect(() => { if (!active) { auditedFor.current = null; setAudit(null); setAuditDismissed(false); } }, [active]);
  useEffect(() => {
    if (!active || !entryId || auditedFor.current === entryId) return;
    const e = entryRef.current; if (!e) return;
    auditedFor.current = entryId;
    const st = useApp.getState();
    void auditTrade(e, st.entries, st.plans).then((a) => { if (auditedFor.current === entryId) setAudit(a); });
  }, [active, entryId]);
  /** The just-tapped option, shown selected for a beat before its step folds away. */
  const [pending, setPending] = useState<{ kind: "mistake" | "blunder"; value: string } | null>(null);
  const settleTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(settleTimer.current), []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from an existing (in-progress) review when the autopsy becomes active.
  // Hydrate once per session so answers survive going Back and Continue again.
  const hydratedFor = useRef<string | null>(null);
  useEffect(() => { if (!active) hydratedFor.current = null; }, [active]);
  useEffect(() => {
    if (!active || !entryId) return;
    if (hydratedFor.current === entryId) return;
    hydratedFor.current = entryId;
    const e = entryRef.current;
    const r = e?.review;
    setFollowedPlan(r?.outcome?.followedPlan ?? null);
    setEmotion(feelingFromReview(r?.psychology));
    setGoodProcess(r?.outcome?.processVerdict === "a-plus" ? true : r?.outcome?.processVerdict === "process-failure" ? false : null);
    setLesson(r?.followUp?.biggestMistake ?? e?.reflection?.lesson ?? "");
    setMistake(r?.followUp?.mistake ?? "");
    setBlunder(r?.followUp?.blunderLevel ?? null);
    setMistakeNote(r?.followUp?.mistakeNote ?? "");
    setMistakeOther(r?.followUp?.mistakeOther ?? "");
    setOtherDone(r?.followUp?.mistake === "other" && !!r?.followUp?.mistakeOther?.trim());
    const savedKey = r?.followUp?.mistakeCategory;
    setCategory(savedKey && isMistakeKey(savedKey) ? { key: savedKey, source: r?.followUp?.mistakeCategorySource ?? "preset", confidence: r?.followUp?.mistakeCategoryConfidence ?? 1 } : null);
    sortedText.current = r?.followUp?.mistakeOther?.trim() ?? "";
    setTagging(r?.followUp?.tagging ? { tags: r.followUp.tags ?? [], tagging: r.followUp.tagging } : null);
    setTagsReviewed(!!r?.followUp?.tagging?.reviewed);
    tagCache.current = null;
    sortRun.current++; setSorting(false);
    setEditing(null);
    setPending(null);
    setError(null);
  }, [active, entryId]);

  const settle = (kind: "mistake" | "blunder", value: string, apply: () => void) => {
    setPending({ kind, value });
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { apply(); setEditing(null); setPending(null); }, 240);
  };
  /** Everything the trader has filled in so far, as the tagger wants it. A category picked by hand is passed as final. */
  const inputsNow = (): TagInputs => ({
    mistake, mistakeOther: mistakeOther.trim() || undefined, mistakeNote: mistakeNote.trim() || undefined, lesson: lesson.trim() || undefined,
    followedPlan, feeling: emotion || undefined, goodProcess, blunder,
    pickedCategory: categoryRef.current?.source === "you" ? categoryRef.current.key : undefined,
  });
  /** Reads ALL the trader's words + the trade's data. Never blocks: offline rules answer if AI is slow or off. Cached per exact input. */
  const runTagging = (inp: TagInputs, timeoutMs = 50_000): Promise<Decision | null> => {
    const e = entryRef.current;
    if (!e || inp.mistake === "" || inp.mistake === "none") return Promise.resolve(null);
    const hash = JSON.stringify(inp);
    if (tagCache.current?.hash === hash) return tagCache.current.promise;
    const id = ++sortRun.current;
    setSorting(true);
    const st = useApp.getState();
    const promise = tagTrade(e, st.entries, st.plans, inp, timeoutMs)
      .then((d): Decision => { if (id === sortRun.current) setTagging({ tags: d.tags, tagging: d.tagging }); return { tags: d.tags, tagging: d.tagging }; })
      .finally(() => { if (id === sortRun.current) setSorting(false); });
    tagCache.current = { hash, promise };
    return promise;
  };
  // Live: re-read a moment after the trader stops typing, so the tags are ready before they press Complete.
  const liveKey = JSON.stringify([mistake, mistakeOther.trim(), mistakeNote.trim(), lesson.trim(), followedPlan, emotion, goodProcess, blunder, category?.source === "you" ? category.key : null]);
  useEffect(() => {
    if (!active || !entryId) return;
    if (mistake === "" || mistake === "none") { setTagging(null); return; }
    if (mistake === "other" && !otherDone) return;
    if (mistakeNote.trim().length < 12 && lesson.trim().length < 8 && mistake !== "other") return;
    const t = window.setTimeout(() => void runTagging(inputsNow()), 1100);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveKey, active, entryId, otherDone]);
  const chooseCategory = (key: MistakeKey) => {
    sortRun.current++; // an answer still in flight must not overwrite the trader's choice
    setSorting(false);
    setCategory({ key, source: "you", confidence: 1 });
    setEditing(null);
  };
  const chooseMistake = (m: string) => {
    // "Others" needs a typed answer first, so it stays open instead of folding away.
    if (m === "other") {
      setMistake("other");
      setOtherDone(false);
      if (category?.source === "preset") { setCategory(null); sortedText.current = ""; }
      setEditing("mistake");
      if (blunder === 0) setBlunder(null);
      return;
    }
    settleMistake(m);
  };
  const confirmOther = () => {
    const text = mistakeOther.trim();
    if (!text) return;
    setOtherDone(true);
    setEditing(null);
    if (sortedText.current !== text) { // new or changed words: a manual choice about OLD words no longer applies; the tagger re-reads on its own
      sortedText.current = text;
      setCategory(null);
    }
  };
  const settleMistake = (m: string) => settle("mistake", m, () => {
    setMistake(m);
    sortRun.current++; setSorting(false);
    setCategory(m !== "none" && isMistakeKey(m) ? { key: m, source: "preset", confidence: 1 } : null);
    if (m === "none") setBlunder(0);
    else if (blunder === 0) setBlunder(null);
  });
  /** One tap: take the audit's finding as the mistake of the day (quick-picks file under themselves, others go to "Others"). */
  const acceptAudit = () => {
    if (!audit || audit.key === "none") return;
    setAuditDismissed(true);
    if (isPresetKey(audit.key)) { settleMistake(audit.key); return; }
    sortRun.current++; setSorting(false);
    setMistake("other"); setMistakeOther(auditLabel(audit)); setOtherDone(true); sortedText.current = auditLabel(audit);
    setCategory({ key: audit.key, source: "you", confidence: 1 });
    if (blunder === 0) setBlunder(null);
    setEditing(null);
  };
  const chooseBlunder = (v: Blunder) => settle("blunder", String(v), () => setBlunder(v));
  const otherOk = mistake !== "other" || (mistakeOther.trim().length > 0 && otherDone);
  const blunderDone = mistake === "none" || blunder !== null;
  const ready = followedPlan !== null && emotion !== "" && goodProcess !== null && mistake !== "" && otherOk && blunderDone && (mistake === "none" || mistakeNote.trim().length > 0) && lesson.trim().length > 0;
  const hint =
    followedPlan === null ? "Did you follow your plan?"
    : emotion === "" ? "Pick how it felt"
    : goodProcess === null ? "Was the process good?"
    : mistake === "" ? "Choose the mistake of the day"
    : !otherOk ? (mistakeOther.trim().length === 0 ? "Name the mistake" : "Press Continue")
    : !blunderDone ? "Set the blunder level"
    : mistake !== "none" && mistakeNote.trim().length === 0 ? "Describe the mistake"
    : lesson.trim().length === 0 ? "Write one lesson to finish"
    : null;
  const hasChart = (entry?.images.length ?? 0) > 0;

  /** Saves the review. Resolves true on success; failures are reported inline via `error`. */
  const submit = async (): Promise<boolean> => {
    // Read the trade again at the moment of saving — screenshots may have just been attached.
    const current = (entryId ? useApp.getState().entries.find((e) => e.id === entryId) : undefined) ?? entryRef.current;
    if (!current || !ready) return false;
    setSaving(true);
    setError(null);
    try {
      // File the mistake. The tagger reads everything written and decides: the trader's own pick is final; otherwise a tag is only
      // FILED when independent voters agree. Anything less stays a suggestion and is NOT guessed into the Journal.
      let cat: Category | null = null;
      let decision: Decision | null = null;
      if (mistake !== "none") {
        // Complete never hangs: if the AI is still thinking after 35 s the trade is saved and "Re-read my notes" can finish the job later.
        decision = await Promise.race([runTagging(inputsNow()), new Promise<null>((res) => window.setTimeout(() => res(null), 35_000))]);
        const prim = decision?.tags.find((t) => t.primary) ?? decision?.tags[0];
        if (prim && isMistakeKey(prim.key)) cat = { key: prim.key, source: prim.source, confidence: prim.support };
        else if (mistake !== "other" && isMistakeKey(mistake)) cat = { key: mistake, source: "preset", confidence: 1 };
      }
      // Re-reviewing a trade that already has tags: if the AI could not file anything this time, keep what was filed before
      // instead of wiping it. (When the AI DOES answer, its tags replace the old ones: the new review is read together with
      // everything written earlier, so the tags are updated, not stacked.)
      const prior = current.review;
      const keepOld = mistake !== "none" && !decision?.tags.length && !!prior?.followUp?.tags?.length;
      if (keepOld && !cat && prior?.followUp?.mistakeCategory && isMistakeKey(prior.followUp.mistakeCategory)) cat = { key: prior.followUp.mistakeCategory, source: (prior.followUp.mistakeCategorySource ?? "ai") as Category["source"], confidence: prior.followUp.mistakeCategoryConfidence ?? 0.6 };
      const feel = feelingOf(emotion);
      const preTrade = current.preTradeChecklist ?? [];
      const preAllConfirmed = preTrade.length === 0 || preTrade.every((i) => i.confirmed);
      const review: TradeReviewData = {
        // Everything already written on this trade (why it was entered, setup notes, planned-vs-actual…) is kept; this review adds to it.
        ...prior,
        checklist: current.checklist,
        execution: { ...prior?.execution, followedStop: followedPlan },
        psychology: {
          ...prior?.psychology,
          emotionAfter: emotion || undefined,
          convictionOrUrgency: feel?.drive ?? "",
          fomo: emotion === "fomo",
          revenge: emotion === "revenge",
          fearExit: emotion === "fear",
        },
        outcome: {
          ...prior?.outcome,
          followedPlan,
          goodTradeDespiteLoss: current.pnl < 0 ? goodProcess : null,
          badTradeDespiteWin: current.pnl > 0 ? goodProcess === false : null,
          processVerdict: goodProcess === true ? "a-plus" : goodProcess === false ? "process-failure" : "",
        },
        followUp: { ...prior?.followUp, biggestMistake: lesson.trim(), mistake, mistakeNote: mistake === "none" ? undefined : mistakeNote.trim() || undefined, mistakeOther: mistake === "other" ? mistakeOther.trim() || undefined : undefined, mistakeCategory: mistake === "none" ? undefined : cat?.key, mistakeCategorySource: mistake === "none" ? undefined : cat?.source, mistakeCategoryConfidence: mistake === "none" || !cat ? undefined : cat.confidence, tags: mistake === "none" ? undefined : decision?.tags.length ? decision.tags : keepOld ? prior?.followUp?.tags : undefined, tagging: mistake === "none" ? undefined : decision ? { ...decision.tagging, reviewed: tagsReviewed || (decision.tagging.suggestions.length === 0 && !decision.tagging.conflict) } : keepOld ? prior?.followUp?.tagging : undefined, blunderLevel: mistake === "none" ? 0 : (blunder ?? undefined) },
        reviewedAt: Date.now(),
      };
      // Final audit with the trader's answers included, so a generous "No mistake" is checked against the facts.
      const st = useApp.getState();
      const au = await auditTrade({ ...current, review }, st.entries, st.plans, 6000);
      review.followUp = { ...review.followUp, audit: { key: au.key, confidence: au.confidence, reason: au.reason, objective: au.objective, source: au.source, flags: au.flags, at: Date.now() } };
      await useApp.getState().saveTradeReview(current.id, {
        review,
        reflection: {
          // Keep what the trader wrote in earlier reviews (went well / went poorly / cause): the tagger reads those too.
          ...current.reflection,
          lesson: lesson.trim() || undefined,
          followedSetup: preAllConfirmed ? true : followedPlan,
          followedRisk: followedPlan,
          updatedAt: Date.now(),
        },
        reviewStatus: current.images.length > 0 ? "reviewed" : "incomplete",
      });
      haptic.success();
      return true;
    } catch {
      haptic.error();
      setError("Couldn't save — try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Trader taps a suggestion (or "Use X" on a mis-tap warning): it becomes their own pick, and the tagger re-reads with it as final. */
  const pickTag = (key: string) => {
    if (!isMistakeKey(key)) return;
    sortRun.current++; setSorting(false); setTagsReviewed(false);
    if (mistake === "other") setCategory({ key, source: "you", confidence: 1 }); // their own words stay; only the filing changes
    else if (isPresetKey(key)) { setMistake(key); setCategory({ key, source: "preset", confidence: 1 }); } // a mis-tapped quick-pick becomes the right quick-pick
    else { const name = categoryOf(key)?.label ?? key; setMistake("other"); setMistakeOther(name); setOtherDone(true); sortedText.current = name; setCategory({ key, source: "you", confidence: 1 }); }
    if (blunder === 0) setBlunder(null);
    setEditing(null);
  };
  const dismissTags = () => setTagsReviewed(true);
  // What the Category row shows: the trader's own pick, else what the tagger filed, else what it is only suggesting.
  const prim = tagging?.tags.find((t) => t.primary) ?? tagging?.tags[0];
  const sug = tagging?.tagging.suggestions[0];
  const shownCategory: Category | null = category ?? (prim && isMistakeKey(prim.key) ? { key: prim.key, source: prim.source, confidence: prim.support } : sug && isMistakeKey(sug.key) ? { key: sug.key, source: "ai", confidence: sug.support, suggested: true } : null);
  const tagView = tagging && tagsReviewed ? { ...tagging, tagging: { ...tagging.tagging, reviewed: true } } : tagging;
  return { tagging: tagView, tagBusy: sorting, pickTag, dismissTags, tagsReviewed, audit, auditDismissed, dismissAudit: () => setAuditDismissed(true), acceptAudit, risk, category: shownCategory, sorting, chooseCategory, entry, currency, followedPlan, setFollowedPlan, emotion, setEmotion, goodProcess, setGoodProcess, lesson, setLesson, mistake, chooseMistake, blunder, chooseBlunder, mistakeNote, setMistakeNote, mistakeOther, setMistakeOther, confirmOther, editing, setEditing, pending, hint, ready, hasChart, saving, error, submit, blunderDone };
}

export type AutopsyState = ReturnType<typeof useAutopsy>;

/**
 * Answered steps fold away; their answers live in an iOS "inset grouped" list (Apple HIG: lists and tables).
 * Each row is a "right detail" row — colored icon tile, title, value, disclosure chevron — and tapping it
 * re-opens that step so a mis-tap is never permanent.
 */
function AnswerRow({ icon, tile, title, value, valueClass, onClick, label }: { icon: React.ReactNode; tile: string; title: string; value: string; valueClass?: string; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={() => { haptic.selection(); onClick(); }}
      className="relative flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.07] after:absolute after:bottom-0 after:left-[3.25rem] after:right-0 after:h-px after:bg-line-soft last:after:hidden"
    >
      <span className={cn("grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]", tile)}>{icon}</span>
      <span className="min-w-0 flex-1 truncate text-[16px] text-ink">{title}</span>
      <span className={cn("min-w-0 max-w-[55%] shrink-0 truncate text-[16px] text-muted", valueClass)}>{value}</span>
      <svg viewBox="0 0 24 24" className="h-[15px] w-[15px] shrink-0 text-faint" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
    </button>
  );
}

const glyph = "h-[17px] w-[17px]";
const GlyphWarning = () => (
  <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 4.5 3.8 18.8a1 1 0 0 0 .9 1.5h14.6a1 1 0 0 0 .9-1.5L12 4.5Z" /><path d="M12 10v4.2M12 17.3v.1" /></svg>
);
const GlyphBars = () => (
  <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><path d="M6 19v-4M12 19V9.5M18 19V5" /></svg>
);
const GlyphSpark = () => (
  <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m11 3.5 1.7 5 5 1.7-5 1.7L11 17l-1.7-5.1-5-1.7 5-1.7zM19 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" /></svg>
);
const GlyphCheck = () => (
  <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

function AnswerList({ a }: { a: AutopsyState }) {
  const m = MISTAKES.find((x) => x.key === a.mistake);
  const l = a.blunder ? BLUNDER_LEVELS[a.blunder - 1] : null;
  if (!m) return null;
  const mLabel = a.mistake === "other" && a.mistakeOther.trim() ? a.mistakeOther.trim() : m.label;
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-raised">
      <AnswerRow
        label={`Mistake: ${mLabel}. Change`}
        icon={a.mistake === "none" ? <GlyphCheck /> : <GlyphWarning />}
        tile={a.mistake === "none" ? "bg-profit" : "bg-gold-strong"}
        title="Mistake"
        value={mLabel}
        onClick={() => a.setEditing("mistake")}
      />
      {a.mistake === "other" && (a.category || a.sorting) && (
        <AnswerRow
          label={`Category: ${a.sorting && !a.category ? "sorting" : categoryOf(a.category?.key)?.label}. Change`}
          icon={<span className={cn(a.sorting && !a.category && "animate-pulse")}><GlyphSpark /></span>}
          tile="bg-[#5e5ce6]"
          title={a.category?.suggested ? "Category · suggested" : a.category?.source === "ai" ? "Category · AI" : "Category"}
          value={a.sorting && !a.category ? "Sorting…" : categoryOf(a.category?.key)?.label ?? "—"}
          onClick={() => a.setEditing("category")}
        />
      )}
      {l && a.mistake !== "none" && (
        <AnswerRow
          label={`Blunder level: ${l.label}. Change`}
          icon={<GlyphBars />}
          tile={l.bar}
          title="Blunder level"
          value={l.label}
          valueClass={l.tone}
          onClick={() => a.setEditing("blunder")}
        />
      )}
    </div>
  );
}

export function AutopsyBody({ a, onAddChart }: { a: AutopsyState; onAddChart?: () => void }) {
  const [moreFeelings, setMoreFeelings] = useState(false);
  const entry = a.entry;
  if (!entry) return null;
  const preTrade = entry.preTradeChecklist ?? [];
  const confirmed = preTrade.filter((i) => i.confirmed).length;

  // Which step is on screen. Answered steps fold away; "editing" re-opens one from its summary pill.
  const noMistake = a.mistake === "none";
  const hasMistake = a.mistake !== "" && !noMistake;
  const otherOpen = a.mistake === "other" && (a.mistakeOther.trim().length === 0 || a.editing === "mistake");
  const askMistake = a.goodProcess !== null && (a.mistake === "" || a.editing === "mistake" || otherOpen);
  const askBlunder = hasMistake && a.editing !== "mistake" && (a.blunder === null || a.editing === "blunder");
  const askNote = hasMistake && a.blunder !== null && a.editing === null;
  const askLesson = a.editing === null && (noMistake || (hasMistake && a.blunder !== null && (a.mistakeNote.trim().length > 0 || a.lesson.trim().length > 0)));
  const shownMistake = a.pending?.kind === "mistake" ? a.pending.value : a.mistake;
  const shownBlunder = a.pending?.kind === "blunder" ? a.pending.value : a.blunder ? String(a.blunder) : "";
  const noun = a.blunder ? BLUNDER_LEVELS[a.blunder - 1]!.noun : "mistake";

  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[.16em] text-gold">
        {weekdayLong(entry.date)} · {formatSignedMoney(entry.pnl, a.currency)} · {entry.instrument}
      </p>
      <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[32px]">Quick autopsy</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
        <span>Five short questions.</span>
        {/* Reflects the trade as it is stored right now — updates the moment a chart is attached. */}
        <span className={cn("inline-flex items-center gap-1.5", a.hasChart ? "text-profit" : "text-faint")}>
          <span className={cn("grid h-4 w-4 place-items-center rounded-full", a.hasChart ? "bg-profit/15" : "border border-line-strong")}>{a.hasChart && <IconCheck className="h-2.5 w-2.5" />}</span>
          {a.hasChart ? "Chart attached" : "No chart yet"}
          {!a.hasChart && onAddChart && <button type="button" onClick={onAddChart} className="font-medium text-gold hover:underline">Add</button>}
        </span>
        {preTrade.length > 0 && <span>{confirmed}/{preTrade.length} rules confirmed</span>}
      </div>
      {/* The day's loss limit against what actually happened — shown before the questions so the answers are given with the numbers in view. */}
      {a.risk && <div className="mt-5"><RiskMeter risk={a.risk} currency={a.currency} compact /></div>}

      <div>
        <Reveal>
          <Label done={a.followedPlan !== null}>Did you follow your plan?</Label>
          <div className="mt-3"><BinaryChoice value={a.followedPlan} onChange={a.setFollowedPlan} options={["Yes", "No"]} /></div>
        </Reveal>

        <AnimatePresence initial={false}>
          {a.followedPlan !== null && (
            <Reveal key="feel">
              <Label done={a.emotion !== ""}>How did it feel?</Label>
              {/* Same pattern as the plan: a few up front, the rest behind "More…" (and open if the answer lives there). */}
              <Stagger className="mt-3 flex flex-wrap gap-2" delay={0.05}>
                {PRIMARY_FEELINGS.map((f) => <Chip key={f.key} selected={a.emotion === f.key} onClick={() => a.setEmotion(a.emotion === f.key ? "" : f.key)}>{f.label}</Chip>)}
                {(moreFeelings || MORE_FEELINGS.some((f) => f.key === a.emotion)) && MORE_FEELINGS.map((f) => <Chip key={f.key} selected={a.emotion === f.key} onClick={() => a.setEmotion(a.emotion === f.key ? "" : f.key)}>{f.label}</Chip>)}
                {!moreFeelings && !MORE_FEELINGS.some((f) => f.key === a.emotion) && <Chip selected={false} onClick={() => setMoreFeelings(true)}>More…</Chip>}
              </Stagger>
            </Reveal>
          )}

          {a.emotion !== "" && (
            <Reveal key="process">
              <Label done={a.goodProcess !== null}>Good process, whatever the P&amp;L?</Label>
              <div className="mt-3"><BinaryChoice value={a.goodProcess} onChange={a.setGoodProcess} options={["Yes", "Not really"]} /></div>
            </Reveal>
          )}

          {/* 4 — Mistake of the day: one tap, then it folds away. */}
          {askMistake && (
            <Reveal key="mistake">
              <AnimatePresence initial={false}>
                {a.audit && a.audit.key !== "none" && !a.auditDismissed && (a.mistake === "" || a.mistake === "none") && (
                  <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={FLOW_FADE} className="mb-4 flex items-start gap-3 rounded-2xl bg-[#5e5ce6]/[0.09] p-3.5 ring-1 ring-inset ring-[#5e5ce6]/20">
                    <span className="mt-0.5 grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[9px] bg-[#5e5ce6] text-white"><GlyphSpark /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink">{a.audit.objective ? "Spotted from your data" : "AI noticed"} · {auditLabel(a.audit)}</p>
                      <p className="mt-0.5 text-[13.5px] leading-snug text-muted">{a.audit.reason}</p>
                      <div className="mt-2.5 flex items-center gap-4 text-[13.5px] font-medium">
                        <button type="button" onClick={a.acceptAudit} className="text-[#5e5ce6] hover:underline dark:text-[#9d9bff]">Use this</button>
                        <button type="button" onClick={a.dismissAudit} className="text-faint hover:text-ink">Not a mistake</button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <Label hint="the main error in this trade">Mistake of the day</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {MISTAKES.map((m) => <Chip key={m.key} tone={m.key === "none" ? "profit" : "gold"} selected={shownMistake === m.key} onClick={() => a.chooseMistake(m.key)}>{m.label}</Chip>)}
              </div>
            </Reveal>
          )}

          {/* 4b — "Others": the trader names the mistake in their own words. Same Reveal as every other step. */}
          {askMistake && a.mistake === "other" && (
            <Reveal key="other" focus>
              <Label done={a.mistakeOther.trim().length > 0 && a.editing === null} htmlFor="autopsy-other">What was the mistake?</Label>
              <div className="mt-3">
                <TextBox
                  id="autopsy-other"
                  maxLength={60}
                  value={a.mistakeOther}
                  onChange={(e) => a.setMistakeOther(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); a.confirmOther(); } }}
                  placeholder="Name it in a few words — e.g. Ignored news."
                  enterKeyHint="done"
                />
              </div>
              <div className="mt-3">
                <PrimaryButton disabled={a.mistakeOther.trim().length === 0} onClick={a.confirmOther}>Continue</PrimaryButton>
              </div>
            </Reveal>
          )}

          {/* 4c — Category: the AI's filing of a written-in mistake. Tap its row to change it; one tap and it folds away. */}
          {a.editing === "category" && (
            <Reveal key="category">
              <Label hint="how this mistake is filed in your journal">Pick a category</Label>
              <Stagger className="mt-3 flex flex-wrap gap-2" delay={0.03}>
                {MISTAKE_CATEGORIES.filter((c) => c.key !== "other").concat(MISTAKE_CATEGORIES.filter((c) => c.key === "other")).map((c) => <Chip key={c.key} selected={a.category?.key === c.key} onClick={() => a.chooseCategory(c.key)}>{c.label}</Chip>)}
              </Stagger>
              <p className="mt-3 min-h-5 text-[13px] text-faint">{categoryOf(a.category?.key)?.hint}</p>
            </Reveal>
          )}

          {/* 5 — Blunder level: one tap, then it folds away. */}
          {askBlunder && (
            <Reveal key="blunder">
              <Label>Blunder level</Label>
              <div className="mt-3">
                <Segmented fullWidth value={shownBlunder} onChange={(id) => a.chooseBlunder(Number(id) as Blunder)} options={BLUNDER_LEVELS.map((l) => ({ id: String(l.level), label: l.label }))} />
              </div>
              <div className="mt-3 flex min-h-5 items-center justify-between gap-4 text-[13px]">
                <AnimatePresence mode="wait" initial={false}>
                  {shownBlunder ? (
                    <motion.p key={shownBlunder} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={FLOW_FADE} className={BLUNDER_LEVELS[Number(shownBlunder) - 1]!.tone}>
                      {BLUNDER_LEVELS[Number(shownBlunder) - 1]!.caption}
                    </motion.p>
                  ) : (
                    <motion.p key="none" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FLOW_FADE} className="text-faint">How serious was it?</motion.p>
                  )}
                </AnimatePresence>
                <div className="flex shrink-0 items-center gap-1" aria-hidden>
                  {BLUNDER_LEVELS.map((l) => (
                    <span key={l.level} className={cn("h-1.5 w-6 rounded-full transition-colors duration-300", Number(shownBlunder) >= l.level ? BLUNDER_LEVELS[Number(shownBlunder) - 1]!.bar : "bg-line-strong")} />
                  ))}
                </div>
              </div>
            </Reveal>
          )}

          {/* 6 — What exactly went wrong: stays on screen. Written for your future self. */}
          {askNote && (
            <Reveal key="note" focus>
              <AnswerList a={a} />
              <Label done={a.mistakeNote.trim().length > 0} htmlFor="autopsy-note">{a.mistake === "other" ? `What happened, and what led to this ${noun}?` : `What was the mistake that led to this ${noun}?`}</Label>
              <div className="mt-3"><TextBlock id="autopsy-note" maxLength={400} value={a.mistakeNote} onChange={(e) => a.setMistakeNote(e.target.value)} placeholder="Be specific — you'll read this months from now." /></div>
            </Reveal>
          )}

          {/* 7 — Lesson: the last question. */}
          {askLesson && (
            <Reveal key="lesson">
              {noMistake && <AnswerList a={a} />}
              <Label done={a.lesson.trim().length > 0} htmlFor="autopsy-lesson">One lesson to carry forward</Label>
              <div className="mt-3"><TextBlock id="autopsy-lesson" maxLength={280} value={a.lesson} onChange={(e) => a.setLesson(e.target.value)} placeholder="One sentence is plenty." /></div>
            </Reveal>
          )}

          {/* 8 — Tags: what the tagger read in everything above, and why. Informational; never blocks Complete. */}
          {askLesson && !noMistake && a.lesson.trim().length > 0 && (a.tagging || a.tagBusy) && (
            <Reveal key="tags">
              <div className="mt-6"><TagPanel view={a.tagging} busy={a.tagBusy} onPick={a.pickTag} onDismiss={a.dismissTags} onOpenPicker={() => a.setEditing("category")} /></div>
            </Reveal>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

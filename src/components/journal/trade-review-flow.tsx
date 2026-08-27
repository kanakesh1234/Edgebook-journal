"use client";

import { useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  checklistItems,
  checklistScore,
  type ChecklistItem,
  type JournalEntry,
  type TradeChecklist,
  type TradeReviewData,
} from "@/lib/types";
import { formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp } from "@/lib/store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { AlertTriangleIcon, CheckIcon, ShieldIcon, SparklesIcon, TargetIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * TradeReviewFlow — the guided post-trade interrogation.
 * Evidence → Setup checklist (6/6 or 7/7) → Setup details → Execution →
 * Psychology → Outcome/process → Complete. Progress saves to the trade;
 * an incomplete review is marked REVIEW INCOMPLETE, never REVIEWED.
 */
export function TradeReviewFlow({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  entry: JournalEntry | null;
  onClose: () => void;
}) {
  const totalSteps = 7;
  const [step, setStep] = useState(0);

  // Checklist state
  const [checklist, setChecklist] = useState<TradeChecklist>({ tradeNumber: 1 });
  // Setup details
  const [liquiditySwept, setLiquiditySwept] = useState("");
  const [sweepTimestamp, setSweepTimestamp] = useState("");
  const [smtEvidence, setSmtEvidence] = useState("");
  const [targetDescription, setTargetDescription] = useState("");
  const [manipulationIdentified, setManipulationIdentified] = useState("");
  // Execution
  const [whyEntered, setWhyEntered] = useState("");
  const [planned, setPlanned] = useState<boolean | null>(null);
  const [correctTime, setCorrectTime] = useState<boolean | null>(null);
  const [followedStop, setFollowedStop] = useState<boolean | null>(null);
  const [movedStop, setMovedStop] = useState<boolean | null>(null);
  const [movedStopReason, setMovedStopReason] = useState("");
  const [exitedEarly, setExitedEarly] = useState<boolean | null>(null);
  const [exitedEarlyReason, setExitedEarlyReason] = useState("");
  const [chased, setChased] = useState<boolean | null>(null);
  // Psychology
  const [emotionBefore, setEmotionBefore] = useState("");
  const [convictionOrUrgency, setConvictionOrUrgency] = useState<"conviction" | "urgency" | "">("");
  const [fomo, setFomo] = useState<boolean | null>(null);
  const [revenge, setRevenge] = useState<boolean | null>(null);
  const [fearExit, setFearExit] = useState<boolean | null>(null);
  const [makeItBack, setMakeItBack] = useState<boolean | null>(null);
  const [psychNotes, setPsychNotes] = useState("");
  // Concepts
  const CONCEPT_SUGGESTIONS = ["Liquidity Sweep", "SMT", "PD Array", "Displacement", "Market Structure", "Fair Value Gap", "Breaker Block", "Optimal Trade Entry"];
  const [conceptsUsed, setConceptsUsed] = useState<string[]>([]);
  const [conceptLearned, setConceptLearned] = useState("");
  const [conceptImprove, setConceptImprove] = useState("");
  // Outcome
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  const [goodTradeDespiteLoss, setGoodTradeDespiteLoss] = useState<boolean | null>(null);
  const [badTradeDespiteWin, setBadTradeDespiteWin] = useState<boolean | null>(null);
  const [processNotes, setProcessNotes] = useState("");
  const [wentWell, setWentWell] = useState("");
  const [wentPoorly, setWentPoorly] = useState("");
  const [cause, setCause] = useState("");
  const [lesson, setLesson] = useState("");
  const [followedSetup, setFollowedSetup] = useState<boolean | null>(null);
  const [followedRisk, setFollowedRisk] = useState<boolean | null>(null);
  const [strongestEvidence, setStrongestEvidence] = useState("");
  const [biggestMistake, setBiggestMistake] = useState("");
  const [conceptApplied, setConceptApplied] = useState("");
  const [conceptMisunderstood, setConceptMisunderstood] = useState("");
  const [watchNext, setWatchNext] = useState("");
  const [saving, setSaving] = useState(false);

  // Hydrate from the entry (existing review data or legacy reflection)
  useEffect(() => {
    if (!open || !entry) return;
    const r = entry.review;
    setChecklist(entry.checklist ?? { tradeNumber: entry.tradeNumber ?? 1 });
    setLiquiditySwept(r?.setup?.liquiditySwept ?? "");
    setSweepTimestamp(r?.setup?.sweepTimestamp ?? "");
    setSmtEvidence(r?.setup?.smtEvidence ?? "");
    setTargetDescription(r?.setup?.targetDescription ?? "");
    setManipulationIdentified(r?.setup?.manipulationIdentified ?? "");
    setWhyEntered(r?.execution?.whyEntered ?? "");
    setPlanned(r?.execution?.planned ?? null);
    setCorrectTime(r?.execution?.correctTime ?? null);
    setFollowedStop(r?.execution?.followedStop ?? null);
    setMovedStop(r?.execution?.movedStop ?? null);
    setMovedStopReason(r?.execution?.movedStopReason ?? "");
    setExitedEarly(r?.execution?.exitedEarly ?? null);
    setExitedEarlyReason(r?.execution?.exitedEarlyReason ?? "");
    setChased(r?.execution?.chased ?? null);
    setEmotionBefore(r?.psychology?.emotionBefore ?? "");
    setConvictionOrUrgency(r?.psychology?.convictionOrUrgency ?? "");
    setFomo(r?.psychology?.fomo ?? null);
    setRevenge(r?.psychology?.revenge ?? null);
    setFearExit(r?.psychology?.fearExit ?? null);
    setMakeItBack(r?.psychology?.makeItBack ?? null);
    setPsychNotes(r?.psychology?.notes ?? "");
    setFollowedPlan(r?.outcome?.followedPlan ?? null);
    setGoodTradeDespiteLoss(r?.outcome?.goodTradeDespiteLoss ?? null);
    setBadTradeDespiteWin(r?.outcome?.badTradeDespiteWin ?? null);
    setProcessNotes(r?.outcome?.notes ?? "");
    setConceptsUsed(entry.review?.concepts?.used ?? []);
    setConceptLearned(entry.review?.concepts?.learned ?? "");
    setConceptImprove(entry.review?.concepts?.improve ?? "");
    setStrongestEvidence(entry.review?.followUp?.strongestEvidence ?? "");
    setBiggestMistake(entry.review?.followUp?.biggestMistake ?? "");
    setConceptApplied(entry.review?.followUp?.conceptApplied ?? "");
    setConceptMisunderstood(entry.review?.followUp?.conceptMisunderstood ?? "");
    setWatchNext(entry.review?.followUp?.watchNext ?? "");
    const legacy = entry.reflection;
    setWentWell(legacy?.wentWell ?? "");
    setWentPoorly(legacy?.wentPoorly ?? "");
    setCause(legacy?.cause ?? "");
    setLesson(legacy?.lesson ?? "");
    setFollowedSetup(legacy?.followedSetup ?? null);
    setFollowedRisk(legacy?.followedRisk ?? null);
    setStep(0);
  }, [open, entry]);

  const conceptSuggestions = ["Liquidity Sweep", "SMT", "PD Array", "Displacement", "Market Structure", "Fair Value Gap", "Breaker Block", "Optimal Trade Entry"];
  // Pre-trade checklist is READ-ONLY evidence: canonical source first, legacy fallback.
  const preTradeItems: { label: string; description?: string; confirmed: boolean }[] = useMemo(() => {
    if (entry?.preTradeChecklist?.length) return entry.preTradeChecklist;
    if (entry?.checklist) {
      return checklistItems(entry.checklist).map(({ label, item }) => ({
        label,
        confirmed: item.answer === true,
        description: undefined,
      }));
    }
    return [];
  }, [entry?.preTradeChecklist, entry?.checklist]);
  const stepLabels = ["Pre-trade", "Setup", "Execution", "Psychology", "Concepts", "Outcome", "Complete"];
  const preScore = {
    confirmed: preTradeItems.filter((i) => i.confirmed).length,
    required: preTradeItems.length,
  };

  if (!entry) return null;

  const canContinue = () => true;

  const save = async (status: "reviewed" | "in_progress" | "incomplete") => {
    setSaving(true);
    try {
      const review: TradeReviewData = {
        setup: {
          liquiditySwept: liquiditySwept.trim() || undefined,
          sweepTimestamp: sweepTimestamp.trim() || undefined,
          smtEvidence: smtEvidence.trim() || undefined,
          targetDescription: targetDescription.trim() || undefined,
          manipulationIdentified: manipulationIdentified.trim() || undefined,
        },
        checklist: entry.checklist,
        execution: {
          whyEntered: whyEntered.trim() || undefined,
          planned,
          correctTime,
          followedStop,
          movedStop,
          movedStopReason: movedStopReason.trim() || undefined,
          exitedEarly,
          exitedEarlyReason: exitedEarlyReason.trim() || undefined,
          chased,
        },
        psychology: {
          emotionBefore: emotionBefore.trim() || undefined,
          convictionOrUrgency,
          fomo,
          revenge,
          fearExit,
          makeItBack,
          notes: psychNotes.trim() || undefined,
        },
        concepts: {
          used: conceptsUsed,
          learned: conceptLearned.trim() || undefined,
          improve: conceptImprove.trim() || undefined,
        },
        followUp: {
          strongestEvidence: strongestEvidence.trim() || undefined,
          biggestMistake: biggestMistake.trim() || undefined,
          conceptApplied: conceptApplied.trim() || undefined,
          conceptMisunderstood: conceptMisunderstood.trim() || undefined,
          watchNext: watchNext.trim() || undefined,
        },
        outcome: {
          followedPlan,
          goodTradeDespiteLoss,
          badTradeDespiteWin,
          processVerdict:
            badTradeDespiteWin === true
              ? "process-failure"
              : goodTradeDespiteLoss === true || (followedPlan === true && (preScore.required === 0 || preScore.confirmed === preScore.required))
                ? "a-plus"
                : followedPlan === false
                  ? "process-failure"
                  : "process-success",
          notes: processNotes.trim() || undefined,
        },
        reviewedAt: status === "reviewed" ? Date.now() : entry.review?.reviewedAt,
      };
      const reflection = {
        wentWell: wentWell.trim() || undefined,
        wentPoorly: wentPoorly.trim() || undefined,
        cause: cause.trim() || undefined,
        followedSetup: followedSetup ?? (preScore.required === 0 || preScore.confirmed === preScore.required ? true : null),
        followedRisk: followedRisk ?? (movedStop === false && exitedEarly === false ? true : movedStop === true || exitedEarly === true ? false : null),
        lesson: lesson.trim() || undefined,
        updatedAt: Date.now(),
      };
      await useApp.getState().saveTradeReview(entry.id, { review, reflection, reviewStatus: status });
      toast.success(
        status === "reviewed" ? "Review complete" : "Review progress saved",
        status === "reviewed" ? "Process noted — outcome is just data." : "Finish it from the trade review anytime.",
      );
      onClose();
    } catch {
      toast.error("Could not save the review", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" label="Trade review">
      <div className="px-6 py-6 sm:px-8">
        {/* Header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-gold">
              {weekdayLong(entry.date)} · {formatSignedMoney(entry.pnl)} · {entry.instrument}
            </p>
            <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-ink">
              Trade Review
            </h2>
          </div>
          <div className="flex items-center gap-1.5 pt-1.5" aria-hidden>
            {stepLabels.map((label, i) => (
              <span
                key={label}
                title={label}
                className={cn(
                  "h-1.5 rounded-full transition-all duration-300",
                  i === step ? "w-5 bg-gold" : i < step ? "w-1.5 bg-profit/60" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>
        </div>

        {/* Step body */}
        <div className="mt-6 min-h-[220px]">
          <AnimatePresence mode="wait" initial={false}>
            {/* STEP 0 — pre-trade checklist: READ-ONLY historical evidence.
                The canonical execution checklist is completed BEFORE the trade
                in the Plan Trade flow and must never look post-trade here. */}
            {step === 0 && (
              <StepShell key="pretrade" title="Pre-trade checklist" subtitle="Captured before the trade was recorded — historical evidence, not editable.">
                {preTradeItems.length > 0 ? (
                  <div className="space-y-2">
                    {preTradeItems.map((item, i) => (
                      <div key={i} className={cn(
                        "flex w-full items-start gap-3 rounded-xl border px-4 py-2.5",
                        item.confirmed ? "border-profit/30 bg-profit/[0.05]" : "border-loss/25 bg-loss/[0.04]",
                      )}>
                        <span className={cn(
                          "mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-md border",
                          item.confirmed ? "border-profit/50 bg-profit/[0.12] text-profit" : "border-loss/40 bg-loss/[0.08] text-loss",
                        )}>{item.confirmed ? "✓" : "✗"}</span>
                        <span className="min-w-0">
                          <span className="block text-[13px] text-ink">{item.label}</span>
                          {item.description && <span className="mt-0.5 block text-xs leading-relaxed text-muted">{item.description}</span>}
                        </span>
                        <span className={cn("ml-auto shrink-0 self-center text-[10px] font-bold uppercase tracking-wide", item.confirmed ? "text-profit" : "text-loss")}>
                          {item.confirmed ? "confirmed" : "not confirmed"}
                        </span>
                      </div>
                    ))}
                    <p className="pt-1 text-[11px] text-faint">
                      {preTradeItems.filter((i) => i.confirmed).length}/{preTradeItems.length} conditions were confirmed before entry.
                    </p>
                  </div>
                ) : (
                  <p className="rounded-control border border-dashed border-line-strong px-4 py-8 text-center text-sm text-muted">
                    No pre-trade checklist was captured for this trade. Use the Plan Trade flow to record
                    the execution gate before entering future trades.
                  </p>
                )}
              </StepShell>
            )}

            {/* STEP 1 — setup details */}
            {step === 1 && (
              <StepShell key="setup" title="Setup details" subtitle="What did the market show you?">
                <div className="space-y-4">
                  <TextInput aria-label="What liquidity was swept?" placeholder="What liquidity was swept?" value={liquiditySwept} onChange={(e) => setLiquiditySwept(e.target.value)} />
                  <TextInput aria-label="Sweep timestamp" placeholder="Sweep timestamp (e.g. 9:41 AM)" value={sweepTimestamp} onChange={(e) => setSweepTimestamp(e.target.value)} />
                  <LabeledArea label="Manipulation identified" placeholder="Clear institutional manipulation after the sweep…" value={manipulationIdentified} onChange={setManipulationIdentified} />
                  <TextInput aria-label="SMT evidence" placeholder="SMT evidence / correlated asset" value={smtEvidence} onChange={(e) => setSmtEvidence(e.target.value)} />
                  <TextInput aria-label="Target description" placeholder="Draw on liquidity / target" value={targetDescription} onChange={(e) => setTargetDescription(e.target.value)} />
                  <LabeledArea label="What went well?" placeholder="Name it, so you can repeat it." value={wentWell} onChange={setWentWell} />
                  <LabeledArea label="What didn't go well?" placeholder="Be specific — the tape forgives nothing." value={wentPoorly} onChange={setWentPoorly} />
                  <LabeledArea label="What caused this?" placeholder="The trigger behind the result." value={cause} onChange={setCause} />
                </div>
              </StepShell>
            )}

            {/* STEP 2 — execution */}
            {step === 2 && (
              <StepShell key="execution" title="Execution review" subtitle="How the trade was actually taken.">
                <div className="space-y-4">
                  <LabeledArea label="Why did you enter?" placeholder="The honest reason." value={whyEntered} onChange={setWhyEntered} />
                  <YesNoRow label="Was the entry planned?" value={planned} onChange={setPlanned} />
                  <YesNoRow label="Did you enter at the correct time?" value={correctTime} onChange={setCorrectTime} />
                  <YesNoRow label="Did you follow your stop?" value={followedStop} onChange={setFollowedStop} />
                  <YesNoRow label="Did you move the stop?" value={movedStop} onChange={(v) => { setMovedStop(v); }}>
                    {movedStop === true && typeof movedStop === "boolean" && (
                      <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} role="alert" className="mt-2 rounded-lg border border-gold/40 bg-gold/[0.07] px-3.5 py-2.5">
                        <p className="flex items-start gap-2 text-[12.5px] leading-relaxed text-ink">
                          <AlertTriangleIcon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
                          <span>
                            Do not move SL or close prematurely due to fear or a breakeven itch. Can you
                            defend this SL to a senior trader in one sentence? Hold to the plan unless a
                            genuine market structure change occurs.
                          </span>
                        </p>
                        <TextInput
                          aria-label="Reason for moving the stop"
                          placeholder="Explain the reason — it will be saved in the review."
                          className="mt-2"
                          value={movedStopReason ?? ""}
                          onChange={(e) => setMovedStopReason(e.target.value)}
                        />
                      </motion.div>
                    )}
                  </YesNoRow>
                  <YesNoRow label="Did you exit early?" value={exitedEarly} onChange={(v) => { setExitedEarly(v); }}>
                    {exitedEarly === true && typeof exitedEarly === "boolean" && (
                      <TextInput
                        aria-label="Reason for exiting early"
                        placeholder="Explain — saved in the review."
                        className="mt-2"
                        value={exitedEarlyReason}
                        onChange={(e) => setExitedEarlyReason(e.target.value)}
                      />
                    )}
                  </YesNoRow>
                  <YesNoRow label="Did you chase the trade?" value={chased} onChange={setChased} />
                </div>
              </StepShell>
            )}

            {/* STEP 3 — psychology */}
            {step === 3 && (
              <StepShell key="psychology" title="Psychology review" subtitle="Conviction or urgency? Be honest — this journal is private.">
                <div className="space-y-4">
                  <Field label="What were you feeling immediately before entry?" htmlFor="tr-emotion">
                    <TextInput id="tr-emotion" placeholder="e.g. calm, anxious, eager…" value={emotionBefore} onChange={(e) => setEmotionBefore(e.target.value)} />
                  </Field>
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-4 py-3">
                    <span className="text-[13px] text-muted">Acting from…</span>
                    <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas/60 p-1">
                      {(["conviction", "urgency"] as const).map((v) => (
                        <button
                          key={v}
                          type="button"
                          aria-pressed={convictionOrUrgency === v}
                          onClick={() => setConvictionOrUrgency(convictionOrUrgency === v ? "" : v)}
                          className={cn(
                            "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                            convictionOrUrgency === v ? "bg-gold/[0.14] text-gold" : "text-faint hover:text-muted",
                          )}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>
                  <YesNoRow label="Did FOMO influence the entry?" value={fomo} onChange={setFomo} />
                  <YesNoRow label="Did revenge influence the entry?" value={revenge} onChange={setRevenge} />
                  <YesNoRow label="Did fear influence the exit?" value={fearExit} onChange={setFearExit} />
                  <YesNoRow label="Did you feel the need to make money back?" value={makeItBack} onChange={setMakeItBack} />
                  <LabeledArea label="Psychology notes" placeholder="Anything else worth recording…" value={psychNotes} onChange={setPsychNotes} />
                </div>
              </StepShell>
            )}

            {/* STEP 4 — concepts */}
            {step === 4 && (
              <StepShell key="concepts" title="Concepts used" subtitle="Tag what you used, learned, and what needs work — this becomes MINATO data.">
                <div className="space-y-4">
                  <div>
                    <p className="text-[13px] text-muted">Concepts applied in this trade:</p>
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      {conceptSuggestions.concat(conceptsUsed.filter((c) => !conceptSuggestions.includes(c))).map((c) => {
                        const on = conceptsUsed.includes(c);
                        return (
                          <button
                            key={c}
                            type="button"
                            aria-pressed={on}
                            onClick={() => setConceptsUsed(on ? conceptsUsed.filter((x) => x !== c) : [...conceptsUsed, c])}
                            className={cn(
                              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                              on ? "border-gold/50 bg-gold/[0.1] text-gold" : "border-line bg-raised/60 text-faint hover:text-muted",
                            )}
                          >
                            {c}
                          </button>
                        );
                      })}
                    </div>
                    <TextInput
                      aria-label="Add custom concept"
                      placeholder="Add a custom concept and press Enter…"
                      className="mt-2"
                      onKeyDown={(e) => {
                        const el = e.currentTarget;
                        if (e.key === "Enter" && el.value.trim()) {
                          e.preventDefault();
                          const v = el.value.trim();
                          if (!conceptsUsed.includes(v)) setConceptsUsed([...conceptsUsed, v]);
                          el.value = "";
                        }
                      }}
                    />
                  </div>
                  <Field label="New concept learned" hint="optional" htmlFor="tr-concept-learned">
                    <TextInput id="tr-concept-learned" placeholder="What clicked for the first time?" value={conceptLearned} onChange={(e) => setConceptLearned(e.target.value)} />
                  </Field>
                  <Field label="Concept to improve" hint="optional" htmlFor="tr-concept-improve">
                    <TextInput id="tr-concept-improve" placeholder="What needs more study?" value={conceptImprove} onChange={(e) => setConceptImprove(e.target.value)} />
                  </Field>
                </div>
              </StepShell>
            )}

            {/* STEP 5 — outcome / process */}
            {step === 5 && (
              <StepShell key="outcome" title="Outcome vs process" subtitle="A winning trade can be a process failure. A losing trade can be a process success.">
                <div className="space-y-4">
                  <div className={cn(
                    "rounded-xl border p-4",
                    entry.pnl > 0 ? "border-profit/30 bg-profit/[0.06]" : entry.pnl < 0 ? "border-loss/30 bg-loss/[0.06]" : "border-line bg-raised/60",
                  )}>
                    <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Outcome</p>
                    <p className={cn("kpi mt-1 text-3xl", entry.pnl > 0 ? "text-profit" : entry.pnl < 0 ? "text-loss" : "text-ink")}>
                      {formatSignedMoney(entry.pnl)}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {entry.pnl > 0 ? "Win" : entry.pnl < 0 ? "Loss" : "Breakeven"} · {entry.rr != null ? `${entry.rr}R` : "R not tracked"}
                    </p>
                  </div>
                  <YesNoRow label="Did the result follow the plan?" value={followedPlan} onChange={setFollowedPlan} />
                  <YesNoRow label="Was this a good trade even though it lost?" value={goodTradeDespiteLoss} onChange={setGoodTradeDespiteLoss} />
                  <YesNoRow label="Was this a bad trade even though it won?" value={badTradeDespiteWin} onChange={setBadTradeDespiteWin} />
                  <LabeledArea label="Process notes" placeholder="What does the process say, regardless of P&L?" value={processNotes} onChange={setProcessNotes} />
                  <LabeledArea label="What will you do differently next session?" placeholder="One sentence is enough." value={lesson} onChange={setLesson} />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <YesNoRow label="Setup rules followed?" value={followedSetup} onChange={setFollowedSetup} />
                    <YesNoRow label="Risk rules followed?" value={followedRisk} onChange={setFollowedRisk} />
                  </div>
                  <LabeledArea label="What was the strongest evidence for the entry?" placeholder="The exact thing that justified the trade." value={strongestEvidence} onChange={setStrongestEvidence} />
                  <LabeledArea label="What was the biggest mistake?" placeholder="If any — be specific." value={biggestMistake} onChange={setBiggestMistake} />
                  <LabeledArea label="What concept did you apply correctly?" placeholder="Name it." value={conceptApplied} onChange={setConceptApplied} />
                  <LabeledArea label="What concept did you misunderstand?" placeholder="Name it — this becomes a study target." value={conceptMisunderstood} onChange={setConceptMisunderstood} />
                  <LabeledArea label="What should you watch for next session?" placeholder="One concrete thing." value={watchNext} onChange={setWatchNext} />
                </div>
              </StepShell>
            )}

            {/* STEP 6 — complete */}
            {step === 6 && (
              <StepShell key="complete" title="Complete review" subtitle="Check the summary and finish. Screenshots are required for a full review.">
                <div className="space-y-3 text-sm">
                  <SummaryRow label="Pre-trade checklist" value={preScore.required > 0 ? `${preScore.confirmed} / ${preScore.required} confirmed` : "Not captured"} tone={preScore.required === 0 || preScore.confirmed === preScore.required ? "text-profit" : "text-gold"} />
                  <SummaryRow label="Setup details" value={liquiditySwept || smtEvidence || manipulationIdentified ? "Recorded" : "Not provided"} />
                  <SummaryRow label="Execution" value={planned != null || whyEntered ? "Recorded" : "Not provided"} />
                  <SummaryRow label="Psychology" value={emotionBefore || fomo != null ? "Recorded" : "Not provided"} />
                  <SummaryRow label="Outcome assessment" value={followedPlan != null ? "Recorded" : "Not provided"} />
                  <SummaryRow label="Concepts" value={conceptsUsed.length > 0 ? conceptsUsed.join(", ") : "Not tagged"} />
                  <SummaryRow label="Screenshots" value={entry.images.length > 0 ? `${entry.images.length} attached` : "None — review will be marked INCOMPLETE"} tone={entry.images.length > 0 ? "text-profit" : "text-loss"} />
                  <div className="rounded-xl border border-line bg-raised/60 p-4">
                    <p className="text-[13px] leading-relaxed text-muted">
                      {preScore.required === 0 || preScore.confirmed === preScore.required
                        ? "Pre-trade conditions satisfied. Process is what compounds — protect it."
                        : "Pre-trade checklist incomplete — this was not an A+ setup. Record it as the lesson it is."}
                    </p>
                  </div>
                </div>
              </StepShell>
            )}
          </AnimatePresence>
        </div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-between border-t border-line pt-4">
          <Button variant="ghost" size="sm" onClick={() => void save("in_progress")} disabled={saving}>
            Save progress
          </Button>
          <div className="flex items-center gap-2.5">
            {step > 0 && (
              <Button variant="subtle" size="sm" onClick={() => setStep((s) => s - 1)} disabled={saving}>Back</Button>
            )}
            {step < totalSteps - 1 ? (
              <Button variant="gold" size="sm" disabled={!canContinue() || saving} onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            ) : (
              <Button variant="gold" size="sm" onClick={() => void save(entry.images.length > 0 ? "reviewed" : "incomplete")} loading={saving} disabled={saving}>
                <SparklesIcon className="h-4 w-4" />
                Complete review
              </Button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------- pieces -------------------------------- */

function StepShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 24 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -24 }}
      transition={{ duration: 0.25, ease: EASE }}
    >
      <h3 className="font-display text-lg font-semibold tracking-[-0.02em] text-ink">{title}</h3>
      <p className="mt-0.5 text-[13px] text-muted">{subtitle}</p>
      <div className="mt-4">{children}</div>
    </motion.div>
  );
}

function LabeledArea({ label, placeholder, value, onChange }: { label: string; placeholder: string; value: string; onChange: (v: string) => void }) {
  return (
    <Field label={label}>
      <TextArea className="min-h-16" placeholder={placeholder} maxLength={2000} value={value} onChange={(e) => onChange(e.target.value)} />
    </Field>
  );
}

function YesNoRow({ label, value, onChange, children }: { label: string; value: boolean | null; onChange: (v: boolean | null) => void; children?: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-line bg-raised/60 px-4 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="text-[13px] text-muted">{label}</span>
        <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas/60 p-1" role="group" aria-label={label}>
          {([["Yes", true], ["No", false]] as const).map(([l, v]) => (
            <button
              key={l}
              type="button"
              aria-pressed={value === v}
              onClick={() => onChange(value === v ? null : v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                value === v
                  ? v ? "bg-profit/[0.14] text-profit" : "bg-loss/[0.12] text-loss"
                  : "text-faint hover:text-muted",
              )}
            >
              {l}
            </button>
          ))}
        </div>
      </div>
      {children}
    </div>
  );
}

function ChecklistRow({ label, item, onChange }: { label: string; item: ChecklistItem; onChange: (next: ChecklistItem) => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-4 py-2.5">
      <span className="flex items-center gap-2 text-[13px] text-ink">
        <span
          className={cn(
            "grid h-5 w-5 place-items-center rounded-full border text-[10px]",
            item.answer === true ? "border-profit bg-profit/[0.12] text-profit" : item.answer === false ? "border-loss bg-loss/[0.1] text-loss" : "border-line-strong text-faint",
          )}
          aria-hidden
        >
          {item.answer === true ? "✓" : item.answer === false ? "✗" : "·"}
        </span>
        {label}
      </span>
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-line bg-canvas/60 p-0.5" role="group" aria-label={label}>
        {([["Yes", true], ["No", false]] as const).map(([l, v]) => (
          <button
            key={l}
            type="button"
            aria-pressed={item.answer === v}
            onClick={() => onChange({ ...item, answer: item.answer === v ? null : v })}
            className={cn(
              "rounded-md px-3 py-1 text-xs font-medium transition-colors",
              item.answer === v
                ? v ? "bg-profit/[0.14] text-profit" : "bg-loss/[0.12] text-loss"
                : "text-faint hover:text-muted",
            )}
          >
            {l}
          </button>
        ))}
      </div>
    </div>
  );
}

function SummaryRow({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-4 py-2.5">
      <span className="text-[13px] text-muted">{label}</span>
      <span className={cn("text-[13px] font-medium", tone ?? "text-ink")}>{value}</span>
    </div>
  );
}

// TargetIcon kept for potential header use
void TargetIcon;

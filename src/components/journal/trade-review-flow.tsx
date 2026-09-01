"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import type { JournalEntry, TradeReviewData } from "@/lib/types";
import { formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Field, TextArea } from "@/components/ui/input";
import { SparklesIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * TradeReviewFlow — the Autopsy.
 *
 * Trimmed to 5 essential questions on a single screen. Pre-trade checklist
 * and screenshots are shown as read-only evidence (captured earlier in the
 * Plan Trade flow) — they are not questions, just context. Answer 5
 * questions, hit Complete, the trade is reviewed.
 *
 * NOTE ON SCORING: `lib/competence.ts` still has a "concept engagement"
 * slice (10% weight) that expects tagged concepts (e.g. "Liquidity Sweep",
 * "SMT"). This trimmed flow no longer collects that, so that slice will
 * stay flat for trades reviewed going forward. Everything else (checklist
 * adherence, risk adherence, plan discipline, review completeness) is
 * still fed by the 5 questions below.
 */

type Emotion = "calm" | "fomo" | "revenge" | "fear" | "";

const EMOTIONS: { key: Emotion; label: string }[] = [
  { key: "calm", label: "Calm" },
  { key: "fomo", label: "FOMO" },
  { key: "revenge", label: "Revenge / Urgency" },
  { key: "fear", label: "Fear / Hesitation" },
];

export function TradeReviewFlow({
  open,
  entry,
  onClose,
}: {
  open: boolean;
  entry: JournalEntry | null;
  onClose: () => void;
}) {
  // Q1
  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  // Q2
  const [emotion, setEmotion] = useState<Emotion>("");
  // Q3
  const [goodProcess, setGoodProcess] = useState<boolean | null>(null);
  // Q4
  const [mistakeOrLesson, setMistakeOrLesson] = useState("");
  // Q5
  const [watchNext, setWatchNext] = useState("");

  const [saving, setSaving] = useState(false);

  // Hydrate from existing review data if reopening an in-progress review.
  useEffect(() => {
    if (!open || !entry) return;
    const r = entry.review;
    setFollowedPlan(r?.outcome?.followedPlan ?? null);
    setEmotion(
      r?.psychology?.fomo ? "fomo"
      : r?.psychology?.revenge ? "revenge"
      : r?.psychology?.fearExit ? "fear"
      : r?.psychology?.convictionOrUrgency === "conviction" ? "calm"
      : "",
    );
    setGoodProcess(
      r?.outcome?.processVerdict === "a-plus" ? true
      : r?.outcome?.processVerdict === "process-failure" ? false
      : null,
    );
    setMistakeOrLesson(r?.followUp?.biggestMistake ?? entry.reflection?.lesson ?? "");
    setWatchNext(r?.followUp?.watchNext ?? "");
  }, [open, entry]);

  if (!entry) return null;

  const preTradeItems = entry.preTradeChecklist ?? [];
  const preScore = {
    confirmed: preTradeItems.filter((i) => i.confirmed).length,
    required: preTradeItems.length,
  };
  const allAnswered = followedPlan !== null && emotion !== "" && goodProcess !== null;

  const save = async () => {
    setSaving(true);
    try {
      const review: TradeReviewData = {
        checklist: entry.checklist,
        execution: {
          followedStop: followedPlan,
        },
        psychology: {
          convictionOrUrgency: emotion === "calm" ? "conviction" : emotion === "fomo" || emotion === "revenge" ? "urgency" : "",
          fomo: emotion === "fomo" ? true : emotion === "" ? null : false,
          revenge: emotion === "revenge" ? true : emotion === "" ? null : false,
          fearExit: emotion === "fear" ? true : emotion === "" ? null : false,
        },
        outcome: {
          followedPlan,
          goodTradeDespiteLoss: entry.pnl < 0 ? goodProcess : null,
          badTradeDespiteWin: entry.pnl > 0 ? goodProcess === false : null,
          processVerdict: goodProcess === true ? "a-plus" : goodProcess === false ? "process-failure" : "",
        },
        followUp: {
          biggestMistake: mistakeOrLesson.trim() || undefined,
          watchNext: watchNext.trim() || undefined,
        },
        reviewedAt: Date.now(),
      };
      const reflection = {
        lesson: mistakeOrLesson.trim() || undefined,
        followedSetup: preScore.required === 0 || preScore.confirmed === preScore.required ? true : followedPlan,
        followedRisk: followedPlan,
        updatedAt: Date.now(),
      };
      await useApp.getState().saveTradeReview(entry.id, {
        review,
        reflection,
        reviewStatus: entry.images.length > 0 ? "reviewed" : "incomplete",
      });
      toast.success("Autopsy complete", "Process noted — outcome is just data.");
      onClose();
      // Bring MINATO in immediately with this trade in focus so the
      // discussion starts right after the autopsy, not on a separate visit.
      useUi.getState().openMinatoWithTrade(entry.id);
    } catch {
      toast.error("Could not save the review", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} size="lg" label="Trade autopsy">
      <div className="px-6 py-6 sm:px-8">
        {/* Header */}
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-gold">
            {weekdayLong(entry.date)} · {formatSignedMoney(entry.pnl)} · {entry.instrument}
          </p>
          <h2 className="mt-1 font-display text-xl font-semibold tracking-[-0.02em] text-ink">Autopsy</h2>
          <p className="mt-0.5 text-[13px] text-muted">5 questions — then it&apos;s done.</p>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, ease: EASE }}
          className="mt-6 space-y-5"
        >
          {/* Read-only evidence, not a question */}
          {preTradeItems.length > 0 && (
            <div className="rounded-xl border border-line bg-raised/60 px-4 py-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-faint">Pre-trade checklist (evidence)</p>
              <p className={cn("mt-1 text-sm font-medium", preScore.confirmed === preScore.required ? "text-profit" : "text-gold")}>
                {preScore.confirmed} / {preScore.required} conditions confirmed before entry
              </p>
            </div>
          )}

          {/* Q1 */}
          <QuestionCard n={1} label="Did you follow your plan — setup rules and stop-loss/risk?">
            <YesNo value={followedPlan} onChange={setFollowedPlan} />
          </QuestionCard>

          {/* Q2 */}
          <QuestionCard n={2} label="What was your emotional state during the trade?">
            <div className="flex flex-wrap gap-1.5">
              {EMOTIONS.map((e) => (
                <button
                  key={e.key}
                  type="button"
                  aria-pressed={emotion === e.key}
                  onClick={() => setEmotion(emotion === e.key ? "" : e.key)}
                  className={cn(
                    "rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors",
                    emotion === e.key ? "border-gold/50 bg-gold/[0.1] text-gold" : "border-line bg-raised/60 text-faint hover:text-muted",
                  )}
                >
                  {e.label}
                </button>
              ))}
            </div>
          </QuestionCard>

          {/* Q3 */}
          <QuestionCard n={3} label="Good process trade, regardless of P&L?">
            <YesNo value={goodProcess} onChange={setGoodProcess} />
          </QuestionCard>

          {/* Q4 */}
          <QuestionCard n={4} label="Biggest mistake or lesson from this trade?">
            <TextArea
              className="min-h-16"
              placeholder="One or two sentences is enough."
              maxLength={500}
              value={mistakeOrLesson}
              onChange={(e) => setMistakeOrLesson(e.target.value)}
            />
          </QuestionCard>

          {/* Q5 */}
          <QuestionCard n={5} label="One thing to watch for / do differently next time?">
            <TextArea
              className="min-h-16"
              placeholder="Be specific — this becomes the next checklist item."
              maxLength={500}
              value={watchNext}
              onChange={(e) => setWatchNext(e.target.value)}
            />
          </QuestionCard>

          {entry.images.length === 0 && (
            <p className="rounded-lg border border-loss/25 bg-loss/[0.07] px-3 py-2.5 text-[13px] text-loss">
              No screenshots attached — this autopsy will be saved as INCOMPLETE. Add screenshots from the trade to mark it fully reviewed.
            </p>
          )}
        </motion.div>

        {/* Footer */}
        <div className="mt-6 flex items-center justify-end border-t border-line pt-4">
          <Button
            variant="gold"
            size="sm"
            onClick={() => void save()}
            loading={saving}
            disabled={saving || !allAnswered}
          >
            <SparklesIcon className="h-4 w-4" />
            Complete autopsy
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/* -------------------------------- pieces -------------------------------- */

function QuestionCard({ n, label, children }: { n: number; label: string; children: React.ReactNode }) {
  return (
    <Field label={`${n}. ${label}`}>
      <div className="mt-1.5">{children}</div>
    </Field>
  );
}

function YesNo({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="grid w-full max-w-[220px] grid-cols-2 gap-1 rounded-lg border border-line bg-canvas/60 p-1" role="group">
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
  );
}

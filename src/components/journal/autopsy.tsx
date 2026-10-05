"use client";

/**
 * Autopsy — four quick questions, revealed one at a time.
 *
 *   1. Did you follow your plan?          (Yes / No)
 *   2. How did it feel?                   (chips)
 *   3. Good process, whatever the P&L?    (Yes / No)
 *   4. One lesson to carry forward        (optional, one sentence)
 *
 * IMPORTANT: everything here reads the LIVE trade from the store (by id), never
 * a copy captured earlier. Screenshots attached a moment ago are therefore always
 * seen, so the review is never wrongly marked "incomplete".
 */
import { useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import type { JournalEntry, TradeReviewData } from "@/lib/types";
import { formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { BinaryChoice, Chip, FLOW_EASE, IconCheck, Label, TextBlock } from "./flow-ui";

type Emotion = "calm" | "fomo" | "revenge" | "fear" | "";

const EMOTIONS: { key: Exclude<Emotion, "">; label: string }[] = [
  { key: "calm", label: "Calm" },
  { key: "fomo", label: "FOMO" },
  { key: "revenge", label: "Urgent" },
  { key: "fear", label: "Hesitant" },
];

export function useAutopsy(entryId: string | null, active: boolean, fallback?: JournalEntry | null) {
  const live = useApp((s) => (entryId ? s.entries.find((e) => e.id === entryId) : undefined));
  const currency = useApp((s) => s.settings.currency);
  const entry = live ?? fallback ?? null;
  const entryRef = useRef(entry);
  entryRef.current = entry;

  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  const [emotion, setEmotion] = useState<Emotion>("");
  const [goodProcess, setGoodProcess] = useState<boolean | null>(null);
  const [lesson, setLesson] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hydrate from an existing (in-progress) review when the autopsy becomes active.
  useEffect(() => {
    if (!active || !entryId) return;
    const e = entryRef.current;
    const r = e?.review;
    setFollowedPlan(r?.outcome?.followedPlan ?? null);
    setEmotion(r?.psychology?.fomo ? "fomo" : r?.psychology?.revenge ? "revenge" : r?.psychology?.fearExit ? "fear" : r?.psychology?.convictionOrUrgency === "conviction" ? "calm" : "");
    setGoodProcess(r?.outcome?.processVerdict === "a-plus" ? true : r?.outcome?.processVerdict === "process-failure" ? false : null);
    setLesson(r?.followUp?.biggestMistake ?? e?.reflection?.lesson ?? "");
    setError(null);
  }, [active, entryId]);

  const ready = followedPlan !== null && emotion !== "" && goodProcess !== null;
  const hasChart = (entry?.images.length ?? 0) > 0;

  /** Saves the review. Resolves true on success; failures are reported inline via `error`. */
  const submit = async (): Promise<boolean> => {
    // Read the trade again at the moment of saving — screenshots may have just been attached.
    const current = (entryId ? useApp.getState().entries.find((e) => e.id === entryId) : undefined) ?? entryRef.current;
    if (!current || !ready) return false;
    setSaving(true);
    setError(null);
    try {
      const preTrade = current.preTradeChecklist ?? [];
      const preAllConfirmed = preTrade.length === 0 || preTrade.every((i) => i.confirmed);
      const review: TradeReviewData = {
        checklist: current.checklist,
        execution: { followedStop: followedPlan },
        psychology: {
          convictionOrUrgency: emotion === "calm" ? "conviction" : emotion === "fomo" || emotion === "revenge" ? "urgency" : "",
          fomo: emotion === "fomo",
          revenge: emotion === "revenge",
          fearExit: emotion === "fear",
        },
        outcome: {
          followedPlan,
          goodTradeDespiteLoss: current.pnl < 0 ? goodProcess : null,
          badTradeDespiteWin: current.pnl > 0 ? goodProcess === false : null,
          processVerdict: goodProcess === true ? "a-plus" : goodProcess === false ? "process-failure" : "",
        },
        followUp: { biggestMistake: lesson.trim() || undefined },
        reviewedAt: Date.now(),
      };
      await useApp.getState().saveTradeReview(current.id, {
        review,
        reflection: {
          lesson: lesson.trim() || undefined,
          followedSetup: preAllConfirmed ? true : followedPlan,
          followedRisk: followedPlan,
          updatedAt: Date.now(),
        },
        reviewStatus: current.images.length > 0 ? "reviewed" : "incomplete",
      });
      return true;
    } catch {
      setError("Couldn't save — try again.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { entry, currency, followedPlan, setFollowedPlan, emotion, setEmotion, goodProcess, setGoodProcess, lesson, setLesson, ready, hasChart, saving, error, submit };
}

export type AutopsyState = ReturnType<typeof useAutopsy>;

function Reveal({ children }: { children: React.ReactNode }) {
  return (
    <motion.section initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: FLOW_EASE }}>
      {children}
    </motion.section>
  );
}

export function AutopsyBody({ a, onAddChart }: { a: AutopsyState; onAddChart?: () => void }) {
  const entry = a.entry;
  if (!entry) return null;
  const preTrade = entry.preTradeChecklist ?? [];
  const confirmed = preTrade.filter((i) => i.confirmed).length;

  return (
    <div>
      <p className="text-[12px] font-semibold uppercase tracking-[.16em] text-gold">
        {weekdayLong(entry.date)} · {formatSignedMoney(entry.pnl, a.currency)} · {entry.instrument}
      </p>
      <h2 className="mt-3 text-[28px] font-semibold leading-[1.1] tracking-[-0.025em] text-ink sm:text-[32px]">Quick autopsy</h2>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[14px] text-muted">
        <span>Four short questions.</span>
        {/* Reflects the trade as it is stored right now — updates the moment a chart is attached. */}
        <span className={cn("inline-flex items-center gap-1.5", a.hasChart ? "text-profit" : "text-faint")}>
          <span className={cn("grid h-4 w-4 place-items-center rounded-full", a.hasChart ? "bg-profit/15" : "border border-line-strong")}>{a.hasChart && <IconCheck className="h-2.5 w-2.5" />}</span>
          {a.hasChart ? "Chart attached" : "No chart yet"}
          {!a.hasChart && onAddChart && <button type="button" onClick={onAddChart} className="font-medium text-gold hover:underline">Add</button>}
        </span>
        {preTrade.length > 0 && <span>{confirmed}/{preTrade.length} rules confirmed</span>}
      </div>

      <div className="mt-8 space-y-8">
        <Reveal>
          <Label done={a.followedPlan !== null}>Did you follow your plan?</Label>
          <div className="mt-3"><BinaryChoice value={a.followedPlan} onChange={a.setFollowedPlan} options={["Yes", "No"]} /></div>
        </Reveal>

        {a.followedPlan !== null && (
          <Reveal>
            <Label done={a.emotion !== ""}>How did it feel?</Label>
            <div className="mt-3 flex flex-wrap gap-2">
              {EMOTIONS.map((e) => <Chip key={e.key} selected={a.emotion === e.key} onClick={() => a.setEmotion(e.key)}>{e.label}</Chip>)}
            </div>
          </Reveal>
        )}

        {a.emotion !== "" && (
          <Reveal>
            <Label done={a.goodProcess !== null}>Good process, whatever the P&amp;L?</Label>
            <div className="mt-3"><BinaryChoice value={a.goodProcess} onChange={a.setGoodProcess} options={["Yes", "Not really"]} /></div>
          </Reveal>
        )}

        {a.goodProcess !== null && (
          <Reveal>
            <Label hint="optional">One lesson to carry forward</Label>
            <div className="mt-3"><TextBlock maxLength={280} value={a.lesson} onChange={(e) => a.setLesson(e.target.value)} placeholder="One sentence is plenty." /></div>
          </Reveal>
        )}
      </div>
    </div>
  );
}

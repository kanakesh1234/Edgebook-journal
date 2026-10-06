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
import { AnimatePresence, motion } from "motion/react";
import type { JournalEntry, TradeReviewData } from "@/lib/types";
import { formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { BinaryChoice, Chip, FLOW_FADE, IconCheck, Label, Reveal, Segmented, TextBlock } from "./flow-ui";

type Emotion = "calm" | "fomo" | "revenge" | "fear" | "";

const EMOTIONS: { key: Exclude<Emotion, "">; label: string }[] = [
  { key: "calm", label: "Calm" },
  { key: "fomo", label: "FOMO" },
  { key: "revenge", label: "Urgent" },
  { key: "fear", label: "Hesitant" },
];

const MISTAKES: { key: string; label: string }[] = [
  { key: "none", label: "No mistake" },
  { key: "early", label: "Entered early" },
  { key: "chased", label: "Chased price" },
  { key: "stop", label: "Moved stop" },
  { key: "size", label: "Oversized" },
  { key: "plan", label: "Broke plan" },
  { key: "revenge", label: "Revenge trade" },
  { key: "overtrade", label: "Overtraded" },
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

  const [followedPlan, setFollowedPlan] = useState<boolean | null>(null);
  const [emotion, setEmotion] = useState<Emotion>("");
  const [goodProcess, setGoodProcess] = useState<boolean | null>(null);
  const [lesson, setLesson] = useState("");
  const [mistake, setMistake] = useState("");
  const [blunder, setBlunder] = useState<Blunder | null>(null);
  const [mistakeNote, setMistakeNote] = useState("");
  /** Which answered step is being re-opened from its summary pill. */
  const [editing, setEditing] = useState<"mistake" | "blunder" | null>(null);
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
    setEmotion(r?.psychology?.fomo ? "fomo" : r?.psychology?.revenge ? "revenge" : r?.psychology?.fearExit ? "fear" : r?.psychology?.convictionOrUrgency === "conviction" ? "calm" : "");
    setGoodProcess(r?.outcome?.processVerdict === "a-plus" ? true : r?.outcome?.processVerdict === "process-failure" ? false : null);
    setLesson(r?.followUp?.biggestMistake ?? e?.reflection?.lesson ?? "");
    setMistake(r?.followUp?.mistake ?? "");
    setBlunder(r?.followUp?.blunderLevel ?? null);
    setMistakeNote(r?.followUp?.mistakeNote ?? "");
    setEditing(null);
    setPending(null);
    setError(null);
  }, [active, entryId]);

  const settle = (kind: "mistake" | "blunder", value: string, apply: () => void) => {
    setPending({ kind, value });
    window.clearTimeout(settleTimer.current);
    settleTimer.current = window.setTimeout(() => { apply(); setEditing(null); setPending(null); }, 240);
  };
  const chooseMistake = (m: string) => settle("mistake", m, () => {
    setMistake(m);
    if (m === "none") setBlunder(0);
    else if (blunder === 0) setBlunder(null);
  });
  const chooseBlunder = (v: Blunder) => settle("blunder", String(v), () => setBlunder(v));
  const blunderDone = mistake === "none" || blunder !== null;
  const ready = followedPlan !== null && emotion !== "" && goodProcess !== null && mistake !== "" && blunderDone && (mistake === "none" || mistakeNote.trim().length > 0) && lesson.trim().length > 0;
  const hint =
    followedPlan === null ? "Did you follow your plan?"
    : emotion === "" ? "Pick how it felt"
    : goodProcess === null ? "Was the process good?"
    : mistake === "" ? "Choose the mistake of the day"
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
        followUp: { biggestMistake: lesson.trim(), mistake, mistakeNote: mistake === "none" ? undefined : mistakeNote.trim() || undefined, blunderLevel: mistake === "none" ? 0 : (blunder ?? undefined) },
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

  return { entry, currency, followedPlan, setFollowedPlan, emotion, setEmotion, goodProcess, setGoodProcess, lesson, setLesson, mistake, chooseMistake, blunder, chooseBlunder, mistakeNote, setMistakeNote, editing, setEditing, pending, hint, ready, hasChart, saving, error, submit, blunderDone };
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
      <span className={cn("shrink-0 text-[16px] text-muted", valueClass)}>{value}</span>
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
const GlyphCheck = () => (
  <svg viewBox="0 0 24 24" className={glyph} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
);

function AnswerList({ a }: { a: AutopsyState }) {
  const m = MISTAKES.find((x) => x.key === a.mistake);
  const l = a.blunder ? BLUNDER_LEVELS[a.blunder - 1] : null;
  if (!m) return null;
  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-line bg-raised">
      <AnswerRow
        label={`Mistake: ${m.label}. Change`}
        icon={a.mistake === "none" ? <GlyphCheck /> : <GlyphWarning />}
        tile={a.mistake === "none" ? "bg-profit" : "bg-gold-strong"}
        title="Mistake"
        value={m.label}
        onClick={() => a.setEditing("mistake")}
      />
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
  const entry = a.entry;
  if (!entry) return null;
  const preTrade = entry.preTradeChecklist ?? [];
  const confirmed = preTrade.filter((i) => i.confirmed).length;

  // Which step is on screen. Answered steps fold away; "editing" re-opens one from its summary pill.
  const noMistake = a.mistake === "none";
  const hasMistake = a.mistake !== "" && !noMistake;
  const askMistake = a.goodProcess !== null && (a.mistake === "" || a.editing === "mistake");
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

      <div>
        <Reveal>
          <Label done={a.followedPlan !== null}>Did you follow your plan?</Label>
          <div className="mt-3"><BinaryChoice value={a.followedPlan} onChange={a.setFollowedPlan} options={["Yes", "No"]} /></div>
        </Reveal>

        <AnimatePresence initial={false}>
          {a.followedPlan !== null && (
            <Reveal key="feel">
              <Label done={a.emotion !== ""}>How did it feel?</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {EMOTIONS.map((e) => <Chip key={e.key} selected={a.emotion === e.key} onClick={() => a.setEmotion(e.key)}>{e.label}</Chip>)}
              </div>
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
              <Label hint="the main error in this trade">Mistake of the day</Label>
              <div className="mt-3 flex flex-wrap gap-2">
                {MISTAKES.map((m) => <Chip key={m.key} tone={m.key === "none" ? "profit" : "gold"} selected={shownMistake === m.key} onClick={() => a.chooseMistake(m.key)}>{m.label}</Chip>)}
              </div>
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
              <Label done={a.mistakeNote.trim().length > 0} htmlFor="autopsy-note">What was the mistake that led to this {noun}?</Label>
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
        </AnimatePresence>
      </div>
    </div>
  );
}

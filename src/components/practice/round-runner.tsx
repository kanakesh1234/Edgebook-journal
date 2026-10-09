"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChartPanel } from "@/components/practice/ChartPanel";
import { RoundSummary } from "@/components/practice/round-summary";
import { MODE_META, ModeBadge, tint } from "@/components/practice/modes";
import { AnswerTile, GateMeter, TimerRing, surface, type TileState } from "@/components/practice/ui";
import { GlassIconButton, IconCheck, IconClose } from "@/components/journal/flow-ui";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/lib/types";
import type { PracticeQuestion } from "@/lib/practice/engine";
import { groupOf } from "@/lib/practice/session";
import { gateFor, nudge, ROUND_SECONDS, targetDifficulty, type ArenaMode, type RoundOutcome } from "@/lib/practice/arena";
import { brief, feedbackDwellMs } from "@/lib/practice/pacing";
import { earnedXp } from "@/lib/practice/xp";
import type { Round } from "@/lib/practice/round";
import { stashUnused } from "@/lib/practice/bank";
import { DuelSound } from "@/lib/practice/math/sound";
import type { RoundExtras } from "@/lib/practice/rewards";
import { haptic } from "@/lib/haptics";
import { CandleVisual } from "@/components/practice/candle-visual";
import { FlameIcon } from "@/components/practice/icons";

export interface AnswerLog {
  fp: string;
  tag: string;
  prompt: string;
  level: number;
  yourAnswer: string;
  correctAnswer: string;
  correct: boolean;
  /** Snapshot, so a missed question can be asked again later. */
  question: PracticeQuestion;
}

export interface RoundResult {
  correct: number;
  total: number;
  xp: number;
  accuracy: number;
  seconds: number;
  /** false when the player left before the clock ran out. */
  completed: boolean;
  correctTags: string[];
  answers: AnswerLog[];
  maxCombo: number;
}

/** What the page hands back when a round ends: the level change plus everything else the round earned. */
export interface RoundReport { outcome: RoundOutcome; extras: RoundExtras }

interface Props {
  title: string;
  mode: ArenaMode;
  level: number;
  round: Round;
  /** Every journal trade, so each question can show its saved screenshots. */
  entries: JournalEntry[];
  /** Called once when the round ends. Returns the level change so the summary can show it. */
  onFinish: (result: RoundResult) => RoundReport;
  onNext: () => void;
  onClose: () => void;
}

const TOTAL_MS = ROUND_SECONDS * 1000;
const VOLUME = 0.35;
const LOW_WATER = 6;

const numeric = (text: string) => Number.parseFloat(text.replace(/[^0-9.\-]/g, ""));

function isRight(question: PracticeQuestion, response: string): boolean {
  if (question.kind === "choice") return response === question.answer;
  const value = numeric(response);
  return Number.isFinite(value) && Math.abs(value - Number(question.answer)) <= (question.tolerance ?? 0) + 1e-9;
}

const answerText = (q: PracticeQuestion) => (q.kind === "number" ? `${q.answer}${q.unit ? ` ${q.unit}` : ""}` : q.answer);

/** The unused question nearest the live difficulty; missed-before questions get a small head start. */
function pick(pool: PracticeQuestion[], used: Set<string>, target: number, last: PracticeQuestion | null): PracticeQuestion | null {
  let best: PracticeQuestion | null = null;
  let bestScore = Infinity;
  pool.forEach((q, index) => {
    if (used.has(q.id)) return;
    const score = Math.abs(q.level - target) * 100 + index + (q.retry ? -30 : 0) + (last && q.tag === last.tag ? 40 : 0) + (last && groupOf(q) === groupOf(last) ? 25 : 0);
    if (score < bestScore) { best = q; bestScore = score; }
  });
  return best;
}

let sharedSound: DuelSound | null = null;
const sound = () => (sharedSound ??= new DuelSound());

export function RoundRunner({ title, mode, level, round, entries, onFinish, onNext, onClose }: Props) {
  const pool = useRef<PracticeQuestion[]>([...round.initial]);
  const used = useRef(new Set<string>());
  const log = useRef<AnswerLog[]>([]);
  const streak = useRef({ right: 0, wrong: 0 });
  const target = useRef(targetDifficulty(level));
  const combo = useRef({ now: 0, best: 0 });
  const xp = useRef(0);
  const remaining = useRef(TOTAL_MS);
  const paused = useRef(false);
  const finished = useRef(false);
  const lastSecond = useRef(Infinity);
  const advanceTimer = useRef<number | null>(null);
  const current = useRef<PracticeQuestion | null>(null);
  const startedAt = useRef(Date.now());

  const [left, setLeft] = useState(TOTAL_MS);
  const [isPaused, setIsPaused] = useState(false);
  const [question, setQuestion] = useState<PracticeQuestion | null>(() => {
    const first = pick(pool.current, used.current, target.current, null);
    if (first) used.current.add(first.id);
    current.current = first;
    return first;
  });
  const [response, setResponse] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [tally, setTally] = useState({ correct: 0, total: 0 });
  const [summary, setSummary] = useState<{ result: RoundResult; outcome: RoundOutcome; extras: RoundExtras } | null>(null);

  const reduce = useReducedMotion();
  const answered = response !== null;
  const right = answered && question ? isRight(question, response) : false;

  /* ---------- finishing ---------- */
  const end = (completed: boolean) => {
    if (finished.current) return;
    finished.current = true;
    if (advanceTimer.current) window.clearTimeout(advanceTimer.current);
    const answers = log.current;
    const correct = answers.filter((a) => a.correct).length;
    const result: RoundResult = {
      correct, total: answers.length, xp: xp.current, accuracy: answers.length ? correct / answers.length : 0,
      seconds: Math.round((Date.now() - startedAt.current) / 1000), completed,
      correctTags: answers.filter((a) => a.correct).map((a) => a.tag), answers, maxCombo: combo.current.best,
    };
    // Unplayed AI questions are kept for the next round (nothing is lost, nothing repeats).
    round.close();
    stashUnused(mode, pool.current.filter((q) => !used.current.has(q.id)));
    const { outcome, extras } = onFinish(result);
    if (completed) sound().cue("end");
    if (outcome.outcome === "up" || extras.unlocked.length) haptic.success();
    setSummary({ result, outcome, extras });
  };
  const endRef = useRef(end);
  endRef.current = end;

  /* ---------- the clock (stops while a chart is open full-screen) ---------- */
  useEffect(() => {
    void sound().start(VOLUME).catch(() => undefined);
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - last;
      last = now;
      if (finished.current || paused.current) return;
      remaining.current = Math.max(0, remaining.current - dt);
      setLeft(remaining.current);
      const whole = Math.ceil(remaining.current / 1000);
      if (whole <= 10 && whole > 0 && whole !== lastSecond.current) sound().cue("last-ten");
      lastSecond.current = whole;
      if (remaining.current <= 0) endRef.current(true);
    }, 100);
    return () => { window.clearInterval(id); if (advanceTimer.current) window.clearTimeout(advanceTimer.current); };
  }, []);

  /* ---------- answering ---------- */
  const advance = () => {
    if (finished.current) return;
    if (advanceTimer.current) { window.clearTimeout(advanceTimer.current); advanceTimer.current = null; }
    const more = round.drain();
    if (more.length) pool.current.push(...more.filter((q) => !pool.current.some((p) => p.id === q.id || p.fp === q.fp)));
    const next = pick(pool.current, used.current, target.current, current.current);
    if (!next) { end(true); return; }
    used.current.add(next.id);
    current.current = next;
    setQuestion(next);
    setResponse(null);
    setTyped("");
  };

  const submit = (value: string) => {
    const q = current.current;
    if (!q || response !== null || finished.current) return;
    const ok = isRight(q, value);
    setResponse(value);
    setTally((t) => ({ correct: t.correct + (ok ? 1 : 0), total: t.total + 1 }));
    log.current.push({ fp: q.fp, tag: q.tag, prompt: q.prompt, level: q.level, correct: ok, yourAnswer: value, correctAnswer: answerText(q), question: q });
    if (ok) {
      xp.current += earnedXp(q.xp);
      combo.current.now += 1;
      combo.current.best = Math.max(combo.current.best, combo.current.now);
      sound().cue(combo.current.now >= 3 ? "combo" : "correct");
      haptic.selection();
      streak.current = { right: streak.current.right + 1, wrong: 0 };
    } else {
      combo.current.now = 0;
      sound().cue("wrong");
      haptic.error();
      streak.current = { right: 0, wrong: streak.current.wrong + 1 };
    }
    const moved = nudge(target.current, streak.current);
    target.current = moved.target;
    streak.current = moved.streak;

    // Keep the supply topped up: late AI batches are merged and more are requested when running low.
    const more = round.drain();
    if (more.length) pool.current.push(...more.filter((p) => !pool.current.some((x) => x.id === p.id || x.fp === p.fp)));
    if (pool.current.filter((p) => !used.current.has(p.id)).length < LOW_WATER) round.topUp();

    advanceTimer.current = window.setTimeout(advance, feedbackDwellMs({ correct: ok, combo: combo.current.now, explanation: q.explanation }));
  };

  const handlers = useRef({ submit, advance });
  handlers.current = { submit, advance };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (finished.current) return;
      if (response !== null) {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); handlers.current.advance(); }
        return;
      }
      if (question?.kind !== "choice" || paused.current) return;
      const index = "1234".indexOf(e.key) >= 0 ? "1234".indexOf(e.key) : "abcd".indexOf(e.key.toLowerCase());
      const choice = index >= 0 ? question.choices?.[index] : undefined;
      if (choice) handlers.current.submit(choice);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [question, response]);

  const onOverlay = (open: boolean) => { paused.current = open; setIsPaused(open); };

  const chartEntries = useMemo(() => {
    if (!question) return [];
    const ids = question.chartTradeIds ?? (question.tradeId ? [question.tradeId] : []);
    return ids.map((id) => entries.find((e) => e.id === id)).filter((e): e is JournalEntry => !!e);
  }, [question, entries]);

  /* ---------- summary ---------- */
  if (summary) return <RoundSummary title={title} mode={mode} summary={summary} entries={entries} onNext={onNext} onClose={onClose} />;
  if (!question) return null;

  const meta = MODE_META[mode];
  const gate = gateFor(mode, level);
  const secs = Math.ceil(left / 1000);
  const low = secs <= 10;
  const valid = typed.trim() !== "" && !Number.isNaN(numeric(typed));
  const accuracy = tally.total >= 3 ? tally.correct / tally.total : null;
  const comboNow = combo.current.now;
  const stageWidth = mode === "time-machine" ? "max-w-3xl" : mode === "math-duel" ? "max-w-xl" : "max-w-2xl";
  const twoUp = mode === "math-duel" && question.kind === "choice" && (question.choices ?? []).every((c) => c.length <= 16);
  const enter = reduce ? { opacity: 0 } : mode === "time-machine" ? { opacity: 0, x: -14 } : { opacity: 0, y: 10 };
  const settled = reduce ? { opacity: 1 } : { opacity: 1, x: 0, y: 0 };

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-canvas text-ink">
      {/* the mode's own atmosphere: one soft wash, nothing busy */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[46vh]" style={{ background: `radial-gradient(70% 100% at 50% 0%, ${tint(meta.accent, mode === "boss" ? 13 : 9)}, transparent)` }} />
      {mode === "matrix" && <div aria-hidden className="dot-backdrop pointer-events-none absolute inset-x-0 top-0 h-[40vh] opacity-50 [mask-image:linear-gradient(#000,transparent)]" />}

      <header className="relative flex h-[68px] shrink-0 items-center justify-between px-4 sm:px-7">
        <GlassIconButton label="End round" onClick={() => end(false)}><IconClose /></GlassIconButton>
        <div className="flex items-center gap-2.5">
          <ModeBadge mode={mode} size="sm" />
          <div className="leading-tight">
            <p className="text-[13.5px] font-semibold tracking-[-0.01em]">{title}</p>
            <p className="text-[11.5px] text-muted">{meta.stage} · Level {level}</p>
          </div>
        </div>
        <TimerRing fraction={left / TOTAL_MS} seconds={secs} low={low} paused={isPaused} />
      </header>

      <main className="relative flex-1 overflow-y-auto">
        <motion.div key={question.id} initial={enter} animate={settled} transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }} className={cn("mx-auto w-full px-6 pb-6 pt-3 sm:pt-8", stageWidth)}>
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-muted">
            <span className="rounded-full border border-line bg-raised px-3 py-1 text-ink/80">{question.pin}</span>
            {question.retry && <span className="rounded-full bg-loss/10 px-2.5 py-1 text-[11.5px] text-loss">Missed before</span>}
            {question.source === "ai" && <span className="rounded-full px-2.5 py-1 text-[11.5px]" style={{ background: tint(meta.accent, 12), color: tint(meta.accent, 75, "var(--ink)") }}>From your notes</span>}
          </div>

          {chartEntries.length > 0 && <div className="mt-4"><ChartPanel key={question.id} entries={chartEntries} onOverlay={onOverlay} large={mode === "time-machine"} /></div>}

          {question.visual && <div className="mt-4"><CandleVisual visual={question.visual} revealed={answered} /></div>}

          <h2 className={cn("mt-6 font-semibold tracking-[-0.022em]", mode === "math-duel" ? "text-[28px] leading-[1.18] sm:text-[34px]" : "text-[26px] leading-[1.2] sm:text-[32px]")}>{question.prompt}</h2>

          {question.kind === "choice" && (
            <div className={cn("mt-7 grid gap-3", twoUp && "sm:grid-cols-2")} role="group" aria-label="Answers">
              {question.choices?.map((choice, i) => {
                const state: TileState = !answered ? "idle" : choice === question.answer ? "right" : choice === response ? "wrong" : "dim";
                return <AnswerTile key={choice} index={i} label={choice} state={state} accent={meta.accent} compact={twoUp} onClick={() => submit(choice)} />;
              })}
            </div>
          )}

          {question.kind === "number" && (
            <div
              className={cn(
                "mt-7 flex items-center gap-3 rounded-[22px] px-5 py-3.5 transition-[border-color,background-color,box-shadow] duration-200",
                !answered && cn(surface.material, "focus-within:border-gold/60 focus-within:ring-4 focus-within:ring-gold/10"),
                answered && (right ? "border border-profit/55 bg-profit/[0.09]" : "border border-loss/55 bg-loss/[0.09]"),
              )}
            >
              <input
                key={question.id}
                autoFocus
                inputMode="decimal"
                aria-label="Your answer"
                disabled={answered}
                value={answered ? response ?? "" : typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(typed); }}
                placeholder="Answer"
                className={cn("num min-w-0 flex-1 bg-transparent text-[38px] leading-tight outline-none placeholder:text-faint/70 sm:text-[44px]", answered && (right ? "text-profit" : "text-loss"))}
              />
              {question.unit && <span className="text-[18px] text-muted">{question.unit}</span>}
              {!answered && (
                <button type="button" onClick={() => submit(typed)} disabled={!valid} className="inline-flex h-11 shrink-0 items-center rounded-full bg-gradient-to-b from-gold-strong to-gold-deep px-5 text-[14px] font-semibold text-on-gold shadow-[0_6px_14px_-6px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)] transition-all hover:brightness-110 active:scale-[0.97] disabled:cursor-not-allowed disabled:bg-none disabled:bg-ink/[0.07] disabled:text-faint disabled:shadow-none">
                  Check ↵
                </button>
              )}
            </div>
          )}
        </motion.div>
      </main>

      {/* Feedback is docked above the footer so the question never shifts. Tap or press Enter to move on. */}
      <div className="relative shrink-0 px-4 sm:px-8" aria-live="polite">
        <AnimatePresence initial={false}>
          {answered && (
            <motion.button
              key={question.id}
              type="button"
              onClick={advance}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.16, 1, 0.3, 1] }}
              className={cn("mx-auto mb-3 flex w-full items-start gap-3.5 rounded-[20px] border px-4 py-3.5 text-left", stageWidth, right ? "border-profit/40 bg-profit/[0.08]" : "border-loss/40 bg-loss/[0.08]")}
            >
              <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-canvas [&_svg]:h-3.5 [&_svg]:w-3.5", right ? "bg-profit" : "bg-loss")}>{right ? <IconCheck className="h-3.5 w-3.5" /> : <IconClose />}</span>
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline gap-x-2.5">
                  <span className={cn("text-[15px] font-semibold", right ? "text-profit" : "text-loss")}>{right ? "Correct" : "Not quite"}</span>
                  {right && <span className="num text-[13px] text-muted">+{earnedXp(question.xp)} XP{comboNow >= 3 ? ` · ×${comboNow} flow` : ""}</span>}
                  {!right && <span className="text-[14px] text-ink">Answer: <b className="font-semibold">{answerText(question)}</b></span>}
                </span>
                {!right && question.explanation && <span className="mt-1 block text-[13.5px] leading-snug text-muted">{brief(question.explanation)}</span>}
              </span>
              <span className="hidden shrink-0 self-center text-[12px] font-medium text-faint sm:block">Continue ↵</span>
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <footer className="relative shrink-0 border-t border-line/60 bg-canvas px-5 py-3.5 sm:px-8">
        <div className={cn("mx-auto flex items-center gap-5", stageWidth)}>
          <GateMeter value={tally.correct} goal={gate.correct} accent={meta.accent} variant={mode === "boss" ? "boss" : "fill"} accuracy={accuracy} needAccuracy={gate.accuracy} nextLevel={level + 1} />
          <div className="flex shrink-0 items-center gap-2.5 text-[12px]">
            {comboNow >= 2 && (
              <motion.span key={comboNow} initial={reduce ? false : { scale: 1.35 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 520, damping: 16 }} className="num inline-flex items-center gap-1 rounded-full px-2.5 py-1 font-semibold" style={{ background: tint(meta.accent, 14), color: tint(meta.accent, 75, "var(--ink)") }}>
                {comboNow >= 5 && <FlameIcon className="h-3.5 w-3.5" />}×{comboNow}
              </motion.span>
            )}
            <span className="num text-muted">{xp.current} XP</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

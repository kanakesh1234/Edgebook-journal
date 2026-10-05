"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Button } from "@/components/ui/button";
import { ChartPanel } from "@/components/practice/ChartPanel";
import { cn } from "@/lib/utils";
import type { JournalEntry } from "@/lib/types";
import type { PracticeQuestion } from "@/lib/practice/engine";
import { groupOf } from "@/lib/practice/session";
import { nudge, ROUND_SECONDS, targetDifficulty, type ArenaMode, type RoundOutcome } from "@/lib/practice/arena";
import type { Round } from "@/lib/practice/round";
import { stashUnused } from "@/lib/practice/bank";
import { DuelSound } from "@/lib/practice/math/sound";

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

interface Props {
  title: string;
  mode: ArenaMode;
  level: number;
  round: Round;
  /** Every journal trade, so each question can show its saved screenshots. */
  entries: JournalEntry[];
  /** Called once when the round ends. Returns the level change so the summary can show it. */
  onFinish: (result: RoundResult) => RoundOutcome;
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

const clock = (ms: number) => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

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
  const [summary, setSummary] = useState<{ result: RoundResult; outcome: RoundOutcome } | null>(null);

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
    const outcome = onFinish(result);
    if (completed) sound().cue("end");
    setSummary({ result, outcome });
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
      xp.current += q.xp;
      combo.current.now += 1;
      combo.current.best = Math.max(combo.current.best, combo.current.now);
      sound().cue(combo.current.now >= 3 ? "combo" : "correct");
      streak.current = { right: streak.current.right + 1, wrong: 0 };
    } else {
      combo.current.now = 0;
      sound().cue("wrong");
      streak.current = { right: 0, wrong: streak.current.wrong + 1 };
    }
    const moved = nudge(target.current, streak.current);
    target.current = moved.target;
    streak.current = moved.streak;

    // Keep the supply topped up: late AI batches are merged and more are requested when running low.
    const more = round.drain();
    if (more.length) pool.current.push(...more.filter((p) => !pool.current.some((x) => x.id === p.id || x.fp === p.fp)));
    if (pool.current.filter((p) => !used.current.has(p.id)).length < LOW_WATER) round.topUp();

    advanceTimer.current = window.setTimeout(advance, ok ? 520 : 1400);
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
  if (summary) return <Summary title={title} summary={summary} entries={entries} onNext={onNext} onClose={onClose} />;
  if (!question) return null;

  const secs = Math.ceil(left / 1000);
  const low = secs <= 10;
  const valid = typed.trim() !== "" && !Number.isNaN(numeric(typed));

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-canvas text-ink">
      <header className="flex h-14 shrink-0 items-center justify-between px-5 sm:px-8">
        <button onClick={() => end(false)} className="text-[13px] text-muted transition-colors hover:text-ink">Exit</button>
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-faint">{title} · Level {level}</p>
        <span className={cn("w-14 text-right font-mono text-[13px] tabular-nums", low && !isPaused ? "text-loss" : "text-muted")}>{isPaused ? "Paused" : clock(left)}</span>
      </header>
      <div className="h-[2px] w-full bg-line-soft">
        <div className={cn("h-full transition-[width] duration-100 ease-linear", low ? "bg-loss" : "bg-gold-strong")} style={{ width: `${(left / TOTAL_MS) * 100}%` }} />
      </div>

      <main className="flex-1 overflow-y-auto">
        <motion.div key={question.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.18 }} className="mx-auto w-full max-w-2xl px-6 py-8 sm:py-12">
          <div className="flex flex-wrap items-center gap-2 text-[12px] font-medium text-muted">
            <span>{question.pin}</span>
            {question.retry && <span className="rounded-full bg-loss/10 px-2 py-0.5 text-[11px] text-loss">Missed before</span>}
            {question.source === "ai" && <span className="rounded-full bg-gold/10 px-2 py-0.5 text-[11px] text-gold">AI</span>}
          </div>

          {chartEntries.length > 0 && <div className="mt-4"><ChartPanel key={question.id} entries={chartEntries} onOverlay={onOverlay} /></div>}

          <h2 className="mt-6 text-[26px] font-semibold leading-[1.2] tracking-[-0.02em] sm:text-[32px]">{question.prompt}</h2>

          {question.kind === "choice" && (
            <div className="mt-8 grid gap-3">
              {question.choices?.map((choice, i) => {
                const state = !answered ? "idle" : choice === question.answer ? "right" : choice === response ? "wrong" : "dim";
                return (
                  <button
                    key={choice}
                    disabled={answered}
                    onClick={() => submit(choice)}
                    className={cn(
                      "flex items-center gap-4 rounded-[18px] border px-5 py-4 text-left text-[17px] transition-colors",
                      state === "idle" && "border-line bg-surface hover:border-line-strong hover:bg-raised",
                      state === "right" && "border-profit/60 bg-profit/10",
                      state === "wrong" && "border-loss/60 bg-loss/10",
                      state === "dim" && "border-line bg-surface opacity-40",
                    )}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-current text-[11px] font-semibold text-muted">{i + 1}</span>
                    <span>{choice}</span>
                  </button>
                );
              })}
            </div>
          )}

          {question.kind === "number" && (
            <div className="mt-8">
              <div className={cn("flex items-baseline gap-3 border-b-2 pb-2 transition-colors", !answered && "border-line-strong focus-within:border-gold-strong", answered && (right ? "border-profit" : "border-loss"))}>
                <input
                  key={question.id}
                  autoFocus
                  inputMode="decimal"
                  disabled={answered}
                  value={answered ? response ?? "" : typed}
                  onChange={(e) => setTyped(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && valid) submit(typed); }}
                  placeholder="Answer"
                  className={cn("min-w-0 flex-1 bg-transparent font-mono text-[32px] outline-none placeholder:text-faint", answered && (right ? "text-profit" : "text-loss"))}
                />
                {question.unit && <span className="text-lg text-muted">{question.unit}</span>}
                {!answered && <button onClick={() => submit(typed)} disabled={!valid} className="text-[13px] font-semibold text-gold transition-opacity disabled:opacity-30">Check ↵</button>}
              </div>
              {answered && !right && <p className="mt-3 text-[15px] text-muted">Answer <b className="font-semibold text-ink">{answerText(question)}</b></p>}
            </div>
          )}
        </motion.div>
      </main>

      <footer className="flex shrink-0 items-center justify-between px-5 py-3 text-[12px] tabular-nums text-faint sm:px-8">
        <span>{tally.correct} correct</span>
        <span>{tally.total} answered</span>
      </footer>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Summary                                                            */
/* ------------------------------------------------------------------ */

function Summary({ title, summary, entries, onNext, onClose }: { title: string; summary: { result: RoundResult; outcome: RoundOutcome }; entries: JournalEntry[]; onNext: () => void; onClose: () => void }) {
  const { result, outcome } = summary;
  const [open, setOpen] = useState<string | null>(null);
  const missed = result.answers.filter((a) => !a.correct);
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const head = {
    up: { eyebrow: "Level up", title: `Level ${outcome.nextLevel}`, sub: `You cleared ${outcome.gate.correct} correct at ${pct(outcome.gate.accuracy)}.` },
    hold: { eyebrow: "Round complete", title: `Level ${outcome.level} holds`, sub: `Needed ${outcome.gate.correct} correct at ${pct(outcome.gate.accuracy)} — you got ${result.correct} (${pct(result.accuracy)}).${outcome.nextFails >= 1 && outcome.level > 1 ? " Miss again and you drop a level." : ""}` },
    down: { eyebrow: "Round complete", title: `Back to level ${outcome.nextLevel}`, sub: `Needed ${outcome.gate.correct} correct at ${pct(outcome.gate.accuracy)} — you got ${result.correct} (${pct(result.accuracy)}).` },
    early: { eyebrow: "Round ended", title: "Level unchanged", sub: "Leaving early never costs a level." },
  }[outcome.outcome];

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-canvas text-ink">
      <div className="mx-auto max-w-2xl px-6 py-14 sm:py-20">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-gold">{title} · {head.eyebrow}</p>
        <motion.h1 initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }} className="mt-3 text-[44px] font-semibold leading-none tracking-[-0.03em] sm:text-[56px]">{head.title}</motion.h1>
        <p className="mt-4 text-[16px] text-muted">{head.sub}</p>

        <div className="mt-10 grid grid-cols-3 gap-3">
          {[["Correct", `${result.correct}/${result.total}`], ["Accuracy", pct(result.accuracy)], ["XP", `+${result.xp}`]].map(([label, value]) => (
            <div key={label} className="rounded-[20px] border border-line bg-surface p-5">
              <p className="text-[11px] font-semibold uppercase tracking-[.12em] text-faint">{label}</p>
              <p className="mt-2 font-mono text-[26px] tabular-nums">{value}</p>
            </div>
          ))}
        </div>

        <section className="mt-12">
          <h2 className="text-[13px] font-semibold text-ink">{missed.length ? `Review · ${missed.length} missed` : "Clean round"}</h2>
          {missed.length === 0 && result.total > 0 && <p className="mt-2 text-[14px] text-muted">Nothing to review.</p>}
          <div className="mt-3 space-y-3">
            {missed.map((a) => {
              const ids = a.question.chartTradeIds ?? (a.question.tradeId ? [a.question.tradeId] : []);
              const shots = ids.map((id) => entries.find((e) => e.id === id)).filter((e): e is JournalEntry => !!e && (e.images?.length ?? 0) > 0);
              return (
                <article key={a.fp} className="rounded-[20px] border border-line bg-surface p-5">
                  <p className="text-[16px] font-medium leading-snug">{a.prompt}</p>
                  <p className="mt-3 text-[13px] text-muted">You: {a.yourAnswer} · Answer: <b className="font-semibold text-ink">{a.correctAnswer}</b></p>
                  <p className="mt-2 text-[14px] leading-relaxed text-muted">{a.question.explanation}</p>
                  {a.question.evidence && <p className="mt-3 border-l-2 border-gold-strong pl-3 text-[13px] italic text-muted">From your notes: “{a.question.evidence}”</p>}
                  {shots.length > 0 && (
                    <>
                      <button onClick={() => setOpen(open === a.fp ? null : a.fp)} className="mt-3 text-[13px] font-semibold text-gold">{open === a.fp ? "Hide chart" : "Show chart"}</button>
                      {open === a.fp && <div className="mt-3"><ChartPanel entries={shots} /></div>}
                    </>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        <div className="mt-12 flex flex-wrap gap-3">
          <Button variant="gold" size="lg" onClick={onNext}>Next round · Level {outcome.nextLevel}</Button>
          <Button variant="ghost" size="lg" onClick={onClose}>Done</Button>
        </div>
      </div>
    </div>
  );
}

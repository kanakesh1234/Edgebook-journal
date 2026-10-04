"use client";

import { addDailyStats } from "@/lib/practice/daily";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { updateRating, type FamilyRating } from "@/lib/practice/math/difficulty";
import { nextQuestion } from "@/lib/practice/math/generator";
import type { MathFamily, MathQuestion } from "@/lib/practice/math/families/types";
import { DuelSound } from "@/lib/practice/math/sound";
import { nextStreak } from "@/lib/practice/engine";
import { todayKey } from "@/lib/format";
import type { JournalSettings, PracticeProgress } from "@/lib/types";

const FAMILIES: MathFamily[] = ["breakeven", "expectancy", "sizing", "fees", "streak", "at-least-one", "buffer", "net-positive"];
const LIVES = 5;
const RUN_SECONDS = 60;

interface Props {
  progress: PracticeProgress;
  updateSettings: (patch: Partial<JournalSettings>) => Promise<void>;
  /** 0 = adaptive (per-family ratings), 1–4 = force that level. */
  levelOverride?: 0 | 1 | 2 | 3 | 4;
}

interface RunState {
  byFamily: Record<string, { correct: number; attempts: number }>;
  asked: string[];
  earned: number;
  correct: number;
  attempts: number;
  lastFamily?: MathFamily;
}

const emptyRun = (): RunState => ({ byFamily: {}, asked: [], earned: 0, correct: 0, attempts: 0 });

function isRight(question: MathQuestion, value: number): boolean {
  const tolerance = question.tolerance * (question.answerKind === "percent" ? 100 : 1);
  return Number.isFinite(value) && Math.abs(value - question.answer) <= tolerance;
}

const show = (value: number, question: MathQuestion) => `${Number(value.toFixed(2))}${question.unit === "%" ? "%" : question.unit ? ` ${question.unit}` : ""}`;

export function MathDuel({ progress, updateSettings, levelOverride = 0 }: Props) {
  const [phase, setPhase] = useState<"idle" | "running" | "summary">("idle");
  const [question, setQuestion] = useState<MathQuestion | null>(null);
  const [round, setRound] = useState(1);
  const [typed, setTyped] = useState("");
  const [clock, setClock] = useState(RUN_SECONDS);
  const [lives, setLives] = useState(LIVES);
  const [combo, setCombo] = useState(0);
  const [feedback, setFeedback] = useState<{ right: boolean; text: string } | null>(null);
  const [summary, setSummary] = useState("");
  const [volume, setVolume] = useState(0.55);

  const run = useRef<RunState>(emptyRun());
  const seedBase = useRef(0);
  const sound = useRef<DuelSound | null>(null);
  const finished = useRef(true);

  const stored = (progress.mathDuel?.ratings ?? {}) as FamilyRating;
  const recent = progress.mathDuel?.recentSignatures ?? [];

  const effectiveRatings = (): FamilyRating =>
    levelOverride
      ? (Object.fromEntries(FAMILIES.map((family) => [family, { level: levelOverride, weakRounds: 0 }])) as FamilyRating)
      : stored;

  const makeQuestion = (forRound: number) =>
    nextQuestion(seedBase.current + forRound * 7919, effectiveRatings(), [...recent, ...run.current.asked], run.current.lastFamily);

  useEffect(() => {
    sound.current = new DuelSound();
    try {
      const saved = Number(window.localStorage.getItem("edgebook.math-duel.volume"));
      if (Number.isFinite(saved) && saved > 0) setVolume(Math.min(1, saved));
    } catch { /* storage is optional */ }
  }, []);

  useEffect(() => {
    sound.current?.setVolume(volume);
    try { window.localStorage.setItem("edgebook.math-duel.volume", String(volume)); } catch { /* optional */ }
  }, [volume]);

  const finish = () => {
    if (finished.current) return;
    finished.current = true;
    const r = run.current;
    const date = todayKey();
    const accuracy = r.attempts ? r.correct / r.attempts : 0;
    const bonus = accuracy >= 0.8 && r.attempts >= 3 ? 20 : 0;

    // Update the rating of EVERY family that was played, not just the last one.
    let ratings = stored;
    if (!levelOverride) {
      for (const [family, s] of Object.entries(r.byFamily)) {
        if (s.attempts) ratings = updateRating(ratings, family as MathFamily, s.correct / s.attempts);
      }
    }

    const sameDay = progress.mathDuel?.lastRunDate === date;
    const awards: Record<string, number> = sameDay ? { ...(progress.mathDuel?.dailyAwards ?? {}) } : {};
    const share = Object.keys(r.byFamily).length || 1;
    for (const family of Object.keys(r.byFamily)) awards[family] = (awards[family] ?? 0) + Math.round((r.earned + bonus) / share);

    const { streak, freezeDays } = nextStreak(progress, date);
    void updateSettings({
      practiceProgress: {
        ...progress,
        xp: progress.xp + r.earned + bonus,
        streak,
        freezeDays,
        lastMissionDate: date,
        completedMissionDates: [...new Set([...(progress.completedMissionDates ?? []), date])].slice(-90),
        dailyStats: addDailyStats(progress, date, { xp: r.earned + bonus, correct: r.correct, total: r.attempts }),
        mathDuel: {
          ratings,
          // Remember every question asked this run so they are not repeated soon.
          recentSignatures: [...recent, ...r.asked].slice(-3000),
          dailyAwards: awards,
          lastRunDate: date,
        },
      },
    });
    sound.current?.cue("end");
    setSummary(`${r.correct}/${r.attempts} correct · +${r.earned + bonus} XP${bonus ? " (accuracy bonus)" : ""}`);
    setPhase("summary");
  };

  // Countdown — only ticks while a question is waiting for an answer.
  useEffect(() => {
    if (phase !== "running" || feedback) return;
    if (clock <= 0) { finish(); return; }
    const id = window.setTimeout(() => setClock((value) => value - 1), 1000);
    if (clock <= 10) sound.current?.cue("last-ten");
    return () => window.clearTimeout(id);
    // finish() reads fresh refs/props each render, so it is safe to omit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, feedback, clock]);

  const start = () => {
    void sound.current?.start(volume);
    seedBase.current = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    run.current = emptyRun();
    finished.current = false;
    setRound(1);
    setClock(RUN_SECONDS);
    setLives(LIVES);
    setCombo(0);
    setTyped("");
    setFeedback(null);
    setQuestion(makeQuestion(1));
    setPhase("running");
  };

  const submit = (value: number, skipped = false) => {
    if (!question || feedback) return;
    const right = !skipped && isRight(question, value);
    const r = run.current;
    r.attempts += 1;
    r.asked.push(question.signature);
    r.lastFamily = question.family;
    const fam = (r.byFamily[question.family] ??= { correct: 0, attempts: 0 });
    fam.attempts += 1;

    if (right) {
      fam.correct += 1;
      r.correct += 1;
      const speed = Math.max(0, Math.min(0.5, ((question.parSeconds - (RUN_SECONDS - clock)) / Math.max(1, question.parSeconds)) * 0.5));
      const multiplier = Math.min(2, 1 + combo * 0.1);
      const earnedToday = (progress.mathDuel?.lastRunDate === todayKey() ? Object.values(progress.mathDuel?.dailyAwards ?? {}).reduce((a, b) => a + b, 0) : 0) + r.earned;
      const diminishing = earnedToday > 150 ? 0.5 : 1;
      const gain = Math.round((4 + 2 * question.level) * (1 + speed) * multiplier * diminishing);
      r.earned += gain;
      setCombo((n) => n + 1);
      sound.current?.cue(combo >= 2 ? "combo" : "correct");
      setFeedback({ right: true, text: `Clean. +${gain} XP` });
    } else {
      setLives((n) => n - 1);
      setCombo(0);
      sound.current?.cue("wrong");
      setFeedback({ right: false, text: `${skipped ? "Skipped." : "Not quite."} Answer: ${show(question.answer, question)}. ${question.steps[0] ?? ""}` });
    }
  };

  const next = () => {
    if (lives <= 0 || clock <= 0) { finish(); return; }
    const nextRound = round + 1;
    setRound(nextRound);
    setQuestion(makeQuestion(nextRound));
    setTyped("");
    setFeedback(null);
  };

  if (phase === "idle") {
    return (
      <section className="panel p-5">
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-gold">Math Duel</p>
        <h2 className="mt-1 font-display text-2xl text-ink">60-second risk and odds sprint</h2>
        <p className="mt-1 max-w-xl text-sm text-muted">Expectancy, break-even, MNQ sizing, fees, streak odds. {levelOverride ? `Level ${levelOverride} questions.` : "Difficulty adapts per topic as you play."}</p>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          <Button variant="gold" onClick={start}>Enter arena</Button>
          <label className="flex items-center gap-2 text-xs text-muted">
            Sound
            <input type="range" min="0" max="1" step=".05" value={volume} onChange={(event) => setVolume(Number(event.target.value))} />
            <button className="underline" onClick={() => { void sound.current?.start(volume).then(() => sound.current?.cue("correct")); }}>Test</button>
          </label>
        </div>
      </section>
    );
  }

  if (phase === "summary") {
    return (
      <section className="panel p-5">
        <p className="text-[11px] font-bold uppercase tracking-[.16em] text-gold">Round complete</p>
        <h2 className="mt-1 font-display text-2xl text-ink">{summary}</h2>
        <Button className="mt-4" variant="gold" onClick={start}>Go again</Button>
        <Button className="ml-2 mt-4" variant="outline" onClick={() => setPhase("idle")}>Done</Button>
      </section>
    );
  }

  if (!question) return null;
  const boss = round % 5 === 0;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink p-5 text-canvas">
      <div className="mx-auto max-w-2xl">
        <div className="flex items-center gap-3">
          <button className="text-xs text-canvas/60 hover:text-canvas" onClick={finish}>End duel</button>
          <div className="h-2 flex-1 overflow-hidden rounded bg-canvas/10">
            <div className="h-full bg-loss" style={{ width: `${Math.max(0, lives) * (100 / LIVES)}%` }} />
          </div>
          <span className="font-mono text-sm">00:{String(Math.max(0, clock)).padStart(2, "0")}</span>
        </div>
        <div className="mt-5 flex justify-between text-[10px] font-bold uppercase tracking-wider text-canvas/55">
          <span>Lives {Math.max(0, lives)}/{LIVES}</span>
          <span>Combo ×{Math.min(2, 1 + combo * 0.1).toFixed(1)}</span>
          <span>Round {round}{boss ? " · BOSS" : ""} · L{question.level}</span>
        </div>

        <main className="mt-14">
          <h2 className="text-3xl font-semibold leading-snug">{question.prompt}</h2>
          <div className="mt-5 flex flex-wrap gap-2">
            {question.givens.map((given) => <span key={given} className="rounded-full border border-canvas/15 px-3 py-1.5 text-xs text-canvas/70">{given}</span>)}
          </div>
          <p className="mt-3 text-xs text-canvas/45">Answer in {question.unit || "number"} · par {question.parSeconds}s</p>

          {!feedback && question.choices && (
            <div className="mt-8 grid gap-2 sm:grid-cols-2">
              {question.choices.map((choice) => (
                <button key={choice} onClick={() => submit(choice)} className="rounded-xl border border-canvas/15 bg-canvas/5 px-4 py-4 text-left font-mono text-lg hover:border-gold-strong">
                  {show(choice, question)}
                </button>
              ))}
            </div>
          )}

          {!feedback && !question.choices && (
            <div className="mt-8 flex items-center gap-3">
              <input
                autoFocus
                inputMode="decimal"
                value={typed}
                onChange={(event) => setTyped(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && typed.trim()) submit(Number(typed.replace("%", ""))); }}
                className="w-40 rounded-lg border border-canvas/20 bg-canvas/5 px-4 py-3 font-mono text-lg outline-none focus:border-gold-strong"
                placeholder="Answer"
              />
              <Button variant="gold" disabled={!typed.trim() || Number.isNaN(Number(typed.replace("%", "")))} onClick={() => submit(Number(typed.replace("%", "")))}>Lock in</Button>
              <button className="text-xs text-canvas/50 underline" onClick={() => submit(0, true)}>Skip</button>
            </div>
          )}

          {feedback && (
            <div className={cn("mt-8 rounded-xl border p-5", feedback.right ? "border-profit/50 bg-profit/10" : "border-loss/50 bg-loss/10")}>
              <p className={cn("text-sm", feedback.right ? "text-profit" : "text-loss")}>{feedback.text}</p>
              <Button className="mt-4" variant="gold" onClick={next}>{lives <= 0 || clock <= 0 ? "Finish" : "Next"}</Button>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

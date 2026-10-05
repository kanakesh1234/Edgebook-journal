"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { computeStats } from "@/lib/stats";
import { todayKey } from "@/lib/format";
import { Spinner } from "@/components/ui/button";
import { ModeCard, MODE_META } from "@/components/practice/mode-card";
import { RoundRunner, type RoundResult } from "@/components/practice/round-runner";
import { displayStreak, isUsable, nextStreak, rankOf, weekTrades } from "@/lib/practice/engine";
import { recordAnswers, rememberPrompts } from "@/lib/practice/history";
import { updateLedger } from "@/lib/practice/ledger";
import { addDailyStats } from "@/lib/practice/daily";
import { nextQuestionBank } from "@/lib/practice/bank";
import { prepareRound, warmBank, type Round } from "@/lib/practice/round";
import { applyOutcome, arenaLevels, ARENA_MODES, evaluateRound, failsOf, gateFor, levelOf, type ArenaMode, type RoundOutcome } from "@/lib/practice/arena";
import type { PracticeProgress } from "@/lib/types";

type Phase = { kind: "idle" } | { kind: "preparing"; mode: ArenaMode } | { kind: "playing"; mode: ArenaMode; level: number; round: Round };

const EMPTY: PracticeProgress = { xp: 0, streak: 0, freezeDays: 1 };

function modeFromUrl(): ArenaMode | null {
  const raw = new URLSearchParams(window.location.search).get("mode");
  if (raw === "matrix") return "matrix";
  if (raw === "time-machine" || raw === "timemachine") return "time-machine";
  if (raw === "math-duel" || raw === "math" || raw === "duel") return "math-duel";
  if (raw === "boss" || raw === "weekend-boss") return "boss";
  return null;
}

/** Everything a round needs, read fresh from the store (so "Next round" never uses stale data). */
function snapshot() {
  const state = useApp.getState();
  const { entries, challenge, settings: scoped } = scopeToPrimary(state.settings, state.entries);
  const stats = computeStats(entries, scoped);
  let drawdownLeft: number | null;
  if (stats.drawdownCushion != null) drawdownLeft = Math.max(0, stats.drawdownCushion);
  else {
    const limit = challenge?.maxDrawdown ?? state.settings.maxDrawdown;
    drawdownLeft = limit > 0 ? Math.max(0, limit - stats.drawdown) : null;
  }
  return { entries, drawdownLeft, progress: state.settings.practiceProgress ?? EMPTY, updateSettings: state.updateSettings };
}

export default function PracticePage() {
  const allEntries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const { entries } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const progress = settings.practiceProgress ?? EMPTY;
  const today = todayKey();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const token = useRef(0);
  const deepLink = useRef<ArenaMode | null>(null);

  const levels = arenaLevels(progress);
  const usable = useMemo(() => entries.filter(isUsable), [entries]);
  const week = useMemo(() => weekTrades(entries), [entries]);

  const lock = (mode: ArenaMode): string | null => {
    if (mode === "math-duel") return null;
    if (usable.length === 0) return "Add a trade to unlock this mode.";
    if (mode === "boss" && week.trades.length < 2) return "Needs two trades in the same week.";
    return null;
  };

  const start = async (mode: ArenaMode) => {
    const id = ++token.current;
    setNotice(null);
    setPhase({ kind: "preparing", mode });
    const snap = snapshot();
    const level = levelOf(snap.progress, mode);
    const prepared = await prepareRound({ mode, level, entries: snap.entries, progress: snap.progress, drawdownLeft: snap.drawdownLeft });
    if (id !== token.current) { if ("round" in prepared) prepared.round.close(); return; }
    if ("empty" in prepared) { setPhase({ kind: "idle" }); setNotice(prepared.empty); return; }
    setPhase({ kind: "playing", mode, level, round: prepared.round });
  };

  const cancel = () => { token.current++; setPhase({ kind: "idle" }); };

  // Deep links from Home (/practice?mode=matrix) start that mode straight away.
  useEffect(() => {
    const mode = modeFromUrl();
    if (!mode) return;
    deepLink.current = mode;
    try { window.history.replaceState(null, "", "/practice"); } catch { /* optional */ }
  }, []);
  useEffect(() => {
    const mode = deepLink.current;
    if (!mode || phase.kind !== "idle") return;
    if (mode !== "math-duel" && entries.length === 0) return; // wait for the journal to load
    deepLink.current = null;
    void start(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  /** Saves a finished round and returns the level change for the summary. */
  const finish = (mode: ArenaMode, level: number, result: RoundResult): RoundOutcome => {
    const snap = snapshot();
    const live = snap.progress;
    const outcome = evaluateRound({ mode, level, fails: failsOf(live, mode), correct: result.correct, answered: result.total, completed: result.completed });
    if (result.total === 0) return outcome;

    const mastery = { ...(live.masteryByTag ?? {}) };
    result.correctTags.forEach((tag) => { mastery[tag] = (mastery[tag] ?? 0) + 1; });
    const perf = { ...(live.modePerformance ?? {}) };
    const bump = (key: string, correct: number, attempts: number) => {
      const c = perf[key] ?? { correct: 0, attempts: 0 };
      perf[key] = { correct: c.correct + correct, attempts: c.attempts + attempts };
    };
    bump(mode, result.correct, result.total);
    for (const a of result.answers) if (a.question.tradeId) bump(`matrix:${a.question.tradeId}`, a.correct ? 1 : 0, 1);

    const { streak, freezeDays } = nextStreak(live, today);
    const duelSigns = result.answers.filter((a) => a.question.id.startsWith("duel:")).map((a) => a.question.id.slice(5));
    rememberPrompts(result.answers.map((a) => a.prompt));

    const next: PracticeProgress = {
      ...live,
      xp: live.xp + result.xp,
      streak, freezeDays, lastMissionDate: today,
      completedMissionDates: [...new Set([...(live.completedMissionDates ?? []), today])].slice(-90),
      masteryByTag: mastery,
      modePerformance: perf,
      seenQuestions: recordAnswers(live, result.answers.map((a) => ({ fp: a.fp, tag: a.tag, correct: a.correct })), today),
      ledger: updateLedger(live, result.answers.map((a) => ({ fp: a.fp, correct: a.correct }))),
      questionBank: nextQuestionBank(live, result.answers.map((a) => ({ question: a.question, correct: a.correct }))),
      perfectSets: (live.perfectSets ?? 0) + (result.total >= 3 && result.correct === result.total ? 1 : 0),
      dailyStats: addDailyStats(live, today, { xp: result.xp, correct: result.correct, total: result.total }),
      arena: applyOutcome(live, mode, outcome, result.correct),
      mathDuel: duelSigns.length ? { ...(live.mathDuel ?? {}), recentSignatures: [...(live.mathDuel?.recentSignatures ?? []), ...duelSigns].slice(-3000) } : live.mathDuel,
    };
    void snap.updateSettings({ practiceProgress: next });
    // Write the next round's AI questions in the background so it starts instantly.
    void warmBank({ mode, level: outcome.nextLevel, entries: snap.entries, progress: next, drawdownLeft: snap.drawdownLeft }).catch(() => undefined);
    return outcome;
  };

  const status = (mode: ArenaMode): string => {
    const locked = lock(mode);
    if (locked) return locked;
    const gate = gateFor(mode, levels[mode]);
    return `Clear ${gate.correct} correct at ${Math.round(gate.accuracy * 100)}% to reach Level ${levels[mode] + 1}.`;
  };

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <header className="pt-2">
        <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-gold">Practice</p>
        <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">Train on your own trades.</h1>
        <p className="mt-4 max-w-xl text-[17px] leading-snug text-muted">Sixty-second rounds, written fresh from your journal. Each level asks a little more.</p>
      </header>

      {notice && <p className="mt-8 rounded-[18px] border border-line bg-surface px-5 py-4 text-[14px] text-muted">{notice}</p>}

      <div className="mt-10 grid gap-5 sm:grid-cols-2">
        {ARENA_MODES.map((mode) => (
          <ModeCard key={mode} mode={mode} level={levels[mode]} status={status(mode)} disabled={!!lock(mode)} busy={phase.kind === "preparing" && phase.mode === mode} onStart={() => void start(mode)} />
        ))}
      </div>

      <p className="mt-8 text-[12px] tabular-nums text-faint">{displayStreak(progress, today)} day streak · {progress.xp.toLocaleString()} XP · {rankOf(progress.xp)}</p>

      {phase.kind === "preparing" && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-canvas/95 backdrop-blur-sm">
          <div className="text-center">
            <Spinner className="mx-auto h-6 w-6 text-gold" />
            <p className="mt-5 text-[20px] font-semibold tracking-[-0.02em] text-ink">Writing your {MODE_META[phase.mode].title} round</p>
            <p className="mt-1 text-[14px] text-muted">From your trades and saved charts.</p>
            <button onClick={cancel} className="mt-6 text-[13px] text-muted transition-colors hover:text-ink">Cancel</button>
          </div>
        </div>
      )}

      {phase.kind === "playing" && (
        <RoundRunner
          key={phase.round.initial.map((q) => q.id).join("|")}
          title={MODE_META[phase.mode].title}
          mode={phase.mode}
          level={phase.level}
          round={phase.round}
          entries={allEntries}
          onFinish={(result) => finish(phase.mode, phase.level, result)}
          onNext={() => void start(phase.mode)}
          onClose={() => setPhase({ kind: "idle" })}
        />
      )}
    </div>
  );
}

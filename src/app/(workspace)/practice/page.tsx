"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { computeStats } from "@/lib/stats";
import { todayKey } from "@/lib/format";
import Link from "next/link";
import { isIctTag } from "@/lib/practice/ict";
import { NO_EXTRAS, type RoundExtras } from "@/lib/practice/rewards";
import { PreparingScreen } from "@/components/practice/home";
import { MODE_META } from "@/components/practice/modes";
import { SectionCard } from "@/components/practice/section-card";
import { PlayerHero, weekStrip } from "@/components/practice/player-hero";
import { Challenges, TrophyCase } from "@/components/practice/shelf";
import "@/components/practice/practice.css";
import { applyRoundToLog, chestClaimed, claim, markAllDone, questStates, allDone } from "@/lib/practice/quests";
import { recommendMode, overallAccuracy } from "@/lib/practice/coach";
import { achievementStates, newlyEarned, spanDays, stamp } from "@/lib/practice/achievements";
import { updateRecords } from "@/lib/practice/records";
import { prepareIctRound } from "@/lib/practice/ict-round";
import { applyCardResults, cardHash } from "@/lib/practice/ict-cards";
import { updateCards } from "@/lib/practice/ict-store";
import { RoundRunner, type RoundResult, type RoundReport } from "@/components/practice/round-runner";
import { displayStreak, isUsable, nextStreak, rankOf, weekTrades } from "@/lib/practice/engine";
import { recordAnswers, rememberPrompts } from "@/lib/practice/history";
import { updateLedger } from "@/lib/practice/ledger";
import { addDailyStats } from "@/lib/practice/daily";
import { nextQuestionBank } from "@/lib/practice/bank";
import { DAILY_XP_GOAL, xpLevel } from "@/lib/practice/xp";
import { prepareRound, warmBank, type Round } from "@/lib/practice/round";
import { applyOutcome, arenaLevels, evaluateRound, failsOf, gateFor, levelBestOf, levelOf, type ArenaMode, type RoundOutcome } from "@/lib/practice/arena";
import type { GameProgress as PracticeProgress } from "@/lib/practice/progress-ext";

type Phase = { kind: "idle" } | { kind: "preparing"; mode: ArenaMode } | { kind: "playing"; mode: ArenaMode; level: number; round: Round };

const EMPTY: PracticeProgress = { xp: 0, streak: 0, freezeDays: 1 };

function modeFromUrl(): ArenaMode | null {
  const raw = new URLSearchParams(window.location.search).get("mode");
  if (raw === "matrix") return "matrix";
  if (raw === "time-machine" || raw === "timemachine") return "time-machine";
  if (raw === "math-duel" || raw === "math" || raw === "duel") return "math-duel";
  if (raw === "boss" || raw === "weekend-boss") return "boss";
  if (raw === "ict" || raw === "ict-lab" || raw === "smc") return "ict";
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
  return { entries, drawdownLeft, progress: (state.settings.practiceProgress ?? EMPTY) as PracticeProgress, updateSettings: state.updateSettings };
}

export default function PracticePage() {
  const allEntries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const { entries } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const progress = (settings.practiceProgress ?? EMPTY) as PracticeProgress;
  const today = todayKey();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const token = useRef(0);
  const deepLink = useRef<ArenaMode | null>(null);

  const levels = arenaLevels(progress);
  const usable = useMemo(() => entries.filter(isUsable), [entries]);
  const weekInfo = useMemo(() => weekTrades(entries), [entries]);

  const lock = (mode: ArenaMode): string | null => {
    if (mode === "math-duel" || mode === "ict") return null; // these need no journal data
    if (usable.length === 0) return "Add a trade to unlock this mode.";
    if (mode === "boss" && weekInfo.trades.length < 2) return "Needs two trades in the same week.";
    return null;
  };

  const start = async (mode: ArenaMode) => {
    const id = ++token.current;
    setNotice(null);
    setPhase({ kind: "preparing", mode });
    const snap = snapshot();
    const level = levelOf(snap.progress, mode);
    if (mode === "ict") {
      const ict = await prepareIctRound({ cards: snap.progress.ictCards ?? [], entries: snap.entries, progress: snap.progress, today, level });
      if (id !== token.current) return;
      if ("empty" in ict) { setPhase({ kind: "idle" }); setNotice(ict.empty); return; }
      // Keep the AI question styles on the cards so the next round starts instantly (and works offline).
      if (ict.freshVariants.size) void updateCards((cards) => cards.map((c) => { const f = ict.freshVariants.get(c.id); return f && cardHash(c) === f.hash ? { ...c, variants: f.variants, variantsFor: f.hash } : c; }));
      setPhase({ kind: "playing", mode, level, round: ict.round });
      return;
    }
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
    if (mode !== "math-duel" && mode !== "ict" && entries.length === 0) return; // wait for the journal to load
    deepLink.current = null;
    void start(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  /** Saves a finished round and returns the level change for the summary. */
  const finish = (mode: ArenaMode, level: number, result: RoundResult): RoundReport => {
    const snap = snapshot();
    const live = snap.progress;
    const outcome = evaluateRound({ mode, level, fails: failsOf(live, mode), correct: result.correct, answered: result.total, completed: result.completed });
    if (result.total === 0) return { outcome, extras: NO_EXTRAS };

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

    const draft: PracticeProgress = {
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

    // Game layer: quests, records, achievements — all derived from this round and the progress above.
    const before = questStates(live, today);
    const { records, broken } = updateRecords(live, { correct: result.correct, total: result.total, xp: result.xp, maxCombo: result.maxCombo, streak });
    const ictCorrect = result.answers.filter((a) => a.correct && isIctTag(a.tag)).length;
    draft.questLog = applyRoundToLog(live, today, { mode, passed: outcome.passed, maxCombo: result.maxCombo, correct: result.correct, total: result.total, ictCorrect });
    draft.records = records;
    const finished = markAllDone(draft, today);
    draft.questLog = finished.questLog;
    if (finished.first) draft.records = { ...records, questDays: records.questDays + 1 };
    draft.ictCards = applyCardResults(live.ictCards ?? [], result.answers.map((a) => ({ cardId: a.question.cardId, correct: a.correct })), today);
    const earned = newlyEarned(draft);
    draft.achievements = stamp(draft, earned, today);
    const next = draft;
    const after = questStates(next, today);
    const extras: RoundExtras = {
      newRecords: broken,
      unlocked: earned,
      questsDone: after.filter((q) => q.done && !before.find((b) => b.id === q.id)?.done).map((q) => q.id),
      streak,
      streakGrew: live.lastMissionDate !== today,
      allQuestsDone: allDone(after),
    };
    void snap.updateSettings({ practiceProgress: next });
    // Write the next round's AI questions in the background so it starts instantly.
    void warmBank({ mode, level: outcome.nextLevel, entries: snap.entries, progress: next, drawdownLeft: snap.drawdownLeft }).catch(() => undefined);
    return { outcome, extras };
  };

  const meterFor = (mode: ArenaMode) => {
    const gate = gateFor(mode, levels[mode]);
    return { value: Math.min(levelBestOf(progress, mode), gate.correct), goal: gate.correct, label: `${Math.min(levelBestOf(progress, mode), gate.correct)} of ${gate.correct} to reach Level ${levels[mode] + 1}` };
  };

  /** Claim a finished challenge (or the daily chest) for bonus XP. Read fresh from the store, like a round does. */
  const claimQuest = (id: string) => {
    const state = useApp.getState();
    const live = (state.settings.practiceProgress ?? EMPTY) as PracticeProgress;
    const { xp, questLog } = claim(live, today, id);
    if (!xp) return;
    const draft: PracticeProgress = { ...live, xp: live.xp + xp, questLog };
    draft.achievements = stamp(draft, newlyEarned(draft), today);
    void state.updateSettings({ practiceProgress: draft });
  };

  const busyMode = phase.kind === "preparing" ? phase.mode : null;
  const tmLock = lock("time-machine");
  const tmCharts = useMemo(() => usable.filter((e) => (e.images?.length ?? 0) > 0).length, [usable]);
  const tmPerf = progress.modePerformance?.["time-machine"];
  const cards = progress.ictCards ?? [];
  const asked = cards.reduce((n, c) => n + (c.seen ?? 0), 0);
  const right = cards.reduce((n, c) => n + (c.correct ?? 0), 0);
  const streak = displayStreak(progress, today);
  const level = xpLevel(progress.xp);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

  const week = useMemo(() => weekStrip(today, progress.completedMissionDates ?? []), [today, progress.completedMissionDates]);
  const quests = useMemo(() => questStates(progress, today), [progress, today]);
  const trophies = useMemo(() => achievementStates(progress), [progress]);
  const trophySpan = useMemo(() => spanDays(progress), [progress]);
  const todayXp = progress.dailyStats?.[today]?.xp ?? 0;

  // The coach only recommends what this page can start: Time Machine and ICT Lab.
  const recommended = useMemo(() => recommendMode({
    progress,
    locked: { matrix: "Not on this page", "math-duel": "Not on this page", boss: "Not on this page", "time-machine": tmLock, ict: cards.length > 0 ? null : "Add a question first" },
  }), [progress, tmLock, cards.length]);

  return (
    <div className="mx-auto w-full max-w-[1080px] pb-28 sm:pb-16">
      <header className="pr-rise flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[44px]">Practice</h1>
          <p className="mt-3 max-w-md text-[16px] leading-snug text-muted">Replay your own trades and drill the ideas you want to remember.</p>
        </div>
      </header>

      {notice && <p role="status" className="pr-surface mt-6 px-5 py-4 text-[14px] text-muted">{notice}</p>}

      <div className="pr-rise mt-9" style={{ "--i": 1 } as React.CSSProperties}>
        <PlayerHero rank={rankOf(progress.xp)} level={level} streak={streak} freezeDays={progress.freezeDays ?? 1} accuracy={overallAccuracy(progress)} todayXp={todayXp} goal={DAILY_XP_GOAL} week={week} />
      </div>

      <h2 className="pr-section-title pr-rise mt-14" style={{ "--i": 2 } as React.CSSProperties}>Train</h2>
      <div className="pr-grid pr-rise mt-5" style={{ "--i": 3 } as React.CSSProperties}>
        <SectionCard
          mode="time-machine"
          level={levels["time-machine"]}
          recommended={recommended?.mode === "time-machine"}
          blocked={tmLock}
          busy={busyMode === "time-machine"}
          stats={[{ label: tmCharts === 1 ? "chart" : "charts", value: tmCharts }, { label: "accuracy", value: pct(tmPerf?.correct ?? 0, tmPerf?.attempts ?? 0) }]}
          meter={tmLock ? undefined : meterFor("time-machine")}
          primary={{ label: "Start", onClick: () => void start("time-machine") }}
        />
        <SectionCard
          mode="ict"
          level={levels.ict}
          recommended={recommended?.mode === "ict"}
          busy={busyMode === "ict"}
          stats={[{ label: cards.length === 1 ? "question" : "questions", value: cards.length }, { label: "asked", value: asked }, { label: "accuracy", value: pct(right, asked) }]}
          primary={cards.length > 0 ? { label: "Play", onClick: () => void start("ict") } : { label: "Add your first question", href: "/practice/ict" }}
          secondary={{ label: cards.length > 0 ? "Manage questions" : "How it works", href: "/practice/ict" }}
        />
      </div>

      <h2 className="pr-section-title pr-rise mt-14" style={{ "--i": 4 } as React.CSSProperties}>Today</h2>
      <div className="pr-rise mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start" style={{ "--i": 5 } as React.CSSProperties}>
        <Challenges quests={quests} chestClaimed={chestClaimed(progress, today)} onClaim={claimQuest} />
        <TrophyCase states={trophies} today={today} span={trophySpan} hasStarted={(progress.completedMissionDates?.length ?? 0) > 0} />
      </div>

      {phase.kind === "preparing" && <PreparingScreen mode={phase.mode} onCancel={cancel} />}

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

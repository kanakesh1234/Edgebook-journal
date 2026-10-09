"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { computeStats } from "@/lib/stats";
import { todayKey } from "@/lib/format";
import Link from "next/link";
import { ModeCard, MODE_META } from "@/components/practice/mode-card";
import { PreparingScreen, SessionHero } from "@/components/practice/home";
import { Eyebrow, surface } from "@/components/practice/ui";
import { PlayerHero, type WeekDay } from "@/components/practice/player-hero";
import { DailyQuests } from "@/components/practice/quests";
import { AchievementGrid, nextUp } from "@/components/practice/trophies";
import { calendarGrid, WEEKDAY_LETTERS } from "@/lib/practice/consistency";
import { applyRoundToLog, claim, chestClaimed as chestClaimedOn, markAllDone, questStates, allDone } from "@/lib/practice/quests";
import { recordsOf, updateRecords } from "@/lib/practice/records";
import { achievementStates, newlyEarned, stamp } from "@/lib/practice/achievements";
import { isIctTag } from "@/lib/practice/ict";
import { NO_EXTRAS, type RoundExtras } from "@/lib/practice/rewards";
import { cn } from "@/lib/utils";
import { RoundRunner, type RoundResult, type RoundReport } from "@/components/practice/round-runner";
import { displayStreak, isUsable, nextStreak, rankOf, weekTrades } from "@/lib/practice/engine";
import { recordAnswers, rememberPrompts } from "@/lib/practice/history";
import { updateLedger } from "@/lib/practice/ledger";
import { addDailyStats } from "@/lib/practice/daily";
import { nextQuestionBank } from "@/lib/practice/bank";
import { DAILY_XP_GOAL, xpLevel } from "@/lib/practice/xp";
import { prepareRound, warmBank, type Round } from "@/lib/practice/round";
import { applyOutcome, arenaLevels, ARENA_MODES, evaluateRound, failsOf, gateFor, levelBestOf, levelOf, type ArenaMode, type RoundOutcome } from "@/lib/practice/arena";
import { overallAccuracy, recommendMode } from "@/lib/practice/coach";
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

  /** Claim a finished quest (or the daily chest) for bonus XP. */
  const claimQuest = (id: string) => {
    const snap = snapshot();
    const live = snap.progress;
    const { xp, questLog } = claim(live, today, id);
    if (!xp) return;
    const draft: PracticeProgress = { ...live, xp: live.xp + xp, questLog };
    draft.achievements = stamp(draft, newlyEarned(draft), today);
    void snap.updateSettings({ practiceProgress: draft });
  };

  const meterFor = (mode: ArenaMode) => {
    const gate = gateFor(mode, levels[mode]);
    return { value: Math.min(levelBestOf(progress, mode), gate.correct), goal: gate.correct, accuracy: gate.accuracy, nextLevel: levels[mode] + 1 };
  };

  const locks = useMemo(
    () => Object.fromEntries(ARENA_MODES.map((mode) => [mode, lock(mode)])) as Record<ArenaMode, string | null>,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [usable.length, weekInfo.trades.length],
  );
  const recommended = useMemo(() => recommendMode({ progress, locked: locks }), [progress, locks]);
  const busyMode = phase.kind === "preparing" ? phase.mode : null;

  const quests = useMemo(() => questStates(progress, today), [progress, today]);
  const chestDone = chestClaimedOn(progress, today);
  const trophies = useMemo(() => achievementStates(progress), [progress]);
  const records = recordsOf(progress);
  const week: WeekDay[] = useMemo(() => {
    const trained = new Set(progress.completedMissionDates ?? []);
    return calendarGrid(today, 1).map((cell, i) => ({ key: cell.key, letter: WEEKDAY_LETTERS[i]!, trained: (progress.dailyStats?.[cell.key]?.total ?? 0) > 0 || trained.has(cell.key), today: cell.key === today, future: cell.future }));
  }, [progress.dailyStats, progress.completedMissionDates, today]);
  const unlockedCount = trophies.filter((t) => t.unlocked).length;

  return (
    <div className="mx-auto max-w-5xl pb-24">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-4 pt-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-gold">Practice</p>
          <h1 className="mt-3 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[52px]">Train on your own trades.</h1>
          <p className="mt-4 max-w-xl text-[17px] leading-snug text-muted">Sixty-second rounds, written fresh from your journal. Difficulty finds you.</p>
        </div>
        <Link href="/practice/progress" className="inline-flex h-10 items-center gap-1.5 rounded-full border border-line-strong bg-raised px-4 text-[13.5px] font-medium text-ink transition-colors hover:border-gold-strong">
          Your progress <span aria-hidden className="text-muted">→</span>
        </Link>
      </header>

      <div className="mt-9 space-y-4">
        <PlayerHero rank={rankOf(progress.xp)} level={xpLevel(progress.xp)} streak={displayStreak(progress, today)} freezeDays={progress.freezeDays ?? 1} accuracy={overallAccuracy(progress)} todayXp={progress.dailyStats?.[today]?.xp ?? 0} goal={DAILY_XP_GOAL} week={week} />

        {notice && <p role="status" className="rounded-[18px] border border-line bg-surface px-5 py-4 text-[14px] text-muted">{notice}</p>}

        {recommended && (
          <SessionHero mode={recommended.mode} level={levels[recommended.mode]} reason={recommended.reason} meter={meterFor(recommended.mode)} busy={busyMode === recommended.mode} onStart={() => void start(recommended.mode)} />
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <DailyQuests quests={quests} chestClaimed={chestDone} onClaim={claimQuest} />
        <section className={cn(surface.material, "flex flex-col rounded-[28px] p-6 sm:p-7")} aria-labelledby="next-heading">
          <div className="flex items-baseline justify-between gap-3">
            <Eyebrow><span id="next-heading">Achievements</span></Eyebrow>
            <p className="num text-[12px] text-faint">{unlockedCount} of {trophies.length} unlocked</p>
          </div>
          {nextUp(trophies, 3).length > 0 ? (
            <div className="mt-4"><AchievementGrid states={nextUp(trophies, 3)} /></div>
          ) : (
            <p className="mt-4 text-[14px] text-muted">Every achievement unlocked. Remarkable.</p>
          )}
          <div className="mt-auto flex items-center justify-between gap-4 pt-5 text-[12.5px] text-muted">
            <span className="num">{records.rounds} {records.rounds === 1 ? "round" : "rounds"} played{records.bestCombo > 0 ? ` · best flow ×${records.bestCombo}` : ""}</span>
            <Link href="/practice/progress" className="font-semibold text-gold hover:underline">All achievements & records →</Link>
          </div>
        </section>
      </div>

      <div className="mt-12 flex items-baseline justify-between"><Eyebrow>All modes</Eyebrow></div>
      <div className="mt-4 grid gap-5 sm:grid-cols-2">
        {ARENA_MODES.map((mode) => (
          <ModeCard
            key={mode}
            mode={mode}
            level={levels[mode]}
            status={locks[mode] ?? ""}
            disabled={!!locks[mode]}
            busy={busyMode === mode}
            meter={locks[mode] ? undefined : meterFor(mode)}
            meta={mode === "boss" && !locks[mode] ? weekInfo.label : undefined}
            className={mode === "ict" ? "sm:col-span-2" : undefined}
            onStart={() => void start(mode)}
          />
        ))}
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

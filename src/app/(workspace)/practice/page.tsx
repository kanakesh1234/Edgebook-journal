"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { computeStats } from "@/lib/stats";
import { formatSignedMoney, todayKey } from "@/lib/format";
import { isIctTag } from "@/lib/practice/ict";
import { NO_EXTRAS, type RoundExtras } from "@/lib/practice/rewards";
import { PreparingScreen } from "@/components/practice/home";
import { MODE_META } from "@/components/practice/modes";
import { SectionCard } from "@/components/practice/section-card";
import { buildWeek, thisWeekStart } from "@/lib/weekly";
import { PlayerHero, weekStrip } from "@/components/practice/player-hero";
import "@/components/practice/practice.css";
import { applyRoundToLog, markAllDone, questStates, allDone } from "@/lib/practice/quests";
import { overallAccuracy } from "@/lib/practice/coach";
import { newlyEarned, stamp } from "@/lib/practice/achievements";
import { updateRecords } from "@/lib/practice/records";
import { prepareIctRound } from "@/lib/practice/ict-round";
import { applyCardResults, cardHash } from "@/lib/practice/ict-cards";
import { updateCards } from "@/lib/practice/ict-store";
import { RoundRunner, type RoundResult, type RoundReport } from "@/components/practice/round-runner";
import { displayStreak, isUsable, nextStreak, rankOf, weekTrades } from "@/lib/practice/engine";
import { recordAnswers, rememberPrompts } from "@/lib/practice/history";
import { fpKey, updateLedger } from "@/lib/practice/ledger";
import { pruneRevision, revisitIds, updateRevision } from "@/lib/practice/focus";
import { addDailyStats } from "@/lib/practice/daily";
import { nextQuestionBank } from "@/lib/practice/bank";
import { DAILY_XP_GOAL, xpLevel } from "@/lib/practice/xp";
import { prepareRound, warmBank, type Round } from "@/lib/practice/round";
import { applyOutcome, evaluateRound, failsOf, levelOf, type ArenaMode } from "@/lib/practice/arena";
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

  const plans = useApp((s) => s.plans);
  const dayLimits = useApp((s) => s.settings.dayLimits);
  const thisWeek = useMemo(() => buildWeek(allEntries, plans, thisWeekStart(), dayLimits), [allEntries, plans, dayLimits]);
  const usable = useMemo(() => entries.filter(isUsable), [entries]);
  const weekInfo = useMemo(() => weekTrades(entries), [entries]);

  const lock = (mode: ArenaMode): string | null => {
    if (mode === "math-duel" || mode === "ict") return null; // these need no journal data
    if (usable.length === 0) return "Log a trade in Journal to unlock this arena.";
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
      if (ict.freshVariants.size) void updateCards((cards) => cards.map((c) => { const f = ict.freshVariants.get(c.id); return f && cardHash(c) === f.hash ? { ...c, variants: f.variants, variantsFor: f.hash } : c; }));
      setPhase({ kind: "playing", mode, level, round: ict.round });
      return;
    }
    const prepared = await prepareRound({ mode, level, entries: snap.entries, progress: snap.progress, drawdownLeft: snap.drawdownLeft });
    if (id !== token.current) { if ("round" in prepared) prepared.round.discard(); return; }
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
    if (mode !== "math-duel" && mode !== "ict" && entries.length === 0) return;
    deepLink.current = null;
    void start(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries.length]);

  /** Saves a finished round and returns the level change for the summary. */
  const finish = (mode: ArenaMode, level: number, result: RoundResult): RoundReport => {
    const snap = snapshot();
    const live = snap.progress;
    const outcome = evaluateRound({ mode, level, fails: failsOf(live, mode), correct: result.correct, answered: result.total, completed: result.completed, exhausted: result.exhausted });
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

    const revisit = revisitIds(snap.entries);
    const { revision, mastered } = updateRevision(live, result.answers.map((a) => ({ key: fpKey(a.fp), correct: a.correct, tradeId: a.question.tradeId })), today, revisit);
    const retire = (a: { fp: string; question: { tradeId?: string } }) => !(a.question.tradeId && revisit.has(a.question.tradeId)) || mastered.has(fpKey(a.fp));

    const draft: PracticeProgress = {
      ...live,
      xp: live.xp + result.xp,
      streak, freezeDays, lastMissionDate: today,
      completedMissionDates: [...new Set([...(live.completedMissionDates ?? []), today])].slice(-90),
      masteryByTag: mastery,
      modePerformance: perf,
      seenQuestions: recordAnswers(live, result.answers.map((a) => ({ fp: a.fp, tag: a.tag, correct: a.correct })), today),
      ledger: updateLedger(live, result.answers.map((a) => ({ fp: a.fp, correct: a.correct, retire: retire(a) }))),
      revision: pruneRevision(revision, new Set(snap.entries.map((e) => e.id))),
      questionBank: nextQuestionBank(live, result.answers.map((a) => ({ question: a.question, correct: a.correct }))),
      perfectSets: (live.perfectSets ?? 0) + (result.total >= 3 && result.correct === result.total ? 1 : 0),
      dailyStats: addDailyStats(live, today, { xp: result.xp, correct: result.correct, total: result.total }),
      arena: applyOutcome(live, mode, outcome, result.correct),
      mathDuel: duelSigns.length ? { ...(live.mathDuel ?? {}), recentSignatures: [...(live.mathDuel?.recentSignatures ?? []), ...duelSigns].slice(-3000) } : live.mathDuel,
    };

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
    void warmBank({ mode, level: outcome.nextLevel, entries: snap.entries, progress: next, drawdownLeft: snap.drawdownLeft }).catch(() => undefined);
    return { outcome, extras };
  };

  const busyMode = phase.kind === "preparing" ? phase.mode : null;
  const tmLock = lock("time-machine");
  const matrixLock = lock("matrix");
  const bossLock = lock("boss");
  const duelLock = lock("math-duel");

  const cards = progress.ictCards ?? [];
  const streak = displayStreak(progress, today);
  const level = xpLevel(progress.xp);
  const accuracy = overallAccuracy(progress);

  const week = useMemo(() => weekStrip(today, progress.completedMissionDates ?? []), [today, progress.completedMissionDates]);
  const todayXp = progress.dailyStats?.[today]?.xp ?? 0;

  return (
    <div className="mx-auto w-full max-w-[1440px] pb-28 sm:pb-16">
      <header className="pr-rise">
        <h1 className="font-display text-[36px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[46px]">Practice</h1>
        <p className="mt-2.5 max-w-xl text-[16px] leading-snug text-muted">
          Five focused training folders, built from your trades. Clear a gate to level up.
        </p>
      </header>

      {notice && <p role="status" className="pr-surface mt-6 px-5 py-4 text-[14px] text-muted">{notice}</p>}

      <div className="mt-8">
        <PlayerHero
          rank={rankOf(progress.xp)}
          level={level}
          streak={streak}
          freezeDays={progress.freezeDays ?? 1}
          accuracy={accuracy}
          todayXp={todayXp}
          goal={DAILY_XP_GOAL}
          week={week}
        />
      </div>

      <h2 className="pr-section-title pr-rise mt-12" style={{ ["--i" as string]: 2 }}>Train</h2>
      <div className="pr-grid mt-4">
        <SectionCard
          mode="time-machine"
          blocked={tmLock}
          busy={busyMode === "time-machine"}
          primary={{ label: "Start", onClick: () => void start("time-machine") }}
        />

        <SectionCard
          mode="matrix"
          blocked={matrixLock}
          busy={busyMode === "matrix"}
          primary={{ label: "Start", onClick: () => void start("matrix") }}
        />

        <SectionCard
          mode="ict"
          busy={busyMode === "ict"}
          primary={
            cards.length > 0
              ? { label: "Start", onClick: () => void start("ict") }
              : { label: "Add question", href: "/practice/ict" }
          }
        />

        <SectionCard
          mode="math-duel"
          blocked={duelLock}
          busy={busyMode === "math-duel"}
          primary={{ label: "Start", onClick: () => void start("math-duel") }}
        />

        <SectionCard
          mode="boss"
          blocked={bossLock}
          busy={busyMode === "boss"}
          primary={{ label: "Start", onClick: () => void start("boss") }}
        />
      </div>

      <h2 className="pr-section-title pr-rise mt-14" style={{ ["--i" as string]: 4 }}>Reflect</h2>
      <Link
        href="/practice/weekly"
        className="pr-surface pr-rise group mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.995]"
        style={{ ["--i" as string]: 5 }}
      >
        <div className="min-w-0 flex-1">
          <p className="text-[18px] font-semibold tracking-[-0.02em] text-ink">Weekly review</p>
          <p className="mt-1 max-w-[52ch] text-[14px] leading-snug text-muted">
            {thisWeek.count === 0 ? "Your week in numbers: P&L, plan discipline, loss limits, and mistakes." : thisWeek.insights[0]?.text}
          </p>
        </div>
        <dl className="flex items-center gap-6 text-right">
          <div>
            <dd className={`kpi text-[20px] tabular-nums ${thisWeek.net > 0 ? "text-profit" : thisWeek.net < 0 ? "text-loss" : "text-ink"}`}>
              {formatSignedMoney(thisWeek.net, settings.currency, { compact: true })}
            </dd>
            <dt className="text-[11px] uppercase tracking-[.1em] text-faint">This week</dt>
          </div>
          <div>
            <dd className="kpi text-[20px] tabular-nums text-ink">
              {thisWeek.plan.adherence == null ? "—" : `${Math.round(thisWeek.plan.adherence * 100)}%`}
            </dd>
            <dt className="text-[11px] uppercase tracking-[.1em] text-faint">Plan</dt>
          </div>
        </dl>
        <span aria-hidden className="text-[20px] text-faint transition-transform group-hover:translate-x-0.5">›</span>
      </Link>

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

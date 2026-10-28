"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
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
import { fpKey, updateLedger } from "@/lib/practice/ledger";
import { pruneRevision, revisitIds, updateRevision } from "@/lib/practice/focus";
import { addDailyStats } from "@/lib/practice/daily";
import { nextQuestionBank } from "@/lib/practice/bank";
import { DAILY_XP_GOAL, xpLevel } from "@/lib/practice/xp";
import { prepareRound, warmBank, type Round } from "@/lib/practice/round";
import { applyOutcome, arenaLevels, evaluateRound, failsOf, gateFor, levelBestOf, levelOf, type ArenaMode } from "@/lib/practice/arena";
import type { GameProgress as PracticeProgress } from "@/lib/practice/progress-ext";
import { Sym } from "@/components/journal/symbols";
import { EASE } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

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
  const aiBrain = settings.aiBrain;
  const { entries } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const progress = (settings.practiceProgress ?? EMPTY) as PracticeProgress;
  const today = todayKey();

  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [notice, setNotice] = useState<string | null>(null);
  const token = useRef(0);
  const deepLink = useRef<ArenaMode | null>(null);

  const levels = arenaLevels(progress);
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

  const meterFor = (mode: ArenaMode) => {
    const gate = gateFor(mode, levels[mode]);
    return { value: Math.min(levelBestOf(progress, mode), gate.correct), goal: gate.correct, label: `${Math.min(levelBestOf(progress, mode), gate.correct)} of ${gate.correct} to reach Level ${levels[mode] + 1}` };
  };

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
  const matrixLock = lock("matrix");
  const bossLock = lock("boss");
  const duelLock = lock("math-duel");

  const tmCharts = useMemo(() => usable.filter((e) => (e.images?.length ?? 0) > 0).length, [usable]);
  const tmPerf = progress.modePerformance?.["time-machine"];
  const matrixPerf = progress.modePerformance?.["matrix"];
  const duelPerf = progress.modePerformance?.["math-duel"];
  const bossPerf = progress.modePerformance?.["boss"];

  const cards = progress.ictCards ?? [];
  const asked = cards.reduce((n, c) => n + (c.seen ?? 0), 0);
  const right = cards.reduce((n, c) => n + (c.correct ?? 0), 0);
  const streak = displayStreak(progress, today);
  const level = xpLevel(progress.xp);
  const accuracy = overallAccuracy(progress);
  const pct = (a: number, b: number) => (b > 0 ? `${Math.round((a / b) * 100)}%` : "—");

  const week = useMemo(() => weekStrip(today, progress.completedMissionDates ?? []), [today, progress.completedMissionDates]);
  const quests = useMemo(() => questStates(progress, today), [progress, today]);
  const trophies = useMemo(() => achievementStates(progress), [progress]);
  const trophySpan = useMemo(() => spanDays(progress), [progress]);
  const todayXp = progress.dailyStats?.[today]?.xp ?? 0;

  // Spaced-repetition mistake telemetry
  const revisionStats = useMemo(() => {
    const rev = Object.values(progress.revision ?? {});
    const dueNow = rev.filter((r) => r.box < 5 && r.due <= today).length;
    const inSchedule = rev.filter((r) => r.box > 0 && r.box < 5).length;
    const mastered = rev.filter((r) => r.box >= 5).length;
    const mistakeTrades = entries.filter((e) => e.pnl < 0 || !!e.review?.followUp?.mistakeCategory).length;
    return { dueNow, inSchedule, mastered, mistakeTrades };
  }, [progress.revision, today, entries]);

  // 5-Axis Edge Mastery Matrix derived from real practice & journal evidence
  const skillAxes = useMemo(() => {
    const m = progress.masteryByTag ?? {};
    const reviewedCount = entries.filter((e) => e.reviewStatus === "reviewed").length;
    const planLinked = plans.filter((p) => p.status === "executed").length;
    const clamp = (v: number) => Math.min(100, Math.max(18, Math.round(v)));

    return [
      {
        label: "Setup & Criteria",
        score: clamp(32 + (m["setup"] ?? 0) * 8 + (m["ict"] ?? 0) * 6 + planLinked * 5),
        note: "Pre-trade checklist & ICT recognition",
        color: "var(--gold-strong)",
      },
      {
        label: "Entry Timing & Patience",
        score: clamp(30 + (tmPerf?.correct ?? 0) * 5 + (m["timing"] ?? 0) * 8),
        note: "Waiting for displacement & sweep",
        color: "var(--profit)",
      },
      {
        label: "Risk & Stop Sizing",
        score: clamp(35 + (duelPerf?.correct ?? 0) * 5 + (m["risk"] ?? 0) * 8),
        note: "Position sizing, R-multiple & drawdown math",
        color: "var(--info)",
      },
      {
        label: "Autopsy & Pattern Recall",
        score: clamp(28 + (matrixPerf?.correct ?? 0) * 6 + reviewedCount * 4),
        note: "Remembering lessons from past trades",
        color: "var(--gold)",
      },
      {
        label: "Emotional Discipline",
        score: clamp(34 + streak * 7 + (bossPerf?.correct ?? 0) * 6),
        note: "Zero tilt after losses & rule adherence",
        color: "var(--profit-deep)",
      },
    ];
  }, [progress.masteryByTag, entries, plans, tmPerf, duelPerf, matrixPerf, bossPerf, streak]);

  const recommended = useMemo(
    () =>
      recommendMode({
        progress,
        locked: {
          matrix: matrixLock,
          "math-duel": duelLock,
          boss: bossLock,
          "time-machine": tmLock,
          ict: cards.length > 0 ? null : "Add a question first",
        },
      }),
    [progress, matrixLock, duelLock, bossLock, tmLock, cards.length],
  );

  const recommendedMode: ArenaMode = recommended?.mode ?? (usable.length > 0 ? "time-machine" : "math-duel");
  const topLeakLabel = thisWeek.mistakes[0]?.label ?? "Premature Entry & Risk Sizing";

  return (
    <div className="mx-auto w-full max-w-[1120px] pb-28 sm:pb-16">
      {/* Apple HIG Editorial Header */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: EASE }}
        className="flex flex-wrap items-end justify-between gap-4"
      >
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 text-[11.5px] font-semibold text-muted">
            <span className="h-2 w-2 rounded-full bg-profit" />
            <span>Neural Practice Studio · Powered by Google Drive AI Brain</span>
          </div>
          <h1 className="mt-3 font-display text-[36px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[46px]">
            Practice &amp; Edge Mastery
          </h1>
          <p className="mt-2.5 max-w-2xl text-[15.5px] leading-snug text-muted">
            Your trades, plans, and autopsies are converted by the AI Brain into spaced-repetition drills—so every mistake becomes permanent muscle memory.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            href="/practice/ict"
            className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-raised px-4 text-[13px] font-semibold text-ink transition-all hover:border-line-strong active:scale-95"
          >
            <Sym name="bulb" className="h-4 w-4 text-gold" />
            <span>ICT Flashcards ({cards.length})</span>
          </Link>
          <Link
            href="/practice/weekly"
            className="inline-flex h-10 items-center gap-2 rounded-full bg-ink px-4 text-[13px] font-semibold text-canvas transition-all hover:opacity-90 active:scale-95"
          >
            <Sym name="calendar" className="h-4 w-4" />
            <span>Weekly Check-In</span>
          </Link>
        </div>
      </motion.header>

      {notice && <p role="status" className="pr-surface mt-6 px-5 py-4 text-[14px] text-muted">{notice}</p>}

      {/* Layer 1: AI Brain Neural Coach & How AI Works Studio Card */}
      <motion.section
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.52, delay: 0.06, ease: EASE }}
        aria-label="How AI Powers Your Practice"
        className={cn(
          "relative mt-7 overflow-hidden rounded-[28px] border border-line p-6 sm:p-7",
          "bg-gradient-to-br from-gold/[0.09] via-surface to-profit/[0.06] shadow-panel",
          "dark:border-line-strong dark:from-gold/[0.12] dark:via-surface dark:to-profit/[0.07]",
        )}
      >
        <div className="grid gap-6 lg:grid-cols-[1.25fr_1fr] lg:items-center">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-gold-strong px-3 py-1 text-[11.5px] font-semibold text-on-gold shadow-sm">
                <Sym name="sparkles" className="h-3.5 w-3.5" />
                <span>AI Brain Neural Coach</span>
              </span>
              <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11.5px] font-semibold text-gold-deep dark:text-gold">
                {aiBrain ? `${aiBrain.tier} · ${aiBrain.calibrationPct}% Calibrated` : "Adaptive Mode"}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-profit/12 px-2.5 py-0.5 text-[11px] font-semibold text-profit">
                <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                Drive Synced
              </span>
            </div>

            <h2 className="mt-3.5 font-display text-[24px] font-semibold leading-tight tracking-[-0.025em] text-ink sm:text-[28px]">
              {recommended?.reason ?? `Target today's focus: ${ MODE_META[recommendedMode].title }`}
            </h2>
            <p className="mt-2 max-w-xl text-[14px] leading-relaxed text-muted">
              The AI Brain continuously reads your <strong className="font-semibold text-ink">Plan → Thought → Setup → Autopsy</strong> chain in Google Drive. When a trade is tagged with a mistake (like <span className="font-medium text-ink">{topLeakLabel}</span>), it schedules spaced-repetition drills across Boxes 0–5 until you answer 5 consecutive times without error.
            </p>

            {/* 3-Step AI Pipeline Pills */}
            <div className="mt-5 grid gap-2.5 sm:grid-cols-3">
              {[
                {
                  step: "01 · Drive Sync",
                  title: "Plan → Autopsy Evidence",
                  sub: `${allEntries.length} trades & ${plans.length} plans indexed`,
                },
                {
                  step: "02 · AI Synthesis",
                  title: "Personal Mistake Drills",
                  sub: `${revisionStats.mistakeTrades} mistake trades converted`,
                },
                {
                  step: "03 · Box 0–5 Mastery",
                  title: "Spaced Repetition",
                  sub: `${revisionStats.dueNow} due now · ${revisionStats.mastered} mastered`,
                },
              ].map((item, idx) => (
                <motion.div
                  key={item.step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.14 + idx * 0.07, ease: EASE }}
                  className="rounded-[18px] border border-line-soft bg-surface/90 px-3.5 py-3"
                >
                  <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gold-deep dark:text-gold">
                    {item.step}
                  </p>
                  <p className="mt-1 text-[13.5px] font-semibold text-ink">{item.title}</p>
                  <p className="mt-0.5 text-[11.5px] text-muted">{item.sub}</p>
                </motion.div>
              ))}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void start(recommendedMode)}
                disabled={busyMode !== null}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-gold-strong px-6 text-[14px] font-semibold text-on-gold shadow-sm transition-all hover:bg-gold-strong-hover active:scale-95 disabled:opacity-50"
              >
                <Sym name="sparkles" className="h-4 w-4" />
                <span>
                  {busyMode === recommendedMode
                    ? "Preparing AI Session…"
                    : `Start Recommended: ${MODE_META[recommendedMode].title} (Lv ${levels[recommendedMode]})`}
                </span>
              </button>
              <span className="text-[12.5px] text-muted">
                +{DAILY_XP_GOAL - Math.min(DAILY_XP_GOAL, todayXp) > 0 ? `${DAILY_XP_GOAL - Math.min(DAILY_XP_GOAL, todayXp)} XP to daily goal` : "Daily XP goal complete ✓"}
              </span>
            </div>
          </div>

          {/* Right Column: 5-Axis Edge Mastery Matrix */}
          <div className="rounded-[22px] border border-line-soft bg-surface/95 p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-faint">Edge Telemetry</p>
                <h3 className="mt-0.5 text-[16px] font-semibold tracking-[-0.015em] text-ink">5-Axis Skill Calibration</h3>
              </div>
              <span className="num rounded-full bg-gold/15 px-2.5 py-1 text-[12px] font-semibold text-gold">
                {accuracy != null ? `${accuracy}% Accuracy` : `Rank: ${rankOf(progress.xp)}`}
              </span>
            </div>

            <div className="mt-4 space-y-3.5">
              {skillAxes.map((axis, idx) => (
                <div key={axis.label}>
                  <div className="flex items-baseline justify-between gap-2 text-[13px]">
                    <span className="font-medium text-ink">{axis.label}</span>
                    <span className="num font-mono text-[12.5px] font-semibold text-muted">{axis.score}%</span>
                  </div>
                  <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-ink/[0.06]">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${axis.score}%` }}
                      transition={{ duration: 0.85, delay: 0.2 + idx * 0.08, ease: EASE }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: axis.color }}
                    />
                  </div>
                  <p className="mt-0.5 text-[11px] text-faint">{axis.note}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </motion.section>

      {/* Layer 2: Player Hero & 7-Day Consistency Strip */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, delay: 0.14, ease: EASE }}
        className="mt-6"
      >
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
      </motion.div>

      {/* Layer 3: All 5 Training Arenas (Bento Grid) */}
      <div className="mt-12 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">5 Interactive Arenas</p>
          <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em] text-ink">
            Choose Your Training Arena
          </h2>
        </div>
        <p className="text-[13.5px] text-muted">
          Adaptive Solo-Leveling progression — clear the gate to advance levels.
        </p>
      </div>

      <div className="pr-grid mt-5">
        <SectionCard
          mode="time-machine"
          level={levels["time-machine"]}
          recommended={recommendedMode === "time-machine"}
          blocked={tmLock}
          busy={busyMode === "time-machine"}
          stats={[
            { label: tmCharts === 1 ? "chart" : "charts", value: tmCharts },
            { label: "accuracy", value: pct(tmPerf?.correct ?? 0, tmPerf?.attempts ?? 0) },
          ]}
          meter={tmLock ? undefined : meterFor("time-machine")}
          primary={{ label: "Enter Time Machine", onClick: () => void start("time-machine") }}
        />

        <SectionCard
          mode="matrix"
          level={levels.matrix}
          recommended={recommendedMode === "matrix"}
          blocked={matrixLock}
          busy={busyMode === "matrix"}
          stats={[
            { label: usable.length === 1 ? "trade" : "trades", value: usable.length },
            { label: "due now", value: revisionStats.dueNow },
            { label: "accuracy", value: pct(matrixPerf?.correct ?? 0, matrixPerf?.attempts ?? 0) },
          ]}
          meter={matrixLock ? undefined : meterFor("matrix")}
          primary={{ label: "Start Trade Recall", onClick: () => void start("matrix") }}
        />

        <SectionCard
          mode="ict"
          level={levels.ict}
          recommended={recommendedMode === "ict"}
          busy={busyMode === "ict"}
          stats={[
            { label: cards.length === 1 ? "card" : "cards", value: cards.length },
            { label: "drilled", value: asked },
            { label: "accuracy", value: pct(right, asked) },
          ]}
          meter={cards.length > 0 ? meterFor("ict") : undefined}
          primary={
            cards.length > 0
              ? { label: "Start ICT Lab", onClick: () => void start("ict") }
              : { label: "Add your first question", href: "/practice/ict" }
          }
          secondary={{ label: cards.length > 0 ? "Manage cards" : "How it works", href: "/practice/ict" }}
        />

        <SectionCard
          mode="math-duel"
          level={levels["math-duel"]}
          recommended={recommendedMode === "math-duel"}
          blocked={duelLock}
          busy={busyMode === "math-duel"}
          stats={[
            { label: "rounds", value: duelPerf?.attempts ?? 0 },
            { label: "accuracy", value: pct(duelPerf?.correct ?? 0, duelPerf?.attempts ?? 0) },
          ]}
          meter={ meterFor("math-duel") }
          primary={{ label: "Start Risk Math", onClick: () => void start("math-duel") }}
        />

        <SectionCard
          mode="boss"
          level={levels.boss}
          recommended={recommendedMode === "boss"}
          blocked={bossLock}
          busy={busyMode === "boss"}
          stats={[
            { label: "week trades", value: weekInfo.trades.length },
            { label: "accuracy", value: pct(bossPerf?.correct ?? 0, bossPerf?.attempts ?? 0) },
          ]}
          meter={bossLock ? undefined : meterFor("boss")}
          primary={{ label: "Challenge Week Boss", onClick: () => void start("boss") }}
        />
      </div>

      {/* Layer 4: Weekly Review & Process Check-In */}
      <h2 className="pr-section-title mt-14">Weekly Process Check-In</h2>
      <Link
        href="/practice/weekly"
        className="pr-surface group mt-4 flex flex-wrap items-center gap-x-8 gap-y-4 px-6 py-5 transition-transform duration-200 hover:-translate-y-0.5 active:scale-[0.995]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="text-[18px] font-semibold tracking-[-0.02em] text-ink">2-Minute Weekly Practice Review</p>
            <span className="rounded-full bg-gold/15 px-2.5 py-0.5 text-[11px] font-semibold text-gold">Anti-Procrastination</span>
          </div>
          <p className="mt-1 max-w-[56ch] text-[14px] leading-snug text-muted">
            {thisWeek.count === 0
              ? "Your week in numbers: P&L, plan discipline, loss limits, and one-tap AI reflection chips."
              : thisWeek.insights[0]?.text}
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

      {/* Layer 5: Daily Quests & Trophy Shelf */}
      <h2 className="pr-section-title mt-14">Daily Missions &amp; Milestones</h2>
      <div className="mt-4 grid gap-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:items-start">
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

"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { computeStats } from "@/lib/stats";
import { todayKey } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { MathDuel } from "@/components/practice/MathDuel";
import { DrillRunner, type DrillResult } from "@/components/practice/DrillRunner";
import {
  LEVELS, LEVEL_MASTERY_KEY, buildPool, displayStreak, fmtMoney, isUsable, levelFromProgress, nextStreak, rankOf, tradeLabel, weekTrades,
  type GameMode, type Level, type PracticeQuestion,
} from "@/lib/practice/engine";
import { orderByFreshness, recentPrompts, recordAnswers, rememberPrompts } from "@/lib/practice/history";
import { addDailyStats } from "@/lib/practice/daily";
import { fetchAiQuestions } from "@/lib/practice/ai-client";
import type { JournalEntry, PracticeProgress } from "@/lib/types";

type Mode = "matrix" | "time-machine" | "math-duel" | "boss";
type LevelPick = 0 | Level;
type MatrixFilter = "all" | "untested" | "needs-work" | "strong";

const MODES: { id: Mode; title: string; blurb: string; icon: string; tone: string }[] = [
  { id: "matrix", title: "Matrix", blurb: "Revisit and test your real trades.", icon: "✦", tone: "border-indigo-400/40 bg-indigo-500/10" },
  { id: "time-machine", title: "Time Machine", blurb: "Practice recorded process decisions.", icon: "◎", tone: "border-emerald-400/40 bg-emerald-500/10" },
  { id: "math-duel", title: "Math Duel", blurb: "Calculation fluency from your risk data.", icon: "♜", tone: "border-amber-400/50 bg-amber-500/10" },
  { id: "boss", title: "Weekend Boss", blurb: "Combine this week's real trades.", icon: "◈", tone: "border-rose-400/40 bg-rose-500/10" },
];
const COUNTS = [5, 8, 10, 15] as const;
const FILTERS: { id: MatrixFilter; label: string }[] = [
  { id: "all", label: "All trades" }, { id: "untested", label: "Untested" }, { id: "needs-work", label: "Needs work" }, { id: "strong", label: "Strong" },
];

function modeFromUrl(): Mode {
  const raw = new URLSearchParams(window.location.search).get("mode");
  if (raw === "time-machine" || raw === "timemachine") return "time-machine";
  if (raw === "math-duel" || raw === "math" || raw === "duel") return "math-duel";
  if (raw === "boss" || raw === "weekend-boss") return "boss";
  return "matrix";
}

interface Session {
  title: string;
  kind: GameMode;
  pool: PracticeQuestion[];
  count: number;
  startLevel: Level;
  tradeId?: string;
  retry: () => void;
}

export default function PracticePage() {
  const allEntries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const updateSettings = useApp((s) => s.updateSettings);

  const { entries, challenge } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const progress: PracticeProgress = settings.practiceProgress ?? { xp: 0, streak: 0, freezeDays: 1 };
  const today = todayKey();

  const [mode, setModeState] = useState<Mode>("matrix");
  const [levelPick, setLevelPick] = useState<LevelPick>(0);
  const [count, setCount] = useState<number>(8);
  const [aiOn, setAiOn] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [filter, setFilter] = useState<MatrixFilter>("all");
  const [shown, setShown] = useState(25);

  useEffect(() => { setModeState(modeFromUrl()); }, []);
  const setMode = (next: Mode) => {
    setModeState(next);
    setNotice(null);
    try { window.history.replaceState(null, "", `/practice?mode=${next}`); } catch { /* optional */ }
  };

  const autoLevel = levelFromProgress(progress);
  const level: Level = levelPick || autoLevel;
  const usable = useMemo(() => entries.filter(isUsable).sort((a, b) => b.date.localeCompare(a.date) || b.updatedAt - a.updatedAt), [entries]);
  const week = useMemo(() => weekTrades(entries), [entries]);
  const drawdownLeft = useMemo(() => {
    const limit = challenge?.maxDrawdown ?? settings.maxDrawdown;
    return limit > 0 ? Math.max(0, limit - stats.drawdown) : null;
  }, [challenge?.maxDrawdown, settings.maxDrawdown, stats.drawdown]);

  const weakTags = useMemo(() => [...new Set((progress.seenQuestions ?? []).filter((s) => s.variant === 1).map((s) => s.format))].slice(-5), [progress.seenQuestions]);
  const perf = progress.modePerformance ?? {};

  const launch = async (kind: GameMode, trades: JournalEntry[], title: string, n: number, tradeId?: string) => {
    setBusy(title);
    setNotice(null);
    const seed = (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
    const local = buildPool({ mode: kind, trades, all: entries, seed, drawdownLeft });
    let ai: PracticeQuestion[] = [];
    if (aiOn) {
      const evidenceTrades = kind === "matrix" ? trades.slice(0, 1) : [...trades].sort((a, b) => Number(!!b.notes || !!b.reflection?.lesson) - Number(!!a.notes || !!a.reflection?.lesson) || b.date.localeCompare(a.date)).slice(0, 8);
      const result = await fetchAiQuestions({ mode: kind, level, count: Math.max(8, n), trades: evidenceTrades, avoid: recentPrompts(), weakTags });
      ai = result.questions;
      if (result.note) setNotice(result.note);
    }
    const blended: PracticeQuestion[] = [];
    for (let i = 0; i < Math.max(ai.length, local.length); i++) { if (ai[i]) blended.push(ai[i]!); if (local[i]) blended.push(local[i]!); }
    const pool = orderByFreshness(blended, progress, today);
    setBusy(null);
    if (pool.length < 3) { setNotice("Not enough recorded data for that selection yet. Add a few more trades and try again."); return; }
    setSession({ title, kind, pool, count: n, startLevel: level, tradeId, retry: () => { setSession(null); void launch(kind, trades, title, n, tradeId); } });
  };

  const finish = (result: DrillResult) => {
    if (!session) return;
    const mastery = { ...(progress.masteryByTag ?? {}) };
    result.correctTags.forEach((tag) => { mastery[tag] = (mastery[tag] ?? 0) + 1; });
    if (levelPick === 0) mastery[LEVEL_MASTERY_KEY] = result.finalLevel;
    const modePerformance = { ...(progress.modePerformance ?? {}) };
    const bump = (key: string) => { const c = modePerformance[key] ?? { correct: 0, attempts: 0 }; modePerformance[key] = { correct: c.correct + result.correct, attempts: c.attempts + result.total }; };
    bump(session.kind);
    if (session.tradeId) bump(`matrix:${session.tradeId}`);
    const { streak, freezeDays } = nextStreak(progress, today);
    rememberPrompts(result.answers.filter((a) => a.prompt).map((a) => a.prompt));
    void updateSettings({
      practiceProgress: {
        ...progress,
        xp: progress.xp + result.xp,
        streak, freezeDays, lastMissionDate: today,
        completedMissionDates: [...new Set([...(progress.completedMissionDates ?? []), today])].slice(-90),
        masteryByTag: mastery,
        modePerformance,
        seenQuestions: recordAnswers(progress, result.answers.map((a) => ({ fp: a.fp, tag: a.tag, correct: a.correct })), today),
        perfectSets: (progress.perfectSets ?? 0) + (result.total >= 3 && result.correct === result.total ? 1 : 0),
        dailyStats: addDailyStats(progress, today, { xp: result.xp, correct: result.correct, total: result.total }),
      },
    });
  };

  const matrixRows = useMemo(() => usable.filter((t) => {
    const p = perf[`matrix:${t.id}`];
    const accuracy = p && p.attempts ? p.correct / p.attempts : null;
    if (filter === "untested") return accuracy == null;
    if (filter === "needs-work") return accuracy != null && accuracy < 0.7;
    if (filter === "strong") return accuracy != null && accuracy >= 0.85;
    return true;
  }), [usable, perf, filter]);
  const nextUp = usable.find((t) => !perf[`matrix:${t.id}`]) ?? usable[0];

  const mastery = Object.entries(progress.masteryByTag ?? {}).filter(([tag]) => tag !== LEVEL_MASTERY_KEY).sort((a, b) => b[1] - a[1]).slice(0, 6);
  const topScore = Math.max(10, ...mastery.map(([, v]) => v));
  const name = settings.fullName || settings.traderName || "Trader";
  const needData = usable.length === 0;

  return (
    <div className="mx-auto max-w-4xl space-y-7 pb-20">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[.16em] text-gold">Practice arcade</p>
          <h1 className="mt-1 font-display text-3xl font-semibold text-ink">Train with your recorded trades</h1>
          <p className="mt-1 text-sm text-muted">{name} · every question is drawn from your journal.</p>
        </div>
        <p className="text-xs text-muted">{displayStreak(progress, today)} day streak · {progress.xp.toLocaleString()} XP · {rankOf(progress.xp)}</p>
      </header>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {MODES.map((m) => (
          <button key={m.id} onClick={() => setMode(m.id)} className={cn("rounded-xl border p-4 text-left transition", m.tone, mode === m.id ? "ring-2 ring-gold-strong" : "opacity-80 hover:opacity-100")}>
            <span className="text-lg">{m.icon}</span>
            <p className="mt-2 text-sm font-semibold text-ink">{m.title}</p>
            <p className="mt-1 text-xs text-muted">{m.blurb}</p>
          </button>
        ))}
      </div>

      <section className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="min-w-[14rem]">
          <p className="text-sm font-semibold text-ink">Difficulty</p>
          <p className="mt-0.5 text-xs text-muted">{levelPick === 0 ? `Auto · starts at ${LEVELS[autoLevel - 1]!.name} and adjusts live as you answer.` : `Locked to ${LEVELS[levelPick - 1]!.name}.`}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <button onClick={() => setLevelPick(0)} className={cn("rounded-lg border px-3 py-1.5 text-xs font-bold", levelPick === 0 ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line bg-raised text-muted")}>Auto L{autoLevel}</button>
          {LEVELS.map((l) => <button key={l.level} onClick={() => setLevelPick(l.level)} title={l.blurb} className={cn("rounded-lg border px-3 py-1.5 text-xs font-bold", levelPick === l.level ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line bg-raised text-muted")}>L{l.level}</button>)}
          {mode !== "math-duel" && (
            <>
              <span className="mx-2 h-5 w-px bg-line" />
              {COUNTS.map((n) => <button key={n} onClick={() => setCount(n)} className={cn("rounded-md border px-2 py-1.5 text-xs font-bold", count === n ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line bg-raised text-muted")}>{n}</button>)}
              <label className="ml-2 flex items-center gap-1.5 text-xs text-muted"><input type="checkbox" checked={aiOn} onChange={(e) => setAiOn(e.target.checked)} /> AI questions</label>
            </>
          )}
        </div>
      </section>

      {notice && <p className="rounded-lg bg-gold/10 px-4 py-3 text-sm text-ink">{notice}</p>}
      {busy && <p className="rounded-lg border border-line bg-raised px-4 py-3 text-sm text-muted">Writing fresh questions for {busy}… this can take up to 40 seconds with the free AI model.</p>}

      {needData && mode !== "math-duel" && <p className="panel p-5 text-sm text-muted">No trades with a P&amp;L yet. Add or import a trade and questions appear here straight away. Math Duel works without any data.</p>}

      {mode === "math-duel" && <MathDuel progress={progress} updateSettings={updateSettings} levelOverride={levelPick} />}

      {mode === "matrix" && !needData && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => <button key={f.id} onClick={() => { setFilter(f.id); setShown(25); }} className={cn("rounded-lg border px-3 py-1.5 text-xs font-bold", filter === f.id ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line bg-raised text-muted")}>{f.label}</button>)}
          </div>
          {nextUp && (
            <div className="panel flex items-center justify-between gap-4 p-4">
              <div><p className="text-xs font-bold text-gold">Next up</p><p className="mt-1 text-sm text-ink">{tradeLabel(nextUp)}</p></div>
              <Button variant="gold" disabled={!!busy} onClick={() => void launch("matrix", [nextUp], `Test · ${tradeLabel(nextUp)}`, 8, nextUp.id)}>Take 8-question test</Button>
            </div>
          )}
          <div className="panel divide-y divide-line overflow-hidden">
            {matrixRows.slice(0, shown).map((t) => {
              const p = perf[`matrix:${t.id}`];
              return (
                <div key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0"><p className="truncate text-sm font-medium text-ink">{tradeLabel(t)}</p><p className="mt-0.5 text-xs text-muted">{t.setup?.trim() || "No recorded setup"}</p></div>
                  <div className="flex items-center gap-3">
                    <span className={cn("font-mono text-sm", t.pnl > 0 ? "text-profit" : t.pnl < 0 ? "text-loss" : "text-muted")}>{fmtMoney(t.pnl)}</span>
                    <span className="w-16 text-right text-xs text-muted">{p && p.attempts ? `${Math.round((p.correct / p.attempts) * 100)}% · ${p.attempts}q` : "untested"}</span>
                    <Button size="sm" variant="outline" disabled={!!busy} onClick={() => void launch("matrix", [t], `Test · ${tradeLabel(t)}`, 8, t.id)}>Test</Button>
                  </div>
                </div>
              );
            })}
            {!matrixRows.length && <p className="px-4 py-6 text-sm text-muted">No trades match this filter yet.</p>}
          </div>
          {matrixRows.length > shown && <Button variant="outline" onClick={() => setShown((n) => n + 25)}>Show more</Button>}
        </section>
      )}

      {mode === "time-machine" && !needData && (
        <section className="space-y-4">
          <div className="panel p-5">
            <h2 className="text-base font-semibold text-ink">Process drill across all {usable.length} trades</h2>
            <p className="mt-1 text-sm text-muted">Recall what you decided and why — sides, setups, time windows, lessons, plan-following. New and previously-missed questions come first; nothing repeats until you have seen everything.</p>
            <Button className="mt-4" variant="gold" disabled={!!busy} onClick={() => void launch("time-machine", usable, "Time Machine", count)}>Train · {count} questions</Button>
          </div>
          {mastery.length > 0 && (
            <div className="panel p-5">
              <p className="text-sm font-semibold text-ink">Topics mastery</p>
              <div className="mt-3 space-y-2">
                {mastery.map(([tag, value]) => (
                  <div key={tag} className="grid grid-cols-[8rem_1fr_2rem] items-center gap-3 text-xs text-muted">
                    <span className="truncate capitalize">{tag.replace(/-/g, " ")}</span>
                    <div className="h-1.5 overflow-hidden rounded-full bg-ink/10"><div className="h-full bg-gold-strong" style={{ width: `${Math.min(100, (value / topScore) * 100)}%` }} /></div>
                    <span className="font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {mode === "boss" && !needData && (
        <section className="panel p-5">
          <h2 className="text-base font-semibold text-ink">Weekend Boss</h2>
          {week.trades.length >= 2 ? (
            <>
              <p className="mt-1 text-sm text-muted">{week.label} · {week.trades.length} trades · net <b className={cn("font-mono", week.trades.reduce((s, t) => s + t.pnl, 0) >= 0 ? "text-profit" : "text-loss")}>{fmtMoney(week.trades.reduce((s, t) => s + t.pnl, 0))}</b></p>
              <p className="mt-2 text-sm text-muted">Cross-trade questions: totals, spread, best and worst days, profit factor, break-even win rate, and net R.</p>
              <Button className="mt-4" variant="gold" disabled={!!busy} onClick={() => void launch("boss", week.trades, "Weekend Boss", Math.max(count, 10))}>Play Boss</Button>
            </>
          ) : <p className="mt-1 text-sm text-muted">The boss needs at least 2 trades in the same week. Record another trade and come back.</p>}
        </section>
      )}

      {session && <DrillRunner key={session.pool.map((q) => q.id).join("|")} title={session.title} pool={session.pool} count={session.count} startLevel={session.startLevel} lockLevel={levelPick !== 0} onFinish={finish} onClose={() => setSession(null)} onRetry={session.retry} />}
    </div>
  );
}

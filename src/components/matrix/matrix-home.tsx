"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { scopeToPrimary } from "@/lib/challenges";
import { practiceHomeStats } from "@/lib/practice/home-stats";
import { GameTile, ProgressBar } from "@/components/matrix/ui";

/** Home "Practice arcade" card — mirrors the Practise page; every tile deep-links to its mode. */
export function MatrixHome() {
  const allEntries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const today = todayKey();
  const { entries } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const s = useMemo(() => practiceHomeStats(entries, settings, today), [entries, settings, today]);

  const matrixDetail = s.usableTrades === 0
    ? "Log a trade to unlock tests on it."
    : s.needsWork > 0
      ? `${s.needsWork} trade${s.needsWork === 1 ? "" : "s"} need work · ${s.untested} untested.`
      : s.untested > 0
        ? `${s.untested} of ${s.usableTrades} trades still untested.`
        : "Every trade tested — retest to level up.";

  return (
    <section className="panel p-5 sm:p-6" aria-label="Practice arcade">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold">Practice arcade</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Train with your recorded trades</h2>
          <p className="mt-1 text-xs text-muted">
            {s.rank} · {s.xp.toLocaleString()} XP · auto difficulty L{s.level}
          </p>
        </div>
        <Link href="/practice" className="text-xs font-semibold text-gold hover:underline">Open Practise →</Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-5">
        <Metric
          label="Today’s XP"
          value={`${s.todayXp} / ${s.dailyGoal}`}
          detail={<ProgressBar value={Math.min(100, (s.todayXp / s.dailyGoal) * 100)} />}
        />
        <Metric label="Practice streak" value={`${s.streak} day${s.streak === 1 ? "" : "s"}`} detail={s.streak > 0 ? "keep it alive today" : "train once to start"} />
        <Metric label="Trades logged" value={String(s.tradesTotal)} detail={`${s.tradesToday} today`} />
        <Metric label="Challenges" value={String(settings.challenges?.length ?? 0)} detail="recorded" />
        <Metric
          label="Accuracy"
          value={s.accuracy == null ? "—" : `${Math.round(s.accuracy * 100)}%`}
          detail={s.answered ? `${s.answered} answered${s.dueReviews ? ` · ${s.dueReviews} due` : ""}` : "nothing answered yet"}
        />
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <GameTile href="/practice?mode=matrix" tone="purple" title="Matrix" detail={matrixDetail} action="Open Matrix" />
        <GameTile
          href="/practice?mode=time-machine"
          tone="green"
          title="Time Machine"
          detail={s.usableTrades ? `Revise all ${s.usableTrades} recorded trades.` : "Practice recorded process decisions."}
          action="Train"
        />
        <GameTile href="/practice?mode=math-duel" tone="gold" title="Math Duel" detail="60-second calculation duels from your risk data." action="Open duel" />
        <GameTile
          href="/practice?mode=boss"
          tone="red"
          title="Weekend Boss"
          detail={s.bossReady ? `Ready: ${s.weekTradeCount} trades this week.` : "Needs 2 trades in the same week."}
          action={s.bossReady ? "Play Boss" : "View"}
        />
      </div>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail?: React.ReactNode }) {
  return (
    <div className="rounded-control border border-line bg-raised p-3">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-faint">{label}</p>
      <p className="mt-1 text-sm font-semibold text-ink">{value}</p>
      {detail && <div className="mt-2 text-[10px] text-muted">{detail}</div>}
    </div>
  );
}

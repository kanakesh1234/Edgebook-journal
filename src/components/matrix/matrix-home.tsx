"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { scopeToPrimary } from "@/lib/challenges";
import { practiceHomeStats } from "@/lib/practice/home-stats";
import { ProgressBar } from "@/components/matrix/ui";
import { ModeCard } from "@/components/practice/mode-card";

/** Home "Practice arcade" card — mirrors the Practise page; every tile deep-links to its mode. */
export function MatrixHome() {
  const allEntries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const today = todayKey();
  const { entries } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const s = useMemo(() => practiceHomeStats(entries, settings, today), [entries, settings, today]);

  return (
    <section className="panel p-5 sm:p-6" aria-label="Practice arcade">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-[.14em] text-gold">Practice arcade</p>
          <h2 className="mt-1 text-lg font-semibold text-ink">Train with your recorded trades</h2>
          <p className="mt-1 text-xs text-muted">
            {s.rank} · Lv {s.xpLevel.level}
          </p>
        </div>
        <Link href="/practice" className="text-xs font-semibold text-gold hover:underline">Open Practise →</Link>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label={`Level ${s.xpLevel.level}`}
          value={`${s.xpLevel.into} / ${s.xpLevel.need} XP`}
          detail={<ProgressBar value={s.xpLevel.pct} />}
        />
        <Metric label="Practice streak" value={`${s.streak} day${s.streak === 1 ? "" : "s"}`} detail={s.streak > 0 ? "keep it alive today" : "train once to start"} />
        <Metric label="Trades logged" value={String(s.tradesTotal)} detail={`${s.tradesToday} today`} />
        <Metric
          label="Accuracy"
          value={s.accuracy == null ? "—" : `${Math.round(s.accuracy * 100)}%`}
          detail={s.answered ? `${s.answered} answered${s.dueReviews ? ` · ${s.dueReviews} due` : ""}` : "nothing answered yet"}
        />
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <ModeCard compact mode="matrix" level={s.levels.matrix} href="/practice?mode=matrix" disabled={s.usableTrades === 0} status="Log a trade to unlock." />
        <ModeCard compact mode="time-machine" level={s.levels["time-machine"]} href="/practice?mode=time-machine" disabled={s.usableTrades === 0} status="Log a trade to unlock." />
        <ModeCard compact mode="math-duel" level={s.levels["math-duel"]} href="/practice?mode=math-duel" status="" />
        <ModeCard compact mode="boss" level={s.levels.boss} href="/practice?mode=boss" disabled={!s.bossReady} status="Needs 2 trades in the same week." />
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

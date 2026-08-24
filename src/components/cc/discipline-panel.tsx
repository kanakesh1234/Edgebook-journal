"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { disciplineSummary, type DayStatus } from "@/lib/discipline";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { BookOpenIcon, FlameIcon } from "@/components/ui/icons";

const STATUS_DOT: Record<DayStatus, string> = {
  traded: "bg-profit",
  "no-trade": "bg-gold",
  missed: "bg-loss",
  weekend: "bg-line-strong",
  open: "bg-transparent border border-dashed border-line-strong",
};

const STATUS_LABEL: Record<DayStatus, string> = {
  traded: "Journaled",
  "no-trade": "No trade",
  missed: "Missed",
  weekend: "Weekend",
  open: "Today — still open",
};

/**
 * DisciplinePanel — performance + discipline + reflection.
 * XP is derived from actual journaling behavior, never stored:
 * journaled trades, completed reflections, honest process answers,
 * explicitly marked no-trade days, and missed weekday journals.
 */
export function DisciplinePanel({ delay = 0 }: { delay?: number }) {
  const entries = useApp((s) => s.entries);
  const dayLogs = useApp((s) => s.dayLogs);
  const summary = useMemo(() => disciplineSummary(entries, dayLogs), [entries, dayLogs]);

  // Most recent 15 tracked days for the strip
  const strip = useMemo(() => summary.days.slice(-15), [summary.days]);

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay, ease: EASE }}
      className="panel p-5 sm:p-6"
      aria-label="Daily discipline"
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Discipline</h2>
          <p className="text-xs text-muted">Every trading weekday deserves an explicit outcome.</p>
        </div>
        <div className="text-right">
          <p className="kpi text-2xl leading-none text-gold">
            {summary.xpTotal > 0 ? "+" : ""}
            {summary.xpTotal.toLocaleString("en-US")}
            <span className="ml-1 text-xs font-normal tracking-normal text-faint">XP</span>
          </p>
          <p className="mt-1 text-[11px] text-faint">+{summary.xpLast30.toLocaleString("en-US")} in the last 30 days</p>
        </div>
      </div>

      {/* Day strip */}
      <div className="mt-5 flex items-end gap-1.5" role="img" aria-label="Last fifteen tracked days of discipline">
        {strip.map((d) => (
          <span
            key={d.date}
            title={`${d.date} · ${STATUS_LABEL[d.status]}${d.xp !== 0 ? ` · ${d.xp > 0 ? "+" : ""}${d.xp} XP` : ""}`}
            className="flex flex-1 flex-col items-center gap-1.5"
          >
            <span className={cn("h-2 w-full max-w-6 rounded-full", STATUS_DOT[d.status])} />
            <span className="text-[9px] tabular text-faint">{Number(d.date.slice(8))}</span>
          </span>
        ))}
      </div>

      {/* Stats */}
      <div className="mt-5 grid grid-cols-3 gap-4 border-t border-line pt-4">
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
            <FlameIcon className="h-3.5 w-3.5" />
            Streak
          </p>
          <p className="kpi mt-1.5 text-lg text-ink">
            {summary.disciplineStreak}
            <span className="ml-1 text-xs font-normal tracking-normal text-faint">
              {summary.disciplineStreak === 1 ? "day" : "days"}
            </span>
          </p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Completion</p>
          <p className="kpi mt-1.5 text-lg text-ink">{Math.round(summary.completionRate * 100)}%</p>
        </div>
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Missed</p>
          <p className={cn("kpi mt-1.5 text-lg", summary.missedDays > 0 ? "text-loss" : "text-ink")}>
            {summary.missedDays}
          </p>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-faint">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-profit" /> Journaled +20</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" /> No-trade +15</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-loss" /> Missed −20</span>
        <span className="flex items-center gap-1.5">
          <BookOpenIcon className="h-3 w-3" />
          Mark flat days in the calendar
        </span>
      </div>
    </motion.section>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { groupByDay, monthGrid } from "@/lib/stats";
import type { Challenge, CurrencyCode, JournalEntry, NoTradeLog } from "@/lib/types";
import { formatDateFull, formatSignedMoney, monthLabel, parseDateKey, todayKey } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * CalendarView — the primary historical navigation surface.
 * Neutral cells, large readable P&L badges, review-status dots,
 * challenge filter, day drill-down into trades.
 * Used on Home; the /calendar route renders the full-page version.
 */
export function CalendarView({
  entries,
  dayLogs,
  challenges,
  currency,
  defaultChallengeId = null,
  compact = false,
}: {
  entries: JournalEntry[];
  dayLogs: NoTradeLog[];
  challenges: Challenge[];
  currency: CurrencyCode;
  /** Preselect/track the primary challenge — stays in sync when it changes. */
  defaultChallengeId?: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [dir, setDir] = useState(0);
  const [challengeFilter, setChallengeFilter] = useState("all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Follow the primary challenge selection without a page reload.
  useEffect(() => {
    setChallengeFilter(defaultChallengeId ?? "all");
  }, [defaultChallengeId]);

  const filtered = useMemo(
    () => (challengeFilter === "all" ? entries : entries.filter((e) => e.challengeId === challengeFilter)),
    [entries, challengeFilter],
  );
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const cells = useMemo(() => monthGrid(view.year, view.month), [view]);
  const noTradeDays = useMemo(() => new Set(dayLogs.map((d) => d.date)), [dayLogs]);

  const monthEntries = useMemo(
    () =>
      filtered.filter((e) => {
        const d = parseDateKey(e.date);
        return d.getFullYear() === view.year && d.getMonth() === view.month;
      }),
    [filtered, view],
  );
  const monthPnl = monthEntries.reduce((s, e) => s + e.pnl, 0);

  const navigate = (delta: number) => {
    setDir(delta);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const selectedEntries = (selectedDay ? filtered.filter((e) => e.date === selectedDay) : []).sort(
    (a, b) => (a.entryTime ?? "99:99").localeCompare(b.entryTime ?? "99:99"),
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-display text-base font-semibold tracking-tight text-ink">Calendar</h2>
        <div className="flex flex-wrap items-center gap-2">
          {challenges.length > 0 && (
            <select
              aria-label="Filter by challenge"
              value={challengeFilter}
              onChange={(e) => setChallengeFilter(e.target.value)}
              className="rounded-control border border-line bg-surface px-3 py-1.5 text-xs text-ink hover:border-line-strong focus:border-gold/60 focus:outline-none"
            >
              <option value="all">All challenges</option>
              {challenges.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          )}
          <button onClick={() => navigate(-1)} aria-label="Previous month" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-raised text-muted hover:text-ink">
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.span
              key={`${view.year}-${view.month}`}
              initial={{ opacity: 0, y: dir >= 0 ? 6 : -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: dir >= 0 ? -6 : 6 }}
              transition={{ duration: 0.2 }}
              className="min-w-[130px] text-center font-display text-sm font-semibold text-ink"
              aria-live="polite"
            >
              {monthLabel(view.year, view.month)}
            </motion.span>
          </AnimatePresence>
          <button onClick={() => navigate(1)} aria-label="Next month" className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-raised text-muted hover:text-ink">
            <ChevronRightIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="panel overflow-hidden p-3 sm:p-4">
        <div className="mb-1.5 grid grid-cols-7 gap-1 sm:gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">
              <span className="hidden sm:inline">{w}</span>
              <span className="sm:hidden">{w[0]}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view.year}-${view.month}`}
            initial={{ opacity: 0, x: dir * 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -20 }}
            transition={{ duration: 0.22 }}
            className="grid grid-cols-7 gap-1 sm:gap-1.5"
          >
            {cells.map((cell, i) => {
              if (!cell.key) return <div key={`pad-${i}`} aria-hidden />;
              const day = byDay.get(cell.key);
              const pnl = day?.pnl ?? null;
              const trades = day?.trades ?? 0;
              const isToday = cell.key === todayKey();
              const dayEntries = filtered.filter((e) => e.date === cell.key);
              const allReviewed = dayEntries.length > 0 && dayEntries.every((e) => e.reviewStatus === "reviewed");
              const anyPending = dayEntries.some((e) => e.reviewStatus !== "reviewed" && e.reviewStatus !== "not_reviewed");

              return (
                <motion.button
                  key={cell.key}
                  onClick={() => setSelectedDay(cell.key)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.005, 0.15) }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  aria-label={`${formatDateFull(cell.key)}${pnl !== null ? `, ${formatSignedMoney(pnl, currency)}` : ", no trades"}`}
                  className={cn(
                    "group relative flex min-h-[62px] flex-col justify-between overflow-hidden rounded-control border bg-surface p-1.5 text-left transition-colors sm:min-h-[84px] sm:p-2",
                    isToday ? "border-gold/60 ring-1 ring-gold/40" : "border-line hover:border-line-strong",
                  )}
                >
                  <span className="flex items-center justify-between">
                    <span className={cn("text-[11px] font-semibold tabular", isToday ? "text-gold" : "text-ink")}>{cell.day}</span>
                    {dayEntries.length > 0 && (
                      <span className={cn("h-1.5 w-1.5 rounded-full", allReviewed ? "bg-profit" : anyPending ? "bg-gold" : "bg-line-strong")} />
                    )}
                    {!isToday && dayEntries.length === 0 && noTradeDays.has(cell.key) && (
                      <span className="h-1.5 w-1.5 rounded-full border border-gold" />
                    )}
                  </span>

                  {trades > 0 && (
                    <span className="text-[9px] font-medium uppercase tracking-wide text-faint">
                      {trades} {trades === 1 ? "trade" : "trades"}
                    </span>
                  )}

                  {pnl !== null && pnl !== 0 && (
                    <span
                      className={cn(
                        "num w-fit rounded-md border px-1.5 py-0.5 text-[14px] font-bold leading-tight",
                        pnl > 0 ? "border-profit/30 bg-profit/[0.1] text-profit" : "border-loss/30 bg-loss/[0.1] text-loss",
                      )}
                    >
                      {pnl > 0 ? "+" : "−"}${Math.abs(pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-3">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-faint">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-profit" /> All reviewed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" /> Review pending</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-gold" /> No-trade day</span>
          </div>
          <p className="flex items-center gap-3 text-sm">
            <span className="text-muted">{monthEntries.length} {monthEntries.length === 1 ? "session" : "sessions"}</span>
            <span className={cn("num font-semibold", monthPnl > 0 ? "text-profit" : monthPnl < 0 ? "text-loss" : "text-muted")}>
              {formatSignedMoney(monthPnl, currency)}
            </span>
          </p>
        </div>
      </div>

      {/* Day modal */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        size="md"
        title={selectedDay ? formatDateFull(selectedDay) : ""}
        description={
          selectedDay
            ? `${filtered.filter((e) => e.date === selectedDay).length} trades · ${formatSignedMoney(filtered.filter((e) => e.date === selectedDay).reduce((s, e) => s + e.pnl, 0), currency)}`
            : ""
        }
      >
        <div className="space-y-2 px-4 py-4">
          {selectedEntries.map((e) => (
            <button
              key={e.id}
              onClick={() => { setSelectedDay(null); router.push(`/review/${e.id}`); }}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-3.5 py-3 text-left transition-all hover:border-line-strong hover:bg-raised active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  {e.entryTime && <span className="num text-xs text-faint">{e.entryTime}</span>}
                  <span className="truncate text-sm font-medium text-ink">{e.instrument !== "—" ? e.instrument : e.setup || "Session"}</span>
                  {e.direction && (
                    <span className={cn("font-mono text-[10px] font-bold uppercase", e.direction === "long" ? "text-profit" : "text-loss")}>{e.direction}</span>
                  )}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    e.reviewStatus === "reviewed" ? "bg-profit" : e.reviewStatus === "not_reviewed" ? "bg-line-strong" : e.reviewStatus === "incomplete" ? "bg-loss" : "bg-gold",
                  )} />
                  <span className="text-[11px] text-faint">
                    {e.reviewStatus === "reviewed" ? "Reviewed" : e.reviewStatus === "incomplete" ? "Review incomplete" : e.reviewStatus === "in_progress" ? "Review in progress" : "Not reviewed"}
                  </span>
                  {e.setup && <span className="truncate text-[11px] text-faint">{e.setup}</span>}
                </span>
              </span>
              <span className={cn("num shrink-0 text-sm font-semibold", e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted")}>
                {formatSignedMoney(e.pnl, currency)}
              </span>
            </button>
          ))}

          {selectedEntries.length === 0 && (
            <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted">No trades logged.</p>
          )}

          <button
            onClick={() => { setSelectedDay(null); router.push(`/journal?date=${selectedDay}`); }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm font-medium text-muted transition-colors hover:border-gold/50 hover:text-gold"
          >
            <PlusIcon className="h-4 w-4" />
            Add trade for this day
          </button>
        </div>
      </Modal>
    </div>
  );
}

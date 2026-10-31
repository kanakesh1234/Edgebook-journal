"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useDragControls, useReducedMotion } from "motion/react";
import { groupByDay, monthGrid, type MonthCell } from "@/lib/stats";
import type { Challenge, CurrencyCode, JournalEntry, NoTradeLog } from "@/lib/types";
import { formatDateFull, formatDateMedium, formatMoney, formatSignedMoney, monthLabel, parseDateKey, todayKey } from "@/lib/format";
import { summarizeTradeMistakeForFeed } from "@/lib/ai-brain";
import { useCountUp } from "@/lib/hooks";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SPRING_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

interface MonthDataSnapshot {
  year: number;
  month: number;
  cells: MonthCell[];
  weeks: MonthCell[][];
  entriesByDate: Map<string, JournalEntry[]>;
  maxAbsDayPnl: number;
  winningDays: number;
  losingDays: number;
  activeDays: number;
  monthPnl: number;
  avgDayPnl: number;
  dayWinRate: number | null;
  bestDay: { date: string; pnl: number } | null;
  weeklySummaries: { weekIndex: number; pnl: number; trades: number; activeDays: number }[];
}

function buildMonthData(filtered: JournalEntry[], year: number, month: number): MonthDataSnapshot {
  const cells = monthGrid(year, month, true); // Fixed 6 rows (42 cells)
  const weeks: MonthCell[][] = [];
  for (let r = 0; r < 6; r++) {
    weeks.push(cells.slice(r * 7, r * 7 + 7));
  }

  const monthEntries = filtered.filter((e) => {
    const d = parseDateKey(e.date);
    return d.getFullYear() === year && d.getMonth() === month;
  });

  const entriesByDate = new Map<string, JournalEntry[]>();
  for (const e of monthEntries) {
    const list = entriesByDate.get(e.date) ?? [];
    list.push(e);
    entriesByDate.set(e.date, list);
  }

  const sortedDates = [...entriesByDate.keys()].sort();
  let monthPnl = 0;
  let maxAbsDayPnl = 1;
  let winningDays = 0;
  let losingDays = 0;
  let bestDay: { date: string; pnl: number } | null = null;

  for (const d of sortedDates) {
    const dayPnl = (entriesByDate.get(d) ?? []).reduce((s, e) => s + e.pnl, 0);
    monthPnl += dayPnl;
    maxAbsDayPnl = Math.max(maxAbsDayPnl, Math.abs(dayPnl));
    if (dayPnl > 0) winningDays++;
    else if (dayPnl < 0) losingDays++;
    if (!bestDay || dayPnl > bestDay.pnl) bestDay = { date: d, pnl: dayPnl };
  }

  const activeDays = sortedDates.length;
  const avgDayPnl = activeDays > 0 ? monthPnl / activeDays : 0;
  const dayWinRate = winningDays + losingDays > 0 ? Math.round((winningDays / (winningDays + losingDays)) * 100) : null;

  const weeklySummaries = weeks.map((weekCells, weekIndex) => {
    let pnl = 0;
    let trades = 0;
    let wkDays = 0;
    for (const c of weekCells) {
      if (!c.key) continue;
      const de = entriesByDate.get(c.key);
      if (de && de.length > 0) {
        wkDays++;
        trades += de.length;
        pnl += de.reduce((s, e) => s + e.pnl, 0);
      }
    }
    return { weekIndex, pnl, trades, activeDays: wkDays };
  });

  return {
    year,
    month,
    cells,
    weeks,
    entriesByDate,
    maxAbsDayPnl,
    winningDays,
    losingDays,
    activeDays,
    monthPnl,
    avgDayPnl,
    dayWinRate,
    bestDay,
    weeklySummaries,
  };
}

/**
 * CalendarView — Apple Calendar-Inspired Desktop & Mobile Surface:
 *  - Always scoped to the active Primary Challenge (no square native <select> box).
 *  - Fixed 6-row height (42 cells) so switching months never shifts layout.
 *  - Desktop: 7 day columns + 8th Weekly P&L summary column (`Wk 1`..`Wk 6`), day number top-left,
 *    today highlighted with a filled circle, tabular P&L centered/bottom with soft green/red tints.
 *  - Unhurried, choreographed month switching: direction-aware slide + fade (old month glides out
 *    while new month glides in) with a staggered per-row/cell cascade (~42ms per row + 14ms per cell),
 *    count-up animated header total, adjacent month prefetch, and debounced rapid-click queueing.
 *  - Clicking a day opens a translucent popover/inspector on desktop or a draggable bottom sheet on mobile.
 *  - Mobile: compact month grid with dots/colored markers and horizontal swipe left/right to change month.
 */
export function CalendarView({
  entries,
  dayLogs,
  currency,
  defaultChallengeId = null,
  spacious = false,
  onAddTradeForDate,
}: {
  entries: JournalEntry[];
  dayLogs: NoTradeLog[];
  challenges?: Challenge[];
  currency: CurrencyCode;
  defaultChallengeId?: string | null;
  compact?: boolean;
  spacious?: boolean;
  onAddTradeForDate?: (date: string) => void;
}) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const sheetDragControls = useDragControls();

  const [view, setView] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [dir, setDir] = useState<number>(1);
  const [scrubDay, setScrubDay] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  // Rapid-click debounce / queue ref
  const lastNavRef = useRef<number>(0);
  const queuedDeltaRef = useRef<number | null>(null);
  const navTimerRef = useRef<number | null>(null);

  // Touch swipe tracking on mobile
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  // Always reflect the active Primary Challenge stats
  const filtered = useMemo(
    () => (defaultChallengeId ? entries.filter((e) => e.challengeId === defaultChallengeId) : entries),
    [entries, defaultChallengeId],
  );
  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const noTradeDays = useMemo(() => new Set(dayLogs.map((d) => d.date)), [dayLogs]);

  // Prefetch / memoize current + adjacent (prev & next) months so transitions have zero compute lag
  const prefetchedMonths = useMemo(() => {
    const prevDate = new Date(view.year, view.month - 1, 1);
    const nextDate = new Date(view.year, view.month + 1, 1);
    const cur = buildMonthData(filtered, view.year, view.month);
    const prev = buildMonthData(filtered, prevDate.getFullYear(), prevDate.getMonth());
    const next = buildMonthData(filtered, nextDate.getFullYear(), nextDate.getMonth());
    return { cur, prev, next };
  }, [filtered, view.year, view.month]);

  const monthStats = prefetchedMonths.cur;

  const applyNavDelta = useCallback((delta: number) => {
    if (delta === 0) return;
    setDir(delta > 0 ? 1 : -1);
    setScrubDay(null);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  }, []);

  const navigate = useCallback(
    (delta: number) => {
      const nowMs = performance.now();
      const elapsed = nowMs - lastNavRef.current;
      if (elapsed < 220) {
        // Queue rapid clicks cleanly so choreographed month transitions play smoothly
        queuedDeltaRef.current = (queuedDeltaRef.current ?? 0) + delta;
        if (!navTimerRef.current) {
          navTimerRef.current = window.setTimeout(() => {
            navTimerRef.current = null;
            const q = queuedDeltaRef.current;
            queuedDeltaRef.current = null;
            if (q) {
              lastNavRef.current = performance.now();
              applyNavDelta(q);
            }
          }, 225 - elapsed);
        }
        return;
      }
      lastNavRef.current = nowMs;
      applyNavDelta(delta);
    },
    [applyNavDelta],
  );

  const jumpToToday = useCallback(() => {
    const n = new Date();
    const diffMonths = (n.getFullYear() - view.year) * 12 + (n.getMonth() - view.month);
    if (diffMonths === 0) {
      setSelectedDay(todayKey());
      return;
    }
    setDir(diffMonths > 0 ? 1 : -1);
    setScrubDay(null);
    setView({ year: n.getFullYear(), month: n.getMonth() });
  }, [view.year, view.month]);

  // Keyboard navigation: Left/Right arrows change month, "T" jumps to today
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) {
        return;
      }
      if (selectedDay && e.key === "Escape") {
        setSelectedDay(null);
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        navigate(1);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        jumpToToday();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [navigate, jumpToToday, selectedDay]);

  // Count-up animated month P&L header total
  const animatedMonthPnl = useCountUp(monthStats.monthPnl, reduce ? 0 : 560, !reduce);

  const scrubbedEntries = scrubDay ? monthStats.entriesByDate.get(scrubDay) ?? [] : [];
  const isScrubbingActiveDay = scrubDay !== null && scrubbedEntries.length > 0;
  const displayedHeroPnl = isScrubbingActiveDay
    ? scrubbedEntries.reduce((s, e) => s + e.pnl, 0)
    : animatedMonthPnl;
  const rawHeroTonePnl = isScrubbingActiveDay
    ? scrubbedEntries.reduce((s, e) => s + e.pnl, 0)
    : monthStats.monthPnl;
  const headlineTone = rawHeroTonePnl > 0 ? "profit" : rawHeroTonePnl < 0 ? "loss" : "neutral";

  const scrubbedR = useMemo(() => {
    if (!isScrubbingActiveDay) return null;
    const withR = scrubbedEntries.filter((e) => typeof e.rr === "number" && Number.isFinite(e.rr));
    if (!withR.length) return null;
    return withR.reduce((s, e) => s + (e.rr ?? 0), 0);
  }, [isScrubbingActiveDay, scrubbedEntries]);

  const selectedEntries = useMemo(
    () =>
      (selectedDay ? filtered.filter((e) => e.date === selectedDay) : []).sort((a, b) =>
        (a.entryTime ?? "99:99").localeCompare(b.entryTime ?? "99:99"),
      ),
    [filtered, selectedDay],
  );
  const selectedDayLog = useMemo(
    () => (selectedDay ? dayLogs.find((d) => d.date === selectedDay) ?? null : null),
    [dayLogs, selectedDay],
  );

  return (
    <motion.section
      initial={reduce ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.36, ease: SPRING_EASE }}
      className="panel relative overflow-hidden"
      aria-label="Trading Calendar"
    >
      {/* Header: Count-up Hero P&L + Apple Calendar Navigation Controls */}
      <div className="px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
              {isScrubbingActiveDay && scrubDay ? formatDateFull(scrubDay) : `${monthLabel(view.year, view.month)} · Calendar`}
            </p>

            <SignedMoneyHero
              value={displayedHeroPnl}
              currency={currency}
              tone={headlineTone}
              className="mt-2 text-[34px] sm:text-[46px]"
            />

            <p className="mt-2 min-h-[20px] text-[13.5px] leading-snug text-muted" aria-live="polite">
              {isScrubbingActiveDay && scrubDay ? (
                <>
                  <span className="font-medium text-ink">
                    {scrubbedEntries.length} {scrubbedEntries.length === 1 ? "trade" : "trades"}
                  </span>
                  {scrubbedR !== null && (
                    <span className={cn("num ml-2 font-medium", scrubbedR > 0 ? "text-profit" : scrubbedR < 0 ? "text-loss" : "text-muted")}>
                      {scrubbedR > 0 ? "+" : ""}
                      {scrubbedR.toFixed(1)}R
                    </span>
                  )}
                  <span className="ml-2 text-faint">
                    · {scrubbedEntries.every((e) => e.reviewStatus === "reviewed") ? "Reviewed" : "Click to inspect"}
                  </span>
                </>
              ) : monthStats.activeDays > 0 ? (
                <>
                  <span className="font-medium text-ink">
                    {monthStats.activeDays} {monthStats.activeDays === 1 ? "session" : "sessions"}
                  </span>
                  {monthStats.dayWinRate !== null && (
                    <span className="ml-2">
                      · <span className="num font-medium text-ink">{monthStats.dayWinRate}%</span> win rate ({monthStats.winningDays}W · {monthStats.losingDays}L)
                    </span>
                  )}
                  {monthStats.bestDay && (
                    <span className="ml-2 hidden text-faint sm:inline">
                      · Best {formatSignedMoney(monthStats.bestDay.pnl, currency)}
                    </span>
                  )}
                </>
              ) : (
                <span>No sessions logged in {monthLabel(view.year, view.month)}.</span>
              )}
            </p>
          </div>

          {/* Controls: Apple HIG Pill < Month Year > + Today Button */}
          <div className="flex flex-wrap items-center gap-2 self-start">
            <div className="inline-flex h-10 items-center gap-0.5 rounded-full border border-line bg-surface p-1">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Previous month"
                className="hit-44 grid h-8 w-8 place-items-center rounded-full text-muted transition-all hover:bg-raised hover:text-ink active:scale-90"
              >
                <ChevronLeftIcon className="h-4 w-4" />
              </button>

              <div className="relative min-w-[132px] overflow-hidden px-2 text-center">
                <AnimatePresence mode="wait" initial={false} custom={dir}>
                  <motion.span
                    key={`${view.year}-${view.month}`}
                    custom={dir}
                    initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? 22 : -22 }}
                    animate={{ opacity: 1, x: 0, transition: { duration: 0.34, ease: SPRING_EASE } }}
                    exit={reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? -22 : 22, transition: { duration: 0.18, ease: SPRING_EASE } }}
                    className="block font-display text-[13.5px] font-semibold tracking-[-0.01em] text-ink"
                    aria-live="polite"
                  >
                    {monthLabel(view.year, view.month)}
                  </motion.span>
                </AnimatePresence>
              </div>

              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label="Next month"
                className="hit-44 grid h-8 w-8 place-items-center rounded-full text-muted transition-all hover:bg-raised hover:text-ink active:scale-90"
              >
                <ChevronRightIcon className="h-4 w-4" />
              </button>
            </div>

            <button
              type="button"
              onClick={jumpToToday}
              className="hit-44 h-10 rounded-full border border-line bg-surface px-4 text-[12.5px] font-semibold text-gold transition-all hover:border-gold/50 hover:bg-raised active:scale-95"
            >
              Today
            </button>
          </div>
        </div>
      </div>

      {/* Calendar Grid Surface (Fixed 6-Row Height + Weekly Summary Column on Desktop + Swipe on Mobile) */}
      <div
        className={cn("px-3 pt-5 sm:px-7", spacious ? "pb-6 sm:pb-8" : "pb-5 sm:pb-7")}
        onPointerLeave={() => setScrubDay(null)}
        onTouchStart={(e) => {
          touchStartX.current = e.touches[0]?.clientX ?? null;
          touchStartY.current = e.touches[0]?.clientY ?? null;
        }}
        onTouchEnd={(e) => {
          if (touchStartX.current === null || touchStartY.current === null) return;
          const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
          const dy = (e.changedTouches[0]?.clientY ?? touchStartY.current) - touchStartY.current;
          touchStartX.current = null;
          touchStartY.current = null;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.4) {
            navigate(dx < 0 ? 1 : -1);
          }
        }}
      >
        {/* Column Headers: 7 Weekdays + Desktop Weekly P&L Column */}
        <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2 lg:grid-cols-[repeat(7,minmax(0,1fr))_108px]">
          {WEEKDAYS.map((w, idx) => (
            <div
              key={w}
              className={cn(
                "pb-1 text-center text-[10.5px] font-semibold uppercase tracking-[0.12em]",
                idx === 0 || idx === 6 ? "text-faint/60" : "text-faint",
              )}
            >
              <span className="hidden sm:inline">{w}</span>
              <span className="sm:hidden">{w[0]}</span>
            </div>
          ))}
          <div className="hidden pb-1 text-right pr-2 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint lg:block">
            Weekly
          </div>
        </div>

        {/* Fixed 6-Row Choreographed Animated Container (Silky Glide + Cascading Stagger) */}
        <div className="relative overflow-hidden">
          <AnimatePresence mode="wait" initial={false} custom={dir}>
            <motion.div
              key={`${view.year}-${view.month}`}
              custom={dir}
              initial={reduce ? { opacity: 0 } : { opacity: 0, x: dir > 0 ? 48 : -48, scale: 0.992 }}
              animate={{
                opacity: 1,
                x: 0,
                scale: 1,
                transition: { duration: 0.46, ease: SPRING_EASE },
              }}
              exit={
                reduce
                  ? { opacity: 0 }
                  : {
                      opacity: 0,
                      x: dir > 0 ? -38 : 38,
                      scale: 0.992,
                      transition: { duration: 0.22, ease: SPRING_EASE },
                    }
              }
              style={{ willChange: "transform, opacity" }}
              className="grid grid-rows-6 gap-1.5 sm:gap-2"
            >
              {monthStats.weeks.map((weekCells, rowIdx) => {
                const wkSummary = monthStats.weeklySummaries[rowIdx]!;
                return (
                  <div
                    key={`week-${rowIdx}`}
                    className="grid grid-cols-7 gap-1.5 sm:gap-2 lg:grid-cols-[repeat(7,minmax(0,1fr))_108px]"
                  >
                    {weekCells.map((cell, colIdx) => {
                      const cellHeight = spacious
                        ? "h-[60px] sm:h-[96px]"
                        : "h-[54px] sm:h-[84px]";

                      // Silky per-row + per-column cascade (~42ms per row + ~14ms per cell)
                      const staggerDelay = reduce ? 0 : rowIdx * 0.042 + colIdx * 0.014;

                      if (!cell.key) {
                        return (
                          <motion.div
                            key={`pad-${rowIdx}-${colIdx}`}
                            aria-hidden
                            initial={reduce ? false : { opacity: 0 }}
                            animate={{ opacity: 1 }}
                            transition={{ duration: 0.36, delay: staggerDelay, ease: SPRING_EASE }}
                            className={cn(
                              "rounded-[12px] border border-transparent bg-ink/[0.015] sm:rounded-[14px]",
                              cellHeight,
                            )}
                          />
                        );
                      }

                      const day = byDay.get(cell.key);
                      const pnl = day?.pnl ?? null;
                      const isToday = cell.key === todayKey();
                      const isSelected = selectedDay === cell.key;
                      const dayEntries = monthStats.entriesByDate.get(cell.key) ?? [];
                      const hasTrades = dayEntries.length > 0;
                      const allReviewed = hasTrades && dayEntries.every((e) => e.reviewStatus === "reviewed");
                      const isNoTrade = !hasTrades && noTradeDays.has(cell.key);

                      // Proportional soft green/red surface tint
                      const ratio = pnl !== null && pnl !== 0 ? Math.min(1, Math.abs(pnl) / monthStats.maxAbsDayPnl) : 0;
                      const tintStyle: React.CSSProperties | undefined =
                        pnl !== null && pnl !== 0
                          ? {
                              backgroundColor:
                                pnl > 0
                                  ? `color-mix(in srgb, var(--profit) ${Math.round(6 + ratio * 11)}%, var(--surface))`
                                  : `color-mix(in srgb, var(--loss) ${Math.round(6 + ratio * 11)}%, var(--surface))`,
                            }
                          : undefined;

                      return (
                        <motion.button
                          key={cell.key}
                          type="button"
                          onClick={() => setSelectedDay(cell.key)}
                          onPointerEnter={() => setScrubDay(hasTrades ? cell.key : null)}
                          onFocus={() => setScrubDay(hasTrades ? cell.key : null)}
                          initial={reduce ? false : { opacity: 0, y: 9, scale: 0.965 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          transition={{ duration: 0.42, delay: staggerDelay, ease: SPRING_EASE }}
                          style={tintStyle}
                          aria-label={`${formatDateFull(cell.key)}${pnl !== null ? `, ${formatSignedMoney(pnl, currency)}` : ", no trades"}`}
                          aria-pressed={isSelected}
                          className={cn(
                            "group relative flex flex-col justify-between rounded-[12px] border p-1.5 text-left outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-[1px] active:scale-[0.97] sm:rounded-[14px] sm:p-2.5",
                            cellHeight,
                            isSelected
                              ? "border-gold ring-2 ring-gold/40"
                              : isToday
                                ? "border-gold/70 ring-1 ring-gold/30"
                                : pnl !== null && pnl > 0
                                  ? "border-profit/25 hover:border-profit/55"
                                  : pnl !== null && pnl < 0
                                    ? "border-loss/25 hover:border-loss/55"
                                    : "border-line-soft bg-surface/75 hover:border-line-strong hover:bg-surface",
                          )}
                        >
                          {/* Top Row: Day number top-left (filled circle on Today) + review status indicator */}
                          <span className="flex w-full items-center justify-between">
                            <span
                              className={cn(
                                "text-[11px] font-semibold tabular-nums leading-none sm:text-[12px]",
                                isToday
                                  ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-strong px-1.5 text-[11px] font-bold text-on-gold shadow-xs"
                                  : hasTrades
                                    ? "text-ink"
                                    : "text-muted/80 group-hover:text-ink",
                              )}
                            >
                              {cell.day}
                            </span>

                            {hasTrades ? (
                              <span
                                title={allReviewed ? "All trades reviewed" : "Pending review"}
                                className={cn(
                                  "h-1.5 w-1.5 rounded-full",
                                  allReviewed ? "bg-profit" : "bg-gold",
                                )}
                              />
                            ) : isNoTrade ? (
                              <span
                                title="No-trade discipline day"
                                className="h-1.5 w-1.5 rounded-full border border-gold/80"
                              />
                            ) : null}
                          </span>

                          {/* Mobile compact colored marker dots + compact P&L */}
                          {pnl !== null && pnl !== 0 && (
                            <span className="flex flex-col items-center justify-end sm:items-start">
                              <span
                                className={cn(
                                  "mb-0.5 h-1.5 w-1.5 rounded-full sm:hidden",
                                  pnl > 0 ? "bg-profit" : "bg-loss",
                                )}
                              />
                              <span
                                className={cn(
                                  "num block max-w-full truncate font-mono text-[10px] font-semibold leading-none tracking-[-0.02em] sm:text-[14px]",
                                  pnl > 0 ? "text-profit" : "text-loss",
                                )}
                              >
                                {pnl > 0 ? "+" : "−"}$
                                {Math.abs(pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                              </span>
                            </span>
                          )}
                        </motion.button>
                      );
                    })}

                    {/* 8th Column: Weekly P&L Summary (Desktop lg+) */}
                    <motion.div
                      initial={reduce ? false : { opacity: 0, y: 7, scale: 0.97 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      transition={{ duration: 0.42, delay: reduce ? 0 : rowIdx * 0.042 + 0.09, ease: SPRING_EASE }}
                      className={cn(
                        "hidden flex-col justify-between rounded-[14px] border border-line-soft bg-raised/45 px-3 py-2.5 text-right lg:flex",
                        spacious ? "h-[96px]" : "h-[84px]",
                      )}
                    >
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">
                        Wk {rowIdx + 1}
                      </span>
                      <div>
                        <p
                          className={cn(
                            "num font-mono text-[13.5px] font-semibold leading-none",
                            wkSummary.pnl > 0
                              ? "text-profit"
                              : wkSummary.pnl < 0
                                ? "text-loss"
                                : "text-faint",
                          )}
                        >
                          {wkSummary.trades > 0
                            ? `${wkSummary.pnl > 0 ? "+" : wkSummary.pnl < 0 ? "−" : ""}$${Math.abs(wkSummary.pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}`
                            : "—"}
                        </p>
                        <p className="mt-1 text-[10.5px] text-faint">
                          {wkSummary.trades > 0
                            ? `${wkSummary.trades} ${wkSummary.trades === 1 ? "trade" : "trades"}`
                            : "0 trades"}
                        </p>
                      </div>
                    </motion.div>
                  </div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Subtle Footer Legend */}
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft pt-3.5 text-[11.5px] text-faint">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-profit" /> Reviewed
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-gold" /> Review pending
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full border border-gold" /> No-trade day
          </span>
        </div>
      </div>

      {/* Day Inspector: Translucent Popover on Desktop (md+) & Draggable Bottom Sheet on Mobile (<md) */}
      <AnimatePresence>
        {selectedDay && (
          <>
            <motion.button
              key="day-inspector-backdrop"
              type="button"
              aria-label="Close day inspector"
              tabIndex={-1}
              onClick={() => setSelectedDay(null)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.22, ease: SPRING_EASE }}
              className="fixed inset-0 z-[75] bg-black/35 backdrop-blur-[2px]"
            />

            <motion.div
              key="day-inspector-panel"
              role="dialog"
              aria-modal="true"
              aria-label={formatDateFull(selectedDay)}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.97 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }}
              transition={{ duration: 0.28, ease: SPRING_EASE }}
              drag="y"
              dragControls={sheetDragControls}
              dragListener={false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.4 }}
              onDragEnd={(_, info) => {
                if (info.offset.y > 90 || info.velocity.y > 600) setSelectedDay(null);
              }}
              className={cn(
                "glass fixed z-[76] flex flex-col overflow-hidden border border-line-strong shadow-overlay",
                // Mobile: bottom sheet with drag handle
                "inset-x-0 bottom-0 max-h-[85dvh] rounded-t-[24px] pb-[max(1rem,var(--safe-bottom))]",
                // Desktop: centered Apple Calendar-style translucent inspector popover
                "md:inset-0 md:m-auto md:h-fit md:max-h-[min(640px,calc(100dvh-4rem))] md:w-[min(520px,calc(100vw-3rem))] md:rounded-[22px] md:pb-0",
              )}
            >
              {/* Mobile Drag Handle */}
              <div
                onPointerDown={(e) => sheetDragControls.start(e)}
                className="flex shrink-0 cursor-grab touch-none justify-center pb-1 pt-3 active:cursor-grabbing md:hidden"
              >
                <span className="sheet-handle" />
              </div>

              {/* Inspector Header */}
              <div className="flex shrink-0 items-start justify-between gap-3 border-b border-line px-5 py-4">
                <div>
                  <h3 className="font-display text-[18px] font-semibold tracking-[-0.015em] text-ink">
                    {formatDateFull(selectedDay)}
                  </h3>
                  <p className="mt-0.5 text-[13px] text-muted">
                    {selectedEntries.length > 0 ? (
                      <>
                        {selectedEntries.length} {selectedEntries.length === 1 ? "trade" : "trades"} ·{" "}
                        <span
                          className={cn(
                            "num font-semibold",
                            selectedEntries.reduce((s, e) => s + e.pnl, 0) >= 0 ? "text-profit" : "text-loss",
                          )}
                        >
                          {formatSignedMoney(
                            selectedEntries.reduce((s, e) => s + e.pnl, 0),
                            currency,
                          )}
                        </span>
                      </>
                    ) : selectedDayLog ? (
                      "No-trade discipline day"
                    ) : (
                      "No trades logged"
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedDay(null)}
                  aria-label="Close inspector"
                  className="hit-44 grid h-8 w-8 place-items-center rounded-full bg-ink/[0.07] text-muted transition-colors hover:bg-ink/[0.12] hover:text-ink"
                >
                  ✕
                </button>
              </div>

              {/* Inspector Body: Trades & Notes */}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
                {selectedEntries.map((e) => {
                  const mistakeSummary = summarizeTradeMistakeForFeed(e, filtered, []);
                  const noteSnippet =
                    e.notes?.trim() ||
                    e.reflection?.lesson?.trim() ||
                    e.review?.followUp?.biggestMistake?.trim() ||
                    null;

                  return (
                    <div
                      key={e.id}
                      className="overflow-hidden rounded-[16px] border border-line bg-raised/75 p-4 transition-colors hover:border-line-strong"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {e.entryTime && <span className="num font-mono text-xs text-faint">{e.entryTime}</span>}
                            <span className="truncate text-[15px] font-semibold text-ink">
                              {e.instrument !== "—" ? e.instrument : e.setup || "Session"}
                            </span>
                            {e.direction && (
                              <span
                                className={cn(
                                  "rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase",
                                  e.direction === "long" ? "bg-profit/12 text-profit" : "bg-loss/12 text-loss",
                                )}
                              >
                                {e.direction}
                              </span>
                            )}
                            {e.setup && e.setup !== "—" && (
                              <span className="truncate rounded-full bg-ink/[0.06] px-2.5 py-0.5 text-[11px] font-medium text-muted">
                                {e.setup}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <span
                            className={cn(
                              "num font-mono text-[15.5px] font-semibold",
                              e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted",
                            )}
                          >
                            {formatSignedMoney(e.pnl, currency)}
                          </span>
                          {e.rr != null && (
                            <p className="num text-[11px] text-faint">
                              {e.rr > 0 ? "+" : ""}
                              {e.rr.toFixed(2)}R
                            </p>
                          )}
                        </div>
                      </div>

                      {noteSnippet && (
                        <p className="mt-2.5 rounded-xl bg-ink/[0.04] px-3 py-2 text-[12.5px] leading-relaxed text-muted">
                          “{noteSnippet.length > 180 ? `${noteSnippet.slice(0, 179)}…` : noteSnippet}”
                        </p>
                      )}

                      <div
                        className={cn(
                          "mt-2.5 rounded-xl border px-3 py-2 text-[12px] leading-snug",
                          mistakeSummary.tone === "profit"
                            ? "border-profit/20 bg-profit/[0.06] text-ink"
                            : mistakeSummary.tone === "loss"
                              ? "border-loss/25 bg-loss/[0.07] text-ink"
                              : "border-gold/25 bg-gold/[0.07] text-ink",
                        )}
                      >
                        <p className="font-semibold">
                          <span className="mr-1.5 uppercase tracking-[0.06em] opacity-75">[{mistakeSummary.badge}]</span>
                          {mistakeSummary.headline}
                        </p>
                        <p className="mt-0.5 text-muted">{mistakeSummary.subline}</p>
                      </div>

                      <div className="mt-3 flex items-center justify-between gap-2 pt-1">
                        <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
                          <span
                            className={cn(
                              "h-1.5 w-1.5 rounded-full",
                              e.reviewStatus === "reviewed"
                                ? "bg-profit"
                                : e.reviewStatus === "incomplete"
                                  ? "bg-loss"
                                  : e.reviewStatus === "in_progress"
                                    ? "bg-gold"
                                    : "bg-line-strong",
                            )}
                          />
                          {e.reviewStatus === "reviewed"
                            ? "Reviewed"
                            : e.reviewStatus === "incomplete"
                              ? "Review incomplete"
                              : e.reviewStatus === "in_progress"
                                ? "In progress"
                                : "Not reviewed"}
                        </span>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDay(null);
                              router.push("/feed");
                            }}
                            className="min-h-[34px] rounded-full bg-ink/[0.06] px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.12]"
                          >
                            Replay
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedDay(null);
                              router.push(`/review/${e.id}`);
                            }}
                            className="min-h-[34px] rounded-full bg-gold/15 px-3 py-1 text-[12px] font-semibold text-gold transition-colors hover:bg-gold/25"
                          >
                            Autopsy →
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {selectedEntries.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center">
                    <p className="text-sm font-medium text-ink">
                      {selectedDayLog ? "No-setup discipline day logged" : "No trades logged for this day"}
                    </p>
                    <p className="mt-1 text-xs text-muted">
                      {selectedDayLog?.reason
                        ? `“${selectedDayLog.reason}”`
                        : selectedDayLog
                          ? "You sat on your hands when no A+ setup appeared."
                          : "Log a trade or record a disciplined no-trade day in your Journal."}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={() => {
                    const dayKey = selectedDay;
                    setSelectedDay(null);
                    if (onAddTradeForDate && dayKey) {
                      onAddTradeForDate(dayKey);
                    } else {
                      router.push(`/journal?date=${dayKey}`);
                    }
                  }}
                  className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-3 text-sm font-medium text-muted transition-colors hover:border-gold/50 hover:text-gold"
                >
                  <PlusIcon className="h-4 w-4" />
                  {onAddTradeForDate
                    ? `Add trade for ${formatDateMedium(selectedDay)}`
                    : `Open ${formatDateMedium(selectedDay)} in Journal`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

function SignedMoneyHero({
  value,
  currency,
  tone,
  className,
}: {
  value: number;
  currency: CurrencyCode;
  tone: "profit" | "loss" | "neutral";
  className?: string;
}) {
  const absText = formatMoney(Math.abs(value), currency, { decimals: 2 });
  const sign = value > 0 ? "+" : value < 0 ? "−" : "";
  const full = `${sign}${absText}`;
  const dot = full.lastIndexOf(".");
  return (
    <p
      className={cn(
        "kpi tabular leading-none tracking-[-0.04em]",
        tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-ink",
        className,
      )}
      aria-label={full}
    >
      <span aria-hidden>{dot === -1 ? full : full.slice(0, dot)}</span>
      {dot !== -1 && (
        <span aria-hidden className="text-[0.52em] font-medium text-faint">
          {full.slice(dot)}
        </span>
      )}
    </p>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { groupByDay, monthGrid } from "@/lib/stats";
import type { Challenge, CurrencyCode, JournalEntry, NoTradeLog } from "@/lib/types";
import { formatDateFull, formatDateMedium, formatMoney, formatPct, formatSignedMoney, monthLabel, parseDateKey, todayKey } from "@/lib/format";
import { summarizeTradeMistakeForFeed } from "@/lib/ai-brain";
import { Modal } from "@/components/ui/modal";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { Segmented } from "@/components/journal/flow-ui";
import { EASE } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
type CalendarMode = "standard" | "heatmap" | "cumulative";

/**
 * CalendarView — Upgraded to the Equity Curve (`Performance`) design & interaction benchmark:
 *   1. Editorial top telemetry header with large tabular P&L (`Money` with quiet cents) that
 *      live-scrubs as you hover or focus any calendar day cell.
 *   2. Apple glass `Segmented` view switcher (`Standard` · `Heatmap` · `Cumulative`) + challenge filter + month stepper.
 *   3. Proportional profit/loss cell tinting, bottom micro-bars, R-multiple & review status indicators.
 *   4. 4-column bottom hairline steering strip (`Winning Days`, `Best Session`, `Avg Active Day`, `Review Discipline`).
 *   5. Rich Day Inspector modal with 2-line AI mistake summaries (`summarizeTradeMistakeForFeed`) per trade.
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
  const [mode, setMode] = useState<CalendarMode>("standard");
  const [challengeFilter, setChallengeFilter] = useState("all");
  const [scrubDay, setScrubDay] = useState<string | null>(null);
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

  // Per-day entries map & cumulative P&L map across the active month
  const monthDayStats = useMemo(() => {
    const entriesByDate = new Map<string, JournalEntry[]>();
    for (const e of monthEntries) {
      const list = entriesByDate.get(e.date) ?? [];
      list.push(e);
      entriesByDate.set(e.date, list);
    }

    const sortedDates = [...entriesByDate.keys()].sort();
    const cumByDate = new Map<string, number>();
    let running = 0;
    let maxAbsDayPnl = 1;
    let winningDays = 0;
    let losingDays = 0;
    let flatDays = 0;
    let bestDay: { date: string; pnl: number } | null = null;
    let worstDay: { date: string; pnl: number } | null = null;

    for (const d of sortedDates) {
      const dayPnl = (entriesByDate.get(d) ?? []).reduce((s, e) => s + e.pnl, 0);
      running += dayPnl;
      cumByDate.set(d, running);
      maxAbsDayPnl = Math.max(maxAbsDayPnl, Math.abs(dayPnl));
      if (dayPnl > 0) winningDays++;
      else if (dayPnl < 0) losingDays++;
      else flatDays++;
      if (!bestDay || dayPnl > bestDay.pnl) bestDay = { date: d, pnl: dayPnl };
      if (!worstDay || dayPnl < worstDay.pnl) worstDay = { date: d, pnl: dayPnl };
    }

    const activeDays = sortedDates.length;
    const monthPnl = running;
    const avgDayPnl = activeDays > 0 ? monthPnl / activeDays : 0;
    const dayWinRate = winningDays + losingDays > 0 ? winningDays / (winningDays + losingDays) : 0;
    const reviewedTrades = monthEntries.filter((e) => e.reviewStatus === "reviewed").length;
    const reviewRate = monthEntries.length > 0 ? reviewedTrades / monthEntries.length : 0;

    // Count no-trade days in this month
    let monthNoTradeCount = 0;
    for (const c of cells) {
      if (c.key && noTradeDays.has(c.key) && !entriesByDate.has(c.key)) {
        monthNoTradeCount++;
      }
    }

    return {
      entriesByDate,
      cumByDate,
      maxAbsDayPnl,
      winningDays,
      losingDays,
      flatDays,
      activeDays,
      monthPnl,
      avgDayPnl,
      dayWinRate,
      reviewedTrades,
      reviewRate,
      bestDay,
      worstDay,
      monthNoTradeCount,
    };
  }, [monthEntries, cells, noTradeDays]);

  const navigate = (delta: number) => {
    setDir(delta);
    setScrubDay(null);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const jumpToToday = () => {
    const n = new Date();
    setDir(0);
    setScrubDay(null);
    setView({ year: n.getFullYear(), month: n.getMonth() });
  };

  const now = new Date();
  const isCurrentMonth = view.year === now.getFullYear() && view.month === now.getMonth();

  // Scrubbed day telemetry (follows pointer/focus just like EquityCurve in Performance)
  const scrubbedEntries = scrubDay ? monthDayStats.entriesByDate.get(scrubDay) ?? [] : [];
  const scrubbedDayPnl = scrubDay
    ? scrubbedEntries.reduce((s, e) => s + e.pnl, 0)
    : monthDayStats.monthPnl;
  const scrubbedCumPnl = scrubDay ? monthDayStats.cumByDate.get(scrubDay) ?? null : null;
  const headlineValue = mode === "cumulative" && scrubbedCumPnl !== null ? scrubbedCumPnl : scrubbedDayPnl;
  const headlineTone = headlineValue > 0 ? "profit" : headlineValue < 0 ? "loss" : "neutral";

  const selectedEntries = (selectedDay ? filtered.filter((e) => e.date === selectedDay) : []).sort(
    (a, b) => (a.entryTime ?? "99:99").localeCompare(b.entryTime ?? "99:99"),
  );

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="panel overflow-hidden"
      aria-label="Trading Calendar"
    >
      {/* Layer 1: Equity-Curve Benchmark Editorial Header */}
      <div className="border-b border-line px-5 pb-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
                {scrubDay ? formatDateFull(scrubDay) : `${monthLabel(view.year, view.month)} · Session Calendar`}
              </p>
              {scrubDay && (
                <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em] text-gold">
                  Inspecting Day
                </span>
              )}
            </div>

            <SignedMoneyHero
              value={headlineValue}
              currency={currency}
              tone={headlineTone}
              className="mt-2 text-[36px] sm:text-[48px]"
            />

            <p className="mt-2 min-h-[22px] text-[13.5px] leading-snug text-muted" aria-live="polite">
              {scrubDay ? (
                scrubbedEntries.length > 0 ? (
                  <>
                    <span className="font-medium text-ink">
                      {scrubbedEntries.length} {scrubbedEntries.length === 1 ? "trade" : "trades"}
                    </span>
                    {scrubbedCumPnl !== null && (
                      <span className="ml-2 text-muted">
                        · Cumulative month:{" "}
                        <b className={cn("num font-semibold", scrubbedCumPnl >= 0 ? "text-profit" : "text-loss")}>
                          {formatSignedMoney(scrubbedCumPnl, currency)}
                        </b>
                      </span>
                    )}
                    <span className="ml-2 text-faint">· Click cell to inspect replay &amp; autopsy</span>
                  </>
                ) : noTradeDays.has(scrubDay) ? (
                  <span className="text-gold">Disciplined no-trade session logged · Sat on hands</span>
                ) : (
                  <span>No trades logged on {formatDateMedium(scrubDay)} · Click to add or inspect</span>
                )
              ) : monthEntries.length > 0 ? (
                <>
                  <span className="font-medium text-ink">
                    {monthDayStats.activeDays} active {monthDayStats.activeDays === 1 ? "session" : "sessions"}
                  </span>
                  <span className="ml-2">
                    ({monthEntries.length} {monthEntries.length === 1 ? "trade" : "trades"})
                  </span>
                  <span className="ml-2 text-faint">· Hover any day to scrub session telemetry</span>
                </>
              ) : (
                <span>No trades logged in {monthLabel(view.year, view.month)} yet.</span>
              )}
            </p>
          </div>

          {/* Controls: View Mode Segmented + Challenge Filter + Month Stepper */}
          <div className="flex flex-wrap items-center gap-2.5 self-start lg:justify-end">
            {!compact && (
              <Segmented
                compact
                label="Calendar view mode"
                layoutId="cal-view-mode"
                value={mode}
                onChange={setMode}
                options={[
                  { id: "standard", label: "Standard" },
                  { id: "heatmap", label: "Heatmap" },
                  { id: "cumulative", label: "Cumulative" },
                ]}
              />
            )}

            {challenges.length > 0 && (
              <select
                aria-label="Filter by challenge"
                value={challengeFilter}
                onChange={(e) => setChallengeFilter(e.target.value)}
                className="h-9 rounded-full border border-line bg-raised px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:border-line-strong focus:border-gold/60 focus:outline-none"
              >
                <option value="all">All challenges</option>
                {challenges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <div className="inline-flex items-center gap-1 rounded-full border border-line bg-ink/[0.03] p-1">
              <button
                type="button"
                onClick={() => navigate(-1)}
                aria-label="Previous month"
                className="grid h-7 w-7 place-items-center rounded-full text-muted transition-all hover:bg-raised hover:text-ink active:scale-90"
              >
                <ChevronLeftIcon className="h-3.5 w-3.5" />
              </button>
              <AnimatePresence mode="wait" initial={false}>
                <motion.span
                  key={`${view.year}-${view.month}`}
                  initial={{ opacity: 0, y: dir >= 0 ? 5 : -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: dir >= 0 ? -5 : 5 }}
                  transition={{ duration: 0.18 }}
                  className="min-w-[122px] px-2 text-center font-display text-[13px] font-semibold tracking-[-0.01em] text-ink"
                  aria-live="polite"
                >
                  {monthLabel(view.year, view.month)}
                </motion.span>
              </AnimatePresence>
              <button
                type="button"
                onClick={() => navigate(1)}
                aria-label="Next month"
                className="grid h-7 w-7 place-items-center rounded-full text-muted transition-all hover:bg-raised hover:text-ink active:scale-90"
              >
                <ChevronRightIcon className="h-3.5 w-3.5" />
              </button>
            </div>

            {!isCurrentMonth && (
              <button
                type="button"
                onClick={jumpToToday}
                className="h-9 rounded-full border border-line bg-raised px-3.5 text-[12px] font-semibold text-gold transition-all hover:border-gold/50 active:scale-95"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Layer 2: Interactive Calendar Grid */}
      <div
        className="px-3 pb-4 pt-4 sm:px-6 sm:pb-6"
        onPointerLeave={() => setScrubDay(null)}
      >
        <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((w, idx) => (
            <div
              key={w}
              className={cn(
                "pb-1 text-center text-[10.5px] font-semibold uppercase tracking-[0.12em]",
                idx === 0 || idx === 6 ? "text-faint/65" : "text-faint",
              )}
            >
              <span className="hidden sm:inline">{w}</span>
              <span className="sm:hidden">{w[0]}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view.year}-${view.month}-${mode}`}
            initial={{ opacity: 0, x: dir * 16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -16 }}
            transition={{ duration: 0.24, ease: EASE }}
            className="grid grid-cols-7 gap-1.5 sm:gap-2"
          >
            {cells.map((cell, i) => {
              if (!cell.key) {
                return (
                  <div
                    key={`pad-${i}`}
                    aria-hidden
                    className="min-h-[68px] rounded-[16px] bg-ink/[0.015] sm:min-h-[96px]"
                  />
                );
              }

              const day = byDay.get(cell.key);
              const pnl = day?.pnl ?? null;
              const trades = day?.trades ?? 0;
              const isToday = cell.key === todayKey();
              const isScrubbed = scrubDay === cell.key;
              const dayEntries = monthDayStats.entriesByDate.get(cell.key) ?? [];
              const cumPnl = monthDayStats.cumByDate.get(cell.key) ?? null;
              const allReviewed = dayEntries.length > 0 && dayEntries.every((e) => e.reviewStatus === "reviewed");
              const anyPending = dayEntries.some((e) => e.reviewStatus !== "reviewed" && e.reviewStatus !== "not_reviewed");
              const hasMistake = dayEntries.some((e) => !!e.review?.followUp?.mistakeCategory);
              const isNoTrade = dayEntries.length === 0 && noTradeDays.has(cell.key);

              // Proportional intensity for Heatmap / Standard modes
              const ratio = pnl !== null && pnl !== 0 ? Math.min(1, Math.abs(pnl) / monthDayStats.maxAbsDayPnl) : 0;
              const avgR = (() => {
                const withR = dayEntries.filter((e) => typeof e.rr === "number" && Number.isFinite(e.rr));
                if (!withR.length) return null;
                return withR.reduce((s, e) => s + (e.rr ?? 0), 0);
              })();

              const displayVal = mode === "cumulative" && cumPnl !== null ? cumPnl : pnl;

              const heatStyle: React.CSSProperties | undefined =
                pnl !== null && pnl !== 0
                  ? {
                      backgroundColor:
                        pnl > 0
                          ? `color-mix(in srgb, var(--profit) ${mode === "heatmap" ? Math.round(12 + ratio * 26) : Math.round(4 + ratio * 10)}%, var(--surface))`
                          : `color-mix(in srgb, var(--loss) ${mode === "heatmap" ? Math.round(12 + ratio * 26) : Math.round(4 + ratio * 10)}%, var(--surface))`,
                    }
                  : undefined;

              return (
                <motion.button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(cell.key)}
                  onPointerEnter={() => setScrubDay(cell.key)}
                  onFocus={() => setScrubDay(cell.key)}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, delay: Math.min(i * 0.006, 0.16), ease: EASE }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  style={heatStyle}
                  aria-label={`${formatDateFull(cell.key)}${pnl !== null ? `, ${formatSignedMoney(pnl, currency)}` : ", no trades"}`}
                  className={cn(
                    "group relative flex min-h-[68px] flex-col justify-between overflow-hidden rounded-[16px] border p-2 text-left outline-none transition-[border-color,box-shadow,background-color] duration-200 sm:min-h-[96px] sm:rounded-[18px] sm:p-2.5",
                    isToday
                      ? "border-gold/70 ring-2 ring-gold/25"
                      : isScrubbed
                        ? "border-line-strong shadow-[0_8px_24px_-12px_rgb(0_0_0/0.18)]"
                        : pnl !== null && pnl > 0
                          ? "border-profit/25 hover:border-profit/50"
                          : pnl !== null && pnl < 0
                            ? "border-loss/25 hover:border-loss/50"
                            : "border-line-soft bg-surface hover:border-line-strong",
                  )}
                >
                  {/* Top row: Day number + review/discipline status dots */}
                  <span className="flex w-full items-center justify-between gap-1">
                    <span
                      className={cn(
                        "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums",
                        isToday
                          ? "bg-gold-strong text-on-gold shadow-sm"
                          : pnl !== null && pnl !== 0
                            ? "text-ink"
                            : "text-muted group-hover:text-ink",
                      )}
                    >
                      {cell.day}
                    </span>

                    <span className="flex items-center gap-1">
                      {hasMistake && (
                        <span
                          title="Mistake tagged in autopsy"
                          className="h-1.5 w-1.5 rounded-full bg-[#5e5ce6]"
                        />
                      )}
                      {dayEntries.length > 0 && (
                        <span
                          title={allReviewed ? "All trades reviewed" : anyPending ? "Review in progress" : "Not reviewed"}
                          className={cn(
                            "h-1.5 w-1.5 rounded-full",
                            allReviewed ? "bg-profit" : anyPending ? "bg-gold" : "bg-line-strong",
                          )}
                        />
                      )}
                      {isNoTrade && (
                        <span
                          title="No-trade discipline day"
                          className="h-2 w-2 rounded-full border border-gold bg-gold/20"
                        />
                      )}
                    </span>
                  </span>

                  {/* Middle row: Trade count & R multiple on desktop */}
                  {trades > 0 ? (
                    <span className="my-auto hidden items-center justify-between gap-1 pt-1 text-[10px] font-medium text-muted sm:flex">
                      <span>
                        {trades} {trades === 1 ? "tr" : "trs"}
                      </span>
                      {avgR !== null && (
                        <span className={cn("num font-semibold", avgR > 0 ? "text-profit/85" : avgR < 0 ? "text-loss/85" : "text-faint")}>
                          {avgR > 0 ? "+" : ""}
                          {avgR.toFixed(1)}R
                        </span>
                      )}
                    </span>
                  ) : isNoTrade ? (
                    <span className="my-auto hidden text-[10px] font-medium text-gold sm:block">
                      Sat on hands
                    </span>
                  ) : null}

                  {/* Bottom row: P&L badge + proportional magnitude bar */}
                  <div className="mt-auto w-full">
                    {displayVal !== null && displayVal !== 0 && (
                      <span
                        className={cn(
                          "num block truncate font-mono text-[11px] font-bold leading-tight tracking-[-0.02em] sm:text-[14px]",
                          displayVal > 0 ? "text-profit" : "text-loss",
                        )}
                      >
                        {displayVal > 0 ? "+" : "−"}$
                        {Math.abs(displayVal).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                      </span>
                    )}

                    {pnl !== null && pnl !== 0 && (
                      <div className="mt-1.5 h-[3px] w-full overflow-hidden rounded-full bg-ink/[0.06]" aria-hidden>
                        <div
                          className={cn("h-full rounded-full transition-all duration-300", pnl > 0 ? "bg-profit" : "bg-loss")}
                          style={{ width: `${Math.max(18, Math.round(ratio * 100))}%` }}
                        />
                      </div>
                    )}
                  </div>
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Legend bar */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 px-1 text-[11.5px] text-faint">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-profit" /> Reviewed
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-gold" /> Review pending
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-[#5e5ce6]" /> AI mistake tagged
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full border border-gold bg-gold/20" /> No-setup discipline
            </span>
          </div>
          <span className="text-muted">Click any session to inspect replays &amp; AI mistake summaries</span>
        </div>
      </div>

      {/* Layer 3: 4-Column Hairline Steering Strip (Benchmark: Performance) */}
      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        <SteeringCell label="Winning days">
          <SteeringValue className={monthDayStats.dayWinRate >= 0.5 ? "text-profit" : "text-ink"}>
            {monthDayStats.activeDays > 0 ? `${Math.round(monthDayStats.dayWinRate * 100)}%` : "—"}
          </SteeringValue>
          <SteeringSub>
            {monthDayStats.winningDays}W · {monthDayStats.losingDays}L
            {monthDayStats.monthNoTradeCount > 0 ? ` · ${monthDayStats.monthNoTradeCount} no-setup` : ""}
          </SteeringSub>
          <SteeringMeter pct={monthDayStats.dayWinRate} tone="profit" />
        </SteeringCell>

        <SteeringCell label="Average active day">
          <SteeringValue className={monthDayStats.avgDayPnl > 0 ? "text-profit" : monthDayStats.avgDayPnl < 0 ? "text-loss" : "text-ink"}>
            {monthDayStats.activeDays > 0 ? formatSignedMoney(monthDayStats.avgDayPnl, currency) : "—"}
          </SteeringValue>
          <SteeringSub>
            Across {monthDayStats.activeDays} {monthDayStats.activeDays === 1 ? "session" : "sessions"} ({monthEntries.length} trades)
          </SteeringSub>
        </SteeringCell>

        <SteeringCell label="Best &amp; worst day">
          <SteeringValue className={monthDayStats.bestDay && monthDayStats.bestDay.pnl > 0 ? "text-profit" : "text-ink"}>
            {monthDayStats.bestDay ? formatSignedMoney(monthDayStats.bestDay.pnl, currency) : "—"}
          </SteeringValue>
          <SteeringSub>
            {monthDayStats.worstDay && monthDayStats.worstDay.pnl < 0
              ? `Worst day: ${formatSignedMoney(monthDayStats.worstDay.pnl, currency)} (${formatDateMedium(monthDayStats.worstDay.date)})`
              : monthDayStats.bestDay
                ? `Best on ${formatDateMedium(monthDayStats.bestDay.date)}`
                : "Log a session to compare"}
          </SteeringSub>
        </SteeringCell>

        <SteeringCell label="Autopsy discipline">
          <SteeringValue className={monthDayStats.reviewRate >= 0.8 ? "text-profit" : monthEntries.length > 0 ? "text-gold" : "text-ink"}>
            {monthEntries.length > 0 ? `${Math.round(monthDayStats.reviewRate * 100)}%` : "—"}
          </SteeringValue>
          <SteeringSub>
            {monthDayStats.reviewedTrades} of {monthEntries.length} trades reviewed for AI Brain
          </SteeringSub>
          <SteeringMeter pct={monthDayStats.reviewRate} tone="gold" />
        </SteeringCell>
      </dl>

      {/* Rich Day Inspector Modal */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        size="md"
        title={selectedDay ? formatDateFull(selectedDay) : ""}
        description={
          selectedDay
            ? `${selectedEntries.length} ${selectedEntries.length === 1 ? "trade" : "trades"} · ${formatSignedMoney(
                selectedEntries.reduce((s, e) => s + e.pnl, 0),
                currency,
              )}`
            : ""
        }
      >
        <div className="space-y-3 px-5 py-5">
          {selectedEntries.map((e) => {
            const mistakeSummary = summarizeTradeMistakeForFeed(e, filtered, []);
            return (
              <div
                key={e.id}
                className="overflow-hidden rounded-[18px] border border-line bg-raised/70 p-4 transition-colors hover:border-line-strong"
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
                        "num font-mono text-[16px] font-semibold",
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

                {/* 2-Line AI Mistake Recognition Strip */}
                <div
                  className={cn(
                    "mt-3 rounded-xl border px-3 py-2 text-[12px] leading-snug",
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
                      ? "Reviewed in Autopsy"
                      : e.reviewStatus === "incomplete"
                        ? "Review incomplete"
                        : e.reviewStatus === "in_progress"
                          ? "Review in progress"
                          : "Not reviewed yet"}
                  </span>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDay(null);
                        router.push("/feed");
                      }}
                      className="rounded-full bg-ink/[0.06] px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.12]"
                    >
                      Watch Replay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDay(null);
                        router.push(`/review/${e.id}`);
                      }}
                      className="rounded-full bg-gold/15 px-3 py-1 text-[12px] font-semibold text-gold transition-colors hover:bg-gold/25"
                    >
                      Open Autopsy →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}

          {selectedEntries.length === 0 && (
            <div className="rounded-2xl border border-dashed border-line-strong px-4 py-7 text-center">
              <p className="text-sm font-medium text-ink">
                {selectedDay && noTradeDays.has(selectedDay)
                  ? "No-setup discipline day logged"
                  : "No trades logged for this session"}
              </p>
              <p className="mt-1 text-xs text-muted">
                {selectedDay && noTradeDays.has(selectedDay)
                  ? "You sat on your hands when no A+ setup appeared."
                  : "Log a trade or record a disciplined no-trade day in your Journal."}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={() => {
              setSelectedDay(null);
              router.push(`/journal?date=${selectedDay}`);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-line-strong py-3 text-sm font-medium text-muted transition-colors hover:border-gold/50 hover:text-gold"
          >
            <PlusIcon className="h-4 w-4" />
            Open {selectedDay ? formatDateMedium(selectedDay) : "day"} in Journal
          </button>
        </div>
      </Modal>
    </motion.section>
  );
}

/* --------------------------------- pieces -------------------------------- */

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

function SteeringCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4 sm:px-7 sm:py-5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}

function SteeringValue({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("kpi text-[22px] leading-none sm:text-[24px]", className)}>{children}</p>;
}

function SteeringSub({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-1.5 text-[12px] leading-snug text-muted", className)}>{children}</p>;
}

function SteeringMeter({ pct, tone }: { pct: number; tone: "profit" | "gold" | "loss" }) {
  const fill = tone === "gold" ? "bg-gold-strong" : tone === "loss" ? "bg-loss" : "bg-profit";
  return (
    <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-line-soft" aria-hidden>
      <motion.div
        className={cn("h-full rounded-full", fill)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(1, Math.max(0, pct)) * 100}%` }}
        transition={{ duration: 0.85, delay: 0.2, ease: EASE }}
      />
    </div>
  );
}

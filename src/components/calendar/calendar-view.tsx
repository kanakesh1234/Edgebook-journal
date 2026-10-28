"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { groupByDay, monthGrid } from "@/lib/stats";
import type { Challenge, CurrencyCode, JournalEntry, NoTradeLog } from "@/lib/types";
import { formatDateFull, formatDateMedium, formatMoney, formatSignedMoney, monthLabel, parseDateKey, todayKey } from "@/lib/format";
import { summarizeTradeMistakeForFeed } from "@/lib/ai-brain";
import { Modal } from "@/components/ui/modal";
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from "@/components/ui/icons";
import { EASE } from "@/components/landing/reveal";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/**
 * CalendarView — Apple HIG Minimal & Interactive Session Surface (Equity Curve Benchmark):
 *   1. Clean single-row header: Month Net P&L hero (with quiet cents) that smoothly scrubs
 *      ONLY when hovering a traded day (never flashes $0.00 on empty days), plus a concise
 *      1-line summary and a sleek `< Month Year >` pill.
 *   2. Minimal, breathable day cells: only the day number + 1 subtle status dot at the top,
 *      and the crisp P&L figure at the bottom with proportional profit/loss surface tinting.
 *      Zero clutter (no per-cell progress bars, no "Sat on hands" text, no R-multiple noise).
 *   3. Whisper-quiet hairline summary bar at the bottom.
 */
export function CalendarView({
  entries,
  dayLogs,
  challenges,
  currency,
  defaultChallengeId = null,
  spacious = false,
}: {
  entries: JournalEntry[];
  dayLogs: NoTradeLog[];
  challenges: Challenge[];
  currency: CurrencyCode;
  /** Preselect/track the primary challenge — stays in sync when it changes. */
  defaultChallengeId?: string | null;
  compact?: boolean;
  /** Used by Home, where the calendar is an editorial destination rather than a utility view. */
  spacious?: boolean;
}) {
  const router = useRouter();
  const [view, setView] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [dir, setDir] = useState(0);
  const [challengeFilter, setChallengeFilter] = useState("all");
  const [scrubDay, setScrubDay] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

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

  const monthStats = useMemo(() => {
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

    return {
      entriesByDate,
      maxAbsDayPnl,
      winningDays,
      losingDays,
      activeDays,
      monthPnl,
      avgDayPnl,
      dayWinRate,
      bestDay,
    };
  }, [monthEntries]);

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

  // Only scrub the hero telemetry when hovering a day that has trades (never drop to $0.00 on empty cells)
  const scrubbedEntries = scrubDay ? monthStats.entriesByDate.get(scrubDay) ?? [] : [];
  const isScrubbingActiveDay = scrubDay !== null && scrubbedEntries.length > 0;
  const scrubbedDayPnl = isScrubbingActiveDay
    ? scrubbedEntries.reduce((s, e) => s + e.pnl, 0)
    : monthStats.monthPnl;
  const headlineTone = scrubbedDayPnl > 0 ? "profit" : scrubbedDayPnl < 0 ? "loss" : "neutral";

  const scrubbedR = useMemo(() => {
    if (!isScrubbingActiveDay) return null;
    const withR = scrubbedEntries.filter((e) => typeof e.rr === "number" && Number.isFinite(e.rr));
    if (!withR.length) return null;
    return withR.reduce((s, e) => s + (e.rr ?? 0), 0);
  }, [isScrubbingActiveDay, scrubbedEntries]);

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
      {/* Clean Single-Row Editorial Header (Benchmark: Equity Curve) */}
      <div className="px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
              {isScrubbingActiveDay && scrubDay ? formatDateFull(scrubDay) : `${monthLabel(view.year, view.month)} · Calendar`}
            </p>

            <SignedMoneyHero
              value={scrubbedDayPnl}
              currency={currency}
              tone={headlineTone}
              className="mt-2 text-[36px] sm:text-[46px]"
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
                    <span className="hidden sm:inline ml-2 text-faint">
                      · Best {formatSignedMoney(monthStats.bestDay.pnl, currency)}
                    </span>
                  )}
                </>
              ) : (
                <span>No sessions logged in {monthLabel(view.year, view.month)}.</span>
              )}
            </p>
          </div>

          {/* Single-row minimal controls */}
          <div className="flex shrink-0 items-center gap-2 self-start">
            {challenges.length > 0 && (
              <select
                aria-label="Filter by challenge"
                value={challengeFilter}
                onChange={(e) => setChallengeFilter(e.target.value)}
                className="h-9 rounded-full border border-line bg-surface px-3.5 text-[12.5px] font-medium text-ink transition-colors hover:border-line-strong focus:border-gold/60 focus:outline-none"
              >
                <option value="all">All challenges</option>
                {challenges.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            )}

            <div className="inline-flex h-9 items-center gap-0.5 rounded-full border border-line bg-surface p-1">
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
                  initial={{ opacity: 0, y: dir >= 0 ? 4 : -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: dir >= 0 ? -4 : 4 }}
                  transition={{ duration: 0.16 }}
                  className="min-w-[116px] px-2 text-center font-display text-[13px] font-semibold tracking-[-0.01em] text-ink"
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
                className="h-9 rounded-full border border-line bg-surface px-3.5 text-[12px] font-semibold text-gold transition-all hover:border-gold/50 active:scale-95"
              >
                Today
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Minimal Apple HIG Calendar Grid */}
      <div
        className={cn("px-4 pt-5 sm:px-7", spacious ? "pb-7 sm:pb-9" : "pb-5 sm:pb-7")}
        onPointerLeave={() => setScrubDay(null)}
      >
        <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">
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
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view.year}-${view.month}`}
            initial={{ opacity: 0, x: dir * 14 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -14 }}
            transition={{ duration: 0.22, ease: EASE }}
            className="grid grid-cols-7 gap-1.5 sm:gap-2"
          >
            {cells.map((cell, i) => {
              if (!cell.key) {
                return <div key={`pad-${i}`} aria-hidden className={spacious ? "min-h-[72px] sm:min-h-[102px]" : "min-h-[60px] sm:min-h-[82px]"} />;
              }

              const day = byDay.get(cell.key);
              const pnl = day?.pnl ?? null;
              const isToday = cell.key === todayKey();
              const dayEntries = monthStats.entriesByDate.get(cell.key) ?? [];
              const hasTrades = dayEntries.length > 0;
              const allReviewed = hasTrades && dayEntries.every((e) => e.reviewStatus === "reviewed");
              const isNoTrade = !hasTrades && noTradeDays.has(cell.key);

              const ratio = pnl !== null && pnl !== 0 ? Math.min(1, Math.abs(pnl) / monthStats.maxAbsDayPnl) : 0;
              const tintStyle: React.CSSProperties | undefined =
                pnl !== null && pnl !== 0
                  ? {
                      backgroundColor:
                        pnl > 0
                          ? `color-mix(in srgb, var(--profit) ${Math.round(5 + ratio * 11)}%, var(--surface))`
                          : `color-mix(in srgb, var(--loss) ${Math.round(5 + ratio * 11)}%, var(--surface))`,
                    }
                  : undefined;

              return (
                <motion.button
                  key={cell.key}
                  type="button"
                  onClick={() => setSelectedDay(cell.key)}
                  onPointerEnter={() => setScrubDay(hasTrades ? cell.key : null)}
                  onFocus={() => setScrubDay(hasTrades ? cell.key : null)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.18, delay: Math.min(i * 0.004, 0.12) }}
                  whileHover={{ y: -1.5 }}
                  whileTap={{ scale: 0.97 }}
                  style={tintStyle}
                  aria-label={`${formatDateFull(cell.key)}${pnl !== null ? `, ${formatSignedMoney(pnl, currency)}` : ", no trades"}`}
                  className={cn(
                    "group relative flex flex-col justify-between rounded-[14px] border p-2 text-left outline-none transition-[border-color,box-shadow,background-color] duration-200 sm:rounded-[16px] sm:p-2.5",
                    spacious ? "min-h-[72px] sm:min-h-[102px]" : "min-h-[60px] sm:min-h-[82px]",
                    isToday
                      ? "border-gold/70 ring-1 ring-gold/30"
                      : pnl !== null && pnl > 0
                        ? "border-profit/25 hover:border-profit/55"
                        : pnl !== null && pnl < 0
                          ? "border-loss/25 hover:border-loss/55"
                          : "border-line-soft bg-surface/75 hover:border-line-strong hover:bg-surface",
                  )}
                >
                  {/* Top: Day number + single clean status dot */}
                  <span className="flex w-full items-center justify-between">
                    <span
                      className={cn(
                        "text-[11.5px] font-semibold tabular-nums leading-none",
                        isToday
                          ? "inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-gold-strong px-1 text-[11px] text-on-gold"
                          : hasTrades
                            ? "text-ink"
                            : "text-muted/80 group-hover:text-ink",
                      )}
                    >
                      {cell.day}
                    </span>

                    {hasTrades ? (
                      <span
                        title={allReviewed ? "Reviewed" : "Pending review"}
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          allReviewed ? "bg-profit" : "bg-gold",
                        )}
                      />
                    ) : isNoTrade ? (
                      <span
                        title="No-trade day"
                        className="h-1.5 w-1.5 rounded-full border border-gold/80"
                      />
                    ) : null}
                  </span>

                  {/* Bottom: Single crisp P&L value */}
                  {pnl !== null && pnl !== 0 && (
                    <span
                      className={cn(
                        "num block truncate font-mono text-[11.5px] font-semibold leading-none tracking-[-0.02em] sm:text-[14.5px]",
                        pnl > 0 ? "text-profit" : "text-loss",
                      )}
                    >
                      {pnl > 0 ? "+" : "−"}$
                      {Math.abs(pnl).toLocaleString("en-US", { maximumFractionDigits: 0 })}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Day Inspector Modal */}
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
                      className="rounded-full bg-ink/[0.06] px-3 py-1 text-[12px] font-medium text-ink transition-colors hover:bg-ink/[0.12]"
                    >
                      Replay
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedDay(null);
                        router.push(`/review/${e.id}`);
                      }}
                      className="rounded-full bg-gold/15 px-3 py-1 text-[12px] font-semibold text-gold transition-colors hover:bg-gold/25"
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

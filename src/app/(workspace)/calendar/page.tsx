"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { groupByDay, monthGrid } from "@/lib/stats";
import { evaluateRules } from "@/lib/rules";
import { primaryChallenge } from "@/lib/challenges";
import type { Challenge } from "@/lib/types";
import {
  formatDateFull,
  formatSignedMoney,
  monthLabel,
  parseDateKey,
  todayKey,
} from "@/lib/format";
import {
  CalendarIcon,
  CheckIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { EntryFormModal } from "@/components/journal/entry-form-modal";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const REVIEW_LABEL: Record<string, string> = {
  not_reviewed: "Not reviewed",
  in_progress: "Review in progress",
  reviewed: "Reviewed",
  incomplete: "Review incomplete",
};

const REVIEW_DOT: Record<string, string> = {
  not_reviewed: "bg-line-strong",
  in_progress: "bg-gold",
  reviewed: "bg-profit",
  incomplete: "bg-loss",
};

/**
 * Calendar — the primary historical navigation.
 * Neutral, readable cells; P&L as a small badge; review status as a dot;
 * challenge filtering; date → trades → Trade Review.
 */
export default function CalendarPage() {
  const router = useRouter();
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const dayLogs = useApp((s) => s.dayLogs);
  const challenges = useMemo(() => settings.challenges ?? [], [settings.challenges]);
  const violations = useMemo(() => evaluateRules(entries, settings), [entries, settings]);

  const [view, setView] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [dir, setDir] = useState(0);
  const [challengeFilter, setChallengeFilter] = useState<string>(() => primaryChallenge(settings)?.id ?? "all");
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [presetDate, setPresetDate] = useState<string | null>(null);

  // Follow the primary challenge when it changes — no page reload.
  const primaryId = primaryChallenge(settings)?.id ?? null;
  useEffect(() => {
    setChallengeFilter(primaryId ?? "all");
  }, [primaryId]);

  const filtered = useMemo(
    () => (challengeFilter === "all" ? entries : entries.filter((e) => e.challengeId === challengeFilter)),
    [entries, challengeFilter],
  );

  const byDay = useMemo(() => groupByDay(filtered), [filtered]);
  const cells = useMemo(() => monthGrid(view.year, view.month), [view]);

  const monthEntries = useMemo(
    () =>
      filtered.filter((e) => {
        const d = parseDateKey(e.date);
        return d.getFullYear() === view.year && d.getMonth() === view.month;
      }),
    [filtered, view],
  );
  const monthPnl = monthEntries.reduce((s, e) => s + e.pnl, 0);
  const unreviewedCount = useMemo(
    () => filtered.filter((e) => e.reviewStatus === "not_reviewed" || e.reviewStatus === "incomplete").length,
    [filtered],
  );

  const noTradeDays = useMemo(() => new Set(dayLogs.map((d) => d.date)), [dayLogs]);

  const navigate = (delta: number) => {
    setDir(delta);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToday = () => {
    const n = new Date();
    setDir(n.getMonth() - view.month);
    setView({ year: n.getFullYear(), month: n.getMonth() });
  };

  const selectedEntries = (selectedDay ? filtered.filter((e) => e.date === selectedDay) : []).sort(
    (a, b) => (a.entryTime ?? "99:99").localeCompare(b.entryTime ?? "99:99"),
  );
  const selectedDayViolations = selectedDay ? violations.filter((v) => v.date === selectedDay) : [];

  if (entries.length === 0) {
    return (
      <div className="space-y-6">
        <CalendarHeader view={view} dir={dir} navigate={navigate} goToday={goToday} challengeFilter={challengeFilter} setChallengeFilter={setChallengeFilter} challenges={challenges} />
        <EmptyState
          icon={<CalendarIcon className="h-7 w-7" />}
          title="Your history starts here"
          body="Log or import your first trade and every session lands on this calendar — P&L, review status, challenge context."
          action={
            <Button variant="gold" onClick={() => setPresetDate(todayKey())}>
              <PlusIcon className="h-4 w-4" />
              Log first trade
            </Button>
          }
        />
        {presetDate && (
          <TradeEntryRedirect date={presetDate} onDone={() => setPresetDate(null)} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <CalendarHeader view={view} dir={dir} navigate={navigate} goToday={goToday} challengeFilter={challengeFilter} setChallengeFilter={setChallengeFilter} challenges={challenges} />

      {unreviewedCount > 0 && (
        <p className="flex items-center gap-2 rounded-control border border-gold/30 bg-gold/[0.06] px-4 py-2.5 text-[13px] text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          {unreviewedCount} {unreviewedCount === 1 ? "trade" : "trades"} awaiting review — open a day and select a trade.
        </p>
      )}

      {/* Calendar grid */}
      <div className="panel overflow-hidden p-3 sm:p-5">
        <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-faint sm:text-[11px]">
              <span className="hidden sm:inline">{w}</span>
              <span className="sm:hidden">{w[0]}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view.year}-${view.month}`}
            initial={{ opacity: 0, x: dir * 24 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -24 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-7 gap-1.5 sm:gap-2"
          >
            {cells.map((cell, i) => {
              if (!cell.key) return <div key={`pad-${i}`} aria-hidden />;
              const day = byDay.get(cell.key);
              const pnl = day?.pnl ?? null;
              const trades = day?.trades ?? 0;
              const isToday = cell.key === todayKey();
              const dayEntries = filtered.filter((e) => e.date === cell.key);
              const allReviewed = dayEntries.length > 0 && dayEntries.every((e) => e.reviewStatus === "reviewed");
              const anyUnreviewed = dayEntries.some((e) => e.reviewStatus !== "reviewed" && e.reviewStatus !== "not_reviewed");

              return (
                <motion.button
                  key={cell.key}
                  onClick={() => setSelectedDay(cell.key)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.006, 0.2) }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  aria-label={`${formatDateFull(cell.key)}${pnl !== null ? `, ${formatSignedMoney(pnl, settings.currency)}` : ", no trades"}`}
                  className={cn(
                    "group relative flex min-h-[64px] flex-col justify-between overflow-hidden rounded-control border bg-surface p-1.5 text-left transition-colors sm:h-[92px] sm:p-2",
                    isToday ? "border-gold/60 ring-1 ring-gold/40" : "border-line hover:border-line-strong",
                  )}
                >
                  {/* date + review dot */}
                  <span className="flex items-center justify-between">
                    <span className={cn("text-[11px] font-semibold tabular", isToday ? "text-gold" : "text-ink")}>
                      {cell.day}
                    </span>
                    {dayEntries.length > 0 && (
                      <span
                        className={cn("h-1.5 w-1.5 rounded-full", allReviewed ? "bg-profit" : anyUnreviewed ? "bg-gold" : "bg-line-strong")}
                        aria-label={allReviewed ? "All reviewed" : anyUnreviewed ? "Review pending" : undefined}
                      />
                    )}
                    {!isToday && dayEntries.length === 0 && noTradeDays.has(cell.key) && (
                      <span className="h-1.5 w-1.5 rounded-full border border-gold" aria-label="No-trade day" />
                    )}
                  </span>

                  {/* trade count */}
                  {trades > 0 && (
                    <span className="text-[9px] font-medium uppercase tracking-wide text-faint">
                      {trades} {trades === 1 ? "trade" : "trades"}
                    </span>
                  )}

                  {/* P&L badge — small, restrained, not a colored cell */}
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

        {/* Legend + month summary */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[11px] text-faint">
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-profit" /> All reviewed</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-gold" /> Review pending</span>
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full border border-gold" /> No-trade day</span>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted">
              {monthEntries.length} {monthEntries.length === 1 ? "session" : "sessions"}
            </span>
            <span className={cn("num font-semibold", monthPnl > 0 ? "text-profit" : monthPnl < 0 ? "text-loss" : "text-muted")}>
              {formatSignedMoney(monthPnl, settings.currency)}
            </span>
          </p>
        </div>
      </div>

      {/* Day modal — trades for the selected date */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        size="md"
        title={selectedDay ? formatDateFull(selectedDay) : ""}
        description={
          selectedEntries.length > 0
            ? `${selectedEntries.length} ${selectedEntries.length === 1 ? "trade" : "trades"} · ${formatSignedMoney(selectedEntries.reduce((s, e) => s + e.pnl, 0), settings.currency)}`
            : "No trades logged."
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
                  <span className="truncate text-sm font-medium text-ink">
                    {e.instrument !== "—" ? e.instrument : e.setup || "Session"}
                  </span>
                  {e.direction && (
                    <span className={cn("font-mono text-[10px] font-bold uppercase", e.direction === "long" ? "text-profit" : "text-loss")}>
                      {e.direction}
                    </span>
                  )}
                </span>
                <span className="mt-1 flex items-center gap-2">
                  <span className={cn("h-1.5 w-1.5 rounded-full", REVIEW_DOT[e.reviewStatus ?? "not_reviewed"])} />
                  <span className="text-[11px] text-faint">{REVIEW_LABEL[e.reviewStatus ?? "not_reviewed"]}</span>
                  {e.setup && <span className="truncate text-[11px] text-faint">{e.setup}</span>}
                </span>
              </span>
              <span className={cn("num shrink-0 text-sm font-semibold", e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted")}>
                {formatSignedMoney(e.pnl, settings.currency)}
              </span>
            </button>
          ))}

          {/* Rule violations that day */}
          {selectedDayViolations.length > 0 && (
            <div className="rounded-xl border border-loss/25 bg-loss/[0.05] px-3.5 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-loss">
                {selectedDayViolations.length} rule {selectedDayViolations.length === 1 ? "violation" : "violations"}
              </p>
              <ul className="mt-1.5 space-y-1">
                {selectedDayViolations.map((v) => (
                  <li key={v.id} className="text-[12px] leading-relaxed text-muted">
                    <span className="font-medium text-loss">{v.ruleLabel}:</span> {v.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {selectedEntries.length === 0 && (
            <div className="rounded-xl border border-dashed border-line-strong px-4 py-4 text-center">
              {noTradeDays.has(selectedDay!) ? (
                <>
                  <p className="flex items-center justify-center gap-2 text-sm font-medium text-gold">
                    <CheckIcon className="h-4 w-4" />
                    No-trade day recorded
                  </p>
                  {dayLogs.find((d) => d.date === selectedDay)?.reason && (
                    <p className="mt-1 text-xs text-muted">“{dayLogs.find((d) => d.date === selectedDay)?.reason}”</p>
                  )}
                  <button
                    onClick={() => void useApp.getState().removeNoTradeDay(selectedDay!)}
                    className="mt-2 text-xs font-medium text-faint underline-offset-2 transition-colors hover:text-loss hover:underline"
                  >
                    Remove record
                  </button>
                </>
              ) : (
                <>
                  <p className="text-sm text-muted">No trades logged.</p>
                  <button
                    onClick={() => {
                      void useApp.getState().logNoTradeDay(selectedDay!);
                      toast.success("No-trade day recorded", "+15 XP — a flat day with intent is still discipline.");
                    }}
                    className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-gold/40 bg-gold/[0.07] px-3 py-1.5 text-xs font-semibold text-gold transition-colors hover:bg-gold/[0.12]"
                  >
                    <CheckIcon className="h-3.5 w-3.5" />
                    Mark as no-trade day
                  </button>
                </>
              )}
            </div>
          )}

          <button
            onClick={() => {
              setPresetDate(selectedDay);
              setSelectedDay(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm font-medium text-muted transition-colors hover:border-gold/50 hover:text-gold"
          >
            <PlusIcon className="h-4 w-4" />
            Add trade for this day
          </button>
        </div>
      </Modal>

      {presetDate && <TradeEntryRedirect date={presetDate} onDone={() => setPresetDate(null)} />}
    </div>
  );
}

/* ------------------------------- pieces -------------------------------- */

function CalendarHeader({
  view,
  dir,
  navigate,
  goToday,
  challengeFilter,
  setChallengeFilter,
  challenges,
}: {
  view: { year: number; month: number };
  dir: number;
  navigate: (delta: number) => void;
  goToday: () => void;
  challengeFilter: string;
  setChallengeFilter: (v: string) => void;
  challenges: Challenge[];
}) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl sm:font-semibold">Calendar</h1>
        <p className="mt-1 text-sm text-muted">Your trading history, one day at a time.</p>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {challenges.length > 0 && (
          <select
            aria-label="Filter by challenge"
            value={challengeFilter}
            onChange={(e) => setChallengeFilter(e.target.value)}
            className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink transition-colors hover:border-line-strong focus:border-gold/60 focus:outline-none"
          >
            <option value="all">All challenges</option>
            {challenges.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        )}
        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="Previous month"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-raised text-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={`${view.year}-${view.month}`}
              initial={{ opacity: 0, y: dir >= 0 ? 8 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: dir >= 0 ? -8 : 8 }}
              transition={{ duration: 0.22 }}
              className="min-w-[150px] text-center font-display text-lg font-semibold tracking-tight text-ink"
              aria-live="polite"
            >
              {monthLabel(view.year, view.month)}
            </motion.h2>
          </AnimatePresence>
          <button
            onClick={() => navigate(1)}
            aria-label="Next month"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-raised text-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <Button variant="subtle" size="sm" onClick={goToday}>Today</Button>
        </div>
      </div>
    </header>
  );
}

/** Opens the entry composer for a preset date (used by empty state + day modal). */
function TradeEntryRedirect({ date, onDone }: { date: string; onDone: () => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) onDone();
  }, [open, onDone]);
  return <EntryFormModal open={open} onClose={() => setOpen(false)} presetDate={date} />;
}

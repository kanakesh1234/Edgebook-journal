"use client";

/**
 * TodayPanel — Apple HIG "Set Once, Then Quiet" Live Activity Design:
 *   - Before today's loss limit (or no-setup rest day) is set: shows a focused, minimal
 *     card to lock in today's daily loss limit (`DailyLimit`).
 *   - Once set (`locked || isNoTradeLogged || recent.length > 0`): collapses automatically
 *     into a sleek, single-line Apple Live Activity bar so it never hogs screen space.
 *   - Tap anywhere on the bar (or "Details") to smoothly unfold today's horizon & sessions on demand.
 */
import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import type { CurrencyCode, JournalEntry } from "@/lib/types";
import { formatDateMedium, formatMoney, formatSignedMoney, todayKey, weekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import { GlassSheen, glassPill } from "@/components/dashboard/daily-focus-control";
import { ChevronRightIcon, LockIcon } from "@/components/ui/icons";
import { EASE } from "@/components/landing/reveal";
import { DailyLimit } from "./daily-limit";
import { RISK_COPY, type DayRisk } from "@/lib/risk";
import { toast } from "@/components/ui/toast";

export interface RiskPosture {
  label: string;
  tone: "profit" | "gold" | "loss";
}

const TONE = {
  profit: { dot: "bg-profit", text: "text-profit", bar: "bg-profit", badge: "bg-profit/12 text-profit" },
  gold: { dot: "bg-gold", text: "text-gold", bar: "bg-gold-strong", badge: "bg-gold/15 text-gold" },
  loss: { dot: "bg-loss", text: "text-loss", bar: "bg-loss", badge: "bg-loss/12 text-loss" },
} as const;

export function TodayPanel({
  risk,
  drawdownUsed,
  drawdown,
  drawdownLimit,
  currency,
  brokenToday,
  brokenWeek,
  intention,
  recent,
  dayRisk,
  onPlanTrade,
  className,
}: {
  dayRisk?: DayRisk | null;
  risk: RiskPosture;
  drawdownUsed: number;
  drawdown: number;
  drawdownLimit: number;
  currency: CurrencyCode;
  brokenToday: number;
  brokenWeek: number;
  intention?: { rule: string; outcome?: string | null } | null;
  recent: JournalEntry[];
  onPlanTrade?: () => void;
  className?: string;
}) {
  const today = todayKey();
  const dayLogs = useApp((s) => s.dayLogs);
  const locked = useApp((s) => !!s.settings.dayLimits?.[today]);
  const isNoTradeLogged = recent.length === 0 && dayLogs.some((d) => d.date === today);

  // Once today's limit or rest-day is set, collapse into a quiet 1-line bar by default.
  const isConfigured = (locked && !!dayRisk) || isNoTradeLogged || recent.length > 0;
  const [expanded, setExpanded] = useState(false);

  const t = TONE[risk.tone];
  const ddRatio = Math.min(1, Math.max(0, drawdownUsed));
  const ddRoom = drawdownLimit > 0 ? Math.max(0, drawdownLimit - drawdown) : null;

  const todayNet = recent.reduce((sum, e) => sum + e.pnl, 0);
  const todayWins = recent.filter((e) => e.pnl > 0).length;
  const todayLosses = recent.filter((e) => e.pnl < 0).length;

  const dayLimitRatio = dayRisk && dayRisk.limit > 0 ? Math.min(1, Math.max(0, dayRisk.ratio)) : 0;
  const dayLimitRoom = dayRisk ? Math.max(0, dayRisk.limit - dayRisk.used) : null;
  const dayLimitTone: "profit" | "gold" | "loss" =
    !dayRisk ? "profit" : dayRisk.ratio >= 1 ? "loss" : dayRisk.ratio >= 0.75 ? "gold" : "profit";

  const toggleNoTradeDay = async () => {
    try {
      if (isNoTradeLogged) {
        await useApp.getState().removeNoTradeDay(today);
        toast.info("No-setup mark cleared", "Today is open for trading.");
      } else {
        await useApp.getState().logNoTradeDay(today, "Sat on hands — no A+ setup");
        toast.success("No-setup day logged", "Discipline recorded for today.");
        setExpanded(false);
      }
    } catch {
      toast.error("Could not update day log");
    }
  };

  /* ------------------------------------------------------------------------ */
  /*  STATE A: Not yet set for today → Focused morning setup card             */
  /* ------------------------------------------------------------------------ */
  if (!isConfigured) {
    return (
      <motion.aside
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: EASE }}
        aria-label="Set up today"
        className={cn("panel overflow-hidden p-5 sm:p-6", className)}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 pb-4 border-b border-line-soft">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full", t.dot)} />
            <p className="text-[12px] font-semibold uppercase tracking-[0.1em] text-muted">
              Today · {weekdayShort(today)}, {formatDateMedium(today)}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void toggleNoTradeDay()}
            className="rounded-full border border-line bg-raised px-3 py-1 text-[12px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
          >
            No setup today
          </button>
        </div>

        <div className="pt-4">
          <DailyLimit risk={dayRisk ?? null} currency={currency} />
        </div>
      </motion.aside>
    );
  }

  /* ------------------------------------------------------------------------ */
  /*  STATE B: Set & Done → Sleek Apple Live Activity Bar (Expandable)        */
  /* ------------------------------------------------------------------------ */
  return (
    <motion.aside
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.38, ease: EASE }}
      aria-label="Today status"
      className={cn("panel overflow-hidden", className)}
    >
      {/* Compact 1-Line Live Activity Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
        <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-1.5">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold",
              t.badge,
            )}
          >
            <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />
            Today
          </span>

          {recent.length > 0 ? (
            <div className="flex items-baseline gap-2">
              <span
                className={cn(
                  "kpi text-[18px] tabular-nums",
                  todayNet > 0 ? "text-profit" : todayNet < 0 ? "text-loss" : "text-ink",
                )}
              >
                {formatSignedMoney(todayNet, currency)}
              </span>
              <span className="text-[12.5px] text-muted">
                {recent.length} {recent.length === 1 ? "trade" : "trades"} ({todayWins}W · {todayLosses}L)
              </span>
            </div>
          ) : isNoTradeLogged ? (
            <span className="text-[13px] font-medium text-gold">
              No-setup day logged · Sitting on hands
            </span>
          ) : null}

          {locked && dayRisk && (
            <span className="inline-flex items-center gap-1.5 text-[12.5px] text-muted">
              <LockIcon className="h-3 w-3 text-faint" />
              <span>
                Limit <strong className="num font-semibold text-ink">{formatMoney(dayRisk.limit, currency)}</strong>
              </span>
              {dayLimitRoom != null && (
                <span className="text-faint">
                  ({formatMoney(dayLimitRoom, currency)} room · {RISK_COPY[dayRisk.status]})
                </span>
              )}
            </span>
          )}

          {intention && (
            <span className="hidden truncate text-[12.5px] text-muted lg:inline">
              · Rule: <em className="font-normal text-ink">&ldquo;{intention.rule}&rdquo;</em>
            </span>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {recent.length > 0 && (
            <div className="hidden items-center gap-1.5 sm:flex">
              {recent.slice(0, 2).map((e) => (
                <Link
                  key={e.id}
                  href={`/review/${e.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 text-[11.5px] font-medium text-ink transition-colors hover:border-gold/50"
                >
                  <span>{e.instrument || "Trade"}</span>
                  <span className={cn("num font-mono font-semibold", e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted")}>
                    {formatSignedMoney(e.pnl, currency)}
                  </span>
                </Link>
              ))}
            </div>
          )}

          <button
            type="button"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-line bg-raised px-3 py-1 text-[12px] font-medium text-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
          >
            <span>{expanded ? "Hide" : "Details"}</span>
            <ChevronRightIcon
              className={cn("h-3.5 w-3.5 transition-transform duration-200", expanded ? "-rotate-90" : "rotate-90")}
            />
          </button>
        </div>
      </div>

      {/* Whisper-thin progress hairline when daily limit is locked */}
      {locked && dayRisk && dayRisk.used > 0 && !expanded && (
        <div className="h-[2px] w-full bg-line-soft" aria-hidden>
          <div
            className={cn(
              "h-full transition-all duration-500",
              dayLimitTone === "loss" ? "bg-loss" : dayLimitTone === "gold" ? "bg-gold-strong" : "bg-profit",
            )}
            style={{ width: `${Math.max(4, dayLimitRatio * 100)}%` }}
          />
        </div>
      )}

      {/* On-Demand Expandable Drawer */}
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="today-details"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: EASE }}
            className="overflow-hidden border-t border-line-soft"
          >
            <div className="grid gap-4 p-4 sm:grid-cols-4 sm:p-5">
              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Daily room</p>
                <p className={cn("kpi mt-1 text-[18px]", dayLimitRoom === 0 && dayRisk ? "text-loss" : "text-ink")}>
                  {dayLimitRoom != null ? formatMoney(dayLimitRoom, currency) : "Not set"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {dayRisk ? `of ${formatMoney(dayRisk.limit, currency)} limit` : "Set once per day"}
                </p>
              </div>

              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Drawdown room</p>
                <p className={cn("kpi mt-1 text-[18px]", ddRoom != null && ddRoom <= 0 ? "text-loss" : "text-ink")}>
                  {ddRoom != null ? formatMoney(ddRoom, currency) : "—"}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {drawdownLimit > 0 ? `${Math.round(ddRatio * 100)}% used` : "No max DD set"}
                </p>
              </div>

              <div>
                <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Rules today</p>
                <p className={cn("kpi mt-1 text-[18px]", brokenToday > 0 ? "text-loss" : "text-profit")}>
                  {brokenToday === 0 ? "Clean" : `${brokenToday} broken`}
                </p>
                <p className="mt-0.5 text-[11.5px] text-muted">
                  {brokenWeek === 0 ? "0 broken in 7d" : `${brokenWeek} in past 7d`}
                </p>
              </div>

              <div className="flex flex-col justify-between">
                <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Session</p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {onPlanTrade && (
                    <button
                      type="button"
                      onClick={onPlanTrade}
                      className="rounded-full bg-gold-strong px-3.5 py-1.5 text-[12px] font-semibold text-on-gold transition-colors hover:bg-gold-strong-hover active:scale-95"
                    >
                      Plan trade
                    </button>
                  )}
                  {recent.length === 0 && (
                    <button
                      type="button"
                      onClick={() => void toggleNoTradeDay()}
                      className={cn(glassPill, "h-8 px-3 text-[12px]", isNoTradeLogged ? "border-gold/50 text-gold-deep dark:text-gold" : "text-muted hover:text-ink")}
                    >
                      <GlassSheen active={isNoTradeLogged} />
                      <span className="relative z-10">{isNoTradeLogged ? "Clear no-setup" : "No setup today"}</span>
                    </button>
                  )}
                </div>
              </div>
            </div>

            {!locked && (
              <div className="border-t border-line-soft px-4 py-4 sm:px-5">
                <DailyLimit risk={dayRisk ?? null} currency={currency} />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.aside>
  );
}

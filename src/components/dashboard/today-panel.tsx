"use client";

/**
 * TodayPanel — Redesigned in Apple HIG using the Equity Curve (`Performance`) as the reference benchmark:
 *   1. Editorial top header: Eyebrow (`TODAY · <DATE>`) + live posture pill, followed by the large
 *      tabular `Money` figure (Today's Net P&L with quiet cents) and a concise status line.
 *   2. Visual Horizon Section: Sleek interactive Daily Loss Allowance & Drawdown Horizon bars
 *      (or inline DailyLimit lock setter when not yet locked for today).
 *   3. Hairline 2×2 Steering Grid (`grid grid-cols-2 gap-px border-t border-line bg-line`, matching `Performance`):
 *      - `Daily Limit`
 *      - `Drawdown Room`
 *      - `Rule Discipline`
 *      - `Session Status`
 *   4. Today's Trades / Quick Ritual Footer: Clean trade rows or 1-tap Plan / No-Setup actions.
 */
import Link from "next/link";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import type { CurrencyCode, JournalEntry } from "@/lib/types";
import { formatDateMedium, formatMoney, formatSignedMoney, todayKey, weekdayShort } from "@/lib/format";
import { cn } from "@/lib/utils";
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
  /** Today's loss limit (set once on Home) against today's real result; null until the limit is set. */
  dayRisk?: DayRisk | null;
  risk: RiskPosture;
  /** 0–1 share of the drawdown limit consumed. */
  drawdownUsed: number;
  /** Current drawdown from peak, in account currency (positive number). */
  drawdown: number;
  /** The configured max drawdown; 0 when none is set. */
  drawdownLimit: number;
  currency: CurrencyCode;
  brokenToday: number;
  brokenWeek: number;
  intention?: { rule: string; outcome?: string | null } | null;
  /** Trades taken today only. */
  recent: JournalEntry[];
  onPlanTrade?: () => void;
  className?: string;
}) {
  const today = todayKey();
  const dayLogs = useApp((s) => s.dayLogs);
  const locked = useApp((s) => !!s.settings.dayLimits?.[today]);
  const isNoTradeLogged = recent.length === 0 && dayLogs.some((d) => d.date === today);

  const t = TONE[risk.tone];
  const ddRatio = Math.min(1, Math.max(0, drawdownUsed));
  const ddRoom = drawdownLimit > 0 ? Math.max(0, drawdownLimit - drawdown) : null;

  const todayNet = recent.reduce((sum, e) => sum + e.pnl, 0);
  const todayWins = recent.filter((e) => e.pnl > 0).length;
  const todayLosses = recent.filter((e) => e.pnl < 0).length;
  const pnlTone: "profit" | "loss" | "neutral" = todayNet > 0 ? "profit" : todayNet < 0 ? "loss" : "neutral";

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
      }
    } catch {
      toast.error("Could not update day log");
    }
  };

  return (
    <motion.aside
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, delay: 0.06, ease: EASE }}
      aria-label="Today"
      className={cn("@container", className)}
    >
      <div className="panel overflow-hidden">
        {/* Layer 1: Editorial Top Header (Matches Performance / Equity Curve) */}
        <div className="px-5 pt-5 sm:px-6 sm:pt-6">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
              Today · {weekdayShort(today)}, {formatDateMedium(today)}
            </p>
            <span
              role="status"
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                t.badge,
              )}
            >
              <span className={cn("h-1.5 w-1.5 rounded-full", t.dot)} aria-hidden />
              {risk.label}
            </span>
          </div>

          <TodayMoneyHero
            value={todayNet}
            currency={currency}
            tone={pnlTone}
            className="mt-2.5 text-[36px] sm:text-[42px]"
          />

          <p className="mt-2 text-[13px] leading-snug text-muted">
            {recent.length > 0 ? (
              <>
                <span className="font-medium text-ink">
                  {recent.length} {recent.length === 1 ? "trade" : "trades"}
                </span>{" "}
                ({todayWins}W · {todayLosses}L)
                {dayRisk && (
                  <span className="ml-1.5">
                    · {RISK_COPY[dayRisk.status]}
                  </span>
                )}
              </>
            ) : isNoTradeLogged ? (
              <span className="font-medium text-gold">No-setup day logged · Sat on hands</span>
            ) : locked && dayRisk ? (
              <>
                <span>No trades yet</span>
                <span className="ml-1.5 text-faint">
                  · {formatMoney(dayRisk.limit, currency)} daily limit locked
                </span>
              </>
            ) : (
              <span>No trades taken today · Set your daily limit below</span>
            )}
          </p>
        </div>

        {/* Layer 2: Interactive Risk Horizon or Daily Limit Setter */}
        <div className="px-5 pb-5 pt-4 sm:px-6">
          {!locked || !dayRisk ? (
            <DailyLimit risk={dayRisk ?? null} currency={currency} />
          ) : (
            <div className="space-y-3.5 rounded-[18px] border border-line-soft bg-ink/[0.025] p-3.5">
              {/* Horizon 1: Today's Loss Limit */}
              <div>
                <div className="flex items-baseline justify-between gap-2 text-[12px]">
                  <span className="inline-flex items-center gap-1.5 font-medium text-muted">
                    <LockIcon className="h-3 w-3 text-faint" />
                    Today&apos;s loss limit
                  </span>
                  <span className="num font-semibold text-ink">
                    {formatMoney(dayRisk.used, currency)}
                    <span className="font-normal text-faint"> / {formatMoney(dayRisk.limit, currency)}</span>
                  </span>
                </div>
                <div className="mt-1.5 h-[4px] overflow-hidden rounded-full bg-line-soft" aria-hidden>
                  <motion.div
                    className={cn(
                      "h-full rounded-full",
                      dayLimitTone === "loss" ? "bg-loss" : dayLimitTone === "gold" ? "bg-gold-strong" : "bg-profit",
                    )}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.max(dayRisk.used > 0 ? 6 : 0, dayLimitRatio * 100)}%` }}
                    transition={{ duration: 0.75, ease: EASE }}
                  />
                </div>
              </div>

              {/* Horizon 2: Account / Challenge Drawdown */}
              {drawdownLimit > 0 && (
                <div>
                  <div className="flex items-baseline justify-between gap-2 text-[12px]">
                    <span className="font-medium text-muted">Drawdown used</span>
                    <span className="num font-semibold text-ink">
                      {formatMoney(drawdown, currency)}
                      <span className="font-normal text-faint"> / {formatMoney(drawdownLimit, currency)}</span>
                    </span>
                  </div>
                  <div className="mt-1.5 h-[4px] overflow-hidden rounded-full bg-line-soft" aria-hidden>
                    <motion.div
                      className={cn("h-full rounded-full", t.bar)}
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max(drawdown > 0 ? 4 : 0, ddRatio * 100)}%` }}
                      transition={{ duration: 0.75, delay: 0.1, ease: EASE }}
                    />
                  </div>
                </div>
              )}
            </div>
          )}

          {intention && (
            <figure className="mt-4 rounded-[16px] border border-gold/25 bg-gold/[0.06] px-3.5 py-2.5">
              <figcaption className="text-[10px] font-semibold uppercase tracking-[0.1em] text-gold">
                Today&apos;s Focus Rule
              </figcaption>
              <blockquote className="mt-0.5 text-[13px] font-medium leading-snug text-ink">
                &ldquo;{intention.rule}&rdquo;
              </blockquote>
            </figure>
          )}
        </div>

        {/* Layer 3: Hairline 2×2 Steering Strip (Benchmark: Equity Curve bottom strip) */}
        <dl className="grid grid-cols-2 gap-px border-t border-line bg-line">
          <div className="bg-surface px-4 py-3.5 sm:px-5">
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Daily room</dt>
            <dd className="mt-1.5">
              <p className={cn("kpi text-[20px] leading-none", dayLimitRoom === 0 && dayRisk ? "text-loss" : "text-ink")}>
                {dayLimitRoom != null ? formatMoney(dayLimitRoom, currency) : "Not set"}
              </p>
              <p className="mt-1 text-[11.5px] text-muted">
                {dayRisk ? `of ${formatMoney(dayRisk.limit, currency)} limit` : "Set once per day"}
              </p>
            </dd>
          </div>

          <div className="bg-surface px-4 py-3.5 sm:px-5">
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Drawdown room</dt>
            <dd className="mt-1.5">
              <p className={cn("kpi text-[20px] leading-none", ddRoom != null && ddRoom <= 0 ? "text-loss" : "text-ink")}>
                {ddRoom != null ? formatMoney(ddRoom, currency) : "—"}
              </p>
              <p className="mt-1 text-[11.5px] text-muted">
                {drawdownLimit > 0 ? `${Math.round(ddRatio * 100)}% of limit used` : "No max DD set"}
              </p>
            </dd>
          </div>

          <div className="bg-surface px-4 py-3.5 sm:px-5">
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Rules today</dt>
            <dd className="mt-1.5">
              <p className={cn("kpi text-[20px] leading-none", brokenToday > 0 ? "text-loss" : "text-profit")}>
                {brokenToday === 0 ? "Clean" : `${brokenToday} broken`}
              </p>
              <p className="mt-1 text-[11.5px] text-muted">
                {brokenWeek === 0 ? "0 broken in 7d" : `${brokenWeek} in past 7 days`}
              </p>
            </dd>
          </div>

          <div className="bg-surface px-4 py-3.5 sm:px-5">
            <dt className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">Today&apos;s log</dt>
            <dd className="mt-1.5">
              <p className="kpi text-[20px] leading-none text-ink">
                {recent.length > 0 ? `${recent.length}` : isNoTradeLogged ? "Rest" : "0"}
              </p>
              <p className="mt-1 text-[11.5px] text-muted">
                {recent.length > 0
                  ? `${recent.filter((e) => e.reviewStatus === "reviewed").length}/${recent.length} reviewed`
                  : isNoTradeLogged
                    ? "No-setup logged"
                    : "No trades yet"}
              </p>
            </dd>
          </div>
        </dl>

        {/* Layer 4: Today's Sessions & Quick Actions */}
        <section className="border-t border-line bg-surface px-5 py-4 sm:px-6" aria-label="Today's trades">
          <div className="flex items-center justify-between">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.1em] text-faint">
              {recent.length > 0 ? `Today's sessions (${recent.length})` : "Session actions"}
            </p>
            <Link
              href="/journal"
              className="inline-flex items-center text-[12px] font-semibold text-gold transition-opacity hover:opacity-80"
            >
              Journal →
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {onPlanTrade && (
                <button
                  type="button"
                  onClick={onPlanTrade}
                  className="inline-flex h-9 flex-1 items-center justify-center rounded-full bg-ink px-4 text-[12.5px] font-semibold text-canvas transition-all hover:opacity-90 active:scale-95"
                >
                  Plan a trade
                </button>
              )}
              <button
                type="button"
                onClick={() => void toggleNoTradeDay()}
                className={cn(
                  "inline-flex h-9 items-center justify-center rounded-full border px-3.5 text-[12px] font-medium transition-all active:scale-95",
                  isNoTradeLogged
                    ? "border-gold/50 bg-gold/12 text-gold"
                    : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
                )}
              >
                {isNoTradeLogged ? "No-setup ✓" : "No setup today"}
              </button>
            </div>
          ) : (
            <ul className="mt-2 divide-y divide-line-soft">
              {recent.map((e) => (
                <li key={e.id}>
                  <Link
                    href={`/review/${e.id}`}
                    className="group -mx-2 flex min-h-[48px] items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-ink/[0.035] active:bg-ink/[0.06]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[13.5px] font-semibold text-ink">
                          {e.instrument || "Trade"}
                        </span>
                        {e.direction && (
                          <span
                            className={cn(
                              "rounded-full px-1.5 py-0.2 font-mono text-[9.5px] font-bold uppercase",
                              e.direction === "long" ? "bg-profit/12 text-profit" : "bg-loss/12 text-loss",
                            )}
                          >
                            {e.direction}
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-[11.5px] text-faint">
                        {[e.entryTime, e.setup].filter(Boolean).join(" · ") || "Tap to review"}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "num shrink-0 font-mono text-[13.5px] font-semibold",
                        e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted",
                      )}
                    >
                      {formatSignedMoney(e.pnl, currency)}
                    </span>
                    <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </motion.aside>
  );
}

function TodayMoneyHero({
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

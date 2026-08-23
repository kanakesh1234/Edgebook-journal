"use client";

import { motion, useReducedMotion } from "motion/react";
import type { JourneyState } from "@/lib/journey";
import type { CurrencyCode, JournalSettings, JournalStats } from "@/lib/types";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { FlagIcon, RouteIcon, ShieldIcon, TrendingUpIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";

/**
 * JourneyTrack — the persistent progress layer of the trading system.
 * A live milestone rail from starting equity to target that updates
 * automatically as trades are logged. The roadmap's inline home.
 */
export function JourneyTrack({
  settings,
  stats,
  journey,
}: {
  settings: JournalSettings;
  stats: JournalStats;
  journey: JourneyState;
}) {
  const reduce = useReducedMotion();
  const currency: CurrencyCode = settings.currency;
  const pct = Math.round(journey.progress * 100);

  const status = journey.reachedTarget
    ? { label: "Target reached", icon: <FlagIcon className="h-3.5 w-3.5" />, tone: "text-gold" }
    : journey.behindStart
      ? { label: "Rebuilding", icon: <ShieldIcon className="h-3.5 w-3.5" />, tone: "text-loss" }
      : { label: "On the road", icon: <RouteIcon className="h-3.5 w-3.5" />, tone: "text-profit" };

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.22, ease: EASE }}
      className="panel p-5 sm:p-6"
      aria-label="Trading journey progress"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Journey</h2>
          <p className="text-xs text-muted">
            {formatMoney(settings.startingEquity, currency)} start → {formatMoney(settings.targetEquity, currency)} target
          </p>
        </div>
        <p className="flex items-center gap-3">
          <span className={cn("flex items-center gap-1.5 text-xs font-medium", status.tone)}>
            {status.icon}
            {status.label}
          </span>
          <span className="kpi text-2xl text-gold">
            {pct}
            <span className="text-sm text-faint">%</span>
          </span>
        </p>
      </div>

      {/* ------- the track ------- */}
      <div className="relative mx-3 mt-9 mb-2 h-16" role="img"
        aria-label={`${pct}% of the way from ${formatMoney(settings.startingEquity, currency)} to ${formatMoney(settings.targetEquity, currency)}`}
      >
        {/* base line */}
        <div className="absolute inset-x-0 top-[38%] h-1.5 rounded-full bg-line-soft" />
        {/* travelled fill */}
        <motion.div
          className="absolute left-0 top-[38%] h-1.5 rounded-full bg-gradient-to-r from-profit-deep via-profit to-gold-strong"
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${journey.progress * 100}%` }}
          transition={{ duration: reduce ? 0 : 1.4, delay: 0.4, ease: EASE }}
        />

        {/* start marker */}
        <TrackMarker fraction={0} label="START" value={formatMoney(settings.startingEquity, currency, { compact: true })}>
          <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-muted bg-surface">
            <span className="h-1 w-1 rounded-full bg-muted" />
          </span>
        </TrackMarker>

        {/* milestones */}
        {journey.milestones.map((m) => (
          <TrackMarker
            key={m.fraction}
            fraction={m.fraction}
            label={formatMoney(m.equity, currency, { compact: true })}
            value={m.passed ? "reached" : undefined}
            passed={m.passed}
          >
            {m.passed ? (
              <span className="grid h-4 w-4 place-items-center rounded-full border-2 border-profit bg-surface text-profit">
                <svg viewBox="0 0 10 10" className="h-2 w-2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M2 5.2 4.2 7.4 8 3" />
                </svg>
              </span>
            ) : journey.next?.fraction === m.fraction ? (
              <span className="relative grid h-4 w-4 place-items-center">
                {!reduce && (
                  <motion.span
                    className="absolute inset-0 rounded-full border border-gold"
                    animate={{ scale: [1, 1.7], opacity: [0.7, 0] }}
                    transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                  />
                )}
                <span className="h-2.5 w-2.5 rounded-full border-2 border-gold bg-surface" />
              </span>
            ) : (
              <span className="h-2.5 w-2.5 rounded-full border-2 border-line-strong bg-surface" />
            )}
          </TrackMarker>
        ))}

        {/* target flag */}
        <TrackMarker
          fraction={1}
          label="TARGET"
          value={formatMoney(settings.targetEquity, currency, { compact: true })}
          align="end"
          gold
        >
          <span className={cn("grid h-4 w-4 place-items-center rounded-full border-2", journey.reachedTarget ? "border-profit bg-profit text-surface" : "border-gold-strong bg-surface text-gold-strong")}>
            <FlagIcon className="h-2.5 w-2.5" />
          </span>
        </TrackMarker>

        {/* live equity marker */}
        {stats.tradeCount > 0 && (
          <motion.div
            className="absolute top-[38%] z-10 -translate-x-1/2 -translate-y-1/2"
            initial={false}
            animate={{ left: `${journey.progress * 100}%`, top: "calc(38% + 3px)" }}
            transition={{ type: "spring", stiffness: 70, damping: 16 }}
          >
            <span className="block h-3.5 w-3.5 rounded-full border-2 border-surface bg-ink shadow-sm" />
          </motion.div>
        )}
      </div>

      {/* ------- rail ------- */}
      <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 border-t border-line pt-4 sm:grid-cols-3">
        <RailStat
          label={journey.next ? "Next milestone" : "Final milestone"}
          value={journey.next ? formatMoney(journey.next.equity, currency, { compact: true }) : formatMoney(settings.targetEquity, currency, { compact: true })}
          sub={
            journey.next
              ? `${formatSignedMoney(journey.next.equity - stats.currentEquity, currency, { compact: true })} away`
              : journey.reachedTarget
                ? "conquered"
                : `${formatMoney(Math.max(0, stats.remainingToTarget), currency, { compact: true })} to finish`
          }
        />
        <RailStat
          label="Pace to target"
          value={journey.paceDays != null ? `≈ ${journey.paceDays} days` : "—"}
          sub={journey.paceDays != null ? "at current average" : "needs green days"}
        />
        <RailStat
          label="Equity now"
          value={formatMoney(stats.currentEquity, currency)}
          sub={
            <span className={cn("num text-[11px]", stats.totalPnl >= 0 ? "text-profit" : "text-loss")}>
              {formatSignedMoney(stats.totalPnl, currency)} overall
            </span>
          }
        />
      </div>
    </motion.section>
  );
}

function TrackMarker({
  fraction,
  label,
  value,
  children,
  align = "center",
  passed,
  gold,
}: {
  fraction: number;
  label: string;
  value?: string;
  children: React.ReactNode;
  align?: "center" | "end";
  passed?: boolean;
  gold?: boolean;
}) {
  return (
    <div
      className="absolute top-[38%] -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${fraction * 100}%` }}
    >
      <div className="flex flex-col items-center gap-2">
        {children}
        <span
          className={cn(
            "absolute top-6 whitespace-nowrap font-mono text-[9px] uppercase tracking-wider",
            gold ? "text-gold" : passed ? "text-profit" : "text-faint",
            align === "end" && "translate-x-1/2 text-right",
          )}
        >
          {label}
        </span>
        {value && (
          <span
            className={cn(
              "absolute top-11 whitespace-nowrap font-mono text-[9px]",
              passed ? "text-profit/80" : "text-faint/70",
              align === "end" && "translate-x-1/2 text-right",
            )}
          >
            {value}
          </span>
        )}
      </div>
    </div>
  );
}

function RailStat({ label, value, sub }: { label: string; value: string; sub?: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{label}</p>
      <p className="kpi mt-1 text-lg text-ink">{value}</p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

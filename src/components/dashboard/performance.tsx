"use client";

/**
 * Performance — the top of Home. One editorial surface, three layers:
 *   1. the number that matters (equity) with what changed in the chosen period,
 *   2. the equity curve, which owns the space,
 *   3. a hairline strip of the four figures that actually steer the next trade.
 *
 * While you scrub the curve, the headline and the change line follow your
 * finger/cursor, so the chart needs no tooltip sitting on top of the data.
 */
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import type { CurrencyCode, JournalStats } from "@/lib/types";
import { addDays, formatMoney, formatPct, formatSignedMoney, todayKey } from "@/lib/format";
import { useCountUp } from "@/lib/hooks";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import { EquityCurve, type CurvePoint, type CurveTone } from "@/components/charts/equity-curve";
import { Segmented } from "@/components/journal/flow-ui";

type RangeId = "1w" | "1m" | "3m" | "all";
const RANGES: { id: RangeId; label: string; days: number | null; phrase: string }[] = [
  { id: "1w", label: "1W", days: 7, phrase: "past week" },
  { id: "1m", label: "1M", days: 30, phrase: "past month" },
  { id: "3m", label: "3M", days: 90, phrase: "past 3 months" },
  { id: "all", label: "All", days: null, phrase: "since start" },
];

export function Performance({
  stats,
  currency,
  startingEquity,
  targetEquity,
  maxDrawdown,
  eyebrow,
  streak,
  emptyHint,
}: {
  stats: JournalStats;
  currency: CurrencyCode;
  startingEquity: number;
  targetEquity: number;
  maxDrawdown: number;
  eyebrow: string;
  streak: number;
  /** Shown instead of a curve when there is nothing to plot yet. */
  emptyHint: string;
}) {
  const [range, setRange] = useState<RangeId>("all");
  const [scrub, setScrub] = useState<number | null>(null);
  const headline = useCountUp(stats.currentEquity, 800);

  const curve = stats.equityCurve;
  const today = todayKey();
  const firstDate = curve[0]?.date;

  // Only offer a period when the journal actually reaches back further than it.
  const available = useMemo(
    () => RANGES.filter((r) => r.days == null || (firstDate != null && firstDate < addDays(today, -r.days))),
    [firstDate, today],
  );
  const activeId: RangeId = available.some((r) => r.id === range) ? range : "all";
  const active = RANGES.find((r) => r.id === activeId)!;

  const baselineLabel = active.days == null ? "Starting equity" : "Period open";
  const emptyText = active.days == null ? emptyHint : `No trades in the ${active.phrase}.`;

  const points = useMemo<CurvePoint[]>(() => {
    if (curve.length === 0) return [];
    const asDay = (p: (typeof curve)[number]): CurvePoint => ({ date: p.date, equity: p.equity, pnl: p.pnl, kind: "day" });
    if (active.days == null) {
      return [{ date: curve[0]!.date, equity: startingEquity, pnl: 0, kind: "start" }, ...curve.map(asDay)];
    }
    const cutoff = addDays(today, -active.days);
    const first = curve.findIndex((p) => p.date >= cutoff);
    if (first === -1) return [];
    const open = first > 0 ? curve[first - 1]! : null;
    return [
      { date: open?.date ?? curve[0]!.date, equity: open?.equity ?? startingEquity, pnl: 0, kind: "start" },
      ...curve.slice(first).map(asDay),
    ];
  }, [curve, active.days, startingEquity, today]);

  const hasCurve = points.length >= 2;
  const picked = scrub != null ? points[scrub] : null;
  const base = hasCurve ? points[0]!.equity : stats.currentEquity;
  const end = picked ? picked.equity : hasCurve ? points[points.length - 1]!.equity : stats.currentEquity;
  const change = end - base;
  const pct = base !== 0 ? Math.abs(change / base) : 0;
  const tone: CurveTone = !hasCurve ? "neutral" : change > 0 ? "profit" : change < 0 ? "loss" : "neutral";
  const sign = change > 0 ? "+" : change < 0 ? "−" : "";

  // ---- the four steering figures ----
  const used = stats.drawdownBudgetUsed;
  const ddTone: "profit" | "gold" | "loss" = used >= 0.8 ? "loss" : used >= 0.5 ? "gold" : "profit";
  const cushion = stats.drawdownCushion;
  const reached = stats.remainingToTarget <= 0;

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: EASE }}
      className="panel overflow-hidden"
      aria-label="Performance"
    >
      <div className="px-5 pt-5 sm:px-8 sm:pt-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{eyebrow}</p>
            <Money value={picked ? picked.equity : headline} currency={currency} className="mt-2.5 text-[40px] sm:text-[54px]" />
            <p className="mt-2.5 min-h-[22px] text-[14px] leading-snug" aria-live="off">
              {hasCurve ? (
                <>
                  <span className={cn("num", tone === "profit" ? "text-profit" : tone === "loss" ? "text-loss" : "text-muted")}>
                    {formatSignedMoney(change, currency)}
                  </span>
                  <span className={cn("num ml-1.5 text-[13px]", tone === "profit" ? "text-profit/80" : tone === "loss" ? "text-loss/80" : "text-muted")}>
                    {sign}
                    {formatPct(pct)}
                  </span>
                  <span className="ml-2 text-muted">{picked ? (active.days == null ? "since start" : "since period open") : active.phrase}</span>
                </>
              ) : (
                <span className="text-muted">{emptyText}</span>
              )}
            </p>
          </div>

          {available.length > 1 && (
            <div className="self-start sm:shrink-0">
              <Segmented
                compact
                label="Period"
                layoutId="perf-range"
                value={activeId}
                options={available.map((r) => ({ id: r.id, label: r.label }))}
                onChange={(id) => setRange(id)}
              />
            </div>
          )}
        </div>
      </div>

      <div className="px-2 pb-3 pt-3 sm:px-5">
        <EquityCurve
          points={points}
          currency={currency}
          tone={tone}
          baselineLabel={baselineLabel}
          emptyLabel={emptyText}
          rangeKey={`${activeId}:${points.length}`}
          onScrub={setScrub}
        />
      </div>

      <dl className="grid grid-cols-2 gap-px border-t border-line bg-line lg:grid-cols-4">
        <Cell label="Win rate">
          <Value className={stats.winRate >= 0.5 ? "text-profit" : "text-ink"}>{Math.round(stats.winRate * 100)}%</Value>
          <Sub>
            {stats.winningDays}W · {stats.losingDays}L{stats.breakEvenDays > 0 ? ` · ${stats.breakEvenDays} flat` : ""}
          </Sub>
        </Cell>

        <Cell label="Average day">
          <Value className={stats.avgDayPnl > 0 ? "text-profit" : stats.avgDayPnl < 0 ? "text-loss" : "text-ink"}>
            {formatSignedMoney(stats.avgDayPnl, currency)}
          </Value>
          <Sub className={streak > 0 ? "text-profit" : streak < 0 ? "text-loss" : undefined}>
            {streak !== 0 ? `${Math.abs(streak)}-day ${streak > 0 ? "winning" : "losing"} streak` : "No active streak"}
          </Sub>
        </Cell>

        <Cell label={cushion != null ? "Drawdown room" : "Drawdown"}>
          <Value className={cushion != null && cushion <= 0 ? "text-loss" : "text-ink"}>
            {cushion != null ? formatMoney(cushion, currency) : stats.drawdown > 0 ? `−${formatMoney(stats.drawdown, currency)}` : formatMoney(0, currency)}
          </Value>
          <Sub>{maxDrawdown > 0 ? `${Math.round(used * 100)}% of limit used` : "from peak"}</Sub>
          {maxDrawdown > 0 && <Meter pct={used} tone={ddTone} />}
        </Cell>

        <Cell label="To target">
          <Value className={reached ? "text-profit" : "text-ink"}>{reached ? "Reached" : formatMoney(stats.remainingToTarget, currency)}</Value>
          <Sub>
            {Math.round(stats.targetProgress * 100)}% of the way · {formatMoney(targetEquity, currency, { compact: true })}
          </Sub>
          <Meter pct={stats.targetProgress} tone="gold" />
        </Cell>
      </dl>
    </motion.section>
  );
}

/* --------------------------------- pieces -------------------------------- */

/** Big money figure; cents sit quietly beside it instead of competing. */
function Money({ value, currency, className }: { value: number; currency: CurrencyCode; className?: string }) {
  const text = formatMoney(value, currency, { decimals: 2 });
  const dot = text.lastIndexOf(".");
  return (
    <p className={cn("kpi tabular text-ink", className)} aria-label={text}>
      <span aria-hidden>{dot === -1 ? text : text.slice(0, dot)}</span>
      {dot !== -1 && (
        <span aria-hidden className="text-[0.52em] font-medium text-faint">
          {text.slice(dot)}
        </span>
      )}
    </p>
  );
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-5 py-4 sm:px-8 sm:py-5">
      <dt className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">{label}</dt>
      <dd className="mt-2">{children}</dd>
    </div>
  );
}

function Value({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("kpi text-[22px] leading-none sm:text-[24px]", className)}>{children}</p>;
}

function Sub({ children, className }: { children: React.ReactNode; className?: string }) {
  return <p className={cn("mt-1.5 text-[12px] leading-snug text-muted", className)}>{children}</p>;
}

function Meter({ pct, tone }: { pct: number; tone: "profit" | "gold" | "loss" }) {
  const fill = tone === "gold" ? "bg-gold-strong" : tone === "loss" ? "bg-loss" : "bg-profit";
  return (
    <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-line-soft" aria-hidden>
      <motion.div
        className={cn("h-full rounded-full", fill)}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(1, Math.max(0, pct)) * 100}%` }}
        transition={{ duration: 0.9, delay: 0.3, ease: EASE }}
      />
    </div>
  );
}

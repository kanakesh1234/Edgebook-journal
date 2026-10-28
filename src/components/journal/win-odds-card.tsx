"use client";

import { useEffect, useMemo } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { JournalEntry, TradePlan } from "@/lib/types";
import { winOddsNow, type PlanDraft, type WinOdds } from "@/lib/prediction";
import { cn } from "@/lib/utils";

/**
 * Win probability — compact Apple Health / Fitness style card read mid-planning.
 *
 * Shows the animated probability ring, live checklist boost, compact factor pills,
 * and a 4-metric hairline strip without verbose paragraphs of prose.
 */
const SPRING = { type: "spring", stiffness: 140, damping: 24, mass: 0.9 } as const;
const SIZE = 72, STROKE = 7, R = (SIZE - STROKE) / 2, C = 2 * Math.PI * R;

function Count({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  useEffect(() => {
    if (reduce) {
      mv.set(value);
      return;
    }
    const c = animate(mv, value, { type: "spring", stiffness: 140, damping: 24 });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}

function Strength({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span aria-hidden className="inline-flex items-end gap-[2px]">
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={cn(
            "w-[3px] rounded-full",
            i === 1 ? "h-[5px]" : i === 2 ? "h-[8px]" : "h-[11px]",
            i <= level ? "bg-ink/55" : "bg-ink/15",
          )}
        />
      ))}
    </span>
  );
}

const CONF = { low: 1 as const, medium: 2 as const, high: 3 as const };
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
const money = (n: number | null) => (n == null ? "—" : `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const pc = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function WinOddsCard({ draft, entries, plans }: { draft: PlanDraft; entries: JournalEntry[]; plans: TradePlan[] }) {
  const odds: WinOdds = useMemo(() => winOddsNow(draft, entries, plans), [draft, entries, plans]);
  const reduce = useReducedMotion();
  const ready = odds.status === "ready";
  const win = ready ? odds.win : 0;
  const progress = ready ? win / 100 : odds.n / odds.needed;
  const ck = ready ? odds.checklist : null;

  return (
    <section
      aria-label="Win probability"
      aria-live="polite"
      className={cn(
        "relative isolate overflow-hidden rounded-[22px] border border-line bg-raised shadow-panel",
      )}
    >
      {/* Top row: Ring + core probability + compact factor pills */}
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-ink/[0.08]" />
            {ready && (
              <circle
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={R}
                fill="none"
                strokeWidth={STROKE}
                strokeLinecap="butt"
                className="stroke-profit/20"
                strokeDasharray={`${Math.max(0.5, ((odds.high - odds.low) / 100) * C)} ${C}`}
                strokeDashoffset={-(odds.low / 100) * C}
              />
            )}
            <motion.circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={R}
              fill="none"
              strokeWidth={STROKE}
              strokeLinecap="round"
              className={ready ? (win >= 50 ? "stroke-profit" : "stroke-gold-strong") : "stroke-gold-strong"}
              initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${Math.max(0.001, progress) * C} ${C}` }}
              transition={reduce ? { duration: 0.2 } : SPRING}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            {ready ? (
              <p className="kpi tabular-nums text-ink">
                <Count value={win} className="text-[22px] font-semibold" />
                <span className="text-[11.5px] font-medium text-muted">%</span>
              </p>
            ) : (
              <p className="kpi tabular-nums text-[17px] font-semibold text-ink">
                {odds.n}
                <span className="text-[11.5px] font-medium text-muted">/{odds.needed}</span>
              </p>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">Win probability</p>
            {ready && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-ink/[0.05] px-2.5 py-0.5 text-[11.5px] font-medium text-muted">
                <Strength level={CONF[odds.confidence]} />
                <span className="tabular-nums">{odds.n} trades</span>
              </span>
            )}
          </div>

          {ready ? (
            <>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[13.5px] font-semibold tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-profit">
                  <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden />
                  <span>
                    Win <Count value={win} />%
                  </span>
                </span>
                <span className="inline-flex items-center gap-1.5 text-loss">
                  <span className="h-1.5 w-1.5 rounded-full bg-loss" aria-hidden />
                  <span>
                    Loss <Count value={100 - win} />%
                  </span>
                </span>
                {ck && ck.done < ck.total && ck.atAll > win && (
                  <span className="rounded-full bg-gold/15 px-2 py-0.5 text-[11.5px] font-semibold text-gold-deep dark:text-gold">
                    All rules → {ck.atAll}%
                  </span>
                )}
              </div>

              {odds.drivers.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {odds.drivers.slice(0, 3).map((dr) => (
                    <span
                      key={dr.label}
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium tabular-nums",
                        dr.pts > 0 ? "bg-profit/12 text-profit" : "bg-loss/12 text-loss",
                      )}
                    >
                      {dr.label}
                      <span className="opacity-80">{signed(dr.pts)}</span>
                    </span>
                  ))}
                </div>
              )}
            </>
          ) : (
            <p className="mt-1 text-[13px] leading-snug text-muted">
              Unlocks after {odds.needed} logged trades ({odds.n} recorded).
            </p>
          )}
        </div>
      </div>

      {/* Compact 4-metric hairline strip when setup history exists */}
      {ready && odds.similar && (
        <dl className="grid grid-cols-4 divide-x divide-line-soft border-t border-line-soft bg-ink/[0.02]">
          {([
            ["Setup win rate", pc(odds.similar.winRate)],
            ["Avg P&L", money(odds.similar.avgPnl)],
            ["Profit factor", odds.similar.profitFactor == null ? "—" : odds.similar.profitFactor.toFixed(2)],
            ["Avg R", odds.similar.avgR == null ? "—" : `${odds.similar.avgR > 0 ? "+" : ""}${odds.similar.avgR}R`],
          ] as const).map(([k, v]) => (
            <div key={k} className="min-w-0 px-3 py-2.5 text-center">
              <dt className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">{k}</dt>
              <dd className="mt-0.5 text-[13.5px] font-semibold tabular-nums text-ink">{v}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

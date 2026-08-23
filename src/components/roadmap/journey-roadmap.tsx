"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { clamp01, computeStats } from "@/lib/stats";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { DrawdownMeter } from "@/components/charts/winrate-donut";
import {
  AwardIcon,
  FlagIcon,
  RouteIcon,
  ShieldIcon,
  TargetIcon,
  TrendingUpIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  The journey — an animated road from starting equity to target      */
/* ------------------------------------------------------------------ */

const ROAD =
  "M50 305 H240 Q275 305 275 270 V210 Q275 175 310 175 H500 Q535 175 535 210 V255 Q535 290 570 290 H740 Q775 290 775 255 V180 Q775 145 810 145 H930";

const START = { x: 50, y: 305 };
const END = { x: 930, y: 145 };

interface Pt {
  x: number;
  y: number;
  angle: number;
}

export function JourneyRoadmap() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const reduce = useReducedMotion();

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const range = settings.targetEquity - settings.startingEquity;

  /* ---- geometry ---- */
  const pathRef = useRef<SVGPathElement>(null);
  const [len, setLen] = useState(0);
  useEffect(() => {
    if (pathRef.current) setLen(pathRef.current.getTotalLength());
  }, []);

  const pointAt = (f: number): Pt => {
    const el = pathRef.current;
    if (!el || !len) return { ...START, angle: 0 };
    const l = Math.min(len, Math.max(1, len * f));
    const p = el.getPointAtLength(l);
    const q = el.getPointAtLength(Math.min(len, l + 2));
    return {
      x: p.x,
      y: p.y,
      angle: (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI,
    };
  };

  const frac = clamp01(range !== 0 ? stats.targetProgress : 0);
  const peakFrac = clamp01(range !== 0 ? (stats.peakEquity - settings.startingEquity) / range : 0);
  const behindStart = stats.currentEquity < settings.startingEquity && stats.tradeCount > 0;
  const reachedTarget = range !== 0 && stats.remainingToTarget <= 0 && stats.tradeCount > 0;

  const milestones = [0.25, 0.5, 0.75].map((f) => ({
    f,
    equity: settings.startingEquity + f * range,
    passed: frac >= f - 1e-6,
    pt: pointAt(f),
  }));
  const nextMilestone = milestones.find((m) => !m.passed);

  const rider = pointAt(reachedTarget ? 1 : frac);
  // Keep the vehicle upright when heading leftwards along the road.
  const flipped = Math.cos((rider.angle * Math.PI) / 180) < 0;

  const traveledLen = len * frac;
  const recoverySegStart = len * frac;
  const recoverySegLen = Math.max(0, len * (peakFrac - frac));

  const currency = settings.currency;

  return (
    <section className="space-y-6" aria-label="Trading progress roadmap">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">Roadmap</h1>
          <p className="mt-1 text-sm text-muted">
            {formatMoney(settings.startingEquity, currency)} start →{" "}
            <span className="text-gold">{formatMoney(settings.targetEquity, currency)} target</span>
            {" · "}
            {formatMoney(settings.maxDrawdown, currency)} drawdown budget
          </p>
        </div>
        <div className="text-right">
          <p className="font-mono text-4xl font-bold tabular leading-none text-gold sm:text-5xl">
            {Math.round(frac * 100)}
            <span className="text-lg text-faint">%</span>
          </p>
          <p className="mt-1 flex items-center justify-end gap-1.5 text-xs text-muted">
            of the journey complete
          </p>
        </div>
      </div>

      {/* The road */}
      <motion.div
        initial={{ opacity: 0, y: 22 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        className="panel relative overflow-hidden"
      >
        {/* status banners */}
        {behindStart && !reachedTarget && (
          <div className="absolute left-4 top-4 z-10 rounded-xl border border-loss/35 bg-canvas/85 px-3.5 py-2 backdrop-blur">
            <p className="flex items-center gap-2 text-xs font-semibold text-loss">
              <ShieldIcon className="h-4 w-4" />
              Rebuilding mode — equity is below the start line
            </p>
          </div>
        )}
        {reachedTarget && (
          <div className="absolute left-4 top-4 z-10 rounded-xl border border-gold/40 bg-gradient-to-r from-gold/[0.14] to-transparent px-3.5 py-2 backdrop-blur">
            <p className="flex items-center gap-2 text-xs font-semibold text-gold">
              <AwardIcon className="h-4 w-4" />
              Target reached — time to set a bigger one in Settings
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <svg
            viewBox="0 0 1000 360"
            className="w-full min-w-[680px] select-none"
            role="img"
            aria-label={`Roadmap: ${Math.round(frac * 100)}% of the way from ${formatMoney(settings.startingEquity, currency)} to ${formatMoney(settings.targetEquity, currency)}`}
          >
          <defs>
            <linearGradient id="rm-progress" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0%" stopColor="var(--color-profit-deep)" />
              <stop offset="55%" stopColor="var(--color-profit)" />
              <stop offset="100%" stopColor="var(--color-gold)" />
            </linearGradient>
            <radialGradient id="rm-glow" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="var(--color-gold)" stopOpacity="0.35" />
              <stop offset="100%" stopColor="var(--color-gold)" stopOpacity="0" />
            </radialGradient>
          </defs>

          {/* ambient glows */}
          <ellipse cx={START.x} cy={START.y} rx="130" ry="60" fill="url(#rm-glow)" opacity="0.25" />
          <ellipse cx={END.x} cy={END.y} rx="150" ry="80" fill="url(#rm-glow)" />

          {/* road layers */}
          <path ref={pathRef} d={ROAD} fill="none" stroke="var(--color-road-shadow)" strokeWidth="34" strokeLinecap="round" />
          <path d={ROAD} fill="none" stroke="var(--color-road-base)" strokeWidth="30" strokeLinecap="round" />
          <path d={ROAD} fill="none" stroke="var(--color-road-surface)" strokeWidth="26" strokeLinecap="round" />
          {/* centre line dashes */}
          {!reduce && (
            <path
              d={ROAD}
              fill="none"
              stroke="var(--color-gold)"
              strokeOpacity="0.28"
              strokeWidth="1.6"
              strokeDasharray="11 17"
              strokeLinecap="round"
              style={{ animation: "dash-flow 1.15s linear infinite" }}
            />
          )}

          {/* recovery zone (peak → current) */}
          {len > 0 && recoverySegLen > 4 && (
            <g>
              <path
                d={ROAD}
                fill="none"
                stroke="var(--color-loss)"
                strokeOpacity="0.13"
                strokeWidth="26"
                strokeLinecap="butt"
                strokeDasharray={`${recoverySegLen} ${len}`}
                strokeDashoffset={-recoverySegStart}
              />
              <text
                x={pointAt(frac + (peakFrac - frac) / 2).x}
                y={pointAt(frac + (peakFrac - frac) / 2).y - 24}
                textAnchor="middle"
                fontSize="10.5"
                fontFamily="var(--font-mono)"
                fill="var(--color-loss)"
                opacity="0.85"
              >
                RECOVERY ZONE · PEAK {formatMoney(settings.startingEquity + peakFrac * range, currency, { compact: true })}
              </text>
            </g>
          )}

          {/* travelled overlay */}
          {len > 0 && (
            <motion.path
              d={ROAD}
              fill="none"
              stroke="url(#rm-progress)"
              strokeWidth="26"
              strokeLinecap="round"
              strokeDasharray={traveledLen + 40}
              initial={{ strokeDashoffset: traveledLen + 40 }}
              animate={{ strokeDashoffset: 0 }}
              transition={{ duration: reduce ? 0 : 1.6, ease: [0.16, 1, 0.3, 1], delay: 0.35 }}
            />
          )}

          {/* start marker */}
          <g>
            <circle cx={START.x} cy={START.y} r="12" fill="var(--color-raised)" stroke="var(--color-muted)" strokeWidth="2" />
            <circle cx={START.x} cy={START.y} r="4" fill="var(--color-muted)" />
            <text x={START.x} y={START.y + 34} textAnchor="middle" fontSize="11" fontFamily="var(--font-mono)" letterSpacing="1.5" fill="var(--color-muted)">
              START
            </text>
            <text x={START.x} y={START.y + 48} textAnchor="middle" fontSize="10" fontFamily="var(--font-mono)" fill="var(--color-faint)">
              {formatMoney(settings.startingEquity, currency, { compact: true })}
            </text>
          </g>

          {/* milestones */}
          {milestones.map((m) => (
            <g key={m.f} transform={`translate(${m.pt.x}, ${m.pt.y})`}>
              {m.passed ? (
                <>
                  <circle r="10" fill="var(--color-raised)" stroke="var(--color-profit)" strokeWidth="2" />
                  <circle r="14.5" fill="none" stroke="var(--color-profit)" strokeOpacity="0.25" />
                  <path d="M-4 0 L-1.2 3 L4.5 -3.5" stroke="var(--color-profit)" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </>
              ) : (
                <>
                  {nextMilestone?.f === m.f && !reduce && (
                    <motion.g
                      animate={{ scale: [1, 1.9], opacity: [0.7, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
                    >
                      <circle r="10" fill="none" stroke="var(--color-gold)" strokeWidth="1.5" />
                    </motion.g>
                  )}
                  <circle r="9" fill="var(--color-raised)" stroke="var(--color-line-strong)" strokeWidth="2" />
                  <circle r="3" fill="var(--color-line-strong)" />
                </>
              )}
              <text y="-18" textAnchor="middle" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)" fill={m.passed ? "var(--color-profit)" : "var(--color-muted)"}>
                {formatMoney(m.equity, currency, { compact: true })}
              </text>
            </g>
          ))}

          {/* target gate */}
          <g transform={`translate(${END.x}, ${END.y})`}>
            <rect x="-2.5" y="-52" width="5" height="56" rx="2.5" fill="var(--color-gold-strong)" />
            <path d="M2.5 -50 L44 -38 L2.5 -26 Z" fill={reachedTarget ? "var(--color-profit)" : "var(--color-gold-strong)"} />
            <text x="-10" y="34" textAnchor="end" fontSize="11" fontWeight="700" fontFamily="var(--font-mono)" letterSpacing="1.5" fill="var(--color-gold)">
              TARGET
            </text>
            <text x="-10" y="48" textAnchor="end" fontSize="10" fontFamily="var(--font-mono)" fill="var(--color-gold-deep)">
              {formatMoney(settings.targetEquity, currency, { compact: true })}
            </text>
            {reachedTarget &&
              !reduce &&
              [0, 1, 2, 3].map((i) => (
                <motion.circle
                  key={i}
                  r={3 + i * 1.6}
                  fill="none"
                  stroke="var(--color-gold)"
                  strokeWidth="1"
                  animate={{ scale: [1, 3.2], opacity: [0.8, 0] }}
                  transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.5, ease: "easeOut" }}
                />
              ))}
          </g>

          {/* ------------------------------ rider ------------------------------ */}
          {len > 0 && (
            <motion.g
              initial={false}
              animate={{ x: rider.x, y: rider.y }}
              transition={{ type: "spring", stiffness: 62, damping: 16, mass: 0.9 }}
            >
              {/* halo */}
              <motion.circle
                r="20"
                fill="none"
                stroke="var(--color-gold)"
                strokeWidth="1"
                animate={reduce ? undefined : { opacity: [0.45, 0.12, 0.45], scale: [1, 1.18, 1] }}
                transition={{ duration: 2.6, repeat: Infinity }}
              />
              <circle r="15" fill="var(--color-canvas)" opacity="0.65" />

              <motion.g
                initial={false}
                animate={{ rotate: rider.angle }}
                transition={{ type: "spring", stiffness: 62, damping: 16 }}
              >
                <g transform={flipped ? "scale(1,-1)" : undefined}>
                  {/* shadow */}
                  <ellipse cy="13" rx="21" ry="3.4" fill="#000" opacity="0.4" />
                  <motion.g
                    animate={reduce ? undefined : { y: [0, -1.6, 0] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
                  >
                    {/* wheels */}
                    {[[-12, 8], [11, 8]].map(([wx, wy]) => (
                      <g key={wx} transform={`translate(${wx},${wy})`}>
                        <circle r="5" fill="var(--color-raised)" stroke="var(--color-line-strong)" strokeWidth="2" />
                        {!reduce && (
                          <g>
                            <animateTransform attributeName="transform" type="rotate" from="0" to="360" dur="0.85s" repeatCount="indefinite" />
                            <path d="M0 -3.4 V3.4 M-3.4 0 H3.4" stroke="var(--color-gold)" strokeWidth="1.1" strokeLinecap="round" opacity="0.85" />
                          </g>
                        )}
                      </g>
                    ))}
                    {/* body */}
                    <path
                      d="M-21 5 L-21 1 Q-21 -3 -16 -3.5 L-6 -4.5 Q-2 -8 4 -8 L11 -8 Q16 -8 18.5 -3.5 L21 -2 Q23 -1 22.5 2 L21 5 Z"
                      fill="url(#rm-progress)"
                      stroke="var(--color-raised)"
                      strokeWidth="1"
                    />
                    {/* cockpit */}
                    <path d="M0 -6.5 L8 -6.5 Q12 -6.5 14 -3.5 L2 -3.5 Z" fill="var(--color-canvas)" opacity="0.75" />
                    {/* headlight beam dot */}
                    <circle cx="21" cy="0.5" r="1.6" fill="#fff" opacity="0.95" />
                    {/* pennant */}
                    <line x1="-16" y1="-4" x2="-16" y2="-17" stroke="var(--color-muted)" strokeWidth="1.2" />
                    <path d="M-16 -17 L-7 -14.5 L-16 -12 Z" fill="var(--color-loss)" />
                  </motion.g>
                </g>
              </motion.g>
            </motion.g>
          )}
        </svg>
        </div>

        {/* Rail under the road */}
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 border-t border-line px-5 py-5 md:grid-cols-4 md:px-7">
          <RailStat icon={<RouteIcon className="h-4 w-4 text-muted" />} label="Start equity" value={formatMoney(settings.startingEquity, currency)} />
          <RailStat
            icon={<WalletIcon className="h-4 w-4 text-info" />}
            label="Current equity"
            value={formatMoney(stats.currentEquity, currency)}
            chip={
              <span className={cn("font-mono text-[11px] font-semibold", stats.totalPnl >= 0 ? "text-profit" : "text-loss")}>
                {formatSignedMoney(stats.totalPnl, currency)}
              </span>
            }
          />
          <RailStat
            icon={<FlagIcon className="h-4 w-4 text-profit" />}
            label={nextMilestone ? "Next milestone" : "Final milestone"}
            value={
              nextMilestone
                ? formatMoney(nextMilestone.equity, currency, { compact: true })
                : formatMoney(settings.targetEquity, currency, { compact: true })
            }
            sub={
              nextMilestone
                ? `${formatMoney(nextMilestone.equity - stats.currentEquity, currency)} away`
                : reachedTarget
                  ? "conquered"
                  : `${formatMoney(Math.max(0, stats.remainingToTarget), currency, { compact: true })} to finish`
            }
          />
          <RailStat
            icon={<TrendingUpIcon className="h-4 w-4 text-gold" />}
            label="Remaining to target"
            value={formatMoney(Math.max(0, stats.remainingToTarget), currency, { compact: true })}
            sub={
              stats.avgDayPnl > 0 && stats.remainingToTarget > 0
                ? `≈ ${Math.ceil(stats.remainingToTarget / stats.avgDayPnl)} trading days at pace`
                : reachedTarget
                  ? "target achieved"
                  : "keep stacking green days"
            }
          />
        </div>

        <div className="border-t border-line px-5 py-4 md:px-7">
          <DrawdownMeter used={stats.drawdownBudgetUsed} amount={stats.drawdown} budget={settings.maxDrawdown} />
        </div>
      </motion.div>
    </section>
  );
}

function RailStat({
  icon,
  label,
  value,
  sub,
  chip,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  chip?: React.ReactNode;
}) {
  return (
    <div>
      <p className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.13em] text-faint">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 flex items-baseline gap-2">
        <span className="font-mono text-lg font-bold tabular text-ink">{value}</span>
        {chip}
      </p>
      {sub && <p className="mt-0.5 text-[11px] text-muted">{sub}</p>}
    </div>
  );
}

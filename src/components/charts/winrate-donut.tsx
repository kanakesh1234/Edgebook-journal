"use client";

import { motion } from "motion/react";

/** Animated donut showing the share of winning days. */
export function WinRateDonut({
  winRate,
  size = 148,
  strokeWidth = 11,
}: {
  winRate: number; // 0..1
  size?: number;
  strokeWidth?: number;
}) {
  const r = (size - strokeWidth) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.min(1, Math.max(0, winRate));

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-line-soft)" strokeWidth={strokeWidth} />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#donut-grad)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          whileInView={{ strokeDashoffset: c * (1 - pct) }}
          viewport={{ once: true }}
          transition={{ duration: 1.2, ease: [0.16, 1, 0.3, 1], delay: 0.25 }}
        />
        <defs>
          <linearGradient id="donut-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--color-profit)" />
            <stop offset="100%" stopColor="var(--color-gold-strong)" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-mono text-[26px] font-bold tabular leading-none text-ink">
          {Math.round(pct * 100)}%
        </span>
        <span className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-faint">win rate</span>
      </div>
    </div>
  );
}

/** Drawdown budget meter — how much of the max drawdown allowance is spent. */
export function DrawdownMeter({
  used, // 0..1
  amount,
  budget,
}: {
  used: number;
  amount: number; // current drawdown $
  budget: number; // max allowed $
}) {
  const pct = Math.min(1, Math.max(0, used));
  const tone = pct >= 0.8 ? "loss" : pct >= 0.5 ? "gold" : "profit";
  const barColor =
    tone === "loss"
      ? "from-loss-deep to-loss"
      : tone === "gold"
        ? "from-gold-deep to-gold"
        : "from-profit-deep to-profit";
  const textColor = tone === "loss" ? "text-loss" : tone === "gold" ? "text-gold" : "text-profit";

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="text-xs font-medium text-muted">Drawdown budget</p>
        <p className={`font-mono text-sm font-semibold tabular ${textColor}`}>
          {Math.round(pct * 100)}%
        </p>
      </div>
      <div className="relative mt-2 h-2 overflow-hidden rounded-full bg-canvas" role="img" aria-label={`Drawdown budget ${Math.round(pct * 100)}% used`}>
        <motion.div
          className={`h-full rounded-full bg-gradient-to-r ${barColor}`}
          initial={{ width: 0 }}
          whileInView={{ width: `${pct * 100}%` }}
          viewport={{ once: true }}
          transition={{ duration: 1, ease: [0.16, 1, 0.3, 1], delay: 0.3 }}
        />
        {/* risk thresholds */}
        <span className="absolute left-1/2 top-0 h-full w-px bg-canvas/80" aria-hidden />
        <span className="absolute left-[80%] top-0 h-full w-px bg-canvas/80" aria-hidden />
      </div>
      <p className="mt-1.5 flex justify-between font-mono text-[10px] tabular text-faint">
        <span>{amount.toFixed(0)} drawn</span>
        <span>of {budget.toFixed(0)} allowed</span>
      </p>
    </div>
  );
}

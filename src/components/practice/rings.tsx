"use client";

import { motion, useReducedMotion } from "motion/react";

/**
 * A circular progress ring that draws itself in on mount and glides to every new value.
 * Children (an icon, a number) sit in the middle.
 */
export function ProgressRing({ value, size = 48, stroke = 3.5, tone = "var(--gold-strong)", delay = 0, children }: { value: number; size?: number; stroke?: number; tone?: string; delay?: number; children?: React.ReactNode }) {
  const reduce = useReducedMotion();
  const f = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  const r = (size - stroke) / 2;
  const c = size / 2;
  return (
    <span className="relative inline-grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx={c} cy={c} r={r} fill="none" stroke="color-mix(in srgb, var(--ink) 8%, transparent)" strokeWidth={stroke} />
        <motion.circle
          cx={c} cy={c} r={r} fill="none" stroke={tone} strokeWidth={stroke} strokeLinecap="round"
          initial={{ pathLength: reduce ? f : 0 }}
          animate={{ pathLength: f }}
          transition={{ duration: reduce ? 0 : 1.1, ease: [0.16, 1, 0.3, 1], delay: reduce ? 0 : delay }}
          style={{ opacity: f > 0 ? 1 : 0 }}
        />
      </svg>
      <span className="relative grid place-items-center">{children}</span>
    </span>
  );
}

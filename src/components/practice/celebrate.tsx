"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";

/** Counts up to `value` with an ease-out. Shows the final value immediately when motion is reduced. */
export function CountUp({ value, duration = 900, prefix = "", delay = 0 }: { value: number; duration?: number; prefix?: string; delay?: number }) {
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (reduce) { setShown(value); return; }
    let raf = 0;
    let start = 0;
    const timer = window.setTimeout(() => {
      const tick = (now: number) => {
        start ||= now;
        const t = Math.min(1, (now - start) / duration);
        setShown(Math.round(value * (1 - Math.pow(1 - t, 3))));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, delay);
    return () => { window.clearTimeout(timer); cancelAnimationFrame(raf); };
  }, [value, duration, delay, reduce]);
  return <>{prefix}{shown}</>;
}

/** Deterministic pseudo-random so the burst is stable between renders. */
const rand = (i: number, salt: number) => { const x = Math.sin(i * 12.9898 + salt * 78.233) * 43758.5453; return x - Math.floor(x); };

/**
 * A short, tasteful burst of confetti from the top of its box. No dependencies; renders nothing when
 * the player prefers reduced motion. `colors` are CSS colours (theme variables are fine).
 */
export function Burst({ colors, count = 34 }: { colors: string[]; count?: number }) {
  const reduce = useReducedMotion();
  const palette = colors.join("|");
  const pieces = useMemo(() => Array.from({ length: count }, (_, i) => ({
    x: (rand(i, 1) - 0.5) * 520, y: 160 + rand(i, 2) * 300, r: (rand(i, 3) - 0.5) * 720, d: 1.3 + rand(i, 4) * 0.9, delay: rand(i, 5) * 0.15,
    w: 5 + rand(i, 6) * 5, h: 8 + rand(i, 7) * 8, color: palette.split("|")[i % colors.length]!, round: rand(i, 8) > 0.6,
  })), [count, palette]); // eslint-disable-line react-hooks/exhaustive-deps
  if (reduce) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 z-10 flex h-0 justify-center overflow-visible">
      {pieces.map((p, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 1, x: 0, y: -10, rotate: 0, scale: 0.6 }}
          animate={{ opacity: [1, 1, 0], x: p.x, y: p.y, rotate: p.r, scale: 1 }}
          transition={{ duration: p.d, delay: p.delay, ease: [0.16, 1, 0.3, 1] }}
          className="absolute top-0"
          style={{ width: p.w, height: p.round ? p.w : p.h, background: p.color, borderRadius: p.round ? 999 : 2 }}
        />
      ))}
    </div>
  );
}

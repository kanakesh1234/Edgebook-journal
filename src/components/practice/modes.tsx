"use client";

import { cn } from "@/lib/utils";
import type { ArenaMode } from "@/lib/practice/arena";

/** Mix an accent into a base colour. Everything stays inside Edgebook's own theme tokens. */
export const tint = (accent: string, pct: number, base = "transparent") => `color-mix(in srgb, ${accent} ${pct}%, ${base})`;

/**
 * One identity per mode. Same design language, different purpose:
 *   Matrix        mixed run        — info blue, dot grid
 *   Time Machine  chart revision   — profit green, candlesticks
 *   Math Duel     risk maths       — gold, ruler ticks
 *   Weekend Boss  your week        — loss red, a boss health bar
 */
export const MODE_META: Record<ArenaMode, { title: string; eyebrow: string; blurb: string; accent: string; /** short label for the stage header */ stage: string }> = {
  matrix: { title: "Matrix", eyebrow: "Charts · maths · duels", blurb: "Your charts, your trades and quick risk maths in one run.", accent: "var(--info)", stage: "Mixed run" },
  "time-machine": { title: "Time Machine", eyebrow: "Revise your charts", blurb: "Re-read saved screenshots and answer on what you actually did.", accent: "var(--profit)", stage: "Chart revision" },
  "math-duel": { title: "Math Duel", eyebrow: "Risk maths", blurb: "Fast calculations from your own numbers. Harder every level.", accent: "var(--gold-strong)", stage: "Risk maths" },
  boss: { title: "Weekend Boss", eyebrow: "Your week", blurb: "Cross-trade questions on patterns, repeated mistakes and what they cost.", accent: "var(--loss)", stage: "This week" },
};

/* -------------------------------- glyphs -------------------------------- */

const g = { fill: "none", stroke: "currentColor", strokeWidth: 1.75, strokeLinecap: "round", strokeLinejoin: "round" } as const;

function MatrixGlyph() {
  const dots = [6, 12, 18];
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden {...g} strokeWidth={0}>
      {dots.flatMap((y) => dots.map((x) => <circle key={`${x}-${y}`} cx={x} cy={y} r={x === y ? 2 : 1.35} fill="currentColor" opacity={x === y ? 1 : 0.38} />))}
      <path d="M6 6 12 12 18 18" stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" />
    </svg>
  );
}
function TimeMachineGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden {...g}>
      <path d="M4.5 12a7.5 7.5 0 1 0 2.4-5.5" />
      <path d="M4 4.5V8h3.5" />
      <path d="M12 8v4.2l2.8 1.8" />
    </svg>
  );
}
function MathDuelGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden {...g}>
      <rect x="3.75" y="3.75" width="16.5" height="16.5" rx="4.5" />
      <path d="M12 3.75v16.5M3.75 12h16.5" opacity={0.35} />
      <path d="M8 6.9v2.4M6.8 8.1h2.4" />
      <path d="M14.8 8.1h2.4" />
      <path d="m6.9 14.9 2.4 2.4m0-2.4-2.4 2.4" />
      <path d="M14.8 16.1h2.4" />
      <circle cx="16" cy="14.6" r="0.5" fill="currentColor" />
      <circle cx="16" cy="17.6" r="0.5" fill="currentColor" />
    </svg>
  );
}
function BossGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-full w-full" aria-hidden {...g}>
      <path d="M12 3.2 19 6v5.2c0 4.3-2.9 7.7-7 9.6-4.1-1.9-7-5.3-7-9.6V6l7-2.8Z" />
      <path d="M8.6 14.2V10l3.4 2.3L15.4 10v4.2" />
    </svg>
  );
}

export const MODE_GLYPH: Record<ArenaMode, () => React.JSX.Element> = { matrix: MatrixGlyph, "time-machine": TimeMachineGlyph, "math-duel": MathDuelGlyph, boss: BossGlyph };

/** The mode's glyph in a softly tinted tile. `sm` for headers, `md` for cards, `lg` for hero moments. */
export function ModeBadge({ mode, size = "md", className }: { mode: ArenaMode; size?: "sm" | "md" | "lg"; className?: string }) {
  const { accent } = MODE_META[mode];
  const Glyph = MODE_GLYPH[mode];
  const box = size === "sm" ? "h-8 w-8 rounded-[10px] p-[7px]" : size === "lg" ? "h-16 w-16 rounded-[20px] p-[15px]" : "h-11 w-11 rounded-[14px] p-[10px]";
  return (
    <span
      aria-hidden
      className={cn("inline-grid shrink-0 place-items-center", box, className)}
      style={{
        background: `linear-gradient(150deg, ${tint(accent, 26, "var(--raised)")}, ${tint(accent, 12, "var(--raised)")})`,
        border: `1px solid ${tint(accent, 32)}`,
        color: tint(accent, 70, "var(--ink)"),
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.45), 0 4px 12px -6px ${tint(accent, 55)}`,
      }}
    >
      <Glyph />
    </span>
  );
}

/* -------------------------------- motifs -------------------------------- */

/** Faint corner artwork that gives each card its own character. Decorative only. */
export function ModeMotif({ mode }: { mode: ArenaMode }) {
  const { accent } = MODE_META[mode];
  const fade = "radial-gradient(90% 90% at 100% 0%, #000 0%, transparent 72%)";
  const base = { WebkitMaskImage: fade, maskImage: fade } as const;

  if (mode === "matrix") {
    return <span aria-hidden className="pointer-events-none absolute inset-0" style={{ ...base, opacity: 0.55, backgroundImage: `radial-gradient(${tint(accent, 55)} 1.2px, transparent 1.4px)`, backgroundSize: "18px 18px" }} />;
  }
  if (mode === "math-duel") {
    return <span aria-hidden className="pointer-events-none absolute inset-0" style={{ ...base, opacity: 0.5, backgroundImage: `repeating-linear-gradient(90deg, ${tint(accent, 50)} 0 1.5px, transparent 1.5px 12px)`, backgroundSize: "100% 14px", backgroundRepeat: "no-repeat", backgroundPosition: "0 0" }} />;
  }
  if (mode === "boss") {
    return <span aria-hidden className="pointer-events-none absolute inset-0" style={{ ...base, opacity: 0.6, backgroundImage: `repeating-conic-gradient(from 200deg at 100% 0%, ${tint(accent, 22)} 0deg 4deg, transparent 4deg 14deg)` }} />;
  }
  const bars = [14, 22, 10, 28, 18, 32, 24];
  return (
    <svg aria-hidden viewBox="0 0 112 44" className="pointer-events-none absolute right-5 top-4 h-11 w-28 opacity-70" style={{ color: tint(accent, 60) }}>
      {bars.map((h, i) => (
        <g key={i} transform={`translate(${6 + i * 15} 0)`}>
          <path d={`M3 ${44 - h - 6}v${h + 12}`} stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.6" />
          <rect x="0" y={44 - h - 2} width="6" height={Math.max(6, h * 0.55)} rx="1.4" fill="currentColor" opacity={i % 2 ? 0.35 : 0.8} />
        </g>
      ))}
    </svg>
  );
}

"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ArenaMode } from "@/lib/practice/arena";

export const MODE_META: Record<ArenaMode, { title: string; eyebrow: string; blurb: string; accent: string }> = {
  matrix: { title: "Matrix", eyebrow: "Charts · maths · duels", blurb: "Your charts, your trades and quick risk maths in one run.", accent: "var(--info)" },
  "time-machine": { title: "Time Machine", eyebrow: "Revise your charts", blurb: "Re-read saved screenshots and answer on what you actually did.", accent: "var(--profit)" },
  "math-duel": { title: "Math Duel", eyebrow: "Risk maths", blurb: "Fast calculations from your own numbers. Harder every level.", accent: "var(--gold-strong)" },
  boss: { title: "Weekend Boss", eyebrow: "Your week", blurb: "Cross-trade questions on patterns, repeated mistakes and what they cost.", accent: "var(--loss)" },
};

interface Props {
  mode: ArenaMode;
  level: number;
  /** One quiet line at the bottom, e.g. the gate for the next level. */
  status: string;
  disabled?: boolean;
  busy?: boolean;
  onStart?: () => void;
  href?: string;
  compact?: boolean;
}

export function ModeCard({ mode, level, status, disabled, busy, onStart, href, compact }: Props) {
  const meta = MODE_META[mode];
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, ${meta.accent} 15%, transparent), transparent 62%)` }} />
      <div className={cn("relative flex h-full flex-col", compact ? "min-h-[190px] p-5" : "min-h-[280px] p-7 sm:p-8")}>
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-faint">{meta.eyebrow}</p>
          <span className="rounded-full border border-line-strong bg-raised/70 px-3 py-1 text-[12px] font-semibold tabular-nums text-ink">Level {level}</span>
        </div>
        <h3 className={cn("font-semibold tracking-[-0.025em] text-ink", compact ? "mt-5 text-[22px]" : "mt-10 text-[32px] leading-none")}>{meta.title}</h3>
        <p className={cn("mt-2 max-w-[30ch] leading-snug text-muted", compact ? "text-[13px]" : "text-[15px]")}>{meta.blurb}</p>
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <p className="max-w-[24ch] text-[12px] leading-snug text-faint">{status}</p>
          <span className={cn("inline-flex shrink-0 items-center rounded-full px-4 py-2 text-[13px] font-semibold transition-colors", disabled ? "bg-ink/10 text-faint" : "bg-ink text-canvas group-hover:opacity-85")}>
            {busy ? "Preparing…" : disabled ? "Locked" : "Start"}
          </span>
        </div>
      </div>
    </>
  );
  const base = "group relative block w-full overflow-hidden rounded-[28px] border border-line bg-surface text-left transition-all duration-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";
  const lift = "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-lift)]";

  if (href && !disabled) return <Link href={href} className={cn(base, lift)}>{body}</Link>;
  return (
    <button type="button" disabled={disabled || busy} onClick={onStart} className={cn(base, !disabled && lift, disabled && "cursor-not-allowed")}>
      {body}
    </button>
  );
}

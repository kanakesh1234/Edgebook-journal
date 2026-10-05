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

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-px" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" /></svg>
);

/** Small, label-free tile for Home: just the mode, its level and a play button. */
function CompactTile({ mode, level, status, disabled, busy, onStart, href }: Omit<Props, "compact">) {
  const meta = MODE_META[mode];
  const inner = (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(90% 140% at 100% 0%, color-mix(in srgb, ${meta.accent} 18%, transparent), transparent 70%)` }} />
      <span className="relative min-w-0">
        <span className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">{meta.title}</span>
        <span className="mt-0.5 block whitespace-nowrap text-[12px] tabular-nums text-muted">{disabled ? "Locked" : `Level ${level}`}</span>
      </span>
      <span
        className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform duration-200", disabled ? "bg-ink/10 text-faint" : "group-hover:scale-105")}
        style={disabled ? undefined : {
          // Same tint as the tile's own corner glow, so the button belongs to the card.
          background: `linear-gradient(145deg, color-mix(in srgb, ${meta.accent} 34%, var(--raised)), color-mix(in srgb, ${meta.accent} 16%, var(--raised)))`,
          border: `1px solid color-mix(in srgb, ${meta.accent} 38%, transparent)`,
          color: `color-mix(in srgb, ${meta.accent} 62%, var(--ink))`,
          boxShadow: `0 4px 10px -5px color-mix(in srgb, ${meta.accent} 55%, transparent), inset 0 1px 0 rgb(255 255 255 / 0.5)`,
        }}
      >
        {busy ? <span className="h-3 w-3 animate-pulse rounded-full bg-current" /> : <PlayIcon />}
      </span>
    </>
  );
  const cls = cn(
    "group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-[20px] border border-line bg-surface px-4 py-3.5 text-left transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold",
    !disabled && "hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[var(--shadow-lift)]",
    disabled && "cursor-not-allowed opacity-70",
  );
  if (href && !disabled) return <Link href={href} className={cls} aria-label={`Play ${meta.title}, level ${level}`}>{inner}</Link>;
  return <button type="button" disabled={disabled || busy} onClick={onStart} title={disabled ? status : undefined} className={cls}>{inner}</button>;
}

export function ModeCard({ mode, level, status, disabled, busy, onStart, href, compact }: Props) {
  if (compact) return <CompactTile mode={mode} level={level} status={status} disabled={disabled} busy={busy} onStart={onStart} href={href} />;
  const meta = MODE_META[mode];
  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 80% at 100% 0%, color-mix(in srgb, ${meta.accent} 15%, transparent), transparent 62%)` }} />
      <div className="relative flex h-full min-h-[280px] flex-col p-7 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[.16em] text-faint">{meta.eyebrow}</p>
          <span className="whitespace-nowrap rounded-full border border-line-strong bg-raised/70 px-3 py-1 text-[12px] font-semibold tabular-nums text-ink">Level {level}</span>
        </div>
        <h3 className="mt-10 text-[32px] font-semibold leading-none tracking-[-0.025em] text-ink">{meta.title}</h3>
        <p className="mt-2 max-w-[30ch] text-[15px] leading-snug text-muted">{meta.blurb}</p>
        <div className="mt-auto flex items-end justify-between gap-4 pt-6">
          <p className="max-w-[24ch] text-[12px] leading-snug text-faint">{status}</p>
          <span className={cn("inline-flex shrink-0 items-center rounded-full px-4 py-2 text-[13px] font-semibold transition-colors", disabled ? "bg-ink/10 text-faint" : "bg-gradient-to-b from-gold-strong to-gold-deep text-on-gold shadow-[0_6px_14px_-6px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)] group-hover:brightness-110")}>
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

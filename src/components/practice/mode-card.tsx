"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { ArenaMode } from "@/lib/practice/arena";
import { MODE_META, ModeBadge, ModeMotif, tint } from "./modes";
import { GateMeter, surface } from "./ui";

export { MODE_META };

interface Props {
  mode: ArenaMode;
  level: number;
  /** Why the mode is locked (shown when `disabled`), or a fallback line. */
  status: string;
  disabled?: boolean;
  busy?: boolean;
  onStart?: () => void;
  href?: string;
  compact?: boolean;
  /** Progress toward the next level; drawn as the mode's own meter. */
  meter?: { value: number; goal: number; accuracy: number; nextLevel: number };
  /** A small line above the title, e.g. "5 trades this week". */
  meta?: string;
}

const PlayIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4 translate-x-px" fill="currentColor" aria-hidden><path d="M8 5.5v13a1 1 0 0 0 1.52.85l10.4-6.5a1 1 0 0 0 0-1.7L9.52 4.65A1 1 0 0 0 8 5.5Z" /></svg>
);
const LockIcon = () => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="5" y="11" width="14" height="9" rx="2.5" /><path d="M8.5 11V8a3.5 3.5 0 0 1 7 0v3" /></svg>
);

const focus = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold";

/** Small tile for Home: the mode, its level and a play button. */
function CompactTile({ mode, level, status, disabled, busy, onStart, href }: Omit<Props, "compact" | "meter" | "meta">) {
  const meta = MODE_META[mode];
  const inner = (
    <>
      <span className="relative flex min-w-0 items-center gap-3">
        <ModeBadge mode={mode} size="sm" />
        <span className="min-w-0">
          <span className="block truncate text-[15px] font-semibold tracking-[-0.015em] text-ink">{meta.title}</span>
          <span className="mt-0.5 block whitespace-nowrap text-[12px] tabular-nums text-muted">{disabled ? "Locked" : `Level ${level}`}</span>
        </span>
      </span>
      <span
        className={cn("relative grid h-9 w-9 shrink-0 place-items-center rounded-full transition-transform duration-200", disabled ? "bg-ink/10 text-faint" : "group-hover:scale-105")}
        style={disabled ? undefined : { background: `linear-gradient(145deg, ${tint(meta.accent, 34, "var(--raised)")}, ${tint(meta.accent, 16, "var(--raised)")})`, border: `1px solid ${tint(meta.accent, 38)}`, color: tint(meta.accent, 62, "var(--ink)"), boxShadow: `0 4px 10px -5px ${tint(meta.accent, 55)}, inset 0 1px 0 rgb(255 255 255 / 0.5)` }}
      >
        {busy ? <span className="h-3 w-3 animate-pulse rounded-full bg-current" /> : disabled ? <LockIcon /> : <PlayIcon />}
      </span>
    </>
  );
  const cls = cn("group relative flex w-full items-center justify-between gap-3 overflow-hidden rounded-[20px] px-4 py-3.5 text-left", surface.material, !disabled && surface.lift, disabled && "cursor-not-allowed opacity-70", focus);
  if (href && !disabled) return <Link href={href} className={cls} aria-label={`Play ${meta.title}, level ${level}`}>{inner}</Link>;
  return <button type="button" disabled={disabled || busy} onClick={onStart} title={disabled ? status : undefined} className={cls}>{inner}</button>;
}

export function ModeCard({ mode, level, status, disabled, busy, onStart, href, compact, meter, meta: metaLine }: Props) {
  if (compact) return <CompactTile mode={mode} level={level} status={status} disabled={disabled} busy={busy} onStart={onStart} href={href} />;
  const meta = MODE_META[mode];
  const boss = mode === "boss";

  const body = (
    <>
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(120% 80% at 100% 0%, ${tint(meta.accent, boss ? 14 : 11)}, transparent 62%)` }} />
      <ModeMotif mode={mode} />
      <div className="relative flex h-full min-h-[300px] flex-col p-7 sm:p-8">
        <div className="flex items-start justify-between gap-3">
          <ModeBadge mode={mode} size="md" />
          <span className="whitespace-nowrap rounded-full border border-line-strong bg-raised/70 px-3 py-1 text-[12px] font-semibold tabular-nums text-ink">Level {level}</span>
        </div>

        <p className="mt-8 text-[11px] font-semibold uppercase tracking-[.16em] text-faint">{metaLine ?? meta.eyebrow}</p>
        <h3 className="mt-1.5 text-[30px] font-semibold leading-none tracking-[-0.025em] text-ink">{meta.title}</h3>
        <p className="mt-2.5 max-w-[32ch] text-[15px] leading-snug text-muted">{meta.blurb}</p>

        <div className="mt-auto flex items-end justify-between gap-5 pt-7">
          {disabled || !meter ? (
            <p className="max-w-[26ch] text-[12.5px] leading-snug text-faint">{status}</p>
          ) : (
            <GateMeter value={meter.value} goal={meter.goal} accent={meta.accent} variant={boss ? "boss" : "fill"} needAccuracy={meter.accuracy} nextLevel={meter.nextLevel} />
          )}
          <span
            className={cn("inline-flex h-10 shrink-0 items-center rounded-full px-5 text-[14px] font-semibold tracking-[-0.01em] transition-all duration-200", disabled ? "bg-ink/[0.07] text-faint" : "bg-gradient-to-b from-gold-strong to-gold-deep text-on-gold shadow-[0_6px_14px_-6px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)] group-hover:brightness-110")}
          >
            {busy ? "Preparing…" : disabled ? "Locked" : "Start"}
          </span>
        </div>
      </div>
    </>
  );

  const base = cn("group relative block w-full overflow-hidden rounded-[28px] text-left transition-all duration-300", surface.material, focus);
  if (href && !disabled) return <Link href={href} className={cn(base, surface.lift)}>{body}</Link>;
  return (
    <button type="button" disabled={disabled || busy} onClick={onStart} className={cn(base, !disabled && surface.lift, disabled && "cursor-not-allowed")}>
      {body}
    </button>
  );
}

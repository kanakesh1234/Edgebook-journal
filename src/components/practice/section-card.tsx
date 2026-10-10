"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/button";
import { MODE_GLYPH, MODE_META } from "./modes";
import { LockIcon } from "./icons";
import type { ArenaMode } from "@/lib/practice/arena";
import "./practice.css";

export interface SectionStat { label: string; value: React.ReactNode }

interface Props {
  mode: ArenaMode;
  /** The player's level in this mode, shown on the stage. */
  level?: number;
  /** Marks the card the coach suggests next. */
  recommended?: boolean;
  /** One-line reason the section can't start yet. */
  blocked?: string | null;
  busy?: boolean;
  /** A couple of real numbers, shown as a quiet line (value, then label). */
  stats: SectionStat[];
  /** Progress toward the next level gate: one segment per correct answer needed. */
  meter?: { value: number; goal: number; label: string };
  primary: { label: string; onClick?: () => void; href?: string };
  secondary?: { label: string; href: string };
  className?: string;
}

/**
 * A Practice section. The stage is the card's one saturated moment: the mode's colour, a soft light, and its
 * glyph as an app icon. Below it, a title, one line of copy, a quiet line of facts, the level gate and a
 * single pill action.
 */
export function SectionCard({ mode, level, recommended, blocked, busy, stats, meter, primary, secondary, className }: Props) {
  const meta = MODE_META[mode];
  const Glyph = MODE_GLYPH[mode];
  const segments = meter && meter.goal <= 14 ? meter.goal : 0;
  const pct = meter ? Math.min(100, Math.round((meter.value / Math.max(1, meter.goal)) * 100)) : 0;
  const locked = !!blocked;

  return (
    <article aria-label={meta.title} className={cn("pr-card", className)} style={{ "--pr-accent": meta.accent } as React.CSSProperties} data-locked={locked ? "true" : undefined}>
      <div className="pr-stage" aria-hidden="true">
        <span className="pr-stage-mark"><Glyph /></span>
        {level != null && <span className="pr-tag" data-side="left">{locked ? <LockIcon className="mr-1.5 h-3 w-3" /> : null}Level {level}</span>}
        {recommended && !locked && <span className="pr-tag" data-side="right">Recommended</span>}
        <span className="pr-icon"><Glyph /></span>
      </div>

      <div className="pr-body">
        <h2 className="pr-title">{meta.title}</h2>
        <p className="pr-dek">{meta.blurb}</p>

        {stats.length > 0 && (
          <dl className="pr-facts">
            {stats.slice(0, 3).map((s) => (
              <div key={s.label} className="flex items-baseline"><dd className="contents"><b>{s.value}</b></dd><dt>{s.label}</dt></div>
            ))}
          </dl>
        )}

        {meter && !locked && (
          <div className="pr-gate">
            <p className="pr-gate-label">{meter.label}</p>
            {segments > 0 ? (
              <div className="pr-segs" role="progressbar" aria-label={meter.label} aria-valuemin={0} aria-valuemax={meter.goal} aria-valuenow={meter.value}>
                {Array.from({ length: segments }, (_, i) => <i key={i} data-on={i < meter.value ? "true" : undefined} />)}
              </div>
            ) : (
              <div className="pr-track" role="progressbar" aria-label={meter.label} aria-valuemin={0} aria-valuemax={meter.goal} aria-valuenow={meter.value} style={{ "--pr-fill": meta.accent } as React.CSSProperties}><i style={{ width: `${pct}%` }} /></div>
            )}
          </div>
        )}

        <div className="pr-foot">
          {primary.href && !locked ? (
            <Link href={primary.href} className="pr-cta">{primary.label}</Link>
          ) : (
            <button type="button" className="pr-cta" onClick={primary.onClick} disabled={locked || busy}>
              {busy && <Spinner className="h-4 w-4" />}{busy ? "Preparing…" : primary.label}
            </button>
          )}
          {secondary && <Link href={secondary.href} className="pr-link">{secondary.label}</Link>}
        </div>
        {locked && <p className="pr-note" role="status">{blocked}</p>}
      </div>
    </article>
  );
}

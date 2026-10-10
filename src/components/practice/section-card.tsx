"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ModeBadge, ModeMotif, MODE_META, tint } from "./modes";
import type { ArenaMode } from "@/lib/practice/arena";
import { Spinner } from "@/components/ui/button";

export interface SectionStat { label: string; value: React.ReactNode }

interface Props {
  mode: ArenaMode;
  /** One-line reason the section can't start yet. */
  blocked?: string | null;
  busy?: boolean;
  stats: SectionStat[];
  /** A slim progress line under the stats. */
  meter?: { value: number; goal: number; label: string };
  primary: { label: string; onClick?: () => void; href?: string };
  secondary?: { label: string; href: string };
  className?: string;
}

const primaryBtn = "inline-flex h-11 items-center justify-center gap-2 rounded-full bg-gradient-to-b from-gold-strong to-gold-deep px-6 text-[15px] font-semibold text-on-gold shadow-[0_10px_22px_-10px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.32)] transition-all hover:brightness-110 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-45";
const ghostBtn = "inline-flex h-11 items-center justify-center rounded-full border border-ink/10 bg-ink/[0.035] px-5 text-[14.5px] font-medium text-ink backdrop-blur transition-all hover:bg-ink/[0.07] active:scale-[0.97]";

/**
 * A Practice section as one calm glass card: translucent surface, hairline border, a soft accent glow for
 * depth, and a single obvious action. Used for Time Machine and ICT Lab.
 */
export function SectionCard({ mode, blocked, busy, stats, meter, primary, secondary, className }: Props) {
  const meta = MODE_META[mode];
  const pct = meter ? Math.min(100, Math.round((meter.value / Math.max(1, meter.goal)) * 100)) : 0;
  return (
    <section
      aria-label={meta.title}
      className={cn("group relative isolate flex flex-col overflow-hidden rounded-[32px] border p-7 transition-all duration-500 ease-out hover:-translate-y-0.5 sm:p-8", className)}
      style={{
        borderColor: "color-mix(in srgb, var(--ink) 9%, transparent)",
        background: `linear-gradient(180deg, color-mix(in srgb, var(--raised) 78%, transparent) 0%, color-mix(in srgb, var(--surface) 62%, transparent) 100%)`,
        boxShadow: `inset 0 1px 0 rgb(255 255 255 / 0.55), 0 1px 2px rgb(0 0 0 / 0.04), 0 28px 56px -32px ${tint(meta.accent, 55)}`,
        backdropFilter: "blur(24px) saturate(1.4)",
        WebkitBackdropFilter: "blur(24px) saturate(1.4)",
      }}
    >
      {/* depth: a soft accent glow behind the glass */}
      <span aria-hidden className="pointer-events-none absolute -right-20 -top-28 -z-10 h-72 w-72 rounded-full blur-3xl transition-opacity duration-500 group-hover:opacity-100" style={{ background: tint(meta.accent, 26), opacity: 0.8 }} />
      <span aria-hidden className="pointer-events-none absolute -bottom-32 -left-16 -z-10 h-64 w-64 rounded-full blur-3xl" style={{ background: tint("var(--gold-strong)", 10), opacity: 0.7 }} />
      <ModeMotif mode={mode} />

      <ModeBadge mode={mode} size="lg" />

      <p className="mt-7 text-[11.5px] font-semibold uppercase tracking-[.16em]" style={{ color: tint(meta.accent, 80, "var(--ink)") }}>{meta.eyebrow}</p>
      <h2 className="mt-2 text-[34px] font-semibold leading-[1.02] tracking-[-0.035em] text-ink sm:text-[38px]">{meta.title}</h2>
      <p className="mt-3 max-w-[34ch] text-[15.5px] leading-snug text-muted">{meta.blurb}</p>

      <dl className="mt-7 grid grid-cols-3 divide-x divide-ink/10 rounded-[20px] border border-ink/[0.07] bg-ink/[0.025] py-3.5">
        {stats.slice(0, 3).map((s) => (
          <div key={s.label} className="px-4 first:pl-5">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[.12em] text-faint">{s.label}</dt>
            <dd className="kpi num mt-1 text-[22px] leading-none tracking-[-0.02em] text-ink">{s.value}</dd>
          </div>
        ))}
      </dl>

      {meter && (
        <div className="mt-5">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-label={meter.label} aria-valuemin={0} aria-valuemax={meter.goal} aria-valuenow={meter.value}>
            <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${pct}%`, background: `linear-gradient(90deg, ${tint(meta.accent, 70)}, ${meta.accent})` }} />
          </div>
          <p className="num mt-2 text-[12px] text-muted">{meter.label}</p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center gap-3 pt-8">
        {primary.href && !blocked ? (
          <Link href={primary.href} className={primaryBtn}>{primary.label}</Link>
        ) : (
          <button type="button" className={primaryBtn} onClick={primary.onClick} disabled={!!blocked || busy}>
            {busy && <Spinner className="h-4 w-4" />}{primary.label}
          </button>
        )}
        {secondary && <Link href={secondary.href} className={ghostBtn}>{secondary.label}</Link>}
      </div>
      {blocked && <p className="mt-3 text-[12.5px] text-muted">{blocked}</p>}
    </section>
  );
}

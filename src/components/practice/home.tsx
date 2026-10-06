"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { PrimaryButton, QuietButton } from "@/components/journal/flow-ui";
import type { ArenaMode } from "@/lib/practice/arena";
import type { XpLevel } from "@/lib/practice/xp";
import { MODE_META, ModeBadge, tint } from "./modes";
import { Bar, Eyebrow, GateMeter, surface } from "./ui";

/** Who you are in the academy: rank, level, streak and accuracy — read at a glance, never a dashboard. */
export function AcademyStrip({ rank, level, streak, accuracy }: { rank: string; level: XpLevel; streak: number; accuracy: number | null }) {
  return (
    <section className={cn(surface.editorial, "grid gap-6 px-6 py-5 sm:grid-cols-[1.4fr_1fr] sm:items-center sm:px-7")} aria-label="Your training status">
      <div className="min-w-0">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{rank} <span className="font-normal text-muted">· Level {level.level}</span></p>
          <p className="num text-[12px] text-faint">{level.into} / {level.need} XP</p>
        </div>
        <Bar value={level.pct} className="mt-3" />
      </div>
      <dl className="grid grid-cols-2 gap-4 sm:border-l sm:border-line sm:pl-7">
        <div>
          <dt><Eyebrow>Streak</Eyebrow></dt>
          <dd className="kpi mt-1 text-[22px] tabular-nums text-ink">{streak}<span className="ml-1 text-[13px] font-normal text-muted">{streak === 1 ? "day" : "days"}</span></dd>
        </div>
        <div>
          <dt><Eyebrow>Accuracy</Eyebrow></dt>
          <dd className="kpi mt-1 text-[22px] tabular-nums text-ink">{accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`}</dd>
        </div>
      </dl>
    </section>
  );
}

/** The one-tap answer to "what should I train?" — chosen by the coach, never a setting. */
export function SessionHero({ mode, level, reason, meter, busy, onStart }: { mode: ArenaMode; level: number; reason: string; meter: { value: number; goal: number; accuracy: number; nextLevel: number }; busy: boolean; onStart: () => void }) {
  const meta = MODE_META[mode];
  return (
    <section className={cn("relative overflow-hidden rounded-[28px]", surface.material)} aria-label="Recommended session">
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(90% 140% at 0% 0%, ${tint(meta.accent, 13)}, transparent 60%)` }} />
      <div className="relative flex flex-col gap-6 p-7 sm:flex-row sm:items-center sm:justify-between sm:p-8">
        <div className="flex min-w-0 items-center gap-5">
          <ModeBadge mode={mode} size="lg" />
          <div className="min-w-0">
            <Eyebrow>Up next for you</Eyebrow>
            <h2 className="mt-1.5 text-[26px] font-semibold leading-none tracking-[-0.025em] text-ink sm:text-[30px]">{meta.title} <span className="font-normal text-muted">· Level {level}</span></h2>
            <p className="mt-2 max-w-[44ch] text-[14.5px] leading-snug text-muted">{reason}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-4 sm:w-[260px]">
          <GateMeter value={meter.value} goal={meter.goal} accent={meta.accent} variant={mode === "boss" ? "boss" : "fill"} needAccuracy={meter.accuracy} nextLevel={meter.nextLevel} />
          <PrimaryButton onClick={onStart} loading={busy}>Start round</PrimaryButton>
        </div>
      </div>
    </section>
  );
}

/** Shown while the round is being written. Takes the mode's identity so the wait already feels like the game. */
export function PreparingScreen({ mode, onCancel }: { mode: ArenaMode; onCancel: () => void }) {
  const reduce = useReducedMotion();
  const meta = MODE_META[mode];
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-canvas/95 backdrop-blur-sm" role="status" aria-live="polite">
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(50% 40% at 50% 42%, ${tint(meta.accent, 12)}, transparent)` }} />
      <div className="relative text-center">
        <motion.div animate={reduce ? undefined : { scale: [1, 1.06, 1] }} transition={{ duration: 1.6, repeat: Infinity, ease: "easeInOut" }} className="mx-auto w-fit"><ModeBadge mode={mode} size="lg" /></motion.div>
        <p className="mt-6 text-[22px] font-semibold tracking-[-0.02em] text-ink">Writing your {meta.title} round</p>
        <p className="mt-1.5 text-[14px] text-muted">From your trades and saved charts.</p>
        <div className="mt-5"><QuietButton onClick={onCancel}>Cancel</QuietButton></div>
      </div>
    </div>
  );
}

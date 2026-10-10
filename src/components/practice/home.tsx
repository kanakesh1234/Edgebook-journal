"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { PrimaryButton, QuietButton } from "@/components/journal/flow-ui";
import type { ArenaMode } from "@/lib/practice/arena";
import { MODE_META, ModeBadge, tint } from "./modes";
import { Eyebrow, GateMeter, surface } from "./ui";

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
      <div aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(46% 38% at 50% 42%, ${tint(meta.accent, 14)}, transparent)` }} />
      <div className="relative px-6 text-center">
        <div className="relative mx-auto grid h-24 w-24 place-items-center">
          {!reduce && <motion.span aria-hidden className="absolute inset-0 rounded-[28px]" style={{ border: `1px solid ${tint(meta.accent, 45)}` }} animate={{ scale: [1, 1.5], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />}
          <motion.div animate={reduce ? undefined : { scale: [1, 1.05, 1] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeInOut" }}><ModeBadge mode={mode} size="lg" /></motion.div>
        </div>
        <p className="mt-7 text-[22px] font-semibold tracking-[-0.025em] text-ink">Writing your {meta.title} round</p>
        <p className="mt-1.5 text-[14.5px] text-muted">Built from your trades and saved charts.</p>
        <div className="mt-6"><QuietButton onClick={onCancel}>Cancel</QuietButton></div>
      </div>
    </div>
  );
}

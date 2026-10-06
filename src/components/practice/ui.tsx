"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { IconCheck } from "@/components/journal/flow-ui";
import { tint } from "./modes";

/**
 * Practice surfaces, following the same rules as Plan Trade:
 *   editorial — quiet solid paper for anything you READ (headlines, stats, review)
 *   material  — a touch of depth for anything you TOUCH (answers, mode cards, the readout)
 *   glass     — controls only (see `glass` in journal/flow-ui)
 */
export const surface = {
  editorial: "rounded-[22px] border border-line bg-surface",
  material:
    "border border-line bg-gradient-to-b from-raised to-surface " +
    "shadow-[inset_0_1px_0_rgb(255_255_255/0.55),0_1px_2px_rgb(48_40_24/0.06)] " +
    "dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.05),0_1px_2px_rgb(0_0_0/0.35)]",
  lift: "transition-all duration-200 hover:-translate-y-0.5 hover:border-line-strong hover:shadow-[0_14px_30px_-16px_rgb(48_40_24/0.28)] dark:hover:shadow-[0_16px_34px_-16px_rgb(0_0_0/0.6)]",
} as const;

export const Eyebrow = ({ children, className }: { children: React.ReactNode; className?: string }) => (
  <p className={cn("text-[11px] font-semibold uppercase tracking-[.16em] text-faint", className)}>{children}</p>
);

/* -------------------------------- stats -------------------------------- */

export function StatTile({ label, value, note, tone }: { label: string; value: React.ReactNode; note?: string; tone?: "profit" | "loss" }) {
  return (
    <div className={cn(surface.editorial, "px-5 py-4")}>
      <Eyebrow>{label}</Eyebrow>
      <p className={cn("kpi mt-2 text-[28px] tabular-nums", tone === "profit" && "text-profit", tone === "loss" && "text-loss", !tone && "text-ink")}>{value}</p>
      {note && <p className="mt-1 text-[12px] text-muted">{note}</p>}
    </div>
  );
}

/** A thin determinate bar for XP, accuracy and mastery. */
export function Bar({ value, accent = "var(--gold-strong)", className }: { value: number; accent?: string; className?: string }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={cn("h-1.5 overflow-hidden rounded-full bg-ink/[0.07]", className)} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
      <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: accent }} />
    </div>
  );
}

/* ------------------------------ timer ring ------------------------------ */

const RING = 2 * Math.PI * 17;

/** The round clock: a ring that drains, with the seconds in the middle. Turns red for the last ten. */
export function TimerRing({ fraction, seconds, low, paused }: { fraction: number; seconds: number; low: boolean; paused: boolean }) {
  const reduce = useReducedMotion();
  const f = Math.max(0, Math.min(1, fraction));
  return (
    <div className="relative grid h-11 w-11 place-items-center" role="timer" aria-label={paused ? "Paused" : `${seconds} seconds left`}>
      <svg viewBox="0 0 40 40" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="20" cy="20" r="17" fill="none" stroke="var(--line)" strokeWidth="3" />
        <circle
          cx="20" cy="20" r="17" fill="none" strokeWidth="3" strokeLinecap="round"
          stroke={low ? "var(--loss)" : "var(--gold-strong)"}
          strokeDasharray={RING} strokeDashoffset={RING * (1 - f)}
          style={{ transition: "stroke-dashoffset 120ms linear, stroke 200ms" }}
        />
      </svg>
      <motion.span
        animate={low && !paused && !reduce ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={low ? { duration: 1, repeat: Infinity } : undefined}
        className={cn("num text-[13px]", low && !paused ? "text-loss" : "text-ink")}
      >
        {paused ? "II" : seconds}
      </motion.span>
    </div>
  );
}

/* ------------------------------ gate meter ------------------------------ */

/**
 * Progress toward clearing the level. The same meter, two meanings:
 *   fill  — correct answers filling up toward the gate (every mode)
 *   boss  — a health bar that drains as correct answers land (Weekend Boss)
 * Accuracy matters for the gate too, so it is shown quietly once there is enough to judge.
 */
export function GateMeter({ value, goal, accent, variant = "fill", accuracy, needAccuracy, nextLevel }: { value: number; goal: number; accent: string; variant?: "fill" | "boss"; accuracy?: number | null; needAccuracy?: number; nextLevel: number }) {
  const done = value >= goal;
  const segments = goal <= 12 ? goal : 0;
  const ratio = Math.min(1, value / Math.max(1, goal));
  const hp = 1 - ratio;
  const off = accuracy != null && needAccuracy != null && accuracy < needAccuracy;
  const label = variant === "boss" ? (done ? "Boss down" : `Boss · ${goal - value} to go`) : done ? `Level ${nextLevel} unlocked — keep going for XP` : `${value} of ${goal} to reach Level ${nextLevel}`;

  return (
    <div className="min-w-0 flex-1">
      <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[12px]">
        <span className={cn("truncate font-medium", done ? "text-profit" : "text-muted")}>{label}</span>
        {accuracy != null && needAccuracy != null && (
          <span className={cn("num shrink-0 text-[11.5px]", off ? "text-loss" : "text-faint")}>
            {Math.round(accuracy * 100)}% · needs {Math.round(needAccuracy * 100)}%
          </span>
        )}
      </div>
      {segments > 0 && variant === "fill" ? (
        <div className="flex gap-1" aria-hidden>
          {Array.from({ length: segments }, (_, i) => (
            <span key={i} className="h-1.5 flex-1 rounded-full transition-colors duration-300" style={{ background: i < value ? accent : "color-mix(in srgb, var(--ink) 8%, transparent)" }} />
          ))}
        </div>
      ) : (
        <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" aria-hidden>
          <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${(variant === "boss" ? hp : ratio) * 100}%`, background: accent }} />
        </div>
      )}
    </div>
  );
}

/* ----------------------------- answer tiles ----------------------------- */

export type TileState = "idle" | "right" | "wrong" | "dim";

const Cross = () => (
  <svg viewBox="0 0 24 24" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden><path d="M7 7l10 10M17 7 7 17" /></svg>
);

/** One multiple-choice answer. The key cap doubles as the result marker. */
export function AnswerTile({ index, label, state, onClick, accent, compact }: { index: number; label: string; state: TileState; onClick: () => void; accent: string; compact?: boolean }) {
  const reduce = useReducedMotion();
  const idle = state === "idle";
  return (
    <motion.button
      type="button"
      disabled={!idle}
      onClick={onClick}
      animate={state === "wrong" && !reduce ? { x: [0, -6, 6, -4, 4, 0] } : { x: 0 }}
      transition={{ duration: 0.32 }}
      whileTap={idle && !reduce ? { scale: 0.985 } : undefined}
      className={cn(
        "group flex w-full items-center gap-4 rounded-[18px] border text-left transition-[border-color,background-color,box-shadow,opacity,transform] duration-150",
        compact ? "min-h-[56px] px-4 py-3 text-[16px]" : "min-h-[60px] px-5 py-3.5 text-[17px]",
        idle && cn(surface.material, "hover:-translate-y-px hover:border-line-strong active:translate-y-0"),
        state === "right" && "border-profit/55 bg-profit/[0.09] text-ink",
        state === "wrong" && "border-loss/55 bg-loss/[0.09] text-ink",
        state === "dim" && "border-line bg-surface opacity-45",
      )}
    >
      <span
        className={cn("grid h-7 w-7 shrink-0 place-items-center rounded-full text-[12px] font-semibold transition-colors duration-150", state === "right" && "bg-profit text-canvas", state === "wrong" && "bg-loss text-canvas")}
        style={idle || state === "dim" ? { background: tint(accent, 12, "var(--raised)"), color: tint(accent, 70, "var(--ink)"), border: `1px solid ${tint(accent, 26)}` } : undefined}
      >
        {state === "right" ? <IconCheck className="h-3.5 w-3.5" /> : state === "wrong" ? <Cross /> : index + 1}
      </span>
      <span className="min-w-0 leading-snug">{label}</span>
    </motion.button>
  );
}

"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { XpLevel } from "@/lib/practice/xp";
import { FlameIcon, SnowIcon } from "./icons";
import { CountUp } from "./celebrate";
import { Eyebrow, surface } from "./ui";
import { tint } from "./modes";

export interface WeekDay { key: string; letter: string; trained: boolean; today: boolean; future: boolean }

const RING = 2 * Math.PI * 36;

/** The level ring: your level in the middle, progress to the next one drawn around it. */
export function LevelRing({ level, size = 84 }: { level: XpLevel; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Level ${level.level}, ${level.into} of ${level.need} XP`}>
      <svg viewBox="0 0 84 84" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="42" cy="42" r="36" fill="none" stroke="var(--line)" strokeWidth="5" />
        <motion.circle
          cx="42" cy="42" r="36" fill="none" strokeWidth="5" strokeLinecap="round" stroke="url(#lvl-grad)"
          strokeDasharray={RING} initial={{ strokeDashoffset: reduce ? RING * (1 - level.pct / 100) : RING }} animate={{ strokeDashoffset: RING * (1 - level.pct / 100) }} transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs><linearGradient id="lvl-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--gold-strong)" /><stop offset="1" stopColor="var(--gold-deep)" /></linearGradient></defs>
      </svg>
      <div className="text-center leading-none">
        <p className="text-[9.5px] font-semibold uppercase tracking-[.14em] text-faint">Level</p>
        <p className="kpi mt-0.5 text-[28px] tabular-nums text-ink">{level.level}</p>
      </div>
    </div>
  );
}

/** Seven days, Monday first. Trained days light up; the streak flame sits beside it. */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <ol className="flex items-center gap-1.5" aria-label="This week">
      {days.map((d) => (
        <li key={d.key} className="flex flex-col items-center gap-1.5">
          <span
            aria-label={`${d.key}: ${d.trained ? "practised" : d.future ? "upcoming" : "no practice"}`}
            className={cn("grid h-7 w-7 place-items-center rounded-full text-[10.5px] font-semibold transition-colors", d.today && !d.trained && "ring-[1.5px] ring-gold-strong ring-offset-2 ring-offset-surface", d.future && "text-faint/50")}
            style={d.trained ? { background: "linear-gradient(180deg, var(--gold-strong), var(--gold-deep))", color: "var(--on-gold)", boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.3)" } : { background: "color-mix(in srgb, var(--ink) 6%, transparent)", color: d.future ? undefined : "var(--faint)" }}
          >
            {d.trained ? <FlameIcon className="h-3.5 w-3.5" /> : d.letter}
          </span>
        </li>
      ))}
    </ol>
  );
}

interface Props { rank: string; level: XpLevel; streak: number; freezeDays: number; accuracy: number | null; todayXp: number; goal: number; week: WeekDay[] }

/** Who you are in the academy — level, rank, today's goal, streak and accuracy — in one calm card. */
export function PlayerHero({ rank, level, streak, freezeDays, accuracy, todayXp, goal, week }: Props) {
  const goalPct = Math.min(100, Math.round((todayXp / Math.max(1, goal)) * 100));
  const hit = todayXp >= goal;
  return (
    <section className={cn("relative overflow-hidden rounded-[28px]", surface.material)} aria-label="Your training status">
      <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: `radial-gradient(80% 120% at 0% 0%, ${tint("var(--gold-strong)", 12)}, transparent 60%)` }} />
      <div className="relative grid gap-7 p-6 sm:p-7 lg:grid-cols-[1.15fr_1fr] lg:items-center">
        <div className="flex items-center gap-5">
          <LevelRing level={level} />
          <div className="min-w-0 flex-1">
            <p className="text-[22px] font-semibold leading-none tracking-[-0.02em] text-ink">{rank}</p>
            <p className="num mt-1.5 text-[13px] text-muted"><CountUp value={level.into} /> / {level.need} XP to Level {level.level + 1}</p>
            <div className="mt-3.5">
              <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                <span className={cn("font-medium", hit ? "text-profit" : "text-muted")}>{hit ? "Daily goal reached" : "Daily goal"}</span>
                <span className="num text-faint">{Math.min(todayXp, 9999)} / {goal} XP</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-label="Daily XP goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalPct}>
                <div className="h-full rounded-full transition-[width] duration-700 ease-out" style={{ width: `${goalPct}%`, background: hit ? "var(--profit)" : "linear-gradient(90deg, var(--gold-strong), var(--gold-deep))" }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:border-l lg:border-line lg:pl-7">
          <div className="flex items-end justify-between gap-4">
            <div className="flex items-center gap-3">
              <span className={cn("grid h-11 w-11 place-items-center rounded-[14px]", streak > 0 ? "text-on-gold" : "bg-ink/[0.06] text-faint")} style={streak > 0 ? { background: "linear-gradient(150deg, var(--gold-strong), var(--gold-deep))", boxShadow: "0 6px 14px -6px var(--gold-strong), inset 0 1px 0 rgb(255 255 255 / 0.3)" } : undefined}>
                <FlameIcon className="h-6 w-6" />
              </span>
              <div>
                <p className="kpi text-[26px] leading-none tabular-nums text-ink">{streak}<span className="ml-1 text-[13px] font-normal text-muted">{streak === 1 ? "day streak" : "day streak"}</span></p>
                <p className="mt-1 flex items-center gap-1 text-[12px] text-muted">
                  <SnowIcon className="h-3.5 w-3.5" />{freezeDays > 0 ? `${freezeDays} streak freeze ready` : "No freeze left"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <Eyebrow>Accuracy</Eyebrow>
              <p className="kpi mt-1 text-[22px] tabular-nums text-ink">{accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`}</p>
            </div>
          </div>
          <WeekStrip days={week} />
        </div>
      </div>
    </section>
  );
}

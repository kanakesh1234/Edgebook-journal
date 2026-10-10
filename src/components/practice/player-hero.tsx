"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { XpLevel } from "@/lib/practice/xp";
import { addDays, parseDateKey } from "@/lib/format";
import { FlameIcon, SnowIcon } from "./icons";
import { CountUp } from "./celebrate";
import "./practice.css";

export interface WeekDay { key: string; letter: string; trained: boolean; today: boolean; future: boolean }

const RING = 2 * Math.PI * 36;
const LETTERS = ["M", "T", "W", "T", "F", "S", "S"] as const;

/** Monday-first week containing `today`, with the days you practised marked. Dates are YYYY-MM-DD keys. */
export function weekStrip(today: string, trained: Iterable<string>): WeekDay[] {
  const done = new Set(trained);
  const dow = (parseDateKey(today).getDay() + 6) % 7; // Monday = 0
  const monday = addDays(today, -dow);
  return LETTERS.map((letter, i) => {
    const key = addDays(monday, i);
    return { key, letter, trained: done.has(key), today: key === today, future: key > today };
  });
}

/** The level ring: your level in the middle, progress to the next one drawn around it. */
export function LevelRing({ level, size = 92 }: { level: XpLevel; size?: number }) {
  const reduce = useReducedMotion();
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }} role="img" aria-label={`Level ${level.level}, ${level.into} of ${level.need} XP`}>
      <svg viewBox="0 0 84 84" className="absolute inset-0 -rotate-90" aria-hidden>
        <circle cx="42" cy="42" r="36" fill="none" stroke="var(--line)" strokeWidth="5" />
        <motion.circle
          cx="42" cy="42" r="36" fill="none" strokeWidth="5" strokeLinecap="round" stroke="url(#pr-lvl-grad)"
          strokeDasharray={RING} initial={{ strokeDashoffset: reduce ? RING * (1 - level.pct / 100) : RING }} animate={{ strokeDashoffset: RING * (1 - level.pct / 100) }} transition={{ duration: 1.1, ease: [0.16, 1, 0.3, 1] }}
        />
        <defs><linearGradient id="pr-lvl-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="var(--gold-strong)" /><stop offset="1" stopColor="var(--gold-deep)" /></linearGradient></defs>
      </svg>
      <div className="text-center">
        <p className="text-[11px] font-medium leading-none text-faint">Level</p>
        <p className="pr-ring-num mt-1">{level.level}</p>
      </div>
    </div>
  );
}

/** Seven days, Monday first. Practised days light up gold; today is outlined. */
export function WeekStrip({ days }: { days: WeekDay[] }) {
  return (
    <ol className="grid grid-cols-7 gap-1.5" aria-label="This week">
      {days.map((d) => (
        <li key={d.key} className="flex justify-center">
          <span
            className="pr-day"
            data-on={d.trained ? "true" : undefined}
            data-today={d.today && !d.trained ? "true" : undefined}
            data-future={d.future ? "true" : undefined}
            aria-label={`${d.key}: ${d.trained ? "practised" : d.future ? "upcoming" : "no practice"}`}
          >
            {d.trained ? <FlameIcon className="h-4 w-4" /> : d.letter}
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
    <section className="pr-surface pr-hero" aria-label="Your training status">
      <div className="pr-hero-grid">
        <div className="flex items-center gap-5 sm:gap-6">
          <LevelRing level={level} />
          <div className="min-w-0 flex-1">
            <p className="pr-rank">{rank}</p>
            <p className="pr-sub mt-1.5"><CountUp value={level.into} /> of {level.need} XP to Level {level.level + 1}</p>
            <div className="mt-4">
              <div className="mb-2 flex items-baseline justify-between gap-3 text-[13px]">
                <span className={cn("font-medium", hit ? "pr-goal-hit" : "text-muted")}>{hit ? "Daily goal reached" : "Daily goal"}</span>
                <span className="tabular-nums text-faint">{Math.min(todayXp, 9999)} / {goal} XP</span>
              </div>
              <div className="pr-track" role="progressbar" aria-label="Daily XP goal" aria-valuemin={0} aria-valuemax={100} aria-valuenow={goalPct} style={{ "--pr-fill": hit ? "var(--profit)" : "var(--gold-strong)" } as React.CSSProperties}>
                <i style={{ width: `${goalPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <span className="pr-flame" data-lit={streak > 0 ? "true" : undefined}><FlameIcon className="h-6 w-6" /></span>
              <div>
                <p className="text-[26px] font-semibold leading-none tracking-[-0.025em] tabular-nums text-ink">{streak}<span className="ml-1.5 text-[13px] font-normal tracking-normal text-muted">{streak === 1 ? "day streak" : "day streak"}</span></p>
                <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-muted"><SnowIcon className="h-3.5 w-3.5" />{freezeDays > 0 ? `${freezeDays} streak freeze ready` : "No freeze left"}</p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-[12px] text-faint">Accuracy</p>
              <p className="mt-1 text-[22px] font-semibold leading-none tracking-[-0.02em] tabular-nums text-ink">{accuracy == null ? "—" : `${Math.round(accuracy * 100)}%`}</p>
            </div>
          </div>
          <WeekStrip days={week} />
        </div>
      </div>
    </section>
  );
}

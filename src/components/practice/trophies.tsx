"use client";

import { cn } from "@/lib/utils";
import type { AchievementState } from "@/lib/practice/achievements";
import { RECORD_LABELS, type RecordKey, type Records } from "@/lib/practice/records";
import { ACHIEVEMENT_ICON, LockIcon } from "./icons";
import { Bar, Eyebrow, StatTile, surface } from "./ui";
import { tint } from "./modes";

const TIER_NAME = ["", "Bronze", "Silver", "Gold"] as const;
const TIER_MIX = [0, 30, 52, 78] as const;

/** One medal. Unlocked ones are tinted by tier; locked ones show how close you are. */
export function AchievementBadge({ state, fresh }: { state: AchievementState; fresh?: boolean }) {
  const Icon = ACHIEVEMENT_ICON[state.icon];
  const mix = TIER_MIX[state.tier];
  return (
    <li className={cn(surface.editorial, "flex items-center gap-3.5 px-4 py-3.5", state.unlocked ? "" : "opacity-90", fresh && "ring-2 ring-gold-strong/60")}>
      <span
        className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[14px] p-2.5", !state.unlocked && "bg-ink/[0.06] text-faint")}
        style={state.unlocked ? { background: `linear-gradient(150deg, ${tint("var(--gold-strong)", mix, "var(--raised)")}, ${tint("var(--gold-deep)", mix * 0.6, "var(--raised)")})`, color: state.tier === 3 ? "var(--on-gold)" : tint("var(--gold-deep)", 80, "var(--ink)"), border: `1px solid ${tint("var(--gold-strong)", 45)}`, boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.4)" } : undefined}
      >
        {state.unlocked ? <Icon className="h-full w-full" /> : <LockIcon className="h-full w-full" />}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[14.5px] font-semibold tracking-[-0.01em] text-ink">{state.title}</p>
          <span className="shrink-0 text-[10.5px] font-semibold uppercase tracking-[.1em] text-faint">{TIER_NAME[state.tier]}</span>
        </div>
        <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{state.blurb}</p>
        {!state.unlocked && (
          <div className="mt-2 flex items-center gap-2.5">
            <Bar value={(state.current / state.target) * 100} className="flex-1" />
            <span className="num text-[11px] text-faint">{state.current.toLocaleString()} / {state.target.toLocaleString()}</span>
          </div>
        )}
        {state.unlocked && state.on && <p className="num mt-1 text-[11px] text-faint">Unlocked {state.on}</p>}
      </div>
    </li>
  );
}

export function AchievementGrid({ states, fresh = [], limit }: { states: AchievementState[]; fresh?: string[]; limit?: number }) {
  const list = limit ? states.slice(0, limit) : states;
  return <ul className="grid gap-3 sm:grid-cols-2">{list.map((s) => <AchievementBadge key={s.id} state={s} fresh={fresh.includes(s.id)} />)}</ul>;
}

/** Closest-to-unlocking first, so Home always shows what is within reach. */
export const nextUp = (states: AchievementState[], n: number) => states.filter((s) => !s.unlocked).sort((a, b) => b.current / b.target - a.current / a.target).slice(0, n);

const fmt: Record<RecordKey, (n: number) => string> = {
  bestStreak: (n) => `${n} ${n === 1 ? "day" : "days"}`, bestCombo: (n) => `×${n}`, bestAccuracy: (n) => `${Math.round(n * 100)}%`, bestRoundXp: (n) => `${n} XP`, bestCorrect: (n) => String(n),
};

export function RecordsGrid({ records, fresh = [] }: { records: Records; fresh?: RecordKey[] }) {
  const keys = Object.keys(RECORD_LABELS) as RecordKey[];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {keys.map((k) => (
        <div key={k} className={cn(fresh.includes(k) && "rounded-[22px] ring-2 ring-gold-strong/60")}>
          <StatTile label={RECORD_LABELS[k]} value={records[k] > 0 ? fmt[k](records[k]) : "—"} note={fresh.includes(k) ? "New record" : undefined} />
        </div>
      ))}
      <StatTile label="Rounds played" value={records.rounds} />
    </div>
  );
}

export { Eyebrow };

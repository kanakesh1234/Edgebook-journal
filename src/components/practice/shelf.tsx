"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { btnPrimary } from "@/components/lessons/buttons";
import { haptic } from "@/lib/haptics";
import { CHEST_REWARD, type QuestState } from "@/lib/practice/quests";
import type { AchievementState } from "@/lib/practice/achievements";
import type { ArenaMode } from "@/lib/practice/arena";
import { Spinner } from "@/components/ui/button";
import { ACHIEVEMENT_ICON, CheckIcon, GiftIcon, LockIcon } from "./icons";
import { Burst } from "./celebrate";
import { MODE_META, ModeBadge } from "./modes";
import "./practice.css";

/* ------------------------------ Up next ------------------------------ */

/** The one-tap answer to "what should I train?" — picked by the coach, never a setting. Same shape as Lessons' "Continue reading". */
export function UpNext({ mode, level, reason, meter, busy, onStart }: { mode: ArenaMode; level: number; reason: string; meter: { value: number; goal: number }; busy: boolean; onStart: () => void }) {
  const meta = MODE_META[mode];
  const pct = Math.min(100, Math.round((meter.value / Math.max(1, meter.goal)) * 100));
  return (
    <section className="pr-next" aria-label="Recommended session">
      <ModeBadge mode={mode} size="md" />
      <div className="min-w-0 flex-1">
        <span className="pr-next-kicker">Up next for you</span>
        <p className="mt-0.5 truncate text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink">{meta.title} <span className="font-normal text-muted">· Level {level}</span></p>
        <p className="mt-0.5 line-clamp-2 text-[13.5px] leading-snug text-muted">{reason}</p>
        <span className="mt-2.5 flex items-center gap-3">
          <span className="pr-track flex-1" style={{ "--pr-fill": meta.accent } as React.CSSProperties} aria-hidden="true"><i style={{ width: `${pct}%` }} /></span>
          <span className="shrink-0 text-[12px] tabular-nums text-muted">{meter.value} of {meter.goal}</span>
        </span>
      </div>
      <button type="button" className={cn(btnPrimary, "shrink-0")} onClick={onStart} disabled={busy}>
        {busy ? <Spinner className="h-4 w-4" /> : null}
        <span>{busy ? "Preparing…" : "Start"}</span>
      </button>
    </section>
  );
}

/* ----------------------------- Challenges ----------------------------- */

/** Today's three challenges. Finished ones can be claimed for bonus XP; claim all three to open the daily chest. */
export function Challenges({ quests, chestClaimed, onClaim }: { quests: QuestState[]; chestClaimed: boolean; onClaim: (id: string) => void }) {
  const reduce = useReducedMotion();
  const [burst, setBurst] = useState(0);
  const done = quests.filter((q) => q.done).length;
  const allClaimed = quests.length > 0 && quests.every((q) => q.claimed);
  const chestReady = allClaimed && !chestClaimed;

  return (
    <section className="pr-surface relative p-5 sm:p-6" aria-labelledby="pr-challenges">
      {burst > 0 && <Burst key={burst} colors={["var(--gold-strong)", "var(--gold-deep)", "var(--profit)", "var(--info)"]} count={44} />}
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pr-challenges" className="pr-heading">Today’s challenges</h2>
        <p className="pr-sub">{done} of {quests.length} done</p>
      </div>

      <ul className="mt-2">
        {quests.map((q) => {
          const pct = Math.min(100, Math.round((q.value / q.target) * 100));
          return (
            <li key={q.id} className="pr-quest">
              <span className="pr-tick" data-done={q.done ? "true" : undefined}>
                {q.done ? <motion.span initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}><CheckIcon className="h-4 w-4" /></motion.span> : `${pct}%`}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[14.5px] font-medium tracking-[-0.01em]", q.claimed ? "text-muted line-through decoration-muted/40" : "text-ink")}>{q.title}</p>
                <div className="mt-2 flex items-center gap-3">
                  <div className="pr-track flex-1" role="progressbar" aria-label={q.title} aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={Math.min(q.value, q.target)} style={{ "--pr-fill": q.done ? "var(--profit)" : "var(--gold-strong)" } as React.CSSProperties}><i style={{ width: `${pct}%` }} /></div>
                  <span className="w-[52px] shrink-0 text-right text-[12px] tabular-nums text-faint">{Math.min(q.value, q.target)} / {q.target}</span>
                </div>
              </div>
              {q.done && !q.claimed ? (
                <button type="button" className="pr-claim" data-ready="true" onClick={() => { haptic.success(); onClaim(q.id); }}>Claim +{q.reward}</button>
              ) : (
                <span className={cn("w-[62px] shrink-0 text-right text-[12.5px] tabular-nums", q.claimed ? "font-medium text-profit" : "text-faint")}>{q.claimed ? "Claimed" : `+${q.reward} XP`}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className="pr-chest" data-ready={chestReady ? "true" : undefined} data-open={chestClaimed ? "true" : undefined}>
        <span className="pr-chest-icon"><GiftIcon className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">Daily chest</p>
          <p className="text-[12.5px] leading-snug text-muted">{chestClaimed ? "Opened today. See you tomorrow." : allClaimed ? "All claimed. Open it." : "Claim all three to open it."}</p>
        </div>
        {chestReady ? (
          <button type="button" className="pr-claim" data-ready="true" onClick={() => { haptic.success(); setBurst((n) => n + 1); onClaim("chest"); }}>Open +{CHEST_REWARD}</button>
        ) : (
          <span className="text-[12.5px] tabular-nums text-faint">{chestClaimed ? "Done" : `+${CHEST_REWARD} XP`}</span>
        )}
      </div>
    </section>
  );
}

/* ------------------------------ Trophies ------------------------------ */

const TIER = ["", "Bronze", "Silver", "Gold"] as const;

/**
 * A short case, not the whole wall: rare (gold) trophies you've earned first, then whatever is closest to
 * unlocking. Anything earned today gets a gold edge. The full list lives on the progress page.
 */
export function TrophyCase({ states, today, limit = 4 }: { states: AchievementState[]; today: string; limit?: number }) {
  const earned = states.filter((s) => s.unlocked);
  const rare = earned.filter((s) => s.tier === 3).sort((a, b) => (b.on ?? "").localeCompare(a.on ?? ""));
  const recent = earned.filter((s) => s.tier !== 3).sort((a, b) => (b.on ?? "").localeCompare(a.on ?? ""));
  const near = states.filter((s) => !s.unlocked).sort((a, b) => b.current / b.target - a.current / a.target);
  const shown = [...rare.slice(0, 2), ...recent.slice(0, 1), ...near].slice(0, limit);

  return (
    <section className="pr-surface p-5 sm:p-6" aria-labelledby="pr-trophies">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="pr-trophies" className="pr-heading">Trophies</h2>
        <p className="pr-sub">{earned.length} of {states.length}</p>
      </div>

      <ul className="pr-trophies mt-4">
        {shown.map((s) => {
          const Icon = ACHIEVEMENT_ICON[s.icon];
          const fresh = s.unlocked && s.on === today;
          return (
            <li key={s.id} className="pr-trophy" data-rare={s.unlocked && s.tier === 3 ? "true" : undefined} data-fresh={fresh ? "true" : undefined}>
              <span className="pr-medal" data-tier={s.unlocked ? s.tier : undefined}>{s.unlocked ? <Icon className="h-full w-full" /> : <LockIcon className="h-full w-full" />}</span>
              <div className="min-w-0">
                <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">{s.title}</p>
                <p className="mt-0.5 line-clamp-2 text-[12.5px] leading-snug text-muted">{s.blurb}</p>
              </div>
              {s.unlocked ? (
                <p className="mt-auto text-[12px] font-medium text-gold-deep dark:text-gold">{fresh ? "Unlocked today" : TIER[s.tier]}</p>
              ) : (
                <div className="mt-auto flex items-center gap-2.5">
                  <div className="pr-track flex-1" aria-hidden="true"><i style={{ width: `${Math.round((s.current / s.target) * 100)}%` }} /></div>
                  <span className="text-[11.5px] tabular-nums text-faint">{s.current.toLocaleString()}/{s.target.toLocaleString()}</span>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

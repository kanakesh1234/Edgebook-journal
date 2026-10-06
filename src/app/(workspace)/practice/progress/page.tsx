"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { addDays, todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { displayStreak, rankOf } from "@/lib/practice/engine";
import { xpLevel } from "@/lib/practice/xp";
import { ARENA_MODES, arenaLevels } from "@/lib/practice/arena";
import { modeStats, overallAccuracy } from "@/lib/practice/coach";
import { AcademyStrip } from "@/components/practice/home";
import { MODE_META, ModeBadge } from "@/components/practice/modes";
import { Bar, Eyebrow, surface } from "@/components/practice/ui";

const humanise = (tag: string) => tag.replace(/[-_:]+/g, " ").replace(/^\w/, (c) => c.toUpperCase());

export default function PracticeProgressPage() {
  const settings = useApp((state) => state.settings);
  const progress = settings.practiceProgress ?? { xp: 0, streak: 0, freezeDays: 1 };
  const matrix = settings.matrixProgress;
  const today = todayKey();
  const levels = arenaLevels(progress);

  const days = useMemo(() => Array.from({ length: 28 }, (_, index) => addDays(today, index - 27)), [today]);
  const done = new Set(progress.completedMissionDates ?? []);
  const doneCount = days.filter((d) => done.has(d)).length;

  const skills = useMemo(() => Object.entries(progress.masteryByTag ?? {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 8), [progress.masteryByTag]);
  const topSkill = skills[0]?.[1] ?? 1;
  const earlierTests = Object.values(matrix?.tradeStates ?? {}).flatMap((state) => state.attempts ?? []).length;

  return (
    <div className="mx-auto max-w-3xl space-y-12 pb-24">
      <header className="pt-2">
        <Link href="/practice" className="text-[13px] font-medium text-muted transition-colors hover:text-ink">← Practice</Link>
        <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[48px]">Your progress.</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-snug text-muted">Every round feeds this. Nothing to configure — it all adapts.</p>
      </header>

      <AcademyStrip rank={rankOf(progress.xp)} level={xpLevel(progress.xp)} streak={displayStreak(progress, today)} accuracy={overallAccuracy(progress)} />

      <section>
        <Eyebrow>Training ladder</Eyebrow>
        <div className="mt-4 space-y-3">
          {ARENA_MODES.map((mode) => {
            const stats = modeStats(progress, mode);
            const best = progress.arena?.best?.[mode] ?? 0;
            return (
              <div key={mode} className={cn(surface.material, "flex items-center gap-5 rounded-[22px] px-5 py-4")}>
                <ModeBadge mode={mode} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{MODE_META[mode].title}</p>
                    <p className="num shrink-0 text-[13px] text-ink">Level {levels[mode]}</p>
                  </div>
                  <Bar value={(stats.accuracy ?? 0) * 100} accent={MODE_META[mode].accent} className="mt-2.5" />
                  <p className="mt-2 text-[12px] text-muted">
                    {stats.accuracy == null ? "Not played yet" : `${Math.round(stats.accuracy * 100)}% accuracy · ${stats.attempts} answers`}
                    {best > 0 ? ` · best round ${best}` : ""}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <Eyebrow>What you are getting right</Eyebrow>
        {skills.length ? (
          <div className={cn(surface.editorial, "mt-4 space-y-4 p-6")}>
            {skills.map(([tag, count]) => (
              <div key={tag}>
                <div className="mb-2 flex items-baseline justify-between gap-3 text-[13.5px]">
                  <span className="font-medium text-ink">{humanise(tag)}</span>
                  <span className="num text-muted">{count} correct</span>
                </div>
                <Bar value={(count / topSkill) * 100} />
              </div>
            ))}
          </div>
        ) : (
          <p className={cn(surface.editorial, "mt-4 px-6 py-5 text-[14px] text-muted")}>Play a round and your strongest skills will appear here.</p>
        )}
      </section>

      <section>
        <div className="flex items-baseline justify-between">
          <Eyebrow>Last 28 days</Eyebrow>
          <p className="num text-[12px] text-muted">{doneCount} {doneCount === 1 ? "day" : "days"} trained{(progress.perfectSets ?? 0) > 0 ? ` · ${progress.perfectSets} perfect ${progress.perfectSets === 1 ? "set" : "sets"}` : ""}</p>
        </div>
        <div className={cn(surface.editorial, "mt-4 p-6")}>
          <div className="grid grid-cols-7 gap-2.5">
            {days.map((day) => (
              <span key={day} title={day} className={cn("aspect-square rounded-full border", done.has(day) ? "border-gold-strong bg-gold-strong" : "border-line", day === today && !done.has(day) && "border-line-strong")} />
            ))}
          </div>
        </div>
      </section>

      {earlierTests > 0 && (
        <p className="text-[13px] leading-snug text-faint">
          Your earlier Matrix tests ({earlierTests}) are kept, and their XP still counts toward your rank.
        </p>
      )}
    </div>
  );
}

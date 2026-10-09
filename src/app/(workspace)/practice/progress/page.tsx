"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { cn } from "@/lib/utils";
import { displayStreak, rankOf } from "@/lib/practice/engine";
import { xpLevel } from "@/lib/practice/xp";
import { ARENA_MODES, arenaLevels } from "@/lib/practice/arena";
import { modeStats, overallAccuracy } from "@/lib/practice/coach";
import { calendarGrid, dateLabel, dayLevel, rangeLabel, summarise, WEEKDAY_LETTERS, type DayLevel } from "@/lib/practice/consistency";
import { AcademyStrip } from "@/components/practice/home";
import { MODE_META, ModeBadge, tint } from "@/components/practice/modes";
import { Bar, Eyebrow, surface } from "@/components/practice/ui";
import { AchievementGrid, RecordsGrid } from "@/components/practice/trophies";
import { achievementStates } from "@/lib/practice/achievements";
import { recordsOf } from "@/lib/practice/records";
import { ICT_TOPICS } from "@/lib/practice/ict";

/**
 * One hue, five steps — the more you practised, the deeper the gold. The date number sits inside
 * every dot, so the calendar never depends on colour alone.
 */
const gold = "var(--gold-strong)";
const LEVEL_STYLE: Record<DayLevel, { style: React.CSSProperties; text: string }> = {
  0: { style: { background: "color-mix(in srgb, var(--ink) 6%, transparent)" }, text: "text-faint" },
  1: { style: { background: tint(gold, 24, "var(--surface)") }, text: "text-ink/70" },
  2: { style: { background: tint(gold, 48, "var(--surface)") }, text: "text-ink/80" },
  3: { style: { background: tint(gold, 74, "var(--surface)") }, text: "text-ink" },
  4: { style: { background: "linear-gradient(180deg, var(--gold-strong), var(--gold-deep))", boxShadow: "inset 0 1px 0 rgb(255 255 255 / 0.3)" }, text: "text-on-gold" },
};
const LEVEL_NAME = ["No practice", "Light", "Steady", "Strong", "Full"] as const;

function Stat({ value, label }: { value: React.ReactNode; label: string }) {
  return (
    <div>
      <dd className="kpi text-[30px] leading-none tabular-nums text-ink">{value}</dd>
      <dt className="mt-1.5 text-[12.5px] text-muted">{label}</dt>
    </div>
  );
}

export default function PracticeProgressPage() {
  const settings = useApp((state) => state.settings);
  const progress = settings.practiceProgress ?? { xp: 0, streak: 0, freezeDays: 1 };
  const matrix = settings.matrixProgress;
  const today = todayKey();
  const levels = arenaLevels(progress);

  const cells = useMemo(() => calendarGrid(today), [today]);
  const completed = useMemo(() => new Set(progress.completedMissionDates ?? []), [progress.completedMissionDates]);
  const summary = useMemo(() => summarise(cells, progress.dailyStats, completed), [cells, progress.dailyStats, completed]);
  const trophies = useMemo(() => achievementStates(progress), [progress]);
  const records = recordsOf(progress);
  const unlocked = trophies.filter((t) => t.unlocked).length;
  const ictTotal = ICT_TOPICS.reduce((sum, t) => sum + (progress.masteryByTag?.[t.tag] ?? 0), 0);
  const earlierTests = Object.values(matrix?.tradeStates ?? {}).flatMap((state) => state.attempts ?? []).length;

  return (
    <div className="mx-auto max-w-3xl space-y-12 pb-24">
      <header className="pt-2">
        <Link href="/practice" className="text-[13px] font-medium text-muted transition-colors hover:text-ink">← Practice</Link>
        <h1 className="mt-5 text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] text-ink sm:text-[48px]">Your progress.</h1>
        <p className="mt-3 max-w-xl text-[16px] leading-snug text-muted">Every round feeds this. Nothing to configure — it all adapts.</p>
      </header>

      <AcademyStrip rank={rankOf(progress.xp)} level={xpLevel(progress.xp)} streak={displayStreak(progress, today)} accuracy={overallAccuracy(progress)} />

      <section aria-labelledby="ladder-heading">
        <Eyebrow><span id="ladder-heading">Training ladder</span></Eyebrow>
        <ul className={cn(surface.editorial, "mt-4 divide-y divide-line overflow-hidden")}>
          {ARENA_MODES.map((mode) => {
            const stats = modeStats(progress, mode);
            const best = progress.arena?.best?.[mode] ?? 0;
            return (
              <li key={mode} className="flex items-center gap-4 px-5 py-4">
                <ModeBadge mode={mode} size="md" />
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="truncate text-[16px] font-semibold tracking-[-0.01em] text-ink">{MODE_META[mode].title}</p>
                    <p className="num shrink-0 text-[13px] text-muted">Level {levels[mode]}</p>
                  </div>
                  <Bar value={(stats.accuracy ?? 0) * 100} accent={MODE_META[mode].accent} className="mt-2.5" />
                  <p className="mt-2 text-[12px] text-muted">
                    {stats.accuracy == null ? "Not played yet" : `${Math.round(stats.accuracy * 100)}% accuracy · ${stats.attempts} answers`}
                    {best > 0 ? ` · best round ${best}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 px-1 text-[12px] leading-snug text-faint">Accuracy counts every answer in that mode. Levels rise on their own as you clear each gate.</p>
      </section>

      <section aria-labelledby="records-heading">
        <Eyebrow><span id="records-heading">Personal records</span></Eyebrow>
        <div className="mt-4"><RecordsGrid records={records} /></div>
      </section>

      <section aria-labelledby="ach-heading">
        <div className="flex items-baseline justify-between gap-4">
          <Eyebrow><span id="ach-heading">Achievements</span></Eyebrow>
          <p className="num text-[12px] text-faint">{unlocked} of {trophies.length} unlocked</p>
        </div>
        <div className="mt-4"><AchievementGrid states={[...trophies].sort((a, b) => Number(b.unlocked) - Number(a.unlocked) || b.current / b.target - a.current / a.target)} /></div>
      </section>

      <section aria-labelledby="ict-heading">
        <div className="flex items-baseline justify-between gap-4">
          <Eyebrow><span id="ict-heading">ICT Lab mastery</span></Eyebrow>
          <p className="num text-[12px] text-faint">{ictTotal} correct in total</p>
        </div>
        <ul className={cn(surface.editorial, "mt-4 divide-y divide-line overflow-hidden")}>
          {ICT_TOPICS.map((topic) => {
            const n = progress.masteryByTag?.[topic.tag] ?? 0;
            return (
              <li key={topic.tag} className="flex items-center gap-4 px-5 py-3.5">
                <p className="w-40 shrink-0 text-[14.5px] font-medium tracking-[-0.01em] text-ink">{topic.label}</p>
                <Bar value={Math.min(100, (n / 20) * 100)} accent={MODE_META.ict.accent} className="flex-1" />
                <p className="num w-20 shrink-0 text-right text-[12px] text-muted">{n} correct</p>
              </li>
            );
          })}
        </ul>
        <p className="mt-3 px-1 text-[12px] leading-snug text-faint">Each bar fills at 20 correct answers in that topic. Play ICT Lab to grow them.</p>
      </section>

      <section aria-labelledby="consistency-heading">
        <div className="flex items-baseline justify-between gap-4">
          <Eyebrow><span id="consistency-heading">Consistency</span></Eyebrow>
          <p className="text-[12px] text-faint">{rangeLabel(cells)}</p>
        </div>

        <div className={cn(surface.editorial, "mt-4 flex flex-wrap items-start justify-between gap-x-14 gap-y-8 px-6 py-6")}>
          <div>
            <div className="grid grid-cols-[repeat(7,1.75rem)] gap-x-2.5 text-center text-[10.5px] font-semibold text-faint" aria-hidden>
              {WEEKDAY_LETTERS.map((letter, i) => <span key={i}>{letter}</span>)}
            </div>
            <div className="mt-2.5 grid grid-cols-[repeat(7,1.75rem)] gap-2.5">
              {cells.map((cell) => {
                if (cell.future) return <span key={cell.key} aria-hidden className="num grid h-7 w-7 place-items-center text-[11px] text-faint/40">{cell.day}</span>;
                const stat = progress.dailyStats?.[cell.key];
                const level = dayLevel(stat?.total, completed.has(cell.key));
                const detail = stat && stat.total > 0 ? `${stat.total} answers, ${Math.round((stat.correct / stat.total) * 100)}% correct` : level > 0 ? "Practised" : "No practice";
                const label = `${dateLabel(cell.key)}: ${detail}`;
                return (
                  <span
                    key={cell.key}
                    role="img"
                    aria-label={label}
                    title={label}
                    style={LEVEL_STYLE[level].style}
                    className={cn("num grid h-7 w-7 place-items-center rounded-full text-[11px]", LEVEL_STYLE[level].text, cell.key === today && "font-bold ring-[1.5px] ring-ink/60 ring-offset-2 ring-offset-surface")}
                  >
                    {cell.day}
                  </span>
                );
              })}
            </div>

            <div className="mt-5 flex items-center gap-2 text-[11.5px] text-faint" aria-label={`Colour scale: ${LEVEL_NAME.join(", ")}`}>
              <span>Less</span>
              {([0, 1, 2, 3, 4] as DayLevel[]).map((level) => <span key={level} aria-hidden style={LEVEL_STYLE[level].style} className="h-3 w-3 rounded-full" />)}
              <span>More</span>
            </div>
          </div>

          <dl className="grid grid-cols-3 gap-x-9 gap-y-6 sm:grid-cols-1">
            <Stat value={summary.days} label={summary.days === 1 ? "day trained" : "days trained"} />
            <Stat value={summary.longest} label="longest run (days)" />
            <Stat value={progress.perfectSets ?? 0} label="perfect sets" />
          </dl>
        </div>
        <p className="mt-3 px-1 text-[12px] leading-snug text-faint">The deeper the gold, the more you practised that day. Hover a day for the details.</p>
      </section>

      {earlierTests > 0 && (
        <p className="text-[13px] leading-snug text-faint">Your earlier Matrix tests ({earlierTests}) are kept, and their XP still counts toward your rank.</p>
      )}
    </div>
  );
}

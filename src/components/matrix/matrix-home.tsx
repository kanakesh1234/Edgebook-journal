"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useApp } from "@/lib/store";
import { todayKey } from "@/lib/format";
import { scopeToPrimary } from "@/lib/challenges";
import { practiceHomeStats } from "@/lib/practice/home-stats";
import { ModeCard } from "@/components/practice/mode-card";
import { Disclosure } from "@/components/journal/flow-ui";

/**
 * Home → Practice. One quiet row: where you are, what's waiting, one way in.
 * The four training modes are tucked behind a disclosure (progressive
 * disclosure) and still deep-link straight to their mode.
 */
export function MatrixHome() {
  const allEntries = useApp((state) => state.entries);
  const settings = useApp((state) => state.settings);
  const today = todayKey();
  const { entries } = useMemo(() => scopeToPrimary(settings, allEntries), [settings, allEntries]);
  const s = useMemo(() => practiceHomeStats(entries, settings, today), [entries, settings, today]);

  const facts: { text: string; accent?: boolean }[] = [
    { text: s.streak > 0 ? `${s.streak}-day streak` : "No streak yet" },
    ...(s.accuracy != null ? [{ text: `${Math.round(s.accuracy * 100)}% accuracy` }] : []),
    ...(s.dueReviews > 0 ? [{ text: `${s.dueReviews} ${s.dueReviews === 1 ? "review" : "reviews"} due`, accent: true }] : []),
  ];

  return (
    <section className="panel" aria-label="Practice">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between sm:gap-x-8 sm:gap-y-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Practice</h2>
          <p className="mt-0.5 text-[13px] text-muted">
            {s.rank} · Level {s.xpLevel.level}
          </p>
          <div
            className="mt-2.5 h-[3px] w-40 overflow-hidden rounded-full bg-line-soft"
            role="img"
            aria-label={`${s.xpLevel.into} of ${s.xpLevel.need} XP to the next level`}
          >
            <div className="h-full rounded-full bg-gold-strong" style={{ width: `${Math.max(0, Math.min(100, s.xpLevel.pct))}%` }} />
          </div>
        </div>

        <ul className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] sm:flex-1 sm:justify-end">
          {facts.map((f) => (
            <li key={f.text} className={f.accent ? "font-semibold text-gold" : "text-muted"}>
              {f.text}
            </li>
          ))}
        </ul>

        <Link href="/practice" className="self-start py-1 text-[13px] font-semibold text-gold hover:underline sm:self-auto">
          Open Practise →
        </Link>
      </div>

      <div className="border-t border-line px-5 py-3 sm:px-6">
        <Disclosure label="Training modes">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <ModeCard compact mode="matrix" level={s.levels.matrix} href="/practice?mode=matrix" disabled={s.usableTrades === 0} status="Log a trade to unlock." />
            <ModeCard compact mode="time-machine" level={s.levels["time-machine"]} href="/practice?mode=time-machine" disabled={s.usableTrades === 0} status="Log a trade to unlock." />
            <ModeCard compact mode="math-duel" level={s.levels["math-duel"]} href="/practice?mode=math-duel" status="" />
            <ModeCard compact mode="boss" level={s.levels.boss} href="/practice?mode=boss" disabled={!s.bossReady} status="Needs 2 trades in the same week." />
          </div>
        </Disclosure>
      </div>
    </section>
  );
}

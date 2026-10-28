"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { computeStats, currentStreak } from "@/lib/stats";
import { scopeToPrimary } from "@/lib/challenges";
import { PlanTradeFlow } from "@/components/journal/plan-trade-flow";
import { CalendarView } from "@/components/calendar/calendar-view";
import { formatDateFull, todayKey } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { Performance } from "@/components/dashboard/performance";
import { DailyFocusControl, NoSetupDayButton } from "@/components/dashboard/daily-focus-control";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { BookOpenIcon, PlusIcon, SparklesIcon } from "@/components/ui/icons";

export default function DashboardPage() {
  const allEntries = useApp((s) => s.entries);
  const rawSettings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const openNewEntry = useUi((s) => s.openNewEntry);
  const [planOpen, setPlanOpen] = useState(false);
  const dayLogs = useApp((st) => st.dayLogs);

  const today = todayKey();
  const isNoSetupToday = useMemo(
    () => allEntries.every((e) => e.date !== today) && dayLogs.some((d) => d.date === today),
    [allEntries, dayLogs, today],
  );

  // If the user marks today as a no-setup day while Plan Trade is open, close it cleanly.
  useEffect(() => {
    if (isNoSetupToday && planOpen) setPlanOpen(false);
  }, [isNoSetupToday, planOpen]);

  // Primary challenge scoping — one shared source of truth for the whole page.
  const { entries, settings, challenge } = useMemo(
    () => scopeToPrimary(rawSettings, allEntries),
    [rawSettings, allEntries],
  );

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const streak = useMemo(() => currentStreak(stats.daily), [stats.daily]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const displayName = settings.fullName?.trim() || user?.name || "";
  const firstName = displayName.split(" ")[0] || "trader";

  const noSetupTitle = isNoSetupToday ? "Disabled — today is marked as a no-setup day" : undefined;

  if (allEntries.length === 0) {
    return (
      <div className="space-y-7">
        <Header greeting={greeting} firstName={firstName} dailyControl={<DailyFocusControl currency={settings.currency} />}>
          <NoSetupDayButton />
        </Header>
        <EmptyState
          icon={<BookOpenIcon className="h-7 w-7" />}
          title="Your dashboard is waiting for data"
          body="Add your first session — or load a demo journal with four months of realistic trades to explore every feature instantly."
          action={
            <>
              <Button variant="gold" disabled={isNoSetupToday} title={noSetupTitle} onClick={openNewEntry}>
                <PlusIcon className="h-4 w-4" />
                Log first trade
              </Button>
              <Button variant="outline" disabled={isNoSetupToday} title={noSetupTitle} onClick={() => setPlanOpen(true)}>
                Plan a trade
              </Button>
              <Button variant="outline" onClick={() => void useApp.getState().loadDemoData()}>
                <SparklesIcon className="h-4 w-4" />
                Load demo data
              </Button>
            </>
          }
        />
        <PlanTradeFlow open={planOpen && !isNoSetupToday} onClose={() => setPlanOpen(false)} />
      </div>
    );
  }

  return (
    <div className="space-y-6 md:space-y-8">
      <Header greeting={greeting} firstName={firstName} dailyControl={<DailyFocusControl currency={settings.currency} />}>
        <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
          <NoSetupDayButton />
          <Button
            variant="outline"
            size="md"
            disabled={isNoSetupToday}
            title={noSetupTitle}
            onClick={openNewEntry}
            className="hidden rounded-full px-5 md:inline-flex"
          >
            <PlusIcon className="h-4 w-4" />
            Add trade
          </Button>
          <Button
            variant="gold"
            size="md"
            disabled={isNoSetupToday}
            title={noSetupTitle}
            onClick={() => setPlanOpen(true)}
            className="rounded-full px-4 sm:px-5"
          >
            <span className="sm:hidden">Plan trade</span>
            <span className="hidden sm:inline">Plan a trade</span>
          </Button>
        </div>
      </Header>

      <div className="space-y-6 md:space-y-8">
        <Performance
          stats={stats}
          currency={settings.currency}
          startingEquity={settings.startingEquity}
          targetEquity={settings.targetEquity}
          maxDrawdown={settings.maxDrawdown}
          eyebrow={challenge ? `${challenge.name} · equity` : "Equity"}
          streak={streak}
          emptyHint={
            challenge && stats.tradingDays === 0
              ? "Tag trades with this challenge to track its progress."
              : "Your curve appears after your first trading day."
          }
        />

        <CalendarView
          entries={entries}
          dayLogs={dayLogs}
          challenges={settings.challenges ?? []}
          currency={settings.currency}
          defaultChallengeId={challenge?.id ?? null}
          spacious
        />
      </div>

      <PlanTradeFlow open={planOpen && !isNoSetupToday} onClose={() => setPlanOpen(false)} />
    </div>
  );
}

function Header({ greeting, firstName, dailyControl, children }: { greeting: string; firstName: string; dailyControl?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-3 sm:gap-4">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="font-display text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-3xl"
        >
          {greeting}, <span className="text-gold">{firstName}</span>.
        </motion.h1>
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-2 text-[13px] text-muted sm:text-sm">
          <span className="capitalize">{formatDateFull(todayKey())}</span>
          {dailyControl}
        </div>
      </div>
      {children}
    </header>
  );
}

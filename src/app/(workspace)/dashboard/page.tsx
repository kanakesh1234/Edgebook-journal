"use client";

import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { useApp, sortEntriesNewestFirst } from "@/lib/store";
import { computeStats, currentStreak } from "@/lib/stats";
import { evaluateRules } from "@/lib/rules";
import { scopeToPrimary } from "@/lib/challenges";
import { PlanTradeFlow } from "@/components/journal/plan-trade-flow";
import { CalendarView } from "@/components/calendar/calendar-view";
import { formatDateFull, todayKey } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { Performance } from "@/components/dashboard/performance";
import { TodayPanel, type RiskPosture } from "@/components/dashboard/today-panel";
import { MatrixHome } from "@/components/matrix/matrix-home";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BookOpenIcon, PlusIcon, SparklesIcon } from "@/components/ui/icons";

export default function DashboardPage() {
  const allEntries = useApp((s) => s.entries);
  const rawSettings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const openNewEntry = useUi((s) => s.openNewEntry);
  const [planOpen, setPlanOpen] = useState(false);
  const dayLogs = useApp((st) => st.dayLogs);

  // Primary challenge scoping — one shared source of truth for the whole page.
  const { entries, settings, challenge } = useMemo(
    () => scopeToPrimary(rawSettings, allEntries),
    [rawSettings, allEntries],
  );

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const streak = useMemo(() => currentStreak(stats.daily), [stats.daily]);
  const violations = useMemo(() => evaluateRules(entries, settings), [entries, settings]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  // Full Name from Settings wins over the auth/Google name.
  const displayName = settings.fullName?.trim() || user?.name || "";
  const firstName = displayName.split(" ")[0] || "trader";
  const futureIntention = settings.practiceProgress?.futureSelfPredictions?.find((prediction) => prediction.date === todayKey());

  if (allEntries.length === 0) {
    return (
      <div className="space-y-7">
        <Header greeting={greeting} firstName={firstName} />
        <EmptyState
          icon={<BookOpenIcon className="h-7 w-7" />}
          title="Your dashboard is waiting for data"
          body="Add your first session — or load a demo journal with four months of realistic trades to explore every feature instantly."
          action={
            <>
              <Button variant="gold" onClick={openNewEntry}>
                <PlusIcon className="h-4 w-4" />
                Log first trade
              </Button>
              <Button variant="outline" onClick={() => setPlanOpen(true)}>
                Plan a trade
              </Button>
              <Button
                variant="outline"
                onClick={() => void useApp.getState().loadDemoData()}
              >
                <SparklesIcon className="h-4 w-4" />
                Load demo data
              </Button>
            </>
          }
        />
        <PlanTradeFlow open={planOpen} onClose={() => setPlanOpen(false)} />
      </div>
    );
  }

  // Risk posture from the Trading Lab rule engine (drawdown as fallback signal)
  const todayStr = todayKey();
  const brokenToday = violations.filter((v) => v.date === todayStr).length;
  const weekCutoff = (() => {
    const d = new Date(todayStr + "T00:00:00");
    d.setDate(d.getDate() - 7);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  const brokenWeek = violations.filter((v) => v.date >= weekCutoff).length;
  const riskUsed = stats.drawdownBudgetUsed;
  const risk: { label: string; dot: string; text: string; tone: RiskPosture["tone"] } =
    brokenToday > 0
      ? { label: `Rule broken today${brokenToday > 1 ? ` ×${brokenToday}` : ""}`, dot: "bg-loss", text: "text-loss", tone: "loss" }
      : brokenWeek > 0
        ? { label: "Rules under watch", dot: "bg-gold", text: "text-gold", tone: "gold" }
        : riskUsed >= 0.8
          ? { label: "Drawdown stretched", dot: "bg-loss", text: "text-loss", tone: "loss" }
          : { label: "Risk healthy", dot: "bg-profit", text: "text-profit", tone: "profit" };
  const recent = sortEntriesNewestFirst(entries).slice(0, 5);

  return (
    <div className="space-y-6 md:space-y-8">
      <Header
        greeting={greeting}
        firstName={firstName}
        status={
          // On desktop the status lives in the Today rail; here it covers phone + tablet.
          <span className="inline-flex items-center gap-2" role="status">
            <span className={cn("h-1.5 w-1.5 rounded-full", risk.dot)} />
            <span className={risk.text}>{risk.label}</span>
          </span>
        }
      >
        {/* Phone: the centre tab is "Add trade", so the header carries only a compact planning CTA. */}
        <div className="flex shrink-0 items-center gap-2.5">
          <Button variant="outline" size="md" onClick={openNewEntry} className="hidden rounded-full px-5 md:inline-flex">
            <PlusIcon className="h-4 w-4" />
            Add trade
          </Button>
          <Button variant="gold" size="md" onClick={() => setPlanOpen(true)} className="rounded-full px-4 sm:px-5">
            <span className="sm:hidden">Plan trade</span>
            <span className="hidden sm:inline">Plan a trade</span>
          </Button>
        </div>
      </Header>

      {/*
        One grid, three compositions:
          phone    single column — Performance → Today → Practice → Calendar
          tablet   single column, Today becomes a two-up card (see TodayPanel)
          desktop  main column + sticky 21rem "Today" rail
      */}
      <div className="grid gap-6 md:gap-8 xl:grid-cols-[minmax(0,1fr)_21rem] xl:gap-x-8">
        <div className="min-w-0 xl:col-start-1 xl:row-start-1">
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
        </div>

        <TodayPanel
          className="min-w-0 xl:sticky xl:top-8 xl:col-start-2 xl:row-span-3 xl:row-start-1 xl:self-start"
          risk={{ label: risk.label, tone: risk.tone }}
          drawdownUsed={riskUsed}
          drawdown={stats.drawdown}
          drawdownLimit={settings.maxDrawdown}
          currency={settings.currency}
          brokenToday={brokenToday}
          brokenWeek={brokenWeek}
          intention={futureIntention ? { rule: futureIntention.rule, outcome: futureIntention.outcome } : null}
          recent={recent}
        />

        <div className="min-w-0 xl:col-start-1 xl:row-start-2">
          <MatrixHome />
        </div>

        <div className="min-w-0 xl:col-start-1 xl:row-start-3">
          <CalendarView
            entries={entries}
            dayLogs={dayLogs}
            challenges={settings.challenges ?? []}
            currency={settings.currency}
            defaultChallengeId={challenge?.id ?? null}
          />
        </div>
      </div>

      <PlanTradeFlow open={planOpen} onClose={() => setPlanOpen(false)} />
    </div>
  );
}

/* ------------------------------- pieces -------------------------------- */

function Header({ greeting, firstName, status, children }: { greeting: string; firstName: string; status?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex items-end justify-between gap-3 sm:gap-4">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="font-display text-[24px] font-semibold leading-[1.15] tracking-[-0.02em] text-ink sm:text-3xl"
        >
          {greeting}, <span className="text-gold">{firstName}</span>.
        </motion.h1>
        <p className="mt-1.5 flex flex-col gap-y-1 text-[13px] text-muted sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:text-sm">
          <span className="capitalize">{formatDateFull(todayKey())}</span>
          {status && (
            <span className="inline-flex items-center gap-3 xl:hidden">
              <span className="hidden text-line-strong sm:inline" aria-hidden>·</span>
              {status}
            </span>
          )}
        </p>
      </div>
      {children}
    </header>
  );
}

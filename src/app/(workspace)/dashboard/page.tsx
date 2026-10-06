"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { computeStats, currentStreak } from "@/lib/stats";
import { evaluateRules } from "@/lib/rules";
import { scopeToPrimary } from "@/lib/challenges";
import { PlanTradeFlow } from "@/components/journal/plan-trade-flow";
import { CalendarView } from "@/components/calendar/calendar-view";
import { formatDateFull, todayKey } from "@/lib/format";
import { useUi } from "@/lib/ui-store";
import { Performance } from "@/components/dashboard/performance";
import { MatrixHome } from "@/components/matrix/matrix-home";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
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
  const risk =
    brokenToday > 0
      ? { label: `Rule broken today${brokenToday > 1 ? ` ×${brokenToday}` : ""}`, dot: "bg-loss", text: "text-loss" }
      : brokenWeek > 0
        ? { label: "Rules under watch", dot: "bg-gold", text: "text-gold" }
        : riskUsed >= 0.8
          ? { label: "Drawdown stretched", dot: "bg-loss", text: "text-loss" }
          : { label: "Risk healthy", dot: "bg-profit", text: "text-profit" };

  return (
    <div className="space-y-8 sm:space-y-10">
      <Header
        greeting={greeting}
        firstName={firstName}
        status={
          <span className="inline-flex items-center gap-2" role="status">
            <span className={cn("h-1.5 w-1.5 rounded-full", risk.dot)} />
            <span className={risk.text}>{risk.label}</span>
          </span>
        }
      >
        <div className="flex items-center gap-2.5">
          <Button variant="outline" size="md" onClick={openNewEntry} className="hidden rounded-full px-5 lg:inline-flex">
            <PlusIcon className="h-4 w-4" />
            Add trade
          </Button>
          <Button variant="gold" size="md" onClick={() => setPlanOpen(true)} className="rounded-full px-5">
            Plan a trade
          </Button>
        </div>
      </Header>

      {futureIntention && (
        <motion.aside
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: EASE }}
          className="flex flex-col gap-1.5 border-l-2 border-gold/60 py-0.5 pl-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-8"
          aria-label="Pre-market intention"
        >
          <div className="min-w-0">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-gold">Pre-market intention · sealed by Future Self</p>
            <p className="mt-1 text-[15px] font-medium leading-snug text-ink">“{futureIntention.rule}”</p>
          </div>
          <Link href="/practice" className="shrink-0 text-[13px] font-semibold text-gold hover:underline">
            {futureIntention.outcome ? `Marked ${futureIntention.outcome}` : "Open training"}
          </Link>
        </motion.aside>
      )}

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

      <MatrixHome />

      <CalendarView
        entries={entries}
        dayLogs={dayLogs}
        challenges={settings.challenges ?? []}
        currency={settings.currency}
        defaultChallengeId={challenge?.id ?? null}
      />

      <PlanTradeFlow open={planOpen} onClose={() => setPlanOpen(false)} />
    </div>
  );
}

/* ------------------------------- pieces -------------------------------- */

function Header({ greeting, firstName, status, children }: { greeting: string; firstName: string; status?: React.ReactNode; children?: React.ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45 }}
          className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl sm:font-semibold"
        >
          {greeting}, <span className="text-gold">{firstName}</span>.
        </motion.h1>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
          <span className="capitalize">{formatDateFull(todayKey())}</span>
          {status && (
            <>
              <span className="text-line-strong" aria-hidden>·</span>
              {status}
            </>
          )}
        </p>
      </div>
      {children}
    </header>
  );
}

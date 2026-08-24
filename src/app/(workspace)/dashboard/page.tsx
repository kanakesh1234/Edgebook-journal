"use client";

import { useMemo } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { useApp, sortEntriesNewestFirst } from "@/lib/store";
import { computeStats, currentStreak, groupByDay } from "@/lib/stats";
import { journeyState } from "@/lib/journey";
import {
  formatDateFull,
  formatDateMedium,
  formatMoney,
  formatPct,
  formatSignedMoney,
  todayKey,
} from "@/lib/format";
import { useCountUp } from "@/lib/hooks";
import { useUi } from "@/lib/ui-store";
import { StatCard } from "@/components/dashboard/stat-card";
import { EquityCurve } from "@/components/charts/equity-curve";
import { DailyBars } from "@/components/charts/daily-bars";
import { WinRateDonut, DrawdownMeter } from "@/components/charts/winrate-donut";
import { JourneyTrack } from "@/components/journey/journey-track";
import { WeekStrip } from "@/components/cc/week-strip";
import { DisciplinePanel } from "@/components/cc/discipline-panel";
import { EmptyState, Pill } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EASE } from "@/components/landing/reveal";
import {
  ArrowRightIcon,
  AwardIcon,
  BookOpenIcon,
  CalendarIcon,
  FlameIcon,
  PlusIcon,
  ShieldIcon,
  SparklesIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
} from "@/components/ui/icons";

export default function DashboardPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const openNewEntry = useUi((s) => s.openNewEntry);

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const journey = useMemo(() => journeyState(settings, stats), [settings, stats]);
  const streak = useMemo(() => currentStreak(stats.daily), [stats.daily]);
  const byDay = useMemo(() => groupByDay(entries), [entries]);
  const recentEntries = useMemo(() => sortEntriesNewestFirst(entries).slice(0, 3), [entries]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name ?? "").split(" ")[0] || "trader";

  // Animated counters
  const totalPnl = useCountUp(stats.totalPnl);
  const equity = useCountUp(stats.currentEquity);
  const avgDay = useCountUp(stats.avgDayPnl);

  if (entries.length === 0) {
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
      </div>
    );
  }

  const pnlTone = stats.totalPnl > 0 ? "profit" : stats.totalPnl < 0 ? "loss" : "neutral";
  const improving = stats.avgDayPnl >= 0;

  // Risk posture from the drawdown budget (Trading Lab rules will refine this)
  const riskUsed = stats.drawdownBudgetUsed;
  const risk =
    riskUsed >= 0.8
      ? { label: "Risk stretched", dot: "bg-loss", text: "text-loss" }
      : riskUsed >= 0.5
        ? { label: "Risk elevated", dot: "bg-gold", text: "text-gold" }
        : { label: "Risk healthy", dot: "bg-profit", text: "text-profit" };

  return (
    <div className="space-y-7">
      <Header greeting={greeting} firstName={firstName}>
        <div className="flex items-center gap-3">
          <Pill className="gap-2 py-1.5">
            <span className={cn("h-1.5 w-1.5 rounded-full", risk.dot)} />
            <span className={risk.text}>{risk.label}</span>
          </Pill>
          <Button variant="gold" size="sm" onClick={openNewEntry} className="hidden lg:inline-flex">
            <PlusIcon className="h-4 w-4" />
            Add trade
          </Button>
        </div>
      </Header>

      {/* ------------------------------ Hero band ------------------------------ */}
      <motion.section
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: EASE }}
        className="panel flex flex-col gap-6 p-6 sm:flex-row sm:items-end sm:justify-between sm:p-7"
        aria-label="Current equity"
      >
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Current equity</p>
          <p className="kpi mt-2 text-[34px] leading-none text-ink sm:text-[40px]">
            {formatMoney(equity, settings.currency)}
          </p>
          <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
            <span className={cn("num text-sm", stats.totalPnl >= 0 ? "text-profit" : "text-loss")}>
              {formatSignedMoney(totalPnl, settings.currency)}
            </span>
            <span className="text-faint">·</span>
            <span className="text-muted">
              {stats.tradingDays} trading days · {formatPct(Math.abs(stats.totalPnl / Math.max(1, settings.startingEquity)), 0)} of start
            </span>
          </p>
        </div>

        <div className="w-full max-w-[240px]">
          <div className="flex items-baseline justify-between">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
              <TargetIcon className="h-3.5 w-3.5 text-gold" />
              Target
            </p>
            <p className="num text-sm text-ink">{Math.round(journey.progress * 100)}%</p>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line-soft">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-profit-deep via-profit to-gold-strong"
              initial={{ width: 0 }}
              animate={{ width: `${journey.progress * 100}%` }}
              transition={{ duration: 1, delay: 0.3, ease: EASE }}
            />
          </div>
          <p className="mt-1.5 flex justify-between text-[11px] text-muted">
            <span>{formatMoney(settings.startingEquity, settings.currency, { compact: true })}</span>
            <span>{formatMoney(stats.remainingToTarget, settings.currency, { compact: true })} to go</span>
          </p>
        </div>
      </motion.section>

      {/* ------------------------------ KPI row ------------------------------ */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total P&L"
          value={
            <span className={pnlTone === "profit" ? "text-profit" : pnlTone === "loss" ? "text-loss" : undefined}>
              {formatSignedMoney(totalPnl, settings.currency)}
            </span>
          }
          sub={`${stats.tradingDays} trading days · ${formatPct(Math.abs(stats.totalPnl / Math.max(1, settings.startingEquity)))} of start`}
          icon={stats.totalPnl >= 0 ? <TrendingUpIcon className="h-4 w-4" /> : <TrendingDownIcon className="h-4 w-4" />}
          tone={pnlTone}
          delay={0.02}
        />

        <StatCard
          label="Win rate"
          value={`${Math.round(stats.winRate * 100)}%`}
          sub={`${stats.winningDays}W · ${stats.losingDays}L${stats.breakEvenDays > 0 ? ` · ${stats.breakEvenDays} flat` : ""}`}
          icon={<AwardIcon className="h-4 w-4" />}
          tone={stats.winRate >= 0.5 ? "profit" : "neutral"}
          delay={0.07}
        />

        <StatCard
          label="Avg day P&L"
          value={
            <span className={avgDay >= 0 ? "text-profit" : "text-loss"}>
              {formatSignedMoney(avgDay, settings.currency)}
            </span>
          }
          sub={
            streak !== 0 ? (
              <span className={`inline-flex items-center gap-1.5 ${streak > 0 ? "text-profit" : "text-loss"}`}>
                <FlameIcon className="h-3.5 w-3.5" />
                {Math.abs(streak)}-{Math.abs(streak) === 1 ? "day" : "day"}{" "}
                {streak > 0 ? "winning" : "losing"} streak
              </span>
            ) : (
              "no active streak"
            )
          }
          icon={<SparklesIcon className="h-4 w-4" />}
          tone={improving ? "profit" : "loss"}
          delay={0.12}
        />

        {/* Drawdown meter card */}
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.17, ease: EASE }}
          className="panel panel-hover relative overflow-hidden p-5"
        >
          <div className="relative flex items-start justify-between">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Drawdown</p>
            <span className="grid h-8 w-8 place-items-center rounded-control border border-line bg-raised text-loss">
              <ShieldIcon className="h-4 w-4" />
            </span>
          </div>
          <p className="kpi relative mt-3 text-[27px] leading-none text-ink">
            −{formatMoney(stats.drawdown, settings.currency)}
          </p>
          <div className="relative mt-3">
            <DrawdownMeter
              used={stats.drawdownBudgetUsed}
              amount={stats.drawdown}
              budget={settings.maxDrawdown}
            />
          </div>
        </motion.div>
      </div>

      {/* --------------------------- Charts row ---------------------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        {/* Equity curve */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.2, ease: EASE }}
          className="panel p-5 sm:p-6 xl:col-span-2"
          aria-label="Equity curve chart"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">Equity curve</h2>
              <p className="text-xs text-muted">From {formatMoney(settings.startingEquity, settings.currency)} start</p>
            </div>
            <Pill>
              peak {formatMoney(stats.peakEquity, settings.currency, { compact: true })}
            </Pill>
          </div>
          <EquityCurve
            data={stats.equityCurve}
            currency={settings.currency}
            startingEquity={settings.startingEquity}
            targetEquity={settings.targetEquity}
          />
        </motion.section>

        {/* Right column: win rate + W/L days */}
        <div className="grid gap-4">
          <motion.section
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.26, ease: EASE }}
            className="panel flex flex-col items-center justify-center gap-4 p-5 sm:flex-row sm:justify-around"
            aria-label="Win rate"
          >
            <WinRateDonut winRate={stats.winRate} />
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2 w-2 rounded-full bg-profit" /> Winning days
                </span>
                <span className="num text-ink">{stats.winningDays}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2 w-2 rounded-full bg-loss" /> Losing days
                </span>
                <span className="num text-ink">{stats.losingDays}</span>
              </div>
              {stats.breakEvenDays > 0 && (
                <div className="flex items-center justify-between gap-6">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="h-2 w-2 rounded-full bg-faint" /> Flat days
                  </span>
                  <span className="num text-ink">{stats.breakEvenDays}</span>
                </div>
              )}
            </div>
          </motion.section>

          {/* Best & worst */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.3, ease: EASE }}
            className="panel grid grid-cols-2 divide-x divide-line overflow-hidden"
          >
            <div className="p-5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
                <AwardIcon className="h-3.5 w-3.5 text-profit" /> Best day
              </p>
              <p className="kpi mt-2 text-lg text-profit">
                {stats.bestDay ? formatSignedMoney(stats.bestDay.pnl, settings.currency) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">{stats.bestDay ? formatDateMedium(stats.bestDay.date) : ""}</p>
            </div>
            <div className="p-5">
              <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
                <TrendingDownIcon className="h-3.5 w-3.5 text-loss" /> Worst day
              </p>
              <p className="kpi mt-2 text-lg text-loss">
                {stats.worstDay ? formatSignedMoney(stats.worstDay.pnl, settings.currency) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">{stats.worstDay ? formatDateMedium(stats.worstDay.date) : ""}</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ------------------------------ Journey ------------------------------ */}
      <JourneyTrack settings={settings} stats={stats} journey={journey} />

      {/* ---------------------------- Discipline ----------------------------- */}
      <DisciplinePanel delay={0.28} />

      {/* ------------------------- Daily bars row -------------------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.34, ease: EASE }}
          className="panel p-5 sm:p-6 xl:col-span-2"
          aria-label="Daily profit and loss chart"
        >
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">Daily results</h2>
              <p className="text-xs text-muted">Your last 60 sessions, oldest → newest</p>
            </div>
          </div>
          <DailyBars data={stats.daily.slice(-60)} currency={settings.currency} height={252} />
        </motion.section>

        {/* Secondary stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.38, ease: EASE }}
          className="grid grid-cols-2 gap-4"
        >
          <MiniStat
            label="To target"
            value={formatMoney(Math.max(0, stats.remainingToTarget), settings.currency, { compact: true })}
            tone={stats.remainingToTarget <= 0 ? "profit" : "gold"}
            note={stats.remainingToTarget <= 0 ? "target reached" : `${Math.round((1 - stats.targetProgress) * 100)}% of journey left`}
            icon={<TargetIcon className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="Average R:R"
            value={stats.avgRR != null ? `${stats.avgRR > 0 ? "+" : ""}${stats.avgRR.toFixed(1)}R` : "—"}
            tone={stats.avgRR != null && stats.avgRR > 0 ? "profit" : "neutral"}
            note={`${Math.round(stats.rrCoverage * 100)}% of trades tracked`}
            icon={<SparklesIcon className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="Win rate"
            value={`${Math.round(stats.winRate * 100)}%`}
            tone={stats.winRate >= 0.5 ? "profit" : "neutral"}
            note="across decided days"
            icon={<TrendingUpIcon className="h-3.5 w-3.5" />}
          />
          <MiniStat
            label="Sessions logged"
            value={String(stats.tradingDays)}
            tone="neutral"
            note={`${stats.tradeCount} entries total`}
            icon={<BookOpenIcon className="h-3.5 w-3.5" />}
          />
        </motion.div>
      </div>

      {/* --------------------------- Recent days --------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.4, ease: EASE }}
        className="panel p-5 sm:p-6"
        aria-label="Recent trading days"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">Recent days</h2>
            <p className="text-xs text-muted">Your last week at a glance</p>
          </div>
          <Link
            href="/calendar"
            className="group flex items-center gap-1.5 text-xs font-medium text-gold transition-colors hover:text-gold-deep"
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Open calendar
            <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <WeekStrip byDay={byDay} currency={settings.currency} />
      </motion.section>

      {/* -------------------------- Journal memory -------------------------- */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.55, delay: 0.44, ease: EASE }}
        className="panel p-5 sm:p-6"
        aria-label="Recent journal entries"
      >
        <div className="mb-2 flex items-center justify-between">
          <div>
            <h2 className="font-display text-base font-semibold tracking-tight text-ink">Journal memory</h2>
            <p className="text-xs text-muted">Your latest sessions</p>
          </div>
          <Link
            href="/journal"
            className="group flex items-center gap-1.5 text-xs font-medium text-gold transition-colors hover:text-gold-deep"
          >
            <BookOpenIcon className="h-3.5 w-3.5" />
            Open journal
            <ArrowRightIcon className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
          </Link>
        </div>
        <div className="divide-y divide-line-soft">
          {recentEntries.map((e) => (
            <Link
              key={e.id}
              href="/journal"
              className="group flex items-center gap-4 py-3 transition-colors first:pt-1 last:pb-0"
            >
              <span className="w-20 shrink-0 text-xs text-muted">{formatDateMedium(e.date)}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium text-ink">
                    {e.instrument !== "—" ? e.instrument : e.setup || "Session"}
                  </span>
                  {e.setup && <span className="hidden truncate text-xs text-faint sm:inline">{e.setup}</span>}
                </span>
                {e.notes && <span className="mt-0.5 block truncate text-xs text-muted">{e.notes}</span>}
              </span>
              <span
                className={cn(
                  "num shrink-0 text-sm",
                  e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted",
                )}
              >
                {formatSignedMoney(e.pnl, settings.currency)}
              </span>
              <ArrowRightIcon className="h-3.5 w-3.5 shrink-0 text-faint opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </motion.section>
    </div>
  );
}

/* ------------------------------- pieces -------------------------------- */

function Header({ greeting, firstName, children }: { greeting: string; firstName: string; children?: React.ReactNode }) {
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
        <p className="mt-1 text-sm capitalize text-muted">{formatDateFull(todayKey())}</p>
      </div>
      {children}
    </header>
  );
}

function MiniStat({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: string;
  note?: string;
  tone: "neutral" | "profit" | "gold";
  icon?: React.ReactNode;
}) {
  return (
    <div className="panel panel-hover px-5 py-4">
      <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-faint">
        {icon}
        {label}
      </p>
      <p
        className={cn(
          "kpi mt-2 truncate text-xl",
          tone === "profit" ? "text-profit" : tone === "gold" ? "text-gold" : "text-ink",
        )}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

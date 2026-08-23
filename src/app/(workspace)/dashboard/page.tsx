"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { computeStats, currentStreak } from "@/lib/stats";
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
import { EmptyState, Pill } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import {
  AwardIcon,
  BookOpenIcon,
  FlameIcon,
  PlusIcon,
  ShieldIcon,
  SparklesIcon,
  TargetIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  WalletIcon,
} from "@/components/ui/icons";

export default function DashboardPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const openNewEntry = useUi((s) => s.openNewEntry);

  const stats = useMemo(() => computeStats(entries, settings), [entries, settings]);
  const streak = useMemo(() => currentStreak(stats.daily), [stats.daily]);

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const firstName = (user?.name ?? "").split(" ")[0] || "trader";

  // Animated counters
  const totalPnl = useCountUp(stats.totalPnl);
  const equity = useCountUp(stats.currentEquity);
  const avgDay = useCountUp(stats.avgDayPnl);

  if (entries.length === 0) {
    return (
      <div className="space-y-6">
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

  return (
    <div className="space-y-6">
      <Header greeting={greeting} firstName={firstName}>
        <Button variant="gold" size="sm" onClick={openNewEntry} className="hidden lg:inline-flex">
          <PlusIcon className="h-4 w-4" />
          Add trade
        </Button>
      </Header>

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
          label="Equity"
          value={formatMoney(equity, settings.currency)}
          sub={
            <span className="flex items-center gap-2">
              <TargetIcon className="h-3.5 w-3.5 text-gold" />
              {Math.round(stats.targetProgress * 100)}% of{" "}
              {formatMoney(settings.targetEquity, settings.currency, { compact: true })} target
            </span>
          }
          icon={<WalletIcon className="h-4 w-4" />}
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
          transition={{ duration: 0.5, delay: 0.17, ease: [0.16, 1, 0.3, 1] }}
          whileHover={{ y: -3 }}
          className="panel panel-hover relative overflow-hidden p-5"
        >
          <div aria-hidden className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full bg-loss/[0.06] blur-3xl" />
          <div className="relative flex items-start justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Drawdown</p>
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-raised text-loss">
              <ShieldIcon className="h-4 w-4" />
            </span>
          </div>
          <p className="relative mt-2.5 font-mono text-[26px] font-bold leading-none tabular text-ink">
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
          transition={{ duration: 0.55, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="panel p-5 sm:p-6 xl:col-span-2"
          aria-label="Equity curve chart"
        >
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-base font-semibold tracking-tight text-ink">Equity curve</h2>
              <p className="text-xs text-muted">From {formatMoney(settings.startingEquity, settings.currency)} start</p>
            </div>
            <Pill className="font-mono">
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
            transition={{ duration: 0.55, delay: 0.26, ease: [0.16, 1, 0.3, 1] }}
            className="panel flex flex-col items-center justify-center gap-4 p-5 sm:flex-row sm:justify-around"
            aria-label="Win rate"
          >
            <WinRateDonut winRate={stats.winRate} />
            <div className="space-y-2.5 text-sm">
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2 w-2 rounded-full bg-profit" /> Winning days
                </span>
                <span className="font-mono font-semibold tabular text-ink">{stats.winningDays}</span>
              </div>
              <div className="flex items-center justify-between gap-6">
                <span className="flex items-center gap-2 text-muted">
                  <span className="h-2 w-2 rounded-full bg-loss" /> Losing days
                </span>
                <span className="font-mono font-semibold tabular text-ink">{stats.losingDays}</span>
              </div>
              {stats.breakEvenDays > 0 && (
                <div className="flex items-center justify-between gap-6">
                  <span className="flex items-center gap-2 text-muted">
                    <span className="h-2 w-2 rounded-full bg-faint" /> Flat days
                  </span>
                  <span className="font-mono font-semibold tabular text-ink">{stats.breakEvenDays}</span>
                </div>
              )}
            </div>
          </motion.section>

          {/* Best & worst */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="panel grid grid-cols-2 divide-x divide-line overflow-hidden"
          >
            <div className="p-5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                <AwardIcon className="h-3.5 w-3.5 text-profit" /> Best day
              </p>
              <p className="mt-2 font-mono text-lg font-bold tabular text-profit">
                {stats.bestDay ? formatSignedMoney(stats.bestDay.pnl, settings.currency) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">{stats.bestDay ? formatDateMedium(stats.bestDay.date) : ""}</p>
            </div>
            <div className="p-5">
              <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
                <TrendingDownIcon className="h-3.5 w-3.5 text-loss" /> Worst day
              </p>
              <p className="mt-2 font-mono text-lg font-bold tabular text-loss">
                {stats.worstDay ? formatSignedMoney(stats.worstDay.pnl, settings.currency) : "—"}
              </p>
              <p className="mt-0.5 text-[11px] text-faint">{stats.worstDay ? formatDateMedium(stats.worstDay.date) : ""}</p>
            </div>
          </motion.div>
        </div>
      </div>

      {/* ------------------------- Daily bars row -------------------------- */}
      <div className="grid gap-4 xl:grid-cols-3">
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.34, ease: [0.16, 1, 0.3, 1] }}
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
          transition={{ duration: 0.55, delay: 0.38, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 gap-4"
        >
          <MiniStat
            label="Remaining to target"
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
          className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl"
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
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-faint">
        {icon}
        {label}
      </p>
      <p
        className={`mt-2 truncate font-mono text-xl font-bold tabular ${
          tone === "profit" ? "text-profit" : tone === "gold" ? "text-gold" : "text-ink"
        }`}
      >
        {value}
      </p>
      {note && <p className="mt-1 text-[11px] text-muted">{note}</p>}
    </div>
  );
}

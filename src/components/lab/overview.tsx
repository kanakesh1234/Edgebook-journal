"use client";

import { useMemo, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { BacktestSessionSummary } from "@/lib/backtesting/types";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { challengeReminder } from "@/lib/challenges";
import { formatMoney, formatSignedMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { EmptyState, pnlClass } from "@/components/ui/misc";
import { CandlestickIcon, ChevronRightIcon, FlagIcon, FlaskIcon, PlusIcon, SparklesIcon, StarIcon } from "@/components/ui/icons";
import { EASE, Monogram, Progress, StatusPill, btnText, btnPrimary, plural } from "./lab-ui";
import { CHALLENGE_STATUS, ago, btStatus, fmtPct0, isResumable, type ChallengeInfo, type LabTab, type SetupInfo } from "./lab-model";
import { useLab } from "./lab-overlays";

/**
 * Overview — where you stand right now.
 * The primary challenge leads, then whatever is in flight, then a short look at
 * the playbook, other challenges and recent replays. Each section links to its tab.
 */
export function Overview({
  setups,
  challenges,
  sessions,
  showEmpty,
  onTab,
}: {
  setups: SetupInfo[];
  challenges: ChallengeInfo[];
  sessions: BacktestSessionSummary[];
  showEmpty: boolean;
  onTab: (t: LabTab) => void;
}) {
  const lab = useLab();
  const openNewEntry = useUi((s) => s.openNewEntry);

  const primary = challenges.find((c) => c.primary) ?? null;
  const others = challenges.filter((c) => !c.primary).slice(0, 3);
  const bySeen = useMemo(() => [...sessions].sort((a, b) => (b.lastModified || b.createdAt) - (a.lastModified || a.createdAt)), [sessions]);
  const resume = bySeen.find(isResumable) ?? null;
  const recent = bySeen.slice(0, 3);
  const topSetups = useMemo(
    () =>
      [...setups]
        .sort((a, b) => Number(b.stats.trades > 0) - Number(a.stats.trades > 0) || b.stats.totalPnl - a.stats.totalPnl)
        .slice(0, 4),
    [setups],
  );

  let step = 0;
  const next = () => step++;

  return (
    <div className="space-y-9">
      {showEmpty && (
        <Reveal i={next()}>
          <EmptyState
            className="py-14"
            icon={<FlaskIcon className="h-7 w-7" />}
            title="Your playbook is ready"
            body="Define your setups — each one a set of rules you can check before every entry. Log or import your first trade and MINATO starts measuring execution against them."
            action={
              <>
                <Button variant="gold" onClick={openNewEntry}>
                  <PlusIcon className="h-4 w-4" />
                  Log first trade
                </Button>
                <Button variant="outline" onClick={() => void useApp.getState().loadDemoData()}>
                  <SparklesIcon className="h-4 w-4" />
                  Load demo data
                </Button>
              </>
            }
          />
        </Reveal>
      )}

      <Reveal i={next()}>
        <Focus primary={primary} hasChallenges={challenges.length > 0} onChoose={() => onTab("challenges")} />
      </Reveal>

      {resume && (
        <Reveal i={next()}>
          <button type="button" className="lb-continue" onClick={() => lab.openSession(resume.id)}>
            <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[12px] border border-line bg-raised text-gold shadow-panel">
              <CandlestickIcon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-[11px] font-medium uppercase tracking-[0.1em] text-gold-deep dark:text-gold">Continue backtest</span>
              <span className="mt-1 block truncate text-[16px] font-semibold tracking-[-0.015em] text-ink">{resume.sessionName}</span>
              <span className="mt-0.5 block truncate text-[13px] text-muted">
                {resume.instruments.join(" + ")} · {resume.timeframe}
                {resume.lastModified > 0 && ` · Opened ${ago(resume.lastModified)}`}
              </span>
            </span>
            <ChevronRightIcon className="h-5 w-5 shrink-0 text-faint" />
          </button>
        </Reveal>
      )}

      {!showEmpty && (
        <Reveal i={next()}>
          <Section title="Playbook" count={setups.length} onAll={setups.length > 0 ? () => onTab("setups") : undefined}>
            {topSetups.length === 0 ? (
              <button type="button" className="lb-row" onClick={lab.newSetup}>
                <Monogram name="+" className="h-9 w-9 text-[15px]" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">Define your first setup</span>
                  <span className="block text-[13px] text-muted">Rules you can check before every entry.</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
              </button>
            ) : (
              topSetups.map(({ setup, rules, stats }) => (
                <button key={setup.id} type="button" className="lb-row" onClick={() => lab.openSetup(setup.id)}>
                  <Monogram name={setup.name} className="h-9 w-9 text-[15px]" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{setup.name}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {plural(rules.length, "rule")} · {plural(stats.trades, "trade")}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("block text-[15px] font-semibold tabular-nums", stats.trades > 0 ? pnlClass(stats.totalPnl) : "text-faint")}>
                      {stats.trades > 0 ? formatSignedMoney(stats.totalPnl) : "—"}
                    </span>
                    <span className="block text-[12.5px] tabular-nums text-muted">{fmtPct0(stats.winRate)} win</span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
                </button>
              ))
            )}
          </Section>
        </Reveal>
      )}

      {others.length > 0 && (
        <Reveal i={next()}>
          <Section title="Other challenges" count={challenges.length - (primary ? 1 : 0)} onAll={() => onTab("challenges")}>
            {others.map(({ challenge: c, progress: p, status }) => (
              <button key={c.id} type="button" className="lb-row" onClick={() => lab.openChallenge(c.id)}>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium text-ink">{c.name}</span>
                    {status !== "active" && <StatusPill tone={CHALLENGE_STATUS[status].tone}>{CHALLENGE_STATUS[status].label}</StatusPill>}
                  </span>
                  <span className="mt-2 block">
                    <Progress value={p.progress} tone={status === "completed" ? "profit" : status === "breached" ? "loss" : undefined} label={`${p.progressPct}% of challenge progress`} />
                  </span>
                </span>
                <span className="shrink-0 text-right">
                  <span className={cn("block text-[15px] font-semibold tabular-nums", p.trades > 0 ? pnlClass(p.currentPnl) : "text-faint")}>
                    {p.trades > 0 ? formatSignedMoney(p.currentPnl) : "—"}
                  </span>
                  <span className="block text-[12.5px] tabular-nums text-muted">{p.progressPct}%</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
              </button>
            ))}
          </Section>
        </Reveal>
      )}

      {recent.length > 0 && (
        <Reveal i={next()}>
          <Section title="Recent backtests" count={sessions.length} onAll={() => onTab("backtests")}>
            {recent.map((s) => {
              const st = btStatus(s.status);
              return (
                <button key={s.id} type="button" className="lb-row" onClick={() => lab.openSession(s.id)}>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium text-ink">{s.sessionName}</span>
                    <span className="block truncate text-[13px] text-muted">
                      {s.instruments.join(" + ")} · {s.timeframe}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className={cn("block text-[15px] font-semibold tabular-nums", s.totalTrades > 0 ? pnlClass(s.netPnl) : "text-faint")}>
                      {s.totalTrades > 0 ? `${s.netPnl > 0 ? "+" : ""}${formatMoney(s.netPnl)}` : "—"}
                    </span>
                    <span className="mt-0.5 block">
                      <StatusPill tone={st.tone}>{st.label}</StatusPill>
                    </span>
                  </span>
                  <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
                </button>
              );
            })}
          </Section>
        </Reveal>
      )}
    </div>
  );
}

/* -------------------------------- pieces -------------------------------- */

function Reveal({ i, children }: { i: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: reduce ? 0 : Math.min(i * 0.06, 0.24), ease: EASE }}
    >
      {children}
    </motion.div>
  );
}

function Section({ title, count, onAll, children }: { title: string; count: number; onAll?: () => void; children: ReactNode }) {
  return (
    <section aria-label={title}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-[19px] font-semibold tracking-[-0.02em] text-ink">
          {title}
          {count > 0 && <span className="ml-2 text-[15px] font-normal tabular-nums text-faint">{count}</span>}
        </h2>
        {onAll && (
          <button type="button" className={cn(btnText, "-mr-2.5")} onClick={onAll}>
            See all
            <ChevronRightIcon className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="lb-group">{children}</div>
    </section>
  );
}

/** The one challenge Home, the calendar and MINATO follow — or a prompt to pick/start one. */
function Focus({ primary, hasChallenges, onChoose }: { primary: ChallengeInfo | null; hasChallenges: boolean; onChoose: () => void }) {
  const lab = useLab();

  if (!primary) {
    return (
      <article className="lb-card">
        <div className="lb-focus">
          <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Primary challenge</p>
          <h2 className="mt-2 font-display text-[22px] font-semibold tracking-[-0.02em] text-ink">
            {hasChallenges ? "Choose a primary challenge" : "Start your first challenge"}
          </h2>
          <p className="mt-1.5 max-w-md text-[14.5px] leading-relaxed text-muted">
            {hasChallenges
              ? "Home, the calendar and MINATO follow one challenge at a time. Pick the one you're working on."
              : "A funded evaluation, a consistency month, a personal A+ execution period. Every trade you log against it builds its progress."}
          </p>
          <div className="mt-5">
            {hasChallenges ? (
              <button type="button" className={btnPrimary} onClick={onChoose}>
                <FlagIcon className="h-4 w-4" />
                Choose challenge
              </button>
            ) : (
              <button type="button" className={btnPrimary} onClick={lab.newChallenge}>
                <PlusIcon className="h-4 w-4" />
                New challenge
              </button>
            )}
          </div>
        </div>
      </article>
    );
  }

  const { challenge: c, progress: p, status } = primary;
  const st = CHALLENGE_STATUS[status];
  const reminder = challengeReminder(p);
  return (
    <article className="lb-card" data-primary="true">
      <div className="lb-focus">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.1em] text-gold-deep dark:text-gold">
              <StarIcon className="h-3 w-3" />
              Primary challenge
            </p>
            <h2 className="mt-2 text-[22px] font-semibold leading-tight tracking-[-0.02em] text-ink">
              <button type="button" className="lb-hit" onClick={() => lab.openChallenge(c.id)} aria-label={`Open challenge ${c.name} (primary)`}>
                {c.name}
              </button>
            </h2>
          </div>
          <StatusPill tone={st.tone}>{st.label}</StatusPill>
        </div>

        <div className="mt-6 flex items-end justify-between gap-3">
          <p className={cn("kpi text-[40px] tabular-nums sm:text-[46px]", p.trades > 0 ? pnlClass(p.currentPnl) : "text-faint")}>
            {p.trades > 0 ? formatSignedMoney(p.currentPnl) : "—"}
          </p>
          <p className="pb-2 text-[14px] tabular-nums text-muted">{p.progressPct}% to target</p>
        </div>
        <div className="mt-3">
          <Progress value={p.progress} tone={status === "completed" ? "profit" : status === "breached" ? "loss" : undefined} size="lg" label={`${p.progressPct}% of challenge progress`} />
        </div>
        <div className="mt-2 flex justify-between text-[12.5px] tabular-nums text-faint">
          <span>{formatMoney(p.startingBalance)}</span>
          <span>{formatMoney(p.targetBalance)}</span>
        </div>
        {reminder && <p className="mt-4 max-w-xl text-[14px] leading-relaxed text-muted">{reminder}</p>}
      </div>

      <dl className="lb-foot">
        <div>
          <dt>Balance</dt>
          <dd>{formatMoney(p.currentEquity)}</dd>
        </div>
        <div>
          <dt>Cushion</dt>
          <dd className={cn(p.maxDrawdown > 0 && (p.breached || p.remainingDrawdown <= p.maxDrawdown * 0.25 ? "text-loss" : "text-profit"))}>
            {p.maxDrawdown > 0 ? formatSignedMoney(p.drawdownCushion) : "—"}
          </dd>
        </div>
        <div>
          <dt>Win rate</dt>
          <dd>{fmtPct0(p.winRate)}</dd>
        </div>
      </dl>
    </article>
  );
}

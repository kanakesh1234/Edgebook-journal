"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { addDays, formatDateMedium, weekdayShort } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Sym } from "@/components/journal/symbols";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { analyzePeriodThoughts } from "@/lib/ai-brain";
import { buildReviewEquityPoints, buildWeek, type ReviewContext } from "@/lib/review/metrics";
import { weekLabel } from "@/lib/review/period";
import { PSYCH_PATTERNS } from "@/lib/review/mistakes";
import { EquityCurve } from "@/components/charts/equity-curve";
import { cn } from "@/lib/utils";
import {
  AnimatedNumber,
  AutoText,
  CarriedCommitments,
  Card,
  Chip,
  DrawCheck,
  EvidenceButton,
  fmtPct,
  fmtR,
  Kpi,
  LineInput,
  Prompt,
  QuestionReveal,
  REVIEW_EXPAND,
  REVIEW_SMOOTH,
  ReviewDisclosure,
  ReviewIconTile,
  ReviewScrollBar,
  SaveIndicator,
  Section,
  SectionReveal,
  StatStrip,
  StripCell,
  TableShell,
  Td,
  Th,
  tone,
  useMoney,
  useReviewSettledReveal,
} from "./review-ui";
import { heat, WinRateRing } from "./review-charts";
import { MistakeReplaySpotlight, PeriodTradesList, TradeScreenshotsGallery } from "./review-evidence";
import { useReviewNotes } from "./use-review-notes";
import type { ReviewActions } from "./reviews-panel";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

export function WeeklyReview({ ctx, monday, actions }: { ctx: ReviewContext; monday: string; actions: ReviewActions }) {
  const { money, signed } = useMoney();
  const rn = useReviewNotes("weekly", monday);
  const { notes } = rn;
  const plans = useApp((s) => s.plans);
  const week = useMemo(() => buildWeek(ctx, monday, notes.dayMarks), [ctx, monday, notes.dayMarks]);
  const sunday = addDays(monday, 6);
  const thoughtAnalysis = useMemo(
    () => analyzePeriodThoughts(ctx.entries, plans, monday, sunday),
    [ctx.entries, plans, monday, sunday],
  );
  const prevMonday = addDays(monday, -7);
  const prevCommit = useApp((s) => s.settings.reviews?.weekly?.[prevMonday]?.lists.commitments)?.filter((c) => c.trim()) ?? [];
  const t = week.totals;
  const topMistake = week.mistakes[0];

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [scrub, setScrub] = useState<number | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [moreCommitments, setMoreCommitments] = useState(false);

  const workedVal = notes.text["worked"] ?? notes.text["best-day"] ?? "";
  const leakVal = notes.text["not-worked"] ?? notes.text["worst-day"] ?? "";
  const commit0 = notes.lists["commitments"]?.[0] ?? "";
  const commit1 = notes.lists["commitments"]?.[1] ?? "";
  const commit2 = notes.lists["commitments"]?.[2] ?? "";

  const q1Reveal = useReviewSettledReveal(workedVal, leakVal.trim().length > 0 || commit0.trim().length > 0, monday, 5, 850, true);
  const q2Reveal = useReviewSettledReveal(leakVal, commit0.trim().length > 0, monday, 5, 850, q1Reveal.settled);

  const logNoSetup = async (date: string) => {
    haptic.selection();
    try {
      await useApp.getState().logNoTradeDay(date);
    } catch {
      toast.error("Could not log the day");
    }
  };
  const setPass = async (date: string, on: boolean) => {
    haptic.selection();
    if (on) await logNoSetup(date);
    rn.setMark(date, { skippedValid: on });
  };

  if (week.isFuture) {
    return (
      <EmptyState
        icon={<Sym name="calendar" className="h-6 w-6" />}
        title="This week hasn't started"
        body={`${weekLabel(monday)} is still ahead. Come back Friday after the close.`}
      />
    );
  }

  const completedQuestions = [workedVal.trim(), leakVal.trim(), commit0.trim()].filter(Boolean).length;
  const eq = useMemo(() => buildReviewEquityPoints(ctx, monday, week.curve), [ctx, monday, week.curve]);
  const eqTone = t.net > 0 ? "profit" : t.net < 0 ? "loss" : "neutral";
  const activePt = scrub != null ? (eq.points[scrub] ?? null) : null;
  const displayNet = activePt != null ? activePt.equity - eq.openingEquity : t.net;
  const displayBalance = activePt != null ? activePt.equity : (week.balance ?? eq.currentEquity);
  const bestDay = useMemo(
    () => week.days.filter((d) => d.state === "traded").sort((a, b) => b.pnl - a.pnl)[0] ?? null,
    [week.days],
  );
  const hasScreenshots = week.entries.some((e) => e.images.length > 0);

  return (
    <div className="space-y-10 pb-8">
      <ReviewScrollBar />

      {prevCommit.length > 0 && (
        <SectionReveal index={0}>
          <CarriedCommitments title="Last week's rule" items={prevCommit} done={notes.done} onToggle={(i, v) => rn.setDone(`prev:${i}`, v)} />
        </SectionReveal>
      )}

      {/* 1 — The Verdict Hero & Dynamic Equity Curve */}
      <SectionReveal index={1}>
        <Section
          id="a1"
          icon="gauge"
          title="Week at a glance"
          aside={
            <div className="flex items-center gap-2.5">
              {week.balance != null && (
                <Chip>
                  Balance <b className="font-semibold tabular-nums text-ink">{money(displayBalance)}</b>
                </Chip>
              )}
              <SaveIndicator state={rn.state} />
            </div>
          }
        >
          <Card pad={false} ambient={eqTone === "neutral" ? "gold" : eqTone}>
            {/* Hero top header + live scrub delta + win rate ring */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-5 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-[12.5px] font-medium text-muted">
                    {activePt ? (activePt.kind === "start" ? "Week open" : formatDateMedium(activePt.date)) : "Net P&L"}
                  </p>
                  {activePt && activePt.kind === "day" && (
                    <span className={cn("num rounded-full px-2 py-0.5 text-[11px] font-semibold", activePt.pnl >= 0 ? "bg-profit/12 text-profit" : "bg-loss/12 text-loss")}>
                      {signed(activePt.pnl)} session
                    </span>
                  )}
                </div>
                <p className={cn("mt-1 text-[42px] font-semibold leading-none tracking-[-0.04em] tabular-nums transition-colors sm:text-[52px]", tone(displayNet))}>
                  {activePt != null ? signed(displayNet) : <AnimatedNumber value={t.net} format={signed} />}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip tone={t.trades === 0 ? "neutral" : t.winners > t.losers ? "good" : t.losers > t.winners ? "bad" : "neutral"}>
                    {t.trades ? `${t.trades} ${t.trades === 1 ? "trade" : "trades"} · ${t.winners}W · ${t.losers}L${t.breakevens ? ` · ${t.breakevens}BE` : ""}` : "No trades"}
                  </Chip>
                  {week.isCurrent && (
                    <Chip tone="info">
                      <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" aria-hidden />
                      Live
                    </Chip>
                  )}
                </div>
              </div>

              <WinRateRing value={t.winRate} size={96} />
            </div>

            {/* Dynamic animated & interactive scrubbing curve (matches Home dashboard) */}
            <div className="relative z-10 border-t border-line-soft px-3 pb-2 pt-3 sm:px-6">
              <EquityCurve
                points={eq.points}
                currency={ctx.settings.currency}
                tone={eqTone}
                baselineLabel="Week open"
                emptyLabel="Log your first trade this week to watch your dynamic curve draw in."
                rangeKey={`week:${monday}:${ctx.challenge?.id ?? "all"}:${week.entries.length}`}
                onScrub={setScrub}
                className="h-[220px] sm:h-[268px]"
              />
            </div>

            {/* Minimal Mon–Fri tap selector to filter sessions cleanly */}
            <div className="relative z-10 grid grid-cols-5 divide-x divide-line-soft border-t border-line-soft dark:divide-line">
              {week.days.slice(0, 5).map((d) => {
                const selected = selectedDay === d.date;
                const hasTrades = d.state === "traded";
                return (
                  <button
                    key={d.date}
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setSelectedDay((cur) => (cur === d.date ? null : d.date));
                    }}
                    className={cn(
                      "flex flex-col items-center justify-center gap-0.5 px-1.5 py-2.5 text-center transition-colors",
                      selected
                        ? "bg-gold/[0.12] text-ink"
                        : "hover:bg-ink/[0.03] text-muted",
                    )}
                  >
                    <span className={cn("text-[11px] font-medium", selected && "font-semibold text-gold-deep dark:text-gold")}>
                      {weekdayShort(d.date)}
                    </span>
                    <span
                      className={cn(
                        "num text-[12px] font-semibold leading-tight",
                        hasTrades ? tone(d.pnl) : d.state === "pass" || d.state === "no-setup" ? "text-profit/80" : "text-faint/70",
                      )}
                    >
                      {hasTrades ? signed(d.pnl) : d.state === "pass" || d.state === "no-setup" ? "Pass" : d.state === "holiday" ? "Holiday" : "—"}
                    </span>
                  </button>
                );
              })}
            </div>

            <StatStrip count={4} className="relative z-10 border-t border-line-soft">
              <StripCell label="Avg R:R" value={fmtR(t.avgRR)} valueClass={tone(t.avgRR)} />
              <StripCell
                label="Sessions"
                value={
                  <>
                    {week.sessions}
                    <span className="text-[0.72em] font-medium text-faint"> / {week.tradingSlots}</span>
                  </>
                }
                sub={week.tradingSlots < 5 ? `${5 - week.tradingSlots} holiday` : undefined}
              />
              <StripCell label="Patience" value={week.noSetupDays} sub="Sat on hands" />
              <StripCell label="Grade" value={week.avgGrade ?? "—"} sub={week.avgGrade ? "Process" : undefined} />
            </StatStrip>
          </Card>

          {/* Progressive disclosure for week session breakdown & accountability actions */}
          {week.days.some((d) => d.state === "unlogged" || d.state === "traded") && (
            <ReviewDisclosure
              label="Week breakdown"
              openLabel="Hide breakdown"
              summary={
                week.unloggedDays > 0
                  ? `${week.unloggedDays} unlogged weekday${week.unloggedDays === 1 ? "" : "s"}`
                  : bestDay
                    ? `Best ${weekdayShort(bestDay.date)} (${signed(bestDay.pnl)})`
                    : "Plan adherence"
              }
              className="mt-4"
            >
              <div className="grid items-stretch gap-3 sm:grid-cols-3">
                {[
                  {
                    k: "best",
                    body: (
                      <Card className="h-full p-4">
                        <p className="text-[11.5px] font-medium text-faint">Best session</p>
                        <p className={cn("mt-1 text-[17px] font-semibold tracking-[-0.02em] tabular-nums", bestDay ? tone(bestDay.pnl) : "text-muted")}>
                          {bestDay ? `${weekdayShort(bestDay.date)} · ${signed(bestDay.pnl)}` : "No trades yet"}
                        </p>
                        <p className="mt-0.5 text-[12px] text-faint">
                          {bestDay ? `${bestDay.trades.length} ${bestDay.trades.length === 1 ? "trade" : "trades"}` : "No completed sessions"}
                        </p>
                      </Card>
                    ),
                  },
                  {
                    k: "plan",
                    body: (
                      <Card className="h-full p-4">
                        <p className="text-[11.5px] font-medium text-faint">Planned execution</p>
                        <p className="mt-1 text-[17px] font-semibold tracking-[-0.02em] tabular-nums text-ink">
                          {thoughtAnalysis.plannedTrades > 0
                            ? `${thoughtAnalysis.plannedTrades}/${thoughtAnalysis.totalTrades} · ${fmtPct(thoughtAnalysis.plannedWinRate)} won`
                            : "None logged"}
                        </p>
                        <p className="mt-0.5 truncate text-[12px] text-faint">{thoughtAnalysis.topTheme ?? "Pre-trade plan adherence"}</p>
                      </Card>
                    ),
                  },
                  {
                    k: "account",
                    body: (
                      <Card className="h-full p-4">
                        <p className="text-[11.5px] font-medium text-faint">
                          {week.unloggedDays > 0 ? `${week.unloggedDays} unlogged weekday${week.unloggedDays === 1 ? "" : "s"}` : "Week accountability"}
                        </p>
                        {week.unloggedDays > 0 ? (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {week.days
                              .filter((d) => d.state === "unlogged")
                              .map((d) => (
                                <button
                                  key={d.date}
                                  type="button"
                                  onClick={() => void setPass(d.date, true)}
                                  className="inline-flex h-7 items-center gap-1 rounded-full bg-gold/14 px-2.5 text-[11.5px] font-semibold text-gold-deep transition-colors hover:bg-gold/25 active:scale-95 dark:text-gold"
                                >
                                  <Sym name="shield" className="h-3 w-3" />
                                  {weekdayShort(d.date)}: No setup
                                </button>
                              ))}
                          </div>
                        ) : (
                          <>
                            <p className="mt-1 text-[17px] font-semibold tracking-[-0.02em] text-profit">All days logged</p>
                            <p className="mt-0.5 text-[12px] text-faint">Consistent daily cadence</p>
                          </>
                        )}
                      </Card>
                    ),
                  },
                ].map((item, i) => (
                  <motion.div
                    key={item.k}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.06, duration: 0.42, ease: REVIEW_SMOOTH }}
                    className="h-full"
                  >
                    {item.body}
                  </motion.div>
                ))}
              </div>
            </ReviewDisclosure>
          )}
        </Section>
      </SectionReveal>

      {/* 2 — Repeating Mistake Replay Spotlight */}
      {topMistake && topMistake.entryIds.length > 0 && (
        <SectionReveal index={2}>
          <Section
            id="a2"
            icon="repeat"
            title={topMistake.count >= 2 ? "Repeating mistake · Replay" : "Mistake replay"}
            hint="Watch the setup unfold candle-by-candle to catch the trigger before Monday."
          >
            <MistakeReplaySpotlight
              mistake={topMistake}
              allMistakes={week.mistakes}
              entries={week.entries}
              onOpenTrade={actions.openTrade}
            />
          </Section>
        </SectionReveal>
      )}

      {/* 3 — Chart Screenshots & Trades Taken */}
      {(hasScreenshots || week.log.length > 0) && (
        <SectionReveal index={3}>
          <Section
            id="a4"
            icon="photo"
            title="What happened · Trades &amp; charts"
            aside={
              week.log.length > 0 ? (
                <span className="text-[12.5px] font-medium tabular-nums text-muted">
                  {week.log.length} {week.log.length === 1 ? "trade" : "trades"}
                </span>
              ) : null
            }
          >
            <div className="space-y-4">
              {hasScreenshots && (
                <TradeScreenshotsGallery entries={week.entries} onOpenTrade={actions.openTrade} />
              )}
              <PeriodTradesList
                rows={week.log}
                actions={actions}
                initialLimit={6}
                filterDate={selectedDay}
                onClearFilter={() => setSelectedDay(null)}
                emptyLabel="No trades logged this week."
              />
            </div>
          </Section>
        </SectionReveal>
      )}

      {/* 4 — Edge & Matrix (Progressive Disclosure) */}
      <SectionReveal index={4}>
        <Section id="a3" icon="sparkles" title="Edge &amp; discipline">
          <Card pad={false} className="overflow-hidden">
            <div className="grid divide-y divide-line-soft sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile="bg-profit" icon="arrowUpRight" />
                <Kpi
                  label="Strongest edge"
                  value={week.strongest?.label ?? "Confirm checklist rules"}
                  sub={week.strongest ? `${fmtPct(week.strongest.winRate)} win rate (${week.strongest.wins}/${week.strongest.present})` : "Log criteria in Plan"}
                />
              </div>

              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile={topMistake ? "bg-loss" : "bg-gradient-to-b from-gold-strong to-gold-deep"} icon="shield" />
                <Kpi
                  label="Primary leak"
                  value={topMistake ? topMistake.label : "Clean execution"}
                  sub={topMistake ? `${topMistake.count}×${topMistake.lost > 0 ? ` · ${signed(-topMistake.lost)}` : ""}` : "Zero tagged mistakes"}
                />
              </div>
            </div>

            <div className="border-t border-line-soft px-5 py-2.5 sm:px-6">
              <button
                type="button"
                aria-expanded={matrixOpen}
                onClick={() => {
                  haptic.selection();
                  setMatrixOpen((v) => !v);
                }}
                className="flex w-full items-center justify-between py-0.5 text-left text-[13px] font-medium text-muted outline-none transition-colors hover:text-ink"
              >
                <span>{matrixOpen ? "Hide breakdown" : "Inspect criteria & pattern matrix"}</span>
                <Sym name="chevronDown" className={cn("h-4 w-4 transition-transform duration-300", matrixOpen && "rotate-180")} strokeWidth={2} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {matrixOpen && (
                <motion.div
                  key="weekly-matrix"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={REVIEW_EXPAND}
                  className="overflow-hidden border-t border-line-soft"
                >
                  {week.criteria.length > 0 && (
                    <div className="px-3 pb-3 pt-4">
                      <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint/70">Criteria Win Rates</p>
                      <TableShell min={520}>
                        <thead>
                          <tr>
                            <Th className="pl-4">Criterion</Th>
                            <Th className="text-right">Present</Th>
                            <Th className="text-right">Won</Th>
                            <Th className="text-right">Lost</Th>
                            <Th className="pr-4 text-right">Win rate</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {week.criteria.map((c, i) => (
                            <tr key={c.key} className={cn("rounded-lg transition-colors hover:bg-ink/[0.03]", i % 2 === 0 && "bg-ink/[0.022]")}>
                              <Td className="max-w-[260px] pl-4 font-medium">{c.label}</Td>
                              <Td className="text-right tabular-nums">
                                <EvidenceButton count={c.present} label={`Open ${c.present} trades with ${c.label}`} onClick={() => actions.openIds(c.entryIds, c.label)} />
                              </Td>
                              <Td className="text-right tabular-nums text-profit">{c.wins}</Td>
                              <Td className="text-right tabular-nums text-loss">{c.losses}</Td>
                              <Td className="pr-4 text-right">
                                <span className={cn("inline-block min-w-14 rounded-full px-2.5 py-1 text-center text-[12px] font-semibold tabular-nums", heat(c.winRate, c.present))}>
                                  {fmtPct(c.winRate)}
                                </span>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </TableShell>
                    </div>
                  )}
                  <div className="px-3 pb-4 pt-4">
                    <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-faint/70">Pattern Matrix</p>
                    <TableShell min={540}>
                      <thead>
                        <tr>
                          <Th className="pl-4">Pattern</Th>
                          {DAY_NAMES.map((n) => (
                            <Th key={n} className="text-center">
                              {n}
                            </Th>
                          ))}
                          <Th className="pr-4 text-right">Total</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...week.patterns.rows.filter((r) => PSYCH_PATTERNS.some((p) => p.key === r.key) || r.total > 0), week.patterns.correct].map((r, i) => {
                          const good = r.key === "correct";
                          return (
                            <tr key={r.key} className={cn("rounded-lg transition-colors", good ? "bg-profit/[0.04]" : i % 2 === 0 ? "bg-ink/[0.022]" : "hover:bg-ink/[0.03]")}>
                              <Td className="pl-4 font-medium">
                                <span className={cn(good && "text-profit")}>{r.label}</span>
                                {r.manual && <span className="ml-2 text-[10.5px] font-medium text-faint/60">· self-reported</span>}
                              </Td>
                              {week.days.slice(0, 5).map((d) => {
                                const n = r.perDay[d.date] ?? 0;
                                const blocked = d.state === "holiday" || d.state === "upcoming";
                                if (r.manual) {
                                  const key = r.key === "skipped" ? "skippedValid" : "biasLock";
                                  const on = !!notes.dayMarks[d.date]?.[key];
                                  return (
                                    <Td key={d.date} className="text-center">
                                      <button
                                        type="button"
                                        role="checkbox"
                                        aria-checked={on}
                                        aria-label={`${r.label} on ${weekdayShort(d.date)}`}
                                        disabled={blocked}
                                        onClick={() => (r.key === "skipped" ? void setPass(d.date, !on) : rn.setMark(d.date, { biasLock: !on }))}
                                        className={cn(
                                          "mx-auto grid h-[22px] w-[22px] place-items-center rounded-[6px] border outline-none transition-[background-color,border-color,transform] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-90 disabled:opacity-30",
                                          on ? "border-loss bg-loss text-white" : "border-line-strong/60 hover:border-faint hover:bg-ink/[0.04]",
                                        )}
                                      >
                                        {on && <DrawCheck className="h-3 w-3" />}
                                      </button>
                                    </Td>
                                  );
                                }
                                return (
                                  <Td key={d.date} className="text-center">
                                    <span
                                      className={cn(
                                        "inline-grid h-[22px] min-w-[22px] place-items-center rounded-[6px] px-1 text-[12px] font-semibold tabular-nums",
                                        n === 0 ? "text-faint/40" : good ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
                                      )}
                                    >
                                      {n || "·"}
                                    </span>
                                  </Td>
                                );
                              })}
                              <Td className="pr-4 text-right">
                                {r.manual ? (
                                  <span className={cn("text-[12.5px] font-semibold tabular-nums", r.total ? "text-loss" : "text-faint/40")}>{r.total}</span>
                                ) : (
                                  <EvidenceButton count={r.total} label={`Open ${r.total} trades: ${r.label}`} onClick={() => actions.openIds(r.entryIds, r.label)} />
                                )}
                              </Td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </TableShell>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </Section>
      </SectionReveal>

      {/* 5 — Guided Sequenced Reflection & Completion */}
      <SectionReveal index={5}>
        <Section
          id="a5"
          icon="target"
          title="Close the week"
          aside={
            <Chip tone={completedQuestions === 3 ? "good" : "gold"}>
              {completedQuestions === 3 ? <DrawCheck className="h-3 w-3" /> : <Sym name="sparkles" className="h-3 w-3" />}
              {completedQuestions === 3 ? "Week reviewed" : `${completedQuestions}/3`}
            </Chip>
          }
        >
          <Card className="p-5 sm:p-7">
            <Prompt
              step={1}
              done={q1Reveal.settled && workedVal.trim().length > 0}
              typing={q1Reveal.typing}
              q="What worked best?"
            >
              <AutoText
                label="What worked best"
                minRows={2}
                value={workedVal}
                onChange={(v) => rn.setText("worked", v)}
                onChipSelect={q1Reveal.triggerChipSettle}
                placeholder="Write what you executed well…"
              />
            </Prompt>

            <AnimatePresence>
              {q1Reveal.settled && (
                <QuestionReveal key="wk-q2" delay={0.12}>
                  <Prompt
                    step={2}
                    done={q2Reveal.settled && leakVal.trim().length > 0}
                    typing={q2Reveal.typing}
                    q="#1 leak to cut?"
                  >
                    <AutoText
                      label="Biggest leak"
                      minRows={2}
                      value={leakVal}
                      onChange={(v) => rn.setText("not-worked", v)}
                      onChipSelect={q2Reveal.triggerChipSettle}
                      placeholder="The habit to leave behind…"
                    />
                  </Prompt>
                </QuestionReveal>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {q2Reveal.settled && (
                <QuestionReveal key="wk-q3" delay={0.12}>
                  <Prompt
                    step={3}
                    done={commit0.trim().length > 0}
                    q="ONE rule for Monday?"
                  >
                    <div className="space-y-3">
                      <LineInput
                        index={1}
                        label="Rule for next week"
                        value={commit0}
                        onChange={(v) => rn.setListItem("commitments", 0, v)}
                        placeholder="Your #1 rule for Monday…"
                      />

                      {moreCommitments || commit1.trim().length > 0 || commit2.trim().length > 0 ? (
                        <div className="space-y-2.5 pt-1">
                          <LineInput
                            index={2}
                            label="Rule 2"
                            value={commit1}
                            onChange={(v) => rn.setListItem("commitments", 1, v)}
                            placeholder="Optional…"
                          />
                          <LineInput
                            index={3}
                            label="Rule 3"
                            value={commit2}
                            onChange={(v) => rn.setListItem("commitments", 2, v)}
                            placeholder="Optional…"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            haptic.selection();
                            setMoreCommitments(true);
                          }}
                          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
                        >
                          <span>+ Add more</span>
                        </button>
                      )}
                    </div>
                  </Prompt>
                </QuestionReveal>
              )}
            </AnimatePresence>
          </Card>
        </Section>
      </SectionReveal>
    </div>
  );
}

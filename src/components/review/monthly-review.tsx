"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { formatDateMedium } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Sym } from "@/components/journal/symbols";
import { EmptyState } from "@/components/ui/misc";
import { analyzePeriodThoughts } from "@/lib/ai-brain";
import { buildMonth, type ReviewContext } from "@/lib/review/metrics";
import { addMonths, monthTitle, weekLabel } from "@/lib/review/period";
import { PSYCH_PATTERNS } from "@/lib/review/mistakes";
import { cn } from "@/lib/utils";
import {
  AnimatedNumber,
  AutoText,
  CarriedCommitments,
  Card,
  Chip,
  DirTag,
  DrawCheck,
  EvidenceButton,
  fmtPct,
  fmtR,
  GradeBadge,
  Group,
  Kpi,
  LineInput,
  Prompt,
  QuestionReveal,
  REVIEW_EXPAND,
  ReviewIconTile,
  SaveIndicator,
  Section,
  SectionReveal,
  StatRow,
  StatStrip,
  StripCell,
  TableShell,
  Td,
  Th,
  tone,
  useMoney,
  useReviewSettledReveal,
} from "./review-ui";
import { heat } from "./review-charts";
import { useReviewNotes } from "./use-review-notes";
import type { ReviewActions } from "./reviews-panel";

export function MonthlyReview({ ctx, month, actions }: { ctx: ReviewContext; month: string; actions: ReviewActions }) {
  const { money, signed } = useMoney();
  const reduce = useReducedMotion();
  const rn = useReviewNotes("monthly", month);
  const { notes } = rn;
  const plans = useApp((s) => s.plans);
  const weekly = useApp((s) => s.settings.reviews?.weekly);
  const prevCommit = useApp((s) => s.settings.reviews?.monthly?.[addMonths(month, -1)]?.lists.commitments)?.filter((c) => c.trim()) ?? [];
  const m = useMemo(() => buildMonth(ctx, month, (mon) => weekly?.[mon]?.dayMarks), [ctx, month, weekly]);
  const thoughtAnalysis = useMemo(
    () => analyzePeriodThoughts(ctx.entries, plans, `${month}-01`, `${month}-31`),
    [ctx.entries, plans, month],
  );
  const t = m.totals;

  const [matrixOpen, setMatrixOpen] = useState(false);
  const [showAllTrades, setShowAllTrades] = useState(false);
  const [moreRules, setMoreRules] = useState(false);

  const wonVal = notes.text["won"] ?? notes.text["edge"] ?? "";
  const lostVal = notes.text["lost"] ?? notes.text["curve"] ?? "";
  const commit0 = notes.lists["commitments"]?.[0] ?? "";
  const commit1 = notes.lists["commitments"]?.[1] ?? "";
  const commit2 = notes.lists["commitments"]?.[2] ?? "";

  const q1Reveal = useReviewSettledReveal(wonVal, lostVal.trim().length > 0 || commit0.trim().length > 0, month, 5, 850, true);
  const q2Reveal = useReviewSettledReveal(lostVal, commit0.trim().length > 0, month, 5, 850, q1Reveal.settled);

  if (m.isFuture) {
    return (
      <EmptyState
        icon={<Sym name="calendar" className="h-6 w-6" />}
        title="This month hasn't started"
        body={`${monthTitle(month)} is still ahead. Complete this review on the last trading day of the month.`}
      />
    );
  }

  const topCrit = [...m.criteria].filter((c) => c.present >= 2 && c.winRate != null).sort((a, b) => b.winRate! - a.winRate! || b.present - a.present)[0] ?? m.criteria[0];
  const costly = [...m.mistakes].filter((x) => x.lost > 0).sort((a, b) => b.lost - a.lost)[0] ?? m.mistakes[0];
  const p = m.prop;
  const hardest = m.worstWeek && m.worstWeek !== m.bestWeek ? m.worstWeek : null;
  const maxDrawdown = m.drawdowns[0];
  const bestStreak = m.streaks[0];

  const completedQuestions = [wonVal.trim(), lostVal.trim(), commit0.trim()].filter(Boolean).length;
  const visibleTrades = showAllTrades ? m.log : m.log.slice(0, 8);

  return (
    <div className="space-y-8">
      {prevCommit.length > 0 && (
        <SectionReveal index={0}>
          <CarriedCommitments title="Last month's commitments" items={prevCommit} done={notes.done} onToggle={(i, v) => rn.setDone(`prev:${i}`, v)} />
        </SectionReveal>
      )}

      {/* 1 — Scorecard */}
      <SectionReveal index={1}>
        <Section
          id="b1"
          code="B.1"
          icon="gauge"
          title="Scorecard"
          aside={
            <div className="flex items-center gap-2.5">
              {m.balance != null && (
                <Chip>
                  Balance <b className="num font-semibold text-ink">{money(m.balance)}</b>
                </Chip>
              )}
              <SaveIndicator state={rn.state} />
            </div>
          }
        >
          <Card pad={false} className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
              <div>
                <p className="text-[12.5px] font-medium text-muted">Net monthly P&amp;L</p>
                <p className={cn("num mt-1 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[50px]", tone(t.net))}>
                  <AnimatedNumber value={t.net} format={signed} />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={t.trades === 0 ? "neutral" : t.winners > t.losers ? "good" : t.losers > t.winners ? "bad" : "neutral"}>
                  {t.trades ? `${t.trades} ${t.trades === 1 ? "trade" : "trades"} · ${t.winners}W · ${t.losers}L` : "No trades logged"}
                </Chip>
              </div>
            </div>

            <StatStrip count={5} className="border-t border-line-soft">
              <StripCell label="Win rate" value={fmtPct(t.winRate)} sub={t.trades ? `${t.winners} of ${t.trades} won` : "No trades"} />
              <StripCell
                label="Profit factor"
                value={t.profitFactor == null ? "—" : t.profitFactor.toFixed(2)}
                valueClass={t.profitFactor == null ? undefined : t.profitFactor >= 1 ? "text-profit" : "text-loss"}
                sub={t.profitFactor == null ? (t.trades ? "No losing trades" : "No trades") : "Gross win ÷ loss"}
              />
              <StripCell
                label="Avg R:R"
                value={t.realizedRR == null ? fmtR(t.avgRR) : `${t.realizedRR.toFixed(2)}R`}
                sub={t.realizedRR != null ? "Realized avg" : t.avgRR != null ? "Recorded avg" : "None recorded"}
              />
              <StripCell
                label="Sessions"
                value={
                  <>
                    {m.sessions}
                    <span className="text-[0.72em] font-medium text-faint"> / {m.tradingDays}</span>
                  </>
                }
                sub={`${m.noSetupDays} sat on hands`}
              />
              <StripCell label="Process grade" value={m.avgGrade ?? "—"} sub={m.avgGrade ? "Month average" : "No grades yet"} />
            </StatStrip>
          </Card>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Group title="Trade extremes">
              <StatRow label="Avg winning trade" value={t.avgWin == null ? "—" : signed(t.avgWin)} valueClass={t.avgWin ? "text-profit" : undefined} />
              <StatRow label="Avg losing trade" value={t.avgLoss == null ? "—" : signed(-t.avgLoss)} valueClass={t.avgLoss ? "text-loss" : undefined} />
              <StatRow label="Largest win" value={t.largestWin == null ? "—" : signed(t.largestWin)} valueClass={t.largestWin ? "text-profit" : undefined} />
              <StatRow label="Largest loss" value={t.largestLoss == null ? "—" : signed(t.largestLoss)} valueClass={t.largestLoss ? "text-loss" : undefined} />
            </Group>

            <Group title="Weeks & streaks">
              <StatRow
                label="Best week"
                sub={m.bestWeek ? `Wk ${m.bestWeek.label} · ${weekLabel(m.bestWeek.monday)}` : undefined}
                value={m.bestWeek ? signed(m.bestWeek.net) : "—"}
                valueClass={m.bestWeek ? tone(m.bestWeek.net) : undefined}
                onClick={m.bestWeek && actions.openWeek ? () => actions.openWeek!(m.bestWeek!.monday) : undefined}
                hint="Open this week's review"
              />
              <StatRow
                label="Hardest week"
                sub={hardest ? `Wk ${hardest.label} · ${weekLabel(hardest.monday)}` : undefined}
                value={hardest ? signed(hardest.net) : "—"}
                valueClass={hardest ? tone(hardest.net) : undefined}
                onClick={hardest && actions.openWeek ? () => actions.openWeek!(hardest.monday) : undefined}
                hint="Open this week's review"
              />
              <StatRow
                label="Best winning streak"
                sub={bestStreak ? `${bestStreak.length} sessions` : undefined}
                value={bestStreak ? signed(bestStreak.pnl) : "—"}
                valueClass={bestStreak ? "text-profit" : undefined}
              />
              <StatRow
                label="Deepest drawdown"
                sub={maxDrawdown ? formatDateMedium(maxDrawdown.date) : undefined}
                value={maxDrawdown ? signed(-maxDrawdown.depth) : "—"}
                valueClass={maxDrawdown ? "text-loss" : undefined}
              />
            </Group>

            <Group title="Prop & discipline">
              <StatRow
                label="Profit target"
                sub={p.target != null ? `Target ${money(p.target)}` : "No target set"}
                value={p.achieved == null ? "—" : money(p.achieved)}
                valueClass={p.target != null && p.achieved != null && p.achieved >= p.target ? "text-profit" : undefined}
              />
              <StatRow
                label="Max drawdown used"
                sub={p.maxDrawdown != null ? `Allowance ${money(p.maxDrawdown)}` : "No limit set"}
                value={p.drawdownUsed == null ? "—" : money(p.drawdownUsed)}
                valueClass={p.drawdownBreached ? "text-loss" : undefined}
              />
              <StatRow
                label="Daily loss breaches"
                sub={p.dailyLossLimit != null ? `Limit ${money(p.dailyLossLimit)}/day` : "No daily limit"}
                value={p.dailyLossBreaches == null ? "—" : `${p.dailyLossBreaches}×`}
                valueClass={p.dailyLossBreaches ? "text-loss" : p.dailyLossBreaches === 0 ? "text-profit" : undefined}
              />
              <StatRow
                label="Forced trades"
                sub="Over daily limit or flagged"
                value={m.forcedTrades}
                valueClass={m.forcedTrades ? "text-loss" : undefined}
              />
            </Group>
          </div>
        </Section>
      </SectionReveal>

      {/* 2 — Edge, Thoughts & Checkpoint */}
      <SectionReveal index={2}>
        <Section
          id="b4"
          code="B.4"
          icon="shield"
          title="Edge, Thoughts &amp; Checkpoint"
          aside={
            <Chip tone={p.status === "pass" ? "good" : p.status === "fail" ? "bad" : "gold"}>
              {{ pass: "Passed", fail: "Failed", "in-progress": "In progress", none: "No target set" }[p.status]}
            </Chip>
          }
        >
          <Card pad={false} className="overflow-hidden">
            <div className="grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile="bg-profit" icon="arrowUpRight" />
                <Kpi
                  label="Strongest edge"
                  value={topCrit?.label ?? "Confirm checklist rules"}
                  sub={topCrit ? `${fmtPct(topCrit.winRate)} win rate (${topCrit.wins}/${topCrit.present})` : "Log pre-trade rules"}
                />
              </div>

              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile="bg-gradient-to-b from-[#6e6ce8] to-[#5250c9]" icon="sparkles" />
                <Kpi
                  label="Pre-trade plan"
                  value={
                    thoughtAnalysis.plannedTrades > 0
                      ? `${thoughtAnalysis.plannedTrades}/${thoughtAnalysis.totalTrades} planned · ${fmtPct(thoughtAnalysis.plannedWinRate)} won`
                      : thoughtAnalysis.topTheme ?? "Log If → Then thoughts"
                  }
                  sub={thoughtAnalysis.topTheme ? `Focus: ${thoughtAnalysis.topTheme}` : thoughtAnalysis.subline}
                />
              </div>

              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile={costly ? "bg-loss" : "bg-gradient-to-b from-gold-strong to-gold-deep"} icon="shield" />
                <Kpi
                  label="Costliest leak"
                  value={costly ? costly.label : "Clean execution"}
                  sub={costly ? `${costly.count}×${costly.lost > 0 ? ` · ${signed(-costly.lost)}` : ""}` : "Zero recurring mistakes"}
                />
              </div>
            </div>

            {m.decisions.length > 0 && (
              <div className="grid divide-y divide-line-soft border-t border-line-soft sm:grid-cols-2 lg:grid-cols-4 sm:divide-x sm:divide-y-0">
                {m.decisions.map((d) => (
                  <div key={d.id} className="p-4 sm:p-5">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-[13px] font-medium text-muted">{d.label}</p>
                      <Chip tone={d.yes == null ? "neutral" : d.yes ? "good" : "bad"} className="shrink-0">
                        {d.yes == null ? "—" : d.yes ? "Yes" : "No"}
                      </Chip>
                    </div>
                    <p className="num mt-1 text-[14.5px] font-semibold text-ink">{d.detail}</p>
                  </div>
                ))}
              </div>
            )}

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
                <span>{matrixOpen ? "Hide criteria & mistake breakdown" : "Show criteria & mistake breakdown"}</span>
                <Sym name="chevronDown" className={cn("h-4 w-4 transition-transform duration-300", matrixOpen && "rotate-180")} strokeWidth={2} />
              </button>
            </div>

            <AnimatePresence initial={false}>
              {matrixOpen && (
                <motion.div
                  key="monthly-matrix"
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={REVIEW_EXPAND}
                  className="overflow-hidden border-t border-line-soft"
                >
                  {m.heatmap.length > 0 && (
                    <div className="px-3 pb-3 pt-4">
                      <p className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Setup Criteria by Week</p>
                      <TableShell min={Math.max(520, 240 + m.weeks.length * 88)}>
                        <thead>
                          <tr>
                            <Th className="pl-4">Criterion</Th>
                            {m.weeks.map((w) => (
                              <Th key={w.monday} className="text-center">
                                <button
                                  type="button"
                                  onClick={() => actions.openWeek?.(w.monday)}
                                  title={weekLabel(w.monday)}
                                  className="rounded-md px-1.5 py-0.5 outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink"
                                >
                                  Wk {w.label}
                                </button>
                              </Th>
                            ))}
                            <Th className="text-center">Month</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.heatmap.map((h, ri) => (
                            <tr key={h.key}>
                              <Td className="max-w-[240px] pl-4 font-medium">{h.label}</Td>
                              {h.perWeek.map((c, ci) => (
                                <Td key={ci} className="text-center">
                                  <Cell rate={c.winRate} n={c.present} delay={0.03 + (ri + ci) * 0.015} reduce={!!reduce} />
                                </Td>
                              ))}
                              <Td className="text-center">
                                <Cell rate={h.total.winRate} n={h.total.present} delay={0.03 + ri * 0.015} reduce={!!reduce} strong onClick={() => actions.openIds(h.total.entryIds, h.label)} />
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </TableShell>
                    </div>
                  )}

                  <div className="border-t border-line-soft px-3 pb-3 pt-4">
                    <p className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Psychological Patterns &amp; Cost</p>
                    <TableShell min={520}>
                      <thead>
                        <tr>
                          <Th className="pl-4">Pattern</Th>
                          <Th className="text-right">Frequency</Th>
                          <Th className="pr-4 text-right">Impact (lost)</Th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...m.patterns.rows.filter((r) => PSYCH_PATTERNS.some((x) => x.key === r.key) || r.total > 0), m.patterns.correct].map((r) => (
                          <tr key={r.key} className="transition-colors hover:bg-ink/[0.025]">
                            <Td className="pl-4 font-medium">
                              {r.label}
                              {r.manual && <span className="ml-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-medium text-faint">Self-reported</span>}
                            </Td>
                            <Td className="text-right">
                              {r.manual ? (
                                <span className="num font-semibold text-ink">{r.total}</span>
                              ) : (
                                <EvidenceButton count={r.total} label={`Open ${r.total} trades: ${r.label}`} onClick={() => actions.openIds(r.entryIds, r.label)} />
                              )}
                            </Td>
                            <Td className={cn("num pr-4 text-right font-semibold", r.lost ? "text-loss" : "text-faint")}>
                              {r.key === "correct" || r.manual ? "—" : r.lost ? signed(-r.lost) : "—"}
                            </Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableShell>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </Card>
        </Section>
      </SectionReveal>

      {/* 3 — Session Log */}
      <SectionReveal index={3}>
        <Section id="b2" code="B.2" icon="list" title="Session log" hint="Every trade this month. Tap any row to open its full journal entry.">
          {m.log.length === 0 ? (
            <Card>
              <p className="text-[14px] text-muted">No trades logged in {monthTitle(month)}.</p>
            </Card>
          ) : (
            <Card pad={false} className="overflow-hidden">
              <ul className="divide-y divide-line-soft/80">
                {visibleTrades.map((r) => (
                  <li key={r.entry.id}>
                    <button
                      type="button"
                      onClick={() => {
                        haptic.selection();
                        actions.openTrade(r.entry.id);
                      }}
                      className="flex w-full items-center justify-between gap-4 px-5 py-3.5 text-left outline-none transition-colors hover:bg-ink/[0.025] active:bg-ink/[0.05] focus-visible:bg-ink/[0.04] sm:px-6"
                    >
                      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2.5 sm:gap-3">
                        <span className="num w-6 shrink-0 text-[12px] text-faint">#{r.n}</span>
                        <span className="num w-24 shrink-0 text-[13.5px] font-medium text-ink">{formatDateMedium(r.entry.date)}</span>
                        <DirTag dir={r.entry.direction ?? null} />
                        {r.entry.instrument && r.entry.instrument !== "—" && (
                          <span className="text-[13px] font-medium text-ink">{r.entry.instrument}</span>
                        )}
                        {r.entry.setup && r.entry.setup !== "—" && <span className="truncate text-[13px] text-muted">{r.entry.setup}</span>}
                        {r.criteria && <span className="num text-[12px] text-faint">{r.criteria.met}/{r.criteria.total} rules</span>}
                        {r.primary !== "—" && (
                          <span className={cn("hidden items-center gap-1.5 text-[12px] sm:inline-flex", r.primary === "Correct execution" ? "text-profit" : "text-loss")}>
                            <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
                            {r.primary}
                          </span>
                        )}
                      </div>
                      <div className="flex shrink-0 items-center gap-3.5">
                        {r.entry.rr != null && <span className={cn("num hidden text-[12.5px] font-medium sm:inline", tone(r.entry.rr))}>{fmtR(r.entry.rr)}</span>}
                        <span className={cn("num min-w-[68px] text-right text-[14px] font-semibold", tone(r.entry.pnl))}>{signed(r.entry.pnl)}</span>
                        <GradeBadge grade={r.grade} />
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
              {m.log.length > 8 && (
                <div className="border-t border-line-soft px-5 py-2.5 sm:px-6">
                  <button
                    type="button"
                    onClick={() => {
                      haptic.selection();
                      setShowAllTrades((v) => !v);
                    }}
                    className="flex w-full items-center justify-between py-0.5 text-left text-[13px] font-medium text-muted outline-none transition-colors hover:text-ink"
                  >
                    <span>{showAllTrades ? "Show fewer trades" : `Show all ${m.log.length} trades`}</span>
                    <Sym name="chevronDown" className={cn("h-4 w-4 transition-transform duration-300", showAllTrades && "rotate-180")} strokeWidth={2} />
                  </button>
                </div>
              )}
            </Card>
          )}
        </Section>
      </SectionReveal>

      {/* 4 — 3-Minute Monthly Check-In (Pure active recall, revealed one by one with delayed smooth animations) */}
      <SectionReveal index={4}>
        <Section
          id="b6"
          code="B.6"
          icon="target"
          title="3-Minute Monthly Check-In"
          aside={
            <Chip tone={completedQuestions === 3 ? "good" : "gold"}>
              {completedQuestions === 3 ? <DrawCheck className="h-3 w-3" /> : <Sym name="sparkles" className="h-3 w-3" />}
              {completedQuestions}/3 complete
            </Chip>
          }
        >
          <Card className="p-5 sm:p-7">
            <Prompt
              step={1}
              done={q1Reveal.settled && wonVal.trim().length > 0}
              typing={q1Reveal.typing}
              q="What was your #1 A+ edge this month?"
              hint="Write in your own words the setup or habit worth repeating."
            >
              <AutoText
                label="Biggest reason I won"
                minRows={2}
                value={wonVal}
                onChange={(v) => rn.setText("won", v)}
                onChipSelect={q1Reveal.triggerChipSettle}
                placeholder="Write the setup, criterion, or habit that paid you most…"
              />
            </Prompt>

            <AnimatePresence>
              {q1Reveal.settled && (
                <QuestionReveal key="mo-q2" delay={0.1}>
                  <Prompt
                    step={2}
                    done={q2Reveal.settled && lostVal.trim().length > 0}
                    typing={q2Reveal.typing}
                    q="What single leak hurt your results the most?"
                    hint="Write down the primary mistake or drawdown trigger to eliminate."
                  >
                    <AutoText
                      label="Biggest reason I lost"
                      minRows={2}
                      value={lostVal}
                      onChange={(v) => rn.setText("lost", v)}
                      onChipSelect={q2Reveal.triggerChipSettle}
                      placeholder="Write what cost focus or P&L this month…"
                    />
                  </Prompt>
                </QuestionReveal>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {q2Reveal.settled && (
                <QuestionReveal key="mo-q3" delay={0.1}>
                  <Prompt
                    step={3}
                    done={commit0.trim().length > 0}
                    q="What is your ONE measurable rule for next month?"
                    hint="Write one concrete commitment for the month ahead."
                  >
                    <div className="space-y-3">
                      <LineInput
                        index={1}
                        label="Primary commitment for next month"
                        value={commit0}
                        onChange={(v) => rn.setListItem("commitments", 0, v)}
                        placeholder="Write your #1 rule for next month…"
                      />

                      {moreRules || commit1.trim().length > 0 || commit2.trim().length > 0 ? (
                        <div className="space-y-2.5 pt-1">
                          <LineInput
                            index={2}
                            label="Commitment 2 (optional)"
                            value={commit1}
                            onChange={(v) => rn.setListItem("commitments", 1, v)}
                            placeholder="Optional second rule…"
                          />
                          <LineInput
                            index={3}
                            label="Commitment 3 (optional)"
                            value={commit2}
                            onChange={(v) => rn.setListItem("commitments", 2, v)}
                            placeholder="Optional third rule…"
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            haptic.selection();
                            setMoreRules(true);
                          }}
                          className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
                        >
                          <span>+ Add another rule (optional)</span>
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

function Cell({ rate, n, delay, reduce, strong, onClick }: { rate: number | null; n: number; delay: number; reduce: boolean; strong?: boolean; onClick?: () => void }) {
  const body = n === 0 ? "·" : <>{fmtPct(rate)}<span className="ml-1 text-[10px] font-medium opacity-60">n={n}</span></>;
  const cls = cn("num inline-block min-w-[68px] rounded-[9px] px-2 py-1 text-center text-[12px] font-semibold", heat(rate, n), strong && n > 0 && "ring-1 ring-inset ring-current/25");
  return (
    <motion.span initial={reduce ? false : { opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, type: "spring", stiffness: 420, damping: 32 }} className="inline-block" title={n ? `${n} trade${n === 1 ? "" : "s"} with this criterion` : "Not present"}>
      {onClick && n > 0 ? (
        <button type="button" onClick={onClick} className={cn(cls, "outline-none transition-transform hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95")}>
          {body}
        </button>
      ) : (
        <span className={cls}>{body}</span>
      )}
    </motion.span>
  );
}

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
  DrawCheck,
  EvidenceButton,
  fmtPct,
  fmtR,
  Group,
  Kpi,
  LineInput,
  Prompt,
  QuestionReveal,
  REVIEW_EXPAND,
  ReviewIconTile,
  ReviewScrollBar,
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
import { heat, SessionCurve, WinRateRing } from "./review-charts";
import { MistakeReplaySpotlight, PeriodTradesList, TradeScreenshotsGallery } from "./review-evidence";
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
        body={`${monthTitle(month)} is still ahead. Complete this review after the close.`}
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
  const hasScreenshots = m.entries.some((e) => e.images.length > 0);
  const weekMax = Math.max(1, ...m.weeks.map((w) => Math.abs(w.net)));

  return (
    <div className="space-y-10 pb-8">
      <ReviewScrollBar />

      {prevCommit.length > 0 && (
        <SectionReveal index={0}>
          <CarriedCommitments title="Last month's rule" items={prevCommit} done={notes.done} onToggle={(i, v) => rn.setDone(`prev:${i}`, v)} />
        </SectionReveal>
      )}

      {/* 1 — Monthly Hero Verdict + Full Interactive Session Curve */}
      <SectionReveal index={1}>
        <Section
          id="b1"
          icon="gauge"
          title="Month at a glance"
          aside={
            <div className="flex items-center gap-2.5">
              {m.balance != null && (
                <Chip>
                  Balance <b className="font-semibold tabular-nums text-ink">{money(m.balance)}</b>
                </Chip>
              )}
              <SaveIndicator state={rn.state} />
            </div>
          }
        >
          <Card pad={false} className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-4 px-5 pb-4 pt-5 sm:px-7 sm:pt-6">
              <div>
                <p className="text-[12.5px] font-medium text-muted">Net P&amp;L</p>
                <p className={cn("mt-1 text-[42px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[52px]", tone(t.net))}>
                  <AnimatedNumber value={t.net} format={signed} />
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Chip tone={t.trades === 0 ? "neutral" : t.winners > t.losers ? "good" : t.losers > t.winners ? "bad" : "neutral"}>
                    {t.trades ? `${t.trades} ${t.trades === 1 ? "trade" : "trades"} · ${t.winners}W · ${t.losers}L` : "No trades"}
                  </Chip>
                </div>
              </div>
              <WinRateRing value={t.winRate} size={96} />
            </div>

            {/* Interactive Equity Curve across sessions */}
            <div className="border-t border-line-soft px-3 pb-3 pt-4 sm:px-6">
              <SessionCurve curve={m.curve} drawdowns={m.drawdowns} streaks={m.streaks} height={240} />
            </div>

            <StatStrip count={5} className="border-t border-line-soft">
              <StripCell label="Win rate" value={fmtPct(t.winRate)} sub={t.trades ? `${t.winners}/${t.trades}` : "—"} />
              <StripCell
                label="Profit factor"
                value={t.profitFactor == null ? "—" : t.profitFactor.toFixed(2)}
                valueClass={t.profitFactor == null ? undefined : t.profitFactor >= 1 ? "text-profit" : "text-loss"}
              />
              <StripCell
                label="Avg R:R"
                value={t.realizedRR == null ? fmtR(t.avgRR) : `${t.realizedRR.toFixed(2)}R`}
              />
              <StripCell
                label="Sessions"
                value={
                  <>
                    {m.sessions}
                    <span className="text-[0.72em] font-medium text-faint"> / {m.tradingDays}</span>
                  </>
                }
                sub={m.noSetupDays ? `${m.noSetupDays} patience` : undefined}
              />
              <StripCell label="Grade" value={m.avgGrade ?? "—"} sub={m.avgGrade ? "Avg" : undefined} />
            </StatStrip>
          </Card>

          {/* Week-by-Week Trajectory Cards */}
          {m.weeks.some((w) => w.totals.trades > 0) && (
            <div className="mt-4 grid gap-2.5 sm:grid-cols-4 lg:grid-cols-5">
              {m.weeks.map((w) => {
                const clickable = !!actions.openWeek;
                const fill = w.totals.trades > 0 ? Math.max(10, Math.round((Math.abs(w.net) / weekMax) * 100)) : 0;
                return (
                  <button
                    key={w.monday}
                    type="button"
                    disabled={!clickable}
                    onClick={() => actions.openWeek?.(w.monday)}
                    className="group rounded-[18px] border border-line-soft bg-surface p-3.5 text-left transition-all hover:border-line-strong hover:bg-raised active:scale-[0.98] disabled:cursor-default dark:border-line"
                  >
                    <div className="flex items-center justify-between text-[11.5px] text-faint">
                      <span>Week {w.label}</span>
                      <span>{w.totals.trades}T</span>
                    </div>
                    <p className={cn("num mt-1 text-[16px] font-semibold tracking-[-0.02em]", w.totals.trades ? tone(w.net) : "text-faint")}>
                      {w.totals.trades ? signed(w.net) : "—"}
                    </p>
                    <div className="mt-2 h-1 overflow-hidden rounded-full bg-ink/[0.06]">
                      {fill > 0 && (
                        <div className={cn("h-full rounded-full", w.net >= 0 ? "bg-profit" : "bg-loss")} style={{ width: `${fill}%` }} />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Group title="Extremes">
              <StatRow label="Avg win" value={t.avgWin == null ? "—" : signed(t.avgWin)} valueClass={t.avgWin ? "text-profit" : undefined} />
              <StatRow label="Avg loss" value={t.avgLoss == null ? "—" : signed(-t.avgLoss)} valueClass={t.avgLoss ? "text-loss" : undefined} />
              <StatRow label="Best trade" value={t.largestWin == null ? "—" : signed(t.largestWin)} valueClass={t.largestWin ? "text-profit" : undefined} />
              <StatRow label="Worst trade" value={t.largestLoss == null ? "—" : signed(t.largestLoss)} valueClass={t.largestLoss ? "text-loss" : undefined} />
            </Group>

            <Group title="Weeks & streaks">
              <StatRow
                label="Best week"
                sub={m.bestWeek ? weekLabel(m.bestWeek.monday) : undefined}
                value={m.bestWeek ? signed(m.bestWeek.net) : "—"}
                valueClass={m.bestWeek ? tone(m.bestWeek.net) : undefined}
                onClick={m.bestWeek && actions.openWeek ? () => actions.openWeek!(m.bestWeek!.monday) : undefined}
              />
              <StatRow
                label="Hardest week"
                sub={hardest ? weekLabel(hardest.monday) : undefined}
                value={hardest ? signed(hardest.net) : "—"}
                valueClass={hardest ? tone(hardest.net) : undefined}
                onClick={hardest && actions.openWeek ? () => actions.openWeek!(hardest.monday) : undefined}
              />
              <StatRow
                label="Best streak"
                sub={bestStreak ? `${bestStreak.length} sessions` : undefined}
                value={bestStreak ? signed(bestStreak.pnl) : "—"}
                valueClass={bestStreak ? "text-profit" : undefined}
              />
              <StatRow
                label="Max drawdown"
                sub={maxDrawdown ? formatDateMedium(maxDrawdown.date) : undefined}
                value={maxDrawdown ? signed(-maxDrawdown.depth) : "—"}
                valueClass={maxDrawdown ? "text-loss" : undefined}
              />
            </Group>

            <Group title="Account &amp; rules">
              {p.target != null ? (
                <div className="rounded-[14px] bg-surface px-4 py-3 dark:ring-1 dark:ring-inset dark:ring-white/[0.04]">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="font-medium text-ink">Target progress</span>
                    <span className={cn("font-semibold tabular-nums", p.targetMet ? "text-profit" : "text-ink")}>
                      {signed(p.achieved)} / {money(p.target)}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink/[0.06]">
                    <motion.div
                      initial={reduce ? false : { scaleX: 0 }}
                      animate={{ scaleX: Math.min(1, Math.max(0, p.achieved / p.target)) }}
                      transition={{ duration: 0.9, delay: 0.25, ease: REVIEW_EXPAND.ease }}
                      style={{ transformOrigin: "left" }}
                      className={cn("h-full w-full rounded-full", p.targetMet ? "bg-profit" : "bg-gold-strong")}
                    />
                  </div>
                </div>
              ) : (
                <StatRow label="Target progress" value="No target set" valueClass="text-faint" />
              )}
              <StatRow
                label="Drawdown limit"
                value={p.maxDrawdown != null ? `${money(p.drawdownUsed ?? 0)} / ${money(p.maxDrawdown)}` : "No limit"}
                valueClass={p.drawdownBreached ? "text-loss" : p.maxDrawdown == null ? "text-faint" : undefined}
              />
              <StatRow
                label="Plan adherence"
                value={thoughtAnalysis.plannedTrades > 0 ? `${thoughtAnalysis.plannedTrades}/${thoughtAnalysis.totalTrades}` : "—"}
                sub={thoughtAnalysis.topTheme ?? undefined}
              />
              <StatRow label="Overtrade days" value={m.forcedTrades ? `${m.forcedTrades} forced` : "Clean"} valueClass={m.forcedTrades ? "text-loss" : "text-profit"} />
            </Group>
          </div>
        </Section>
      </SectionReveal>

      {/* 2 — Repeating Mistake Replay Spotlight */}
      {costly && costly.entryIds.length > 0 && (
        <SectionReveal index={2}>
          <Section
            id="b2-replay"
            icon="repeat"
            title="Costliest pattern · Replay"
            hint="Review the exact setup behind your biggest leak this month."
          >
            <MistakeReplaySpotlight
              mistake={costly}
              allMistakes={m.mistakes}
              entries={m.entries}
              onOpenTrade={actions.openTrade}
            />
          </Section>
        </SectionReveal>
      )}

      {/* 3 — Chart Screenshots & Trades Taken */}
      {(hasScreenshots || m.log.length > 0) && (
        <SectionReveal index={3}>
          <Section
            id="b2"
            icon="photo"
            title="Trades &amp; chart screenshots"
            aside={
              m.log.length > 0 ? (
                <span className="text-[12.5px] font-medium tabular-nums text-muted">
                  {m.log.length} {m.log.length === 1 ? "trade" : "trades"}
                </span>
              ) : null
            }
          >
            <div className="space-y-4">
              {hasScreenshots && <TradeScreenshotsGallery entries={m.entries} onOpenTrade={actions.openTrade} />}
              <PeriodTradesList
                rows={m.log}
                actions={actions}
                initialLimit={8}
                emptyLabel={`No trades in ${monthTitle(month)}.`}
              />
            </div>
          </Section>
        </SectionReveal>
      )}

      {/* 4 — Edge & Matrix (Progressive Disclosure) */}
      <SectionReveal index={4}>
        <Section id="b4" icon="shield" title="Edge &amp; checkpoint">
          <Card pad={false} className="overflow-hidden">
            <div className="grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile="bg-profit" icon="arrowUpRight" />
                <Kpi
                  label="Strongest criterion"
                  value={topCrit?.label ?? "Record checklist criteria"}
                  sub={topCrit ? `${fmtPct(topCrit.winRate)} · ${topCrit.wins}/${topCrit.present} won` : "No criteria confirmed yet"}
                />
              </div>

              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile={costly ? "bg-loss" : "bg-gradient-to-b from-gold-strong to-gold-deep"} icon="shield" />
                <Kpi
                  label="Biggest leak"
                  value={costly ? costly.label : "Zero tagged mistakes"}
                  sub={costly ? `${costly.count}×${costly.lost ? ` · ${signed(-costly.lost)}` : ""}` : "Clean month"}
                />
              </div>

              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile="bg-gradient-to-b from-[#6e6ce8] to-[#5250c9]" icon="checklist" />
                <Kpi
                  label="Thresholds passed"
                  value={`${m.decisions.filter((d) => d.yes === true).length} of ${m.decisions.length}`}
                  sub="Win rate, R:R, Grade, Target"
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
                <span>{matrixOpen ? "Hide breakdown" : "Inspect criteria heatmap & patterns"}</span>
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
                  <div className="grid gap-2.5 border-b border-line-soft px-5 py-4 sm:grid-cols-2 sm:px-6">
                    {m.decisions.map((d) => (
                      <div key={d.id} className="flex items-start justify-between gap-3 rounded-2xl bg-well px-4 py-3">
                        <div className="min-w-0">
                          <p className="text-[13px] font-semibold text-ink">{d.label}</p>
                          <p className="mt-0.5 text-[12px] text-muted">{d.detail}</p>
                        </div>
                        <span
                          className={cn(
                            "shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-semibold",
                            d.yes === true ? "bg-profit/12 text-profit" : d.yes === false ? "bg-loss/12 text-loss" : "bg-ink/[0.06] text-faint",
                          )}
                        >
                          {d.yes === true ? "Yes" : d.yes === false ? "Needs work" : "—"}
                        </span>
                      </div>
                    ))}
                  </div>

                  {m.heatmap.length > 0 && (
                    <div className="px-3 pb-3 pt-4">
                      <p className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Criteria by Week</p>
                      <TableShell min={580}>
                        <thead>
                          <tr>
                            <Th className="pl-4">Criterion</Th>
                            {m.weeks.map((w) => (
                              <Th key={w.monday} className="text-center">
                                W{w.label}
                              </Th>
                            ))}
                            <Th className="pr-4 text-right">Month total</Th>
                          </tr>
                        </thead>
                        <tbody>
                          {m.heatmap.map((row) => (
                            <tr key={row.key} className="transition-colors hover:bg-ink/[0.025]">
                              <Td className="max-w-[240px] pl-4 font-medium">{row.label}</Td>
                              {row.perWeek.map((cell, i) => (
                                <Td key={m.weeks[i].monday} className="text-center">
                                  <span className={cn("inline-flex min-w-12 justify-center rounded-full px-2 py-0.5 text-[11.5px] font-semibold tabular-nums", heat(cell.winRate, cell.present))}>
                                    {cell.present ? fmtPct(cell.winRate) : "·"}
                                  </span>
                                </Td>
                              ))}
                              <Td className="pr-4 text-right">
                                <EvidenceButton count={row.total.present} label={`Open ${row.total.present} trades with ${row.label}`} onClick={() => actions.openIds(row.total.entryIds, row.label)} />
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </TableShell>
                    </div>
                  )}

                  <div className="border-t border-line-soft px-3 pb-3 pt-4">
                    <p className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Patterns &amp; Cost</p>
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
                                <span className="font-semibold tabular-nums text-ink">{r.total}</span>
                              ) : (
                                <EvidenceButton count={r.total} label={`Open ${r.total} trades: ${r.label}`} onClick={() => actions.openIds(r.entryIds, r.label)} />
                              )}
                            </Td>
                            <Td className={cn("pr-4 text-right font-semibold tabular-nums", r.lost ? "text-loss" : "text-faint")}>
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

      {/* 5 — Guided Sequenced Reflection & Month Sign-Off */}
      <SectionReveal index={5}>
        <Section
          id="b6"
          icon="target"
          title="Close the month"
          aside={
            <Chip tone={completedQuestions === 3 ? "good" : "gold"}>
              {completedQuestions === 3 ? <DrawCheck className="h-3 w-3" /> : <Sym name="sparkles" className="h-3 w-3" />}
              {completedQuestions === 3 ? "Month reviewed" : `${completedQuestions}/3`}
            </Chip>
          }
        >
          <Card className="p-5 sm:p-7">
            <Prompt
              step={1}
              done={q1Reveal.settled && wonVal.trim().length > 0}
              typing={q1Reveal.typing}
              q="What was your #1 edge?"
            >
              <AutoText
                label="Biggest edge"
                minRows={2}
                value={wonVal}
                onChange={(v) => rn.setText("won", v)}
                onChipSelect={q1Reveal.triggerChipSettle}
                placeholder="The setup or habit worth repeating…"
              />
            </Prompt>

            <AnimatePresence>
              {q1Reveal.settled && (
                <QuestionReveal key="mo-q2" delay={0.12}>
                  <Prompt
                    step={2}
                    done={q2Reveal.settled && lostVal.trim().length > 0}
                    typing={q2Reveal.typing}
                    q="Biggest leak?"
                  >
                    <AutoText
                      label="Biggest leak"
                      minRows={2}
                      value={lostVal}
                      onChange={(v) => rn.setText("lost", v)}
                      onChipSelect={q2Reveal.triggerChipSettle}
                      placeholder="What cost focus or P&L this month…"
                    />
                  </Prompt>
                </QuestionReveal>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {q2Reveal.settled && (
                <QuestionReveal key="mo-q3" delay={0.12}>
                  <Prompt
                    step={3}
                    done={commit0.trim().length > 0}
                    q="ONE rule for next month?"
                  >
                    <div className="space-y-3">
                      <LineInput
                        index={1}
                        label="Rule for next month"
                        value={commit0}
                        onChange={(v) => rn.setListItem("commitments", 0, v)}
                        placeholder="Your #1 rule…"
                      />

                      {moreRules || commit1.trim().length > 0 || commit2.trim().length > 0 ? (
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
                            setMoreRules(true);
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

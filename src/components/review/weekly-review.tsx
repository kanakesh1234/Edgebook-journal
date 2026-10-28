"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { addDays, weekdayShort } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Sym } from "@/components/journal/symbols";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { analyzePeriodThoughts } from "@/lib/ai-brain";
import { buildWeek, type ReviewContext } from "@/lib/review/metrics";
import { weekLabel } from "@/lib/review/period";
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
  Kpi,
  LineInput,
  Prompt,
  QuestionReveal,
  REVIEW_EXPAND,
  ReviewIconTile,
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
import { heat } from "./review-charts";
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
        body={`${weekLabel(monday)} is still ahead. Come back on Friday after the close — or step back to a finished week.`}
      />
    );
  }

  const completedQuestions = [workedVal.trim(), leakVal.trim(), commit0.trim()].filter(Boolean).length;

  return (
    <div className="space-y-8">
      {prevCommit.length > 0 && (
        <SectionReveal index={0}>
          <CarriedCommitments title="Last week's commitments" items={prevCommit} done={notes.done} onToggle={(i, v) => rn.setDone(`prev:${i}`, v)} />
        </SectionReveal>
      )}

      {/* 1 — Scorecard */}
      <SectionReveal index={1}>
        <Section
          id="a1"
          icon="gauge"
          title="Scorecard"
          aside={
            <div className="flex items-center gap-2.5">
              {week.balance != null && (
                <Chip>
                  Balance <b className="font-semibold tabular-nums text-ink">{money(week.balance)}</b>
                </Chip>
              )}
              <SaveIndicator state={rn.state} />
            </div>
          }
        >
          <Card pad={false} className="overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-5 sm:px-7 sm:py-6">
              <div>
                <p className="text-[12.5px] font-medium text-muted">Net P&amp;L</p>
                <p className={cn("mt-1 text-[42px] font-semibold leading-none tracking-[-0.04em] tabular-nums sm:text-[50px]", tone(t.net))}>
                  <AnimatedNumber value={t.net} format={signed} />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={t.trades === 0 ? "neutral" : t.winners > t.losers ? "good" : t.losers > t.winners ? "bad" : "neutral"}>
                  {t.trades ? `${t.trades} ${t.trades === 1 ? "trade" : "trades"} · ${t.winners}W · ${t.losers}L${t.breakevens ? ` · ${t.breakevens}BE` : ""}` : "No trades"}
                </Chip>
                {week.isCurrent && (
                  <Chip tone="info">
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" aria-hidden />
                    In progress
                  </Chip>
                )}
              </div>
            </div>

            <StatStrip count={5} className="border-t border-line-soft">
              <StripCell label="Win rate" value={fmtPct(t.winRate)} sub={t.trades ? `${t.winners}/${t.trades}` : "—"} />
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
              <StripCell label="Grade" value={week.avgGrade ?? "—"} sub={week.avgGrade ? "Avg" : undefined} />
            </StatStrip>
          </Card>
        </Section>
      </SectionReveal>

      {/* 2 — Edge & Patterns */}
      <SectionReveal index={2}>
        <Section id="a3" icon="sparkles" title="Edge &amp; Patterns">
          <Card pad={false} className="overflow-hidden">
            <div className="grid divide-y divide-line-soft sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              <div className="flex items-start gap-3 p-5">
                <ReviewIconTile tile="bg-profit" icon="arrowUpRight" />
                <Kpi
                  label="Strongest edge"
                  value={week.strongest?.label ?? "Confirm checklist rules"}
                  sub={week.strongest ? `${fmtPct(week.strongest.winRate)} win rate (${week.strongest.wins}/${week.strongest.present})` : "Log rules in Plan"}
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
                <ReviewIconTile tile={topMistake ? "bg-loss" : "bg-gradient-to-b from-gold-strong to-gold-deep"} icon="shield" />
                <Kpi
                  label="Primary leak"
                  value={topMistake ? topMistake.label : "Clean execution"}
                  sub={topMistake ? `${topMistake.count}×${topMistake.lost > 0 ? ` · ${signed(-topMistake.lost)}` : ""}` : "Zero recurring mistakes"}
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
                <span>{matrixOpen ? "Hide breakdown" : "Show breakdown"}</span>
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
                      <p className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Criteria Win Rates</p>
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
                            <tr key={c.key} className={cn("transition-colors hover:bg-ink/[0.03]", i % 2 === 1 && "bg-ink/[0.018]")}>
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
                  <div className="px-3 pb-3 pt-4">
                    <p className="mb-3 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Pattern Matrix</p>
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
                            <tr key={r.key} className={cn("transition-colors hover:bg-ink/[0.03]", i % 2 === 1 && "bg-ink/[0.018]")}>
                              <Td className="pl-4 font-medium">
                                {r.label}
                                {r.manual && <span className="ml-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-medium text-faint">Self-reported</span>}
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
                                          "mx-auto grid h-[24px] w-[24px] place-items-center rounded-[7px] border outline-none transition-[background-color,border-color,transform] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-90 disabled:opacity-30",
                                          on ? "border-loss bg-loss text-white" : "border-line-strong hover:border-faint hover:bg-ink/[0.04]",
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
                                        "inline-grid h-[24px] min-w-[24px] place-items-center rounded-[7px] px-1 text-[12px] font-semibold tabular-nums",
                                        n === 0 ? "text-faint" : good ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss",
                                      )}
                                    >
                                      {n || "·"}
                                    </span>
                                  </Td>
                                );
                              })}
                              <Td className="pr-4 text-right">
                                {r.manual ? (
                                  <span className={cn("font-semibold tabular-nums", r.total ? "text-loss" : "text-faint")}>{r.total}</span>
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

      {/* 3 — Reflection */}
      <SectionReveal index={3}>
        <Section
          id="a5"
          icon="target"
          title="Reflection"
          aside={
            <Chip tone={completedQuestions === 3 ? "good" : "gold"}>
              {completedQuestions === 3 ? <DrawCheck className="h-3 w-3" /> : <Sym name="sparkles" className="h-3 w-3" />}
              {completedQuestions}/3
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
                placeholder="What did you execute well this week…"
              />
            </Prompt>

            <AnimatePresence>
              {q1Reveal.settled && (
                <QuestionReveal key="wk-q2" delay={0.1}>
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
                      placeholder="The one mistake or habit to leave behind…"
                    />
                  </Prompt>
                </QuestionReveal>
              )}
            </AnimatePresence>

            <AnimatePresence>
              {q2Reveal.settled && (
                <QuestionReveal key="wk-q3" delay={0.1}>
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

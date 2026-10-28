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
import { buildWeek, type DayRow, type ReviewContext } from "@/lib/review/metrics";
import { weekLabel } from "@/lib/review/period";
import { PSYCH_PATTERNS } from "@/lib/review/mistakes";
import { cn } from "@/lib/utils";
import {
  AnimatedNumber,
  AutoText,
  CarriedCommitments,
  Card,
  Chip,
  ChipStagger,
  DirTag,
  DrawCheck,
  EvidenceButton,
  fmtPct,
  fmtR,
  GradePicker,
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
  type SmartChipOption,
} from "./review-ui";
import { heat } from "./review-charts";
import { useReviewNotes } from "./use-review-notes";
import type { ReviewActions } from "./reviews-panel";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const STATE_CHIP: Record<DayRow["state"], { label: string; t: "good" | "neutral" | "gold" | "info" | "bad" }> = {
  traded: { label: "Traded", t: "good" },
  "no-setup": { label: "Sat on hands", t: "info" },
  pass: { label: "Passed setup", t: "gold" },
  unlogged: { label: "Not logged", t: "bad" },
  holiday: { label: "Holiday", t: "neutral" },
  weekend: { label: "Weekend", t: "neutral" },
  upcoming: { label: "Upcoming", t: "neutral" },
};

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
  const traded = week.days.filter((d) => d.state === "traded");
  const best = [...traded].sort((a, b) => b.pnl - a.pnl)[0];
  const worst = [...traded].sort((a, b) => a.pnl - b.pnl)[0];
  const mistakeNames = (d: DayRow) => [...new Set(d.trades.flatMap((e) => week.mistakes.filter((m) => m.entryIds.includes(e.id)).map((m) => m.label)))];
  const dayLine = (d: DayRow, kind: string) =>
    `${kind}: ${weekdayShort(d.date)} ${formatDateMedium(d.date)} (${signed(d.pnl)} across ${d.trades.length} ${d.trades.length === 1 ? "trade" : "trades"}${d.grade ? `, grade ${d.grade}` : ""}).${mistakeNames(d).length ? ` Tagged: ${mistakeNames(d).join(", ")}.` : ""}`;
  const heldDays = week.days.filter((d) => d.state === "no-setup" || d.state === "pass");
  const topMistake = week.mistakes[0];

  const [matrixOpen, setMatrixOpen] = useState(false);
  const [moreCommitments, setMoreCommitments] = useState(false);

  const workedVal = notes.text["worked"] ?? notes.text["best-day"] ?? "";
  const leakVal = notes.text["not-worked"] ?? notes.text["worst-day"] ?? "";
  const commit0 = notes.lists["commitments"]?.[0] ?? "";
  const commit1 = notes.lists["commitments"]?.[1] ?? "";
  const commit2 = notes.lists["commitments"]?.[2] ?? "";

  const q1Reveal = useReviewSettledReveal(workedVal, leakVal.trim().length > 0 || commit0.trim().length > 0, monday, 3, 680);
  const q2Reveal = useReviewSettledReveal(leakVal, commit0.trim().length > 0, monday, 3, 680);

  // Short, clean 1-tap labels (no text bloat) paired with full structured reflection sentences
  const workedChips: SmartChipOption[] = [
    ...(best && best.pnl > 0 ? [{ label: `Best day · ${weekdayShort(best.date)} ${signed(best.pnl)}`, text: dayLine(best, "Best execution"), tone: "good" as const }] : []),
    ...(week.strongest
      ? [
          {
            label: `${week.strongest.label} (${fmtPct(week.strongest.winRate)})`,
            text: `Strongest edge was confirming “${week.strongest.label}” (${fmtPct(week.strongest.winRate)} win rate, ${week.strongest.wins}/${week.strongest.present}).`,
            tone: "good" as const,
          },
        ]
      : []),
    ...(thoughtAnalysis.plannedTrades > 0
      ? [
          {
            label: `Pre-trade thoughts (${thoughtAnalysis.plannedTrades}/${thoughtAnalysis.totalTrades})`,
            text: thoughtAnalysis.chipText,
            tone: "ai" as const,
          },
        ]
      : []),
    ...(heldDays.length > 0
      ? [
          {
            label: `Sat on hands (${heldDays.map((d) => weekdayShort(d.date)).join(", ")})`,
            text: `Practiced patience on ${heldDays.map((d) => weekdayShort(d.date)).join(", ")} when no A+ setup triggered.`,
            tone: "good" as const,
          },
        ]
      : []),
    { label: "Respected stop loss", text: "Respected my predefined stop loss without widening or hesitating.", tone: "gold" as const },
  ];

  const leakChips: SmartChipOption[] = [
    ...(topMistake
      ? [
          {
            label: `${topMistake.label} (${topMistake.count}×)`,
            text: `Primary leak was ${topMistake.label} (${topMistake.count}×${topMistake.lost > 0 ? `, costing ${signed(-topMistake.lost)}` : ""}).`,
            tone: "bad" as const,
          },
        ]
      : []),
    ...(worst && worst.pnl < 0 ? [{ label: `Hardest day · ${weekdayShort(worst.date)}`, text: dayLine(worst, "Hardest session"), tone: "bad" as const }] : []),
    ...(week.unloggedDays > 0
      ? [
          {
            label: `${week.unloggedDays} unlogged day${week.unloggedDays === 1 ? "" : "s"}`,
            text: `Left ${week.unloggedDays} weekday${week.unloggedDays === 1 ? "" : "s"} unlogged — log every session or mark Sat on hands.`,
            tone: "gold" as const,
          },
        ]
      : []),
    { label: "Entered early", text: "Entered too early before the setup fully confirmed.", tone: "bad" as const },
    { label: "Forced B-grade setup", text: "Took a lower-quality setup instead of waiting for A+ criteria.", tone: "bad" as const },
    { label: "Clean process week", text: "No major process leak this week; losses were normal variance.", tone: "good" as const },
  ];

  const commitSuggestions: SmartChipOption[] = [
    ...(topMistake
      ? [
          {
            label: `Cut ${topMistake.label}`,
            text: `Pause 10 seconds before entry to verify I am not repeating ${topMistake.label.toLowerCase()}.`,
            tone: "ai" as const,
          },
        ]
      : []),
    ...(week.strongest
      ? [
          {
            label: `Require ${week.strongest.label}`,
            text: `Only execute when “${week.strongest.label}” is explicitly confirmed in pre-trade Thought.`,
            tone: "good" as const,
          },
        ]
      : []),
    { label: "Write If → Then thought first", text: "Write at least one If → Then scenario in Pre-trade Thought before every entry.", tone: "ai" as const },
    { label: "Wait for candle close", text: "Wait for the confirmation candle to close before clicking entry.", tone: "gold" as const },
    { label: "Stop after 2 losses", text: "Lock out for the session immediately after 2 losing trades.", tone: "gold" as const },
  ];

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
          code="A.1"
          icon="gauge"
          title="Scorecard"
          aside={
            <div className="flex items-center gap-2.5">
              {week.balance != null && (
                <Chip>
                  Balance <b className="num font-semibold text-ink">{money(week.balance)}</b>
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
                <p className={cn("num mt-1 text-[42px] font-semibold leading-none tracking-[-0.04em] sm:text-[50px]", tone(t.net))}>
                  <AnimatedNumber value={t.net} format={signed} />
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Chip tone={t.trades === 0 ? "neutral" : t.winners > t.losers ? "good" : t.losers > t.winners ? "bad" : "neutral"}>
                  {t.trades ? `${t.trades} ${t.trades === 1 ? "trade" : "trades"} · ${t.winners}W · ${t.losers}L${t.breakevens ? ` · ${t.breakevens}BE` : ""}` : "No trades logged"}
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
              <StripCell label="Win rate" value={fmtPct(t.winRate)} sub={t.trades ? `${t.winners} of ${t.trades} won` : "No trades"} />
              <StripCell label="Avg R:R" value={fmtR(t.avgRR)} valueClass={tone(t.avgRR)} sub={t.avgRR == null ? "None recorded" : "Per trade"} />
              <StripCell
                label="Sessions"
                value={
                  <>
                    {week.sessions}
                    <span className="text-[0.72em] font-medium text-faint"> / {week.tradingSlots}</span>
                  </>
                }
                sub={week.tradingSlots < 5 ? `${5 - week.tradingSlots} holiday` : "Trading days"}
              />
              <StripCell label="Patience" value={week.noSetupDays} sub="Sat on hands" />
              <StripCell label="Process grade" value={week.avgGrade ?? "—"} sub={week.avgGrade ? "Week average" : "Grade below"} />
            </StatStrip>
          </Card>
        </Section>
      </SectionReveal>

      {/* 2 — Daily log (Apple Inset Grouped Mon–Fri list) */}
      <SectionReveal index={2}>
        <Section id="a2" code="A.2" icon="list" title="Daily log" hint="Monday to Friday. Tap any trade to inspect its chart and review.">
          <Card pad={false} className="overflow-hidden">
            <ul className="divide-y divide-line-soft/80">
              {week.days.slice(0, 5).map((d, i) => (
                <DayRowItem key={d.date} d={d} name={DAY_NAMES[i]} rn={rn} actions={actions} onLog={logNoSetup} onPass={setPass} />
              ))}
            </ul>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1.5 border-t border-line-soft bg-ink/[0.02] px-5 py-3 text-[13px] sm:px-6">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1">
                <span className="font-semibold text-ink">Week total</span>
                <span className="text-muted">
                  Avg R:R <b className={cn("num ml-1 font-semibold", tone(t.avgRR))}>{fmtR(t.avgRR)}</b>
                </span>
                <span className="text-muted">
                  Net P&amp;L <b className={cn("num ml-1 font-semibold", tone(t.net))}>{signed(t.net)}</b>
                </span>
              </div>
              {week.unloggedDays > 0 && (
                <span className="text-[12px] font-medium text-loss">
                  {week.unloggedDays} day{week.unloggedDays === 1 ? "" : "s"} unlogged
                </span>
              )}
            </div>
          </Card>
        </Section>
      </SectionReveal>

      {/* 3 — Edge, Thoughts & Patterns (Apple squircle tiles + AI Thought Analysis) */}
      <SectionReveal index={3}>
        <Section id="a3" code="A.3" icon="sparkles" title="Edge, Thoughts &amp; Patterns">
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

            {/* Recent Pre-Trade Thoughts recorded this week (if any) */}
            {thoughtAnalysis.sampleThoughts.length > 0 && (
              <div className="border-t border-line-soft bg-ink/[0.015] px-5 py-3.5 sm:px-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-[11.5px] font-semibold uppercase tracking-[0.06em] text-faint">Pre-trade thoughts</span>
                  {thoughtAnalysis.sampleThoughts.map((st, idx) => (
                    <span key={idx} className="inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12px] text-ink">
                      <span className="num font-medium text-muted">{weekdayShort(st.date)}:</span>
                      <span className="truncate">{st.text}</span>
                      {st.pnl != null && (
                        <span className={cn("num font-semibold", tone(st.pnl))}>{signed(st.pnl)}</span>
                      )}
                    </span>
                  ))}
                </div>
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
                <span>{matrixOpen ? "Hide criteria & pattern breakdown" : "Show criteria & pattern breakdown"}</span>
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
                      <p className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Setup Criteria Win Rates</p>
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
                          {week.criteria.map((c) => (
                            <tr key={c.key} className="transition-colors hover:bg-ink/[0.025]">
                              <Td className="max-w-[260px] pl-4 font-medium">{c.label}</Td>
                              <Td className="num text-right">
                                <EvidenceButton count={c.present} label={`Open ${c.present} trades with ${c.label}`} onClick={() => actions.openIds(c.entryIds, c.label)} />
                              </Td>
                              <Td className="num text-right text-profit">{c.wins}</Td>
                              <Td className="num text-right text-loss">{c.losses}</Td>
                              <Td className="pr-4 text-right">
                                <span className={cn("num inline-block min-w-14 rounded-full px-2.5 py-1 text-center text-[12px] font-semibold", heat(c.winRate, c.present))}>
                                  {fmtPct(c.winRate)}
                                </span>
                              </Td>
                            </tr>
                          ))}
                        </tbody>
                      </TableShell>
                    </div>
                  )}
                  <div className="border-t border-line-soft px-3 pb-3 pt-4">
                    <p className="mb-2 px-3 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Psychological Pattern Matrix</p>
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
                        {[...week.patterns.rows.filter((r) => PSYCH_PATTERNS.some((p) => p.key === r.key) || r.total > 0), week.patterns.correct].map((r) => {
                          const good = r.key === "correct";
                          return (
                            <tr key={r.key} className="transition-colors hover:bg-ink/[0.025]">
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
                                        "num inline-grid h-[24px] min-w-[24px] place-items-center rounded-[7px] px-1 text-[12px] font-semibold",
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
                                  <span className={cn("num font-semibold", r.total ? "text-loss" : "text-faint")}>{r.total}</span>
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

      {/* 4 — 3-Minute Check-In */}
      <SectionReveal index={4}>
        <Section
          id="a5"
          code="A.5"
          icon="target"
          title="3-Minute Check-In"
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
              done={q1Reveal.settled && workedVal.trim().length > 0}
              typing={q1Reveal.typing}
              q="What worked best this week?"
              hint="Tap a highlight or add a quick note."
            >
              <AutoText
                label="What worked best"
                minRows={2}
                value={workedVal}
                onChange={(v) => rn.setText("worked", v)}
                onChipSelect={q1Reveal.triggerChipSettle}
                placeholder="Optional note — one sentence is plenty…"
                chips={workedChips}
              />
            </Prompt>

            <AnimatePresence initial={false}>
              {q1Reveal.settled && (
                <QuestionReveal key="wk-q2">
                  <Prompt
                    step={2}
                    done={q2Reveal.settled && leakVal.trim().length > 0}
                    typing={q2Reveal.typing}
                    q="What was the #1 leak to cut?"
                    hint="Pick the main habit or error to leave behind."
                  >
                    <AutoText
                      label="Biggest leak to cut"
                      minRows={2}
                      value={leakVal}
                      onChange={(v) => rn.setText("not-worked", v)}
                      onChipSelect={q2Reveal.triggerChipSettle}
                      placeholder="Optional note — name the single mistake that cost focus or P&L…"
                      chips={leakChips}
                    />
                  </Prompt>
                </QuestionReveal>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {q2Reveal.settled && (
                <QuestionReveal key="wk-q3">
                  <Prompt
                    step={3}
                    done={commit0.trim().length > 0}
                    q="What is your ONE rule for Monday?"
                    hint="Lock in one concrete behaviour for next week."
                  >
                    <div className="space-y-3">
                      <ChipStagger className="flex flex-wrap items-center gap-1.5">
                        {commitSuggestions.map((chip, idx) => {
                          const active = commit0 === chip.text;
                          return (
                            <button
                              key={idx}
                              type="button"
                              aria-pressed={active}
                              onClick={() => {
                                haptic.selection();
                                rn.setListItem("commitments", 0, active ? "" : chip.text);
                              }}
                              className={cn(
                                "inline-flex min-h-8 items-center gap-1.5 rounded-full border px-3 py-1 text-[12.5px] font-medium outline-none transition-all duration-150 active:scale-95",
                                active
                                  ? "border-gold/50 bg-gold/15 text-gold-deep dark:text-gold"
                                  : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink",
                              )}
                            >
                              {active ? <DrawCheck className="h-3 w-3" /> : <Sym name="sparkles" className="h-3 w-3 opacity-70" />}
                              <span>{chip.label}</span>
                            </button>
                          );
                        })}
                      </ChipStagger>

                      <LineInput
                        index={1}
                        label="Primary rule for next week"
                        value={commit0}
                        onChange={(v) => rn.setListItem("commitments", 0, v)}
                        placeholder="Or type a custom rule for Monday…"
                      />

                      {moreCommitments || commit1.trim().length > 0 || commit2.trim().length > 0 ? (
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
                            setMoreCommitments(true);
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

type RowProps = {
  d: DayRow;
  name: string;
  rn: ReturnType<typeof useReviewNotes>;
  actions: ReviewActions;
  onLog: (date: string) => void;
  onPass: (date: string, on: boolean) => void;
};

function DayRowItem({ d, name, rn, actions, onLog, onPass }: RowProps) {
  const { signed } = useMoney();
  const s = STATE_CHIP[d.state];
  const canMark = d.state === "unlogged" || d.state === "no-setup" || d.state === "pass";

  return (
    <li className="flex flex-col gap-3 px-5 py-3 transition-colors hover:bg-ink/[0.015] sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:px-6">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-3">
        <div className="w-14 shrink-0">
          <span className="block text-[14px] font-semibold leading-tight text-ink">{name}</span>
          <span className="num block text-[11.5px] text-faint">{d.date.slice(5).replace("-", "/")}</span>
        </div>

        <Chip tone={s.t}>{d.state === "holiday" ? d.holiday : s.label}</Chip>

        {canMark && (
          <div className="flex flex-wrap items-center gap-1.5">
            {d.state === "unlogged" && (
              <>
                <QuickDayBtn onClick={() => onLog(d.date)}>Sat on hands</QuickDayBtn>
                <QuickDayBtn onClick={() => onPass(d.date, true)}>Passed setup</QuickDayBtn>
              </>
            )}
            {d.state === "pass" && <QuickDayBtn onClick={() => onPass(d.date, false)}>Undo pass</QuickDayBtn>}
            {(d.state === "no-setup" || d.state === "pass") && (
              <QuickDayBtn
                subtle
                onClick={() => {
                  haptic.selection();
                  rn.setMark(d.date, { skippedValid: false });
                  void useApp.getState().removeNoTradeDay(d.date);
                }}
              >
                Reset
              </QuickDayBtn>
            )}
          </div>
        )}

        {d.noSetupReason && d.state !== "traded" && <span className="truncate text-[12.5px] text-muted">{d.noSetupReason}</span>}

        {d.state === "traded" && (
          <div className="flex flex-wrap items-center gap-2">
            {d.trades.map((e) => (
              <button
                key={e.id}
                type="button"
                onClick={() => {
                  haptic.selection();
                  actions.openTrade(e.id);
                }}
                className="group inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 text-[12.5px] outline-none transition-all hover:border-line-strong active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-gold-strong/50"
              >
                {e.instrument && e.instrument !== "—" && <span className="font-medium text-ink">{e.instrument}</span>}
                <DirTag dir={e.direction ?? null} />
                {e.rr != null && <span className={cn("num text-[12px] font-medium", tone(e.rr))}>{fmtR(e.rr)}</span>}
                <span className={cn("num font-semibold", tone(e.pnl))}>{signed(e.pnl)}</span>
                <Sym name="arrowUpRight" className="h-3 w-3 text-faint transition-transform group-hover:-translate-y-px group-hover:translate-x-px group-hover:text-ink" strokeWidth={2.2} />
              </button>
            ))}
            {d.criteria && (
              <span className={cn("num text-[11.5px] font-medium", d.criteria.met === d.criteria.total ? "text-profit" : "text-muted")}>
                {d.criteria.met}/{d.criteria.total} rules
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 sm:justify-end">
        {d.state === "traded" && d.trades.length > 1 && <span className={cn("num text-[14.5px] font-semibold", tone(d.pnl))}>{signed(d.pnl)}</span>}
        {d.state === "traded" || d.state === "no-setup" || d.state === "pass" ? (
          <GradePicker value={d.grade} auto={!d.gradeIsManual && !!d.grade && d.state === "traded"} compact onChange={(g) => rn.setMark(d.date, { grade: g ?? undefined })} />
        ) : (
          <span className="text-[13px] text-faint">—</span>
        )}
      </div>
    </li>
  );
}

const QuickDayBtn = ({ children, onClick, subtle }: { children: React.ReactNode; onClick: () => void; subtle?: boolean }) => (
  <button
    type="button"
    onClick={onClick}
    className={cn(
      "rounded-full border px-2.5 py-0.5 text-[11.5px] font-medium outline-none transition-all focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95",
      subtle ? "border-transparent text-faint hover:bg-loss/10 hover:text-loss" : "border-line bg-raised text-ink/80 hover:border-line-strong hover:text-ink",
    )}
  >
    {children}
  </button>
);

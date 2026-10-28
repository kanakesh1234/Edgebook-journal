"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { formatDateMedium } from "@/lib/format";
import { Sym } from "@/components/journal/symbols";
import { EASE, SPRING } from "@/components/journal/journal-ui";
import { EmptyState } from "@/components/ui/misc";
import { buildMonth, type ReviewContext } from "@/lib/review/metrics";
import { addMonths, monthTitle, weekLabel } from "@/lib/review/period";
import { PSYCH_PATTERNS } from "@/lib/review/mistakes";
import { cn } from "@/lib/utils";
import {
  AnimatedNumber, AutoText, CarriedCommitments, Card, Chip, DirTag, EvidenceButton,
  fmtPct, fmtR, GradeBadge, Group, LineInput, Prompt, SaveIndicator, Section,
  StatRow, StatStrip, StripCell, TableShell, Td, Th, tone, useMoney, useReviewSettledReveal, type SmartChipOption,
} from "./review-ui";
import { PairBar, SessionCurve, Sparkline, WinRateRing, OutcomeBar, heat } from "./review-charts";
import { useReviewNotes } from "./use-review-notes";
import type { ReviewActions } from "./reviews-panel";

const SHAPE_TEXT: Record<string, string> = {
  ascending: "smooth and ascending",
  recovering: "ascending, with a drawdown along the way",
  descending: "descending, driven by one deep drawdown",
  choppy: "choppy, with frequent reversals",
  empty: "too short to read yet",
};

export function MonthlyReview({ ctx, month, actions }: { ctx: ReviewContext; month: string; actions: ReviewActions }) {
  const { money, signed } = useMoney();
  const reduce = useReducedMotion();
  const rn = useReviewNotes("monthly", month);
  const { notes } = rn;
  const aiBrain = useApp((s) => s.settings.aiBrain);
  const weekly = useApp((s) => s.settings.reviews?.weekly);
  const prevCommit = useApp((s) => s.settings.reviews?.monthly?.[addMonths(month, -1)]?.lists.commitments)?.filter((c) => c.trim()) ?? [];
  const m = useMemo(() => buildMonth(ctx, month, (mon) => weekly?.[mon]?.dayMarks), [ctx, month, weekly]);
  const t = m.totals;
  const [hotDrawdown, setHotDrawdown] = useState<number | null>(null);
  const [hotStreak, setHotStreak] = useState<number | null>(null);
  const [matrixOpen, setMatrixOpen] = useState(false);
  const [moreRules, setMoreRules] = useState(false);

  const wonVal = notes.text["won"] ?? notes.text["edge"] ?? "";
  const lostVal = notes.text["lost"] ?? notes.text["curve"] ?? "";
  const commit0 = notes.lists["commitments"]?.[0] ?? "";
  const commit1 = notes.lists["commitments"]?.[1] ?? "";
  const commit2 = notes.lists["commitments"]?.[2] ?? "";

  // Apple HIG delayed progressive reveal: Q2 unfolds 680ms after pausing on Q1; Q3 unfolds 680ms after pausing on Q2
  const q1Reveal = useReviewSettledReveal(wonVal, lostVal.trim().length > 0 || commit0.trim().length > 0, month, 3, 680);
  const q2Reveal = useReviewSettledReveal(lostVal, commit0.trim().length > 0, month, 3, 680);

  if (m.isFuture) return <EmptyState icon={<Sym name="calendar" className="h-6 w-6" />} title="This month hasn't started" body={`${monthTitle(month)} is still ahead. Complete this review on the last trading day of the month.`} />;

  const bestDay = [...m.days].filter((d) => d.state === "traded").sort((a, b) => b.pnl - a.pnl)[0];
  const worstDay = [...m.days].filter((d) => d.state === "traded").sort((a, b) => a.pnl - b.pnl)[0];
  const topCrit = [...m.criteria].filter((c) => c.present >= 3 && c.winRate != null).sort((a, b) => b.winRate! - a.winRate! || b.present - a.present)[0] ?? m.criteria[0];
  const costly = [...m.mistakes].filter((x) => x.lost > 0).sort((a, b) => b.lost - a.lost)[0] ?? m.mistakes[0];
  const combo = m.combos[0];
  const low = m.thresholds.filter((r) => r.met <= 2 && r.trades > 0);
  const dayText = (d: typeof bestDay, kind: string) => `${kind}: ${formatDateMedium(d.date)} (${signed(d.pnl)} across ${d.trades.length} ${d.trades.length === 1 ? "trade" : "trades"}${d.grade ? `, grade ${d.grade}` : ""}).`;
  const p = m.prop;
  const hardest = m.worstWeek && m.worstWeek !== m.bestWeek ? m.worstWeek : null;

  const wonChips: SmartChipOption[] = [
    ...(topCrit ? [{ label: `Top criterion: ${topCrit.label} (${fmtPct(topCrit.winRate)})`, text: `Strongest edge was confirming “${topCrit.label}” — ${fmtPct(topCrit.winRate)} win rate (${topCrit.wins}/${topCrit.present}).`, tone: "good" as const }] : []),
    ...(combo ? [{ label: `Best combo (${fmtPct(combo.winRate)})`, text: `Highest-probability combo: ${combo.labels.join(" + ")} (${fmtPct(combo.winRate)} over ${combo.trades} trades, ${signed(combo.net)}).`, tone: "good" as const }] : []),
    ...(bestDay && bestDay.pnl > 0 ? [{ label: `Best session (${formatDateMedium(bestDay.date)})`, text: dayText(bestDay, "Best session"), tone: "gold" as const }] : []),
  ];

  const lostChips: SmartChipOption[] = [
    ...(costly ? [{ label: `#1 Leak: ${costly.label} (${costly.count}×)`, text: `Costliest mistake was ${costly.label} — ${costly.lost > 0 ? `${signed(-costly.lost)} across ` : ""}${costly.count} ${costly.count === 1 ? "trade" : "trades"}.`, tone: "bad" as const }] : []),
    ...(m.drawdowns[0] ? [{ label: `Max drawdown (${signed(-m.drawdowns[0].depth)})`, text: `Curve was ${SHAPE_TEXT[m.shape]}, with deepest drawdown ${signed(-m.drawdowns[0].depth)} on ${formatDateMedium(m.drawdowns[0].date)}.`, tone: "bad" as const }] : []),
    ...(low.length ? [{ label: `Low-criteria trades (${low.reduce((s, r) => s + r.trades, 0)})`, text: `Took ${low.reduce((s, r) => s + r.trades, 0)} trades with ≤2 criteria confirmed (${signed(low.reduce((s, r) => s + r.net, 0))}).`, tone: "gold" as const }] : []),
    ...(worstDay && worstDay.pnl < 0 ? [{ label: `Worst session (${formatDateMedium(worstDay.date)})`, text: dayText(worstDay, "Hardest session"), tone: "bad" as const }] : []),
  ];

  const nextMonthRuleChips: SmartChipOption[] = [
    ...(costly ? [{ label: `Eliminate ${costly.label}`, text: `Never enter a trade without checking for ${costly.label.toLowerCase()} in pre-trade Thought.`, tone: "ai" as const }] : []),
    ...(topCrit ? [{ label: `Require ${topCrit.label}`, text: `Require “${topCrit.label}” + at least 3 confirmed checklist rules before sizing full risk.`, tone: "good" as const }] : []),
    { label: "Protect prop drawdown", text: "Cap daily risk strictly at 1R after a losing trade so drawdown never compounds.", tone: "gold" as const },
  ];

  const completedQuestions = [wonVal.trim(), lostVal.trim(), commit0.trim()].filter(Boolean).length;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Sessions <b className="num font-semibold text-ink">{m.sessions} / {m.tradingDays}</b></Chip>
          <Chip>{m.balance != null ? <>Month-end balance <b className="num font-semibold text-ink">{money(m.balance)}</b></> : "Balance unavailable"}</Chip>
          <Chip tone="gold"><Sym name="sparkles" className="h-3 w-3" />3-Minute Ritual · {completedQuestions}/3 done</Chip>
        </div>
        <SaveIndicator state={rn.state} />
      </div>

      {/* AI Brain Monthly Synthesis Card */}
      <motion.section
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.48, ease: EASE }}
        aria-label="AI Brain Monthly Synthesis"
        className={cn(
          "relative overflow-hidden rounded-[26px] border border-ink/[0.08] p-5 sm:p-6",
          "bg-gradient-to-br from-[#5e5ce6]/[0.08] via-surface to-gold/[0.07] shadow-panel",
          "dark:border-white/10 dark:from-[#5e5ce6]/[0.14] dark:via-surface dark:to-gold/[0.08]",
        )}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-[#5e5ce6] text-white shadow-[0_6px_16px_-4px_rgb(94_92_230/0.55)]">
              <Sym name="sparkles" className="h-5 w-5" />
            </span>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <p className="text-[14.5px] font-semibold tracking-[-0.01em] text-ink">AI Brain · Monthly Executive Brief</p>
                <span className="inline-flex items-center gap-1 rounded-full bg-profit/12 px-2.5 py-0.5 text-[11px] font-semibold text-profit">
                  <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                  Synced to Google Drive
                </span>
                {aiBrain && (
                  <span className="rounded-full bg-[#5e5ce6]/14 px-2.5 py-0.5 text-[11px] font-semibold text-[#5e5ce6] dark:text-[#a5a4ff]">
                    {aiBrain.tier} · {aiBrain.calibrationPct}% calibrated
                  </span>
                )}
              </div>
              <p className="mt-0.5 text-[12.5px] text-muted">
                Every trade from Plan → Thought → Setup → Autopsy is synthesized here. Review the numbers and answer 3 short prompts below.
              </p>
            </div>
          </div>
          <a
            href="#b6"
            className="inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-[12.5px] font-semibold text-canvas transition-transform hover:opacity-90 active:scale-95"
          >
            <span>Jump to 3 questions</span>
            <Sym name="arrowDownRight" className="h-3.5 w-3.5" />
          </a>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="rounded-[18px] border border-line-soft bg-surface/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-profit">A+ Edge Driver</p>
            <p className="mt-1 text-[14.5px] font-semibold leading-snug text-ink">
              {combo
                ? `${combo.labels.join(" + ")} (${fmtPct(combo.winRate)})`
                : topCrit
                  ? `${topCrit.label} (${fmtPct(topCrit.winRate)})`
                  : m.bestWeek
                    ? `Week ${m.bestWeek.label} (${signed(m.bestWeek.net)})`
                    : "Building monthly sample"}
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              {combo
                ? `Generated ${signed(combo.net)} across ${combo.trades} high-conviction trades.`
                : topCrit
                  ? `Confirmed on ${topCrit.present} trades with ${topCrit.wins} wins.`
                  : "Confirm setup rules in Plan Trade to map your best combinations."}
            </p>
          </div>

          <div className="rounded-[18px] border border-line-soft bg-surface/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-loss">Costliest Leak</p>
            <p className="mt-1 text-[14.5px] font-semibold leading-snug text-ink">
              {costly
                ? `${costly.label} (${costly.count}×)`
                : m.forcedTrades > 0
                  ? `${m.forcedTrades} forced trade${m.forcedTrades === 1 ? "" : "s"}`
                  : "Zero major mistake leaks"}
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              {costly
                ? costly.lost > 0
                  ? `Cost ${signed(-costly.lost)} across ${monthTitle(month)}.`
                  : "Flagged in post-trade autopsies."
                : "Discipline held across sessions."}
            </p>
          </div>

          <div className="rounded-[18px] border border-line-soft bg-surface/90 p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#5e5ce6] dark:text-[#a5a4ff]">Equity &amp; Prop Status</p>
            <p className="mt-1 text-[14.5px] font-semibold leading-snug text-ink">
              {m.curve.length >= 2 ? `Curve is ${SHAPE_TEXT[m.shape]}` : `${m.sessions} active sessions`}
            </p>
            <p className="mt-1 text-[12.5px] text-muted">
              {p.dailyLossBreaches === 0
                ? "0 daily loss limit breaches all month."
                : p.dailyLossBreaches != null
                  ? `${p.dailyLossBreaches}× daily loss limit breached — tighten stop rules.`
                  : `${m.noSetupDays} disciplined no-setup days logged.`}
            </p>
          </div>
        </div>
      </motion.section>

      <CarriedCommitments title="Commitments carried from last month" items={prevCommit} done={notes.done} onToggle={(i, v) => rn.setDone(`prev:${i}`, v)} />

      {/* B.1 — Scorecard */}
      <Section id="b1" code="B.1" icon="gauge" title="Scorecard" hint="Every figure is calculated from this month's trades. Missing data shows “—”, never a guess.">
        <Card pad={false} className="overflow-hidden rounded-[26px]">
          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="p-5 sm:p-7">
              <p className="text-[14px] font-medium text-muted">Net monthly P&amp;L</p>
              <p className={cn("num mt-1.5 text-[52px] font-semibold leading-none tracking-[-0.045em] sm:text-[64px]", tone(t.net))}><AnimatedNumber value={t.net} format={signed} /></p>
              <p className="mt-2.5 text-[13px] text-faint">Total</p>
              {m.curve.length > 1 && <div className="mt-6"><Sparkline values={m.curve.map((c) => c.cum)} height={84} /></div>}
            </div>
            <div className="flex flex-col justify-center gap-7 border-t border-line-soft p-5 sm:p-7 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-5">
                <WinRateRing value={t.winRate} />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-muted">Win rate</p>
                  <p className="mt-0.5 text-[14px] text-ink">{t.trades ? <><span className="num font-semibold">{t.winners}</span> of <span className="num font-semibold">{t.trades}</span> trades</> : <span className="text-faint">No trades</span>}</p>
                </div>
              </div>
              <OutcomeBar winners={t.winners} losers={t.losers} />
            </div>
          </div>
          <StatStrip count={3} className="border-t border-line-soft">
            <StripCell label="Profit factor" value={t.profitFactor == null ? "—" : t.profitFactor.toFixed(2)} valueClass={t.profitFactor == null ? undefined : t.profitFactor >= 1 ? "text-profit" : "text-loss"} sub={t.profitFactor == null ? (t.trades ? "No losing trades" : "No trades") : "Gross win ÷ gross loss"} />
            <StripCell label="Avg R:R" value={t.realizedRR == null ? fmtR(t.avgRR) : `${t.realizedRR.toFixed(2)}R`} sub={t.realizedRR != null ? "Realized (avg win ÷ avg loss)" : t.avgRR != null ? "Recorded average" : "None recorded"} />
            <StripCell label="Process grade" value={m.avgGrade ?? "—"} sub={m.avgGrade ? "Average, A–D" : "No verdicts yet"} />
          </StatStrip>
        </Card>

        <div className="mt-5 grid gap-5 lg:grid-cols-3">
          <Group title="Per trade">
            {t.avgWin != null && t.avgLoss != null && (
              <div className="px-4 py-4"><PairBar a={{ label: "Avg winner", value: t.avgWin, text: signed(t.avgWin) }} b={{ label: "Avg loser", value: t.avgLoss, text: signed(-t.avgLoss) }} /></div>
            )}
            {(t.avgWin == null || t.avgLoss == null) && <>
              <StatRow label="Avg winning trade" sub="Mean winner" value={t.avgWin == null ? "—" : signed(t.avgWin)} valueClass={t.avgWin ? "text-profit" : undefined} />
              <StatRow label="Avg losing trade" sub="Mean loser" value={t.avgLoss == null ? "—" : signed(-t.avgLoss)} valueClass={t.avgLoss ? "text-loss" : undefined} />
            </>}
            <StatRow label="Largest win" sub="Best trade" value={t.largestWin == null ? "—" : signed(t.largestWin)} valueClass={t.largestWin ? "text-profit" : undefined} />
            <StatRow label="Largest loss" sub="Worst trade" value={t.largestLoss == null ? "—" : signed(t.largestLoss)} valueClass={t.largestLoss ? "text-loss" : undefined} />
          </Group>
          <Group title="Weeks">
            <StatRow label="Best week" sub={m.bestWeek ? `Week ${m.bestWeek.label} · ${weekLabel(m.bestWeek.monday)}` : undefined} value={m.bestWeek ? signed(m.bestWeek.net) : "—"} valueClass={m.bestWeek ? tone(m.bestWeek.net) : undefined} onClick={m.bestWeek && actions.openWeek ? () => actions.openWeek!(m.bestWeek!.monday) : undefined} hint="Open this week's review" />
            <StatRow label="Hardest week" sub={hardest ? `Week ${hardest.label} · ${weekLabel(hardest.monday)}` : undefined} value={hardest ? signed(hardest.net) : "—"} valueClass={hardest ? tone(hardest.net) : undefined} onClick={hardest && actions.openWeek ? () => actions.openWeek!(hardest.monday) : undefined} hint="Open this week's review" />
          </Group>
          <Group title="Discipline">
            <StatRow label="No-setup days" sub="Discipline count" value={m.noSetupDays} />
            <StatRow label="Forced trades" sub="Over the daily limit or flagged" value={m.forcedTrades} valueClass={m.forcedTrades ? "text-loss" : undefined} />
          </Group>
        </div>
      </Section>

      {/* B.3 — Equity curve */}
      <Section id="b3" code="B.3" icon="chart" title="Equity curve" hint="Cumulative P&L after each session. Red numbers mark the three deepest drawdowns; green bands your best streaks. Hover the chart to read a session.">
        <Card pad={false} className="overflow-hidden">
          <div className="p-3 sm:p-5"><SessionCurve curve={m.curve} drawdowns={m.drawdowns} streaks={m.streaks} activeDrawdown={hotDrawdown} activeStreak={hotStreak} /></div>
          {(m.drawdowns.length > 0 || m.streaks.length > 0) && (
            <div className="grid divide-y divide-line-soft border-t border-line-soft sm:grid-cols-2 sm:divide-x sm:divide-y-0">
              <div className="px-5 py-4 sm:px-6">
                <p className="mb-2 text-[13px] font-medium text-muted">Deepest drawdowns</p>
                {m.drawdowns.length === 0 ? <p className="text-[14px] text-muted">No drawdown this month.</p> : m.drawdowns.map((d, i) => (
                  <p key={d.date} tabIndex={0} onPointerEnter={() => setHotDrawdown(i)} onPointerLeave={() => setHotDrawdown(null)} onFocus={() => setHotDrawdown(i)} onBlur={() => setHotDrawdown(null)} className="-mx-2 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[14px] outline-none transition-colors hover:bg-loss/[0.07] focus-visible:bg-loss/[0.07]">
                    <span className="num grid h-5 w-5 place-items-center rounded-full bg-loss/15 text-[11px] font-semibold text-loss">{i + 1}</span><span className="text-muted">{formatDateMedium(d.date)} · session {d.session}</span><span className="num ml-auto font-semibold text-loss">{signed(-d.depth)}</span>
                  </p>
                ))}
              </div>
              <div className="px-5 py-4 sm:px-6">
                <p className="mb-2 text-[13px] font-medium text-muted">Best winning streaks</p>
                {m.streaks.length === 0 ? <p className="text-[14px] text-muted">No back-to-back winning sessions yet.</p> : m.streaks.map((s, i) => (
                  <p key={i} tabIndex={0} onPointerEnter={() => setHotStreak(i)} onPointerLeave={() => setHotStreak(null)} onFocus={() => setHotStreak(i)} onBlur={() => setHotStreak(null)} className="-mx-2 flex items-center gap-2.5 rounded-[10px] px-2 py-1.5 text-[14px] outline-none transition-colors hover:bg-profit/[0.08] focus-visible:bg-profit/[0.08]">
                    <span className="num grid h-5 w-5 place-items-center rounded-full bg-profit/15 text-[11px] font-semibold text-profit">{i + 1}</span><span className="text-muted">{s.length} sessions · {formatDateMedium(m.curve[s.from].date)} – {formatDateMedium(m.curve[s.to].date)}</span><span className="num ml-auto font-semibold text-profit">{signed(s.pnl)}</span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </Card>
      </Section>

      {/* B.2 — Session log */}
      <Section id="b2" code="B.2" icon="list" title="Session log" hint="Every trade this month, in order. Select a row to open the full journal entry.">
        {m.log.length === 0 ? <Card><p className="text-[14.5px] text-muted">No trades logged in {monthTitle(month)}.</p></Card> : (
          <Card pad={false} className="overflow-hidden">
            <div className="hidden px-3 pb-1 pt-4 md:block">
              <TableShell min={860}>
                <thead><tr><Th className="pl-4">#</Th><Th>Date</Th><Th>Setup</Th><Th>Criteria</Th><Th>Dir</Th><Th className="text-right">R:R</Th><Th className="text-right">P&amp;L</Th><Th className="text-right">Cum. P&amp;L</Th><Th className="pl-5">Grade</Th><Th>Primary pattern</Th></tr></thead>
                <tbody>
                  {m.log.map((r) => (
                    <tr key={r.entry.id} tabIndex={0} aria-label={`Open trade ${r.n}`} onClick={() => actions.openTrade(r.entry.id)} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); actions.openTrade(r.entry.id); } }}
                      className="cursor-pointer outline-none transition-colors hover:bg-ink/[0.03] focus-visible:bg-ink/[0.045] focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--gold-strong)_45%,transparent)]">
                      <Td className="num pl-4 !font-normal text-faint">{r.n}</Td><Td className="num whitespace-nowrap !font-normal">{formatDateMedium(r.entry.date)}</Td>
                      <Td className="max-w-[160px] truncate">{r.entry.setup && r.entry.setup !== "—" ? r.entry.setup : <span className="text-faint">—</span>}</Td>
                      <Td className="num">{r.criteria ? `${r.criteria.met}/${r.criteria.total}` : <span className="text-faint">—</span>}</Td>
                      <Td><DirTag dir={r.entry.direction ?? null} /></Td>
                      <Td className={cn("num text-right", tone(r.entry.rr))}>{fmtR(r.entry.rr)}</Td>
                      <Td className={cn("num text-right text-[15px] font-semibold", tone(r.entry.pnl))}>{signed(r.entry.pnl)}</Td>
                      <Td className={cn("num text-right font-normal", tone(r.cum))}>{signed(r.cum)}</Td>
                      <Td className="pl-5"><GradeBadge grade={r.grade} /></Td>
                      <Td className="whitespace-nowrap"><span className={cn("inline-flex items-center gap-1.5", r.primary === "Correct execution" ? "text-profit" : r.primary === "—" ? "text-faint" : "text-loss")}>{r.primary !== "—" && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}{r.primary}</span></Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
            <ul className="divide-y divide-line-soft/80 md:hidden">
              {m.log.map((r) => (
                <li key={r.entry.id}>
                  <button type="button" onClick={() => actions.openTrade(r.entry.id)} className="flex w-full items-center gap-3 px-4 py-3.5 text-left outline-none transition-colors active:bg-ink/[0.05] focus-visible:bg-ink/[0.04]">
                    <span className="num w-6 text-[12px] !font-normal text-faint">{r.n}</span>
                    <span className="min-w-0 flex-1"><span className="flex items-center gap-2 text-[14.5px] font-medium text-ink">{formatDateMedium(r.entry.date)} <DirTag dir={r.entry.direction ?? null} /></span><span className={cn("mt-0.5 block truncate text-[12.5px]", r.primary === "Correct execution" ? "text-profit" : r.primary === "—" ? "text-faint" : "text-loss")}>{r.primary}{r.criteria ? ` · ${r.criteria.met}/${r.criteria.total} criteria` : ""}</span></span>
                    <span className="text-right"><span className={cn("num block text-[16px] font-semibold tracking-[-0.01em]", tone(r.entry.pnl))}>{signed(r.entry.pnl)}</span><span className={cn("num block text-[12px] font-normal", tone(r.cum))}>{signed(r.cum)}</span></span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        )}
      </Section>

      {/* B.4 — Edge, Prop & Automated Decisions */}
      <Section
        id="b4"
        code="B.4"
        icon="shield"
        title="Edge &amp; Prop Checkpoint"
        hint={ctx.challenge ? `Measured against “${ctx.challenge.name}” and your recorded checklist rules.` : "Measured against your Settings targets and recorded checklist rules."}
        aside={<Chip tone={p.status === "pass" ? "good" : p.status === "fail" ? "bad" : "gold"}>{{ pass: "Passed", fail: "Failed", "in-progress": "In progress", none: "No target set" }[p.status]}</Chip>}
      >
        <Card pad={false} className="overflow-hidden">
          <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-line-soft">
            <div className="p-5 sm:p-6"><Meter label="Profit target" target={p.target} actual={p.achieved} fmt={money} good={p.target != null && p.achieved >= p.target} suffix={p.target != null ? `${Math.max(0, Math.round((p.achieved / p.target) * 100))}% of target` : "Set a target in Settings or a challenge"} reduce={!!reduce} /></div>
            <div className="border-t border-line-soft p-5 sm:p-6 lg:border-t-0"><Meter label="Max drawdown used" target={p.maxDrawdown} actual={p.drawdownUsed} fmt={money} good={!p.drawdownBreached} invert suffix={p.maxDrawdown != null && p.drawdownUsed != null ? `${Math.round((p.drawdownUsed / p.maxDrawdown) * 100)}% of the allowance${p.drawdownBreached ? " — breached" : ""}` : "No max drawdown set"} reduce={!!reduce} /></div>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-line-soft px-5 py-4 sm:px-6">
            <div className="min-w-0"><p className="text-[14.5px] font-medium text-ink">Daily loss limit breached</p><p className="text-[12.5px] text-muted">{p.dailyLossLimit != null ? `Limit ${money(p.dailyLossLimit)} per day · target 0 times` : "No daily loss limit set"}</p></div>
            <span className={cn("num text-[26px] font-semibold tracking-[-0.03em]", p.dailyLossBreaches == null ? "text-faint" : p.dailyLossBreaches === 0 ? "text-profit" : "text-loss")}>{p.dailyLossBreaches == null ? "—" : `${p.dailyLossBreaches}×`}</span>
          </div>

          <div className="border-t border-line-soft px-5 py-3 sm:px-6">
            <button
              type="button"
              aria-expanded={matrixOpen}
              onClick={() => setMatrixOpen((v) => !v)}
              className="flex w-full items-center justify-between text-left text-[13.5px] font-medium text-muted outline-none transition-colors hover:text-ink"
            >
              <span>{matrixOpen ? "Hide criteria heatmap & psychological breakdown" : "Inspect criteria heatmap & psychological breakdown"}</span>
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
                transition={{ duration: 0.34, ease: EASE }}
                className="overflow-hidden border-t border-line-soft"
              >
                {m.heatmap.length > 0 && (
                  <div className="px-3 pb-3 pt-4">
                    <p className="mb-2 px-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">Setup-Criteria Heatmap by Week</p>
                    <TableShell min={Math.max(560, 260 + m.weeks.length * 92)}>
                      <thead><tr><Th className="pl-4">Criterion</Th>{m.weeks.map((w) => <Th key={w.monday} className="text-center"><button type="button" onClick={() => actions.openWeek?.(w.monday)} title={weekLabel(w.monday)} className="rounded-md px-1.5 py-0.5 outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink">Wk {w.label}</button></Th>)}<Th className="text-center">Month</Th></tr></thead>
                      <tbody>
                        {m.heatmap.map((h, ri) => (
                          <tr key={h.key}>
                            <Td className="max-w-[240px] pl-4 font-medium">{h.label}</Td>
                            {h.perWeek.map((c, ci) => <Td key={ci} className="text-center"><Cell rate={c.winRate} n={c.present} delay={0.04 + (ri + ci) * 0.02} reduce={!!reduce} /></Td>)}
                            <Td className="text-center"><Cell rate={h.total.winRate} n={h.total.present} delay={0.04 + ri * 0.02} reduce={!!reduce} strong onClick={() => actions.openIds(h.total.entryIds, h.label)} /></Td>
                          </tr>
                        ))}
                      </tbody>
                    </TableShell>
                  </div>
                )}

                <div className="border-t border-line-soft px-3 pb-3 pt-4">
                  <p className="mb-2 px-3 text-[12px] font-semibold uppercase tracking-[0.08em] text-faint">Psychological Patterns &amp; Cost</p>
                  <TableShell min={580}>
                    <thead><tr><Th className="pl-4">Pattern</Th><Th className="text-right">Frequency</Th><Th className="text-right pr-4">Impact (lost)</Th></tr></thead>
                    <tbody>
                      {[...m.patterns.rows.filter((r) => PSYCH_PATTERNS.some((x) => x.key === r.key) || r.total > 0), m.patterns.correct].map((r) => (
                        <tr key={r.key} className="transition-colors hover:bg-ink/[0.025]">
                          <Td className="pl-4 font-medium">{r.label}{r.manual && <span className="ml-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-medium text-faint">Self-reported</span>}</Td>
                          <Td className="text-right">{r.manual ? <span className="num font-semibold text-ink">{r.total}</span> : <EvidenceButton count={r.total} label={`Open ${r.total} trades: ${r.label}`} onClick={() => actions.openIds(r.entryIds, r.label)} />}</Td>
                          <Td className={cn("num text-right pr-4 font-semibold", r.lost ? "text-loss" : "text-faint")}>{r.key === "correct" || r.manual ? "—" : r.lost ? signed(-r.lost) : "—"}</Td>
                        </tr>
                      ))}
                    </tbody>
                  </TableShell>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>

        <div className="mt-5 grid items-start gap-4 md:grid-cols-2">
          {m.decisions.map((d, i) => <Decision key={d.id} d={d} index={i} />)}
        </div>
      </Section>

      {/* B.6 — 3-Minute Monthly Ritual (Sweet, short, progressive delayed reveal) */}
      <Section
        id="b6"
        code="B.6"
        icon="target"
        title="3-Minute Monthly Ritual"
        hint="No procrastination. Answer 3 focused prompts—each one reveals smoothly after you finish typing, with one-tap AI chips from your data."
        aside={<SaveIndicator state={rn.state} />}
      >
        <Card className="space-y-7 rounded-[26px] p-6 sm:p-8">
          {/* Question 1 */}
          <Prompt
            step={1}
            done={q1Reveal.settled && wonVal.trim().length > 0}
            typing={q1Reveal.typing}
            q="What was your #1 A+ edge this month? (Replicate)"
          >
            <AutoText
              label="Biggest reason I won"
              minRows={2}
              value={wonVal}
              onChange={(v) => rn.setText("won", v)}
              placeholder="Name the setup, criterion, or habit that paid you most."
              chips={wonChips}
            />
          </Prompt>

          {/* Question 2 — Unfolds smoothly after 680ms typing settle on Q1 */}
          <AnimatePresence initial={false}>
            {q1Reveal.settled && (
              <motion.div
                key="mo-q2"
                initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.46, ease: EASE, delay: 0.06 }}
                className="border-t border-line-soft pt-6"
              >
                <Prompt
                  step={2}
                  done={q2Reveal.settled && lostVal.trim().length > 0}
                  typing={q2Reveal.typing}
                  q="What single leak hurt your equity curve the most? (Eliminate)"
                >
                  <AutoText
                    label="Biggest reason I lost"
                    minRows={2}
                    value={lostVal}
                    onChange={(v) => rn.setText("lost", v)}
                    placeholder="Be specific — which mistake or drawdown trigger cost you?"
                    chips={lostChips}
                  />
                </Prompt>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Question 3 — Unfolds smoothly after 680ms typing settle on Q2 */}
          <AnimatePresence initial={false}>
            {q2Reveal.settled && (
              <motion.div
                key="mo-q3"
                initial={{ opacity: 0, y: 14, filter: "blur(4px)" }}
                animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.46, ease: EASE, delay: 0.06 }}
                className="border-t border-line-soft pt-6"
              >
                <Prompt
                  step={3}
                  done={commit0.trim().length > 0}
                  q="What is your ONE measurable commitment for next month?"
                >
                  <div className="space-y-3">
                    <LineInput
                      index={1}
                      label="Primary commitment for next month"
                      value={commit0}
                      onChange={(v) => rn.setListItem("commitments", 0, v)}
                      placeholder="A specific, measurable rule I will keep next month…"
                    />
                    <div className="flex flex-wrap items-center gap-1.5">
                      {nextMonthRuleChips
                        .filter((c) => c.text !== commit0)
                        .map((chip, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => rn.setListItem("commitments", 0, chip.text)}
                            className="inline-flex items-center gap-1.5 rounded-full bg-[#5e5ce6]/12 px-3 py-1 text-[12px] font-medium text-[#5e5ce6] transition-all hover:bg-[#5e5ce6]/20 active:scale-95 dark:text-[#a5a4ff]"
                          >
                            <Sym name="sparkles" className="h-3 w-3" />
                            <span>+ {chip.label}</span>
                          </button>
                        ))}
                    </div>

                    {(moreRules || commit1.trim().length > 0 || commit2.trim().length > 0) ? (
                      <div className="space-y-2.5 pt-2">
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
                        onClick={() => setMoreRules(true)}
                        className="inline-flex items-center gap-1 text-[12.5px] font-medium text-muted transition-colors hover:text-ink"
                      >
                        <span>+ Add up to 2 more rules (optional)</span>
                      </button>
                    )}
                  </div>
                </Prompt>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </Section>
    </div>
  );
}

/** One month-end question. The answer that applies is shown; the other is a tap away. */
function Decision({ d, index }: { d: ReturnType<typeof buildMonth>["decisions"][number]; index: number }) {
  const [open, setOpen] = useState(false);
  const known = d.yes != null;
  const blocks = [
    { k: true, label: "If yes", text: d.ifYes, on: "bg-profit/12", lab: "text-profit" },
    { k: false, label: "If no", text: d.ifNo, on: "bg-loss/12", lab: "text-loss" },
  ];
  const shown = known ? blocks.filter((b) => b.k === d.yes) : blocks;
  const other = known ? blocks.filter((b) => b.k !== d.yes) : [];
  const Block = ({ b, dim }: { b: (typeof blocks)[number]; dim?: boolean }) => (
    <p className={cn("rounded-[12px] px-3.5 py-2.5 text-[13.5px] leading-snug", dim || !known ? "bg-ink/[0.04] text-muted" : `${b.on} text-ink`)}><b className={cn("mb-0.5 block text-[12px] font-semibold", dim || !known ? "text-faint" : b.lab)}>{b.label}</b>{b.text}</p>
  );
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.05 + index * 0.05 }} className="rounded-[20px] border border-line-soft bg-surface p-4 shadow-panel sm:p-5">
      <div className="flex items-start gap-3.5">
        <span className={cn("mt-px grid h-8 w-8 shrink-0 place-items-center rounded-full", d.yes == null ? "bg-ink/[0.06] text-faint" : d.yes ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss")}><Sym name={d.yes == null ? "circleHalf" : d.yes ? "check" : "xmark"} className="h-[17px] w-[17px]" strokeWidth={2.2} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <p className="text-[15.5px] font-semibold leading-snug tracking-[-0.01em] text-ink">{d.label}</p>
            <Chip tone={d.yes == null ? "neutral" : d.yes ? "good" : "bad"} className="shrink-0">{d.yes == null ? "No data" : d.yes ? "Yes" : "No"}</Chip>
          </div>
          <p className="num mt-0.5 text-[13px] !font-normal text-muted">{d.detail}</p>
        </div>
      </div>
      <div className="mt-3.5 space-y-2">
        {shown.map((b) => <Block key={String(b.k)} b={b} />)}
        <AnimatePresence initial={false}>
          {open && other.map((b) => (
            <motion.div key={String(b.k)} initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: EASE }} className="overflow-hidden"><Block b={b} dim /></motion.div>
          ))}
        </AnimatePresence>
      </div>
      {known && (
        <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)} className="mt-2.5 inline-flex items-center gap-1 rounded-full py-0.5 pr-1 text-[12.5px] font-medium text-muted outline-none transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-gold-strong/50">
          {open ? "Hide the other outcome" : "See the other outcome"}
          <Sym name="chevronDown" className={cn("h-3.5 w-3.5 transition-transform duration-300", open && "rotate-180")} strokeWidth={2} />
        </button>
      )}
    </motion.div>
  );
}

function Cell({ rate, n, delay, reduce, strong, onClick }: { rate: number | null; n: number; delay: number; reduce: boolean; strong?: boolean; onClick?: () => void }) {
  const body = n === 0 ? "·" : <>{fmtPct(rate)}<span className="ml-1 text-[10.5px] font-medium opacity-60">n={n}</span></>;
  const cls = cn("num inline-block min-w-[74px] rounded-[10px] px-2 py-1.5 text-center text-[12.5px] font-semibold", heat(rate, n), strong && n > 0 && "ring-1 ring-inset ring-current/25");
  return (
    <motion.span initial={reduce ? false : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay, type: "spring", stiffness: 420, damping: 32 }} className="inline-block" title={n ? `${n} trade${n === 1 ? "" : "s"} with this criterion` : "Not present"}>
      {onClick && n > 0 ? <button type="button" onClick={onClick} className={cn(cls, "outline-none transition-transform hover:scale-[1.04] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95")}>{body}</button> : <span className={cls}>{body}</span>}
    </motion.span>
  );
}

function Meter({ label, target, actual, fmt, good, suffix, invert, reduce }: { label: string; target: number | null; actual: number | null; fmt: (n: number) => string; good: boolean; suffix: string; invert?: boolean; reduce: boolean }) {
  const frac = target && actual != null ? Math.min(1, Math.max(0, actual / target)) : 0;
  const warn = invert && frac >= 0.75;
  return (
    <div>
      <p className="text-[14px] font-medium text-muted">{label}</p>
      <p className="num mt-1 flex items-baseline gap-1.5"><b className={cn("text-[30px] font-semibold leading-none tracking-[-0.035em]", actual == null ? "text-faint" : good ? "text-profit" : "text-loss")}>{actual == null ? "—" : fmt(actual)}</b><span className="text-[14px] font-normal text-muted">of {target == null ? "—" : fmt(target)}</span></p>
      <div className="relative mt-4 h-2.5 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(frac * 100)}>
        <motion.div initial={reduce ? false : { width: 0 }} animate={{ width: `${frac * 100}%` }} transition={{ duration: 1, ease: EASE, delay: 0.15 }} className={cn("h-full rounded-full", invert ? (warn || !good ? "bg-loss" : "bg-gold-strong") : good ? "bg-profit" : "bg-gold-strong")} />
        {invert && target != null && <span className="absolute inset-y-0 left-3/4 w-px bg-canvas/80" aria-hidden />}
      </div>
      <p className="mt-2 text-[13px] text-muted">{suffix}</p>
    </div>
  );
}

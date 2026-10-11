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
import { AnimatedNumber, AutoText, CarriedCommitments, Card, Chip, DirTag, EvidenceButton, fmtPct, fmtR, GradeBadge, Group, LineInput, Prompt, SaveIndicator, Section, StatRow, StatStrip, StripCell, TableShell, Td, Th, tone, useMoney } from "./review-ui";
import { PairBar, SessionCurve, Sparkline, WinRateRing, OutcomeBar, heat } from "./review-charts";
import { useReviewNotes } from "./use-review-notes";
import type { ReviewActions } from "./reviews-panel";

const SHAPE_TEXT: Record<string, string> = {
  ascending: "smooth and ascending", recovering: "ascending, with a drawdown along the way", descending: "descending, driven by one deep drawdown", choppy: "choppy, with frequent reversals", empty: "too short to read yet",
};

export function MonthlyReview({ ctx, month, actions }: { ctx: ReviewContext; month: string; actions: ReviewActions }) {
  const { money, signed } = useMoney();
  const reduce = useReducedMotion();
  const rn = useReviewNotes("monthly", month);
  const { notes } = rn;
  const weekly = useApp((s) => s.settings.reviews?.weekly);
  const prevCommit = useApp((s) => s.settings.reviews?.monthly?.[addMonths(month, -1)]?.lists.commitments)?.filter((c) => c.trim()) ?? [];
  const m = useMemo(() => buildMonth(ctx, month, (mon) => weekly?.[mon]?.dayMarks), [ctx, month, weekly]);
  const t = m.totals;
  // Hovering a drawdown or streak in the lists lights its marker on the curve.
  const [hotDrawdown, setHotDrawdown] = useState<number | null>(null);
  const [hotStreak, setHotStreak] = useState<number | null>(null);

  if (m.isFuture) return <EmptyState icon={<Sym name="calendar" className="h-6 w-6" />} title="This month hasn't started" body={`${monthTitle(month)} is still ahead. Complete this review on the last trading day of the month.`} />;

  const bestDay = [...m.days].filter((d) => d.state === "traded").sort((a, b) => b.pnl - a.pnl)[0];
  const worstDay = [...m.days].filter((d) => d.state === "traded").sort((a, b) => a.pnl - b.pnl)[0];
  const topCrit = [...m.criteria].filter((c) => c.present >= 3 && c.winRate != null).sort((a, b) => b.winRate! - a.winRate! || b.present - a.present)[0];
  const costly = [...m.mistakes].filter((x) => x.lost > 0).sort((a, b) => b.lost - a.lost)[0];
  const mostPresent = m.criteria[0];
  const combo = m.combos[0];
  const low = m.thresholds.filter((r) => r.met <= 2 && r.trades > 0);
  const dayText = (d: typeof bestDay, kind: string) => `${kind}: ${formatDateMedium(d.date)} — ${signed(d.pnl)} over ${d.trades.length} ${d.trades.length === 1 ? "trade" : "trades"}${d.grade ? `, grade ${d.grade}` : ""}.`;
  const p = m.prop;
  const hardest = m.worstWeek && m.worstWeek !== m.bestWeek ? m.worstWeek : null;

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>Sessions <b className="num font-semibold text-ink">{m.sessions} / {m.tradingDays}</b></Chip>
          <Chip>{m.balance != null ? <>Month-end balance <b className="num font-semibold text-ink">{money(m.balance)}</b></> : "Balance unavailable"}</Chip>
        </div>
        <SaveIndicator state={rn.state} />
      </div>

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
        <div className="mt-6 max-w-3xl"><Prompt q="Describe the shape of your equity curve. Smooth, choppy, or a specific drawdown cluster — and what caused it?">
          <AutoText label="Equity curve shape" value={notes.text["curve"] ?? ""} onChange={(v) => rn.setText("curve", v)} placeholder="What caused the shape?" suggest={m.curve.length >= 3 ? { text: `Curve shape: ${SHAPE_TEXT[m.shape]}.${m.drawdowns[0] ? ` Deepest drawdown ${signed(-m.drawdowns[0].depth)} by ${formatDateMedium(m.drawdowns[0].date)}.` : ""}`, label: "Add curve summary" } : null} />
        </Prompt></div>
      </Section>

      {/* B.4 — Heatmap */}
      <Section id="b4" code="B.4" icon="checklist" title="Setup-criteria heatmap" hint="Win rate when each criterion was confirmed, by week. Faint cells have fewer than 3 trades — don't trust them yet.">
        <Card pad={false} className="overflow-hidden">
          {m.heatmap.length === 0 ? <p className="p-5 text-[14.5px] leading-relaxed text-muted sm:p-6">No criteria recorded this month. Confirm the pre-trade checklist on each trade and the heatmap fills itself.</p> : (
            <div className="px-3 pb-2 pt-4">
              <TableShell min={Math.max(560, 260 + m.weeks.length * 92)}>
                <thead><tr><Th className="pl-4">Criterion</Th>{m.weeks.map((w) => <Th key={w.monday} className="text-center"><button type="button" onClick={() => actions.openWeek?.(w.monday)} title={weekLabel(w.monday)} className="rounded-md px-1.5 py-0.5 outline-none transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:ring-2 focus-visible:ring-gold-strong/50">Wk {w.label}</button></Th>)}<Th className="text-center">Month</Th></tr></thead>
                <tbody>
                  {m.heatmap.map((h, ri) => (
                    <tr key={h.key}>
                      <Td className="max-w-[240px] pl-4 font-medium">{h.label}</Td>
                      {h.perWeek.map((c, ci) => <Td key={ci} className="text-center"><Cell rate={c.winRate} n={c.present} delay={0.1 + (ri + ci) * 0.025} reduce={!!reduce} /></Td>)}
                      <Td className="text-center"><Cell rate={h.total.winRate} n={h.total.present} delay={0.1 + ri * 0.025} reduce={!!reduce} strong onClick={() => actions.openIds(h.total.entryIds, h.label)} /></Td>
                    </tr>
                  ))}
                </tbody>
              </TableShell>
            </div>
          )}
        </Card>
        <div className="mt-6 max-w-3xl space-y-6">
          <Prompt q="Which criteria were present most often, and which had the highest win rate when present?"><AutoText label="Edge identification" value={notes.text["edge"] ?? ""} onChange={(v) => rn.setText("edge", v)} placeholder="Your edge-identification map…" suggest={mostPresent ? { text: `Most present: “${mostPresent.label}” (${mostPresent.present} trades).${topCrit ? ` Highest win rate when present: “${topCrit.label}” at ${fmtPct(topCrit.winRate)} (${topCrit.wins}/${topCrit.present}).` : ""}`, label: "Add from heatmap" } : null} /></Prompt>
          <Prompt q="Which combination of criteria produced your highest win rate? Describe it precisely.">
            {m.combos.length > 0 && <div className="mb-2.5 flex flex-wrap gap-1.5">{m.combos.map((c) => <Chip key={c.keys.join("+")} tone="good" className="py-1.5">{c.labels.join(" + ")} · {fmtPct(c.winRate)} <span className="font-normal opacity-70">({c.wins}/{c.trades})</span></Chip>)}</div>}
            <AutoText label="Best combination" value={notes.text["combo"] ?? ""} onChange={(v) => rn.setText("combo", v)} placeholder={m.combos.length ? "Describe the combination and why it works." : "Needs 3+ trades that share the same criteria."} suggest={combo ? { text: `Best combination: ${combo.labels.join(" + ")} — ${fmtPct(combo.winRate)} win rate over ${combo.trades} trades (${signed(combo.net)}).`, label: "Add best combo" } : null} /></Prompt>
          <Prompt q="Were there setups you took with only 2 criteria confirmed? What was the outcome? Should the minimum threshold change?">
            {m.thresholds.length > 0 && (
              <div className="mb-2.5 overflow-hidden rounded-[16px] border border-line-soft bg-surface"><TableShell min={420}><thead><tr><Th className="pl-4 pt-3">Criteria confirmed</Th><Th className="pt-3 text-right">Trades</Th><Th className="pt-3 text-right">Win rate</Th><Th className="pr-4 pt-3 text-right">Net</Th></tr></thead>
                <tbody>{m.thresholds.map((r, i) => { const end = i === m.thresholds.length - 1; return <tr key={r.met}><Td rule={!end} className="pl-4 font-medium">{r.met}</Td><Td rule={!end} className="num text-right">{r.trades}</Td><Td rule={!end} className="text-right"><span className={cn("num inline-block min-w-14 rounded-full px-2.5 py-1 text-center text-[12.5px] font-semibold", heat(r.winRate, r.trades))}>{fmtPct(r.winRate)}</span></Td><Td rule={!end} className={cn("num pr-4 text-right font-semibold", tone(r.net))}>{signed(r.net)}</Td></tr>; })}</tbody></TableShell></div>
            )}
            <AutoText label="Minimum threshold" value={notes.text["threshold"] ?? ""} onChange={(v) => rn.setText("threshold", v)} placeholder="Should the minimum number of criteria change?" suggest={low.length ? { text: `Trades with 2 or fewer criteria: ${low.reduce((s, r) => s + r.trades, 0)}, netting ${signed(low.reduce((s, r) => s + r.net, 0))}.`, label: "Add low-criteria result" } : null} /></Prompt>
        </div>
      </Section>

      {/* B.5 — Patterns */}
      <Section id="b5" code="B.5" icon="heart" title="Psychological patterns" hint="Frequency and cost come from your trade reviews. Write the root cause and the fix next to each pattern.">
        <Card pad={false} className="overflow-hidden">
          <div className="px-3 pb-1 pt-4">
            <TableShell min={700}>
              <thead><tr><Th className="pl-4">Pattern</Th><Th className="text-right">Frequency</Th><Th className="text-right">Impact (lost)</Th><Th className="min-w-[260px] pl-5">Root cause / remediation plan</Th></tr></thead>
              <tbody>
                {[...m.patterns.rows.filter((r) => PSYCH_PATTERNS.some((x) => x.key === r.key) || r.total > 0), m.patterns.correct].map((r) => (
                  <tr key={r.key} className="transition-colors hover:bg-ink/[0.025]">
                    <Td className="pl-4 font-medium">{r.label}{r.manual && <span className="ml-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-medium text-faint">Self-reported</span>}</Td>
                    <Td className="text-right">{r.manual ? <span className="num font-semibold text-ink">{r.total}</span> : <EvidenceButton count={r.total} label={`Open ${r.total} trades: ${r.label}`} onClick={() => actions.openIds(r.entryIds, r.label)} />}</Td>
                    <Td className={cn("num text-right font-semibold", r.lost ? "text-loss" : "text-faint")}>{r.key === "correct" || r.manual ? "—" : r.lost ? signed(-r.lost) : "—"}</Td>
                    <Td className="pl-4">{r.key === "correct" ? <span className="px-2.5 text-[13.5px] text-muted">Replicate this.</span> : <input aria-label={`Plan for ${r.label}`} value={notes.mistakePlans[r.key] ?? ""} onChange={(e) => rn.setPlan(r.key, e.target.value)} placeholder={r.total ? "Root cause and what changes" : "Not seen — nothing to fix"} maxLength={400} className="w-full rounded-[9px] bg-transparent px-2.5 py-1.5 text-[14px] text-ink outline-none transition-[background-color,box-shadow] placeholder:text-faint hover:bg-ink/[0.04] focus:bg-raised focus:ring-2 focus:ring-gold-strong/45" />}</Td>
                  </tr>
                ))}
              </tbody>
            </TableShell>
          </div>
          <p className="border-t border-line-soft px-5 py-3.5 text-[13px] leading-snug text-muted">Frequency opens the exact trades in your Journal. Tick “skipped valid setup” and “bias lock” per day in the Weekly reviews.</p>
        </Card>
      </Section>

      {/* B.6 — Reflection */}
      <Section id="b6" code="B.6" icon="bulb" title="Reflection">
        <div className="grid gap-x-8 gap-y-7 lg:grid-cols-2">
          <Prompt q="What is the single biggest reason you won this month? Be specific — not “I was disciplined.”"><AutoText label="Biggest reason I won" value={notes.text["won"] ?? ""} onChange={(v) => rn.setText("won", v)} placeholder="One concrete reason." suggest={topCrit ? { text: `Strongest driver in the data: “${topCrit.label}” — ${fmtPct(topCrit.winRate)} win rate when confirmed (${topCrit.wins}/${topCrit.present}).`, label: "Add data point" } : null} /></Prompt>
          <Prompt q="What is the single biggest reason you lost money or underperformed? Be brutally honest."><AutoText label="Biggest reason I lost" value={notes.text["lost"] ?? ""} onChange={(v) => rn.setText("lost", v)} placeholder="The real reason." suggest={costly ? { text: `Costliest recorded mistake: ${costly.label} — ${signed(-costly.lost)} across ${costly.count} ${costly.count === 1 ? "trade" : "trades"}.`, label: "Add costliest mistake" } : null} /></Prompt>
          <Prompt q="How did your narrative reading evolve over the month? Are you consistently identifying the correct weekly profile by Monday?"><AutoText label="Narrative evolution" value={notes.text["narrative"] ?? ""} onChange={(v) => rn.setText("narrative", v)} placeholder="How has your read of the week improved or slipped?" /></Prompt>
          <Prompt q="Is your A+ setup still valid as defined? Should any criterion change based on this month's evidence?"><AutoText label="Setup validity" value={notes.text["valid"] ?? ""} onChange={(v) => rn.setText("valid", v)} placeholder="Keep, tighten or drop a criterion — and why." /></Prompt>
          <Prompt q="Describe the ONE session that was your best of the month. What made it perfect, and how do you replicate it?"><AutoText label="Best session" value={notes.text["best"] ?? ""} onChange={(v) => rn.setText("best", v)} placeholder="Why was it perfect?" suggest={bestDay ? { text: dayText(bestDay, "Best session"), label: "Add best session" } : null} /></Prompt>
          <Prompt q="Describe the ONE session that was your worst. What exactly broke down, and what would you do differently?"><AutoText label="Worst session" value={notes.text["worst"] ?? ""} onChange={(v) => rn.setText("worst", v)} placeholder="Where did it break?" suggest={worstDay && worstDay !== bestDay ? { text: dayText(worstDay, "Worst session"), label: "Add worst session" } : null} /></Prompt>
        </div>
      </Section>

      {/* B.7 — Prop firm */}
      <Section id="b7" code="B.7" icon="shield" title="Prop-firm checkpoint" hint={ctx.challenge ? `Measured against “${ctx.challenge.name}”.` : "Measured against the targets in Settings. Pick a challenge in the Trading Lab to use its rules."} aside={<Chip tone={p.status === "pass" ? "good" : p.status === "fail" ? "bad" : "gold"}>{{ pass: "Passed", fail: "Failed", "in-progress": "In progress", none: "No target set" }[p.status]}</Chip>}>
        <Card pad={false} className="overflow-hidden">
          <div className="grid lg:grid-cols-2 lg:divide-x lg:divide-line-soft">
            <div className="p-5 sm:p-6"><Meter label="Profit target" target={p.target} actual={p.achieved} fmt={money} good={p.target != null && p.achieved >= p.target} suffix={p.target != null ? `${Math.max(0, Math.round((p.achieved / p.target) * 100))}% of target` : "Set a target in Settings or a challenge"} reduce={!!reduce} /></div>
            <div className="border-t border-line-soft p-5 sm:p-6 lg:border-t-0"><Meter label="Max drawdown used" target={p.maxDrawdown} actual={p.drawdownUsed} fmt={money} good={!p.drawdownBreached} invert suffix={p.maxDrawdown != null && p.drawdownUsed != null ? `${Math.round((p.drawdownUsed / p.maxDrawdown) * 100)}% of the allowance${p.drawdownBreached ? " — breached" : ""}` : "No max drawdown set"} reduce={!!reduce} /></div>
          </div>
          <div className="flex items-center justify-between gap-4 border-t border-line-soft px-5 py-4 sm:px-6">
            <div className="min-w-0"><p className="text-[14.5px] font-medium text-ink">Daily loss limit breached</p><p className="text-[12.5px] text-muted">{p.dailyLossLimit != null ? `Limit ${money(p.dailyLossLimit)} per day · target 0 times` : "No daily loss limit set"}</p></div>
            <span className={cn("num text-[26px] font-semibold tracking-[-0.03em]", p.dailyLossBreaches == null ? "text-faint" : p.dailyLossBreaches === 0 ? "text-profit" : "text-loss")}>{p.dailyLossBreaches == null ? "—" : `${p.dailyLossBreaches}×`}</span>
          </div>
        </Card>
      </Section>

      {/* B.8 — Decisions */}
      <Section id="b8" code="B.8" icon="check" title="Month-end decisions" hint="Answered by your numbers, with what each answer means.">
        <div className="grid items-start gap-4 md:grid-cols-2">
          {m.decisions.map((d, i) => <Decision key={d.id} d={d} index={i} />)}
        </div>
      </Section>

      {/* B.9 — Lessons & commitments */}
      <Section id="b9" code="B.9" icon="target" title="Lessons and commitments" hint="Commitments return at the top of next month's review.">
        <div className="grid gap-x-8 gap-y-7 md:grid-cols-2">
          <div><p className="mb-3 flex items-center gap-2 px-0.5 text-[15px] font-medium text-ink"><Sym name="bulb" className="h-[17px] w-[17px] text-gold" />Top 3 lessons</p>
            <div className="space-y-2.5">{[0, 1, 2].map((i) => <LineInput key={i} index={i + 1} label={`Lesson ${i + 1}`} value={notes.lists["lessons"]?.[i] ?? ""} onChange={(v) => rn.setListItem("lessons", i, v)} placeholder="What this month taught me…" />)}</div></div>
          <div><p className="mb-3 flex items-center gap-2 px-0.5 text-[15px] font-medium text-ink"><Sym name="flag" className="h-[17px] w-[17px] text-gold" />Top 3 commitments for next month</p>
            <div className="space-y-2.5">{[0, 1, 2].map((i) => <LineInput key={i} index={i + 1} label={`Commitment ${i + 1}`} value={notes.lists["commitments"]?.[i] ?? ""} onChange={(v) => rn.setListItem("commitments", i, v)} placeholder="A specific, measurable promise…" />)}</div></div>
        </div>
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

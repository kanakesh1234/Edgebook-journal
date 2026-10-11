"use client";

import { useMemo } from "react";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { addDays, formatDateMedium, weekdayShort } from "@/lib/format";
import { Sym } from "@/components/journal/symbols";
import { SPRING } from "@/components/journal/journal-ui";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { buildWeek, type DayRow, type ReviewContext } from "@/lib/review/metrics";
import { isoWeek, weekLabel } from "@/lib/review/period";
import { PSYCH_PATTERNS } from "@/lib/review/mistakes";
import { cn } from "@/lib/utils";
import { AnimatedNumber, AutoText, CarriedCommitments, Card, Chip, DirTag, DrawCheck, EvidenceButton, fmtPct, fmtR, GradeBadge, GradePicker, Kpi, LineInput, Prompt, SaveIndicator, Section, StatStrip, StripCell, TableShell, Td, Th, tone, useMoney } from "./review-ui";
import { DayBars, OutcomeBar, WinRateRing, heat } from "./review-charts";
import { useReviewNotes } from "./use-review-notes";
import type { ReviewActions } from "./reviews-panel";

const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri"];

const STATE_CHIP: Record<DayRow["state"], { label: string; t: "good" | "neutral" | "gold" | "info" | "bad" }> = {
  traded: { label: "Setup · traded", t: "good" }, "no-setup": { label: "No setup", t: "info" }, pass: { label: "Pass", t: "gold" },
  unlogged: { label: "Not logged", t: "bad" }, holiday: { label: "Holiday", t: "neutral" }, weekend: { label: "Weekend", t: "neutral" }, upcoming: { label: "Upcoming", t: "neutral" },
};

export function WeeklyReview({ ctx, monday, actions }: { ctx: ReviewContext; monday: string; actions: ReviewActions }) {
  const { money, signed } = useMoney();
  const rn = useReviewNotes("weekly", monday);
  const { notes } = rn;
  const week = useMemo(() => buildWeek(ctx, monday, notes.dayMarks), [ctx, monday, notes.dayMarks]);
  const prevMonday = addDays(monday, -7);
  const prevCommit = useApp((s) => s.settings.reviews?.weekly?.[prevMonday]?.lists.commitments)?.filter((c) => c.trim()) ?? [];
  const t = week.totals;
  const traded = week.days.filter((d) => d.state === "traded");
  const best = [...traded].sort((a, b) => b.pnl - a.pnl)[0], worst = [...traded].sort((a, b) => a.pnl - b.pnl)[0];
  const mistakeNames = (d: DayRow) => [...new Set(d.trades.flatMap((e) => week.mistakes.filter((m) => m.entryIds.includes(e.id)).map((m) => m.label)))];
  const dayLine = (d: DayRow, kind: string) => `${kind}: ${weekdayShort(d.date)} ${formatDateMedium(d.date)} — ${signed(d.pnl)} over ${d.trades.length} ${d.trades.length === 1 ? "trade" : "trades"}${d.grade ? `, grade ${d.grade}` : ""}.${mistakeNames(d).length ? ` Recorded: ${mistakeNames(d).join(", ")}.` : ""}`;
  const heldDays = week.days.filter((d) => d.state === "no-setup" || d.state === "pass");

  const logNoSetup = async (date: string) => {
    try { await useApp.getState().logNoTradeDay(date); } catch { toast.error("Could not log the day"); }
  };
  const setPass = async (date: string, on: boolean) => {
    if (on) await logNoSetup(date);
    rn.setMark(date, { skippedValid: on });
  };

  if (week.isFuture) {
    return <EmptyState icon={<Sym name="calendar" className="h-6 w-6" />} title="This week hasn't started" body={`${weekLabel(monday)} is still ahead. Come back on Friday after the close — or step back to a finished week.`} />;
  }

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip>{week.balance != null ? <>End-of-week balance <b className="num font-semibold text-ink">{money(week.balance)}</b></> : "Balance unavailable"}</Chip>
          {week.isCurrent && <Chip tone="info"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-info" aria-hidden />In progress · review after Friday's close</Chip>}
        </div>
        <SaveIndicator state={rn.state} />
      </div>

      <CarriedCommitments title="Commitments carried from last week" items={prevCommit} done={notes.done} onToggle={(i, v) => rn.setDone(`prev:${i}`, v)} />

      {/* A.1 — Scorecard */}
      <Section id="a1" code="A.1" icon="gauge" title="Scorecard" hint="Calculated from this week's trades. Weekends and market holidays are never trading days.">
        <Card pad={false} className="overflow-hidden rounded-[26px]">
          <div className="grid lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
            <div className="p-5 sm:p-7">
              <p className="text-[14px] font-medium text-muted">Net P&amp;L</p>
              <p className={cn("num mt-1.5 text-[52px] font-semibold leading-none tracking-[-0.045em] sm:text-[64px]", tone(t.net))}>
                <AnimatedNumber value={t.net} format={signed} />
              </p>
              <p className="mt-2.5 text-[13px] text-faint">Weekly total</p>
              {traded.length > 0 && <div className="mt-7"><DayBars days={week.days} /></div>}
            </div>
            <div className="flex flex-col justify-center gap-7 border-t border-line-soft p-5 sm:p-7 lg:border-l lg:border-t-0">
              <div className="flex items-center gap-5">
                <WinRateRing value={t.winRate} />
                <div className="min-w-0">
                  <p className="text-[14px] font-medium text-muted">Win rate</p>
                  <p className="mt-0.5 text-[14px] text-ink">{t.trades ? <><span className="num font-semibold">{t.winners}</span> of <span className="num font-semibold">{t.trades}</span> trades</> : <span className="text-faint">No trades</span>}</p>
                </div>
              </div>
              <OutcomeBar winners={t.winners} losers={t.losers} breakevens={t.breakevens} />
            </div>
          </div>
          <StatStrip count={5} className="border-t border-line-soft">
            <StripCell label="Avg R:R" value={fmtR(t.avgRR)} valueClass={tone(t.avgRR)} sub={t.avgRR == null ? "None recorded" : "Per trade, where recorded"} />
            <StripCell label="Sessions traded" value={<>{week.sessions}<span className="text-[0.7em] font-medium text-faint"> / {week.tradingSlots}</span></>} sub={week.tradingSlots < 5 ? `${5 - week.tradingSlots} market holiday${5 - week.tradingSlots === 1 ? "" : "s"}` : "Trading days"} />
            <StripCell label="Worst day" value={week.maxDayLoss == null ? "—" : week.maxDayLoss === 0 ? money(0) : signed(week.maxDayLoss)} valueClass={week.maxDayLoss ? "text-loss" : undefined} sub="Largest single-day loss" />
            <StripCell label="No-setup days" value={week.noSetupDays} sub="Sat on hands" />
            <StripCell label="Process grade" value={week.avgGrade ?? "—"} sub={week.avgGrade ? "Average, A–D" : "Grade a day below"} />
          </StatStrip>
          {week.weekendEntries > 0 && (
            <p className="flex items-start gap-2.5 border-t border-line-soft bg-gold/[0.08] px-5 py-3 text-[13px] leading-snug text-gold-deep dark:text-gold sm:px-7"><Sym name="moon" className="mt-px h-4 w-4 shrink-0" />{week.weekendEntries} {week.weekendEntries === 1 ? "trade is" : "trades are"} dated on a weekend. {week.weekendEntries === 1 ? "It counts" : "They count"} in P&amp;L but not as a session — check the date if that's a mistake.</p>
          )}
        </Card>
      </Section>

      {/* A.2 — Daily log */}
      <Section id="a2" code="A.2" icon="list" title="Daily log" hint="Monday to Friday you trade. Saturday and Sunday are for review, practice and backtesting.">
        <Card pad={false} className="overflow-hidden">
          <div className="hidden px-3 pb-1 pt-4 md:block">
            <TableShell min={880}>
              <thead><tr><Th className="pl-4">Day</Th><Th>Setup triggered?</Th><Th>Criteria</Th><Th>Dir</Th><Th className="text-right">Entry</Th><Th className="text-right">SL</Th><Th className="text-right">Exit</Th><Th className="text-right">R:R</Th><Th className="text-right">P&amp;L</Th><Th className="pl-5">Grade</Th></tr></thead>
              <tbody>
                {week.days.slice(0, 5).map((d, i) => <DayRows key={d.date} d={d} name={DAY_NAMES[i]} rn={rn} actions={actions} onLog={logNoSetup} onPass={setPass} />)}
              </tbody>
            </TableShell>
          </div>
          <ul className="divide-y divide-line-soft/80 md:hidden">
            {week.days.slice(0, 5).map((d, i) => <DayCard key={d.date} d={d} name={DAY_NAMES[i]} rn={rn} actions={actions} onLog={logNoSetup} onPass={setPass} />)}
          </ul>
          <div className="flex items-center gap-3 border-t border-line-soft bg-ink/[0.025] px-5 py-3.5">
            <Sym name="moon" className="h-[17px] w-[17px] shrink-0 text-faint" />
            <p className="min-w-0 text-[13.5px] text-muted"><span className="font-medium text-ink">Weekend · {formatDateMedium(week.days[5].date)} – {formatDateMedium(week.days[6].date)}</span> <span className="hidden sm:inline">· Holidays, practice, backtesting and this review.</span>{week.weekendEntries > 0 ? ` ${week.weekendEntries} trade${week.weekendEntries === 1 ? "" : "s"} dated here.` : ""}</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-7 gap-y-1 border-t border-line-soft px-5 py-3.5 text-[14px]">
            <span className="font-semibold text-ink">Week total</span>
            <span className="text-muted">Avg R:R <b className={cn("num ml-1 font-semibold", tone(t.avgRR))}>{fmtR(t.avgRR)}</b></span>
            <span className="text-muted">Net P&amp;L <b className={cn("num ml-1 font-semibold", tone(t.net))}>{signed(t.net)}</b></span>
            {week.unloggedDays > 0 && <span className="font-medium text-loss">{week.unloggedDays} day{week.unloggedDays === 1 ? "" : "s"} not logged</span>}
          </div>
        </Card>
      </Section>

      {/* A.3 — Criteria */}
      <Section id="a3" code="A.3" icon="checklist" title="Setup criteria" hint="Which confirmations actually led to wins. Criteria are the pre-trade checklist items you confirmed on each trade.">
        <Card pad={false} className="overflow-hidden">
          {week.criteria.length === 0 ? (
            <p className="p-5 text-[14.5px] leading-relaxed text-muted sm:p-6">No criteria were recorded this week. Confirm the pre-trade checklist when you plan or log a trade and every criterion appears here with its win rate.</p>
          ) : (
            <>
              <div className="px-3 pb-1 pt-4">
                <TableShell min={660}>
                  <thead><tr><Th className="pl-4">Criterion</Th><Th className="text-right">Present</Th><Th className="text-right">Won</Th><Th className="text-right">Lost</Th><Th className="text-right">Win rate</Th><Th className="min-w-[200px] pl-5">Observations</Th></tr></thead>
                  <tbody>
                    {week.criteria.map((c) => (
                      <tr key={c.key} className="transition-colors hover:bg-ink/[0.025]">
                        <Td className="max-w-[260px] pl-4 font-medium">{c.label}</Td>
                        <Td className="num text-right"><EvidenceButton count={c.present} label={`Open ${c.present} trades with ${c.label}`} onClick={() => actions.openIds(c.entryIds, c.label)} /></Td>
                        <Td className="num text-right text-profit">{c.wins}</Td><Td className="num text-right text-loss">{c.losses}</Td>
                        <Td className="text-right"><span className={cn("num inline-block min-w-14 rounded-full px-2.5 py-1 text-center text-[12.5px] font-semibold", heat(c.winRate, c.present))}>{fmtPct(c.winRate)}</span></Td>
                        <Td className="pl-4"><input aria-label={`Notes on ${c.label}`} value={notes.text[`crit:${c.key}`] ?? ""} onChange={(e) => rn.setText(`crit:${c.key}`, e.target.value)} placeholder="Add a note" maxLength={300} className="w-full rounded-[9px] bg-transparent px-2.5 py-1.5 text-[14px] text-ink outline-none transition-[background-color,box-shadow] placeholder:text-faint hover:bg-ink/[0.04] focus:bg-raised focus:ring-2 focus:ring-gold-strong/45" /></Td>
                      </tr>
                    ))}
                  </tbody>
                </TableShell>
              </div>
              <div className="grid divide-y divide-line-soft border-t border-line-soft sm:grid-cols-2 sm:divide-x sm:divide-y-0">
                <div className="flex items-start gap-3 px-5 py-4"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-profit/15 text-profit"><Sym name="arrowUpRight" className="h-4 w-4" strokeWidth={2} /></span>
                  <Kpi label="Strongest criterion" value={<span className="text-[17px] leading-tight tracking-[-0.015em]">{week.strongest?.label ?? "—"}</span>} sub={week.strongest ? `${fmtPct(week.strongest.winRate)} when present (${week.strongest.wins}/${week.strongest.present})` : "Needs 2+ trades with a criterion"} /></div>
                <div className="flex items-start gap-3 px-5 py-4"><span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-loss/15 text-loss"><Sym name="arrowDownRight" className="h-4 w-4" strokeWidth={2} /></span>
                  <Kpi label="Least predictive criterion" value={<span className="text-[17px] leading-tight tracking-[-0.015em]">{week.weakest?.label ?? "—"}</span>} sub={week.weakest ? `${fmtPct(week.weakest.winRate)} when present (${week.weakest.wins}/${week.weakest.present})` : "Needs 2+ criteria with 2+ trades"} /></div>
              </div>
            </>
          )}
        </Card>
        <div className="mt-7 grid gap-x-8 gap-y-6 lg:grid-cols-2">
          <Prompt q="Was the weekly profile correctly identified on Monday? How did this affect your trades?"><AutoText label="Weekly profile" value={notes.text["profile"] ?? ""} onChange={(v) => rn.setText("profile", v)} placeholder="What did you expect from the week, and what did price do?" /></Prompt>
          <Prompt q="Which day had your best execution this week, and why?"><AutoText label="Best execution" value={notes.text["best-day"] ?? ""} onChange={(v) => rn.setText("best-day", v)} placeholder="What made it different?" suggest={best ? { text: dayLine(best, "Best day"), label: "Add best day" } : null} /></Prompt>
          <Prompt q="Which day had your worst execution, and what specific mistake was made?"><AutoText label="Worst execution" value={notes.text["worst-day"] ?? ""} onChange={(v) => rn.setText("worst-day", v)} placeholder="Name the exact mistake." suggest={worst && worst !== best ? { text: dayLine(worst, "Worst day"), label: "Add worst day" } : null} /></Prompt>
          <Prompt q="Was there a session where no setup formed and you correctly sat on your hands?"><AutoText label="Discipline" value={notes.text["held"] ?? ""} onChange={(v) => rn.setText("held", v)} placeholder="Describe your mental discipline in that session." suggest={heldDays.length ? { text: `Held ${heldDays.length} ${heldDays.length === 1 ? "day" : "days"} without a setup: ${heldDays.map((d) => weekdayShort(d.date)).join(", ")}.`, label: "Add held days" } : null} /></Prompt>
        </div>
      </Section>

      {/* A.4 — Patterns */}
      <Section id="a4" code="A.4" icon="heart" title="Psychological patterns" hint="Pulled from your trade reviews. Two patterns only you can see — tick them by day.">
        <Card pad={false} className="overflow-hidden">
          <div className="px-3 pb-1 pt-4">
            <TableShell min={580}>
              <thead><tr><Th className="pl-4">Pattern</Th>{DAY_NAMES.map((n) => <Th key={n} className="text-center">{n}</Th>)}<Th className="text-right">Total</Th></tr></thead>
              <tbody>
                {[...week.patterns.rows.filter((r) => PSYCH_PATTERNS.some((p) => p.key === r.key) || r.total > 0), week.patterns.correct].map((r) => {
                  const good = r.key === "correct";
                  return (
                    <tr key={r.key} className="transition-colors hover:bg-ink/[0.025]">
                      <Td className="pl-4 font-medium">{r.label}{r.manual && <span className="ml-2 rounded-full bg-ink/[0.06] px-2 py-0.5 text-[11px] font-medium text-faint">Self-reported</span>}</Td>
                      {week.days.slice(0, 5).map((d) => {
                        const n = r.perDay[d.date] ?? 0;
                        const blocked = d.state === "holiday" || d.state === "upcoming";
                        if (r.manual) {
                          const key = r.key === "skipped" ? "skippedValid" : "biasLock";
                          const on = !!notes.dayMarks[d.date]?.[key];
                          return (
                            <Td key={d.date} className="text-center">
                              <button type="button" role="checkbox" aria-checked={on} aria-label={`${r.label} on ${weekdayShort(d.date)}`} disabled={blocked} onClick={() => (r.key === "skipped" ? void setPass(d.date, !on) : rn.setMark(d.date, { biasLock: !on }))}
                                className={cn("mx-auto grid h-[26px] w-[26px] place-items-center rounded-[8px] border outline-none transition-[background-color,border-color,transform] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-90 disabled:opacity-30", on ? "border-loss bg-loss text-white" : "border-line-strong hover:border-faint hover:bg-ink/[0.04]")}>
                                {on && <DrawCheck className="h-3.5 w-3.5" />}
                              </button>
                            </Td>
                          );
                        }
                        return <Td key={d.date} className="text-center"><span className={cn("num inline-grid h-[26px] min-w-[26px] place-items-center rounded-[8px] px-1 text-[12.5px] font-semibold", n === 0 ? "text-faint" : good ? "bg-profit/15 text-profit" : "bg-loss/15 text-loss")}>{n || "·"}</span></Td>;
                      })}
                      <Td className="text-right">{r.manual ? <span className={cn("num font-semibold", r.total ? "text-loss" : "text-faint")}>{r.total}</span> : <EvidenceButton count={r.total} label={`Open ${r.total} trades: ${r.label}`} onClick={() => actions.openIds(r.entryIds, r.label)} />}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </TableShell>
          </div>
          <p className="border-t border-line-soft px-5 py-3.5 text-[13px] leading-snug text-muted">Counts come from the mistake type and process flags you recorded in each trade review. Overtrading also counts trades beyond your daily-trade limit.</p>
        </Card>
      </Section>

      {/* A.5 — Narrative */}
      <Section id="a5" code="A.5" icon="sparkles" title="Narrative" hint="What your numbers say, then what you say about them.">
        {week.insights.length > 0 && (
          <ul className="mb-6 divide-y divide-line-soft overflow-hidden rounded-[18px] border border-line-soft bg-surface shadow-panel">
            {week.insights.map((i, k) => (
              <motion.li key={i.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ ...SPRING, delay: 0.1 + k * 0.05 }} className="flex items-start gap-3.5 px-4 py-3.5 sm:px-5">
                <span className={cn("mt-px grid h-7 w-7 shrink-0 place-items-center rounded-full", i.tone === "good" ? "bg-profit/15 text-profit" : i.tone === "warn" ? "bg-loss/15 text-loss" : "bg-info/15 text-info")}><Sym name={i.tone === "warn" ? "shield" : i.tone === "good" ? "check" : "bulb"} className="h-4 w-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug text-ink">{i.text}</p>
                  {i.evidence && <button type="button" onClick={() => (i.evidence!.kind === "mistake" ? actions.openMistake(i.evidence!.key) : actions.openIds(i.evidence!.ids, "Evidence"))} className="group mt-1.5 inline-flex items-center gap-1 text-[13px] font-medium text-gold-deep outline-none hover:opacity-75 focus-visible:underline dark:text-gold">See the trades<Sym name="arrowUpRight" className="h-3 w-3 transition-transform duration-200 group-hover:-translate-y-px group-hover:translate-x-px" strokeWidth={2.2} /></button>}
                </div>
              </motion.li>
            ))}
          </ul>
        )}
        <AutoText label="Weekly narrative" minRows={6} value={notes.text["narrative"] ?? ""} onChange={(v) => rn.setText("narrative", v)} placeholder="Tell the story of the week: what price did, what you did, and what connects the two." />
      </Section>

      {/* A.6 — Refinements */}
      <Section id="a6" code="A.6" icon="bulb" title="Setup refinements">
        <div className="grid gap-x-8 gap-y-6 md:grid-cols-2">
          <Prompt q="What worked this week"><AutoText label="What worked" value={notes.text["worked"] ?? ""} onChange={(v) => rn.setText("worked", v)} placeholder="Keep doing…" /></Prompt>
          <Prompt q="What did not work"><AutoText label="What did not work" value={notes.text["not-worked"] ?? ""} onChange={(v) => rn.setText("not-worked", v)} placeholder="Stop or change…" /></Prompt>
        </div>
      </Section>

      {/* A.7 — Commitments */}
      <Section id="a7" code="A.7" icon="target" title="Commitments" hint="Three specific commitments you carry into next week. They come back at the top of your next review.">
        <div className="max-w-3xl space-y-2.5">
          {[0, 1, 2].map((i) => <LineInput key={i} index={i + 1} label={`Commitment ${i + 1}`} value={notes.lists["commitments"]?.[i] ?? ""} onChange={(v) => rn.setListItem("commitments", i, v)} placeholder={["Something measurable I will do…", "A rule I will not break…", "One thing I will review each morning…"][i]} />)}
        </div>
      </Section>
    </div>
  );
}

type RowProps = { d: DayRow; name: string; rn: ReturnType<typeof useReviewNotes>; actions: ReviewActions; onLog: (date: string) => void; onPass: (date: string, on: boolean) => void };

function SetupCell({ d, rn, onLog, onPass }: Pick<RowProps, "d" | "rn" | "onLog" | "onPass">) {
  const s = STATE_CHIP[d.state];
  const canMark = d.state === "unlogged" || d.state === "no-setup" || d.state === "pass";
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Chip tone={s.t}>{d.state === "holiday" ? d.holiday : s.label}</Chip>
      {canMark && (
        <span className="inline-flex flex-wrap gap-1">
          {d.state === "unlogged" && <MiniBtn onClick={() => onLog(d.date)}>No setup</MiniBtn>}
          {d.state === "unlogged" && <MiniBtn onClick={() => onPass(d.date, true)}>Passed a valid setup</MiniBtn>}
          {d.state === "pass" && <MiniBtn onClick={() => onPass(d.date, false)}>Undo pass</MiniBtn>}
          {(d.state === "no-setup" || d.state === "pass") && <MiniBtn danger onClick={() => { rn.setMark(d.date, { skippedValid: false }); void useApp.getState().removeNoTradeDay(d.date); }}>Clear</MiniBtn>}
        </span>
      )}
    </div>
  );
}
const MiniBtn = ({ children, onClick, danger }: { children: React.ReactNode; onClick: () => void; danger?: boolean }) => (
  <button type="button" onClick={onClick} className={cn("rounded-full px-2.5 py-1 text-[12px] font-medium outline-none transition-[background-color,transform] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95", danger ? "text-faint hover:bg-loss/10 hover:text-loss" : "text-gold-deep hover:bg-gold/[0.14] dark:text-gold")}>{children}</button>
);

const num = (n: number | null | undefined) => (n == null ? "—" : String(n));

const DayLabel = ({ name, date }: { name: string; date: string }) => (
  <span className="block leading-tight"><span className="block text-[14.5px] font-semibold text-ink">{name}</span><span className="num text-[12px] !font-normal text-faint">{date.slice(5).replace("-", "/")}</span></span>
);

function DayRows({ d, name, rn, actions, onLog, onPass }: RowProps) {
  const { signed } = useMoney();
  if (d.state !== "traded") return (
    <tr>
      <Td className="pl-4"><DayLabel name={name} date={d.date} /></Td>
      <Td colSpan={8}><SetupCell d={d} rn={rn} onLog={onLog} onPass={onPass} />{d.noSetupReason && <p className="mt-1 text-[12.5px] text-muted">{d.noSetupReason}</p>}</Td>
      <Td className="pl-5">{d.state === "no-setup" || d.state === "pass" ? <GradePicker value={d.grade} auto={false} compact onChange={(g) => rn.setMark(d.date, { grade: g ?? undefined })} /> : <span className="text-faint">—</span>}</Td>
    </tr>
  );
  return (
    <>
      {d.trades.map((e, i) => {
        const last = i === d.trades.length - 1;
        return (
          <tr key={e.id} tabIndex={0} aria-label={`Open ${name} trade ${i + 1}`} onClick={() => actions.openTrade(e.id)} onKeyDown={(ev) => { if (ev.target === ev.currentTarget && (ev.key === "Enter" || ev.key === " ")) { ev.preventDefault(); actions.openTrade(e.id); } }}
            className="group cursor-pointer outline-none transition-colors hover:bg-ink/[0.03] focus-visible:bg-ink/[0.045] focus-visible:shadow-[inset_0_0_0_2px_color-mix(in_srgb,var(--gold-strong)_45%,transparent)]">
            <Td rule={last} className="pl-4">{i === 0 ? <DayLabel name={name} date={d.date} /> : null}</Td>
            <Td rule={last}>{i === 0 ? <SetupCell d={d} rn={rn} onLog={onLog} onPass={onPass} /> : <span className="text-[12.5px] text-faint">Trade {i + 1}</span>}</Td>
            <Td rule={last} className="num">{i === 0 && d.criteria ? <span className={cn("font-semibold", d.criteria.met === d.criteria.total ? "text-profit" : "text-ink")}>{d.criteria.met}/{d.criteria.total}</span> : <span className="text-faint">{i === 0 ? "—" : ""}</span>}</Td>
            <Td rule={last}><DirTag dir={e.direction ?? null} /></Td>
            <Td rule={last} className="num text-right !font-normal">{num(e.entryPrice)}</Td><Td rule={last} className="num text-right !font-normal text-muted">{num(e.stopLoss)}</Td><Td rule={last} className="num text-right !font-normal">{num(e.exitPrice)}</Td>
            <Td rule={last} className={cn("num text-right", tone(e.rr))}>{e.rr == null ? "—" : fmtR(e.rr)}</Td>
            <Td rule={last} className={cn("num text-right text-[15px] font-semibold", tone(e.pnl))}>{signed(e.pnl)}</Td>
            <Td rule={last} className="pl-5">{i === 0 ? <span onClick={(ev) => ev.stopPropagation()}><GradePicker value={d.grade} auto={!d.gradeIsManual && !!d.grade} compact onChange={(g) => rn.setMark(d.date, { grade: g ?? undefined })} /></span> : null}</Td>
          </tr>
        );
      })}
    </>
  );
}

function DayCard({ d, name, rn, actions, onLog, onPass }: RowProps) {
  const { signed } = useMoney();
  return (
    <li className="px-4 py-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0"><DayLabel name={name} date={d.date} /><div className="mt-2"><SetupCell d={d} rn={rn} onLog={onLog} onPass={onPass} /></div></div>
        <div className="text-right">{d.state === "traded" && <p className={cn("num text-[19px] font-semibold tracking-[-0.02em]", tone(d.pnl))}>{signed(d.pnl)}</p>}{d.criteria && <p className="num text-[12px] !font-normal text-muted">{d.criteria.met}/{d.criteria.total} criteria</p>}</div>
      </div>
      {d.trades.map((e) => (
        <button key={e.id} type="button" onClick={() => actions.openTrade(e.id)} className="mt-2.5 flex w-full items-center justify-between gap-2 rounded-[12px] bg-ink/[0.04] px-3 py-2.5 text-left text-[13.5px] outline-none transition-[background-color,transform] active:scale-[0.99] active:bg-ink/[0.08] focus-visible:ring-2 focus-visible:ring-gold-strong/50">
          <span className="flex items-center gap-2"><DirTag dir={e.direction ?? null} /><span className="num whitespace-nowrap !font-normal text-muted">{num(e.entryPrice)} → {num(e.exitPrice)}</span></span>
          <span className={cn("num font-semibold", tone(e.pnl))}>{e.rr != null && <span className="mr-2 font-medium text-muted">{fmtR(e.rr)}</span>}{signed(e.pnl)}</span>
        </button>
      ))}
      {(d.state === "traded" || d.state === "no-setup" || d.state === "pass") && <div className="mt-3 flex items-center justify-between"><span className="text-[13px] text-muted">Process grade</span><GradePicker value={d.grade} auto={!d.gradeIsManual && !!d.grade && d.state === "traded"} onChange={(g) => rn.setMark(d.date, { grade: g ?? undefined })} /></div>}
      {d.state === "traded" && !d.grade && <span className="sr-only"><GradeBadge grade={d.grade} /></span>}
    </li>
  );
}

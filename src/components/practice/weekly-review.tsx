"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { formatDateMedium, formatMoney, formatSignedMoney, todayKey } from "@/lib/format";
import { buildWeek, recurringMistakes, shiftWeek, thisWeekStart, weekEndOf, weekTrend } from "@/lib/weekly";
import { RISK_COPY } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { PrimaryButton, QuietButton, Reveal, TextBlock, Label } from "@/components/journal/flow-ui";
import { Sym } from "@/components/journal/symbols";
import { Bar, Eyebrow, StatTile, surface } from "./ui";
import { DailyChart, TrendChart } from "./weekly-charts";
import "./practice.css";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-ink");
const INSIGHT = { good: ["bg-profit", "check"], warn: ["bg-loss", "arrowDownRight"], info: ["bg-gold-strong", "note"] } as const;

function Card({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(surface.editorial, "p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3"><Eyebrow>{title}</Eyebrow>{aside}</div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export function WeeklyReview() {
  const entries = useApp((s) => s.entries);
  const plans = useApp((s) => s.plans);
  const settings = useApp((s) => s.settings);
  const cur = settings.currency;
  const money = (n: number) => formatSignedMoney(n, cur, { compact: true });

  const [start, setStart] = useState(thisWeekStart);
  const week = useMemo(() => buildWeek(entries, plans, start, settings.dayLimits), [entries, plans, start, settings.dayLimits]);
  const trend = useMemo(() => weekTrend(entries, thisWeekStart(), 8), [entries]);
  const recurring = useMemo(() => recurringMistakes(entries, start), [entries, start]);
  const atNow = start >= thisWeekStart();
  const maxMistake = Math.max(1, ...week.mistakes.map((m) => m.count));
  const maxFeel = Math.max(1, ...week.feelings.map((f) => Math.abs(f.net)));

  // The week in words — saved per week, revealed one question at a time like the rest of the app.
  const saved = settings.weeklyReviews?.[start];
  const [wentWell, setWentWell] = useState("");
  const [focus, setFocus] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setWentWell(saved?.wentWell ?? ""); setFocus(saved?.focus ?? ""); setSavedAt(saved?.updatedAt ?? null); }, [start]); // eslint-disable-line react-hooks/exhaustive-deps
  const dirty = wentWell.trim() !== (saved?.wentWell ?? "") || focus.trim() !== (saved?.focus ?? "");
  const save = async () => {
    setBusy(true);
    const note = { wentWell: wentWell.trim() || undefined, focus: focus.trim() || undefined, updatedAt: Date.now() };
    try { await useApp.getState().updateSettings({ weeklyReviews: { ...(settings.weeklyReviews ?? {}), [start]: note } }); setSavedAt(note.updatedAt); } finally { setBusy(false); }
  };
  const lastFocus = settings.weeklyReviews?.[shiftWeek(start, -1)]?.focus;

  const range = `${formatDateMedium(start)} – ${formatDateMedium(weekEndOf(start))}`;
  const empty = week.count === 0;

  return (
    <div className="mx-auto w-full max-w-[1080px] pb-28 sm:pb-16">
      <Link href="/practice" className="pr-rise inline-flex items-center gap-1 text-[14px] font-medium text-muted transition-colors hover:text-ink"><Sym name="chevronLeft" className="h-4 w-4" />Practice</Link>
      <header className="pr-rise mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[34px] font-semibold leading-none tracking-[-0.04em] text-ink sm:text-[44px]">Weekly review</h1>
          <p className="mt-3 text-[16px] text-muted">{week.isCurrent ? "This week" : "Week of"} · {range}</p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Choose week">
          <button type="button" aria-label="Previous week" onClick={() => setStart(shiftWeek(start, -1))} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-raised text-ink transition-all hover:border-line-strong active:scale-90"><Sym name="chevronLeft" className="h-4 w-4" /></button>
          <button type="button" aria-label="Next week" disabled={atNow} onClick={() => setStart(shiftWeek(start, 1))} className="grid h-10 w-10 place-items-center rounded-full border border-line bg-raised text-ink transition-all hover:border-line-strong active:scale-90 disabled:opacity-35"><Sym name="chevronRight" className="h-4 w-4" /></button>
          {!week.isCurrent && <QuietButton onClick={() => setStart(thisWeekStart())}>This week</QuietButton>}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={start} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}>
          <div className="mt-8 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatTile label="Net P&L" value={money(week.net)} tone={week.net > 0 ? "profit" : week.net < 0 ? "loss" : undefined} note={`${week.count} ${week.count === 1 ? "trade" : "trades"}`} />
            <StatTile label="Win rate" value={pct(week.winRate)} note={week.count ? `${week.wins}W · ${week.losses}L` : undefined} />
            <StatTile label="Avg R" value={week.avgR == null ? "—" : `${week.avgR > 0 ? "+" : ""}${week.avgR}R`} note={week.profitFactor ? `Profit factor ${week.profitFactor}` : undefined} />
            <StatTile label="Plan followed" value={pct(week.plan.adherence)} tone={week.plan.adherence == null ? undefined : week.plan.adherence >= 0.8 ? "profit" : week.plan.adherence < 0.5 ? "loss" : undefined} note={week.plan.followed + week.plan.broke ? `${week.plan.followed} of ${week.plan.followed + week.plan.broke} reviewed` : "No reviews yet"} />
            <StatTile label="Limit held" value={week.risk.daysWithLimit ? `${week.risk.held}/${week.risk.daysWithLimit}` : "—"} tone={week.risk.daysWithLimit ? (week.risk.breached ? "loss" : "profit") : undefined} note={week.risk.daysWithLimit ? "days within your limit" : "No limit set"} />
            <StatTile label="Mistakes" value={week.mistakes.reduce((s, m) => s + m.count, 0)} tone={week.mistakes.length ? "loss" : undefined} note={week.mistakes[0]?.label ?? "None recorded"} />
          </div>

          {empty ? (
            <p className={cn(surface.editorial, "mt-6 px-6 py-10 text-center text-[15px] text-muted")}>{week.insights[0]?.text} Log a trade in Plan &amp; Record and it appears here.</p>
          ) : (
            <>
              <Card title="What the data says" className="mt-6">
                <ul className="space-y-3">
                  {week.insights.map((i, k) => (
                    <li key={k} className="flex items-start gap-3">
                      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[8px] text-white", INSIGHT[i.tone][0])}><Sym name={INSIGHT[i.tone][1]} className="h-3.5 w-3.5" strokeWidth={2.2} /></span>
                      <p className="text-[15px] leading-snug text-ink">{i.text}</p>
                    </li>
                  ))}
                </ul>
              </Card>

              <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
                <Card title="Daily P&L" aside={<span className="flex items-center gap-1.5 text-[12px] text-faint"><span aria-hidden className="inline-block h-0 w-4 border-t-2 border-dashed border-gold-strong" />daily limit</span>}>
                  <DailyChart days={week.days} format={money} />
                </Card>
                <Card title="Risk discipline">
                  <ul className="space-y-3.5">
                    {week.days.filter((d) => d.trades.length > 0).map((d) => (
                      <li key={d.date}>
                        <div className="flex items-baseline justify-between text-[13.5px]">
                          <span className="font-medium text-ink">{formatDateMedium(d.date)}</span>
                          <span className={cn("num", d.risk ? (d.risk.status === "over" || d.risk.status === "hit" ? "text-loss" : d.risk.status === "near" ? "text-gold" : "text-profit") : "text-faint")}>
                            {d.risk ? `${formatMoney(d.risk.used, cur)} of ${formatMoney(d.risk.limit, cur)}` : "No limit set"}
                          </span>
                        </div>
                        <Bar className="mt-1.5" value={d.risk ? Math.min(100, d.risk.ratio * 100) : 0} accent={d.risk && d.risk.ratio >= 1 ? "var(--loss)" : d.risk && d.risk.ratio >= 0.75 ? "var(--gold-strong)" : "var(--profit)"} />
                        <p className="mt-1 text-[12px] text-faint">{d.risk ? `${RISK_COPY[d.risk.status]} · day ${money(d.net)}` : `Day ${money(d.net)}`}</p>
                      </li>
                    ))}
                  </ul>
                </Card>
              </div>

              <div className="mt-5 grid gap-5 lg:grid-cols-2">
                <Card title="Mistakes this week" aside={<Link href="/journal" className="text-[12.5px] font-semibold text-gold hover:underline">Open Journal</Link>}>
                  {week.mistakes.length === 0 ? <p className="text-[14.5px] text-muted">No mistakes were recorded in this week&apos;s reviews.</p> : (
                    <ul className="space-y-4">
                      {week.mistakes.map((m) => (
                        <li key={m.key}>
                          <div className="flex items-center justify-between gap-3 text-[14px]">
                            <Link href={`/journal?mistake=${m.key}`} className="flex min-w-0 items-center gap-2 font-medium text-ink hover:underline">
                              <span className="truncate">{m.label}</span>
                              {m.recurring && <span title={`Seen in ${m.weeksSeen} of the last 5 weeks`} className="shrink-0 rounded-full bg-loss/[0.1] px-2 py-px text-[11px] font-semibold text-loss">Recurring · {m.weeksSeen}/5 wks</span>}
                            </Link>
                            <span className="num shrink-0 text-muted">{m.count}× {m.cost > 0 && <span className="text-loss">{money(-m.cost)}</span>}</span>
                          </div>
                          <Bar className="mt-1.5" value={(m.count / maxMistake) * 100} accent="var(--loss)" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {recurring.filter((r) => !week.mistakes.some((m) => m.key === r.key)).length > 0 && (
                    <p className="mt-5 border-t border-line-soft pt-4 text-[13px] leading-snug text-muted">
                      Also recurring in recent weeks, not this one: {recurring.filter((r) => !week.mistakes.some((m) => m.key === r.key)).map((r) => r.label).join(", ")}.
                    </p>
                  )}
                </Card>

                <Card title="Process vs result">
                  <div className="grid grid-cols-2 gap-3">
                    {([["Followed plan", week.plan.followed, week.plan.netFollowed, "text-profit"], ["Broke plan", week.plan.broke, week.plan.netBroke, "text-loss"]] as const).map(([label, n, net, c]) => (
                      <div key={label} className="rounded-2xl border border-line bg-raised px-4 py-3.5">
                        <p className="text-[12.5px] text-muted">{label}</p>
                        <p className={cn("kpi mt-1 text-[26px] tabular-nums", n ? c : "text-faint")}>{n}</p>
                        <p className={cn("num mt-0.5 text-[13px]", n ? tone(net) : "text-faint")}>{n ? `${money(net)} net` : "—"}</p>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[13px] leading-snug text-muted">
                    {week.plan.unknown > 0 ? `${week.plan.unknown} ${week.plan.unknown === 1 ? "trade has" : "trades have"} no plan answer yet. ` : ""}
                    {week.best && week.worst ? `Best trade ${money(week.best.pnl)}, worst ${money(week.worst.pnl)}.` : ""}
                  </p>

                  <p className="mt-6 text-[12px] font-semibold uppercase tracking-[.16em] text-faint">How it felt</p>
                  {week.feelings.length === 0 ? <p className="mt-3 text-[14px] text-muted">No feelings recorded yet.</p> : (
                    <ul className="mt-3 space-y-2.5">
                      {week.feelings.map((f) => (
                        <li key={f.key} className="flex items-center gap-3 text-[14px]">
                          <span className="w-32 shrink-0 truncate text-ink">{f.label}</span>
                          <Bar className="flex-1" value={(Math.abs(f.net) / maxFeel) * 100} accent={f.net >= 0 ? "var(--profit)" : "var(--loss)"} />
                          <span className={cn("num w-24 shrink-0 text-right text-[13px]", tone(f.net))}>{f.count}× · {money(f.net)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </Card>
              </div>
            </>
          )}

          <Card title="Last 8 weeks" aside={<span className="text-[12px] text-faint">% = plan followed</span>} className="mt-5">
            <TrendChart points={trend} selected={start} onPick={setStart} format={money} />
          </Card>

          <Card title="Your week in words" className="mt-5">
            {lastFocus && <p className="mb-4 rounded-2xl bg-gold/[0.08] px-4 py-3 text-[14px] text-ink"><span className="text-muted">Last week you chose to focus on: </span>{lastFocus}</p>}
            <div>
              <Label done={wentWell.trim().length > 0} htmlFor="wk-well">What worked this week?</Label>
              <TextBlock id="wk-well" maxLength={400} value={wentWell} onChange={(e) => setWentWell(e.target.value)} placeholder="A sentence or two is plenty." className="mt-2.5" />
            </div>
            {(wentWell.trim().length > 0 || focus.trim().length > 0) && (
              <Reveal focus>
                <Label done={focus.trim().length > 0} htmlFor="wk-focus">One thing to focus on next week</Label>
                <TextBlock id="wk-focus" maxLength={280} value={focus} onChange={(e) => setFocus(e.target.value)} placeholder={week.mistakes[0] ? `e.g. No ${week.mistakes[0].label.toLowerCase()} — ` : "One concrete behaviour."} className="mt-2.5" />
              </Reveal>
            )}
            <div className="mt-5 flex items-center justify-between gap-4">
              <p className="text-[13px] text-faint">{savedAt && !dirty ? "Saved" : ""}</p>
              <PrimaryButton disabled={!dirty || (!wentWell.trim() && !focus.trim())} loading={busy} onClick={save}>Save review</PrimaryButton>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { formatDateMedium, formatMoney, formatSignedMoney } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { buildWeek, recurringMistakes, shiftWeek, thisWeekStart, weekEndOf } from "@/lib/weekly";
import { RISK_COPY } from "@/lib/risk";
import { cn } from "@/lib/utils";
import { FLOW_SMOOTH, Label, PrimaryButton, QuietButton, Reveal, TextBlock } from "@/components/journal/flow-ui";
import { Sym } from "@/components/journal/symbols";
import { Eyebrow, StatTile, surface } from "./ui";
import "./practice.css";

const pct = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-ink");
const INSIGHT = { good: ["bg-profit", "check"], warn: ["bg-loss", "arrowDownRight"], info: ["bg-gold-strong", "note"] } as const;

function Card({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn(surface.editorial, "p-5 sm:p-6", className)}>
      <div className="flex items-center justify-between gap-3">
        <Eyebrow>{title}</Eyebrow>
        {aside}
      </div>
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
  const recurring = useMemo(() => recurringMistakes(entries, start), [entries, start]);
  const atNow = start >= thisWeekStart();

  // The week in words — saved per week, revealed one question at a time with smooth delayed transitions.
  const saved = settings.weeklyReviews?.[start];
  const [wentWell, setWentWell] = useState("");
  const [focus, setFocus] = useState("");
  const [q2Ready, setQ2Ready] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const w = saved?.wentWell ?? "";
    const f = saved?.focus ?? "";
    setWentWell(w);
    setFocus(f);
    setQ2Ready(false);
    setSavedAt(saved?.updatedAt ?? null);
  }, [start]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (wentWell.trim().length === 0 && focus.trim().length === 0) {
      setQ2Ready(false);
      return;
    }
    if (wentWell.trim().length < 5 && focus.trim().length === 0) return;
    const t = window.setTimeout(() => setQ2Ready(true), 800);
    return () => window.clearTimeout(t);
  }, [wentWell, focus]);

  const dirty = wentWell.trim() !== (saved?.wentWell ?? "") || focus.trim() !== (saved?.focus ?? "");
  const save = async () => {
    setBusy(true);
    const note = { wentWell: wentWell.trim() || undefined, focus: focus.trim() || undefined, updatedAt: Date.now() };
    try {
      await useApp.getState().updateSettings({ weeklyReviews: { ...(settings.weeklyReviews ?? {}), [start]: note } });
      setSavedAt(note.updatedAt);
      haptic.success();
    } finally {
      setBusy(false);
    }
  };
  const lastFocus = settings.weeklyReviews?.[shiftWeek(start, -1)]?.focus;

  const range = `${formatDateMedium(start)} – ${formatDateMedium(weekEndOf(start))}`;
  const empty = week.count === 0;

  return (
    <div className="mx-auto w-full max-w-[960px] pb-28 sm:pb-16">
      <Link href="/practice" className="pr-rise inline-flex items-center gap-1 text-[14px] font-medium text-muted transition-colors hover:text-ink">
        <Sym name="chevronLeft" className="h-4 w-4" />
        Practice
      </Link>
      <header className="pr-rise mt-3 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[32px] font-semibold leading-none tracking-[-0.035em] text-ink sm:text-[40px]">Weekly review</h1>
          <p className="mt-2.5 text-[15px] text-muted">
            {week.isCurrent ? "This week" : "Week of"} · {range}
          </p>
        </div>
        <div className="flex items-center gap-1.5" role="group" aria-label="Choose week">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => {
              haptic.selection();
              setStart(shiftWeek(start, -1));
            }}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-raised text-ink transition-all hover:border-line-strong active:scale-90"
          >
            <Sym name="chevronLeft" className="h-4 w-4" />
          </button>
          <button
            type="button"
            aria-label="Next week"
            disabled={atNow}
            onClick={() => {
              haptic.selection();
              setStart(shiftWeek(start, 1));
            }}
            className="grid h-9 w-9 place-items-center rounded-full border border-line bg-raised text-ink transition-all hover:border-line-strong active:scale-90 disabled:opacity-35"
          >
            <Sym name="chevronRight" className="h-4 w-4" />
          </button>
          {!week.isCurrent && <QuietButton onClick={() => setStart(thisWeekStart())}>This week</QuietButton>}
        </div>
      </header>

      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={start} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.34, ease: FLOW_SMOOTH }}>
          <div className="mt-7 grid grid-cols-2 gap-3 lg:grid-cols-6">
            <StatTile label="Net P&L" value={money(week.net)} tone={week.net > 0 ? "profit" : week.net < 0 ? "loss" : undefined} note={`${week.count} ${week.count === 1 ? "trade" : "trades"}`} />
            <StatTile label="Win rate" value={pct(week.winRate)} note={week.count ? `${week.wins}W · ${week.losses}L` : undefined} />
            <StatTile label="Avg R" value={week.avgR == null ? "—" : `${week.avgR > 0 ? "+" : ""}${week.avgR}R`} note={week.profitFactor ? `PF ${week.profitFactor}` : undefined} />
            <StatTile
              label="Plan followed"
              value={pct(week.plan.adherence)}
              tone={week.plan.adherence == null ? undefined : week.plan.adherence >= 0.8 ? "profit" : week.plan.adherence < 0.5 ? "loss" : undefined}
              note={week.plan.followed + week.plan.broke ? `${week.plan.followed}/${week.plan.followed + week.plan.broke} reviewed` : "No reviews yet"}
            />
            <StatTile
              label="Limit held"
              value={week.risk.daysWithLimit ? `${week.risk.held}/${week.risk.daysWithLimit}` : "—"}
              tone={week.risk.daysWithLimit ? (week.risk.breached ? "loss" : "profit") : undefined}
              note={week.risk.daysWithLimit ? "days within limit" : "No limit set"}
            />
            <StatTile
              label="Mistakes"
              value={week.mistakes.reduce((s, m) => s + m.count, 0)}
              tone={week.mistakes.length ? "loss" : undefined}
              note={week.mistakes[0]?.label ?? "None recorded"}
            />
          </div>

          {empty ? (
            <p className={cn(surface.editorial, "mt-5 px-6 py-9 text-center text-[14.5px] text-muted")}>{week.insights[0]?.text} Log a trade in Plan &amp; Record and it appears here.</p>
          ) : (
            <div className="mt-5 grid gap-5 lg:grid-cols-2">
              <Card title="Key takeaways">
                <ul className="space-y-3">
                  {week.insights.map((i, k) => (
                    <li key={k} className="flex items-start gap-3">
                      <span className={cn("mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-[8px] text-white", INSIGHT[i.tone][0])}>
                        <Sym name={INSIGHT[i.tone][1]} className="h-3.5 w-3.5" strokeWidth={2.2} />
                      </span>
                      <p className="text-[14.5px] leading-snug text-ink">{i.text}</p>
                    </li>
                  ))}
                </ul>

                {week.days.some((d) => d.trades.length > 0) && (
                  <div className="mt-5 border-t border-line-soft pt-4">
                    <p className="mb-2.5 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-faint">Sessions traded</p>
                    <ul className="divide-y divide-line-soft/70">
                      {week.days
                        .filter((d) => d.trades.length > 0)
                        .map((d) => (
                          <li key={d.date} className="flex items-center justify-between py-2 text-[13.5px]">
                            <span className="font-medium text-ink">{formatDateMedium(d.date)}</span>
                            <span className="text-muted">
                              {d.risk ? `${RISK_COPY[d.risk.status]} · ${formatMoney(d.risk.used, cur)} / ${formatMoney(d.risk.limit, cur)}` : `${d.trades.length} ${d.trades.length === 1 ? "trade" : "trades"}`}
                            </span>
                            <span className={cn("num font-semibold", tone(d.net))}>{money(d.net)}</span>
                          </li>
                        ))}
                    </ul>
                  </div>
                )}
              </Card>

              <Card title="Process & mistakes" aside={<Link href="/journal" className="text-[12.5px] font-semibold text-gold hover:underline">Open Journal</Link>}>
                <div className="grid grid-cols-2 gap-3">
                  {([
                    ["Followed plan", week.plan.followed, week.plan.netFollowed, "text-profit"],
                    ["Broke plan", week.plan.broke, week.plan.netBroke, "text-loss"],
                  ] as const).map(([label, n, net, c]) => (
                    <div key={label} className="rounded-2xl border border-line bg-raised px-4 py-3">
                      <p className="text-[12px] text-muted">{label}</p>
                      <p className={cn("kpi mt-1 text-[24px] tabular-nums", n ? c : "text-faint")}>{n}</p>
                      <p className={cn("num mt-0.5 text-[12.5px]", n ? tone(net) : "text-faint")}>{n ? `${money(net)} net` : "—"}</p>
                    </div>
                  ))}
                </div>

                {week.mistakes.length > 0 && (
                  <ul className="mt-4 divide-y divide-line-soft/70 border-t border-line-soft pt-3">
                    {week.mistakes.map((m) => (
                      <li key={m.key} className="flex items-center justify-between gap-3 py-2 text-[13.5px]">
                        <Link href={`/journal?mistake=${m.key}`} className="flex min-w-0 items-center gap-2 font-medium text-ink hover:underline">
                          <span className="truncate">{m.label}</span>
                          {m.recurring && <span className="shrink-0 rounded-full bg-loss/[0.1] px-2 py-px text-[11px] font-semibold text-loss">Recurring</span>}
                        </Link>
                        <span className="num shrink-0 text-muted">
                          {m.count}× {m.cost > 0 && <span className="ml-1 font-semibold text-loss">{money(-m.cost)}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {recurring.filter((r) => !week.mistakes.some((m) => m.key === r.key)).length > 0 && (
                  <p className="mt-3 border-t border-line-soft pt-3 text-[12.5px] leading-snug text-muted">
                    Also recurring in recent weeks: {recurring.filter((r) => !week.mistakes.some((m) => m.key === r.key)).map((r) => r.label).join(", ")}.
                  </p>
                )}
              </Card>
            </div>
          )}

          <Card title="2-Minute Check-In" className="mt-5">
            {lastFocus && (
              <p className="mb-4 rounded-2xl bg-gold/[0.08] px-4 py-3 text-[13.5px] text-ink">
                <span className="text-muted">Last week&apos;s rule: </span>
                {lastFocus}
              </p>
            )}
            <div>
              <Label done={wentWell.trim().length > 0} htmlFor="wk-well">
                1. What worked best this week?
              </Label>
              <TextBlock
                id="wk-well"
                maxLength={400}
                value={wentWell}
                onChange={(e) => setWentWell(e.target.value)}
                placeholder="Write in your own words what worked well…"
                className="mt-2.5"
              />
            </div>

            <AnimatePresence>
              {q2Ready && (
                <Reveal key="wk-q2" delay={0.1}>
                  <Label done={focus.trim().length > 0} htmlFor="wk-focus">
                    2. One rule to focus on next week
                  </Label>
                  <TextBlock
                    id="wk-focus"
                    maxLength={280}
                    value={focus}
                    onChange={(e) => setFocus(e.target.value)}
                    placeholder="Write one concrete rule for Monday…"
                    className="mt-2.5"
                  />
                </Reveal>
              )}
            </AnimatePresence>

            <div className="mt-5 flex items-center justify-between gap-4">
              <p className="text-[13px] text-faint">{savedAt && !dirty ? "Saved to Google Drive" : ""}</p>
              <PrimaryButton disabled={!dirty || (!wentWell.trim() && !focus.trim())} loading={busy} onClick={save}>
                Save review
              </PrimaryButton>
            </div>
          </Card>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

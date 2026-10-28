"use client";

import { useEffect, useMemo } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { JournalEntry, TradePlan } from "@/lib/types";
import { winOddsNow, type PlanDraft, type WinOdds } from "@/lib/prediction";
import { cn } from "@/lib/utils";

/**
 * Win probability — read mid-planning.
 *
 * The number is fitted to the trader's own past trades with every factor together (checklist completeness, this setup's
 * record, feeling, news, trade of the day, after-a-loss) — see winOdds() in lib/prediction/outlook.ts. Ticking another
 * rule moves it, the ring and numbers glide to the new value, and the card shows WHY: the range it could be, what is
 * pushing it up or down, what a full checklist would be worth, and how the closest past trades actually did.
 * Everything is about the trader's habits, never the market.
 */
const SPRING = { type: "spring", stiffness: 140, damping: 24, mass: 0.9 } as const;
const SIZE = 84, STROKE = 8, R = (SIZE - STROKE) / 2, C = 2 * Math.PI * R;

/** A number that counts to its new value instead of jumping. */
function Count({ value, className }: { value: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => String(Math.round(v)));
  useEffect(() => {
    if (reduce) { mv.set(value); return; }
    const c = animate(mv, value, { type: "spring", stiffness: 140, damping: 24 });
    return () => c.stop();
  }, [value, reduce, mv]);
  return <motion.span className={className}>{text}</motion.span>;
}

/** Three bars, like signal strength: how much history backs the number. */
function Strength({ level }: { level: 1 | 2 | 3 }) {
  return (
    <span aria-hidden className="inline-flex items-end gap-[2px]">
      {[1, 2, 3].map((i) => <span key={i} className={cn("w-[3px] rounded-full", i === 1 ? "h-[5px]" : i === 2 ? "h-[8px]" : "h-[11px]", i <= level ? "bg-ink/55" : "bg-ink/15")} />)}
    </span>
  );
}

const CONF = { low: { n: 1 as const, text: "Early estimate" }, medium: { n: 2 as const, text: "Fair sample" }, high: { n: 3 as const, text: "Strong sample" } };
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;
const money = (n: number | null) => (n == null ? "—" : `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const pc = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);

export function WinOddsCard({ draft, entries, plans }: { draft: PlanDraft; entries: JournalEntry[]; plans: TradePlan[] }) {
  const odds: WinOdds = useMemo(() => winOddsNow(draft, entries, plans), [draft, entries, plans]);
  const reduce = useReducedMotion();
  const ready = odds.status === "ready";
  const win = ready ? odds.win : 0;
  const progress = ready ? win / 100 : odds.n / odds.needed;
  const ck = ready ? odds.checklist : null;

  return (
    <section
      aria-label="Win probability"
      aria-live="polite"
      className={cn(
        "relative isolate overflow-hidden rounded-[22px] border border-ink/[0.08] backdrop-blur-xl",
        "bg-white/70 shadow-[inset_0_1px_0_rgb(255_255_255/0.9),0_10px_28px_-18px_rgb(60_45_20/0.28)]",
        "dark:bg-white/[0.05] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_10px_28px_-18px_rgb(0_0_0/0.7)]",
      )}
    >
      <div className="flex items-center gap-4 px-5 py-4">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-ink/[0.08]" />
            {ready && (
              // The range the real chance most likely sits in, drawn as a faint arc behind the main one.
              <circle
                cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} strokeLinecap="butt" className="stroke-profit/20"
                strokeDasharray={`${Math.max(0.5, ((odds.high - odds.low) / 100) * C)} ${C}`} strokeDashoffset={-(odds.low / 100) * C}
              />
            )}
            <motion.circle
              cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} strokeLinecap="round"
              className={ready ? "stroke-profit" : "stroke-gold-strong"}
              initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
              animate={{ strokeDasharray: `${Math.max(0.001, progress) * C} ${C}` }}
              transition={reduce ? { duration: 0.2 } : SPRING}
            />
          </svg>
          <div className="absolute inset-0 grid place-items-center">
            {ready ? (
              <p className="kpi tabular-nums text-ink"><Count value={win} className="text-[26px]" /><span className="text-[13px] font-medium text-muted">%</span></p>
            ) : (
              <p className="kpi tabular-nums text-[20px] text-ink">{odds.n}<span className="text-[13px] font-medium text-muted">/{odds.needed}</span></p>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Win probability</p>
          {ready ? (
            <>
              <p className="mt-1.5 flex items-center gap-4 text-[15px] font-semibold tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-profit"><span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden /><span>Win <Count value={win} />%</span></span>
                <span className="inline-flex items-center gap-1.5 text-loss"><span className="h-1.5 w-1.5 rounded-full bg-loss" aria-hidden /><span>Loss <Count value={100 - win} />%</span></span>
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted">
                <Strength level={CONF[odds.confidence].n} />
                <span className="truncate">{CONF[odds.confidence].text} · likely {odds.low}–{odds.high}% · {odds.n} past trades</span>
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[13.5px] leading-snug text-muted">Unlocks after {odds.needed} logged trades. You have {odds.n}.</p>
          )}
        </div>
      </div>

      {ready && ck && (
        <div className="border-t border-ink/[0.06] px-5 py-3.5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-[13px] font-medium text-ink">Checklist {ck.done}/{ck.total}</p>
            <p className="text-[12.5px] tabular-nums text-muted">{ck.perRule >= 0 ? "+" : "−"}{Math.abs(ck.perRule)} pts per rule confirmed</p>
          </div>
          {/* None → now → all: where this trade sits on the ladder. */}
          <div className="relative mt-2.5 h-[6px] rounded-full bg-ink/[0.08]">
            <motion.div className="absolute inset-y-0 left-0 rounded-full bg-profit/70" initial={false} animate={{ width: `${ck.total ? (ck.done / ck.total) * 100 : 0}%` }} transition={reduce ? { duration: 0.15 } : SPRING} />
          </div>
          <div className="mt-1.5 flex justify-between text-[12px] tabular-nums text-faint">
            <span>None · {ck.atNone}%</span>
            <span className="font-medium text-ink">Now · {win}%</span>
            <span>All · {ck.atAll}%</span>
          </div>
          <p className="mt-2 text-[12px] leading-snug text-faint">
            {ck.fromHistory
              ? ck.trend === "up" ? "Fitted to your own trades: more rules confirmed has meant more wins for you."
                : ck.trend === "down" ? "Fitted to your own trades: so far, confirming more rules has NOT meant more wins for you. Worth reviewing the rules."
                : "Fitted to your own trades: confirming more rules has made little difference so far."
              : ck.history && ck.history.n >= 3
                ? `Only ${ck.history.n} of your trades carry a checklist so far, so this effect is the standard assumption (every rule is part of the edge). It sharpens as you log more.`
                : "None of your past trades carry a checklist yet, so this effect is the standard assumption (every rule is part of the edge). It sharpens as you log more."}
          </p>
          {ck.history && ck.history.fullN >= 2 && ck.history.partialN >= 2 && (
            <p className="mt-1 text-[12px] tabular-nums text-muted">
              Full checklist: {pc(ck.history.fullWinRate)} won ({ck.history.fullN}) · incomplete: {pc(ck.history.partialWinRate)} won ({ck.history.partialN})
            </p>
          )}
        </div>
      )}

      {ready && odds.drivers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-ink/[0.06] px-5 py-3">
          {odds.drivers.map((dr) => (
            <span key={dr.label} className={cn("inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12.5px] font-medium tabular-nums", dr.pts > 0 ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss")}>
              {dr.label}<span className="opacity-80">{signed(dr.pts)}</span>
            </span>
          ))}
        </div>
      )}

      {ready && odds.similar && (
        <dl className="grid grid-cols-4 gap-2 border-t border-ink/[0.06] px-5 py-3.5">
          {([
            ["Win rate", pc(odds.similar.winRate)],
            ["Avg P&L", money(odds.similar.avgPnl)],
            ["Profit factor", odds.similar.profitFactor == null ? "—" : odds.similar.profitFactor.toFixed(2)],
            ["Avg R", odds.similar.avgR == null ? "—" : `${odds.similar.avgR > 0 ? "+" : ""}${odds.similar.avgR}R`],
          ] as const).map(([k, v]) => (
            <div key={k} className="min-w-0">
              <dt className="truncate text-[11.5px] text-faint">{k}</dt>
              <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">{v}</dd>
            </div>
          ))}
          <p className="col-span-4 -mt-0.5 text-[12px] text-faint">From {odds.similar.n} {odds.similar.label}.</p>
        </dl>
      )}
    </section>
  );
}

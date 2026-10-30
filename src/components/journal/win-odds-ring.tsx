"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { JournalEntry, TradePlan } from "@/lib/types";
import { winOddsNow, type PlanDraft, type WinOdds } from "@/lib/prediction";
import { cn } from "@/lib/utils";
import { FLOW_SMOOTH } from "./flow-ui";

/**
 * Win probability as one small ring, top right of the checklist step (Apple Fitness style).
 * The ring and its number are all you see; tapping it opens the detail, tapping anywhere else closes it.
 */
const SIZE = 46, STROKE = 4.5, R = (SIZE - STROKE) / 2, C = 2 * Math.PI * R;
const money = (n: number | null) => (n == null ? "—" : `${n < 0 ? "−" : "+"}$${Math.abs(Math.round(n)).toLocaleString("en-US")}`);
const pc = (n: number | null) => (n == null ? "—" : `${Math.round(n * 100)}%`);
const signed = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.abs(n)}`;

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

export function WinOddsRing({ draft, entries, plans }: { draft: PlanDraft; entries: JournalEntry[]; plans: TradePlan[] }) {
  const odds: WinOdds = useMemo(() => winOddsNow(draft, entries, plans), [draft, entries, plans]);
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const ready = odds.status === "ready";
  const win = ready ? odds.win : 0;
  const progress = ready ? win / 100 : odds.n / odds.needed;

  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); setOpen(false); } };
    window.addEventListener("pointerdown", away, true);
    window.addEventListener("keydown", esc, true);
    return () => { window.removeEventListener("pointerdown", away, true); window.removeEventListener("keydown", esc, true); };
  }, [open]);

  return (
    <div ref={wrap} className="relative shrink-0">
      <button
        type="button"
        aria-expanded={open}
        aria-label={ready ? `Win probability ${win} percent. Show details` : `Win probability unlocks after ${odds.needed} trades. Show details`}
        onClick={() => setOpen((v) => !v)}
        className="relative grid place-items-center rounded-full border border-line bg-raised shadow-panel transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
        style={{ width: SIZE + 6, height: SIZE + 6 }}
      >
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-ink/[0.08]" />
          <motion.circle
            cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} strokeLinecap="round"
            className={ready && win >= 50 ? "stroke-profit" : "stroke-gold-strong"}
            initial={reduce ? false : { strokeDasharray: `0 ${C}` }}
            animate={{ strokeDasharray: `${Math.max(0.001, progress) * C} ${C}` }}
            transition={reduce ? { duration: 0.2 } : { type: "spring", stiffness: 140, damping: 24, mass: 0.9 }}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center">
          {ready ? (
            <span className="kpi tabular-nums text-ink">
              <Count value={win} className="text-[14px] font-semibold" />
              <span className="text-[8.5px] font-semibold text-muted">%</span>
            </span>
          ) : (
            <span className="kpi tabular-nums text-[11px] font-semibold text-muted">{odds.n}/{odds.needed}</span>
          )}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            role="dialog"
            aria-label="Win probability details"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.97 }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
            transition={{ duration: reduce ? 0.12 : 0.28, ease: FLOW_SMOOTH }}
            style={{ transformOrigin: "top right" }}
            className="absolute right-0 top-full z-30 mt-2 w-[17.5rem] rounded-[22px] border border-line bg-overlay/90 p-4 shadow-overlay backdrop-blur-2xl backdrop-saturate-150"
          >
            <p className="text-[12.5px] font-semibold text-muted">Win probability</p>
            {ready ? (
              <>
                <p className="kpi mt-1 tabular-nums text-ink">
                  <span className="text-[32px] font-semibold leading-none tracking-[-0.02em]">{win}</span>
                  <span className="ml-0.5 text-[15px] font-medium text-muted">%</span>
                </p>
                <p className="mt-1.5 text-[12.5px] tabular-nums text-muted">
                  Likely {odds.low}–{odds.high}% · {odds.n} trades · <span className="text-loss">Loss {100 - win}%</span>
                </p>
                {odds.checklist && odds.checklist.done < odds.checklist.total && odds.checklist.atAll > win && (
                  <p className="mt-2.5 inline-flex rounded-full bg-gold/15 px-2.5 py-0.5 text-[12px] font-semibold tabular-nums text-gold-deep dark:text-gold">All rules → {odds.checklist.atAll}%</p>
                )}
                {odds.drivers.length > 0 && (
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {odds.drivers.slice(0, 3).map((dr) => (
                      <span key={dr.label} className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11.5px] font-medium tabular-nums", dr.pts > 0 ? "bg-profit/12 text-profit" : "bg-loss/12 text-loss")}>
                        {dr.label}<span className="opacity-80">{signed(dr.pts)}</span>
                      </span>
                    ))}
                  </div>
                )}
                {odds.similar && (
                  <dl className="mt-3.5 grid grid-cols-2 gap-px overflow-hidden rounded-2xl bg-line-soft">
                    {([["Setup win rate", pc(odds.similar.winRate)], ["Avg P&L", money(odds.similar.avgPnl)], ["Profit factor", odds.similar.profitFactor == null ? "—" : odds.similar.profitFactor.toFixed(2)], ["Avg R", odds.similar.avgR == null ? "—" : `${odds.similar.avgR > 0 ? "+" : ""}${odds.similar.avgR}R`]] as const).map(([k, v]) => (
                      <div key={k} className="bg-raised px-3 py-2.5">
                        <dt className="truncate text-[10.5px] font-medium uppercase tracking-[0.06em] text-faint">{k}</dt>
                        <dd className="mt-0.5 text-[14px] font-semibold tabular-nums text-ink">{v}</dd>
                      </div>
                    ))}
                  </dl>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-[13.5px] leading-snug text-muted">Unlocks after {odds.needed} logged trades. You have {odds.n}.</p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

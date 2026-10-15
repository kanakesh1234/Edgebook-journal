"use client";

import { useEffect, useMemo, useRef } from "react";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import type { JournalEntry, TradePlan } from "@/lib/types";
import { winOddsNow, type PlanDraft, type WinOdds } from "@/lib/prediction";
import { cn } from "@/lib/utils";

/**
 * Win probability — one glance, read mid-trade.
 *
 * A frosted-glass card with a progress ring (win share) and the two numbers that matter. It recomputes on every change to
 * the plan (a ticked rule, a different feeling) and the ring, the number and the ambient glow all glide to the new value.
 * Everything is derived from the trader's own past trades — never the market.
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

export function WinOddsCard({ draft, entries, plans }: { draft: PlanDraft; entries: JournalEntry[]; plans: TradePlan[] }) {
  const odds: WinOdds = useMemo(() => winOddsNow(draft, entries, plans), [draft, entries, plans]);
  const reduce = useReducedMotion();
  const ready = odds.status === "ready";
  const win = ready ? odds.win : 0;
  const progress = ready ? win / 100 : odds.n / odds.needed;
  const tone = !ready ? "gold" : win >= 55 ? "profit" : win <= 45 ? "loss" : "gold";
  const prev = useRef(win);
  const moved = ready && prev.current !== win;
  useEffect(() => { prev.current = win; }, [win]);

  return (
    <section
      aria-label="Win probability"
      aria-live="polite"
      className={cn(
        "relative isolate overflow-hidden rounded-[22px] border border-ink/[0.08] backdrop-blur-xl",
        // Frosted glass: a translucent wash, a bright top edge, and a soft lift.
        "bg-gradient-to-b from-white/75 to-white/40 shadow-[inset_0_1px_0_rgb(255_255_255/0.85),0_14px_34px_-18px_rgb(60_45_20/0.35)]",
        "dark:from-white/[0.07] dark:to-white/[0.02] dark:shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_14px_34px_-18px_rgb(0_0_0/0.7)]",
      )}
    >
      {/* Ambient glow behind the glass; its colour follows the result. */}
      <motion.span
        aria-hidden
        className={cn("pointer-events-none absolute -left-8 -top-12 -z-10 h-48 w-48 rounded-full blur-3xl transition-colors duration-700", tone === "profit" ? "bg-profit" : tone === "loss" ? "bg-loss" : "bg-gold-strong")}
        initial={false}
        animate={{ opacity: 0.2, scale: moved && !reduce ? 1.12 : 1 }}
        transition={{ duration: 0.6 }}
      />

      <div className="flex items-center gap-4 px-5 py-4">
        {/* Ring */}
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} className="-rotate-90" aria-hidden>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className={ready ? "stroke-loss/25" : "stroke-ink/[0.08]"} />
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

        {/* Words — only what is needed at a glance. */}
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold tracking-[-0.01em] text-ink">Win probability</p>
          {ready ? (
            <>
              <p className="mt-1.5 flex items-center gap-4 text-[15px] font-semibold tabular-nums">
                <span className="inline-flex items-center gap-1.5 text-profit"><span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden />Win <Count value={win} />%</span>
                <span className="inline-flex items-center gap-1.5 text-loss"><span className="h-1.5 w-1.5 rounded-full bg-loss" aria-hidden />Loss <Count value={100 - win} />%</span>
              </p>
              <p className="mt-1.5 flex items-center gap-2 text-[12.5px] text-muted">
                <Strength level={CONF[odds.confidence].n} />
                <span className="truncate">{CONF[odds.confidence].text} · {odds.basis ? `${odds.basis.n} similar trades` : `${odds.n} past trades`}</span>
              </p>
            </>
          ) : (
            <p className="mt-1.5 text-[13.5px] leading-snug text-muted">Unlocks after {odds.needed} logged trades. You have {odds.n}.</p>
          )}
        </div>
      </div>
    </section>
  );
}

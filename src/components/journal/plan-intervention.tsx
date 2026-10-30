"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { Portal } from "@/components/lessons/portal";
import type { Intervention, InterventionAction, InterventionKind } from "@/lib/minato/plan-intervention";
import { Collapse, FLOW_SMOOTH, GlyphStop, GlyphTarget, GlyphTimer, IconCheck } from "./flow-ui";

const G = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-[22px] w-[22px]" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const GlyphPulse = () => <G><path d="M3 12h4l2.5-6 4 12 2.5-6H21" /></G>;
const GlyphNote = () => <G><path d="M6 4h9l4 4v12H6V4Z" /><path d="M14 4v5h5M9 13h7M9 16.5h5" /></G>;
const big = (n: React.ReactNode) => <span className="grid place-items-center [&_svg]:h-[22px] [&_svg]:w-[22px]">{n}</span>;

const GLYPH: Record<InterventionKind, React.ReactNode> = {
  "skipped-rule": big(<IconCheck className="h-[22px] w-[22px]" />),
  "bias-clash": big(<GlyphTarget />),
  invalidation: big(<GlyphStop />),
  "similar-plan": big(<GlyphTimer />),
  emotion: <GlyphPulse />,
  "self-note": <GlyphNote />,
};

/**
 * Minato's one word in Plan Trade, shown full screen over a soft blurred scrim (iOS alert / sheet feel).
 * Tap, click or press Escape ANYWHERE and it goes — it never lingers. Only its own buttons are exempt:
 * the action (does the thing, then closes), "Details" (unfolds the evidence) and "Show fewer like this".
 * Reduced motion gets a plain fade.
 */
export function PlanIntervention({
  item,
  onAction,
  onDismiss,
  onMute,
}: {
  item: Intervention | null;
  onAction: (a: InterventionAction, i: Intervention) => void;
  onDismiss: () => void;
  onMute: () => void;
}) {
  return (
    <Portal>
      <AnimatePresence>{item && <Overlay key={item.id} item={item} onAction={onAction} onDismiss={onDismiss} onMute={onMute} />}</AnimatePresence>
    </Portal>
  );
}

function Overlay({ item, onAction, onDismiss, onMute }: { item: Intervention; onAction: (a: InterventionAction, i: Intervention) => void; onDismiss: () => void; onMute: () => void }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const act = item.action;
  const compare = act?.id === "compare";

  // Escape closes it (and never reaches the flow behind); focus moves in so screen readers announce it.
  useEffect(() => {
    card.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); onDismiss(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [onDismiss]);

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const rise = (delay: number) =>
    reduce ? {} : { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.4, delay, ease: FLOW_SMOOTH } };

  return (
    <motion.div
      onClick={onDismiss}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0.12 : 0.22 } }}
      transition={{ duration: reduce ? 0.15 : 0.3, ease: FLOW_SMOOTH }}
      className="fixed inset-0 z-[120] grid cursor-pointer place-items-center overflow-y-auto bg-[var(--scrim)] p-6 backdrop-blur-md backdrop-saturate-150"
    >
      <motion.div
        ref={card}
        role="alertdialog"
        aria-modal="true"
        aria-label={item.heading}
        aria-describedby={`nudge-${item.id}`}
        tabIndex={-1}
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.94 }}
        animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.97, transition: { duration: 0.2 } }}
        transition={{ duration: reduce ? 0.15 : 0.46, delay: reduce ? 0 : 0.05, ease: FLOW_SMOOTH }}
        className="my-auto w-full max-w-[22rem] rounded-[28px] border border-white/50 bg-overlay/90 px-6 pb-5 pt-7 text-center shadow-overlay outline-none backdrop-blur-2xl backdrop-saturate-150 dark:border-white/10"
      >
        <motion.span {...rise(0.12)} className="mx-auto grid h-12 w-12 place-items-center rounded-[15px] bg-gradient-to-b from-gold-strong to-gold-deep text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.28)]">
          {GLYPH[item.kind]}
        </motion.span>
        <motion.h2 {...rise(0.18)} className="mt-4 text-[18px] font-semibold leading-6 tracking-[-0.02em] text-ink">{item.heading}</motion.h2>
        <motion.p {...rise(0.22)} id={`nudge-${item.id}`} className="mt-1.5 text-[15px] leading-[1.45] text-muted">{item.insight}</motion.p>

        <motion.div {...rise(0.28)} className="mt-6 flex flex-col gap-1.5">
          {act && (
            <button
              type="button"
              onClick={(e) => { stop(e); if (compare) setOpen(true); else onAction(act, item); }}
              className="h-11 w-full rounded-2xl bg-gold-strong text-[15px] font-semibold text-on-gold transition-[background-color,transform] hover:bg-gold-strong-hover active:scale-[0.985] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
            >
              {act.label}
            </button>
          )}
          <button
            type="button"
            aria-expanded={open}
            onClick={(e) => { stop(e); setOpen((v) => !v); }}
            className="inline-flex h-10 w-full items-center justify-center gap-1 rounded-2xl text-[14px] font-medium text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
          >
            Details
            <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
          </button>
        </motion.div>

        <AnimatePresence initial={false}>
          {open && (
            <Collapse key="detail">
              <div className="space-y-3 border-t border-line-soft pt-4 text-left">
                {item.evidence.map((ev, i) => (
                  <div key={i} className="text-[12.5px] leading-[1.45]">
                    <p className="flex items-baseline justify-between gap-3 text-muted">
                      <span>{ev.label}</span>
                      {ev.date && <span className="shrink-0 tabular-nums text-faint">{ev.date}</span>}
                    </p>
                    {ev.quote && <p className="mt-1 border-l-2 border-gold/40 pl-2.5 text-[13px] text-ink/85">{ev.quote}</p>}
                  </div>
                ))}
                <div className="flex items-center justify-between gap-2 pt-1 text-[12px] text-faint">
                  <span>{item.sample > 1 ? `Based on ${item.sample} of your entries` : "Based on one of your entries"}</span>
                  <button type="button" onClick={(e) => { stop(e); onMute(); }} className="rounded-full px-2 py-1 font-medium text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40">
                    Show fewer like this
                  </button>
                </div>
              </div>
            </Collapse>
          )}
        </AnimatePresence>

        <p className="mt-3 text-[11.5px] text-faint">Tap anywhere to dismiss</p>
      </motion.div>
    </motion.div>
  );
}

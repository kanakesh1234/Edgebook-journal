"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import type { Intervention, InterventionAction, InterventionKind } from "@/lib/minato/plan-intervention";
import { Collapse, FLOW_SMOOTH, GlyphStop, GlyphTarget, GlyphTimer, IconCheck, IconClose, IconTile } from "./flow-ui";

const G = ({ children }: { children: React.ReactNode }) => (
  <svg viewBox="0 0 24 24" className="h-[17px] w-[17px]" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{children}</svg>
);
const GlyphPulse = () => <G><path d="M3 12h4l2.5-6 4 12 2.5-6H21" /></G>;
const GlyphNote = () => <G><path d="M6 4h9l4 4v12H6V4Z" /><path d="M14 4v5h5M9 13h7M9 16.5h5" /></G>;

const GLYPH: Record<InterventionKind, React.ReactNode> = {
  "skipped-rule": <IconCheck className="h-[17px] w-[17px]" />,
  "bias-clash": <GlyphTarget />,
  invalidation: <GlyphStop />,
  "similar-plan": <GlyphTimer />,
  emotion: <GlyphPulse />,
  "self-note": <GlyphNote />,
};

/**
 * Minato's one quiet word in Plan Trade. Sits directly above the setup checklist (inline, so it never covers a rule),
 * unfolds once, and leaves with a quicker fade. Heading + one sentence + at most one action; the evidence stays folded
 * until "Details" is pressed. Uses the app's own surfaces, tokens and motion curves; reduced motion gets a plain fade.
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
    <AnimatePresence initial={false}>
      {item && (
        <Collapse key={item.id}>
          <Card item={item} onAction={onAction} onDismiss={onDismiss} onMute={onMute} />
        </Collapse>
      )}
    </AnimatePresence>
  );
}

function Card({ item, onAction, onDismiss, onMute }: { item: Intervention; onAction: (a: InterventionAction, i: Intervention) => void; onDismiss: () => void; onMute: () => void }) {
  const reduce = useReducedMotion();
  const [open, setOpen] = useState(false);
  const act = item.action;
  const compare = act?.id === "compare";

  return (
    <motion.section
      role="status"
      aria-live="polite"
      aria-label={item.heading}
      onKeyDown={(e) => { if (e.key === "Escape") { e.stopPropagation(); onDismiss(); } }}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8, scale: 0.985 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: reduce ? 0.15 : 0.38, delay: reduce ? 0 : 0.08, ease: FLOW_SMOOTH }}
      className="my-1 rounded-[22px] border border-line bg-overlay/85 p-4 shadow-lift backdrop-blur-xl backdrop-saturate-150"
    >
      <div className="flex items-start gap-3">
        <IconTile tile="bg-gradient-to-b from-gold-strong to-gold-deep" className="mt-px">{GLYPH[item.kind]}</IconTile>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-5 tracking-[-0.01em] text-ink">{item.heading}</p>
          <p className="mt-0.5 text-[14px] leading-[1.45] text-muted">{item.insight}</p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {act && (
              <button
                type="button"
                onClick={() => (compare ? setOpen(true) : onAction(act, item))}
                className="inline-flex h-8 items-center rounded-full bg-gold-strong px-3.5 text-[13px] font-semibold text-on-gold transition-colors hover:bg-gold-strong-hover active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/50"
              >
                {act.label}
              </button>
            )}
            <button
              type="button"
              aria-expanded={open}
              onClick={() => setOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[13px] font-medium text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
            >
              Details
              <svg viewBox="0 0 24 24" className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </button>
          </div>
        </div>
        <button
          type="button"
          aria-label="Dismiss"
          onClick={onDismiss}
          className="relative -mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-faint transition-colors before:absolute before:-inset-2 before:content-[''] hover:bg-ink/[0.06] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40"
        >
          <span className="scale-[0.8]"><IconClose /></span>
        </button>
      </div>

      <AnimatePresence initial={false}>
        {open && (
          <Collapse key="detail">
            <div className="mt-3.5 space-y-2.5 border-t border-line-soft pt-3.5">
              {item.evidence.map((ev, i) => (
                <div key={i} className="text-[12.5px] leading-[1.45]">
                  <p className="flex items-baseline justify-between gap-3 text-muted">
                    <span>{ev.label}</span>
                    {ev.date && <span className="shrink-0 tabular-nums text-faint">{ev.date}</span>}
                  </p>
                  {ev.quote && <p className="mt-1 border-l-2 border-gold/40 pl-2.5 text-[13px] text-ink/85">{ev.quote}</p>}
                </div>
              ))}
              <div className="flex items-center justify-between pt-1 text-[12px] text-faint">
                <span>{item.sample > 1 ? `Based on ${item.sample} of your entries` : "Based on one of your entries"}</span>
                <button type="button" onClick={onMute} className="rounded-full px-2 py-1 font-medium text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/40">
                  Show fewer like this
                </button>
              </div>
            </div>
          </Collapse>
        )}
      </AnimatePresence>
    </motion.section>
  );
}

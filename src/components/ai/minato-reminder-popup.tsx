"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useMinatoReminders } from "@/lib/minato/reminders";
import { cn } from "@/lib/utils";

const SPRING_EASE: [number, number, number, number] = [0.32, 0.72, 0, 1];

/**
 * MINATO APPLE HIG REMINDER POP-UP
 *
 * Follows Apple Human Interface Guidelines (macOS / iOS Notification Banner):
 *  - Translucent frosted material (`backdrop-blur-2xl backdrop-saturate-180 bg-surface/92`)
 *  - Concentric rounded corners (`rounded-[22px]`), hairline border, soft elevation shadow
 *  - Minimal text, straight to the point: 1-line eyebrow + 1-line bold reminder + 1-tap `Got it`
 *  - Auto-dismisses after 8.5 seconds if untouched, and honors `prefers-reduced-motion`
 */
export function MinatoReminderPopup() {
  const reduce = useReducedMotion();
  const activePopup = useMinatoReminders((s) => s.activePopup);
  const reminders = useMinatoReminders((s) => s.reminders);
  const hydrate = useMinatoReminders((s) => s.hydrate);
  const dismissPopup = useMinatoReminders((s) => s.dismissPopup);
  const snoozePopup = useMinatoReminders((s) => s.snoozePopup);

  // Hydrate stored reminders on mount
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  // Background ticker for timed reminders ("remind me in 15 minutes", "remind me at 09:30")
  useEffect(() => {
    const id = window.setInterval(() => {
      const state = useMinatoReminders.getState();
      if (state.activePopup) return;
      const now = Date.now();
      const due = state.reminders.find((r) => r.active && r.dueAt !== null && r.dueAt <= now);
      if (due) {
        useMinatoReminders.setState({
          activePopup: {
            reminder: due,
            contextLabel: "Scheduled Reminder",
          },
        });
      }
    }, 4000);
    return () => window.clearInterval(id);
  }, [reminders.length]);

  // Auto-dismiss after 8.5 seconds so it never blocks the trader
  useEffect(() => {
    if (!activePopup) return;
    const t = window.setTimeout(() => {
      dismissPopup();
    }, 8500);
    return () => window.clearTimeout(t);
  }, [activePopup, dismissPopup]);

  // Dismiss on Escape
  useEffect(() => {
    if (!activePopup) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        dismissPopup();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [activePopup, dismissPopup]);

  return (
    <AnimatePresence>
      {activePopup && (
        <motion.div
          key={activePopup.reminder.id}
          role="status"
          aria-live="polite"
          initial={reduce ? { opacity: 0 } : { opacity: 0, y: -24, scale: 0.94 }}
          animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
          exit={reduce ? { opacity: 0 } : { opacity: 0, y: -18, scale: 0.96 }}
          transition={{ duration: 0.34, ease: SPRING_EASE }}
          style={{ willChange: "transform, opacity" }}
          className={cn(
            "fixed inset-x-0 top-[max(0.85rem,var(--safe-top))] z-[140] mx-auto flex w-[min(460px,calc(100vw-1.5rem))] items-center gap-3.5",
            "rounded-[22px] border border-line-strong bg-surface/92 px-4 py-3 shadow-overlay backdrop-blur-2xl backdrop-saturate-180",
          )}
        >
          {/* Minato Avatar Badge */}
          <span className="relative grid h-9 w-9 shrink-0 place-items-center overflow-hidden rounded-full bg-gold/15 font-bold text-gold ring-1 ring-gold/30">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/minato-avatar.jpg"
              alt=""
              width={72}
              height={72}
              className="h-full w-full object-cover"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
            />
          </span>

          {/* Minimal, to-the-point text */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gold">
              Minato · {activePopup.contextLabel}
            </p>
            <p className="mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug tracking-[-0.01em] text-ink">
              {activePopup.reminder.text}
            </p>
          </div>

          {/* Compact Apple Pill Actions */}
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={() => snoozePopup(15)}
              title="Remind me again in 15m"
              className="min-h-[32px] rounded-full bg-ink/[0.06] px-2.5 py-1 text-[11.5px] font-medium text-muted transition-colors hover:bg-ink/[0.12] hover:text-ink active:scale-95"
            >
              15m
            </button>
            <button
              type="button"
              onClick={dismissPopup}
              className="min-h-[32px] rounded-full bg-gold-strong px-3 py-1 text-[12px] font-semibold text-on-gold shadow-xs transition-all hover:opacity-92 active:scale-95"
            >
              Got it
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

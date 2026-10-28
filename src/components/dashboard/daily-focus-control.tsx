"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import type { CurrencyCode } from "@/lib/types";
import { formatMoney, todayKey } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { DailyLimit } from "./daily-limit";
import { EASE } from "@/components/landing/reveal";
import { ChevronRightIcon, ShieldIcon } from "@/components/ui/icons";
import { toast } from "@/components/ui/toast";

const IST = "Asia/Kolkata";
const WINDOW_START = 5 * 60;
const WINDOW_END = 18 * 60 + 55;

function istMinuteOfDay(now: Date): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: IST,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const value = (type: "hour" | "minute") => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return value("hour") * 60 + value("minute");
}

const SPRING = { type: "spring" as const, stiffness: 460, damping: 32 };

const HandPauseGlyph = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="M18 11V6a2 2 0 0 0-4 0v4" />
    <path d="M14 10V4a2 2 0 0 0-4 0v6" />
    <path d="M10 10.5V6a2 2 0 0 0-4 0v8" />
    <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.9-5.9-2.4L3.3 16.5a2 2 0 0 1 2.8-2.8L8 15.5" />
  </svg>
);

const CheckGlyph = ({ className = "h-3 w-3" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);

export async function toggleTodayNoSetup(hasTraded: boolean, noSetup: boolean): Promise<boolean> {
  const today = todayKey();
  if (hasTraded) return false;
  haptic.selection();
  try {
    if (noSetup) {
      await useApp.getState().removeNoTradeDay(today);
      toast.info("No-setup day off", "Plan trade and Add trade are enabled.");
      return false;
    }
    await useApp.getState().logNoTradeDay(today, "No setup day");
    toast.success("No-setup day active", "Plan trade and Add trade are locked for today.");
    return true;
  } catch {
    toast.error("Could not update day status");
    return noSetup;
  }
}

/**
 * Apple Focus-style pill placed directly in the top-right Dashboard action bar
 * beside "Add trade" and "Plan a trade". One tap locks/unlocks trading for today.
 */
export function NoSetupDayButton() {
  const entries = useApp((s) => s.entries);
  const dayLogs = useApp((s) => s.dayLogs);
  const today = todayKey();
  const hasTraded = entries.some((e) => e.date === today);
  const noSetup = !hasTraded && dayLogs.some((d) => d.date === today);

  if (hasTraded) return null;

  return (
    <motion.button
      layout
      transition={SPRING}
      type="button"
      role="switch"
      aria-checked={noSetup}
      onClick={() => void toggleTodayNoSetup(hasTraded, noSetup)}
      title={noSetup ? "No-setup day is active — tap to re-enable trading" : "Mark today as a no-setup day and lock trading"}
      className={cn(
        "group relative inline-flex h-10 items-center gap-2 rounded-full border px-3.5 text-[13px] font-medium outline-none transition-all duration-200 active:scale-[0.97] focus-visible:ring-2 focus-visible:ring-gold-strong/50",
        noSetup
          ? "border-gold/55 bg-gold/[0.14] text-gold-deep shadow-[0_4px_14px_-4px_rgb(180_130_40/0.28)] dark:text-gold"
          : "border-line bg-surface/90 text-muted shadow-[0_1px_2px_rgb(48_40_24/0.04)] hover:border-line-strong hover:text-ink",
      )}
    >
      <span
        className={cn(
          "grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors duration-200",
          noSetup ? "bg-gradient-to-b from-gold-strong to-gold-deep text-on-gold" : "bg-ink/[0.06] text-muted group-hover:text-ink",
        )}
      >
        {noSetup ? <CheckGlyph className="h-2.5 w-2.5" /> : <HandPauseGlyph className="h-3 w-3" />}
      </span>
      <span className="whitespace-nowrap">{noSetup ? "No-setup day" : "No setup"}</span>
    </motion.button>
  );
}

/**
 * Clean Apple iOS Control Center popover next to today's date for daily guardrails
 * (No-setup day switch + Daily loss limit).
 */
export function DailyFocusControl({ currency }: { currency: CurrencyCode }) {
  const entries = useApp((s) => s.entries);
  const dayLogs = useApp((s) => s.dayLogs);
  const limitAmount = useApp((s) => s.settings.dayLimits?.[todayKey()]);
  const hasLimit = !!limitAmount;
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [dismissedDate, setDismissedDate] = useState<string | null>(null);

  const today = todayKey();
  const hasTraded = entries.some((entry) => entry.date === today);
  const noSetup = !hasTraded && dayLogs.some((log) => log.date === today);
  const inLimitWindow = now != null && istMinuteOfDay(now) >= WINDOW_START && istMinuteOfDay(now) <= WINDOW_END;
  const shouldPrompt = inLimitWindow && !hasLimit && !noSetup;

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (dismissedDate && dismissedDate !== today) setDismissedDate(null);
  }, [dismissedDate, today]);

  useEffect(() => {
    if (shouldPrompt && dismissedDate !== today) setLimitOpen(true);
  }, [shouldPrompt, dismissedDate, today]);

  useEffect(() => {
    if (hasLimit || noSetup) setLimitOpen(false);
  }, [hasLimit, noSetup]);

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePress);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [menuOpen]);

  const dismissLimit = () => {
    setDismissedDate(today);
    setLimitOpen(false);
  };

  const handleToggleNoSetup = async () => {
    await toggleTodayNoSetup(hasTraded, noSetup);
    setLimitOpen(false);
  };

  return (
    <>
      <div ref={ref} className="relative inline-flex">
        <button
          type="button"
          aria-label="Open daily session controls"
          aria-expanded={menuOpen}
          onClick={() => {
            haptic.selection();
            setMenuOpen((open) => !open);
          }}
          className={cn(
            "inline-flex h-7 items-center gap-1.5 rounded-full border px-2.5 text-[12px] font-medium transition-all duration-150 active:scale-[0.97]",
            noSetup
              ? "border-gold/45 bg-gold/[0.12] text-gold-deep dark:text-gold"
              : "border-line bg-surface text-muted shadow-[0_1px_2px_rgb(48_40_24_/_0.04)] hover:border-line-strong hover:text-ink",
          )}
        >
          <span className={cn("h-1.5 w-1.5 rounded-full", noSetup ? "bg-gold-strong" : hasLimit ? "bg-profit" : "bg-faint")} aria-hidden />
          <span>
            {noSetup
              ? "No-setup day"
              : hasLimit
                ? `Limit ${formatMoney(limitAmount, currency, { decimals: 0 })}`
                : "Session"}
          </span>
          <ChevronRightIcon className={`h-3 w-3 transition-transform duration-200 ${menuOpen ? "-rotate-90" : "rotate-90"}`} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.96 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.96 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="absolute left-0 top-[calc(100%+8px)] z-50 w-[268px] overflow-hidden rounded-[22px] border border-line-strong bg-surface/95 p-1.5 shadow-overlay backdrop-blur-xl"
            >
              {/* Row 1 — Apple iOS Switch Row for No-Setup Day */}
              <button
                type="button"
                role="switch"
                aria-checked={noSetup}
                disabled={hasTraded}
                onClick={() => void handleToggleNoSetup()}
                className="flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.045] disabled:cursor-default disabled:opacity-45"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-[8px] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)] transition-colors",
                      noSetup ? "bg-gradient-to-b from-gold-strong to-gold-deep" : "bg-[#8e8e93]",
                    )}
                  >
                    <HandPauseGlyph className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink">No-setup day</span>
                    <span className="block truncate text-[11px] text-muted">
                      {hasTraded ? "Trade logged today" : noSetup ? "Trading locked" : "Locks Plan & Add trade"}
                    </span>
                  </div>
                </div>

                {/* Native iOS-style pill switch */}
                <span
                  aria-hidden
                  className={cn(
                    "relative inline-flex h-[22px] w-[38px] shrink-0 items-center rounded-full p-0.5 transition-colors duration-200",
                    noSetup ? "bg-profit" : "bg-ink/[0.15]",
                  )}
                >
                  <motion.span
                    layout
                    transition={SPRING}
                    className={cn(
                      "h-[18px] w-[18px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/0.28)]",
                      noSetup ? "ml-auto" : "ml-0",
                    )}
                  />
                </span>
              </button>

              {/* Row 2 — Daily Loss Limit */}
              <button
                type="button"
                disabled={noSetup}
                onClick={() => {
                  setMenuOpen(false);
                  setLimitOpen(true);
                }}
                className="mt-0.5 flex w-full items-center justify-between gap-3 rounded-[16px] px-3 py-2.5 text-left transition-colors hover:bg-ink/[0.045] disabled:cursor-default disabled:opacity-40"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[8px] bg-[#5e5ce6] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25)]">
                    <ShieldIcon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0">
                    <span className="block truncate text-[13.5px] font-medium text-ink">Daily loss limit</span>
                    <span className="block truncate text-[11px] text-muted">
                      {hasLimit ? `${formatMoney(limitAmount, currency, { decimals: 0 })} active` : "Set session guardrail"}
                    </span>
                  </div>
                </div>
                <ChevronRightIcon className="h-3.5 w-3.5 shrink-0 text-faint" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {limitOpen && (
          <motion.div className="fixed inset-0 z-[80] grid place-items-center p-4 sm:p-6" initial="hidden" animate="visible" exit="hidden">
            <motion.button
              type="button"
              aria-label="Dismiss daily limit"
              tabIndex={-1}
              onClick={dismissLimit}
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 cursor-default bg-ink/20 backdrop-blur-sm"
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="Set daily loss limit"
              variants={{
                hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 18, scale: 0.98 },
                visible: reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 },
              }}
              transition={{ duration: 0.3, ease: EASE }}
              className="relative w-full max-w-md rounded-[28px] border border-line-strong bg-surface p-5 shadow-overlay sm:p-6"
            >
              <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-deep">Before the session</p>
              <h2 className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em] text-ink">Set today&apos;s limit</h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-muted">
                Choose your loss guardrail before trading. Tap anywhere outside this card to close it.
              </p>
              <div className="mt-5">
                <DailyLimit risk={null} currency={currency} />
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

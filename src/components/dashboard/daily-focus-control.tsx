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
/** Prompt window in IST: 5:00 PM – 6:55 PM (inclusive of the 6:55 minute). */
const WINDOW_START = 17 * 60;
const WINDOW_END = 18 * 60 + 55;
const DISMISS_KEY = "edgebook:limit-prompt-dismissed";

const istFmt = new Intl.DateTimeFormat("en-GB", {
  timeZone: IST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Wall-clock minute-of-day and calendar date in IST, independent of the device timezone. */
function istNow(now: Date): { minute: number; date: string } {
  const p: Record<string, string> = {};
  for (const part of istFmt.formatToParts(now)) if (part.type !== "literal") p[part.type] = part.value;
  return { minute: Number(p.hour) * 60 + Number(p.minute), date: `${p.year}-${p.month}-${p.day}` };
}

const readDismissed = (): string | null => {
  try { return window.localStorage.getItem(DISMISS_KEY); } catch { return null; }
};
const writeDismissed = (date: string) => {
  try { window.localStorage.setItem(DISMISS_KEY, date); } catch { /* private mode: fine */ }
};

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
  const [auto, setAuto] = useState(false); // true when the sheet opened by itself (vs. from the menu)
  const [now, setNow] = useState<Date | null>(null);

  const today = todayKey();
  const hasTraded = entries.some((entry) => entry.date === today);
  const noSetup = !hasTraded && dayLogs.some((log) => log.date === today);
  const ist = now ? istNow(now) : null;
  const inLimitWindow = ist != null && ist.minute >= WINDOW_START && ist.minute <= WINDOW_END;
  const shouldPrompt = inLimitWindow && !hasLimit && !noSetup;

  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const timer = window.setInterval(tick, 30_000);
    const onVisible = () => { if (document.visibilityState === "visible") tick(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, []);

  // Open once per IST day, only inside the window, and never again after it was dismissed (survives reloads).
  useEffect(() => {
    if (!shouldPrompt || !ist) return;
    if (readDismissed() === ist.date) return;
    setAuto(true);
    setLimitOpen(true);
  }, [shouldPrompt, ist?.date]); // eslint-disable-line react-hooks/exhaustive-deps

  // An automatic prompt closes itself the moment the window ends.
  useEffect(() => {
    if (auto && ist && !inLimitWindow) { setLimitOpen(false); setAuto(false); }
  }, [auto, ist, inLimitWindow]);

  useEffect(() => {
    if (hasLimit || noSetup) { setLimitOpen(false); setAuto(false); }
  }, [hasLimit, noSetup]);

  useEffect(() => {
    if (!limitOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") dismissLimit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!menuOpen) return;
    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    window.addEventListener("pointerdown", closeOnOutsidePress);
    return () => window.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [menuOpen]);

  const dismissLimit = () => {
    if (auto && ist) writeDismissed(ist.date); // only an automatic prompt counts as "seen today"
    setLimitOpen(false);
    setAuto(false);
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
          <motion.div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-6" initial="hidden" animate="visible" exit="hidden">
            <motion.button
              type="button"
              aria-label="Dismiss"
              tabIndex={-1}
              onClick={dismissLimit}
              variants={{ hidden: { opacity: 0 }, visible: { opacity: 1 } }}
              transition={{ duration: 0.25 }}
              className="absolute inset-0 cursor-default bg-ink/25 backdrop-blur-sm"
            />
            <motion.section
              role="dialog"
              aria-modal="true"
              aria-label="Set today's loss limit"
              variants={{
                hidden: reduce ? { opacity: 0 } : { opacity: 0, y: 28, scale: 0.98 },
                visible: reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 },
              }}
              transition={{ duration: 0.34, ease: EASE }}
              className="relative max-h-[calc(100dvh-1.5rem)] w-full overflow-y-auto overscroll-contain rounded-t-[28px] border border-line-strong bg-surface px-5 pb-[calc(1.25rem+env(safe-area-inset-bottom))] pt-5 shadow-overlay sm:max-w-[380px] sm:rounded-[28px] sm:pb-6"
            >
              <button
                type="button"
                aria-label="Close"
                onClick={dismissLimit}
                className="absolute right-3 top-3 grid h-8 w-8 place-items-center rounded-full bg-ink/[0.06] text-muted outline-none transition-[background-color,transform] duration-200 hover:rotate-90 hover:bg-ink/[0.1] hover:text-ink focus-visible:ring-2 focus-visible:ring-gold/50 active:scale-95"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
              <h2 className="pr-10 font-display text-[24px] font-semibold tracking-[-0.03em] text-ink">Today&apos;s loss limit</h2>
              <div className="mt-4">
                <DailyLimit risk={null} currency={currency} compact />
              </div>
            </motion.section>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

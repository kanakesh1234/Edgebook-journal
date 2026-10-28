"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import type { CurrencyCode } from "@/lib/types";
import { todayKey } from "@/lib/format";
import { DailyLimit } from "./daily-limit";
import { EASE } from "@/components/landing/reveal";
import { ChevronRightIcon } from "@/components/ui/icons";
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

/**
 * The small header control replaces the permanent Today bar. It asks for a
 * guardrail only during the trader's chosen IST window, and otherwise stays
 * out of the way. The no-setup action remains a deliberate, one-tap choice.
 */
export function DailyFocusControl({ currency }: { currency: CurrencyCode }) {
  const entries = useApp((s) => s.entries);
  const dayLogs = useApp((s) => s.dayLogs);
  const hasLimit = useApp((s) => !!s.settings.dayLimits?.[todayKey()]);
  const reduce = useReducedMotion();
  const ref = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [limitOpen, setLimitOpen] = useState(false);
  const [now, setNow] = useState<Date | null>(null);
  const [dismissedDate, setDismissedDate] = useState<string | null>(null);

  const today = todayKey();
  const noSetup = entries.every((entry) => entry.date !== today) && dayLogs.some((log) => log.date === today);
  const hasTraded = entries.some((entry) => entry.date === today);
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

  const toggleNoSetup = async () => {
    if (hasTraded) return;
    try {
      if (noSetup) {
        await useApp.getState().removeNoTradeDay(today);
        toast.info("No-setup day cleared", "Plan trade and Add trade are re-enabled for today.");
        setMenuOpen(false);
      } else {
        await useApp.getState().logNoTradeDay(today, "Sitting on hands — no A+ setup.");
        toast.success("No-setup day logged", "Plan trade and Add trade are disabled for the rest of today.");
        setMenuOpen(false);
        setLimitOpen(false);
      }
    } catch {
      toast.error("Could not update the no-setup day");
    }
  };

  return (
    <>
      <div ref={ref} className="relative inline-flex">
        <button
          type="button"
          aria-label="Open daily trading details"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-3 text-[12px] font-medium text-muted shadow-[0_1px_2px_rgb(48_40_24_/_0.04)] transition-colors hover:border-line-strong hover:text-ink active:scale-[0.97]"
        >
          {noSetup && <span className="h-1.5 w-1.5 rounded-full bg-gold-strong" aria-hidden />}
          <span>{noSetup ? "Details · No setup" : "Details"}</span>
          <ChevronRightIcon className={`h-3.5 w-3.5 transition-transform duration-200 ${menuOpen ? "-rotate-90" : "rotate-90"}`} />
        </button>

        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6, scale: 0.98 }}
              animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
              exit={reduce ? { opacity: 0 } : { opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.2, ease: EASE }}
              className="absolute right-0 top-[calc(100%+8px)] z-50 w-[min(300px,calc(100vw-2rem))] overflow-hidden rounded-[20px] border border-line-strong bg-surface p-2 shadow-overlay"
            >
              <div className="rounded-[14px] bg-gold/[0.08] px-3.5 py-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-gold-deep">Daily intention</p>
                <p className="mt-1 text-[14px] font-medium leading-snug text-ink">No setup day</p>
                <p className="mt-0.5 text-[12.5px] italic leading-snug text-muted">“Sitting on hands is a position too.”</p>
              </div>
              <button
                type="button"
                disabled={hasTraded}
                onClick={() => void toggleNoSetup()}
                className="mt-1.5 flex w-full items-center justify-between rounded-[14px] px-3.5 py-3 text-left transition-colors hover:bg-ink/[0.05] disabled:cursor-default disabled:opacity-50"
              >
                <span>
                  <span className="block text-[13px] font-medium text-ink">
                    {noSetup ? "No-setup day recorded" : "Choose no-setup day"}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] text-muted">
                    {hasTraded
                      ? "A trade is already logged today"
                      : noSetup
                        ? "Trading locked · tap to re-enable"
                        : "Disables Plan & Add trade for today"}
                  </span>
                </span>
                <span aria-hidden className="text-[18px] text-gold">›</span>
              </button>
              {!hasLimit && !noSetup && (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setLimitOpen(true);
                  }}
                  className="mt-1 flex w-full items-center justify-between rounded-[14px] px-3.5 py-3 text-left transition-colors hover:bg-ink/[0.05]"
                >
                  <span>
                    <span className="block text-[13px] font-medium text-ink">Set daily limit</span>
                    <span className="mt-0.5 block text-[11.5px] text-muted">Available 5:00 AM–6:55 PM IST</span>
                  </span>
                  <span aria-hidden className="text-[18px] text-gold">›</span>
                </button>
              )}
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

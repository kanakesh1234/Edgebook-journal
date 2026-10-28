"use client";

import { useEffect, useMemo, useRef } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { addDays, todayKey } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Sym } from "@/components/journal/symbols";
import { SPRING } from "@/components/journal/journal-ui";
import { addMonths, isoWeek, monthOf, monthTitle, mondayOf, weekLabel } from "@/lib/review/period";
import type { ReviewContext } from "@/lib/review/metrics";
import { cn } from "@/lib/utils";
import { Chip, REVIEW_SMOOTH, Segmented } from "./review-ui";
import { WeeklyReview } from "./weekly-review";
import { MonthlyReview } from "./monthly-review";

export interface ReviewActions {
  openTrade: (id: string) => void;
  openMistake: (key: string) => void;
  openIds: (ids: string[], label: string) => void;
  openWeek?: (monday: string) => void;
}

export type ReviewKindId = "weekly" | "monthly";

/** The period title rolls smoothly in the direction of navigation. */
const roll = {
  enter: (d: number) => ({ opacity: 0, y: d * 16, filter: "blur(3px)" }),
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: (d: number) => ({ opacity: 0, y: -d * 14, filter: "blur(2px)" }),
};

/** Weekly and Monthly review container with a calm Apple-style period navigator. */
export function ReviewsPanel({
  kind,
  onKind,
  week,
  onWeek,
  month,
  onMonth,
  actions,
}: {
  kind: ReviewKindId;
  onKind: (k: ReviewKindId) => void;
  week: string;
  onWeek: (monday: string) => void;
  month: string;
  onMonth: (m: string) => void;
  actions: ReviewActions;
}) {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const dayLogs = useApp((s) => s.dayLogs);
  const today = todayKey();
  const ctx: ReviewContext = useMemo(() => {
    const scoped = scopeToPrimary(settings, entries);
    return { entries: scoped.entries, dayLogs, settings: scoped.settings, challenge: scoped.challenge, today };
  }, [entries, settings, dayLogs, today]);

  const thisMonday = mondayOf(today);
  const thisMonth = monthOf(today);
  const isWeekly = kind === "weekly";
  const atNow = isWeekly ? week === thisMonday : month === thisMonth;
  const current = isWeekly ? week : month;
  const label = isWeekly ? weekLabel(week) : monthTitle(month);
  const sub = isWeekly ? `Week ${isoWeek(week)} of ${week.slice(0, 4)}` : null;
  const guide = isWeekly ? "Friday close check-in" : "Month-end check-in";
  const step = (d: 1 | -1) => {
    haptic.selection();
    if (isWeekly) onWeek(addDays(week, d * 7));
    else onMonth(addMonths(month, d));
  };
  const goNow = () => {
    haptic.selection();
    if (isWeekly) onWeek(thisMonday);
    else onMonth(thisMonth);
  };

  // Direction of travel, so the title rolls the way the trader is stepping.
  const key = `${kind}:${current}`;
  const last = useRef({ key, current, dir: 1 });
  if (last.current.key !== key) {
    last.current = { key, current, dir: current >= last.current.current ? 1 : -1 };
  }
  const dir = last.current.dir;

  // Which recent periods have a written review — shown as green dots on the picker strip.
  const written = useMemo(() => {
    const store = settings.reviews?.[kind] ?? {};
    return new Set(
      Object.entries(store)
        .filter(([, n]) => Object.values(n.text).some((t) => t.trim()) || Object.values(n.lists).some((l) => l.some((t) => t.trim())))
        .map(([k]) => k),
    );
  }, [settings.reviews, kind]);

  const strip = useMemo(
    () => Array.from({ length: isWeekly ? 8 : 6 }, (_, i) => (isWeekly ? addDays(thisMonday, -7 * (7 - i)) : addMonths(thisMonth, -(5 - i)))),
    [isWeekly, thisMonday, thisMonth],
  );
  const inStrip = strip.includes(current);
  const shown = inStrip ? strip : [...strip.slice(1), current].sort();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        step(-1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        step(1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const stripRef = useRef<HTMLElement>(null);
  useEffect(() => {
    stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [key]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto w-full max-w-[960px] pb-10">
        <header className="pb-4 pt-5 sm:pt-7">
          <div className="flex items-center justify-between gap-3">
            <Segmented
              label="Review period"
              value={kind}
              onChange={onKind}
              options={[
                { id: "weekly", label: "Weekly", icon: "calendar" },
                { id: "monthly", label: "Monthly", icon: "chart" },
              ]}
            />
            <Chip className="min-w-0 max-w-[48%] sm:max-w-none">
              <Sym name="target" className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{ctx.challenge ? ctx.challenge.name : "All trades"}</span>
            </Chip>
          </div>

          <div className="mt-5 flex items-start justify-between gap-x-4 sm:items-end">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[32px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[40px]">
                <span className="sr-only">{isWeekly ? "Weekly review, " : "Monthly review, "}</span>
                <span className="relative block overflow-hidden pb-0.5">
                  <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                    <motion.span
                      key={key}
                      custom={dir}
                      variants={roll}
                      initial="enter"
                      animate="center"
                      exit="exit"
                      transition={{ duration: 0.38, ease: REVIEW_SMOOTH }}
                      className="block whitespace-nowrap"
                    >
                      {label}
                    </motion.span>
                  </AnimatePresence>
                </span>
              </h1>
              <p className="mt-1 text-[14px] leading-snug text-muted">
                {sub && (
                  <>
                    <span className="num font-medium text-ink/75">{sub}</span>
                    <span className="mx-2 text-faint" aria-hidden>
                      ·
                    </span>
                  </>
                )}
                {guide}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-1 sm:pb-0.5 sm:pt-0">
              <AnimatePresence initial={false}>
                {!atNow && (
                  <motion.button
                    key="now"
                    type="button"
                    onClick={goNow}
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={SPRING}
                    className="hidden h-9 rounded-full bg-gold/[0.12] px-4 text-[13px] font-medium text-gold-deep outline-none transition-colors hover:bg-gold/[0.2] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95 sm:block dark:text-gold"
                  >
                    {isWeekly ? "This week" : "This month"}
                  </motion.button>
                )}
              </AnimatePresence>
              <div className="inline-flex items-center rounded-full bg-ink/[0.06] p-1">
                {([-1, 1] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-label={`${d < 0 ? "Previous" : "Next"} ${isWeekly ? "week" : "month"}`}
                    title={d < 0 ? "Previous (←)" : "Next (→)"}
                    onClick={() => step(d)}
                    className="grid h-8 w-9 place-items-center rounded-full text-ink/80 outline-none transition-[background-color,transform] hover:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-90 active:bg-ink/[0.12]"
                  >
                    <Sym name={d < 0 ? "chevronLeft" : "chevronRight"} className="h-4 w-4" strokeWidth={2} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <nav ref={stripRef} aria-label="Recent periods" className="-mx-1 mt-4 flex gap-1 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
            {shown.map((k) => {
              const on = k === current;
              return (
                <button
                  key={k}
                  type="button"
                  aria-current={on ? "true" : undefined}
                  onClick={() => {
                    if (!on) haptic.selection();
                    if (isWeekly) onWeek(k);
                    else onMonth(k);
                  }}
                  className={cn(
                    "relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95",
                    on ? "text-ink" : "text-muted hover:text-ink",
                  )}
                >
                  {on && <motion.span layoutId={`period-${kind}`} transition={SPRING} className="absolute inset-0 rounded-full bg-ink/[0.07]" />}
                  <span className="relative">{isWeekly ? weekLabel(k).split(" – ")[0] : monthTitle(k).replace(/ \d{4}$/, "")}</span>
                  {written.has(k) && <span className="relative h-1.5 w-1.5 rounded-full bg-profit" title="Review completed" />}
                </button>
              );
            })}
            {!atNow && (
              <button
                type="button"
                onClick={goNow}
                className="ml-1 flex h-8 shrink-0 items-center rounded-full bg-gold/[0.12] px-3.5 text-[13px] font-medium text-gold-deep outline-none transition-colors active:scale-95 sm:hidden dark:text-gold"
              >
                {isWeekly ? "This week" : "This month"}
              </button>
            )}
          </nav>
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={key}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { duration: 0.14 } }}
            transition={{ duration: 0.36, ease: REVIEW_SMOOTH }}
            className="mt-2"
          >
            {isWeekly ? <WeeklyReview ctx={ctx} monday={week} actions={actions} /> : <MonthlyReview ctx={ctx} month={month} actions={actions} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

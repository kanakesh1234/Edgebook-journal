"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { scopeToChallenge } from "@/lib/challenges";
import { addDays, formatSignedMoney, todayKey } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { Sym } from "@/components/journal/symbols";
import { SPRING } from "@/components/journal/journal-ui";
import { addMonths, isoWeek, monthOf, monthTitle, mondayOf, weekLabel } from "@/lib/review/period";
import type { ReviewContext } from "@/lib/review/metrics";
import { cn } from "@/lib/utils";
import { REVIEW_SMOOTH, Segmented } from "./review-ui";
import { WeeklyReview } from "./weekly-review";
import { MonthlyReview } from "./monthly-review";

export interface ReviewActions {
  openTrade: (id: string) => void;
  openMistake: (key: string) => void;
  openIds: (ids: string[], label: string) => void;
  openWeek?: (monday: string) => void;
}

export type ReviewKindId = "weekly" | "monthly";

const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** The period title rolls smoothly in the direction of navigation. */
const roll = {
  enter: (d: number) => ({ opacity: 0, y: d * 16, filter: "blur(3px)" }),
  center: { opacity: 1, y: 0, filter: "blur(0px)" },
  exit: (d: number) => ({ opacity: 0, y: -d * 14, filter: "blur(2px)" }),
};

const POP_ANIM = {
  initial: { opacity: 0, scale: 0.96, y: -6 },
  animate: { opacity: 1, scale: 1, y: 0 },
  exit: { opacity: 0, scale: 0.96, y: -4 },
  transition: { duration: 0.22, ease: REVIEW_SMOOTH },
} as const;

/** Weekly and Monthly review container with progressive-disclosure Apple period & challenge pickers. */
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

  const challenges = useMemo(() => settings.challenges ?? [], [settings.challenges]);
  const [pickedChallengeId, setPickedChallengeId] = useState<string | null>(null);
  const activeChallengeId = useMemo(() => {
    if (pickedChallengeId === "all") return "all";
    if (pickedChallengeId && challenges.some((c) => c.id === pickedChallengeId)) return pickedChallengeId;
    return settings.primaryChallengeId && challenges.some((c) => c.id === settings.primaryChallengeId)
      ? settings.primaryChallengeId
      : "all";
  }, [pickedChallengeId, challenges, settings.primaryChallengeId]);

  const ctx: ReviewContext = useMemo(() => {
    const scoped = scopeToChallenge(settings, entries, activeChallengeId);
    return { entries: scoped.entries, dayLogs, settings: scoped.settings, challenge: scoped.challenge, today };
  }, [entries, settings, dayLogs, activeChallengeId, today]);

  const thisMonday = mondayOf(today);
  const thisMonth = monthOf(today);
  const isWeekly = kind === "weekly";
  const atNow = isWeekly ? week === thisMonday : month === thisMonth;
  const current = isWeekly ? week : month;
  const label = isWeekly ? weekLabel(week) : monthTitle(month);
  const sub = isWeekly ? `Week ${isoWeek(week)} of ${week.slice(0, 4)}` : null;
  const guide = isWeekly ? "Friday close check-in" : "Month-end check-in";

  const [openMenu, setOpenMenu] = useState<"challenge" | "period" | null>(null);
  const [pickerYear, setPickerYear] = useState(() => Number(month.slice(0, 4)));
  const challengeWrapRef = useRef<HTMLDivElement>(null);
  const periodWrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setPickerYear(Number(month.slice(0, 4)));
  }, [month]);

  useEffect(() => {
    setOpenMenu(null);
  }, [kind]);

  useEffect(() => {
    if (!openMenu) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      if (challengeWrapRef.current?.contains(target) || periodWrapRef.current?.contains(target)) return;
      setOpenMenu(null);
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenMenu(null);
    };
    window.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onEscape);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onEscape);
    };
  }, [openMenu]);

  const step = (d: 1 | -1) => {
    haptic.selection();
    if (isWeekly) onWeek(addDays(week, d * 7));
    else onMonth(addMonths(month, d));
  };
  const goNow = () => {
    haptic.selection();
    setOpenMenu(null);
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

  // Written notes index — shown as quiet dots inside the progressive-disclosure picker only.
  const written = useMemo(() => {
    const store = settings.reviews?.[kind] ?? {};
    return new Set(
      Object.entries(store)
        .filter(([, n]) => Object.values(n.text).some((t) => t.trim()) || Object.values(n.lists).some((l) => l.some((t) => t.trim())))
        .map(([k]) => k),
    );
  }, [settings.reviews, kind]);

  // Period-level summary for each challenge option inside the Challenge selector.
  const challengeSummaries = useMemo(() => {
    const inPeriod = entries.filter((e) =>
      isWeekly ? e.date >= week && e.date <= addDays(week, 6) : e.date.startsWith(month),
    );
    const summarize = (list: typeof inPeriod) => ({
      count: list.length,
      net: list.reduce((s, e) => s + e.pnl, 0),
    });
    return {
      all: summarize(inPeriod),
      byId: new Map(challenges.map((c) => [c.id, summarize(inPeriod.filter((e) => e.challengeId === c.id))])),
    };
  }, [entries, challenges, isWeekly, week, month]);

  // Month trade activity across the inspected picker year.
  const monthStatsInYear = useMemo(() => {
    const map = new Map<string, { count: number; net: number }>();
    const prefix = `${pickerYear}-`;
    for (const e of ctx.entries) {
      if (!e.date.startsWith(prefix)) continue;
      const ym = e.date.slice(0, 7);
      const cur = map.get(ym) ?? { count: 0, net: 0 };
      cur.count += 1;
      cur.net += e.pnl;
      map.set(ym, cur);
    }
    return map;
  }, [ctx.entries, pickerYear]);

  // Recent 8 weeks list (only computed/mounted inside the popover when opened).
  const recentWeeks = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => addDays(thisMonday, -7 * i)).map((m) => {
        const sun = addDays(m, 6);
        const es = ctx.entries.filter((e) => e.date >= m && e.date <= sun);
        return {
          monday: m,
          count: es.length,
          net: es.reduce((s, e) => s + e.pnl, 0),
        };
      }),
    [thisMonday, ctx.entries],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (openMenu) return;
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

  const activeScopeLabel = ctx.challenge ? ctx.challenge.name : "All accounts";

  return (
    <MotionConfig reducedMotion="user">
      <div className="mx-auto w-full max-w-[960px] pb-10">
        <header className="relative z-20 pb-5 pt-5 sm:pt-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Segmented
              label="Review period"
              value={kind}
              onChange={onKind}
              options={[
                { id: "weekly", label: "Weekly", icon: "calendar" },
                { id: "monthly", label: "Monthly", icon: "chart" },
              ]}
            />

            {/* Interactive Challenge Selector Pill */}
            <div ref={challengeWrapRef} className="relative">
              <button
                type="button"
                aria-haspopup="listbox"
                aria-expanded={openMenu === "challenge"}
                onClick={() => {
                  haptic.selection();
                  setOpenMenu((cur) => (cur === "challenge" ? null : "challenge"));
                }}
                className={cn(
                  "inline-flex h-9 max-w-[230px] items-center gap-2 rounded-full border px-3.5 text-[12.5px] font-medium outline-none transition-all active:scale-[0.98] sm:max-w-[280px]",
                  openMenu === "challenge"
                    ? "border-gold-strong/50 bg-gold/[0.12] text-ink shadow-xs"
                    : "border-line/70 bg-well text-ink hover:border-line-strong hover:bg-raised dark:border-line",
                )}
              >
                <Sym name="target" className={cn("h-3.5 w-3.5 shrink-0", ctx.challenge ? "text-gold-deep dark:text-gold" : "text-muted")} />
                <span className="truncate">{activeScopeLabel}</span>
                <Sym
                  name="chevronDown"
                  className={cn("h-3.5 w-3.5 shrink-0 text-muted transition-transform duration-200", openMenu === "challenge" && "rotate-180")}
                />
              </button>

              <AnimatePresence>
                {openMenu === "challenge" && (
                  <motion.div
                    role="listbox"
                    aria-label="Filter review by challenge"
                    {...POP_ANIM}
                    className="absolute right-0 top-[calc(100%+8px)] z-30 w-[290px] origin-top-right overflow-hidden rounded-[22px] border border-line/70 bg-surface/94 p-1.5 shadow-[0_24px_54px_-16px_rgba(0,0,0,0.34)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[0.1] sm:w-[320px]"
                  >
                    <div className="px-3 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">
                      Review scope · {isWeekly ? "Week" : "Month"}
                    </div>

                    {/* All accounts option */}
                    <button
                      type="button"
                      role="option"
                      aria-selected={activeChallengeId === "all"}
                      onClick={() => {
                        haptic.selection();
                        setPickedChallengeId("all");
                        setOpenMenu(null);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 rounded-[15px] px-3 py-2.5 text-left transition-colors",
                        activeChallengeId === "all" ? "bg-ink/[0.07] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-[13px] font-semibold text-ink">All accounts &amp; trades</p>
                        <p className="text-[11px] text-faint">
                          {challengeSummaries.all.count} {challengeSummaries.all.count === 1 ? "trade" : "trades"} this {isWeekly ? "week" : "month"}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {challengeSummaries.all.count > 0 && (
                          <span className={cn("num text-[12px] font-semibold", challengeSummaries.all.net >= 0 ? "text-profit" : "text-loss")}>
                            {formatSignedMoney(challengeSummaries.all.net, settings.currency)}
                          </span>
                        )}
                        {activeChallengeId === "all" && <Sym name="check" className="h-4 w-4 text-gold-deep dark:text-gold" strokeWidth={2.4} />}
                      </div>
                    </button>

                    {challenges.length > 0 && (
                      <div className="my-1 border-t border-line-soft/80" />
                    )}

                    <div className="max-h-[260px] space-y-0.5 overflow-y-auto [scrollbar-width:none]">
                      {challenges.map((c) => {
                        const selected = activeChallengeId === c.id;
                        const summary = challengeSummaries.byId.get(c.id) ?? { count: 0, net: 0 };
                        const isPrimary = settings.primaryChallengeId === c.id;
                        return (
                          <button
                            key={c.id}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            onClick={() => {
                              haptic.selection();
                              setPickedChallengeId(c.id);
                              setOpenMenu(null);
                            }}
                            className={cn(
                              "flex w-full items-center justify-between gap-3 rounded-[15px] px-3 py-2.5 text-left transition-colors",
                              selected ? "bg-ink/[0.07] text-ink" : "text-muted hover:bg-ink/[0.04] hover:text-ink",
                            )}
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                {isPrimary && <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-strong" aria-hidden />}
                                <p className="truncate text-[13px] font-semibold text-ink">{c.name}</p>
                              </div>
                              <p className="truncate text-[11px] text-faint">
                                {summary.count} {summary.count === 1 ? "trade" : "trades"}
                                {c.startingBalance ? ` · ${c.drawdownMode === "dynamic" ? "Trailing" : "Static"}` : ""}
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              {summary.count > 0 && (
                                <span className={cn("num text-[12px] font-semibold", summary.net >= 0 ? "text-profit" : "text-loss")}>
                                  {formatSignedMoney(summary.net, settings.currency)}
                                </span>
                              )}
                              {selected && <Sym name="check" className="h-4 w-4 text-gold-deep dark:text-gold" strokeWidth={2.4} />}
                            </div>
                          </button>
                        );
                      })}

                      {challenges.length === 0 && (
                        <p className="px-3 py-2 text-[11.5px] leading-snug text-faint">
                          No challenges configured yet — add a prop evaluation or funded account in Settings to isolate its review.
                        </p>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </div>

          <div className="mt-5 flex items-start justify-between gap-x-4 sm:items-end">
            {/* Progressive Disclosure Title + Popover Picker (replaces horizontal multi-month strip) */}
            <div ref={periodWrapRef} className="relative min-w-0 flex-1">
              <h1 className="font-display text-[30px] font-semibold leading-[1.08] tracking-[-0.035em] text-ink sm:text-[40px]">
                <span className="sr-only">{isWeekly ? "Weekly review, " : "Monthly review, "}</span>
                <button
                  type="button"
                  aria-expanded={openMenu === "period"}
                  aria-haspopup="dialog"
                  aria-label={isWeekly ? `Choose week, currently ${label}` : `Choose month, currently ${label}`}
                  onClick={() => {
                    haptic.selection();
                    setOpenMenu((cur) => (cur === "period" ? null : "period"));
                  }}
                  className="group -ml-2 inline-flex max-w-full items-center gap-2.5 rounded-[18px] px-2 py-1 text-left outline-none transition-colors hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-[0.99]"
                >
                  <span className="relative block min-w-0 overflow-hidden pb-0.5">
                    <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                      <motion.span
                        key={key}
                        custom={dir}
                        variants={roll}
                        initial="enter"
                        animate="center"
                        exit="exit"
                        transition={{ duration: 0.38, ease: REVIEW_SMOOTH }}
                        className="block truncate whitespace-nowrap"
                      >
                        {label}
                      </motion.span>
                    </AnimatePresence>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      "grid h-7 w-7 shrink-0 place-items-center rounded-full bg-ink/[0.06] text-muted transition-all duration-200 group-hover:bg-ink/[0.1] group-hover:text-ink",
                      openMenu === "period" && "rotate-180 bg-gold/[0.16] text-gold-deep dark:text-gold",
                    )}
                  >
                    <Sym name="chevronDown" className="h-4 w-4" strokeWidth={2} />
                  </span>
                </button>
              </h1>

              <p className="mt-0.5 text-[14px] leading-snug text-muted">
                {sub && (
                  <>
                    <span className="num font-medium text-ink/75">{sub}</span>
                    <span className="mx-2 text-faint" aria-hidden>
                      ·
                    </span>
                  </>
                )}
                {ctx.challenge ? `${ctx.challenge.name} · ` : ""}
                {guide}
              </p>

              {/* Frosted Apple Period Picker Popover — shown ONLY when requested */}
              <AnimatePresence>
                {openMenu === "period" && (
                  <motion.div
                    role="dialog"
                    aria-label={isWeekly ? "Choose week" : "Choose month"}
                    {...POP_ANIM}
                    className="absolute left-0 top-[calc(100%+8px)] z-30 w-[300px] origin-top-left overflow-hidden rounded-[24px] border border-line/70 bg-surface/94 p-3 shadow-[0_24px_60px_-16px_rgba(0,0,0,0.36)] backdrop-blur-2xl backdrop-saturate-150 dark:border-white/[0.1] sm:w-[340px]"
                  >
                    {isWeekly ? (
                      <>
                        <div className="mb-2 flex items-center justify-between px-1">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-faint">Jump to week</span>
                          {!atNow && (
                            <button
                              type="button"
                              onClick={goNow}
                              className="rounded-full bg-gold/[0.14] px-2.5 py-1 text-[11px] font-semibold text-gold-deep hover:bg-gold/[0.22] dark:text-gold"
                            >
                              This week
                            </button>
                          )}
                        </div>
                        <div className="max-h-[280px] space-y-1 overflow-y-auto [scrollbar-width:none]">
                          {recentWeeks.map((w) => {
                            const selected = w.monday === week;
                            const currentNow = w.monday === thisMonday;
                            const hasNote = written.has(w.monday);
                            return (
                              <button
                                key={w.monday}
                                type="button"
                                onClick={() => {
                                  haptic.selection();
                                  onWeek(w.monday);
                                  setOpenMenu(null);
                                }}
                                className={cn(
                                  "flex w-full items-center justify-between gap-2 rounded-[14px] px-3 py-2 text-left transition-colors",
                                  selected ? "bg-ink text-surface shadow-xs" : "hover:bg-ink/[0.05] text-ink",
                                )}
                              >
                                <div className="min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-[13px] font-medium">{weekLabel(w.monday)}</span>
                                    {hasNote && (
                                      <span
                                        className={cn("h-1.5 w-1.5 rounded-full", selected ? "bg-surface/80" : "bg-profit")}
                                        title="Notes written"
                                      />
                                    )}
                                  </div>
                                  <span className={cn("text-[11px]", selected ? "text-surface/75" : "text-faint")}>
                                    {currentNow ? "This week" : `Week ${isoWeek(w.monday)}`} · {w.count} {w.count === 1 ? "trade" : "trades"}
                                  </span>
                                </div>
                                {w.count > 0 && (
                                  <span
                                    className={cn(
                                      "num shrink-0 text-[12px] font-semibold",
                                      selected ? "text-surface" : w.net >= 0 ? "text-profit" : "text-loss",
                                    )}
                                  >
                                    {formatSignedMoney(w.net, settings.currency)}
                                  </span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="mb-2.5 flex items-center justify-between px-1">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              aria-label="Previous year"
                              onClick={() => {
                                haptic.selection();
                                setPickerYear((y) => y - 1);
                              }}
                              className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink"
                            >
                              <Sym name="chevronLeft" className="h-3.5 w-3.5" />
                            </button>
                            <span className="num px-1 text-[13.5px] font-semibold text-ink">{pickerYear}</span>
                            <button
                              type="button"
                              aria-label="Next year"
                              onClick={() => {
                                haptic.selection();
                                setPickerYear((y) => y + 1);
                              }}
                              className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-ink/[0.06] hover:text-ink"
                            >
                              <Sym name="chevronRight" className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          {!atNow && (
                            <button
                              type="button"
                              onClick={goNow}
                              className="rounded-full bg-gold/[0.14] px-2.5 py-1 text-[11px] font-semibold text-gold-deep hover:bg-gold/[0.22] dark:text-gold"
                            >
                              This month
                            </button>
                          )}
                        </div>

                        <div className="grid grid-cols-3 gap-1.5">
                          {MONTHS_SHORT.map((shortName, idx0) => {
                            const ym = `${pickerYear}-${String(idx0 + 1).padStart(2, "0")}`;
                            const selected = ym === month;
                            const currentNow = ym === thisMonth;
                            const stat = monthStatsInYear.get(ym);
                            const hasNote = written.has(ym);
                            return (
                              <button
                                key={ym}
                                type="button"
                                aria-current={selected ? "true" : undefined}
                                onClick={() => {
                                  haptic.selection();
                                  onMonth(ym);
                                  setOpenMenu(null);
                                }}
                                className={cn(
                                  "relative flex flex-col items-start rounded-[14px] px-3 py-2.5 text-left transition-all active:scale-[0.97]",
                                  selected
                                    ? "bg-ink text-surface shadow-sm"
                                    : currentNow
                                      ? "bg-gold/[0.12] text-ink ring-1 ring-gold-strong/30 hover:bg-gold/[0.18]"
                                      : "bg-well/70 text-ink hover:bg-ink/[0.06]",
                                )}
                              >
                                <div className="flex w-full items-center justify-between gap-1">
                                  <span className="text-[13px] font-semibold">{shortName}</span>
                                  {hasNote && (
                                    <span
                                      className={cn("h-1.5 w-1.5 rounded-full", selected ? "bg-surface/80" : "bg-profit")}
                                      title="Review notes saved"
                                    />
                                  )}
                                </div>
                                <span
                                  className={cn(
                                    "num mt-0.5 text-[10.5px] font-medium",
                                    selected
                                      ? "text-surface/80"
                                      : stat?.count
                                        ? stat.net >= 0
                                          ? "text-profit"
                                          : "text-loss"
                                        : "text-faint/70",
                                  )}
                                >
                                  {stat?.count ? formatSignedMoney(stat.net, settings.currency, { compact: true }) : "—"}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
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
        </header>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={kind}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.24, ease: REVIEW_SMOOTH }}
            className="pt-4 sm:pt-5"
          >
            {isWeekly ? <WeeklyReview ctx={ctx} monday={week} actions={actions} /> : <MonthlyReview ctx={ctx} month={month} actions={actions} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, MotionConfig, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { addDays, todayKey } from "@/lib/format";
import { Sym } from "@/components/journal/symbols";
import { EASE, SPRING } from "@/components/journal/journal-ui";
import { addMonths, isoWeek, monthOf, monthTitle, mondayOf, weekLabel } from "@/lib/review/period";
import type { ReviewContext } from "@/lib/review/metrics";
import { cn } from "@/lib/utils";
import { Chip, MONTHLY_SECTIONS, Segmented, WEEKLY_SECTIONS, type SectionDef } from "./review-ui";
import { WeeklyReview } from "./weekly-review";
import { MonthlyReview } from "./monthly-review";

export interface ReviewActions {
  openTrade: (id: string) => void;
  openMistake: (key: string) => void;
  openIds: (ids: string[], label: string) => void;
  openWeek?: (monday: string) => void;
}

export type ReviewKindId = "weekly" | "monthly";

/** The period title rolls up for "next", down for "previous". */
const roll = {
  enter: (d: number) => ({ opacity: 0, y: d * 20 }),
  center: { opacity: 1, y: 0 },
  exit: (d: number) => ({ opacity: 0, y: -d * 20 }),
};

/** Weekly (Part A) and Monthly (Part B) review, with one period navigator on top. */
export function ReviewsPanel({ kind, onKind, week, onWeek, month, onMonth, actions }: {
  kind: ReviewKindId; onKind: (k: ReviewKindId) => void; week: string; onWeek: (monday: string) => void; month: string; onMonth: (m: string) => void; actions: ReviewActions;
}) {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const dayLogs = useApp((s) => s.dayLogs);
  const today = todayKey();
  const ctx: ReviewContext = useMemo(() => {
    const scoped = scopeToPrimary(settings, entries);
    return { entries: scoped.entries, dayLogs, settings: scoped.settings, challenge: scoped.challenge, today };
  }, [entries, settings, dayLogs, today]);

  const thisMonday = mondayOf(today), thisMonth = monthOf(today);
  const isWeekly = kind === "weekly";
  const atNow = isWeekly ? week === thisMonday : month === thisMonth;
  const current = isWeekly ? week : month;
  const label = isWeekly ? weekLabel(week) : monthTitle(month);
  const sub = isWeekly ? `Week ${isoWeek(week)} of ${week.slice(0, 4)}` : null;
  const guide = isWeekly ? "Complete every Friday after the session closes." : "Complete on the last trading day of the month.";
  const step = (d: 1 | -1) => (isWeekly ? onWeek(addDays(week, d * 7)) : onMonth(addMonths(month, d)));
  const goNow = () => (isWeekly ? onWeek(thisMonday) : onMonth(thisMonth));

  // Direction of travel, so the title rolls the way the person is going.
  const key = `${kind}:${current}`;
  const last = useRef({ key, current, dir: 1 });
  if (last.current.key !== key) { last.current = { key, current, dir: current >= last.current.current ? 1 : -1 }; }
  const dir = last.current.dir;

  // Which recent periods have a written review — shown as dots on the picker strip.
  const written = useMemo(() => {
    const store = settings.reviews?.[kind] ?? {};
    return new Set(Object.entries(store).filter(([, n]) => Object.values(n.text).some((t) => t.trim()) || Object.values(n.lists).some((l) => l.some((t) => t.trim()))).map(([k]) => k));
  }, [settings.reviews, kind]);
  const strip = useMemo(() => Array.from({ length: isWeekly ? 8 : 6 }, (_, i) => (isWeekly ? addDays(thisMonday, -7 * (7 - i)) : addMonths(thisMonth, -(5 - i)))), [isWeekly, thisMonday, thisMonth]);
  const inStrip = strip.includes(current);
  const shown = inStrip ? strip : [...strip.slice(1), current].sort();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); step(-1); } else if (e.key === "ArrowRight") { e.preventDefault(); step(1); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const body = useRef<HTMLDivElement>(null);
  const stripRef = useRef<HTMLElement>(null);
  useEffect(() => { stripRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" }); }, [key]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="pb-6">
        <header className="pb-1 pt-6 sm:pt-8">
          <div className="flex items-center justify-between gap-3">
            <Segmented label="Review period" value={kind} onChange={onKind} options={[{ id: "weekly", label: "Weekly", icon: "calendar" }, { id: "monthly", label: "Monthly", icon: "chart" }]} />
            <Chip className="min-w-0 max-w-[48%] sm:max-w-none"><Sym name="target" className="h-3.5 w-3.5 shrink-0" /><span className="truncate">{ctx.challenge ? ctx.challenge.name : "All trades"}</span></Chip>
          </div>

          <div className="mt-6 flex items-start justify-between gap-x-4 sm:items-end">
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[36px] font-semibold leading-[1.05] tracking-[-0.04em] text-ink sm:text-[46px]">
                <span className="sr-only">{isWeekly ? "Weekly review, " : "Monthly review, "}</span>
                <span className="relative block overflow-hidden pb-1">
                  <AnimatePresence mode="popLayout" initial={false} custom={dir}>
                    <motion.span key={key} custom={dir} variants={roll} initial="enter" animate="center" exit="exit" transition={{ duration: 0.34, ease: EASE }} className="block whitespace-nowrap">{label}</motion.span>
                  </AnimatePresence>
                </span>
              </h1>
              <p className="mt-1.5 text-[15px] leading-snug text-muted">{sub && <><span className="num font-medium text-ink/70">{sub}</span><span className="mx-2 text-faint" aria-hidden>·</span></>}{guide}</p>
            </div>

            <div className="flex shrink-0 items-center gap-2 pt-1.5 sm:pb-1 sm:pt-0">
              <AnimatePresence initial={false}>
                {!atNow && (
                  <motion.button key="now" type="button" onClick={goNow} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.9 }} transition={SPRING}
                    className="hidden h-9 rounded-full bg-gold/[0.12] px-4 text-[13.5px] font-medium sm:block text-gold-deep outline-none transition-colors hover:bg-gold/[0.2] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95 dark:text-gold">
                    {isWeekly ? "This week" : "This month"}
                  </motion.button>
                )}
              </AnimatePresence>
              <div className="inline-flex items-center rounded-full bg-ink/[0.06] p-[3px]">
                {([-1, 1] as const).map((d) => (
                  <button key={d} type="button" aria-label={`${d < 0 ? "Previous" : "Next"} ${isWeekly ? "week" : "month"}`} title={d < 0 ? "Previous (←)" : "Next (→)"} onClick={() => step(d)}
                    className="grid h-[34px] w-[38px] place-items-center rounded-full text-ink/80 outline-none transition-[background-color,transform] hover:bg-ink/[0.07] focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-90 active:bg-ink/[0.12]">
                    <Sym name={d < 0 ? "chevronLeft" : "chevronRight"} className="h-[17px] w-[17px]" strokeWidth={2} />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <nav ref={stripRef} aria-label="Recent periods" className="-mx-1 mt-5 flex gap-0.5 overflow-x-auto px-1 py-1 [scrollbar-width:none]">
            {shown.map((k) => {
              const on = k === current;
              return (
                <button key={k} type="button" aria-current={on ? "true" : undefined} onClick={() => (isWeekly ? onWeek(k) : onMonth(k))}
                  className={cn("relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95", on ? "text-ink" : "text-muted hover:text-ink")}>
                  {on && <motion.span layoutId={`period-${kind}`} transition={SPRING} className="absolute inset-0 rounded-full bg-ink/[0.07]" />}
                  <span className="relative">{isWeekly ? weekLabel(k).split(" – ")[0] : monthTitle(k).replace(/ \d{4}$/, "")}</span>
                  {written.has(k) && <span className="relative h-1.5 w-1.5 rounded-full bg-profit" title="Review written" />}
                </button>
              );
            })}
            {!atNow && <button type="button" onClick={goNow} className="ml-1 flex h-8 shrink-0 items-center rounded-full bg-gold/[0.12] px-3.5 text-[13px] font-medium text-gold-deep outline-none transition-colors active:scale-95 sm:hidden dark:text-gold">{isWeekly ? "This week" : "This month"}</button>}
          </nav>
        </header>

        <SectionIndex key={kind} sections={isWeekly ? WEEKLY_SECTIONS : MONTHLY_SECTIONS} watch={body} resetKey={key} />

        <AnimatePresence mode="wait" initial={false}>
          <motion.div ref={body} key={key} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.1 } }} transition={{ duration: 0.3, ease: EASE }} className="mt-5">
            {isWeekly ? <WeeklyReview ctx={ctx} monday={week} actions={actions} /> : <MonthlyReview ctx={ctx} month={month} actions={actions} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}

/**
 * A floating index of the review's sections. It follows the reader (the one place a material is used),
 * highlights where they are, and jumps on tap. Hidden while there's nothing to jump to (e.g. a week that hasn't started).
 */
function SectionIndex({ sections, watch, resetKey }: { sections: SectionDef[]; watch: React.RefObject<HTMLDivElement | null>; resetKey: string }) {
  const [present, setPresent] = useState<string[]>([]);
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string | null>(null);
  const rail = useRef<HTMLDivElement>(null);

  // Which sections actually rendered (the body swaps asynchronously when the period changes).
  useEffect(() => {
    const root = watch.current;
    let raf = 0;
    const measure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const have = sections.filter((s) => document.getElementById(s.id)).map((s) => s.id);
        setPresent((p) => (p.length === have.length && p.every((v, i) => v === have[i]) ? p : have));
      });
    };
    measure();
    const mo = new MutationObserver(measure);
    if (root?.parentElement) mo.observe(root.parentElement, { childList: true });
    const t = window.setTimeout(measure, 450);
    return () => { cancelAnimationFrame(raf); mo.disconnect(); window.clearTimeout(t); };
  }, [sections, watch, resetKey]);

  // Scroll-spy: the last section whose top has crossed the reading line.
  useEffect(() => {
    if (!present.length) { setActive(null); return; }
    let raf = 0;
    const spy = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = 176;
        let cur = present[0];
        for (const id of present) { const el = document.getElementById(id); if (el && el.getBoundingClientRect().top <= line) cur = id; }
        const nearBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
        setActive(nearBottom ? present[present.length - 1] : cur);
        setStuck((sentinel.current?.getBoundingClientRect().top ?? 1) < 56);
      });
    };
    spy();
    window.addEventListener("scroll", spy, { passive: true });
    window.addEventListener("resize", spy);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("scroll", spy); window.removeEventListener("resize", spy); };
  }, [present]);

  // Keep the active pill in view inside the (horizontally scrolling) rail.
  useEffect(() => {
    const el = rail.current?.querySelector<HTMLElement>('[aria-current="true"]');
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  // Appears once the header has scrolled away — before that, the content itself is the index.
  const reduce = typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const show = stuck;
  return (
    <>
    <div ref={sentinel} aria-hidden className="h-px" />
    {present.length > 0 && <nav aria-label="Sections" aria-hidden={!show} className="pointer-events-none sticky z-20 h-0" style={{ top: "calc(var(--tb, 49px) + 10px)" }}>
      <motion.div ref={rail} initial={false} animate={show ? { opacity: 1, y: 0, scale: 1 } : { opacity: 0, y: -10, scale: 0.97 }} transition={SPRING} style={{ pointerEvents: show ? "auto" : "none" }} className="absolute left-0 top-0 flex max-w-full gap-0.5 overflow-x-auto rounded-full bg-surface/80 p-1 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.28),0_0_0_0.5px_rgb(0_0_0/0.1)] backdrop-blur-2xl [scrollbar-width:none] dark:shadow-[0_8px_30px_-12px_rgb(0_0_0/0.6),0_0_0_0.5px_rgb(255_255_255/0.1)]">
        {sections.filter((s) => present.includes(s.id)).map((s) => {
          const on = s.id === active;
          return (
            <button key={s.id} type="button" tabIndex={show ? 0 : -1} aria-current={on ? "true" : undefined} onClick={() => document.getElementById(s.id)?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" })}
              className={cn("relative flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50 active:scale-95", on ? "text-ink" : "text-muted hover:text-ink")}>
              {on && <motion.span layoutId="section-pill" transition={SPRING} className="absolute inset-0 rounded-full bg-ink/[0.08]" />}
              <Sym name={s.icon} className={cn("relative h-[15px] w-[15px] transition-colors", on && "text-gold")} />
              <span className="relative">{s.label}</span>
            </button>
          );
        })}
      </motion.div>
    </nav>}
    </>
  );
}

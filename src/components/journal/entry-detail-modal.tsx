"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { checklistItems, checklistScore, reviewStatusOf, type JournalEntry } from "@/lib/types";
import { formatDateFull, formatDateMedium, formatSignedMoney, relativeDayLabel } from "@/lib/format";
import { feelingFromReview, feelingOf as feelingByKey } from "@/lib/feelings";
import { mistakeOf as bucketOf, mistakeTagsOf } from "@/lib/mistakes";
import { dayRisk } from "@/lib/risk";
import { reviewPlanForEntry } from "@/lib/plan-review";
import { RiskMeter } from "./risk-meter";
import { useImageUrls } from "@/lib/hooks";
import { Lightbox } from "@/components/ui/lightbox";
import { TradeReviewFlow } from "./trade-review-flow";
import { Sym } from "./symbols";
import { IconButton, SPRING } from "./journal-ui";
import { buildReviewGroups, type ReviewGroup } from "./review-model";
import { useApp } from "@/lib/store";
import { toast } from "@/components/ui/toast";
import { fmtShort } from "@/components/lessons/format";
import { statusOf, useReadProgress } from "@/components/lessons/progress";
import { useLessonIndex } from "@/components/lessons/use-lesson-index";
import { LessonPeek, LessonPicker, LessonThumb } from "./lesson-links";
import { useReplayTrade } from "./replay-trade";
import { EntryTags } from "./tag-panel";
import { PlanVsTrade } from "./plan-vs-trade";
import { cn } from "@/lib/utils";

const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted");
type Tab = "overview" | "review" | "checklist";
type Replay = ReturnType<typeof useReplayTrade>;

/**
 * Trade sheet — calm, photo-viewer layout.
 * Left: the chart, nothing else. Right: the result, the numbers, one verdict. Everything secondary is one tap away.
 * AI never appears here: tagging runs silently in the background (see tag-panel.tsx) and only its result is shown.
 */
export function EntryDetailModal({
  open, onClose, entry, onEdit, onDelete, position, onStep,
}: {
  position?: { index: number; total: number };
  /** Step through the list the trade was opened from (1 = next in the visible order). */
  onStep?: (dir: 1 | -1) => void;
  open: boolean;
  onClose: () => void;
  entry: JournalEntry | null;
  onEdit?: (entry: JournalEntry) => void;
  onDelete?: (entry: JournalEntry) => void;
}) {
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [reflecting, setReflecting] = useState(false);
  /** Lesson sheets stack on top of the trade sheet (it stays visible underneath, like iOS). */
  const [lessonSheet, setLessonSheet] = useState<{ kind: "pick" } | { kind: "peek"; id: string } | null>(null);
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("overview"); // lives here so stepping through trades keeps your place
  const urls = useImageUrls(entry?.images.map((i) => i.id) ?? []);
  const visible = open && !!entry;
  const covered = !!zoomed || reflecting; // the lightbox / reflection flow take over the screen
  useEffect(() => setMounted(true), []);
  useEffect(() => { if (!visible) setLessonSheet(null); }, [visible]);
  const blocked = covered || !!lessonSheet;
  const replay = useReplayTrade(entry);

  useEffect(() => {
    if (!visible) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    const h = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || blocked) return;
      if (e.key === "Escape") onClose();
      if (onStep && e.key === "ArrowRight") onStep(1);
      if (onStep && e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [visible, onStep, onClose, blocked]);

  const hasImg = !!entry && entry.images.length > 0;
  const stepper = !!position && !!onStep && position.total > 1;

  const sheet = (
    <AnimatePresence>
      {visible && entry && (
        <motion.div
          key="sheet" role="dialog" aria-modal="true" aria-label="Trade"
          initial={{ opacity: 0 }} animate={{ opacity: covered ? 0 : 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.18 }}
          className={cn("fixed inset-0 z-50 grid place-items-center p-3 sm:p-8", covered && "pointer-events-none")}
        >
          <div onClick={onClose} className="absolute inset-0 bg-black/25 backdrop-blur-[14px] backdrop-saturate-150" />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14 } }}
            transition={SPRING}
            className={cn(
              "relative flex max-h-full w-full flex-col overflow-hidden rounded-[28px] bg-surface shadow-[0_56px_140px_-30px_rgb(0_0_0/0.5),0_14px_36px_-16px_rgb(0_0_0/0.2),0_0_0_0.5px_rgb(0_0_0/0.14)] dark:shadow-[0_56px_140px_-30px_rgb(0_0_0/0.8),0_0_0_0.5px_rgb(255_255_255/0.12)]",
              hasImg ? "h-[min(88dvh,840px)] max-w-[1200px]" : "max-w-[560px]",
            )}
          >
            {/* Toolbar — floats over the content so the sheet has no heavy header bar */}
            <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex h-14 items-center justify-between px-3">
              <div className="pointer-events-auto flex items-center gap-0.5">
                {stepper && (
                  <>
                    <IconButton label="Previous trade" icon="chevronLeft" disabled={position.index === 0} onClick={() => onStep(-1)} />
                    <IconButton label="Next trade" icon="chevronRight" disabled={position.index >= position.total - 1} onClick={() => onStep(1)} />
                    <span className="num ml-2 text-[12.5px] text-faint">{position.index + 1} / {position.total}</span>
                  </>
                )}
              </div>
              <div className="pointer-events-auto flex items-center gap-0.5">
                <IconButton label={replay.plan?.ok ? "Replay" : "Replay unavailable"} icon="play" disabled={!replay.plan?.ok || replay.busy} onClick={replay.start} />
                {onEdit && <IconButton label="Edit" icon="pencil" onClick={() => onEdit(entry)} />}
                {onDelete && <IconButton label="Delete" icon="trash" onClick={() => onDelete(entry)} className="hover:!bg-loss/10 hover:!text-loss" />}
                <IconButton label="Close" icon="xmark" onClick={onClose} className="ml-1 bg-ink/[0.06]" />
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={entry.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ type: "spring", stiffness: 420, damping: 38 }}
                className={cn("min-h-0 flex-1 overflow-y-auto lg:overflow-hidden", hasImg && "lg:grid lg:grid-cols-[minmax(0,1.55fr)_minmax(400px,1fr)] lg:grid-rows-[minmax(0,1fr)]")}
              >
                {hasImg && <Stage entry={entry} urls={urls} onZoom={setZoomed} />}
                <Story
                  entry={entry} tab={tab} onTab={setTab} scroll={hasImg} replay={replay} canEdit={!!onEdit}
                  onReflect={() => setReflecting(true)}
                  onPickLesson={() => setLessonSheet({ kind: "pick" })} onPeekLesson={(id) => setLessonSheet({ kind: "peek", id })}
                />
              </motion.div>
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {mounted && createPortal(sheet, document.body)}
      <Lightbox src={zoomed} onClose={() => setZoomed(null)} alt="Trade screenshot" />
      <TradeReviewFlow open={reflecting && !!entry} entry={entry} onClose={() => setReflecting(false)} />
      <LessonPicker open={lessonSheet?.kind === "pick" && !!entry} entry={entry} onClose={() => setLessonSheet(null)} />
      <LessonPeek
        id={lessonSheet?.kind === "peek" ? lessonSheet.id : null} onClose={() => setLessonSheet(null)}
        onUnlink={onEdit && entry ? (id) => { setLessonSheet(null); void unlinkLesson(entry, id); } : undefined}
      />
    </>
  );
}

/* ───────────── Left: the chart, on a quiet matte ───────────── */
const glass = "bg-surface/80 text-ink shadow-[0_1px_4px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.08)] backdrop-blur-xl hover:bg-surface/95 dark:shadow-[0_1px_4px_rgb(0_0_0/0.5),0_0_0_0.5px_rgb(255_255_255/0.14)]";
function Stage({ entry, urls, onZoom }: { entry: JournalEntry; urls: Record<string, string | null>; onZoom: (url: string) => void }) {
  const [active, setActive] = useState(0);
  const n = entry.images.length;
  const i = Math.min(active, n - 1);
  const img = entry.images[i];
  const url = img ? urls[img.id] : null;
  const go = (d: 1 | -1) => setActive((a) => (Math.min(a, n - 1) + d + n) % n);
  const reveal = "opacity-0 transition-[opacity,transform] duration-200 focus-visible:opacity-100 group-hover/stage:opacity-100 [@media(hover:none)]:opacity-100";
  return (
    <section aria-label="Chart" className="group/stage relative aspect-[16/10] overflow-hidden bg-ink/[0.025] lg:aspect-auto">
      <button
        type="button" onClick={() => url && onZoom(url)} disabled={!url} aria-label="Enlarge chart"
        className="absolute inset-0 flex cursor-zoom-in items-center justify-center p-5 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-strong/60 sm:p-8"
      >
        {url ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={img.id} src={url} alt={img.name} draggable={false}
              initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="max-h-full max-w-full rounded-[14px] object-contain shadow-[0_18px_44px_-18px_rgb(0_0_0/0.35),0_0_0_0.5px_rgb(0_0_0/0.08)]"
            />
          </AnimatePresence>
        ) : (
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-ink/15 border-t-ink/60" />
        )}
      </button>

      {n > 1 && (
        <>
          {([-1, 1] as const).map((d) => (
            <button
              key={d} type="button" onClick={() => go(d)} aria-label={d === 1 ? "Next chart" : "Previous chart"}
              className={cn("absolute top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-gold-strong/60", glass, reveal, d === 1 ? "right-4" : "left-4")}
            >
              <Sym name={d === 1 ? "chevronRight" : "chevronLeft"} className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          ))}
          <div className={cn("absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-2", glass)} role="tablist" aria-label="Charts">
            {entry.images.map((im, k) => (
              <button
                key={im.id} type="button" role="tab" aria-selected={k === i} aria-label={`Chart ${k + 1}`} onClick={() => setActive(k)}
                className={cn("h-1.5 rounded-full bg-ink transition-all duration-300", k === i ? "w-4" : "w-1.5 opacity-30 hover:opacity-60")}
              />
            ))}
          </div>
        </>
      )}
      {url && (
        <button type="button" onClick={() => onZoom(url)} aria-label="Full screen" className={cn("absolute bottom-3.5 right-3.5 z-20 grid h-9 w-9 place-items-center rounded-full outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-gold-strong/60", glass, reveal)}>
          <Sym name="expand" className="h-4 w-4" />
        </button>
      )}
    </section>
  );
}

/* ───────────── Building blocks ───────────── */
function GroupHeader({ title, aside }: { title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex min-h-7 items-center gap-2 px-1">
      <h3 className="flex-1 text-[13px] font-medium text-muted">{title}</h3>
      {aside}
    </div>
  );
}

/** Quiet grouped surface. Rows are separated by an inset hairline, like iOS Settings. */
function Inset({ children, lead }: { children: React.ReactNode; lead?: boolean | "thumb" }) {
  return (
    <div className={cn(
      "overflow-hidden rounded-[18px] bg-ink/[0.035] [&>*]:relative [&>*]:after:absolute [&>*]:after:bottom-0 [&>*]:after:right-0 [&>*]:after:h-px [&>*]:after:bg-ink/[0.06] [&>*:last-child]:after:hidden",
      lead === "thumb" ? "[&>*]:after:left-[64px]" : lead ? "[&>*]:after:left-[54px]" : "[&>*]:after:left-4",
    )}>
      {children}
    </div>
  );
}

const textBtn = "-mr-2 flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium text-gold outline-none transition-[background-color,transform] hover:bg-gold/10 active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50";

function Yes({ ok, bad }: { ok: boolean; bad?: boolean }) {
  const good = bad ? !ok : ok;
  return <span className={cn("text-[14.5px] font-medium", good ? "text-profit" : "text-loss")}>{ok ? "Yes" : "No"}</span>;
}

function ReviewGroupView({ g, i = 0 }: { g: ReviewGroup; i?: number }) {
  return (
    <motion.section
      aria-label={g.title}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34, delay: Math.min(i * 0.05, 0.2) }}
    >
      <GroupHeader title={g.title} />
      <Inset>
        {g.rows.map((r, k) =>
          r.long && typeof r.value === "string" ? (
            <div key={k} className="px-4 py-3.5">
              <p className="text-[12.5px] text-faint">{r.label}</p>
              <p className="mt-1 whitespace-pre-line text-[15px] leading-[1.55] tracking-[-0.005em] text-ink">{r.value}</p>
            </div>
          ) : (
            <div key={k} className="flex min-h-[44px] items-center justify-between gap-6 px-4 py-2">
              <p className="text-[14.5px] text-ink">{r.label}</p>
              {typeof r.value === "boolean" ? (
                <Yes ok={r.value} bad={BADSET.has(r.label)} />
              ) : (
                <p className={cn("text-right text-[14.5px]", r.label === "Process verdict" ? (/fail/i.test(r.value) ? "font-medium text-loss" : "font-medium text-profit") : "text-muted")}>{r.value}</p>
              )}
            </div>
          ),
        )}
      </Inset>
    </motion.section>
  );
}
const BADSET = new Set(["FOMO", "Revenge", "Fear of exiting", "Make-it-back"]);

function Segmented({ tabs, value, onChange }: { tabs: { id: Tab; label: string }[]; value: Tab; onChange: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Trade sections" className="grid h-9 auto-cols-fr grid-flow-col rounded-[11px] bg-ink/[0.06] p-[3px]">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            className={cn("relative rounded-[8px] text-[13.5px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50", on ? "text-ink" : "text-muted hover:text-ink")}
          >
            {on && <motion.span layoutId="detail-tab" transition={SPRING} className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.06)]" />}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** One tap to open, nothing in the way until then. */
function Disclosure({ label, value, children }: { label: string; value?: React.ReactNode; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="overflow-hidden rounded-[18px] bg-ink/[0.035]">
      <button
        type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex h-[52px] w-full items-center gap-3 px-4 text-left outline-none transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-strong/50"
      >
        <span className="flex-1 text-[15px] font-medium text-ink">{label}</span>
        {value}
        <Sym name="chevronDown" className={cn("h-4 w-4 text-faint transition-transform duration-200", open && "rotate-180")} strokeWidth={2.2} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────── What the trader actually answered ───────────── */
type Tone = "good" | "bad" | "warn" | "plain";
type Answer = { title: string; value: string; tone: Tone; meter?: number };
const MISTAKES: Record<string, string> = { none: "No mistake", early: "Entered early", chased: "Chased price", stop: "Moved stop", size: "Oversized", plan: "Broke plan", revenge: "Revenge trade", overtrade: "Overtraded" };
const SEVERITY = [
  { label: "Slip", bar: "bg-gold" },
  { label: "Costly", bar: "bg-loss/80" },
  { label: "Blunder", bar: "bg-loss" },
] as const;
const TONE: Record<Tone, string> = { good: "text-profit", bad: "text-loss", warn: "text-gold", plain: "text-muted" };
/** Labels of fields the answers above already cover (or derive) — hidden from "More". */
const HANDLED = new Set([
  "Followed plan", "Good trade despite loss", "Bad trade despite win", "Process verdict", "Followed setup", "Respected risk", "Followed stop",
  "Drive", "FOMO", "Revenge", "Fear of exiting", "Make-it-back", "Biggest mistake", "Mistake", "Mistake note", "Mistake other", "Blunder level",
  "Felt after", "Emotion after", "Mistake category", "Category source", "Category confidence",
  "Next time", "Went well", "Didn’t go well", "Cause",
]);

function feelingOf(e: JournalEntry): { label: string; tone: Tone } | null {
  const p = e.review?.psychology;
  if (!p) return null;
  const k = feelingFromReview(p);
  const f = k ? feelingByKey(k) : null;
  if (f) return { label: f.label, tone: f.tone === "good" ? "good" : f.tone === "risk" ? "bad" : "plain" };
  if (p.makeItBack) return { label: "Make-it-back", tone: "bad" };
  return null;
}
function mistakeOf(e: JournalEntry): { label: string; none: boolean } | null {
  const f = e.review?.followUp;
  if (!f?.mistake) return null;
  const label = f.mistake === "other" ? f.mistakeOther?.trim() || "Other" : MISTAKES[f.mistake] ?? f.mistake;
  return { label, none: f.mistake === "none" };
}
function buildAnswers(e: JournalEntry): Answer[] {
  const r = e.review;
  const out: Answer[] = [];
  const plan = r?.outcome?.followedPlan;
  if (plan != null) out.push({ title: "Plan", value: plan ? "Followed" : "Not followed", tone: plan ? "good" : "bad" });
  const feel = feelingOf(e);
  if (feel) out.push({ title: "Feeling", value: feel.label, tone: feel.tone });
  const v = r?.outcome?.processVerdict;
  if (v) { const bad = v === "process-failure"; out.push({ title: "Process", value: bad ? "Needs work" : "Good", tone: bad ? "bad" : "good" }); }
  const m = mistakeOf(e);
  if (m) out.push({ title: "Mistake", value: m.label.length > 40 ? "Written in" : m.label, tone: m.none ? "good" : "bad" });
  // Free-text mistakes are filed under a category in the background. We show the result only — never who made it.
  const bucket = bucketOf(e);
  if (m && !m.none && bucket && !bucket.pending && r?.followUp?.mistake === "other") out.push({ title: "Category", value: bucket.label, tone: "plain" });
  const lvl = Number(r?.followUp?.blunderLevel ?? 0);
  if (m && !m.none && lvl >= 1 && lvl <= 3) out.push({ title: "Severity", value: SEVERITY[lvl - 1].label, tone: lvl === 1 ? "warn" : "bad", meter: lvl });
  return out;
}
function buildProse(e: JournalEntry): { label: string; text: string }[] {
  const items: { label: string; text: string }[] = [];
  const add = (label: string, t?: string | null) => { if (t && t.trim()) items.push({ label, text: t.trim() }); };
  add("What went wrong", e.review?.followUp?.mistakeNote);
  add("Went well", e.reflection?.wentWell);
  add("Didn’t go well", e.reflection?.wentPoorly);
  add("What caused it", e.reflection?.cause);
  return items;
}

/** The same label must never appear twice ("Broke plan" came from both the plan answer and the mistake tag). */
function dedupe<T extends { label: string }>(list: T[]): T[] {
  const seen = new Set<string>();
  return list.filter((c) => { const k = c.label.trim().toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
}

function Meter({ level }: { level: number }) {
  return (
    <span aria-hidden className="flex items-center gap-0.5">
      {[1, 2, 3].map((n) => <span key={n} className={cn("h-1.5 w-3.5 rounded-full", n <= level ? SEVERITY[level - 1].bar : "bg-ink/[0.12]")} />)}
    </span>
  );
}

function AnswerList({ items }: { items: Answer[] }) {
  return (
    <Inset>
      {items.map((a) => (
        <div key={a.title} className="flex min-h-[48px] items-center gap-3 px-4 py-2">
          <p className="flex-1 text-[14.5px] text-ink">{a.title}</p>
          <span className="flex items-center gap-2.5">
            {a.meter ? <Meter level={a.meter} /> : null}
            <span className={cn("text-[14.5px] font-medium", TONE[a.tone])}>{a.value}</span>
          </span>
        </div>
      ))}
    </Inset>
  );
}

function ProseCard({ label, text }: { label: string; text: string }) {
  return (
    <section aria-label={label} className="rounded-[18px] bg-ink/[0.035] px-4 py-3.5">
      <h3 className="text-[12.5px] text-faint">{label}</h3>
      <p className="mt-1 whitespace-pre-line text-[15px] leading-[1.55] text-ink">{text}</p>
    </section>
  );
}

function Callout({ label, text }: { label: string; text: string }) {
  return (
    <blockquote className="rounded-[18px] bg-gold/[0.09] px-4 py-3.5">
      <p className="text-[12.5px] font-medium text-gold">{label}</p>
      <p className="mt-1 whitespace-pre-line text-[16px] font-medium leading-[1.5] tracking-[-0.01em] text-ink">{text}</p>
    </blockquote>
  );
}

function MoreDetails({ groups }: { groups: ReviewGroup[] }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button
        type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-[14px] px-4 text-left text-[14.5px] font-medium text-gold outline-none transition-colors hover:bg-gold/[0.07] active:bg-gold/[0.12] focus-visible:ring-2 focus-visible:ring-gold-strong/50"
      >
        <span>{open ? "Less" : "More"}</span>
        <Sym name="chevronDown" className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} strokeWidth={2.2} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={SPRING} className="overflow-hidden">
            <div className="space-y-6 pt-4">{groups.map((g, i) => <ReviewGroupView key={g.id} g={g} i={i} />)}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ───────────── Lessons linked to this trade ───────────── */
async function unlinkLesson(entry: JournalEntry, lessonId: string) {
  try {
    await useApp.getState().setEntryLessons(entry.id, (entry.lessonIds ?? []).filter((x) => x !== lessonId));
    toast.success("Lesson unlinked");
  } catch {
    toast.error("Couldn’t unlink the lesson", "Check your connection and try again.");
  }
}

function LinkedLessons({ entry, canEdit, onPick, onPeek }: { entry: JournalEntry; canEdit: boolean; onPick: () => void; onPeek: (id: string) => void }) {
  const { lessons, byId } = useLessonIndex();
  const progress = useReadProgress();
  const ids = entry.lessonIds ?? [];
  if (ids.length === 0 && !canEdit) return null;

  if (ids.length === 0) {
    return (
      <button type="button" onClick={onPick} className="group flex h-[52px] w-full items-center gap-3 rounded-[18px] bg-ink/[0.035] px-4 text-left outline-none transition-[background-color,transform] hover:bg-ink/[0.06] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-gold-strong/50">
        <Sym name="book" className="h-[18px] w-[18px] text-muted" />
        <span className="flex-1 text-[15px] font-medium text-ink">Link a lesson</span>
        <Sym name="plus" className="h-4 w-4 text-faint" strokeWidth={2} />
      </button>
    );
  }

  return (
    <section aria-label="Lessons">
      <GroupHeader
        title="Lessons"
        aside={canEdit ? <button type="button" onClick={onPick} className={textBtn}><Sym name="plus" className="h-3.5 w-3.5" strokeWidth={2} />Add</button> : undefined}
      />
      <Inset lead="thumb">
        <AnimatePresence initial={false}>
          {ids.map((id) => {
            const l = byId.get(id);
            const loading = lessons === null;
            const gone = !loading && !l;
            const st = statusOf(progress[id]);
            return (
              <motion.div key={id} layout="position" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, transition: { duration: 0.12 } }} transition={SPRING} className="group/row flex min-h-[60px] items-center gap-1 pr-2">
                <button
                  type="button" disabled={gone} onClick={() => onPeek(id)}
                  className="group flex min-w-0 flex-1 items-center gap-3 rounded-[12px] py-2 pl-3 pr-1 text-left outline-none transition-colors hover:bg-ink/[0.03] active:bg-ink/[0.06] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-strong/50 disabled:pointer-events-none"
                >
                  {loading ? <span className="h-10 w-10 shrink-0 animate-pulse rounded-[10px] bg-ink/[0.07]" /> : <LessonThumb l={l} className={cn("h-10 w-10", gone && "opacity-40 grayscale")} />}
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-[14.5px] font-medium tracking-[-0.01em]", gone ? "text-muted" : "text-ink")}>{l?.title ?? (loading ? "Loading…" : "Lesson unavailable")}</span>
                    <span className="flex items-center gap-1.5 truncate text-[12.5px] text-muted">
                      {l ? `${l.readMins} min · ${fmtShort(l.createdAt)}` : gone ? "No longer available" : " "}
                      {st === "read" && <span className="flex items-center gap-0.5 font-medium text-profit"><Sym name="check" className="h-3 w-3" strokeWidth={2.6} />Read</span>}
                      {st === "reading" && <span className="num font-medium text-gold">{Math.round((progress[id]?.p ?? 0) * 100)}%</span>}
                    </span>
                  </span>
                  {!gone && <Sym name="chevronRight" className="h-4 w-4 shrink-0 text-faint" strokeWidth={2} />}
                </button>
                {canEdit && (
                  <button
                    type="button" aria-label={`Unlink ${l?.title ?? "lesson"}`} title="Unlink" onClick={() => void unlinkLesson(entry, id)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-faint opacity-0 outline-none transition-[opacity,background-color,color,transform] hover:bg-loss/10 hover:text-loss focus-visible:opacity-100 focus-visible:ring-2 focus-visible:ring-loss/40 group-hover/row:opacity-100 active:scale-90 [@media(hover:none)]:opacity-100"
                  >
                    <Sym name="unlink" className="h-4 w-4" />
                  </button>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>
      </Inset>
    </section>
  );
}

/* ───────────── Right: the story ───────────── */
function Story({ entry, tab, onTab, scroll, onReflect, canEdit, onPickLesson, onPeekLesson, replay }: { entry: JournalEntry; tab: Tab; onTab: (t: Tab) => void; scroll: boolean; onReflect: () => void; canEdit: boolean; onPickLesson: () => void; onPeekLesson: (id: string) => void; replay: Replay }) {
  const rel = relativeDayLabel(entry.date);
  const status = entry.reviewStatus ?? reviewStatusOf(entry);
  const reviewed = status === "reviewed";
  const groups = useMemo(() => buildReviewGroups(entry), [entry]);
  const allEntries = useApp((s) => s.entries);
  const plans = useApp((s) => s.plans);
  const dayLimits = useApp((s) => s.settings.dayLimits);
  const currency = useApp((s) => s.settings.currency);
  const risk = useMemo(() => dayRisk(entry.date, allEntries, plans, dayLimits), [entry.date, allEntries, plans, dayLimits]);
  const hasPlan = useMemo(() => !!reviewPlanForEntry(entry, plans, allEntries, dayLimits), [entry, plans, allEntries, dayLimits]);
  const answers = useMemo(() => buildAnswers(entry), [entry]);
  const prose = useMemo(() => buildProse(entry), [entry]);
  const extra = useMemo(
    () => groups.filter((g) => g.id !== "r-checklist").map((g) => ({ ...g, rows: g.rows.filter((r) => !HANDLED.has(r.label)) })).filter((g) => g.rows.length > 0),
    [groups],
  );
  const editedAt = entry.review?.reviewedAt ?? entry.reflection?.updatedAt;
  const edited = editedAt ? new Date(editedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : null;

  const prices = (
    [
      entry.entryPrice != null ? ["Entry", String(entry.entryPrice)] : null,
      entry.exitPrice != null ? ["Exit", String(entry.exitPrice)] : null,
      entry.stopLoss != null ? ["Stop", String(entry.stopLoss)] : null,
      entry.takeProfit != null ? ["Target", String(entry.takeProfit)] : null,
    ] as ([string, string] | null)[]
  ).filter((x): x is [string, string] => !!x);
  const facts = [
    entry.entryTime ? (entry.exitTime ? `${entry.entryTime}–${entry.exitTime}` : entry.entryTime) : null,
    entry.holdDuration || null,
    entry.quantity != null ? `Size ${entry.quantity}` : null,
  ].filter(Boolean) as string[];

  const rules: { label: string; ok: boolean | null }[] = entry.preTradeChecklist?.length
    ? entry.preTradeChecklist.map((i) => ({ label: i.label, ok: i.confirmed }))
    : entry.checklist ? checklistItems(entry.checklist).map((i) => ({ label: i.label, ok: i.item.answer })) : [];
  const ruleScore = entry.preTradeChecklist?.length
    ? { confirmed: entry.preTradeChecklist.filter((i) => i.confirmed).length, required: entry.preTradeChecklist.length }
    : entry.checklist ? checklistScore(entry.checklist) : null;

  const verdictKey = entry.review?.outcome?.processVerdict;
  const verdictMap: Record<string, string> = { "a-plus": "A+ trade", "process-success": "Good process", "process-failure": "Process failure" };
  const verdict = verdictKey ? verdictMap[verdictKey] : null;
  const goodProcess = verdictKey !== "process-failure";
  const lesson = entry.reflection?.lesson || entry.review?.concepts?.improve || entry.review?.followUp?.watchNext;
  const process: { label: string; ok: boolean }[] = [
    ...(entry.reflection?.followedSetup != null ? [{ label: "Followed setup", ok: !!entry.reflection.followedSetup }] : []),
    ...(entry.reflection?.followedRisk != null ? [{ label: "Respected risk", ok: !!entry.reflection.followedRisk }] : []),
  ];
  const autopsy = entry.review?.outcome?.followedPlan != null;
  const flags = ([["FOMO", entry.review?.psychology?.fomo], ["Revenge", entry.review?.psychology?.revenge], ["Fear exit", entry.review?.psychology?.fearExit], ["Make-it-back", entry.review?.psychology?.makeItBack]] as [string, boolean | null | undefined][]).filter(([, v]) => v).map(([k]) => k);

  /** What the trader wrote about their mistake, in their own words (shown in full). */
  const mistakeWords = (() => {
    const f = entry.review?.followUp;
    if (!f || !f.mistake || f.mistake === "none") return "";
    return [f.mistake === "other" ? f.mistakeOther?.trim() : "", f.mistakeNote?.trim()].filter(Boolean).join(" — ");
  })();
  const hasReview = answers.length > 0 || prose.length > 0 || !!lesson || extra.length > 0;
  const feel = feelingOf(entry);
  const m = mistakeOf(entry);
  const tags = mistakeTagsOf(entry);
  const chips: { label: string; good: boolean }[] = dedupe(
    autopsy
      ? [
          { label: entry.review?.outcome?.followedPlan ? "Followed plan" : "Broke plan", good: !!entry.review?.outcome?.followedPlan },
          ...(feel ? [{ label: feel.label, good: feel.tone !== "bad" }] : []),
          ...(m?.none ? [{ label: "No mistake", good: true }] : tags.length ? tags.map((t) => ({ label: t.label, good: false })) : m ? [{ label: m.label.length > 28 ? "Mistake" : m.label, good: false }] : []),
        ]
      : [...process.map((r) => ({ label: r.label, good: r.ok })), ...flags.map((f) => ({ label: f, good: false }))],
  );
  const allGood = goodProcess && chips.every((c) => c.good);
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Trade" },
    ...(hasReview ? [{ id: "review" as Tab, label: "Review" }] : []),
    ...(rules.length ? [{ id: "checklist" as Tab, label: "Rules" }] : []),
  ];
  const cur: Tab = tabs.some((t) => t.id === tab) ? tab : "overview";

  return (
    <div className={cn("flex flex-col", scroll && "lg:h-full lg:overflow-hidden")}>
      <header className="flex shrink-0 items-end justify-between gap-5 px-9 pt-16">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{rel ? `${rel}, ${formatDateFull(entry.date)}` : formatDateFull(entry.date)}</p>
          <h2 className="mt-1 text-[28px] font-semibold capitalize leading-tight tracking-[-0.035em] text-ink">
            {[entry.instrument !== "—" ? entry.instrument : null, entry.direction].filter(Boolean).join(" ") || "Trade"}
          </h2>
          {entry.setup && <p className="mt-0.5 truncate text-[14px] text-muted">{entry.setup}</p>}
        </div>
        <div className="shrink-0 text-right">
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 26 }} className={cn("kpi text-[40px] leading-none tracking-[-0.04em] tabular-nums", tone(entry.pnl))}>
            {formatSignedMoney(entry.pnl)}
          </motion.p>
          {entry.rr != null && <p className="num mt-1.5 text-[14px] text-muted">{entry.rr > 0 ? "+" : ""}{entry.rr}R</p>}
        </div>
      </header>

      {tabs.length > 1 && <div className="shrink-0 px-9 pt-6"><Segmented tabs={tabs} value={cur} onChange={onTab} /></div>}

      <div className={cn("px-9 pb-10 pt-6", scroll && "lg:min-h-0 lg:flex-1 lg:overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgb(128_128_128/0.3)_transparent]")}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={cur} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.2 }} className="space-y-5">
            {cur === "overview" && (
              <>
                {prices.length > 0 && (
                  <section aria-label="Prices">
                    <dl className="grid grid-cols-[repeat(auto-fit,minmax(78px,1fr))] gap-x-4 gap-y-3">
                      {prices.map(([k, v]) => (
                        <div key={k} className="min-w-0">
                          <dt className="text-[12.5px] text-faint">{k}</dt>
                          <dd className="num mt-0.5 text-[17px] font-semibold tracking-[-0.02em] text-ink">{v}</dd>
                        </div>
                      ))}
                    </dl>
                    {facts.length > 0 && <p className="num mt-3 text-[13px] text-muted">{facts.join("  ·  ")}</p>}
                  </section>
                )}

                {!reviewed && (
                  <button
                    type="button" onClick={onReflect}
                    className="flex h-[52px] w-full items-center gap-3 rounded-[18px] bg-gold-strong px-4 text-left text-on-gold outline-none transition-[transform,opacity] hover:opacity-95 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-gold-strong/50 focus-visible:ring-offset-2"
                  >
                    <Sym name="sparkles" className="h-[18px] w-[18px]" />
                    <span className="flex-1 text-[15px] font-semibold">{status === "not_reviewed" ? "Review this trade" : "Finish review"}</span>
                    <Sym name="chevronRight" className="h-4 w-4 opacity-80" strokeWidth={2.2} />
                  </button>
                )}

                {replay.plan && (
                  <button
                    type="button" onClick={replay.start} disabled={!replay.plan.ok || replay.busy}
                    className="group flex h-[52px] w-full items-center gap-3 rounded-[18px] bg-ink/[0.035] px-4 text-left outline-none transition-[background-color,transform] hover:bg-ink/[0.06] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-gold-strong/50 disabled:pointer-events-none disabled:opacity-45"
                  >
                    <span className="grid h-7 w-7 place-items-center rounded-full bg-ink/[0.08] text-ink"><Sym name="play" className="h-3.5 w-3.5" /></span>
                    <span className="flex-1 text-[15px] font-medium text-ink">{replay.busy ? "Opening…" : replay.plan.ok ? "Replay" : "Replay unavailable"}</span>
                    {replay.plan.ok && <Sym name="chevronRight" className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" strokeWidth={2} />}
                  </button>
                )}

                {(verdict || chips.length > 0) && (
                  <section aria-label="Process" className={cn("rounded-[20px] p-5", allGood ? "bg-profit/[0.07]" : "bg-loss/[0.06]")}>
                    {verdict && (
                      <p className="flex items-center gap-2.5 text-[18px] font-semibold tracking-[-0.02em] text-ink">
                        <span className={cn("h-2.5 w-2.5 rounded-full", goodProcess ? "bg-profit" : "bg-loss")} />
                        {verdict}
                      </p>
                    )}
                    {chips.length > 0 && (
                      <ul className={cn("flex flex-wrap gap-1.5", verdict && "mt-3.5")}>
                        {chips.map((c) => (
                          <li key={c.label} className={cn("rounded-full px-3 py-1 text-[13px] leading-snug", c.good ? "bg-surface/80 text-ink shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]" : "bg-loss/[0.1] font-medium text-loss")}>
                            {c.label}
                          </li>
                        ))}
                      </ul>
                    )}
                    {mistakeWords && (
                      <p className="mt-3.5 whitespace-pre-line text-[14.5px] leading-relaxed text-ink/85 [overflow-wrap:anywhere]">“{mistakeWords}”</p>
                    )}
                  </section>
                )}

                {lesson && <Callout label="Next time" text={lesson} />}

                {hasPlan && <Disclosure label="Plan vs trade"><PlanVsTrade entry={entry} /></Disclosure>}

                {risk && (
                  <Disclosure label="Daily limit" value={<span className={cn("num text-[13px]", risk.status === "ok" ? "text-muted" : "text-loss")}>{Math.round(Math.min(risk.ratio, 9.99) * 100)}%</span>}>
                    <RiskMeter risk={risk} currency={currency} label={`${formatDateMedium(entry.date)} vs your limit`} />
                  </Disclosure>
                )}

                <LinkedLessons entry={entry} canEdit={canEdit} onPick={onPickLesson} onPeek={onPeekLesson} />

                {entry.notes && (
                  <section aria-label="Notes">
                    <GroupHeader title="Notes" />
                    <p className="whitespace-pre-line rounded-[18px] bg-ink/[0.035] px-4 py-3.5 text-[14.5px] leading-relaxed text-ink">{entry.notes}</p>
                  </section>
                )}
              </>
            )}

            {cur === "review" && (
              <>
                <div className="-mb-1 flex items-center justify-between gap-3">
                  <p className="text-[13px] text-muted">{edited ? `Reviewed ${edited}` : "Your review"}</p>
                  {canEdit && <button type="button" onClick={onReflect} className={textBtn}><Sym name="pencil" className="h-3.5 w-3.5" />Edit</button>}
                </div>
                {answers.length > 0 && <AnswerList items={answers} />}
                <EntryTags entry={entry} />
                {prose.map((p) => <ProseCard key={p.label} label={p.label} text={p.text} />)}
                {lesson && <Callout label="Next time" text={lesson} />}
                {extra.length > 0 && <MoreDetails groups={extra} />}
              </>
            )}

            {cur === "checklist" && ruleScore && (
              <section aria-label="Rules">
                <GroupHeader title={`${ruleScore.confirmed} of ${ruleScore.required} followed`} />
                <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-ink/[0.07]">
                  <motion.div initial={{ width: 0 }} animate={{ width: `${(ruleScore.confirmed / Math.max(1, ruleScore.required)) * 100}%` }} transition={{ type: "spring", stiffness: 120, damping: 24 }} className={cn("h-full rounded-full", ruleScore.confirmed === ruleScore.required ? "bg-profit" : "bg-gold-strong")} />
                </div>
                <Inset>
                  {rules.map((r) => (
                    <div key={r.label} className="flex items-start gap-3 px-4 py-3">
                      <span className={cn("mt-px grid h-5 w-5 shrink-0 place-items-center rounded-full", r.ok ? "bg-profit/15 text-profit" : r.ok === false ? "bg-loss/15 text-loss" : "bg-ink/[0.07] text-faint")}>
                        {r.ok ? <Sym name="check" className="h-3 w-3" strokeWidth={2.6} /> : r.ok === false ? <Sym name="xmark" className="h-3 w-3" strokeWidth={2.6} /> : null}
                      </span>
                      <p className={cn("text-[14.5px] leading-snug", r.ok === false ? "text-muted" : "text-ink")}>{r.label}</p>
                    </div>
                  ))}
                </Inset>
              </section>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

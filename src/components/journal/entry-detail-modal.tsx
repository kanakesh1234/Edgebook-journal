"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { checklistItems, checklistScore, reviewStatusOf, type JournalEntry } from "@/lib/types";
import { formatDateFull, formatSignedMoney, relativeDayLabel } from "@/lib/format";
import { useImageUrls } from "@/lib/hooks";
import { Lightbox } from "@/components/ui/lightbox";
import { ReflectionFlow } from "./reflection-flow";
import { Sym, type SymName } from "./symbols";
import { IconButton, SPRING } from "./journal-ui";
import { buildReviewGroups, type ReviewGroup } from "./review-model";
import { cn } from "@/lib/utils";

const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted");
type Tab = "overview" | "review" | "checklist";

/**
 * Trade sheet — a photo-viewer-style stage for the chart and a segmented review on the right:
 * Overview (what matters), Review (everything recorded, grouped like Settings), Checklist (every rule).
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
  const [mounted, setMounted] = useState(false);
  const [tab, setTab] = useState<Tab>("overview"); // lives here so stepping through trades keeps your place
  const urls = useImageUrls(entry?.images.map((i) => i.id) ?? []);
  const visible = open && !!entry;
  const covered = !!zoomed || reflecting; // the lightbox / reflection flow take over the screen
  useEffect(() => setMounted(true), []);

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
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable || covered) return;
      if (e.key === "Escape") onClose();
      if (onStep && e.key === "ArrowRight") onStep(1);
      if (onStep && e.key === "ArrowLeft") onStep(-1);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [visible, onStep, onClose, covered]);

  const hasImg = !!entry && entry.images.length > 0;
  const stepper = !!position && !!onStep && position.total > 1;

  const sheet = (
    <AnimatePresence>
      {visible && entry && (
        <motion.div
          key="sheet" role="dialog" aria-modal="true" aria-label="Journal entry"
          initial={{ opacity: 0 }} animate={{ opacity: covered ? 0 : 1 }} exit={{ opacity: 0, transition: { duration: 0.15 } }}
          transition={{ duration: 0.18 }}
          className={cn("fixed inset-0 z-50 grid place-items-center p-3 sm:p-8", covered && "pointer-events-none")}
        >
          <div onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[10px] backdrop-saturate-150" />
          <motion.div
            initial={{ opacity: 0, scale: 0.97, y: 14 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.98, y: 6, transition: { duration: 0.14 } }}
            transition={SPRING}
            className={cn(
              "relative flex max-h-full w-full flex-col overflow-hidden rounded-[26px] bg-surface shadow-[0_48px_120px_-28px_rgb(0_0_0/0.5),0_12px_32px_-14px_rgb(0_0_0/0.22),0_0_0_0.5px_rgb(0_0_0/0.16),inset_0_0.5px_0_rgb(255_255_255/0.55)] dark:shadow-[0_48px_120px_-28px_rgb(0_0_0/0.8),0_0_0_0.5px_rgb(255_255_255/0.14),inset_0_0.5px_0_rgb(255_255_255/0.08)]",
              hasImg ? "h-[min(88dvh,840px)] max-w-[1200px]" : "max-w-[600px]",
            )}
          >
            {/* Toolbar */}
            <div className="relative z-30 flex h-12 shrink-0 items-center justify-between bg-surface px-2.5">
              <div className="flex items-center gap-0.5">
                {stepper && (
                  <>
                    <IconButton label="Previous trade" icon="chevronLeft" disabled={position.index === 0} onClick={() => onStep(-1)} />
                    <IconButton label="Next trade" icon="chevronRight" disabled={position.index >= position.total - 1} onClick={() => onStep(1)} />
                    <span className="num ml-2 text-[13px] text-faint">{position.index + 1} of {position.total}</span>
                  </>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                {onEdit && <IconButton label="Edit entry" icon="pencil" onClick={() => onEdit(entry)} />}
                {onDelete && <IconButton label="Delete entry" icon="trash" onClick={() => onDelete(entry)} className="hover:!bg-loss/10 hover:!text-loss" />}
                <span className="mx-1 h-4 w-px bg-line-soft" />
                <IconButton label="Close" icon="xmark" onClick={onClose} />
              </div>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={entry.id} initial={{ opacity: 0, x: 14 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -14 }}
                transition={{ type: "spring", stiffness: 420, damping: 38 }}
                className={cn("min-h-0 flex-1 overflow-y-auto lg:overflow-hidden", hasImg && "lg:grid lg:grid-cols-[minmax(0,1.5fr)_minmax(420px,1fr)] lg:grid-rows-[minmax(0,1fr)]")}
              >
                {hasImg && <Stage entry={entry} urls={urls} onZoom={setZoomed} />}
                <Story entry={entry} tab={tab} onTab={setTab} scroll={hasImg} onReflect={() => setReflecting(true)} canEdit={!!onEdit} />
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
      <ReflectionFlow open={reflecting && !!entry} entry={entry} onClose={() => setReflecting(false)} />
    </>
  );
}

/* ───────────── Left: the chart, matted on a themed stage (like Apple Photos) ───────────── */
/** Floating controls use the theme surface, not white-on-black, so they follow light/dark. */
const glass = "bg-surface/75 text-ink shadow-[0_1px_4px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.1)] backdrop-blur-xl hover:bg-surface/95 dark:shadow-[0_1px_4px_rgb(0_0_0/0.5),0_0_0_0.5px_rgb(255_255_255/0.14)]";
function Stage({ entry, urls, onZoom }: { entry: JournalEntry; urls: Record<string, string | null>; onZoom: (url: string) => void }) {
  const [active, setActive] = useState(0);
  const n = entry.images.length;
  const i = Math.min(active, n - 1);
  const img = entry.images[i];
  const url = img ? urls[img.id] : null;
  const go = (d: 1 | -1) => setActive((a) => (Math.min(a, n - 1) + d + n) % n);
  const reveal = "opacity-0 transition-[opacity,transform] duration-200 focus-visible:opacity-100 group-hover/stage:opacity-100 [@media(hover:none)]:opacity-100";
  return (
    <section aria-label="Screenshots" className="group/stage relative aspect-[16/10] overflow-hidden lg:aspect-auto">
      <button
        type="button" onClick={() => url && onZoom(url)} disabled={!url} aria-label="Enlarge screenshot"
        className="absolute inset-0 flex cursor-zoom-in items-center justify-center p-4 outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-gold-strong/60 sm:p-6 lg:py-6 lg:pl-6 lg:pr-2"
      >
        {url ? (
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.img
              key={img.id} src={url} alt={img.name} draggable={false}
              initial={{ opacity: 0, scale: 0.985 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28, ease: [0.32, 0.72, 0, 1] }}
              className="max-h-full max-w-full rounded-[12px] object-contain ring-1 ring-ink/10 shadow-[0_10px_28px_-14px_rgb(0_0_0/0.28),0_1px_3px_rgb(0_0_0/0.06)] transition-shadow duration-300 group-hover/stage:shadow-[0_14px_34px_-14px_rgb(0_0_0/0.34),0_1px_3px_rgb(0_0_0/0.06)]"
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
              key={d} type="button" onClick={() => go(d)} aria-label={d === 1 ? "Next screenshot" : "Previous screenshot"}
              className={cn("absolute top-1/2 z-20 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full outline-none active:scale-90 focus-visible:ring-2 focus-visible:ring-gold-strong/60", glass, reveal, d === 1 ? "right-4" : "left-4")}
            >
              <Sym name={d === 1 ? "chevronRight" : "chevronLeft"} className="h-[18px] w-[18px]" strokeWidth={2.2} />
            </button>
          ))}
          <div className={cn("absolute bottom-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1.5 rounded-full px-3 py-2", glass)} role="tablist" aria-label="Screenshots">
            {entry.images.map((im, k) => (
              <button
                key={im.id} type="button" role="tab" aria-selected={k === i} aria-label={`Screenshot ${k + 1}`} onClick={() => setActive(k)}
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
/** iOS Settings-style icon tile. */
function Tile({ icon, tint }: { icon: SymName; tint: string }) {
  return (
    <span style={{ background: tint }} className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4),0_0.5px_1px_rgb(0_0_0/0.18)]">
      <Sym name={icon} className="h-[15px] w-[15px]" strokeWidth={1.9} />
    </span>
  );
}

function GroupHeader({ icon, tint, title, aside }: { icon: SymName; tint: string; title: string; aside?: React.ReactNode }) {
  return (
    <div className="mb-2 flex items-center gap-2.5 px-1">
      <Tile icon={icon} tint={tint} />
      <h3 className="flex-1 text-[15px] font-semibold tracking-[-0.015em] text-ink">{title}</h3>
      {aside}
    </div>
  );
}

/** Inset grouped list — separators are inset from the leading edge, like iOS Settings. */
function Inset({ children, lead }: { children: React.ReactNode; lead?: boolean }) {
  return (
    <div className={cn(
      "overflow-hidden rounded-[14px] bg-ink/[0.035] ring-1 ring-inset ring-ink/[0.05] [&>*]:relative [&>*]:after:absolute [&>*]:after:bottom-0 [&>*]:after:right-0 [&>*]:after:h-px [&>*]:after:bg-line-soft [&>*:last-child]:after:hidden",
      lead ? "[&>*]:after:left-[54px]" : "[&>*]:after:left-4",
    )}>
      {children}
    </div>
  );
}

function Yes({ ok, bad }: { ok: boolean; bad?: boolean }) {
  const good = bad ? !ok : ok;
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold", good ? "bg-profit/[0.12] text-profit" : "bg-loss/[0.12] text-loss")}>
      <Sym name={good ? "check" : "xmark"} className="h-3 w-3" strokeWidth={2.6} />{ok ? "Yes" : "No"}
    </span>
  );
}

function VerdictPill({ text }: { text: string }) {
  const bad = /fail/i.test(text);
  return (
    <span className={cn("inline-flex h-6 items-center gap-1 rounded-full pl-2 pr-2.5 text-[12.5px] font-semibold", bad ? "bg-loss/[0.12] text-loss" : "bg-profit/[0.12] text-profit")}>
      <Sym name={bad ? "xmark" : "check"} className="h-3 w-3" strokeWidth={2.6} />{text}
    </span>
  );
}

function ReviewGroupView({ g, i = 0 }: { g: ReviewGroup; i?: number }) {
  return (
    <motion.section
      aria-label={g.title}
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 380, damping: 34, delay: Math.min(i * 0.05, 0.2) }}
    >
      <GroupHeader icon={g.icon} tint={g.tint} title={g.title} />
      <Inset>
        {g.rows.map((r, k) =>
          r.long && typeof r.value === "string" ? (
            <div key={k} className="px-4 py-3.5">
              <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">{r.label}</p>
              <p className="mt-1.5 whitespace-pre-line text-[15px] leading-[1.55] tracking-[-0.005em] text-ink">{r.value}</p>
            </div>
          ) : (
            <div key={k} className="flex min-h-[44px] items-center justify-between gap-6 px-4 py-2">
              <p className="text-[14.5px] text-ink">{r.label}</p>
              {typeof r.value === "boolean" ? (
                <Yes ok={r.value} bad={BADSET.has(r.label)} />
              ) : r.label === "Process verdict" ? (
                <VerdictPill text={r.value} />
              ) : (
                <p className="text-right text-[14.5px] text-muted">{r.value}</p>
              )}
            </div>
          ),
        )}
      </Inset>
    </motion.section>
  );
}
const BADSET = new Set(["FOMO", "Revenge", "Fear of exiting", "Make-it-back"]);

function Stats({ items }: { items: [string, string][] }) {
  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(96px,1fr))] gap-x-5 gap-y-4 rounded-[14px] bg-ink/[0.035] px-4 py-3.5 ring-1 ring-inset ring-ink/[0.05]">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[12px] text-faint">{k}</dt>
          <dd className="num mt-0.5 whitespace-nowrap text-[16px] font-semibold tracking-[-0.01em] text-ink">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Segmented({ tabs, value, onChange }: { tabs: { id: Tab; label: string }[]; value: Tab; onChange: (t: Tab) => void }) {
  return (
    <div role="tablist" aria-label="Trade sections" className="grid h-8 auto-cols-fr grid-flow-col rounded-[10px] bg-ink/[0.06] p-0.5">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id} type="button" role="tab" aria-selected={on} onClick={() => onChange(t.id)}
            className={cn("relative rounded-[8px] text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50", on ? "text-ink" : "text-muted hover:text-ink")}
          >
            {on && <motion.span layoutId="detail-tab" transition={SPRING} className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.06)]" />}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/* ───────────── What the trader actually answered ─────────────
   The review flow asks seven things. Everything else stored on a trade (Followed setup, Good trade despite
   loss …) is derived from those answers, so it is kept out of sight rather than repeated back as data. */
type Tone = "good" | "bad" | "warn" | "plain";
type Answer = { icon: SymName; tint: string; title: string; value: string; tone: Tone; meter?: number };
const MISTAKES: Record<string, string> = { none: "No mistake", early: "Entered early", chased: "Chased price", stop: "Moved stop", size: "Oversized", plan: "Broke plan", revenge: "Revenge trade", overtrade: "Overtraded" };
const SEVERITY = [
  { label: "Slip", bar: "bg-gold" },
  { label: "Costly", bar: "bg-loss/80" },
  { label: "Blunder", bar: "bg-loss" },
] as const;
const TONE: Record<Tone, string> = { good: "text-profit", bad: "text-loss", warn: "text-gold", plain: "text-muted" };
/** Labels of fields the answers above already cover (or derive) — hidden from "More details". */
const HANDLED = new Set([
  "Followed plan", "Good trade despite loss", "Bad trade despite win", "Process verdict", "Followed setup", "Respected risk", "Followed stop",
  "Drive", "FOMO", "Revenge", "Fear of exiting", "Make-it-back", "Biggest mistake", "Mistake", "Mistake note", "Mistake other", "Blunder level",
  "Next time", "Went well", "Didn’t go well", "Cause",
]);

function feelingOf(e: JournalEntry): { label: string; tone: Tone } | null {
  const p = e.review?.psychology;
  if (!p) return null;
  if (p.fomo) return { label: "FOMO", tone: "bad" };
  if (p.revenge) return { label: "Urgent", tone: "bad" }; // the review flow calls this answer "Urgent"
  if (p.fearExit) return { label: "Hesitant", tone: "bad" };
  if (p.makeItBack) return { label: "Make-it-back", tone: "bad" };
  if (p.convictionOrUrgency === "conviction") return { label: "Calm", tone: "good" };
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
  if (plan != null) out.push({ icon: "target", tint: "#34c759", title: "Plan", value: plan ? "Followed" : "Not followed", tone: plan ? "good" : "bad" });
  const feel = feelingOf(e);
  if (feel) out.push({ icon: "heart", tint: "#ff375f", title: "Feeling", value: feel.label, tone: feel.tone });
  const v = r?.outcome?.processVerdict;
  if (v) { const bad = v === "process-failure"; out.push({ icon: "shield", tint: "#0a84ff", title: "Process", value: bad ? "Needs work" : "Good", tone: bad ? "bad" : "good" }); }
  const m = mistakeOf(e);
  if (m) out.push({ icon: "arrowDownRight", tint: "#ff9f0a", title: "Mistake", value: m.label, tone: m.none ? "good" : "bad" });
  const lvl = Number(r?.followUp?.blunderLevel ?? 0);
  if (m && !m.none && lvl >= 1 && lvl <= 3) out.push({ icon: "chart", tint: "#8e8e93", title: "Severity", value: SEVERITY[lvl - 1].label, tone: lvl === 1 ? "warn" : "bad", meter: lvl });
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

function Meter({ level }: { level: number }) {
  return (
    <span aria-hidden className="flex items-center gap-0.5">
      {[1, 2, 3].map((n) => <span key={n} className={cn("h-1.5 w-3.5 rounded-full", n <= level ? SEVERITY[level - 1].bar : "bg-ink/[0.12]")} />)}
    </span>
  );
}

/** Settings-style rows: tile · title · quiet value. Colour only where it carries meaning. */
function AnswerList({ items }: { items: Answer[] }) {
  return (
    <Inset lead>
      {items.map((a) => (
        <div key={a.title} className="flex min-h-[48px] items-center gap-3 px-3.5 py-2">
          <Tile icon={a.icon} tint={a.tint} />
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
    <section aria-label={label} className="rounded-[14px] bg-ink/[0.035] px-4 py-3.5 ring-1 ring-inset ring-ink/[0.05]">
      <h3 className="text-[12px] font-semibold uppercase tracking-[0.04em] text-faint">{label}</h3>
      <p className="mt-1.5 whitespace-pre-line text-[15px] leading-[1.55] text-ink">{text}</p>
    </section>
  );
}

function Callout({ label, text }: { label: string; text: string }) {
  return (
    <blockquote className="relative overflow-hidden rounded-[14px] bg-gold/[0.08] py-3.5 pl-5 pr-4 ring-1 ring-inset ring-gold/[0.14] before:absolute before:inset-y-3 before:left-2 before:w-[3px] before:rounded-full before:bg-gold-strong">
      <p className="text-[12.5px] font-semibold text-gold">{label}</p>
      <p className="mt-1 whitespace-pre-line text-[16px] font-medium leading-[1.5] tracking-[-0.01em] text-ink">{text}</p>
    </blockquote>
  );
}

/** Progressive disclosure: anything else on file is one tap away, never in the way. */
function MoreDetails({ groups }: { groups: ReviewGroup[] }) {
  const [open, setOpen] = useState(false);
  const n = groups.reduce((a, g) => a + g.rows.length, 0);
  return (
    <div>
      <button
        type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex h-11 w-full items-center justify-between rounded-[14px] px-4 text-left text-[14.5px] font-medium text-gold outline-none transition-colors hover:bg-gold/[0.07] active:bg-gold/[0.12] focus-visible:ring-2 focus-visible:ring-gold-strong/50"
      >
        <span>{open ? "Hide details" : "More details"}</span>
        <span className="flex items-center gap-1.5 text-[13px] text-muted">{n}<Sym name="chevronDown" className={cn("h-3.5 w-3.5 transition-transform duration-200", open && "rotate-180")} strokeWidth={2.2} /></span>
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

/* ───────────── Right: the review ───────────── */
function Story({ entry, tab, onTab, scroll, onReflect, canEdit }: { entry: JournalEntry; tab: Tab; onTab: (t: Tab) => void; scroll: boolean; onReflect: () => void; canEdit: boolean }) {
  const rel = relativeDayLabel(entry.date);
  const status = entry.reviewStatus ?? reviewStatusOf(entry);
  const reviewed = status === "reviewed";
  const groups = useMemo(() => buildReviewGroups(entry), [entry]);
  const answers = useMemo(() => buildAnswers(entry), [entry]);
  const prose = useMemo(() => buildProse(entry), [entry]);
  const extra = useMemo(
    () => groups.filter((g) => g.id !== "r-checklist").map((g) => ({ ...g, rows: g.rows.filter((r) => !HANDLED.has(r.label)) })).filter((g) => g.rows.length > 0),
    [groups],
  );
  const editedAt = entry.review?.reviewedAt ?? entry.reflection?.updatedAt;
  const edited = editedAt ? new Date(editedAt).toLocaleDateString("en-US", { day: "numeric", month: "short" }) : null;

  const figures = (
    [
      entry.entryPrice != null ? ["Entry", String(entry.entryPrice)] : null,
      entry.exitPrice != null ? ["Exit", String(entry.exitPrice)] : null,
      entry.stopLoss != null ? ["Stop", String(entry.stopLoss)] : null,
      entry.takeProfit != null ? ["Target", String(entry.takeProfit)] : null,
      entry.entryTime ? ["Time", entry.exitTime ? `${entry.entryTime}–${entry.exitTime}` : entry.entryTime] : null,
      entry.holdDuration ? ["Held", entry.holdDuration] : null,
      entry.quantity != null ? ["Size", String(entry.quantity)] : null,
    ] as ([string, string] | null)[]
  ).filter((x): x is [string, string] => !!x);

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

  const hasReview = answers.length > 0 || prose.length > 0 || !!lesson || extra.length > 0;
  const chips: { label: string; good: boolean }[] = autopsy
    ? [
        { label: entry.review?.outcome?.followedPlan ? "Followed plan" : "Broke plan", good: !!entry.review?.outcome?.followedPlan },
        ...(feelingOf(entry) ? [{ label: feelingOf(entry)!.label, good: feelingOf(entry)!.tone === "good" }] : []),
        ...(mistakeOf(entry) ? [{ label: mistakeOf(entry)!.label, good: mistakeOf(entry)!.none }] : []),
      ]
    : [...process.map((r) => ({ label: r.label, good: r.ok })), ...flags.map((f) => ({ label: f, good: false }))];
  const tabs: { id: Tab; label: string }[] = [
    { id: "overview", label: "Overview" },
    ...(hasReview ? [{ id: "review" as Tab, label: "Review" }] : []),
    ...(rules.length ? [{ id: "checklist" as Tab, label: "Checklist" }] : []),
  ];
  const cur: Tab = tabs.some((t) => t.id === tab) ? tab : "overview";
  const prompt = status === "not_reviewed" ? "Review this trade" : "Finish your review";
  const promptBody = status === "not_reviewed" ? "What worked, what didn’t, and one change for next time." : "Pick up where you left off and lock in the lesson.";

  return (
    <div className={cn("flex flex-col", scroll && "lg:h-full lg:overflow-hidden")}>
      <header className="flex shrink-0 items-start justify-between gap-5 px-8 pt-7">
        <div className="min-w-0">
          <p className="text-[13px] text-muted">{rel ? `${rel}, ${formatDateFull(entry.date)}` : formatDateFull(entry.date)}</p>
          <h2 className="mt-1 text-[26px] font-semibold capitalize leading-tight tracking-[-0.03em] text-ink">
            {[entry.instrument !== "—" ? entry.instrument : null, entry.direction].filter(Boolean).join(" ") || "Trade"}
          </h2>
          <p className="mt-1 flex items-center gap-1.5 text-[14px] text-muted">
            {entry.setup && <span className="font-medium text-gold">{entry.setup}</span>}
            {reviewed && (
              <span className="flex items-center gap-1 text-profit">
                {entry.setup && <span className="text-faint">·</span>}
                <Sym name="check" className="h-3.5 w-3.5" strokeWidth={2.4} />Reviewed
              </span>
            )}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <motion.p initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 320, damping: 26 }} className={cn("kpi text-[36px] leading-none tracking-[-0.03em] tabular-nums", tone(entry.pnl))}>
            {formatSignedMoney(entry.pnl)}
          </motion.p>
          {entry.rr != null && <p className="num mt-1.5 text-[14px] text-muted">{entry.rr > 0 ? "+" : ""}{entry.rr}R</p>}
        </div>
      </header>

      {tabs.length > 1 && <div className="shrink-0 px-8 pt-5"><Segmented tabs={tabs} value={cur} onChange={onTab} /></div>}

      <div className={cn("px-8 pb-10 pt-6", scroll && "lg:min-h-0 lg:flex-1 lg:overflow-y-auto [scrollbar-width:thin] [scrollbar-color:rgb(128_128_128/0.35)_transparent]")}>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={cur} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.08 } }} transition={{ duration: 0.2 }} className="space-y-6">
            {cur === "overview" && (
              <>
                {!reviewed && (
                  <div className="flex items-center gap-3.5 rounded-[16px] bg-gold/[0.10] p-4">
                    <Tile icon="sparkles" tint="#c9a227" />
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-semibold text-ink">{prompt}</p>
                      <p className="text-[13px] leading-snug text-muted">{promptBody}</p>
                    </div>
                    <button type="button" onClick={onReflect} className="h-8 shrink-0 rounded-full bg-gold-strong px-4 text-[13.5px] font-semibold text-on-gold outline-none transition-[transform,opacity] hover:opacity-90 active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50 focus-visible:ring-offset-2">
                      {status === "not_reviewed" ? "Start" : "Continue"}
                    </button>
                  </div>
                )}

                {figures.length > 0 && <Stats items={figures} />}

                {(verdict || chips.length > 0) && (
                  <section aria-label="Process" className={cn("rounded-[16px] p-4 ring-1 ring-inset", goodProcess && chips.every((c) => c.good) ? "bg-profit/[0.07] ring-profit/[0.16]" : "bg-loss/[0.06] ring-loss/[0.15]")}>
                    {verdict && (
                      <div className="flex items-center gap-3">
                        <span className={cn("grid h-10 w-10 shrink-0 place-items-center rounded-[12px] text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.4),0_1px_2px_rgb(0_0_0/0.15)]", goodProcess ? "bg-profit" : "bg-loss")}>
                          <Sym name={goodProcess ? "check" : "xmark"} className="h-5 w-5" strokeWidth={2.4} />
                        </span>
                        <div className="min-w-0">
                          <p className="text-[12px] font-semibold uppercase tracking-[0.04em] text-muted">Process</p>
                          <p className="text-[19px] font-semibold leading-tight tracking-[-0.02em] text-ink">{verdict}</p>
                        </div>
                      </div>
                    )}
                    <ul className={cn("flex flex-wrap gap-1.5", verdict && "mt-3.5")}>
                      {chips.map((c) => (
                        <li key={c.label} className={cn("flex h-7 items-center gap-1.5 rounded-full pl-2 pr-3 text-[13px]", c.good ? "bg-surface/80 text-ink shadow-[0_0_0_0.5px_rgb(0_0_0/0.08)]" : "bg-loss/[0.1] font-medium text-loss")}>
                          <Sym name={c.good ? "check" : "xmark"} className={cn("h-3.5 w-3.5", c.good ? "text-profit" : "text-loss")} strokeWidth={2.4} />{c.label}
                        </li>
                      ))}
                    </ul>
                  </section>
                )}

                {lesson && <Callout label="Next time" text={lesson} />}

                {entry.notes && (
                  <section aria-label="Notes">
                    <GroupHeader icon="note" tint="#e5a800" title="Notes" />
                    <Inset><p className="whitespace-pre-line px-4 py-3 text-[14.5px] leading-relaxed text-ink">{entry.notes}</p></Inset>
                  </section>
                )}

                {hasReview && (
                  <button type="button" onClick={() => onTab("review")} className="group flex w-full items-center gap-3 rounded-[14px] bg-ink/[0.035] p-3 pr-4 text-left ring-1 ring-inset ring-ink/[0.05] outline-none transition-[background-color,transform] hover:bg-ink/[0.06] active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-gold-strong/50">
                    <Tile icon="note" tint="#8e8e93" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14.5px] font-medium text-ink">Full review</span>
                      <span className="block truncate text-[12.5px] text-muted">{(answers.length ? answers.map((a) => a.title) : groups.map((g) => g.title)).slice(0, 4).join(" · ")}</span>
                    </span>
                    <Sym name="chevronRight" className="h-4 w-4 text-faint transition-transform group-hover:translate-x-0.5" strokeWidth={2} />
                  </button>
                )}
              </>
            )}

            {cur === "review" && (
              <>
                <div className="-mb-1 flex items-center justify-between gap-3">
                  <p className="text-[13px] text-muted">{edited ? `Reviewed ${edited}` : "Your review"}</p>
                  {canEdit && (
                    <button type="button" onClick={onReflect} className="-mr-2 flex h-8 items-center gap-1.5 rounded-full px-3 text-[13.5px] font-medium text-gold outline-none transition-colors hover:bg-gold/10 active:bg-gold/15 focus-visible:ring-2 focus-visible:ring-gold-strong/50">
                      <Sym name="pencil" className="h-3.5 w-3.5" />Edit
                    </button>
                  )}
                </div>
                {answers.length > 0 && <AnswerList items={answers} />}
                {prose.map((p) => <ProseCard key={p.label} label={p.label} text={p.text} />)}
                {lesson && <Callout label="Next time" text={lesson} />}
                {extra.length > 0 && <MoreDetails groups={extra} />}
              </>
            )}

            {cur === "checklist" && ruleScore && (
              <section aria-label="Checklist">
                <GroupHeader icon="checklist" tint="#5e5ce6" title="Rules" aside={<span className="num text-[13px] text-muted">{ruleScore.confirmed} of {ruleScore.required} followed</span>} />
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

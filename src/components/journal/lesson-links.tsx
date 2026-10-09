"use client";

/* ------------------------------------------------------------------ */
/*  Trade ⇄ Lesson links                                               */
/*                                                                      */
/*  A trade stores lesson ids (JournalEntry.lessonIds). Everything     */
/*  here is a view over two existing sources: the journal store and    */
/*  the Lessons API. Nothing is copied between them.                   */
/*                                                                      */
/*    LessonPicker  — link / unlink lessons on one trade               */
/*    LessonPeek    — read a linked lesson without leaving the Journal */
/*    TradePicker   — the same link, started from a lesson             */
/* ------------------------------------------------------------------ */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, useDragControls } from "motion/react";
import { useApp } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { formatSignedMoney } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import { fmtShort, byline } from "@/components/lessons/format";
import { useLessonIndex } from "@/components/lessons/use-lesson-index";
import type { LessonView } from "@/components/lessons/types";
import { Sym } from "./symbols";
import { IconButton, SPRING } from "./journal-ui";
import { dayShort, tradeTitle } from "./journal-model";
import { cn } from "@/lib/utils";
import "@/components/lessons/lessons.css";

const tone = (n: number) => (n > 0 ? "text-profit" : n < 0 ? "text-loss" : "text-muted");

/* ───────────── Shared bits ───────────── */

/** Cover photo, or an iOS-style app tile when the lesson has none. */
export function LessonThumb({ l, className }: { l?: Pick<LessonView, "cover"> | null; className?: string }) {
  return l?.cover ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={l.cover} alt="" loading="lazy" decoding="async" draggable={false} className={cn("shrink-0 rounded-[10px] bg-ink/[0.06] object-cover ring-1 ring-inset ring-ink/10", className)} />
  ) : (
    <span
      aria-hidden
      style={{ background: "linear-gradient(150deg, #ffb340 0%, #ff9500 100%)" }}
      className={cn("grid shrink-0 place-items-center rounded-[10px] text-white shadow-[inset_0_0.5px_0_rgb(255_255_255/0.45),0_0.5px_1px_rgb(0_0_0/0.2)]", className)}
    >
      <Sym name="book" className="h-[55%] w-[55%]" strokeWidth={1.8} />
    </span>
  );
}

function Tick({ on }: { on: boolean }) {
  return (
    <span aria-hidden className={cn("grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full border transition-colors duration-200", on ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line-strong text-transparent")}>
      <AnimatePresence initial={false}>
        {on && (
          <motion.span key="c" initial={{ scale: 0.3, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.3, opacity: 0, transition: { duration: 0.08 } }} transition={SPRING}>
            <Sym name="check" className="h-3 w-3" strokeWidth={2.8} />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  );
}

function SearchField({ value, onChange, placeholder, autoFocus }: { value: string; onChange: (v: string) => void; placeholder: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (!autoFocus || !window.matchMedia("(pointer: fine)").matches) return;
    const t = setTimeout(() => ref.current?.focus(), 220);
    return () => clearTimeout(t);
  }, [autoFocus]);
  return (
    <label className="flex h-9 items-center gap-2 rounded-[10px] bg-ink/[0.06] px-2.5 text-muted transition-shadow focus-within:shadow-[0_0_0_2px_color-mix(in_srgb,var(--gold-strong)_55%,transparent)]">
      <Sym name="search" className="h-4 w-4 shrink-0" />
      <input
        ref={ref} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-faint"
      />
      {value && (
        <button type="button" aria-label="Clear search" onClick={() => onChange("")} className="grid h-4 w-4 place-items-center rounded-full bg-ink/25 text-surface transition-transform active:scale-90">
          <Sym name="xmark" className="h-2.5 w-2.5" strokeWidth={3} />
        </button>
      )}
    </label>
  );
}

function Segmented<T extends string>({ id, tabs, value, onChange }: { id: string; tabs: { id: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="grid h-8 auto-cols-fr grid-flow-col rounded-[10px] bg-ink/[0.06] p-0.5">
      {tabs.map((t) => {
        const on = value === t.id;
        return (
          <button
            key={t.id} type="button" role="tab" aria-selected={on} onClick={() => { haptic.selection(); onChange(t.id); }}
            className={cn("relative rounded-[8px] text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-gold-strong/50", on ? "text-ink" : "text-muted hover:text-ink")}
          >
            {on && <motion.span layoutId={id} transition={SPRING} className="absolute inset-0 rounded-[8px] bg-surface shadow-[0_1px_3px_rgb(0_0_0/0.14),0_0_0_0.5px_rgb(0_0_0/0.06)]" />}
            <span className="relative">{t.label}</span>
          </button>
        );
      })}
    </div>
  );
}

const PrimaryButton = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button" {...p}
    className={cn("h-9 rounded-full bg-gold-strong px-5 text-[14px] font-semibold text-on-gold outline-none transition-[transform,opacity] hover:opacity-90 active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-40", p.className)}
  >
    {children}
  </button>
);
const GhostButton = ({ children, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
  <button
    type="button" {...p}
    className={cn("h-9 rounded-full px-4 text-[14px] font-medium text-gold outline-none transition-[background-color,transform] hover:bg-gold/10 active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50", p.className)}
  >
    {children}
  </button>
);

/**
 * The one sheet used by every flow here. A centred card on desktop; a bottom sheet on touch screens that
 * can be dragged down to dismiss. Renders on <body> above the trade sheet (z-70).
 */
function Sheet({ open, onClose, label, wide, children }: { open: boolean; onClose: () => void; label: string; wide?: boolean; children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  const drag = useDragControls();
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Capture phase: Esc closes this sheet only, never the trade sheet underneath it.
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.stopPropagation(); onClose(); } };
    window.addEventListener("keydown", key, true);
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", key, true); };
  }, [open, onClose]);

  if (!mounted) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="sheet" role="dialog" aria-modal="true" aria-label={label}
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0, transition: { duration: 0.16 } }} transition={{ duration: 0.18 }}
          className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-8"
        >
          <div onClick={onClose} className="absolute inset-0 bg-black/30 backdrop-blur-[10px] backdrop-saturate-150" />
          <motion.div
            initial={{ opacity: 0, y: 48, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 32, scale: 0.98, transition: { duration: 0.16 } }}
            transition={SPRING}
            drag="y" dragControls={drag} dragListener={false} dragConstraints={{ top: 0, bottom: 0 }} dragElastic={{ top: 0, bottom: 0.5 }}
            onDragEnd={(_, i) => { if (i.offset.y > 110 || i.velocity.y > 600) onClose(); }}
            className={cn(
              "relative flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[26px] bg-surface pb-[env(safe-area-inset-bottom)] sm:max-h-[min(82dvh,720px)] sm:rounded-[26px] sm:pb-0",
              "shadow-[0_48px_120px_-28px_rgb(0_0_0/0.5),0_12px_32px_-14px_rgb(0_0_0/0.22),0_0_0_0.5px_rgb(0_0_0/0.16),inset_0_0.5px_0_rgb(255_255_255/0.55)] dark:shadow-[0_48px_120px_-28px_rgb(0_0_0/0.8),0_0_0_0.5px_rgb(255_255_255/0.14),inset_0_0.5px_0_rgb(255_255_255/0.08)]",
              wide ? "sm:max-w-[720px]" : "sm:max-w-[520px]",
            )}
          >
            <div onPointerDown={(e) => drag.start(e)} className="flex h-6 shrink-0 cursor-grab touch-none items-center justify-center sm:hidden" aria-hidden>
              <span className="h-1 w-9 rounded-full bg-ink/20" />
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

function SheetHeader({ title, subtitle, onClose, aside }: { title: string; subtitle?: string; onClose: () => void; aside?: ReactNode }) {
  return (
    <header className="flex shrink-0 items-start justify-between gap-3 px-5 pb-3 pt-1 sm:px-6 sm:pt-5">
      <div className="min-w-0">
        <h2 className="text-[20px] font-semibold tracking-[-0.025em] text-ink">{title}</h2>
        {subtitle && <p className="mt-0.5 truncate text-[13.5px] text-muted">{subtitle}</p>}
      </div>
      <div className="-mr-1.5 flex shrink-0 items-center gap-0.5">
        {aside}
        <IconButton label="Close" icon="xmark" onClick={onClose} />
      </div>
    </header>
  );
}

const Skeleton = () => (
  <div className="space-y-1 px-3 py-1" aria-busy="true" aria-label="Loading">
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="flex animate-pulse items-center gap-3 rounded-[12px] px-2.5 py-2.5">
        <div className="h-11 w-11 rounded-[10px] bg-ink/[0.07]" />
        <div className="flex-1 space-y-2"><div className="h-3.5 w-3/5 rounded bg-ink/[0.07]" /><div className="h-3 w-2/5 rounded bg-ink/[0.05]" /></div>
      </div>
    ))}
  </div>
);

function Empty({ icon, title, body, action }: { icon: "book" | "search" | "tray"; title: string; body: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-8 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-[14px] bg-ink/[0.05] text-muted"><Sym name={icon} className="h-6 w-6" strokeWidth={1.4} /></span>
      <p className="mt-4 text-[16px] font-semibold tracking-[-0.015em] text-ink">{title}</p>
      <p className="mt-1 max-w-[280px] text-[14px] leading-snug text-muted">{body}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/* ───────────── Link lessons to a trade ───────────── */

type Scope = "all" | "mine" | "saved";

export function LessonPicker({ open, entry, onClose }: { open: boolean; entry: JournalEntry | null; onClose: () => void }) {
  const { lessons, byId, loading, failed, reload } = useLessonIndex();
  const [sel, setSel] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<Scope>("all");
  const [busy, setBusy] = useState(false);
  const initial = useRef<string[]>([]);

  // Start from what is linked now, every time the sheet opens.
  useEffect(() => {
    if (!open) return;
    const cur = entry?.lessonIds ?? [];
    initial.current = cur;
    setSel(cur); setQuery(""); setScope("all"); setBusy(false);
    void reload();
  }, [open, entry?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const list = useMemo(() => {
    const was = new Set(initial.current);
    const q = query.trim().toLowerCase();
    return (lessons ?? [])
      .filter((l) => (scope === "mine" ? l.mine : scope === "saved" ? l.savedByMe : true))
      .filter((l) => !q || [l.title, l.subtitle, l.excerpt, l.author.name].some((s) => s.toLowerCase().includes(q)))
      .sort((a, b) => Number(was.has(b.id)) - Number(was.has(a.id)) || b.createdAt - a.createdAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessons, query, scope, open]);

  const changed = sel.length !== initial.current.length || sel.some((id) => !initial.current.includes(id));
  const toggle = (id: string) => { haptic.selection(); setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id])); };

  const save = async () => {
    if (!entry) return;
    if (!changed) { onClose(); return; }
    setBusy(true);
    try {
      // Links to lessons that no longer exist are dropped quietly; the rest keep their order.
      const keep = lessons ? sel.filter((id) => byId.has(id)) : sel;
      await useApp.getState().setEntryLessons(entry.id, keep);
      haptic.success();
      toast.success(keep.length ? (keep.length === 1 ? "Lesson linked" : `${keep.length} lessons linked`) : "Lessons unlinked");
      onClose();
    } catch {
      toast.error("Couldn’t save the link", "Check your connection and try again.");
      setBusy(false);
    }
  };

  const tabs: { id: Scope; label: string }[] = [{ id: "all", label: "All" }, { id: "mine", label: "Mine" }, { id: "saved", label: "Saved" }];
  const none = !!lessons && lessons.length === 0;

  return (
    <Sheet open={open} onClose={onClose} label="Link lessons">
      <SheetHeader title="Link a lesson" subtitle={entry ? `${tradeTitle(entry)} · ${dayShort(entry.date)}` : undefined} onClose={onClose} />
      {!none && (
        <div className="shrink-0 space-y-2.5 px-5 pb-3 sm:px-6">
          <SearchField value={query} onChange={setQuery} placeholder="Search lessons" autoFocus={open} />
          <Segmented id="lesson-scope" tabs={tabs} value={scope} onChange={setScope} />
        </div>
      )}

      <div className="min-h-[220px] flex-1 overflow-y-auto overscroll-contain border-t border-line-soft py-1.5 [scrollbar-width:thin] [scrollbar-color:rgb(128_128_128/0.35)_transparent]">
        {loading ? <Skeleton /> : failed ? (
          <Empty icon="tray" title="Couldn’t load lessons" body="Check your connection and try again." action={<PrimaryButton onClick={() => void reload()}>Try again</PrimaryButton>} />
        ) : none ? (
          <Empty icon="book" title="No lessons yet" body="Write down what a trade taught you, then link it back here." action={<Link href="/lessons/new" onClick={onClose} className="inline-flex h-9 items-center rounded-full bg-gold-strong px-5 text-[14px] font-semibold text-on-gold transition-transform active:scale-95">Write a lesson</Link>} />
        ) : list.length === 0 ? (
          <Empty icon="search" title="Nothing found" body={query ? "Try another word." : scope === "saved" ? "Bookmark a lesson to find it here." : "No lessons in this view."} />
        ) : (
          <ul role="listbox" aria-multiselectable aria-label="Lessons" className="px-3">
            {list.map((l) => {
              const on = sel.includes(l.id);
              return (
                <li key={l.id} role="option" aria-selected={on}>
                  <button
                    type="button" onClick={() => toggle(l.id)}
                    className={cn("flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left outline-none transition-[background-color,transform] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-gold-strong/50", on ? "bg-gold/[0.10]" : "hover:bg-ink/[0.04] active:bg-ink/[0.07]")}
                  >
                    <LessonThumb l={l} className="h-11 w-11" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium tracking-[-0.01em] text-ink">{l.title}</span>
                      <span className="mt-px block truncate text-[12.5px] text-muted">{byline(l)} · {l.readMins} min · {fmtShort(l.createdAt)}</span>
                    </span>
                    <Tick on={on} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line-soft px-4 py-3 sm:px-5">
        <p className="num pl-1 text-[13px] text-muted" aria-live="polite">{sel.length === 0 ? "None linked" : `${sel.length} linked`}</p>
        <div className="flex items-center gap-1">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={() => void save()} disabled={busy || loading}>{busy ? "Saving…" : changed ? "Save" : "Done"}</PrimaryButton>
        </div>
      </footer>
    </Sheet>
  );
}

/* ───────────── Read a linked lesson, in place ───────────── */

export function LessonPeek({ id, onClose, onUnlink }: { id: string | null; onClose: () => void; onUnlink?: (id: string) => void }) {
  const [l, setL] = useState<LessonView | null | undefined>(undefined);
  const [failed, setFailed] = useState(false);
  const [tick, setTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!id) return;
    let live = true;
    setL(undefined); setFailed(false);
    fetch(`/api/lessons?id=${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (r) => {
        if (r.status === 404) return null;
        if (!r.ok) throw new Error(String(r.status));
        return ((await r.json()) as { lesson?: LessonView }).lesson ?? null;
      })
      .then((x) => { if (live) setL(x); })
      .catch(() => { if (live) { setFailed(true); setL(null); } });
    return () => { live = false; };
  }, [id, tick]);

  // Keep the last lesson on screen while the sheet animates out.
  const shown = useRef<LessonView | null>(null);
  if (l) shown.current = l;
  const lesson = l ?? (id ? null : shown.current);

  return (
    <Sheet open={!!id} onClose={onClose} label="Lesson" wide>
      <SheetHeader
        title={lesson?.title ?? (l === null ? (failed ? "Couldn’t load lesson" : "Lesson unavailable") : "Lesson")}
        subtitle={lesson ? `${byline(lesson)} · ${lesson.readMins} min read · ${fmtShort(lesson.createdAt)}` : undefined}
        onClose={onClose}
      />
      <div ref={bodyRef} className="min-h-[200px] flex-1 overflow-y-auto overscroll-contain border-t border-line-soft px-5 py-5 sm:px-8 [scrollbar-width:thin] [scrollbar-color:rgb(128_128_128/0.35)_transparent]">
        {l === undefined && id ? (
          <div className="animate-pulse space-y-3" aria-busy="true">{[100, 92, 100, 78, 100, 60].map((w, i) => <div key={i} className="h-4 rounded bg-ink/[0.06]" style={{ width: `${w}%` }} />)}</div>
        ) : lesson ? (
          <article>
            {lesson.subtitle && <p className="mb-5 text-pretty text-[17px] leading-[1.5] text-muted">{lesson.subtitle}</p>}
            {lesson.customCover && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={lesson.customCover} alt="" decoding="async" className="mb-6 aspect-[16/10] w-full rounded-[16px] object-cover ring-1 ring-inset ring-ink/10" />
            )}
            <div className="lesson-prose" style={{ fontSize: "1.0625rem", lineHeight: 1.72 }} dangerouslySetInnerHTML={{ __html: lesson.html }} />
          </article>
        ) : (
          <Empty
            icon="book" title={failed ? "Couldn’t load this lesson" : "This lesson isn’t available"}
            body={failed ? "Check your connection and try again." : "It may have been deleted, or it isn’t shared with you any more."}
            action={failed ? <PrimaryButton onClick={() => setTick((t) => t + 1)}>Try again</PrimaryButton> : undefined}
          />
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line-soft px-4 py-3 sm:px-5">
        {id && onUnlink ? (
          <button type="button" onClick={() => onUnlink(id)} className="flex h-9 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-medium text-loss outline-none transition-[background-color,transform] hover:bg-loss/10 active:scale-95 focus-visible:ring-2 focus-visible:ring-loss/40">
            <Sym name="unlink" className="h-4 w-4" />Unlink
          </button>
        ) : <span />}
        {id && lesson && (
          <Link href={`/lessons/${id}`} className="inline-flex h-9 items-center gap-1.5 rounded-full bg-gold-strong px-5 text-[14px] font-semibold text-on-gold outline-none transition-[transform,opacity] hover:opacity-90 active:scale-95 focus-visible:ring-2 focus-visible:ring-gold-strong/50 focus-visible:ring-offset-2">
            Open lesson<Sym name="arrowUpRight" className="h-4 w-4" strokeWidth={2} />
          </Link>
        )}
      </footer>
    </Sheet>
  );
}

/* ───────────── The same link, started from a lesson ───────────── */

export function TradePicker({ open, lessonId, lessonTitle, onClose }: { open: boolean; lessonId: string; lessonTitle?: string; onClose: () => void }) {
  const entries = useApp((s) => s.entries);
  const currency = useApp((s) => s.settings.currency);
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const initial = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!open) return;
    const cur = new Set(useApp.getState().entries.filter((e) => e.lessonIds?.includes(lessonId)).map((e) => e.id));
    initial.current = cur;
    setSel(new Set(cur)); setQuery(""); setBusy(false);
  }, [open, lessonId]);

  const list = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...entries]
      .filter((e) => !q || [e.instrument, e.direction ?? "", e.setup, e.date, e.notes].some((s) => (s ?? "").toLowerCase().includes(q)))
      .sort((a, b) => Number(initial.current.has(b.id)) - Number(initial.current.has(a.id)) || b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, query, open]);

  const changed = sel.size !== initial.current.size || [...sel].some((id) => !initial.current.has(id));
  const toggle = (id: string) => { haptic.selection(); setSel((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; }); };

  const save = async () => {
    if (!changed) { onClose(); return; }
    setBusy(true);
    try {
      await useApp.getState().setLessonTrades(lessonId, [...sel]);
      haptic.success();
      toast.success(sel.size ? (sel.size === 1 ? "Trade linked" : `${sel.size} trades linked`) : "Trades unlinked");
      onClose();
    } catch {
      toast.error("Couldn’t save the link", "Check your connection and try again.");
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} label="Link trades">
      <SheetHeader title="Link trades" subtitle={lessonTitle ? `to “${lessonTitle}”` : undefined} onClose={onClose} />
      {entries.length > 0 && (
        <div className="shrink-0 px-5 pb-3 sm:px-6"><SearchField value={query} onChange={setQuery} placeholder="Search by symbol, setup or date" autoFocus={open} /></div>
      )}
      <div className="min-h-[220px] flex-1 overflow-y-auto overscroll-contain border-t border-line-soft py-1.5 [scrollbar-width:thin] [scrollbar-color:rgb(128_128_128/0.35)_transparent]">
        {entries.length === 0 ? (
          <Empty icon="tray" title="No trades yet" body="Log a trade in your journal, then link it to this lesson." />
        ) : list.length === 0 ? (
          <Empty icon="search" title="Nothing found" body="Try another symbol, setup or date." />
        ) : (
          <ul role="listbox" aria-multiselectable aria-label="Trades" className="px-3">
            {list.map((e) => {
              const on = sel.has(e.id);
              return (
                <li key={e.id} role="option" aria-selected={on}>
                  <button
                    type="button" onClick={() => toggle(e.id)}
                    className={cn("flex w-full items-center gap-3 rounded-[12px] px-2.5 py-2 text-left outline-none transition-[background-color,transform] duration-150 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-gold-strong/50", on ? "bg-gold/[0.10]" : "hover:bg-ink/[0.04] active:bg-ink/[0.07]")}
                  >
                    <span className={cn("grid h-11 w-11 shrink-0 place-items-center rounded-[10px] bg-ink/[0.05]", tone(e.pnl))}>
                      <Sym name={e.direction === "short" ? "arrowDownRight" : "arrowUpRight"} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-medium capitalize tracking-[-0.01em] text-ink">{tradeTitle(e)}</span>
                      <span className="mt-px block truncate text-[12.5px] text-muted">{[dayShort(e.date), e.setup].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className={cn("kpi text-[14px] tabular-nums", tone(e.pnl))}>{formatSignedMoney(e.pnl, currency)}</span>
                    <Tick on={on} />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-line-soft px-4 py-3 sm:px-5">
        <p className="num pl-1 text-[13px] text-muted" aria-live="polite">{sel.size === 0 ? "None linked" : `${sel.size} linked`}</p>
        <div className="flex items-center gap-1">
          <GhostButton onClick={onClose}>Cancel</GhostButton>
          <PrimaryButton onClick={() => void save()} disabled={busy}>{busy ? "Saving…" : changed ? "Save" : "Done"}</PrimaryButton>
        </div>
      </footer>
    </Sheet>
  );
}

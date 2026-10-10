"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import { btn, btnPrimary } from "@/components/lessons/buttons";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { EASE } from "@/components/journal/journal-ui";
import { Sym } from "@/components/journal/symbols";
import { ChevronLeftIcon, PlusIcon } from "@/components/practice/icons";
import { IctComposer } from "@/components/practice/ict-composer";
import { IctSidebar } from "@/components/practice/ict-sidebar";
import { IctToolbar, type Crumb, type ViewMode } from "@/components/practice/ict-toolbar";
import { ConceptFolders, Timeline } from "@/components/practice/ict-views";
import { ModeBadge } from "@/components/practice/modes";
import "@/components/practice/practice.css";
import { deleteCard } from "@/lib/practice/ict-store";
import {
  conceptFacets, filterCards, inLens, needsPractice, sortCards, summarize, tagFacets, UNSORTED,
  type Lens, type SortKey, type StatusFilter,
} from "@/lib/practice/ict-library";
import type { GameProgress, IctCard } from "@/lib/practice/progress-ext";
import { cn } from "@/lib/utils";

const VIEW_KEY = "edgebook.ict.view";
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/**
 * ICT Lab — your question deck, organised like the Journal.
 *   Browse  → sidebar (Library · Concepts · Tags) and a List / Grid / Concepts switcher
 *   Find    → Search, filters and sort in one quiet toolbar
 *   Edit    → click a question; the same sheet you used to write it
 * Every list, count and folder is derived from the saved cards; this file only owns view state.
 */
export default function IctLabPage() {
  const settings = useApp((s) => s.settings);
  const cards = useMemo(() => (settings.practiceProgress as GameProgress | undefined)?.ictCards ?? [], [settings.practiceProgress]);

  // ── view state ────────────────────────────────────────────────
  const [view, setViewState] = useState<ViewMode>("list");
  const [lens, setLens] = useState<Lens>({ kind: "all" });
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<StatusFilter>("any");
  const [photo, setPhoto] = useState(false);
  const [sort, setSort] = useState<SortKey>("concept");

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === "list" || v === "grid" || v === "folders") setViewState(v); } catch { /* ignore */ }
  }, []);
  const setView = (v: ViewMode) => { haptic.selection(); setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };

  // ── overlays ──────────────────────────────────────────────────
  const [editing, setEditing] = useState<IctCard | null>(null);
  const [composer, setComposer] = useState(false);
  const [doomed, setDoomed] = useState<IctCard | null>(null);
  const [busy, setBusy] = useState(false);
  const [collapsed, setCollapsed] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);

  // The navigator docks beside the content only when the page itself is wide enough (measured, not viewport-based);
  // otherwise it is a slide-over sheet, so desktop-in-a-narrow-column, tablet and phone share one layout.
  const rootRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 1040));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── derived data ──────────────────────────────────────────────
  const concepts = useMemo(() => conceptFacets(cards), [cards]);
  const tags = useMemo(() => tagFacets(cards), [cards]);
  const needs = useMemo(() => cards.filter(needsPractice).length, [cards]);

  // A concept or tag that no longer exists (its last question was deleted or moved) falls back to "All".
  const effLens: Lens = useMemo(() => {
    if (lens.kind === "concept" && !concepts.some((c) => c.key.toLowerCase() === lens.name.toLowerCase())) return { kind: "all" };
    if (lens.kind === "tag" && !tags.some((t) => t.key === lens.name)) return { kind: "all" };
    return lens;
  }, [lens, concepts, tags]);

  const base = useMemo(() => inLens(cards, effLens), [cards, effLens]);
  const filtered = useMemo(() => sortCards(filterCards(base, { status, photo, query }), sort), [base, status, photo, query, sort]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const folderFacets = useMemo(() => conceptFacets(filtered), [filtered]);

  const searching = query.trim().length > 0;
  const filtersActive = status !== "any" || photo || searching;
  const rootTitle = effLens.kind === "practice" ? "Needs practice" : effLens.kind === "concept" ? effLens.name : effLens.kind === "tag" ? `#${effLens.name}` : "ICT Lab";
  const atRoot = effLens.kind === "all";
  const showFolders = view === "folders" && !searching && (effLens.kind === "all" || effLens.kind === "practice");
  const grouped = sort === "concept" && !searching && effLens.kind !== "concept";
  const namedConcepts = concepts.filter((c) => c.key !== UNSORTED).length;

  const crumbs: Crumb[] = useMemo(() => {
    const out: Crumb[] = [{ label: "ICT Lab", onClick: () => setLens({ kind: "all" }) }];
    if (effLens.kind !== "all") out.push({ label: rootTitle, onClick: () => undefined });
    return out;
  }, [effLens.kind, rootTitle]);

  // ── layout plumbing (sticky toolbar + its measured height for sticky group headers) ──
  const searchRef = useRef<HTMLInputElement>(null);
  const tbRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [tbH, setTbH] = useState(52);
  const [scrolled, setScrolled] = useState(false);
  const empty = cards.length === 0;
  useEffect(() => {
    const el = tbRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setTbH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, [empty]);
  useEffect(() => {
    const el = sentinelRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, [empty]);

  // "/" focuses search, like the Journal.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable) return;
      if (e.key === "/" && !e.metaKey && !e.ctrlKey && !e.altKey) { e.preventDefault(); searchRef.current?.focus(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ── actions ───────────────────────────────────────────────────
  const goLens = useCallback((l: Lens) => { setLens(l); setMobileNav(false); }, []);
  const openNew = () => { setEditing(null); setComposer(true); };
  const openEdit = useCallback((card: IctCard) => { setEditing(card); setComposer(true); }, []);
  const askDelete = useCallback((card: IctCard) => setDoomed(card), []);
  const clearFilters = () => { setQuery(""); setStatus("any"); setPhoto(false); };
  const toggleSidebar = () => { if (wide) setCollapsed((c) => !c); else setMobileNav(true); };
  const confirmDelete = async () => {
    if (!doomed) return;
    setBusy(true);
    try { await deleteCard(doomed); toast.success("Question deleted"); setDoomed(null); } catch { toast.error("Couldn't delete that question."); } finally { setBusy(false); }
  };
  const actions = useMemo(() => ({ onOpen: openEdit, onDelete: askDelete }), [openEdit, askDelete]);

  // ── content ───────────────────────────────────────────────────
  let content: React.ReactNode = null;
  if (!empty && filtered.length === 0) {
    const caughtUp = effLens.kind === "practice" && !filtersActive;
    content = (
      <EmptyState
        icon={<Sym name={caughtUp ? "check" : "search"} className="h-6 w-6" />}
        title={caughtUp ? "All caught up" : "Nothing matches"}
        body={caughtUp ? "Every question is played and above 70%. Add more, or play a round." : "Try another word, or clear the filters."}
        action={filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
      />
    );
  } else if (!empty && showFolders) {
    content = <ConceptFolders facets={folderFacets} cards={filtered} onOpen={(name) => { haptic.selection(); goLens({ kind: "concept", name }); }} />;
  } else if (!empty) {
    content = <Timeline cards={filtered} layout={view === "grid" ? "grid" : "list"} grouped={grouped} p={actions} onConcept={(name) => { haptic.selection(); goLens({ kind: "concept", name }); }} />;
  }

  const sidebar = <IctSidebar total={cards.length} needs={needs} concepts={concepts} tags={tags} lens={effLens} onLens={goLens} />;

  return (
    <div ref={rootRef} className="flex min-h-[calc(100dvh-4rem)]" style={{ "--tb": `${tbH}px` } as CSSProperties}>
      {/* Sidebar — desktop */}
      {wide && !empty && (
        <aside className={cn("shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(.32,.72,0,1)]", collapsed ? "w-0" : "w-[236px]")} aria-hidden={collapsed}>
          <div className="sticky top-0 h-[100dvh] w-[236px] overflow-y-auto pr-3 pt-1">{sidebar}</div>
        </aside>
      )}

      {/* Sidebar — small screens */}
      <AnimatePresence>
        {mobileNav && !wide && !empty && (
          <div className="fixed inset-0 z-50">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNav(false)} className="absolute inset-0 bg-black/30" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 0.35, ease: EASE }} className="absolute inset-y-0 left-0 w-[280px] overflow-y-auto bg-surface/95 pt-4 shadow-2xl backdrop-blur-2xl">
              {sidebar}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="min-w-0 flex-1 pb-28">
        <Link href="/practice" className="inline-flex items-center gap-0.5 text-[15px] font-medium text-gold-deep transition-opacity hover:opacity-70 dark:text-gold"><ChevronLeftIcon className="-ml-1.5 h-5 w-5" />Practice</Link>

        {!empty && (
          <>
            <div ref={sentinelRef} className="h-px" aria-hidden />
            <div ref={tbRef} className={cn("sticky top-0 z-30 mt-1 border-b bg-canvas/80 backdrop-blur-xl transition-colors duration-200", scrolled ? "border-line-soft" : "border-transparent")}>
              <IctToolbar
                view={view} onView={setView} crumbs={crumbs} onUp={atRoot ? undefined : () => { haptic.selection(); setLens({ kind: "all" }); }} onSidebar={toggleSidebar}
                query={query} onQuery={setQuery} searchRef={searchRef}
                status={status} onStatus={setStatus} photo={photo} onPhoto={setPhoto}
                sort={sort} onSort={setSort}
              />
            </div>
          </>
        )}

        <header className={cn("flex flex-wrap items-end justify-between gap-4", empty ? "pt-5" : "pb-5 pt-5 sm:pt-7")}>
          <div className="flex min-w-0 items-center gap-4">
            {empty && <ModeBadge mode="ict" size="lg" />}
            <div className="min-w-0">
              <h1 className="font-display text-[32px] font-semibold tracking-[-0.03em] text-ink sm:text-[36px]">{searching ? "Search" : rootTitle}</h1>
              <p className="mt-1 text-[14.5px] text-muted">
                {empty ? "Your own questions, replayed until they stick." : summary.count === 0 ? "No questions." : (
                  <>
                    {plural(summary.count, "question")}
                    {atRoot && !searching && namedConcepts > 0 ? ` across ${plural(namedConcepts, "concept")}` : ""}.
                    {summary.acc !== null
                      ? <> <span className="font-semibold tabular-nums text-ink">{summary.acc}%</span> right on average{summary.needs > 0 ? `, ${summary.needs} to practise` : ""}.</>
                      : " None played yet."}
                  </>
                )}
                {filtersActive && !searching && <> <button type="button" onClick={clearFilters} className="font-medium text-gold hover:opacity-75">Clear filters</button></>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2.5">
            {!empty && <Link href="/practice?mode=ict" className={btnPrimary}><Sym name="play" className="h-4 w-4" />Play</Link>}
            {!empty && <button type="button" className={btn} onClick={openNew}><PlusIcon className="h-4 w-4" />New question</button>}
          </div>
        </header>

        {empty ? (
          <div className="pr-surface mt-8 px-6 py-14 text-center sm:px-10">
            <ModeBadge mode="ict" size="lg" className="mx-auto" />
            <h2 className="mt-6 text-[22px] font-semibold tracking-[-0.025em] text-ink">Add your first question</h2>
            <p className="mx-auto mt-2 max-w-sm text-[14.5px] leading-relaxed text-muted">Write an ICT idea you want to remember, file it under a concept, attach the chart, and type the answer. The game turns it into multiple choice, true/false and fill-in-the-blank.</p>
            <button type="button" className={cn(btnPrimary, "mt-7")} onClick={openNew}><PlusIcon className="h-4 w-4" />New question</button>
          </div>
        ) : (
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${view}:${showFolders ? "folders" : "flat"}:${effLens.kind}:${"name" in effLens ? effLens.name : ""}`}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, transition: { duration: 0.12 } }}
              transition={{ type: "spring", stiffness: 420, damping: 36 }}
            >
              {content}
            </motion.div>
          </AnimatePresence>
        )}
      </main>

      <IctComposer open={composer} card={editing} onClose={() => setComposer(false)} />
      <ConfirmDialog open={!!doomed} onClose={() => setDoomed(null)} onConfirm={() => void confirmDelete()} busy={busy} title="Delete this question?" body="The question, its answer and its pictures are removed. This can't be undone." />
    </div>
  );
}

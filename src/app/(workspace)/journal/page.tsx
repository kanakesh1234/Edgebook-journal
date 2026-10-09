"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp, persistFailedSince } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { tradesForSetup } from "@/lib/setup-stats";
import { formatSignedMoney } from "@/lib/format";
import { haptic } from "@/lib/haptics";
import { EmptyState } from "@/components/ui/misc";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { toast } from "@/components/ui/toast";
import { EntryDetailModal } from "@/components/journal/entry-detail-modal";
import { EntryFormModal } from "@/components/journal/entry-form-modal";
import { SetupDetail } from "@/components/lab/setup-detail";
import { Sym } from "@/components/journal/symbols";
import { ContextMenu, EASE, MenuDivider, MenuItem, SPRING } from "@/components/journal/journal-ui";
import { JournalToolbar, type Crumb } from "@/components/journal/journal-toolbar";
import { SidebarContent } from "@/components/journal/journal-sidebar";
import { FolderList, Timeline, type Money, type RowProps } from "@/components/journal/journal-views";
import {
  buildTree, childrenOf, filterEntries, needsReview, parentPath, pathLabel, pct, sortEntries, summarize,
  type Lens, type Outcome, type SortKey, type ViewMode,
} from "@/components/journal/journal-model";
import { cn } from "@/lib/utils";

const VIEW_KEY = "edgebook.journal.view-v2";

/**
 * Journal — a logbook you browse like Files or Photos.
 *   Browse  → sidebar (Library · Dates · Setups) and a List / Grid / Folders switcher
 *   Find    → Search, Go to date, filters, sort — all in one quiet toolbar
 *   Open    → single click, ← → to step through the visible order, right-click for actions
 *   Review  → the entry sheet; Learn → "Next time" and the setup folders
 * All data comes from the existing store; this file only owns view state.
 */
export default function JournalPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const playbook = useMemo(() => settings.playbook ?? [], [settings]);
  const money: Money = useCallback((n) => formatSignedMoney(n, settings.currency), [settings.currency]);

  // ── view state ────────────────────────────────────────────────
  const [view, setViewState] = useState<ViewMode>("grid");
  const [lens, setLens] = useState<Lens>({ kind: "all" });
  const [path, setPathState] = useState(""); // "" | YYYY | YYYY-MM | YYYY-MM-DD
  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [instrument, setInstrument] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");
  const dirRef = useRef(1);

  useEffect(() => {
    try { const v = localStorage.getItem(VIEW_KEY); if (v === "list" || v === "grid" || v === "folders") setViewState(v); } catch { /* ignore */ }
  }, []);
  const setView = (v: ViewMode) => { haptic.selection(); setViewState(v); try { localStorage.setItem(VIEW_KEY, v); } catch { /* ignore */ } };
  const setPath = useCallback((next: string) => {
    setPathState((cur) => { dirRef.current = next.length >= cur.length ? 1 : -1; return next; });
    setMobileNav(false);
  }, []);

  // ── overlays ──────────────────────────────────────────────────
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [openSetupId, setOpenSetupId] = useState<string | null>(null);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [menu, setMenu] = useState<{ entry: JournalEntry; x: number; y: number } | null>(null);
  // The navigator starts closed; the sidebar button in the toolbar opens it.
  const [collapsed, setCollapsed] = useState(true);
  const [mobileNav, setMobileNav] = useState(false);
  // The navigator docks beside the content only when the page itself is wide enough (measured, not viewport-based);
  // otherwise it is a slide-over sheet, so desktop-in-a-narrow-column, tablet and phone all share one layout.
  const rootRef = useRef<HTMLDivElement>(null);
  const [wide, setWide] = useState(false);
  useLayoutEffect(() => {
    const el = rootRef.current; if (!el) return;
    const ro = new ResizeObserver(([e]) => setWide(e.contentRect.width >= 1040));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ── selection ─────────────────────────────────────────────────
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const anchorRef = useRef<string | null>(null);

  // ── derived data ──────────────────────────────────────────────
  const setupInfos = useMemo(() => playbook.map((s) => ({ setup: s, trades: tradesForSetup(s, entries) })), [playbook, entries]);
  const activeSetup = lens.kind === "setup" ? setupInfos.find((i) => i.setup.id === lens.id) ?? null : null;
  const effLens: Lens = lens.kind === "setup" && !activeSetup ? { kind: "all" } : lens;

  const base = useMemo(() => {
    if (effLens.kind === "review") return entries.filter(needsReview);
    if (effLens.kind === "setup" && activeSetup) { const ids = new Set(activeSetup.trades.map((t) => t.id)); return entries.filter((e) => ids.has(e.id)); }
    return entries;
  }, [entries, effLens.kind, activeSetup]);

  const tree = useMemo(() => buildTree(base), [base]);
  const scoped = useMemo(() => (path ? base.filter((e) => e.date.startsWith(path)) : base), [base, path]);
  const filtered = useMemo(() => sortEntries(filterEntries(scoped, { outcome, instrument, query }), sort), [scoped, outcome, instrument, query, sort]);
  const folderNodes = useMemo(() => childrenOf(buildTree(filtered, sort === "oldest"), path), [filtered, sort, path]);
  const summary = useMemo(() => summarize(filtered), [filtered]);
  const instruments = useMemo(() => [...new Set(entries.map((e) => e.instrument))].filter((i) => i !== "—").sort(), [entries]);
  const reviewCount = useMemo(() => entries.filter(needsReview).length, [entries]);

  // If the folder you're in empties out (deleted trades), step back up.
  useEffect(() => { if (path && !base.some((e) => e.date.startsWith(path))) setPath(parentPath(path)); }, [base, path, setPath]);

  const searching = query.trim().length > 0;
  const chronological = sort === "newest" || sort === "oldest";
  const rootTitle = effLens.kind === "review" ? "Needs review" : effLens.kind === "setup" ? activeSetup?.setup.name ?? "Journal" : "Journal";
  const title = path ? pathLabel(path) : rootTitle;
  const filtersActive = outcome !== "all" || instrument !== "all" || searching;

  const crumbs: Crumb[] = useMemo(() => {
    const out: Crumb[] = [{ label: rootTitle, onClick: () => setPath("") }];
    if (path.length >= 4) out.push({ label: path.slice(0, 4), onClick: () => setPath(path.slice(0, 4)) });
    if (path.length >= 7) out.push({ label: pathLabel(path.slice(0, 7)).split(" ")[0], onClick: () => setPath(path.slice(0, 7)) });
    if (path.length === 10) out.push({ label: pathLabel(path), onClick: () => setPath(path) });
    return out;
  }, [rootTitle, path, setPath]);

  // ── refs / layout plumbing ────────────────────────────────────
  const searchRef = useRef<HTMLInputElement>(null);
  const tbRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const [tbH, setTbH] = useState(52);
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const el = tbRef.current; if (!el) return;
    const ro = new ResizeObserver(() => setTbH(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  useEffect(() => {
    const el = sentinelRef.current; if (!el) return;
    const io = new IntersectionObserver(([e]) => setScrolled(!e.isIntersecting));
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // ── selection helpers ─────────────────────────────────────────
  const selectedCount = useMemo(() => entries.filter((e) => selectedIds.has(e.id)).length, [entries, selectedIds]);
  const allInView = filtered.length > 0 && filtered.every((e) => selectedIds.has(e.id));
  const exitSelect = useCallback(() => { setSelectMode(false); setSelectedIds(new Set()); anchorRef.current = null; }, []);
  const toggleAll = () => setSelectedIds((prev) => {
    const next = new Set(prev);
    if (filtered.every((e) => next.has(e.id))) filtered.forEach((e) => next.delete(e.id)); else filtered.forEach((e) => next.add(e.id));
    return next;
  });
  const onToggle = useCallback((entry: JournalEntry, shift: boolean) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      const a = anchorRef.current ? filtered.findIndex((e) => e.id === anchorRef.current) : -1;
      const b = filtered.findIndex((e) => e.id === entry.id);
      if (shift && a >= 0 && b >= 0) { const [lo, hi] = a < b ? [a, b] : [b, a]; for (let i = lo; i <= hi; i++) next.add(filtered[i].id); }
      else if (next.has(entry.id)) next.delete(entry.id); else next.add(entry.id);
      return next;
    });
    anchorRef.current = entry.id;
  }, [filtered]);

  // ── navigation actions ────────────────────────────────────────
  const goUp = () => { haptic.selection(); setPath(parentPath(path)); };
  const clearFilters = () => { setQuery(""); setOutcome("all"); setInstrument("all"); };
  const jumpToDate = (date: string) => {
    if (!date || entries.length === 0) return;
    const all = [...new Set(entries.map((e) => e.date))].sort();
    const target = [...all].reverse().find((d) => d <= date) ?? all[0];
    setLens({ kind: "all" }); clearFilters(); setSort("newest");
    setPath(view === "folders" ? target : target.slice(0, 7));
    haptic.selection();
    if (view !== "folders") requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`day-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" })));
  };
  const toggleSidebar = () => { if (wide) setCollapsed((c) => !c); else setMobileNav(true); };

  // ── keyboard ──────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable;
      if (typing) return;
      if (e.key === "/") { e.preventDefault(); searchRef.current?.focus(); }
      else if (e.key === "Escape" && selectMode && !viewingId) exitSelect();
      else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "a" && selectMode) { e.preventDefault(); setSelectedIds(new Set(filtered.map((x) => x.id))); }
      else if (e.key === "Backspace" && path && !viewingId && !editing && !deleting) { e.preventDefault(); setPath(parentPath(path)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectMode, viewingId, editing, deleting, path, filtered, exitSelect, setPath]);

  // ── review sheet ──────────────────────────────────────────────
  const viewing = entries.find((e) => e.id === viewingId) ?? null;
  const viewIndex = viewingId ? filtered.findIndex((e) => e.id === viewingId) : -1;
  const stepView = (d: 1 | -1) => { const n = filtered[viewIndex + d]; if (n) { haptic.selection(); setViewingId(n.id); } };
  const onOpen = useCallback((e: JournalEntry) => setViewingId(e.id), []);
  const onContext = useCallback((entry: JournalEntry, x: number, y: number) => setMenu({ entry, x, y }), []);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    const t0 = Date.now();
    try {
      await useApp.getState().deleteEntry(deleting.id);
      if (!persistFailedSince(t0)) toast.success("Entry deleted");
      setViewingId(null); setDeleting(null);
    } catch { toast.error("Could not delete the entry"); } finally { setDeleteBusy(false); }
  };
  const confirmBulkDelete = async () => {
    const ids = entries.filter((e) => selectedIds.has(e.id)).map((e) => e.id);
    if (ids.length === 0) return;
    setBulkBusy(true);
    const t0 = Date.now();
    try {
      const removed = await useApp.getState().deleteEntries(ids);
      if (!persistFailedSince(t0)) toast.success(`${removed} ${removed === 1 ? "entry" : "entries"} deleted`);
      setBulkOpen(false); exitSelect();
    } catch { toast.error("Could not delete the selected entries"); } finally { setBulkBusy(false); }
  };

  const rowProps: RowProps = { money, selectMode, selectedIds, onOpen, onToggle, onContext };
  const sidebar = (
    <SidebarContent
      total={entries.length} review={reviewCount} tree={tree} path={path} lens={effLens}
      setups={setupInfos.map((i) => ({ id: i.setup.id, name: i.setup.name, count: i.trades.length }))}
      onLens={(l) => { setLens(l); }} onPath={setPath}
    />
  );

  // ── content ───────────────────────────────────────────────────
  const empty = entries.length === 0;
  const showFolders = view === "folders" && !searching && path.length < 10;
  let content: React.ReactNode;
  if (empty) {
    content = <EmptyState icon={<Sym name="book" className="h-7 w-7" />} title="Your journal awaits its first page" body="Log today's session — result, R multiple, screenshots — and the analytics start building themselves." />;
  } else if (filtered.length === 0) {
    content = (
      <EmptyState
        icon={<Sym name="search" className="h-6 w-6" />}
        title={effLens.kind === "review" && !filtersActive ? "All caught up" : "Nothing matches"}
        body={effLens.kind === "review" && !filtersActive ? "Every trade in this view has been reviewed." : "Try another word, or clear the filters."}
        action={filtersActive ? <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button> : undefined}
      />
    );
  } else if (showFolders) {
    content = <FolderList nodes={folderNodes} money={money} onOpen={(k) => { haptic.selection(); setPath(k); }} />;
  } else {
    content = <Timeline entries={filtered} layout={view === "grid" ? "grid" : "list"} grouped={chronological && !searching} p={rowProps} />;
  }

  return (
    <div ref={rootRef} className="flex min-h-[calc(100dvh-4rem)]" style={{ "--tb": `${tbH}px` } as CSSProperties}>
      {/* Sidebar — desktop */}
      {wide && (
        <aside className={cn("shrink-0 overflow-hidden transition-[width] duration-300 ease-[cubic-bezier(.32,.72,0,1)]", collapsed ? "w-0" : "w-[236px]")} aria-hidden={collapsed}>
          <div className="sticky top-0 h-[100dvh] w-[236px] overflow-y-auto pr-3 pt-1">{sidebar}</div>
        </aside>
      )}

      {/* Sidebar — small screens */}
      <AnimatePresence>
        {mobileNav && !wide && (
          <div className="fixed inset-0 z-50">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNav(false)} className="absolute inset-0 bg-black/30" />
            <motion.div initial={{ x: "-100%" }} animate={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 0.35, ease: EASE }} className="absolute inset-y-0 left-0 w-[280px] overflow-y-auto bg-surface/95 pt-4 shadow-2xl backdrop-blur-2xl">
              {sidebar}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <main className="min-w-0 flex-1 pb-28">
        <div ref={sentinelRef} className="h-px" aria-hidden />
        <div ref={tbRef} className={cn("sticky top-0 z-30 border-b bg-canvas/80 backdrop-blur-xl transition-colors duration-200", scrolled ? "border-line-soft" : "border-transparent")}>
          <JournalToolbar
            view={view} onView={setView} crumbs={crumbs} onUp={path ? goUp : undefined} onSidebar={toggleSidebar}
            query={query} onQuery={setQuery} searchRef={searchRef}
            outcome={outcome} onOutcome={setOutcome} instrument={instrument} instruments={instruments} onInstrument={setInstrument}
            sort={sort} onSort={setSort} onJump={jumpToDate}
            selectMode={selectMode} onSelectMode={() => (selectMode ? exitSelect() : setSelectMode(true))} canSelect={!empty && !showFolders}
          />
        </div>

        {!empty && (
          <header className="pb-5 pt-5 sm:pt-7">
            <div className="flex items-start justify-between gap-4">
              <h1 className="font-display text-[32px] font-semibold tracking-[-0.03em] text-ink sm:text-[36px]">{searching ? "Search" : title}</h1>
              {activeSetup && !path && (
                <Button variant="outline" size="sm" onClick={() => setOpenSetupId(activeSetup.setup.id)}>Setup details</Button>
              )}
            </div>
            <p className="mt-1 text-[14.5px] text-muted">
              {summary.count === 0 ? "No trades" : (
                <>
                  <span className={cn("font-semibold tabular-nums", summary.net > 0 ? "text-profit" : summary.net < 0 ? "text-loss" : "text-ink")}>{money(summary.net)}</span>
                  {` across ${summary.count} ${summary.count === 1 ? "trade" : "trades"}. ${pct(summary.wins, summary.count)} won${summary.avgR != null ? `, ${summary.avgR > 0 ? "+" : ""}${summary.avgR.toFixed(2)}R on average` : ""}.`}
                </>
              )}
              {searching && path && (
                <> Searching in {pathLabel(path)}. <button type="button" onClick={() => setPath("")} className="font-medium text-gold hover:opacity-75">Search all</button></>
              )}
              {filtersActive && !searching && <> <button type="button" onClick={clearFilters} className="font-medium text-gold hover:opacity-75">Clear filters</button></>}
            </p>
          </header>
        )}

        <AnimatePresence mode="wait" initial={false} custom={dirRef.current}>
          <motion.div
            key={`${view}:${showFolders ? path : "flat"}:${effLens.kind}`}
            custom={dirRef.current}
            variants={{ in: (d: number) => ({ opacity: 0, x: showFolders ? d * 28 : 0, y: showFolders ? 0 : 6 }), on: { opacity: 1, x: 0, y: 0 }, out: (d: number) => ({ opacity: 0, x: showFolders ? -d * 20 : 0, transition: { duration: 0.12 } }) }}
            initial="in" animate="on" exit="out" transition={SPRING}
            className=""
          >
            {content}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Selection bar */}
      <AnimatePresence>
        {selectMode && (
          <motion.div
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 24 }} transition={SPRING}
            className="fixed bottom-6 left-1/2 z-40 flex -translate-x-1/2 items-center gap-1 rounded-[16px] bg-surface/90 p-1.5 pl-4 shadow-[0_12px_40px_-8px_rgb(0_0_0/0.3),0_0_0_0.5px_rgb(0_0_0/0.12)] backdrop-blur-2xl"
          >
            <p className="mr-2 text-[14px] text-muted"><b className="font-semibold text-ink">{selectedCount}</b> selected</p>
            <button type="button" onClick={toggleAll} className="h-8 rounded-[10px] px-3 text-[14px] font-medium text-gold transition-colors hover:bg-gold/10 active:scale-[0.97]">{allInView ? "Deselect all" : "Select all"}</button>
            <button type="button" disabled={selectedCount === 0} onClick={() => setBulkOpen(true)} className="flex h-8 items-center gap-1.5 rounded-[10px] px-3 text-[14px] font-medium text-loss transition-[background-color,transform] hover:bg-loss/10 active:scale-[0.97] disabled:pointer-events-none disabled:opacity-30">
              <Sym name="trash" className="h-4 w-4" />Delete
            </button>
            <button type="button" onClick={exitSelect} aria-label="Done selecting" className="grid h-8 w-8 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.06]"><Sym name="xmark" className="h-4 w-4" /></button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context menu */}
      <AnimatePresence>
        {menu && (
          <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)}>
            <MenuItem icon="book" onClick={() => { setViewingId(menu.entry.id); setMenu(null); }}>Open</MenuItem>
            <MenuItem icon="pencil" onClick={() => { setEditing(menu.entry); setMenu(null); }}>Edit entry</MenuItem>
            <MenuItem icon="check" onClick={() => { setSelectMode(true); setSelectedIds(new Set([menu.entry.id])); anchorRef.current = menu.entry.id; setMenu(null); }}>Select</MenuItem>
            <MenuDivider />
            <MenuItem icon="trash" danger onClick={() => { setDeleting(menu.entry); setMenu(null); }}>Delete</MenuItem>
          </ContextMenu>
        )}
      </AnimatePresence>

      {/* Setup details */}
      {openSetupId && (() => {
        const info = setupInfos.find((i) => i.setup.id === openSetupId);
        if (!info) return null;
        return (
          <SetupDetail
            key={`${info.setup.id}:${info.setup.updatedAt}`}
            setup={info.setup} trades={info.trades} onClose={() => setOpenSetupId(null)}
            onEdit={() => { setOpenSetupId(null); toast.info("Edit this setup in the Trading Lab", "The Lab has the full setup editor."); }}
            onDelete={() => { setOpenSetupId(null); setLens({ kind: "all" }); void useApp.getState().deleteSetup(info.setup.id); }}
          />
        );
      })()}

      <EntryDetailModal
        open={!!viewing && !editing && !deleting} onClose={() => setViewingId(null)} entry={viewing}
        position={viewIndex >= 0 ? { index: viewIndex, total: filtered.length } : undefined} onStep={stepView}
        onEdit={(e) => setEditing(e)} onDelete={(e) => setDeleting(e)}
      />
      {editing && <EntryFormModal open onClose={() => setEditing(null)} entry={editing} />}

      <ConfirmDialog
        open={!!deleting} onClose={() => setDeleting(null)} onConfirm={() => void confirmDelete()} busy={deleteBusy}
        title="Delete this entry?"
        body={deleting ? `${deleting.date} · ${formatSignedMoney(deleting.pnl, settings.currency)} will be permanently removed along with its screenshots.` : ""}
      />
      <ConfirmDialog
        open={bulkOpen} onClose={() => setBulkOpen(false)} onConfirm={() => void confirmBulkDelete()} busy={bulkBusy}
        title={`Delete ${selectedCount} ${selectedCount === 1 ? "entry" : "entries"}?`}
        body="These trades are permanently removed along with their screenshots, reviews and Practise history. This cannot be undone."
        confirmLabel={`Delete ${selectedCount}`}
      />
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { cn } from "@/lib/utils";
import { btn, btnPrimary } from "@/components/lessons/buttons";
import { lessonsPost } from "@/components/lessons/api";
import { LessonCard, LessonCardSkeleton } from "@/components/lessons/lesson-card";
import {
  DEFAULT_FILTERS,
  FilterPanelPresence,
  matchesLength,
  Segmented,
  TABS,
  LENGTH_OPTIONS,
  STATUS_OPTIONS,
  type Filters,
} from "@/components/lessons/filters";
import { ChevronRightIcon, PlusIcon, SearchIcon, SlidersIcon, XIcon } from "@/components/lessons/lesson-icons";
import { LessonsIcon } from "@/components/lessons/lessons-icon";
import { Portal } from "@/components/lessons/portal";
import { minsLeft, plural } from "@/components/lessons/format";
import { statusOf, useReadProgress } from "@/components/lessons/progress";
import type { LessonAction, LessonView } from "@/components/lessons/types";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EmptyState } from "@/components/ui/misc";
import "@/components/lessons/lessons.css";

// Kept so existing imports (`import type { LessonView } from "../page"`) keep working.
export type { LessonView } from "@/components/lessons/types";

/** Survives navigating into a lesson and back, so the library is where you left it. Resets on full reload. */
let remembered: Filters = DEFAULT_FILTERS;

export default function LessonsPage() {
  const [items, setItems] = useState<LessonView[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [f, setF] = useState<Filters>(remembered);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [stuck, setStuck] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const entries = useReadProgress();
  const inputRef = useRef<HTMLInputElement>(null);
  const filterBtnRef = useRef<HTMLButtonElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const patch = useCallback((p: Partial<Filters>) => setF((s) => ({ ...s, ...p })), []);
  useEffect(() => {
    remembered = f;
  }, [f]);

  /* ------------------------------- Data ------------------------------- */

  const load = useCallback(() => {
    fetch("/api/lessons", { cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        return (await r.json()) as { lessons?: LessonView[] };
      })
      .then((d) => {
        setItems(d.lessons ?? []);
        setFailed(false);
      })
      .catch(() => {
        setFailed(true);
        setItems((cur) => cur ?? []);
      });
  }, []);
  useEffect(load, [load]);

  /** Optimistic: the control flips instantly, then the server state is re-synced. */
  const act = useCallback(
    async (id: string, action: LessonAction) => {
      setItems((cur) =>
        cur &&
        cur.map((l) => {
          if (l.id !== id) return l;
          if (action === "like") return { ...l, likedByMe: !l.likedByMe, likes: l.likes + (l.likedByMe ? -1 : 1) };
          if (action === "repost") return { ...l, repostedByMe: !l.repostedByMe, reposts: l.reposts + (l.repostedByMe ? -1 : 1) };
          return { ...l, savedByMe: !l.savedByMe };
        }),
      );
      await lessonsPost({ action, id });
      load();
    },
    [load],
  );

  const togglePick = useCallback(
    (id: string) =>
      setPicked((p) => {
        const n = new Set(p);
        if (n.has(id)) n.delete(id);
        else n.add(id);
        return n;
      }),
    [],
  );

  const exitSelect = useCallback(() => {
    setSelecting(false);
    setPicked(new Set());
  }, []);

  const removePicked = async () => {
    if (!picked.size) return;
    setBusy(true);
    const ok = await lessonsPost({ action: "delete", ids: [...picked] });
    setBusy(false);
    setConfirmOpen(false);
    if (ok) exitSelect();
    load();
  };

  /* ---------------------------- Derived lists ---------------------------- */

  const all = useMemo(() => items ?? [], [items]);
  const mine = useMemo(() => all.filter((l) => l.mine), [all]);
  const readCount = all.filter((l) => statusOf(entries[l.id]) === "read").length;
  const inProgress = all.some((l) => statusOf(entries[l.id]) === "reading");

  const q = f.query.trim().toLowerCase();
  const filtered = useMemo(() => {
    const terms = q.split(/\s+/).filter(Boolean);
    const list = all.filter((l) => {
      if (f.tab === "saved" && !l.savedByMe) return false;
      if (f.tab === "yours" && !l.mine) return false;
      if (f.tab === "friends" && l.mine) return false;
      if (!matchesLength(l.readMins, f.length)) return false;
      if (f.status !== "any" && statusOf(entries[l.id]) !== f.status) return false;
      if (terms.length) {
        const hay = [l.title, l.subtitle, l.excerpt, l.hook, l.author.name, l.author.handle, ...l.bylines].join(" ").toLowerCase();
        if (!terms.every((t) => hay.includes(t))) return false;
      }
      return true;
    });
    if (f.sort === "liked") list.sort((a, b) => b.likes - a.likes || b.createdAt - a.createdAt);
    return list;
  }, [all, entries, f.tab, f.length, f.status, f.sort, q]);

  const activeFilters = (f.length !== "any" ? 1 : 0) + (f.status !== "any" ? 1 : 0);
  const dirty = activeFilters > 0 || f.sort !== "newest";
  const pristine = f.tab === "all" && !q && activeFilters === 0;

  // The lesson you were last reading. Shown only on the clean "All" view.
  const resume = useMemo(() => {
    const reading = all.filter((l) => statusOf(entries[l.id]) === "reading");
    reading.sort((a, b) => entries[b.id].at - entries[a.id].at);
    return reading[0] ?? null;
  }, [all, entries]);

  // One featured lesson, only when the library is unfiltered and the newest lesson has a cover.
  const featured = pristine && f.sort === "newest" && filtered.length >= 3 && filtered[0].cover && filtered[0].id !== resume?.id ? filtered[0] : null;
  const rest = featured ? filtered.slice(1) : filtered;

  const allPicked = mine.length > 0 && mine.every((l) => picked.has(l.id));
  const canSelect = f.tab === "yours" && filtered.some((l) => l.mine);

  // Leaving "Yours" ends select mode; it only makes sense there.
  useEffect(() => {
    if (f.tab !== "yours" && selecting) exitSelect();
  }, [f.tab, selecting, exitSelect]);

  /* ----------------------------- Interactions ----------------------------- */

  // Sticky-toolbar material only appears once it is actually stuck.
  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const top = window.matchMedia("(min-width: 1024px)").matches ? 0 : 56;
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting), { rootMargin: `-${top + 1}px 0px 0px 0px` });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // "/" focuses search, like most reading apps.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      if ((e.target as HTMLElement | null)?.closest("input, textarea, select, [contenteditable='true']")) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* -------------------------------- Render -------------------------------- */

  const loading = items === null;
  const showError = failed && all.length === 0;
  const resultsLabel = q ? `${plural(filtered.length, "result")} for “${f.query.trim()}”` : plural(filtered.length, "lesson");

  return (
    <div className="w-full pb-28 sm:pb-16">
      {/* Header */}
      <header className="flex items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl">Lessons</h1>
          <p className="mt-1.5 max-w-md text-[15px] leading-relaxed text-muted">Playbooks and notes from you and your circle.</p>
        </div>
        <Link href="/lessons/new" className={cn(btnPrimary, "shrink-0")}>
          <PlusIcon className="h-4 w-4" />
          <span className="hidden sm:inline">Write a lesson</span>
          <span className="sm:hidden">Write</span>
        </Link>
      </header>

      {/* Progress: a single quiet line, only once you've started reading */}
      {!loading && all.length > 0 && (readCount > 0 || inProgress) && (
        <div className="mt-5 flex items-center gap-3" aria-label="Library progress">
          <div className="lc-track w-28" role="progressbar" aria-valuemin={0} aria-valuemax={all.length} aria-valuenow={readCount} aria-label="Lessons read">
            <i style={{ width: `${(readCount / all.length) * 100}%` }} />
          </div>
          <p className="text-[13px] tabular text-muted">
            {readCount} of {all.length} read
          </p>
        </div>
      )}

      {/* Continue reading */}
      {pristine && resume && (
        <Link href={`/lessons/${resume.id}`} className="lc-continue mt-6">
          {resume.cover && (
            <span className="lc-continue-thumb">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={resume.cover} alt="" loading="lazy" decoding="async" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block text-[11px] font-medium uppercase tracking-[0.1em] text-gold-deep dark:text-gold">Continue reading</span>
            <span className="mt-1 line-clamp-2 text-[16px] font-semibold leading-snug tracking-[-0.015em] text-ink">{resume.title}</span>
            <span className="mt-2.5 flex items-center gap-3">
              <span className="lc-track flex-1">
                <i style={{ width: `${Math.round(entries[resume.id].p * 100)}%` }} />
              </span>
              <span className="shrink-0 text-[12px] tabular text-muted">{minsLeft(resume.readMins, entries[resume.id].p)} min left</span>
            </span>
          </span>
          <ChevronRightIcon className="h-5 w-5 shrink-0 text-faint" />
        </Link>
      )}

      {/* Search, collections and filters */}
      <div ref={sentinelRef} className="h-px" aria-hidden="true" />
      <div className={cn("lessons-toolbar sticky top-14 z-30 -mx-4 mt-3 px-4 py-2.5 sm:-mx-6 sm:px-6 lg:top-0 lg:mx-0 lg:px-0", stuck && "is-stuck")}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2.5">
          <div className="order-1 flex min-w-0 flex-1 items-center gap-2 md:order-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Search lessons</span>
              <SearchIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-faint" />
              <input
                ref={inputRef}
                value={f.query}
                onChange={(e) => patch({ query: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    if (f.query) patch({ query: "" });
                    else inputRef.current?.blur();
                  }
                }}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck={false}
                placeholder="Search lessons"
                className="h-10 w-full rounded-control border border-line bg-raised pl-10 pr-10 text-base text-ink transition-[border-color,box-shadow] duration-200 placeholder:text-faint hover:border-line-strong focus:border-gold/60 focus:outline-none focus:ring-4 focus:ring-gold/10 sm:text-[15px]"
              />
              {f.query ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    patch({ query: "" });
                    inputRef.current?.focus();
                  }}
                  className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-full text-faint transition-colors hover:text-ink"
                >
                  <XIcon className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md border border-line bg-canvas/60 px-1.5 py-0.5 font-mono text-[11px] text-faint lg:block">/</kbd>
              )}
            </label>

            <button
              ref={filterBtnRef}
              type="button"
              aria-haspopup="dialog"
              aria-expanded={filtersOpen}
              aria-label={activeFilters ? `Filters, ${activeFilters} active` : "Filters"}
              onClick={() => setFiltersOpen((o) => !o)}
              className={cn(
                "relative inline-flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-control border bg-raised text-[14px] font-medium text-muted transition-colors duration-200 hover:text-ink sm:w-auto sm:px-3.5",
                dirty ? "border-gold/50 text-gold-deep dark:text-gold" : "border-line hover:border-line-strong",
              )}
            >
              <SlidersIcon className="h-[18px] w-[18px]" />
              <span className="hidden sm:inline">Filter</span>
              {activeFilters > 0 && (
                <span className="absolute -right-1.5 -top-1.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-gold-strong px-1 text-[11px] font-semibold text-on-gold">{activeFilters}</span>
              )}
            </button>
          </div>

          <Segmented className="order-2 w-full md:order-1 md:w-auto" label="Collection" layoutId="lessons-tab" value={f.tab} options={TABS} onChange={(tab) => patch({ tab })} />
        </div>
      </div>

      <FilterPanelPresence
        open={filtersOpen}
        anchor={filterBtnRef}
        filters={f}
        resultCount={filtered.length}
        dirty={dirty}
        onChange={patch}
        onReset={() => patch({ length: "any", status: "any", sort: "newest" })}
        onClose={() => setFiltersOpen(false)}
      />

      {/* Results line: count, active filters, and (on "Yours") Select */}
      {!loading && !showError && all.length > 0 && (
        <div className="mt-4 flex min-h-9 flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-[13px] text-muted" aria-live="polite">
              {resultsLabel}
            </p>
            {f.length !== "any" && <FilterChip label={LENGTH_OPTIONS.find((o) => o.id === f.length)!.label} onClear={() => patch({ length: "any" })} />}
            {f.status !== "any" && <FilterChip label={STATUS_OPTIONS.find((o) => o.id === f.status)!.label} onClear={() => patch({ status: "any" })} />}
          </div>
          {canSelect && (
            <button type="button" onClick={() => (selecting ? exitSelect() : setSelecting(true))} className="h-9 rounded-lg px-2 text-[13px] font-medium text-gold-deep transition-opacity hover:opacity-80 dark:text-gold">
              {selecting ? "Done" : "Select"}
            </button>
          )}
        </div>
      )}

      {/* Content */}
      <div className="mt-4">
        {loading && (
          <div className="lc-grid" aria-busy="true" aria-label="Loading lessons">
            <LessonCardSkeleton />
            <LessonCardSkeleton withCover={false} />
            <LessonCardSkeleton />
            <LessonCardSkeleton withCover={false} />
          </div>
        )}

        {showError && (
          <EmptyState
            className="py-14"
            icon={<LessonsIcon className="h-7 w-7" />}
            title="Couldn’t load your lessons"
            body="Check your connection and try again."
            action={
              <button
                type="button"
                className={btn}
                onClick={() => {
                  setFailed(false);
                  setItems(null);
                  load();
                }}
              >
                Try again
              </button>
            }
          />
        )}

        {!loading && !showError && all.length === 0 && (
          <EmptyState
            className="py-14"
            icon={<LessonsIcon className="h-7 w-7" />}
            title="No lessons yet"
            body="Write the first one, or add friends to see theirs here."
            action={
              <>
                <Link href="/lessons/new" className={btnPrimary}>
                  Write a lesson
                </Link>
                <Link href="/friends" className={btn}>
                  Find friends
                </Link>
              </>
            }
          />
        )}

        {!loading && !showError && all.length > 0 && filtered.length === 0 && (
          <EmptyState
            className="py-14"
            icon={f.query ? <SearchIcon className="h-7 w-7" /> : <LessonsIcon className="h-7 w-7" />}
            title={q || activeFilters ? "No lessons match" : f.tab === "saved" ? "Nothing saved yet" : f.tab === "yours" ? "You haven’t written a lesson yet" : "No lessons from friends yet"}
            body={
              q || activeFilters
                ? "Try a different search, or clear the filters."
                : f.tab === "saved"
                  ? "Tap the bookmark on any lesson to keep it here."
                  : f.tab === "yours"
                    ? "Your lessons will appear here."
                    : "Lessons from your friends will appear here."
            }
            action={
              q || activeFilters ? (
                <button type="button" className={btn} onClick={() => setF({ ...DEFAULT_FILTERS, tab: f.tab })}>
                  Clear search and filters
                </button>
              ) : f.tab === "yours" ? (
                <Link href="/lessons/new" className={btnPrimary}>
                  Write a lesson
                </Link>
              ) : f.tab === "friends" ? (
                <Link href="/friends" className={btn}>
                  Find friends
                </Link>
              ) : undefined
            }
          />
        )}

        {!loading && filtered.length > 0 && (
          <div className="lc-grid">
            {featured && <LessonCard l={featured} entry={entries[featured.id]} variant="featured" selecting={selecting} picked={picked.has(featured.id)} onPick={togglePick} onAct={act} />}
            {rest.map((l) => (
              <LessonCard key={l.id} l={l} entry={entries[l.id]} selecting={selecting} picked={picked.has(l.id)} onPick={togglePick} onAct={act} />
            ))}
          </div>
        )}
      </div>

      {/* Selection bar — floats only while selecting */}
      {selecting && (
        <Portal>
          <div className="lesson-float" data-show="true">
            <motion.div
              className="lesson-selectbar"
              role="toolbar"
              aria-label="Selected lessons"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <span className="min-w-[88px] px-2 text-[13px] font-medium tabular text-ink">{picked.size ? `${picked.size} selected` : "Select lessons"}</span>
              <button type="button" className="lesson-bar-btn" onClick={() => setPicked(allPicked ? new Set() : new Set(mine.map((l) => l.id)))}>
                {allPicked ? "Clear" : "Select all"}
              </button>
              <button type="button" className="lesson-bar-btn" data-danger="true" disabled={!picked.size} onClick={() => setConfirmOpen(true)}>
                Delete
              </button>
            </motion.div>
          </div>
        </Portal>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => !busy && setConfirmOpen(false)}
        onConfirm={removePicked}
        busy={busy}
        title={`Delete ${plural(picked.size, "lesson")}?`}
        body="This can’t be undone. Their images and videos are removed too."
        confirmLabel="Delete"
      />
    </div>
  );
}

function FilterChip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} aria-label={`Remove filter: ${label}`} className="inline-flex h-7 items-center gap-1 rounded-full border border-gold/35 bg-gold/[0.08] pl-2.5 pr-1.5 text-[12px] font-medium text-gold-deep transition-colors hover:bg-gold/[0.14] dark:text-gold">
      {label}
      <XIcon className="h-3.5 w-3.5" />
    </button>
  );
}

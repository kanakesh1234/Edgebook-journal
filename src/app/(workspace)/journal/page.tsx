"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import type { JournalEntry } from "@/lib/types";
import { formatSignedMoney } from "@/lib/format";
import { BookOpenIcon, SearchIcon, SlidersIcon, SortIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Select, TextInput } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EntryCard } from "@/components/journal/entry-card";
import { EntryDetailModal } from "@/components/journal/entry-detail-modal";
import { EntryFormModal } from "@/components/journal/entry-form-modal";
import { toast } from "@/components/ui/toast";

type Outcome = "all" | "win" | "loss" | "flat";
type SortKey = "newest" | "oldest" | "best" | "worst" | "rr";

export default function JournalPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);

  const [query, setQuery] = useState("");
  const [outcome, setOutcome] = useState<Outcome>("all");
  const [instrument, setInstrument] = useState("all");
  const [sort, setSort] = useState<SortKey>("newest");

  const [viewingId, setViewingId] = useState<string | null>(null);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  // Press "/" anywhere on the page to jump into search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName) || target.isContentEditable;
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const instruments = useMemo(
    () => [...new Set(entries.map((e) => e.instrument))].filter((i) => i !== "—").sort(),
    [entries],
  );

  const filtered = useMemo(() => {
    let list = entries;
    if (outcome === "win") list = list.filter((e) => e.pnl > 0);
    else if (outcome === "loss") list = list.filter((e) => e.pnl < 0);
    else if (outcome === "flat") list = list.filter((e) => e.pnl === 0);

    if (instrument !== "all") list = list.filter((e) => e.instrument === instrument);

    const q = query.trim().toLowerCase();
    if (q) {
      list = list.filter((e) =>
        [e.notes, e.instrument, e.setup].some((field) => field.toLowerCase().includes(q)),
      );
    }

    return [...list].sort((a, b) => {
      switch (sort) {
        case "oldest":
          return a.date.localeCompare(b.date);
        case "best":
          return b.pnl - a.pnl;
        case "worst":
          return a.pnl - b.pnl;
        case "rr": {
          const ra = a.rr ?? -Infinity;
          const rb = b.rr ?? -Infinity;
          return rb - ra || b.date.localeCompare(a.date);
        }
        default:
          return b.date.localeCompare(a.date) || b.createdAt - a.createdAt;
      }
    });
  }, [entries, outcome, instrument, query, sort]);

  const filteredPnl = useMemo(() => filtered.reduce((s, e) => s + e.pnl, 0), [filtered]);
  const viewing = entries.find((e) => e.id === viewingId) ?? null;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await useApp.getState().deleteEntry(deleting.id);
      toast.success("Entry deleted");
      setViewingId(null);
      setDeleting(null);
    } catch {
      toast.error("Could not delete the entry");
    } finally {
      setDeleteBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl sm:font-semibold">Journal</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            {entries.length} {entries.length === 1 ? "entry" : "entries"} recorded
            {filtered.length !== entries.length && (
              <>
                <span className="text-faint">·</span>
                <span className="text-muted">
                  {filtered.length} matching ·{" "}
                  <span className={formatSignedMoney(filteredPnl).startsWith("+") ? "text-profit" : "text-loss"}>
                    {formatSignedMoney(filteredPnl, settings.currency)}
                  </span>{" "}
                  in view
                </span>
              </>
            )}
          </p>
        </div>
      </header>

      {/* Toolbar */}
      <div className="panel flex flex-col gap-3 p-3.5 md:flex-row md:items-center">
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <TextInput
            ref={searchRef}
            aria-label="Search journal"
            placeholder="Search notes, instruments, setups…"
            className="!pl-9"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-raised px-1.5 py-0.5 font-mono text-[10px] text-faint md:block">
            /
          </kbd>
        </div>

        <div className="grid grid-cols-3 gap-2 md:flex md:w-auto">
          <Select aria-label="Filter by outcome" value={outcome} onChange={(e) => setOutcome(e.target.value as Outcome)}>
            <option value="all">All results</option>
            <option value="win">Wins</option>
            <option value="loss">Losses</option>
            <option value="flat">Breakeven</option>
          </Select>

          <Select
            aria-label="Filter by instrument"
            value={instrument}
            onChange={(e) => setInstrument(e.target.value)}
            disabled={instruments.length === 0}
          >
            <option value="all">Instruments</option>
            {instruments.map((i) => (
              <option key={i} value={i}>
                {i}
              </option>
            ))}
          </Select>

          <Select aria-label="Sort entries" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}>
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="best">Best P&L</option>
            <option value="worst">Worst P&L</option>
            <option value="rr">Highest R</option>
          </Select>
        </div>

        {(query || outcome !== "all" || instrument !== "all") && (
          <button
            onClick={() => {
              setQuery("");
              setOutcome("all");
              setInstrument("all");
            }}
            className="flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium text-faint transition-colors hover:text-ink"
          >
            <SlidersIcon className="h-3.5 w-3.5" />
            Reset
          </button>
        )}
      </div>

      {/* Grid */}
      {entries.length === 0 ? (
        <EmptyState
          icon={<BookOpenIcon className="h-7 w-7" />}
          title="Your journal awaits its first page"
          body="Log today's session — result, R multiple, screenshots — and the analytics start building themselves."
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={<SearchIcon className="h-6 w-6" />}
          title="Nothing matches those filters"
          body="Try a different search term or reset the filters."
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setQuery("");
                setOutcome("all");
                setInstrument("all");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <motion.div layout className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <AnimatePresence mode="popLayout">
            {filtered.map((entry, i) => (
              <EntryCard key={entry.id} entry={entry} index={i} onOpen={(e) => setViewingId(e.id)} />
            ))}
          </AnimatePresence>
        </motion.div>
      )}

      {/* Overlays */}
      <EntryDetailModal
        open={!!viewing && !editing && !deleting}
        onClose={() => setViewingId(null)}
        entry={viewing}
        onEdit={(e) => setEditing(e)}
        onDelete={(e) => setDeleting(e)}
      />

      {editing && (
        <EntryFormModal open onClose={() => setEditing(null)} entry={editing} />
      )}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={() => void confirmDelete()}
        busy={deleteBusy}
        title="Delete this entry?"
        body={
          deleting
            ? `${deleting.date} · ${formatSignedMoney(deleting.pnl, settings.currency)} will be permanently removed along with its screenshots.`
            : ""
        }
      />
    </div>
  );
}

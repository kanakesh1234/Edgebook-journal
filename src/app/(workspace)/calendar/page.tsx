"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useApp } from "@/lib/store";
import { groupByDay, monthGrid } from "@/lib/stats";
import type { JournalEntry } from "@/lib/types";
import {
  formatDateFull,
  formatSignedMoney,
  monthLabel,
  parseDateKey,
  todayKey,
} from "@/lib/format";
import {
  CalendarIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  PlusIcon,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm";
import { EntryDetailModal } from "@/components/journal/entry-detail-modal";
import { EntryFormModal } from "@/components/journal/entry-form-modal";
import { EmptyState } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);

  const [view, setView] = useState(() => {
    const n = new Date();
    return { year: n.getFullYear(), month: n.getMonth() };
  });
  const [dir, setDir] = useState(0); // -1 prev, +1 next

  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<JournalEntry | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);

  const byDay = useMemo(() => groupByDay(entries), [entries]);
  const cells = useMemo(() => monthGrid(view.year, view.month), [view]);

  const monthEntries = useMemo(
    () =>
      entries.filter((e) => {
        const d = parseDateKey(e.date);
        return d.getFullYear() === view.year && d.getMonth() === view.month;
      }),
    [entries, view],
  );
  const monthPnl = monthEntries.reduce((s, e) => s + e.pnl, 0);
  const maxAbs = Math.max(
    1,
    ...[...byDay.values()]
      .filter((d) => {
        const dt = parseDateKey(d.date);
        return dt.getFullYear() === view.year && dt.getMonth() === view.month;
      })
      .map((d) => Math.abs(d.pnl)),
  );

  const navigate = (delta: number) => {
    setDir(delta);
    setView((v) => {
      const d = new Date(v.year, v.month + delta, 1);
      return { year: d.getFullYear(), month: d.getMonth() };
    });
  };

  const goToday = () => {
    setDir(new Date().getMonth() - view.month > 0 ? 1 : -1);
    const n = new Date();
    setView({ year: n.getFullYear(), month: n.getMonth() });
  };

  const selectedEntries =
    (selectedDay ? entries.filter((e) => e.date === selectedDay) : []).sort(
      (a, b) => b.createdAt - a.createdAt,
    ) ?? [];
  const viewing = entries.find((e) => e.id === entryId) ?? null;

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await useApp.getState().deleteEntry(deleting.id);
      toast.success("Entry deleted");
      if (entryId === deleting.id) setEntryId(null);
      setDeleting(null);
    } catch {
      toast.error("Could not delete the entry");
    } finally {
      setDeleteBusy(false);
    }
  };

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={<CalendarIcon className="h-7 w-7" />}
        title="No days to put on the calendar yet"
        body="Once you start logging sessions, each day lights up green or red — and your months become a heatmap of discipline."
        action={
          <Button variant="gold" onClick={() => { setPresetDate(todayKey()); }}>
            <PlusIcon className="h-4 w-4" />
            Log first trade
          </Button>
        }
      />
    );
  }

  const today = todayKey();

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">Calendar</h1>
          <p className="mt-1 text-sm text-muted">Your P&amp;L, one square at a time.</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => navigate(-1)}
            aria-label="Previous month"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-raised text-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
          >
            <ChevronLeftIcon className="h-4 w-4" />
          </button>
          <AnimatePresence mode="wait" initial={false}>
            <motion.h2
              key={`${view.year}-${view.month}`}
              initial={{ opacity: 0, y: dir >= 0 ? 8 : -8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: dir >= 0 ? -8 : 8 }}
              transition={{ duration: 0.22 }}
              className="min-w-[150px] text-center font-display text-lg font-semibold tracking-tight text-ink"
              aria-live="polite"
            >
              {monthLabel(view.year, view.month)}
            </motion.h2>
          </AnimatePresence>
          <button
            onClick={() => navigate(1)}
            aria-label="Next month"
            className="grid h-9 w-9 place-items-center rounded-lg border border-line bg-raised text-muted transition-colors hover:border-line-strong hover:text-ink active:scale-95"
          >
            <ChevronRightIcon className="h-4 w-4" />
          </button>
          <Button variant="subtle" size="sm" onClick={goToday} className="ml-1">
            Today
          </Button>
        </div>
      </header>

      {/* Calendar */}
      <div className="panel overflow-hidden p-3 sm:p-5">
        <div className="mb-2 grid grid-cols-7 gap-1.5 sm:gap-2">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-faint sm:text-[11px]">
              <span className="hidden sm:inline">{w}</span>
              <span className="sm:hidden">{w[0]}</span>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${view.year}-${view.month}`}
            initial={{ opacity: 0, x: dir * 34 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -34 }}
            transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-7 gap-1.5 sm:gap-2"
          >
            {cells.map((cell, i) => {
              if (!cell.key) return <div key={`pad-${i}`} aria-hidden />;
              const day = byDay.get(cell.key);
              const pnl = day?.pnl ?? null;
              const intensity = pnl !== null && pnl !== 0 ? 0.16 + 0.55 * Math.min(1, Math.abs(pnl) / maxAbs) : 0;
              const isToday = cell.key === today;

              return (
                <motion.button
                  key={cell.key}
                  onClick={() => setSelectedDay(cell.key)}
                  initial={{ opacity: 0, scale: 0.92 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.008, 0.25), ease: [0.16, 1, 0.3, 1] }}
                  whileHover={{ y: -2 }}
                  whileTap={{ scale: 0.97 }}
                  aria-label={`${formatDateFull(cell.key)}${pnl !== null ? `, ${formatSignedMoney(pnl, settings.currency)}` : ", no trades"}`}
                  className={cn(
                    "group relative flex aspect-[1/0.82] min-h-[64px] flex-col justify-between overflow-hidden rounded-xl border p-1.5 text-left transition-colors sm:aspect-auto sm:h-[86px] sm:p-2",
                    pnl === null || pnl === 0
                      ? "border-line bg-raised/40 hover:border-line-strong"
                      : pnl > 0
                        ? "border-profit/20 hover:border-profit/45"
                        : "border-loss/20 hover:border-loss/45",
                    isToday && "!border-gold/60 ring-1 ring-gold/40",
                  )}
                >
                  {/* intensity wash */}
                  {intensity > 0 && (
                    <span
                      aria-hidden
                      className={cn("absolute inset-0", pnl! > 0 ? "bg-profit" : "bg-loss")}
                      style={{ opacity: intensity }}
                    />
                  )}

                  <span className={cn("relative text-[11px] font-semibold tabular", pnl != null && pnl !== 0 ? "text-white/85" : "text-muted")}>
                    {cell.day}
                    {isToday && <span className="ml-1 inline-block h-1.5 w-1.5 rounded-full bg-gold align-middle" aria-label="Today" />}
                  </span>

                  {pnl !== null && (
                    <span
                      className={cn(
                        "relative truncate font-mono text-[10px] font-bold tabular sm:text-xs",
                        pnl > 0 ? "text-profit" : pnl < 0 ? "text-loss" : "text-faint",
                      )}
                      style={
                        pnl !== 0
                          ? { filter: `brightness(${1 + intensity * 0.35}) drop-shadow(0 1px 2px rgba(0,0,0,0.55))` }
                          : undefined
                      }
                    >
                      {formatSignedMoney(pnl, settings.currency, { compact: true })}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </motion.div>
        </AnimatePresence>

        {/* Legend + month summary */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <div className="flex items-center gap-4 text-[11px] text-faint">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-profit/70" /> Profit</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-loss/70" /> Loss</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm border border-line-strong bg-raised" /> No trades</span>
          </div>
          <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="text-muted">
              {monthEntries.length} {monthEntries.length === 1 ? "session" : "sessions"}
            </span>
            <span
              className={cn(
                "font-mono font-bold tabular",
                monthPnl > 0 ? "text-profit" : monthPnl < 0 ? "text-loss" : "text-muted",
              )}
            >
              {formatSignedMoney(monthPnl, settings.currency)}
            </span>
          </p>
        </div>
      </div>

      {/* ------------------------------ Overlays ------------------------------ */}
      <Modal
        open={!!selectedDay}
        onClose={() => setSelectedDay(null)}
        size="sm"
        title={selectedDay ? formatDateFull(selectedDay) : ""}
        description={
          selectedEntries.length > 0
            ? `${selectedEntries.length} ${selectedEntries.length === 1 ? "entry" : "entries"} · ${
                formatSignedMoney(selectedEntries.reduce((s, e) => s + e.pnl, 0), settings.currency)
              }`
            : "No trades logged."
        }
      >
        <div className="space-y-2 px-4 py-4">
          {selectedEntries.map((e) => (
            <button
              key={e.id}
              onClick={() => setEntryId(e.id)}
              className="group flex w-full items-center justify-between gap-3 rounded-xl border border-line bg-raised/60 px-3.5 py-3 text-left transition-all hover:border-line-strong hover:bg-raised active:scale-[0.99]"
            >
              <span className="min-w-0">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium capitalize text-ink">
                    {e.instrument !== "—" ? e.instrument : e.setup || "Session"}
                  </span>
                  {e.direction && (
                    <span className={cn("font-mono text-[10px] font-bold uppercase", e.direction === "long" ? "text-profit" : "text-loss")}>
                      {e.direction}
                    </span>
                  )}
                </span>
                {e.setup && <span className="mt-0.5 block truncate text-[11px] text-faint">{e.setup}</span>}
              </span>
              <span className={cn("shrink-0 font-mono text-sm font-bold tabular", e.pnl > 0 ? "text-profit" : e.pnl < 0 ? "text-loss" : "text-muted")}>
                {formatSignedMoney(e.pnl, settings.currency)}
              </span>
            </button>
          ))}

          <button
            onClick={() => {
              setPresetDate(selectedDay);
              setSelectedDay(null);
            }}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-line-strong py-3 text-sm font-medium text-muted transition-colors hover:border-gold/50 hover:text-gold"
          >
            <PlusIcon className="h-4 w-4" />
            Add entry for this day
          </button>
        </div>
      </Modal>

      <EntryDetailModal
        open={!!viewing && !editing && !deleting}
        onClose={() => setEntryId(null)}
        entry={viewing}
        onEdit={(e) => setEditing(e)}
        onDelete={(e) => setDeleting(e)}
      />

      {editing && <EntryFormModal open onClose={() => setEditing(null)} entry={editing} />}
      {presetDate && !editing && (
        <EntryFormModal open onClose={() => setPresetDate(null)} presetDate={presetDate} />
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

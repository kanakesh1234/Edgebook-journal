"use client";

import { useEffect, useMemo, useState } from "react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { todayKey } from "@/lib/format";
import { CalendarIcon, PlusIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/misc";
import { CalendarView } from "@/components/calendar/calendar-view";
import { EntryFormModal } from "@/components/journal/entry-form-modal";

/**
 * Calendar Page — Apple Calendar-inspired full-width historical trading view.
 * Always reflects the active Primary Challenge directly.
 */
export default function CalendarPage() {
  const allEntries = useApp((s) => s.entries);
  const rawSettings = useApp((s) => s.settings);
  const dayLogs = useApp((s) => s.dayLogs);
  const { entries, settings, challenge } = useMemo(
    () => scopeToPrimary(rawSettings, allEntries),
    [rawSettings, allEntries],
  );

  const [presetDate, setPresetDate] = useState<string | null>(null);

  const unreviewedCount = useMemo(
    () => entries.filter((e) => e.reviewStatus === "not_reviewed" || e.reviewStatus === "incomplete").length,
    [entries],
  );

  if (allEntries.length === 0) {
    return (
      <div className="space-y-6">
        <header>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl">Calendar</h1>
          <p className="mt-1 text-sm text-muted">Your trading history, one day at a time.</p>
        </header>
        <EmptyState
          icon={<CalendarIcon className="h-7 w-7" />}
          title="Your history starts here"
          body="Log or import your first trade and every session lands on this calendar — P&L, review status, weekly summaries, and challenge context."
          action={
            <Button variant="gold" onClick={() => setPresetDate(todayKey())}>
              <PlusIcon className="h-4 w-4" />
              Log first trade
            </Button>
          }
        />
        {presetDate && <TradeEntryRedirect date={presetDate} onDone={() => setPresetDate(null)} />}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl">Calendar</h1>
          <p className="mt-1 text-sm text-muted">Your trading history, one day at a time.</p>
        </div>
        <Button variant="gold" size="sm" onClick={() => setPresetDate(todayKey())} className="rounded-full px-4">
          <PlusIcon className="h-4 w-4" />
          Add trade
        </Button>
      </header>

      {unreviewedCount > 0 && (
        <p className="flex items-center gap-2 rounded-control border border-gold/30 bg-gold/[0.06] px-4 py-2.5 text-[13px] text-ink">
          <span className="h-1.5 w-1.5 rounded-full bg-gold" />
          {unreviewedCount} {unreviewedCount === 1 ? "trade" : "trades"} awaiting review — click any active day to inspect or review.
        </p>
      )}

      <CalendarView
        entries={entries}
        dayLogs={dayLogs}
        currency={settings.currency}
        defaultChallengeId={challenge?.id ?? null}
        spacious
        onAddTradeForDate={(date) => setPresetDate(date)}
      />

      {presetDate && <TradeEntryRedirect date={presetDate} onDone={() => setPresetDate(null)} />}
    </div>
  );
}

function TradeEntryRedirect({ date, onDone }: { date: string; onDone: () => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!open) onDone();
  }, [open, onDone]);
  return <EntryFormModal open={open} onClose={() => setOpen(false)} presetDate={date} />;
}

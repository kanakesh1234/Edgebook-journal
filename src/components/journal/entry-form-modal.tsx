"use client";

import { useEffect, useMemo, useState } from "react";
import { motion } from "motion/react";
import {
  MAX_IMAGES_PER_ENTRY,
  type JournalEntry,
  type TradeDirection,
} from "@/lib/types";
import { todayKey, formatDateMedium, formatSignedMoney, weekdayLong } from "@/lib/format";
import { useApp, type EntryDraft } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { toast } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { Field, TextArea, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { ImageUploader, type UploadItem } from "./image-uploader";
import { ReflectionFlow } from "./reflection-flow";
import { cn } from "@/lib/utils";
import { UploadIcon, PencilIcon } from "@/components/ui/icons";

const INSTRUMENT_SUGGESTIONS = [
  "NQ", "ES", "MES", "MNQ", "EURUSD", "GBPUSD", "USDJPY", "BTCUSD", "ETHUSD",
  "XAUUSD", "CL", "SPY", "QQQ", "AAPL", "TSLA", "NVDA",
];
const SETUP_SUGGESTIONS = [
  "Opening range breakout", "VWAP reclaim", "Order block retest", "Trend continuation",
  "Liquidity sweep", "Failed breakdown", "Gap fill", "News fade",
];

/**
 * Create/edit composer.
 * - Controlled usage: <EntryFormModal open onClose entry={editing} />
 * - Global usage: rendered once in the shell; opens via the UI store.
 */
export function EntryFormModal({
  open: openProp,
  onClose: onCloseProp,
  entry: entryProp,
  presetDate,
}: {
  open?: boolean;
  onClose?: () => void;
  entry?: JournalEntry | null;
  /** Pre-fills the date field (used by the calendar's "add for this day"). */
  presetDate?: string | null;
} = {}) {
  const globalOpen = useUi((s) => s.newEntryOpen);
  const closeGlobal = useUi((s) => s.closeNewEntry);

  const open = openProp ?? globalOpen;
  const onClose = onCloseProp ?? closeGlobal;
  const editing = entryProp ?? null;

  const [date, setDate] = useState(todayKey());
  const [pnl, setPnl] = useState("");
  const [rr, setRr] = useState("");
  const [instrument, setInstrument] = useState("");
  const [direction, setDirection] = useState<TradeDirection | null>(null);
  const [setup, setSetup] = useState("");
  const [notes, setNotes] = useState("");
  const [images, setImages] = useState<UploadItem[]>([]);
  const [errors, setErrors] = useState<{ date?: string; pnl?: string; rr?: string }>({});
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [importText, setImportText] = useState("");
  const [reflecting, setReflecting] = useState<JournalEntry | null>(null);

  // Hydrate/reset each time the dialog opens
  useEffect(() => {
    if (!open) return;
    if (editing) {
      setDate(editing.date);
      setPnl(String(editing.pnl));
      setRr(editing.rr != null ? String(editing.rr) : "");
      setInstrument(editing.instrument === "—" ? "" : editing.instrument);
      setDirection(editing.direction);
      setSetup(editing.setup);
      setNotes(editing.notes);
      setImages(editing.images.map((m) => ({ meta: m, blob: null })));
    } else {
      setDate(presetDate && presetDate <= todayKey() ? presetDate : todayKey());
      setPnl("");
      setRr("");
      setInstrument("");
      setDirection(null);
      setSetup("");
      setNotes("");
      setImages([]);
      setMode("manual");
      setImportText("");
    }
    setErrors({});
    setReflecting(null);
  }, [open, editing, presetDate]);

  const pnlNumber = pnl.trim() === "" ? NaN : Number(pnl);
  const rrTrimmed = rr.trim();
  const rrNumber = rrTrimmed === "" ? null : Number(rrTrimmed);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!date) next.date = "Pick a trading day.";
    else if (date > todayKey()) next.date = "That day hasn't happened yet.";
    if (Number.isNaN(pnlNumber)) next.pnl = "Enter a number — negative for a loss.";
    if (rrNumber !== null && !Number.isFinite(rrNumber)) next.rr = "Use a number like 2.5";
    setErrors(next);
    if (Object.keys(next).length > 0 || saving) return;

    const draft: EntryDraft = {
      date,
      pnl: Math.round(pnlNumber * 100) / 100,
      rr: rrNumber,
      instrument: instrument.trim() || "—",
      direction,
      setup: setup.trim(),
      notes: notes.trim(),
      images: images.map((i) => i.meta),
    };
    const blobs = new Map<string, Blob>();
    for (const item of images) if (item.blob) blobs.set(item.meta.id, item.blob);

    setSaving(true);
    try {
      if (editing) {
        await useApp.getState().updateEntry(editing.id, draft, blobs);
        toast.success("Entry updated");
        onClose();
      } else {
        const created = await useApp.getState().createEntry(draft, blobs);
        toast.success(
          draft.pnl > 0 ? "Green day logged" : draft.pnl < 0 ? "Red day logged" : "Session logged",
          "Your dashboard and roadmap just updated.",
        );
        onClose();
        // The trade is in — now capture the thinking while it's fresh.
        setReflecting(created);
      }
    } catch {
      toast.error("Could not save the entry", "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  /* ------------------------------ import ------------------------------ */

  interface ParsedRow {
    date: string;
    pnl: number;
    rr: number | null;
    instrument: string;
    direction: TradeDirection | null;
    setup: string;
    notes: string;
  }

  const parsedImport = useMemo<{ rows: ParsedRow[]; bad: number }>(() => {
    const lines = importText.split("\n").map((l) => l.trim()).filter(Boolean);
    const rows: ParsedRow[] = [];
    let bad = 0;
    for (const line of lines) {
      const parts = line.split("|").map((p) => p.trim());
      if (parts.length < 2) { bad++; continue; }
      const [d, pnlRaw, rrRaw, instrument, direction, setup, notes] = parts;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) { bad++; continue; }
      const pnl = Number(pnlRaw);
      if (!Number.isFinite(pnl)) { bad++; continue; }
      const rr = rrRaw && rrRaw !== "-" ? Number(rrRaw) : null;
      rows.push({
        date: d,
        pnl: Math.round(pnl * 100) / 100,
        rr: rr != null && Number.isFinite(rr) ? rr : null,
        instrument: (instrument || "—").toUpperCase(),
        direction: direction === "long" ? "long" : direction === "short" ? "short" : null,
        setup: setup || "",
        notes: notes || "",
      });
    }
    return { rows, bad };
  }, [importText]);

  const runImport = async () => {
    if (parsedImport.rows.length === 0 || saving) return;
    setSaving(true);
    let ok = 0;
    try {
      for (const row of parsedImport.rows) {
        try {
          await useApp.getState().createEntry({
            date: row.date,
            pnl: row.pnl,
            rr: row.rr,
            instrument: row.instrument,
            direction: row.direction,
            setup: row.setup,
            notes: row.notes,
            images: [],
          });
          ok += 1;
        } catch { /* skip row */ }
      }
      toast.success(`Imported ${ok} ${ok === 1 ? "trade" : "trades"}`, "Your dashboard and journey just updated.");
      setImportText("");
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      label={editing ? "Edit journal entry" : "New journal entry"}
      title={editing ? "Edit entry" : "Log a trade"}
      description={
        editing
          ? `${weekdayLong(editing.date)} · ${formatSignedMoney(editing.pnl)}`
          : "Capture the session while it's fresh."
      }
    >
      <form onSubmit={submit} noValidate className="px-6 py-6">
        {/* Mode tabs — only for new entries */}
        {!editing && (
          <div
            role="tablist"
            aria-label="Entry mode"
            className="mb-6 grid grid-cols-2 gap-1 rounded-control border border-line bg-canvas/60 p-1"
          >
            {([
              { id: "manual", label: "Manual entry", icon: <PencilIcon className="h-3.5 w-3.5" /> },
              { id: "import", label: "Import trades", icon: <UploadIcon className="h-3.5 w-3.5" /> },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={mode === t.id}
                onClick={() => setMode(t.id)}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition-colors",
                  mode === t.id ? "text-ink" : "text-faint hover:text-muted",
                )}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        )}

        {mode === "import" && !editing ? (
          <ImportPane
            text={importText}
            onChange={(v) => { setImportText(v); }}
            rows={parsedImport.rows}
            bad={parsedImport.bad}
            onImport={() => void runImport()}
            saving={saving}
            onClose={onClose}
          />
        ) : (
        <>
        <div className="grid gap-5 sm:grid-cols-2">
          {/* Left column */}
          <div className="space-y-5">
            <Field label="Trading day" error={errors.date} htmlFor="entry-date">
              <TextInput
                id="entry-date"
                type="date"
                value={date}
                max={todayKey()}
                invalid={!!errors.date}
                onChange={(e) => setDate(e.target.value)}
              />
            </Field>

            <Field label="Net P&L" error={errors.pnl} htmlFor="entry-pnl">
              <div className="relative">
                <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-faint">
                  $
                </span>
                <TextInput
                  id="entry-pnl"
                  inputMode="decimal"
                  autoComplete="off"
                  placeholder="250.00 or −120.50"
                  className={cn("pl-8 tabular", pnlNumber > 0 && "text-profit", pnlNumber < 0 && "text-loss")}
                  value={pnl}
                  invalid={!!errors.pnl}
                  onChange={(e) => setPnl(e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-"))}
                />
              </div>
              {!errors.pnl && pnl.trim() !== "" && Number.isFinite(pnlNumber) && (
                <motion.p
                  key={pnl}
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "pt-0.5 text-[12px] font-medium",
                    pnlNumber > 0 ? "text-profit" : pnlNumber < 0 ? "text-loss" : "text-muted",
                  )}
                >
                  {formatSignedMoney(pnlNumber)}
                </motion.p>
              )}
            </Field>

            <Field label="Risk-to-reward" hint="optional" error={errors.rr} htmlFor="entry-rr">
              <TextInput
                id="entry-rr"
                inputMode="decimal"
                autoComplete="off"
                placeholder="+2.5R"
                className="tabular"
                value={rr}
                invalid={!!errors.rr}
                onChange={(e) => setRr(e.target.value.replace(/[^\d.\-−]/g, "").replace("−", "-"))}
              />
            </Field>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            <Field label="Direction" hint="optional">
              <div className="grid grid-cols-2 gap-2" role="group" aria-label="Trade direction">
                {(["long", "short"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    aria-pressed={direction === d}
                    onClick={() => setDirection((cur) => (cur === d ? null : d))}
                    className={cn(
                      "rounded-xl border py-2.5 text-sm font-semibold capitalize transition-all duration-150 active:scale-[0.97]",
                      direction === d
                        ? d === "long"
                          ? "border-profit/50 bg-profit/[0.12] text-profit"
                          : "border-loss/50 bg-loss/[0.10] text-loss"
                        : "border-line bg-raised/60 text-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    {d}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Instrument" hint="optional" htmlFor="entry-instrument">
              <TextInput
                id="entry-instrument"
                list="instrument-list"
                placeholder="NQ, EURUSD, BTC…"
                value={instrument}
                onChange={(e) => setInstrument(e.target.value.toUpperCase())}
              />
              <datalist id="instrument-list">
                {INSTRUMENT_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>

            <Field label="Setup" hint="optional" htmlFor="entry-setup">
              <TextInput
                id="entry-setup"
                list="setup-list"
                placeholder="e.g. VWAP reclaim"
                value={setup}
                onChange={(e) => setSetup(e.target.value)}
              />
              <datalist id="setup-list">
                {SETUP_SUGGESTIONS.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
            </Field>
          </div>
        </div>

        <div className="mt-5 space-y-5">
          <Field label="Notes & observations" hint="what did the market teach you?" htmlFor="entry-notes">
            <TextArea
              id="entry-notes"
              placeholder="What was the plan? What actually happened? What will you do differently?"
              value={notes}
              maxLength={4000}
              onChange={(e) => setNotes(e.target.value)}
            />
          </Field>

          <Field label={`Screenshots (${images.length}/${MAX_IMAGES_PER_ENTRY})`} hint="before / after charts">
            <ImageUploader items={images} onChange={setImages} />
          </Field>
        </div>
        </>
        )}

        {!(mode === "import" && !editing) && (
        <div className="mt-7 flex items-center justify-end gap-2.5 border-t border-line bg-surface pt-5 pb-1 sticky bottom-[-24px] px-0.5 -mx-0.5">
          <Button type="button" variant="subtle" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" variant="gold" loading={saving} disabled={saving}>
            {editing ? "Save changes" : "Add to journal"}
          </Button>
        </div>
        )}
      </form>
    </Modal>

    {/* Post-save reflection — lives outside the form modal so it survives its close */}
    <ReflectionFlow open={!!reflecting} entry={reflecting} onClose={() => setReflecting(null)} />
    </>
  );
}

/* ------------------------------ import pane ------------------------------ */

function ImportPane({
  text,
  onChange,
  rows,
  bad,
  onImport,
  saving,
  onClose,
}: {
  text: string;
  onChange: (v: string) => void;
  rows: { date: string; pnl: number; instrument: string }[];
  bad: number;
  onImport: () => void;
  saving: boolean;
  onClose: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-raised/50 px-4 py-3 text-[13px] leading-relaxed text-muted">
        Paste one trade per line, pipe-separated:
        <code className="mt-1 block whitespace-nowrap overflow-x-auto rounded-md border border-line bg-canvas px-2.5 py-1.5 font-mono text-[11px] text-faint">
          2026-08-21 | -90 | 1.5 | TSLA | long | Gap fill | chased strength
        </code>
        <span className="mt-1.5 block text-[11px] text-faint">date · pnl · R:R · instrument · direction · setup · notes (only date &amp; pnl required)</span>
      </div>

      <TextArea
        aria-label="Paste trades to import"
        placeholder={"2026-08-21 | -90 | 1.5 | TSLA | long | Gap fill | chased strength\n2026-08-20 | +321 | 2.8 | TSLA | long | Trend continuation | held the runner"}
        className="min-h-36 font-mono text-[12.5px]"
        value={text}
        onChange={(e) => onChange(e.target.value)}
      />

      {text.trim() !== "" && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-raised/60 px-4 py-3 text-sm">
          <p className="text-muted">
            <span className="num text-ink">{rows.length}</span> valid {rows.length === 1 ? "trade" : "trades"}
            {bad > 0 && <span className="text-loss"> · {bad} unparseable {bad === 1 ? "line" : "lines"}</span>}
          </p>
          {rows.length > 0 && (
            <p className="num text-[12px] text-faint">
              {formatDateMedium(rows[0].date)} → {formatDateMedium(rows[rows.length - 1].date)} ·{" "}
              {formatSignedMoney(rows.reduce((s, r) => s + r.pnl, 0))}
            </p>
          )}
        </div>
      )}

      <div className="flex justify-end gap-2.5 border-t border-line pt-4">
        <Button variant="subtle" onClick={onClose} disabled={saving}>
          Cancel
        </Button>
        <Button variant="gold" onClick={onImport} loading={saving} disabled={saving || rows.length === 0}>
          <UploadIcon className="h-4 w-4" />
          Import {rows.length > 0 ? rows.length : ""} {rows.length === 1 ? "trade" : "trades"}
        </Button>
      </div>
    </div>
  );
}

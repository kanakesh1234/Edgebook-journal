"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { CURRENCIES, CURRENCY_SYMBOLS, type CurrencyCode } from "@/lib/types";
import { dataStore } from "@/lib/services/storage";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import {
  DownloadIcon,
  LogoutIcon,
  ShieldIcon,
  SparklesIcon,
  TargetIcon,
  TrashIcon,
  UploadIcon,
} from "@/components/ui/icons";

export default function SettingsPage() {
  const router = useRouter();
  const user = useApp((s) => s.user);
  const settings = useApp((s) => s.settings);
  const entryCount = useApp((s) => s.entries.length);

  // Local draft of the journey plan
  const [start, setStart] = useState(String(settings.startingEquity));
  const [target, setTarget] = useState(String(settings.targetEquity));
  const [maxDd, setMaxDd] = useState(String(settings.maxDrawdown));
  const [currency, setCurrency] = useState<CurrencyCode>(settings.currency);
  const [planErrors, setPlanErrors] = useState<Record<string, string>>({});
  const [savingPlan, setSavingPlan] = useState(false);

  const [usage, setUsage] = useState<number | null>(null);
  const [clearOpen, setClearOpen] = useState(false);
  const [clearBusy, setClearBusy] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ entries: number; name: string } | null>(null);

  useEffect(() => {
    void dataStore.estimateUsage().then(setUsage);
  }, [entryCount]);

  /* ------------------------------ actions ------------------------------ */

  const savePlan = async () => {
    const s = Number(start);
    const t = Number(target);
    const m = Number(maxDd);
    const errs: Record<string, string> = {};
    if (!Number.isFinite(s) || s <= 0) errs.start = "Enter your starting balance.";
    if (!Number.isFinite(t) || t <= 0) errs.target = "Enter a target balance.";
    else if (Number.isFinite(s) && t <= s) errs.target = "Target must be above the start.";
    if (!Number.isFinite(m) || m <= 0) errs.maxDd = "Set your risk budget.";
    setPlanErrors(errs);
    if (Object.keys(errs).length) return;

    setSavingPlan(true);
    await useApp.getState().updateSettings({
      startingEquity: s,
      targetEquity: t,
      maxDrawdown: m,
      currency,
    });
    setSavingPlan(false);
    toast.success("Journey plan updated", "The roadmap recalculated instantly.");
  };

  const exportJson = () => {
    const payload = useApp.getState().exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edgebook-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Journal exported", `${payload.entries.length} entries saved as JSON.`);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { entries?: unknown; settings?: unknown };
      if (!Array.isArray(data.entries)) throw new Error("bad shape");
      setImportPreview({ entries: data.entries.length, name: file.name });
    } catch {
      toast.error("Import failed", "That file doesn't look like an Edgebook export.");
    }
  };

  const confirmImport = async () => {
    if (!importRef.current?.files?.[0]) return;
    try {
      const data = JSON.parse(await importRef.current.files[0].text());
      await useApp.getState().replaceJournal(data);
      toast.success("Journal imported", `${data.entries.length} entries restored.`);
    } catch {
      toast.error("Import failed", "Please try a different file.");
    } finally {
      setImportPreview(null);
      if (importRef.current) importRef.current.value = "";
    }
  };

  const clearAll = async () => {
    setClearBusy(true);
    await useApp.getState().clearAllEntries();
    setClearBusy(false);
    setClearOpen(false);
    toast.info("All entries removed", "A blank page again.");
  };

  const loadDemo = async () => {
    setDemoBusy(true);
    await useApp.getState().loadDemoData();
    setDemoBusy(false);
    toast.success("Demo journal loaded");
  };

  const signOut = async () => {
    await useApp.getState().signOut();
    router.replace("/login");
  };

  /* ------------------------------- view -------------------------------- */

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-2xl font-bold tracking-tight text-ink sm:text-3xl">Settings</h1>
        <p className="mt-1 text-sm text-muted">Tune the plan behind your roadmap and manage your data.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------ Profile ------------------------------ */}
        <section className="panel p-6" aria-label="Profile">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Profile</h2>
          <div className="mt-4 flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-gold/30 bg-gold/[0.07] font-mono text-lg font-bold text-gold">
              {(user?.name ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{user?.name}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
            </div>
          </div>
          <Button variant="subtle" size="sm" onClick={() => void signOut()} className="mt-5">
            <LogoutIcon className="h-3.5 w-3.5" />
            Sign out
          </Button>
        </section>

        {/* ---------------------------- Journey plan ---------------------------- */}
        <section className="panel p-6" aria-label="Journey plan">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink">
            <TargetIcon className="h-4 w-4 text-gold" />
            Journey plan
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            These values power the roadmap, drawdown meter and target tracking.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Starting equity" error={planErrors.start} htmlFor="set-start">
              <TextInput
                id="set-start"
                inputMode="decimal"
                value={start}
                invalid={!!planErrors.start}
                onChange={(e) => setStart(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </Field>
            <Field label="Target equity" error={planErrors.target} htmlFor="set-target">
              <TextInput
                id="set-target"
                inputMode="decimal"
                value={target}
                invalid={!!planErrors.target}
                onChange={(e) => setTarget(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </Field>
            <Field label="Max drawdown budget" error={planErrors.maxDd} htmlFor="set-dd">
              <TextInput
                id="set-dd"
                inputMode="decimal"
                value={maxDd}
                invalid={!!planErrors.maxDd}
                onChange={(e) => setMaxDd(e.target.value.replace(/[^\d.]/g, ""))}
              />
            </Field>
            <Field label="Currency" htmlFor="set-currency">
              <Select id="set-currency" value={currency} onChange={(e) => setCurrency(e.target.value as CurrencyCode)}>
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c} — {CURRENCY_SYMBOLS[c]}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-raised/50 px-4 py-3 text-[13px] text-muted">
            <ShieldIcon className="mr-1.5 inline h-3.5 w-3.5 text-profit" />
            Journey range{" "}
            <span className="font-mono text-ink">
              {formatMoney(Number(start) || 0, currency)} → {formatMoney(Number(target) || 0, currency)}
            </span>{" "}
            · risking{" "}
            <span className="font-mono text-ink">{formatMoney(Number(maxDd) || 0, currency)}</span> to make{" "}
            <span className="font-mono text-profit">
              {formatMoney(Math.max(0, (Number(target) || 0) - (Number(start) || 0)), currency)}
            </span>
          </div>

          <Button variant="gold" onClick={() => void savePlan()} loading={savingPlan} className="mt-4 w-full sm:w-auto">
            Save plan
          </Button>
        </section>

        {/* ------------------------------- Data -------------------------------- */}
        <section className="panel p-6 lg:col-span-2" aria-label="Data management">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink">
            <DownloadIcon className="h-4 w-4 text-info" />
            Your data
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Everything lives in this browser (IndexedDB){usage != null ? ` — ${formatBytes(usage)} used` : ""}.
            Screenshots are stored as compressed images; exports include all journal metadata.
          </p>

          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <button
              onClick={exportJson}
              className="group flex items-start gap-3 rounded-xl border border-line bg-raised/50 p-4 text-left transition-all hover:border-line-strong hover:bg-raised active:scale-[0.98]"
            >
              <DownloadIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-info" />
              <span>
                <span className="block text-sm font-semibold text-ink">Export journal</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">Download everything as JSON</span>
              </span>
            </button>

            <button
              onClick={() => importRef.current?.click()}
              className="group flex items-start gap-3 rounded-xl border border-line bg-raised/50 p-4 text-left transition-all hover:border-line-strong hover:bg-raised active:scale-[0.98]"
            >
              <UploadIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-info" />
              <span>
                <span className="block text-sm font-semibold text-ink">Import backup</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">Restore from an export file</span>
              </span>
              <input
                ref={importRef}
                type="file"
                accept="application/json,.json"
                hidden
                onChange={(e) => e.target.files?.[0] && void onImportFile(e.target.files[0])}
              />
            </button>

            <button
              onClick={() => void loadDemo()}
              disabled={demoBusy}
              className="group flex items-start gap-3 rounded-xl border border-line bg-raised/50 p-4 text-left transition-all hover:border-line-strong hover:bg-raised active:scale-[0.98] disabled:opacity-60"
            >
              <SparklesIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-gold" />
              <span>
                <span className="block text-sm font-semibold text-ink">Load demo data</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  {demoBusy ? "Generating…" : "~80 sample sessions to explore"}
                </span>
              </span>
            </button>

            <button
              onClick={() => setClearOpen(true)}
              disabled={entryCount === 0}
              className="group flex items-start gap-3 rounded-xl border border-line bg-raised/50 p-4 text-left transition-all hover:border-loss/40 hover:bg-loss/[0.05] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-40"
            >
              <TrashIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-loss" />
              <span>
                <span className="block text-sm font-semibold text-ink">Remove all entries</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  {entryCount === 0 ? "Nothing to remove" : `Delete all ${entryCount} permanently`}
                </span>
              </span>
            </button>
          </div>
        </section>
      </div>

      <ConfirmDialog
        open={clearOpen}
        onClose={() => setClearOpen(false)}
        onConfirm={() => void clearAll()}
        busy={clearBusy}
        title="Delete every entry?"
        body={`All ${entryCount} entries and their screenshots will be permanently erased from this device. Consider exporting first.`}
        confirmLabel="Delete everything"
      />

      <Modal
        open={!!importPreview}
        onClose={() => setImportPreview(null)}
        size="sm"
        title="Replace journal with this backup?"
        label="Confirm import"
      >
        <div className="px-6 py-6">
          <p className="text-sm leading-relaxed text-muted">
            <span className="font-semibold text-ink">{importPreview?.name}</span> contains{" "}
            <span className="font-semibold text-ink">{importPreview?.entries}</span> entries. Importing will
            replace your current journal ({entryCount} entries).
          </p>
          <p className="mt-3 rounded-lg border border-loss/25 bg-loss/[0.06] px-3 py-2 text-xs text-loss">
            This cannot be undone — export first if unsure.
          </p>
          <div className="mt-5 flex justify-end gap-2.5">
            <Button variant="subtle" onClick={() => setImportPreview(null)}>
              Cancel
            </Button>
            <Button variant="danger" onClick={() => void confirmImport()}>
              Replace journal
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

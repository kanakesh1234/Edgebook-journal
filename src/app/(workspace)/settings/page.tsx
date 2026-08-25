"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { useTheme, type ThemeChoice } from "@/lib/theme";

import { dataStore } from "@/lib/services/storage";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import {
  CloudIcon,
  DownloadIcon,
  LogoutIcon,
  MoonIcon,
  MonitorIcon,
  ShieldIcon,
  SparklesIcon,
  SunIcon,
  TargetIcon,
  UploadIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";

const THEME_OPTIONS: { value: ThemeChoice; label: string; icon: typeof SunIcon }[] = [
  { value: "light", label: "Light", icon: SunIcon },
  { value: "dark", label: "Dark", icon: MoonIcon },
  { value: "system", label: "System", icon: MonitorIcon },
];

export default function SettingsPage() {
  const router = useRouter();
  const user = useApp((s) => s.user);
  const settings = useApp((s) => s.settings);
  const entryCount = useApp((s) => s.entries.length);
  const { choice: themeChoice, resolved: resolvedTheme, setChoice: setThemeChoice } = useTheme();

  // Google Drive connection state — server-verified (real token refresh)
  const [driveState, setDriveState] = useState<{ configured: boolean; loggedIn: boolean; email: string | null; driveConnected: boolean } | null>(null);
  useEffect(() => {
    void fetch("/api/auth/google/session", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setDriveState(d ? { configured: d.configured, loggedIn: d.loggedIn, email: d.user?.email ?? null, driveConnected: d.drive.connected } : { configured: false, loggedIn: false, email: null, driveConnected: false }))
      .catch(() => setDriveState({ configured: false, loggedIn: false, email: null, driveConnected: false }));
  }, []);


  const [usage, setUsage] = useState<number | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const importRef = useRef<HTMLInputElement>(null);
  const [importPreview, setImportPreview] = useState<{ entries: number; name: string } | null>(null);

  useEffect(() => {
    void dataStore.estimateUsage().then(setUsage);
  }, [entryCount]);

  /* ------------------------------ actions ------------------------------ */

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
        <h1 className="font-display text-[26px] font-semibold tracking-[-0.02em] text-ink sm:text-3xl sm:font-semibold">Settings</h1>
        <p className="mt-1 text-sm text-muted">Tune the plan behind your roadmap and manage your data.</p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ---------------------------- Appearance ---------------------------- */}
        <section className="panel p-6" aria-label="Appearance">
          <h2 className="flex items-center gap-2 font-display text-base font-semibold tracking-tight text-ink">
            <SunIcon className="h-4 w-4 text-gold" />
            Appearance
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-muted">
            Warm light for the day, focused dark for the night. Your choice is remembered on this
            device.
          </p>

          <div
            role="radiogroup"
            aria-label="Theme"
            className="mt-5 grid grid-cols-3 gap-1 rounded-control border border-line bg-canvas/60 p-1"
          >
            {THEME_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const active = themeChoice === opt.value;
              return (
                <button
                  key={opt.value}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setThemeChoice(opt.value)}
                  className={cn(
                    "relative rounded-lg py-2 text-sm font-medium transition-colors",
                    active ? "text-ink" : "text-faint hover:text-muted",
                  )}
                >
                  {active && (
                    <motion.span
                      layoutId="theme-choice"
                      transition={{ type: "spring", stiffness: 480, damping: 38 }}
                      className="absolute inset-0 rounded-lg border border-line-strong bg-raised shadow-sm"
                    />
                  )}
                  <span className="relative flex items-center justify-center gap-2">
                    <Icon className="h-4 w-4" />
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="mt-3 text-xs text-faint" aria-live="polite">
            {themeChoice === "system"
              ? `Following your system — currently ${resolvedTheme}.`
              : `Rendering in ${themeChoice}.`}
          </p>
        </section>

        {/* ------------------------------ Profile ------------------------------ */}
        <section className="panel p-6" aria-label="Profile">
          <h2 className="font-display text-base font-semibold tracking-tight text-ink">Profile</h2>
          <div className="mt-4 flex items-center gap-4">
            <span className="grid h-14 w-14 place-items-center rounded-2xl border border-gold/30 bg-gold/[0.07] text-lg font-semibold text-gold">
              {(user?.name ?? "?").slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{user?.name}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
              {user?.id.startsWith("g_") && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                  Google account · Drive persistence active
                </p>
              )}
            </div>
          </div>
          <Button variant="subtle" size="sm" onClick={() => void signOut()} className="mt-5">
            <LogoutIcon className="h-3.5 w-3.5" />
            Sign out
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


          </div>
        </section>
      </div>

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

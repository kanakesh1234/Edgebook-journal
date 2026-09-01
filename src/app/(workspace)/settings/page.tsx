"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useApp } from "@/lib/store";
import { useUi } from "@/lib/ui-store";
import { useTheme, type ThemeChoice } from "@/lib/theme";

import { dataStore } from "@/lib/services/storage";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Select, TextInput } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";
import { toast } from "@/components/ui/toast";
import {
  CloudIcon,
  CopyIcon,
  DownloadIcon,
  LogoutIcon,
  MoonIcon,
  MonitorIcon,
  RouteIcon,
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

  // Full Name from Settings wins over the auth/Google name everywhere.
  const displayName = settings.fullName?.trim() || user?.name || "";

  // Google Drive connection status — shared, bootstrap-verified state
  // (no duplicate /api/auth/google/session request from this page).
  const driveStatus = useUi((s) => s.driveStatus);


  const [usage, setUsage] = useState<number | null>(null);
  const [demoBusy, setDemoBusy] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);
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

  const runBackfill = async () => {
    setBackfillBusy(true);
    try {
      const count = await useApp.getState().backfillEntryTimesFromNotes();
      if (count > 0) {
        toast.success(
          `Recovered entry time for ${count} ${count === 1 ? "trade" : "trades"}`,
          "Extracted from notes left by the old importer — time-window and day-of-week analysis will now include these.",
        );
      } else {
        toast.success("Nothing to recover", "No trades had a recoverable entry time in their notes.");
      }
    } finally {
      setBackfillBusy(false);
    }
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
              {displayName.slice(0, 2).toUpperCase()}
            </span>
            <div className="min-w-0">
              <p className="truncate font-medium text-ink">{displayName}</p>
              <p className="truncate text-sm text-muted">{user?.email}</p>
              {user?.id.startsWith("g_") && (
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-faint">
                  <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                  Google account · Drive persistence active
                </p>
              )}
            </div>
          </div>

          <ProfileFields />
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

            <button
              onClick={() => void runBackfill()}
              disabled={backfillBusy}
              className="group flex items-start gap-3 rounded-xl border border-line bg-raised/50 p-4 text-left transition-all hover:border-line-strong hover:bg-raised active:scale-[0.98] disabled:opacity-60"
            >
              <RouteIcon className="mt-0.5 h-4.5 w-4.5 shrink-0 text-info" />
              <span>
                <span className="block text-sm font-semibold text-ink">Recover entry times</span>
                <span className="mt-0.5 block text-[11px] leading-snug text-muted">
                  {backfillBusy ? "Scanning…" : "Fix old imports missing entry time"}
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

/* ------------------------------ profile fields ------------------------------ */

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

/**
 * Full Name + Account Handle / Connection ID.
 * The handle is the canonical friend identifier — never an email.
 */
function ProfileFields() {
  const user = useApp((s) => s.user);
  const settings = useApp((s) => s.settings);
  const [fullName, setFullName] = useState(settings.fullName ?? "");
  const [handle, setHandle] = useState(settings.handle ?? "");
  const [nameState, setNameState] = useState<"idle" | "saving" | "saved">("idle");
  const [handleState, setHandleState] = useState<"idle" | "saving" | "saved">("idle");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Keep local inputs in sync when settings change elsewhere.
  useEffect(() => { setFullName(settings.fullName ?? ""); }, [settings.fullName]);
  useEffect(() => { setHandle(settings.handle ?? ""); }, [settings.handle]);

  // Google users own their handle server-side; claim it on load if not yet local.
  const isGoogleUser = !!user?.id.startsWith("g_");
  useEffect(() => {
    if (!isGoogleUser) return;
    let cancelled = false;
    void fetch("/api/profile/handle", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.handle && !useApp.getState().settings.handle) {
          void useApp.getState().updateSettings({ handle: d.handle as string });
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [isGoogleUser]);

  const saveName = async () => {
    setNameState("saving");
    await useApp.getState().updateSettings({ fullName: fullName.trim() });
    setNameState("saved");
    toast.success("Full name saved", "Your dashboard greeting now uses it.");
    setTimeout(() => setNameState("idle"), 1600);
  };

  const saveHandle = async () => {
    const clean = handle.trim().replace(/^@/, "").toLowerCase();
    if (!HANDLE_RE.test(clean)) {
      setHandleError("3–24 characters — lowercase letters, numbers and underscores only.");
      return;
    }
    setHandleError(null);
    setHandleState("saving");
    try {
      if (isGoogleUser) {
        // Server-side uniqueness check + claim.
        const res = await fetch("/api/profile/handle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ handle: clean }),
        });
        if (!res.ok) {
          const d = (await res.json().catch(() => ({}))) as { detail?: string };
          setHandleError(d.detail ?? "Could not save that handle. Please try another.");
          setHandleState("idle");
          return;
        }
      } else {
        // Local accounts: best-effort local uniqueness against friends we know about.
        try {
          const d = (await fetch(`/api/friends?search=${encodeURIComponent(clean)}`).then((r) => r.json())) as { results?: unknown[] };
          if (Array.isArray(d.results) && d.results.length > 0) {
            setHandleError("That handle is already taken.");
            setHandleState("idle");
            return;
          }
        } catch { /* offline dev — accept locally */ }
      }
      await useApp.getState().updateSettings({ handle: clean });
      setHandle(clean);
      setHandleState("saved");
      toast.success("Handle saved", "Friends can find you with this Connection ID.");
      setTimeout(() => setHandleState("idle"), 1600);
    } finally {
      setHandleState("idle");
    }
  };

  const connectionId = (settings.handle ?? "").replace(/^@/, "");
  const copyHandle = async () => {
    if (!connectionId) return;
    try {
      await navigator.clipboard.writeText(`@${connectionId}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const nameDirty = fullName.trim() !== (settings.fullName ?? "").trim();
  const handleDirty = handle.trim().replace(/^@/, "").toLowerCase() !== (settings.handle ?? "").trim();

  return (
    <div className="mt-6 space-y-5 border-t border-line pt-5">
      {/* Full Name */}
      <Field label="Full name" hint="used in your dashboard greeting" htmlFor="settings-fullname">
        <div className="flex gap-2">
          <TextInput
            id="settings-fullname"
            placeholder="e.g. Nandigam Kanakeswara Rao"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nameDirty && (void saveName())}
          />
          <Button variant="outline" size="sm" disabled={!nameDirty || nameState === "saving"} onClick={() => void saveName()}>
            {nameState === "saving" ? "Saving…" : nameState === "saved" ? "Saved ✓" : "Save"}
          </Button>
        </div>
        <p className="pt-1 text-[11px] text-faint">Shown instead of your email or Google name across EdgeBook.</p>
      </Field>

      {/* Handle / Connection ID */}
      <Field label="Account handle · Connection ID" hint="how friends find and connect with you" htmlFor="settings-handle">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm text-faint">@</span>
            <TextInput
              id="settings-handle"
              className="pl-8 font-mono"
              placeholder="your_handle"
              value={handle}
              invalid={!!handleError}
              onChange={(e) => setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, ""))}
              onKeyDown={(e) => e.key === "Enter" && handleDirty && (void saveHandle())}
            />
          </div>
          <Button variant="outline" size="sm" disabled={!handleDirty || handleState === "saving"} onClick={() => void saveHandle()}>
            {handleState === "saving" ? "Checking…" : handleState === "saved" ? "Saved ✓" : "Save"}
          </Button>
        </div>
        {handleError ? (
          <p role="alert" className="pt-1 text-[11px] text-loss">{handleError}</p>
        ) : (
          <p className="pt-1 text-[11px] text-faint">
            Unique across EdgeBook. Friends search this handle to send a request — your email is never exposed.
          </p>
        )}
      </Field>

      {connectionId && (
        <div className="flex items-center justify-between gap-3 rounded-control border border-line bg-raised/60 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">Connection ID</p>
            <p className="truncate font-mono text-sm font-semibold text-ink">@{connectionId}</p>
          </div>
          <Button variant="subtle" size="sm" onClick={() => void copyHandle()}>
            <CopyIcon className="h-3.5 w-3.5" />
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      )}
    </div>
  );
}

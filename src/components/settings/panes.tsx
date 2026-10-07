"use client";

/* ------------------------------------------------------------------ */
/*  Settings panes                                                     */
/*  Every control below is wired to the same store actions, services   */
/*  and validation the previous Settings page used.                    */
/* ------------------------------------------------------------------ */

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/store";
import { useUi, type DriveStatus } from "@/lib/ui-store";
import { useTheme, type ThemeChoice } from "@/lib/theme";
import { dataStore } from "@/lib/services/storage";
import { currencySymbol } from "@/lib/format";
import { primaryChallenge } from "@/lib/challenges";
import { haptic } from "@/lib/haptics";
import { toast } from "@/components/ui/toast";
import type { JournalSettings } from "@/lib/types";
import { LogoMark } from "@/components/landing/logo";
import {
  CandlestickIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  InfoIcon,
  LogoutIcon,
  ShieldIcon,
  SparklesIcon,
  UploadIcon,
  UserIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import { ClockRewindGlyph, DatabaseGlyph } from "./icons";
import {
  ActionSheet,
  Avatar,
  FieldRow,
  Group,
  Row,
  SaveSlot,
  Stepper,
  type SaveState,
} from "./primitives";

/* ------------------------------ registry ------------------------------ */

export type PaneId = "profile" | "account" | "appearance" | "minato" | "trading" | "privacy" | "data" | "about";

export const PANE_TITLES: Record<PaneId, string> = {
  profile: "Profile",
  account: "Account",
  appearance: "Appearance",
  minato: "MINATO",
  trading: "Trading Preferences",
  privacy: "Privacy",
  data: "Data",
  about: "About",
};

export function isPaneId(v: string | null): v is PaneId {
  return !!v && v in PANE_TITLES;
}

/* ------------------------------ helpers ------------------------------ */

export function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const THEME_LABEL: Record<ThemeChoice, string> = { light: "Light", dark: "Dark", system: "Automatic" };
export const themeLabel = (c: ThemeChoice) => THEME_LABEL[c];

const REPLY_MIN = 250;
const REPLY_MAX = 8_000;
const REPLY_STEP = 250;
const REPLY_DEFAULT = 900;
export const clampReply = (n: number) => Math.min(REPLY_MAX, Math.max(REPLY_MIN, n));

/** The name shown everywhere: Full Name from Settings wins over the auth/Google name. */
export function useDisplayName(): string {
  const user = useApp((s) => s.user);
  const fullName = useApp((s) => s.settings.fullName);
  return fullName?.trim() || user?.name || "";
}

/* ------------------------- profile photo helper ------------------------- */

/** Centre-crops to a square and downsizes, so the saved photo stays ~20–40 KB. */
async function toAvatarDataUrl(file: File, size = 256): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode"));
      i.src = url;
    });
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas");
    ctx.fillStyle = "#ffffff"; // transparent PNGs become white, not black
    ctx.fillRect(0, 0, size, size);
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, size, size);
    return canvas.toDataURL("image/jpeg", 0.86);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/* ================================ PROFILE ================================ */

const HANDLE_RE = /^[a-z0-9_]{3,24}$/;

function ProfilePane() {
  const user = useApp((s) => s.user);
  const settings = useApp((s) => s.settings);
  const displayName = useDisplayName();

  const [fullName, setFullName] = useState(settings.fullName ?? "");
  const [handle, setHandle] = useState(settings.handle ?? "");
  const [nameState, setNameState] = useState<SaveState>("idle");
  const [handleState, setHandleState] = useState<SaveState>("idle");
  const [handleError, setHandleError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [photoSheet, setPhotoSheet] = useState(false);
  const photoRef = useRef<HTMLInputElement>(null);
  const photo = (settings as { avatar?: string }).avatar;

  const onPhotoFile = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      haptic.error();
      toast.error("Not an image", "Please choose a JPG, PNG or similar photo.");
      return;
    }
    try {
      const avatar = await toAvatarDataUrl(file);
      await useApp.getState().updateSettings({ avatar } as Partial<JournalSettings>);
      haptic.success();
      toast.success("Profile photo updated");
    } catch {
      haptic.error();
      toast.error("Couldn't use that photo", "Try a different image (JPG or PNG works best).");
    }
  };

  const removePhoto = async () => {
    setPhotoSheet(false);
    await useApp.getState().updateSettings({ avatar: undefined } as Partial<JournalSettings>);
    haptic.selection();
    toast.success("Profile photo removed");
  };

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
    haptic.success();
    toast.success("Full name saved", "Your dashboard greeting now uses it.");
    setTimeout(() => setNameState("idle"), 1600);
  };

  const saveHandle = async () => {
    const clean = handle.trim().replace(/^@/, "").toLowerCase();
    if (!HANDLE_RE.test(clean)) {
      setHandleError("3–24 characters — lowercase letters, numbers and underscores only.");
      haptic.error();
      return;
    }
    setHandleError(null);
    setHandleState("saving");
    let ok = false;
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
          haptic.error();
          return;
        }
      } else {
        // Local accounts: best-effort local uniqueness against friends we know about.
        try {
          const d = (await fetch(`/api/friends?search=${encodeURIComponent(clean)}`).then((r) => r.json())) as { results?: unknown[] };
          if (Array.isArray(d.results) && d.results.length > 0) {
            setHandleError("That handle is already taken.");
            haptic.error();
            return;
          }
        } catch { /* offline dev — accept locally */ }
      }
      await useApp.getState().updateSettings({ handle: clean });
      setHandle(clean);
      ok = true;
      setHandleState("saved");
      haptic.success();
      toast.success("Handle saved", "Friends can find you with this Connection ID.");
      setTimeout(() => setHandleState("idle"), 1600);
    } finally {
      if (!ok) setHandleState("idle");
    }
  };

  const connectionId = (settings.handle ?? "").replace(/^@/, "");
  const copyHandle = async () => {
    if (!connectionId) return;
    try {
      await navigator.clipboard.writeText(`@${connectionId}`);
      haptic.selection();
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* clipboard unavailable */ }
  };

  const nameDirty = fullName.trim() !== (settings.fullName ?? "").trim();
  const handleDirty = handle.trim().replace(/^@/, "").toLowerCase() !== (settings.handle ?? "").trim();

  return (
    <>
      <div className="mb-2 flex flex-col items-center px-4 pb-1 text-center">
        <button
          type="button"
          onClick={() => setPhotoSheet(true)}
          aria-label="Change profile photo"
          className="rounded-full transition-opacity active:opacity-70"
        >
          <Avatar name={displayName} size={84} />
        </button>
        <button type="button" className="st-text-btn mt-0.5" onClick={() => setPhotoSheet(true)}>
          {photo ? "Edit" : "Add Photo"}
        </button>
        <p className="mt-1 max-w-full truncate text-[20px] font-semibold tracking-[-0.01em] text-ink">
          {displayName || "Your name"}
        </p>
        {connectionId && <p className="mt-0.5 font-mono text-[13px] text-muted">@{connectionId}</p>}
      </div>

      <Group footer="Shown instead of your email or Google name across Edgebook, including your dashboard greeting.">
        <FieldRow
          label="Full name"
          htmlFor="settings-fullname"
          trailing={<SaveSlot state={nameState} dirty={nameDirty} onSave={() => void saveName()} label="full name" />}
        >
          <input
            id="settings-fullname"
            className="st-input"
            placeholder="e.g. Nandigam Kanakeswara Rao"
            value={fullName}
            autoComplete="name"
            enterKeyHint="done"
            onChange={(e) => setFullName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && nameDirty && void saveName()}
          />
        </FieldRow>
      </Group>

      <Group
        title="Connection ID"
        footerTone={handleError ? "error" : "default"}
        footer={
          handleError ??
          "How friends find and connect with you. Unique across Edgebook — your email is never exposed."
        }
      >
        <FieldRow
          label="Handle"
          htmlFor="settings-handle"
          trailing={<SaveSlot state={handleState} dirty={handleDirty} onSave={() => void saveHandle()} label="handle" />}
        >
          <span aria-hidden className="-mr-2 text-muted">@</span>
          <input
            id="settings-handle"
            className="st-input font-mono"
            placeholder="your_handle"
            value={handle}
            aria-invalid={!!handleError}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="done"
            onChange={(e) => {
              setHandle(e.target.value.toLowerCase().replace(/[^a-z0-9_@]/g, "").replace(/^@/, ""));
              if (handleError) setHandleError(null);
            }}
            onKeyDown={(e) => e.key === "Enter" && handleDirty && void saveHandle()}
          />
        </FieldRow>
        {connectionId && (
          <Row
            title="Copy Connection ID"
            value={<span className="font-mono">@{connectionId}</span>}
            trailing={
              copied ? <CheckIcon className="h-[18px] w-[18px] shrink-0 text-profit" /> : <CopyIcon className="h-4 w-4 shrink-0 text-faint" />
            }
            onClick={() => void copyHandle()}
          />
        )}
      </Group>
      <span className="sr-only" aria-live="polite">{copied ? "Connection ID copied" : ""}</span>

      <input
        ref={photoRef}
        type="file"
        accept="image/*"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-picking the same file
          if (file) void onPhotoFile(file);
        }}
      />
      <ActionSheet
        open={photoSheet}
        onClose={() => setPhotoSheet(false)}
        title="Profile Photo"
        actions={[
          {
            label: photo ? "Choose New Photo" : "Choose Photo",
            onClick: () => {
              photoRef.current?.click(); // must run inside the tap for the picker to open
              setPhotoSheet(false);
            },
          },
          ...(photo ? [{ label: "Remove Photo", destructive: true, onClick: () => void removePhoto() }] : []),
        ]}
      />
    </>
  );
}

/* ================================ ACCOUNT ================================ */

const DRIVE: Record<DriveStatus, { label: string; dot: string; note: string }> = {
  connecting: { label: "Connecting…", dot: "bg-faint", note: "Checking your Google Drive connection." },
  connected: { label: "Connected", dot: "bg-profit", note: "Your journal is being saved to Google Drive." },
  temporarily_unavailable: {
    label: "Unavailable",
    dot: "bg-gold",
    note: "Google Drive is temporarily unavailable. Your session is kept and Edgebook will keep retrying.",
  },
  auth_required: {
    label: "Reconnect needed",
    dot: "bg-loss",
    note: "Google needs you to authorise Drive access again before changes can sync.",
  },
};

function AccountPane() {
  const router = useRouter();
  const user = useApp((s) => s.user);
  const driveStatus = useUi((s) => s.driveStatus);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const isGoogle = !!user?.id.startsWith("g_");
  const drive = DRIVE[driveStatus];

  const signOut = async () => {
    setSigningOut(true);
    try {
      await useApp.getState().signOut();
      router.replace("/login");
    } finally {
      setSigningOut(false);
    }
  };

  return (
    <>
      <Group>
        <Row title="Email" value={user?.email ?? "—"} />
        <Row title="Sign-in" value={isGoogle ? "Google" : "Email on this device"} />
      </Group>

      {isGoogle && (
        <Group title="Google Drive" footer={drive.note}>
          <Row
            title="Drive sync"
            value={
              <>
                <span aria-hidden className={cn("h-2 w-2 rounded-full", drive.dot)} />
                {drive.label}
              </>
            }
          />
          {driveStatus === "auth_required" && (
            <Row
              native
              href={`/api/auth/google/start?next=${encodeURIComponent("/settings")}`}
              title="Reconnect Google Drive"
              chevron
            />
          )}
        </Group>
      )}

      <Group>
        <Row
          centered
          destructive
          title={
            <span className="inline-flex items-center gap-2">
              <LogoutIcon className="h-4 w-4" />
              Sign Out
            </span>
          }
          onClick={() => setConfirmOpen(true)}
        />
      </Group>

      <ActionSheet
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        title="Sign out of Edgebook?"
        message="You can sign back in at any time."
        busy={signingOut}
        actions={[{ label: "Sign Out", destructive: true, onClick: () => void signOut() }]}
      />
    </>
  );
}

/* =============================== APPEARANCE =============================== */

const PREVIEW = {
  light: { bg: "#f7f4ee", card: "#fffefb", line: "#e7e1d4", ink: "#26221a" },
  dark: { bg: "#15120d", card: "#272219", line: "#2e281f", ink: "#f0eae0" },
} as const;

function ThemeThumb({ mode }: { mode: "light" | "dark" }) {
  const c = PREVIEW[mode];
  return (
    <svg viewBox="0 0 112 76" className="absolute inset-0 h-full w-full" aria-hidden preserveAspectRatio="none">
      <rect width="112" height="76" fill={c.bg} />
      <rect x="10" y="11" width="50" height="6" rx="3" fill={c.ink} opacity="0.85" />
      <rect x="10" y="24" width="92" height="42" rx="7" fill={c.card} stroke={c.line} />
      <rect x="18" y="33" width="42" height="5" rx="2.5" fill={c.ink} opacity="0.3" />
      <rect x="18" y="44" width="62" height="5" rx="2.5" fill={c.ink} opacity="0.18" />
      <circle cx="90" cy="36" r="4" fill="#b78e3e" />
    </svg>
  );
}

const THEME_ORDER: ThemeChoice[] = ["light", "dark", "system"];

function AppearancePane() {
  const { choice, resolved, setChoice } = useTheme();

  return (
    <Group
      footer={
        <span aria-live="polite">
          {choice === "system"
            ? `Following your system — currently ${resolved}. `
            : `Rendering in ${choice}. `}
          Your choice is remembered on this device.
        </span>
      }
    >
      <fieldset className="m-0 border-0 px-4 py-5">
        <legend className="sr-only">Theme</legend>
        <div className="grid grid-cols-3 gap-3 sm:gap-5">
          {THEME_ORDER.map((value) => (
            <label key={value} className="flex cursor-pointer flex-col items-center gap-2.5">
              <input
                type="radio"
                name="settings-theme"
                value={value}
                checked={choice === value}
                onChange={() => {
                  haptic.selection();
                  setChoice(value);
                }}
                className="peer sr-only"
              />
              <span
                className={cn(
                  "relative block aspect-[112/76] w-full overflow-hidden rounded-[11px] shadow-[0_0_0_0.5px_var(--line-strong)]",
                  "outline outline-2 outline-offset-[3px] outline-transparent transition-[outline-color,transform] duration-200",
                  "peer-checked:outline-gold peer-focus-visible:outline-ink peer-active:scale-[0.97]",
                )}
              >
                {value === "system" ? (
                  <>
                    <ThemeThumb mode="dark" />
                    <span className="absolute inset-0" style={{ clipPath: "inset(0 50% 0 0)" }}>
                      <ThemeThumb mode="light" />
                    </span>
                  </>
                ) : (
                  <ThemeThumb mode={value} />
                )}
              </span>
              <span className="text-[13px] text-ink">{THEME_LABEL[value]}</span>
              <span
                aria-hidden
                className={cn(
                  "grid h-[22px] w-[22px] place-items-center rounded-full border border-line-strong text-transparent transition-all duration-200",
                  "peer-checked:scale-100 peer-checked:border-transparent peer-checked:bg-ink peer-checked:text-canvas",
                )}
              >
                <CheckIcon className="h-3.5 w-3.5" strokeWidth={2.6} />
              </span>
            </label>
          ))}
        </div>
      </fieldset>
    </Group>
  );
}

/* ================================= MINATO ================================= */

function MinatoPane() {
  const settings = useApp((s) => s.settings);
  const stored = clampReply(settings.aiPrefs?.responseTokenLimit ?? REPLY_DEFAULT);
  const [draft, setDraft] = useState<number | null>(null);
  const value = draft ?? stored;
  const pending = useRef<number>(stored);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Every settings save rewrites the whole journal (Drive for Google users),
  // so taps are coalesced and committed once the stepper settles.
  const commit = useCallback((next: number) => {
    const s = useApp.getState().settings;
    if (clampReply(s.aiPrefs?.responseTokenLimit ?? REPLY_DEFAULT) === next) {
      if (pending.current === next) setDraft(null);
      return;
    }
    void useApp
      .getState()
      .updateSettings({ aiPrefs: { ...(s.aiPrefs ?? { includeNotes: true }), responseTokenLimit: next } })
      .then(() => {
        if (pending.current === next) setDraft(null);
      });
  }, []);

  const step = (dir: 1 | -1) => {
    const next = clampReply(value + dir * REPLY_STEP);
    if (next === value) return;
    haptic.selection();
    pending.current = next;
    setDraft(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      timer.current = null;
      commit(next);
    }, 700);
  };

  // Flush a pending change if the user navigates away mid-debounce.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
        commit(pending.current);
      }
    },
    [commit],
  );

  return (
    <Group
      title="Replies"
      footer="Sets the largest reply MINATO will write. Longer replies take more time, and your AI provider may apply a lower ceiling."
    >
      <Row
        icon={<SparklesIcon />}
        tone="gold"
        title="Maximum reply size"
        subtitle={`${REPLY_MIN.toLocaleString()} – ${REPLY_MAX.toLocaleString()} tokens`}
        value={
          <span aria-live="polite">
            {value.toLocaleString()}
          </span>
        }
        trailing={
          <Stepper
            label="Reply size"
            onDecrement={() => step(-1)}
            onIncrement={() => step(1)}
            canDecrement={value > REPLY_MIN}
            canIncrement={value < REPLY_MAX}
          />
        }
      />
    </Group>
  );
}

/* ================================= TRADING ================================ */

function TradingPane() {
  const settings = useApp((s) => s.settings);
  const active = primaryChallenge(settings);

  return (
    <>
      <Group footer="Starting balance, targets and drawdown rules are set per challenge in the Trading Lab.">
        <Row title="Currency" value={`${currencySymbol(settings.currency)} ${settings.currency}`} />
        <Row title="Active challenge" value={active?.name ?? "None"} href="/lab" chevron />
      </Group>
      <Group title="Manage">
        <Row icon={<CandlestickIcon />} tone="profit" title="Trading Lab" subtitle="Setups, rules, challenges and backtesting" href="/lab" chevron />
        <Row icon={<UserIcon />} tone="info" title="Journey roadmap" subtitle="The plan behind your progress" href="/roadmap" chevron />
      </Group>
    </>
  );
}

/* ================================= PRIVACY ================================ */

function PrivacyPane() {
  const settings = useApp((s) => s.settings);
  const user = useApp((s) => s.user);
  const isGoogle = !!user?.id.startsWith("g_");
  const connectionId = (settings.handle ?? "").replace(/^@/, "");

  return (
    <>
      <Group title="Your data" footer="Edgebook does not sell or share your journal, and never uses it for advertising.">
        <Row title="Journal stored in" value={isGoogle ? "Google Drive" : "This browser"} />
      </Group>
      <Group title="Friends" footer="Friends find you by your Connection ID. Your email address is never exposed.">
        <Row title="Visible to friends as" value={connectionId ? <span className="font-mono">@{connectionId}</span> : "Not set"} />
      </Group>
      <Group title="MINATO" footer="MINATO reads your trades, notes and reflections to answer questions about your own journal.">
        <Row title="Journal notes" value="Available to MINATO" />
      </Group>
      <Group>
        <Row title="Privacy Policy" href="/privacy" newTab />
      </Group>
    </>
  );
}

/* ================================== DATA ================================== */

function DataPane({ usage }: { usage: number | null }) {
  const entryCount = useApp((s) => s.entries.length);
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<{ file: File; entries: number; name: string } | null>(null);
  const lastPending = useRef(pending);
  if (pending) lastPending.current = pending;
  const [importing, setImporting] = useState(false);
  const [demoOpen, setDemoOpen] = useState(false);
  const [demoBusy, setDemoBusy] = useState(false);
  const [backfillBusy, setBackfillBusy] = useState(false);

  const exportJson = () => {
    const payload = useApp.getState().exportPayload();
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edgebook-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    haptic.success();
    toast.success("Journal exported", `${payload.entries.length} entries saved as JSON.`);
  };

  const onImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const data = JSON.parse(text) as { entries?: unknown; settings?: unknown };
      if (!Array.isArray(data.entries)) throw new Error("bad shape");
      setPending({ file, entries: data.entries.length, name: file.name });
    } catch {
      haptic.error();
      toast.error("Import failed", "That file doesn't look like an Edgebook export.");
    }
  };

  const confirmImport = async () => {
    if (!pending) return;
    setImporting(true);
    try {
      const data = JSON.parse(await pending.file.text());
      await useApp.getState().replaceJournal(data);
      haptic.success();
      toast.success("Journal imported", `${data.entries.length} entries restored.`);
    } catch {
      haptic.error();
      toast.error("Import failed", "Please try a different file.");
    } finally {
      setImporting(false);
      setPending(null);
    }
  };

  const loadDemo = async () => {
    setDemoBusy(true);
    try {
      await useApp.getState().loadDemoData();
      haptic.success();
      toast.success("Demo journal loaded");
    } finally {
      setDemoBusy(false);
      setDemoOpen(false);
    }
  };

  const runBackfill = async () => {
    setBackfillBusy(true);
    try {
      const count = await useApp.getState().backfillEntryTimesFromNotes();
      if (count > 0) {
        haptic.success();
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

  return (
    <>
      <Group
        title="Storage"
        footer={
          dataStore.kind === "cloud"
            ? "Your journal is saved to Google Drive. This figure is the space Edgebook uses in this browser."
            : "Everything lives in this browser (IndexedDB). Screenshots are stored as compressed images; exports include all journal metadata."
        }
      >
        <Row icon={<DatabaseGlyph />} tone="ink" title="Used on this device" value={usage != null ? formatBytes(usage) : "—"} />
      </Group>

      <Group title="Backup" footer="Importing replaces your current journal with the contents of the backup file.">
        <Row icon={<DownloadIcon />} tone="info" title="Export Journal" subtitle="Download everything as JSON" onClick={exportJson} chevron />
        <Row icon={<UploadIcon />} tone="info" title="Import Backup" subtitle="Restore from an export file" onClick={() => fileRef.current?.click()} chevron />
      </Group>

      <Group title="Tools">
        <Row
          icon={<SparklesIcon />}
          tone="gold"
          title="Load Demo Data"
          subtitle={demoBusy ? "Generating…" : "About 80 sample sessions to explore"}
          busy={demoBusy}
          onClick={() => (entryCount > 0 ? setDemoOpen(true) : void loadDemo())}
          chevron
        />
        <Row
          icon={<ClockRewindGlyph />}
          tone="ink"
          title="Recover Entry Times"
          subtitle={backfillBusy ? "Scanning…" : "Fix old imports missing entry time"}
          busy={backfillBusy}
          onClick={() => void runBackfill()}
          chevron
        />
      </Group>

      <input
        ref={fileRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = ""; // allow re-picking the same file
          if (file) void onImportFile(file);
        }}
      />

      <ActionSheet
        open={!!pending}
        onClose={() => setPending(null)}
        busy={importing}
        title="Replace journal with this backup?"
        message={`${lastPending.current?.name ?? "This file"} contains ${lastPending.current?.entries ?? 0} entries. Importing will replace your current journal (${entryCount} entries). This cannot be undone — export first if unsure.`}
        actions={[{ label: "Replace Journal", destructive: true, onClick: () => void confirmImport() }]}
      />

      <ActionSheet
        open={demoOpen}
        onClose={() => setDemoOpen(false)}
        busy={demoBusy}
        title="Replace your journal with demo data?"
        message={`This swaps your ${entryCount} ${entryCount === 1 ? "entry" : "entries"} for sample sessions and resets your starting balance, target and drawdown. Export a backup first if you want to keep your journal.`}
        actions={[{ label: "Load Demo Data", destructive: true, onClick: () => void loadDemo() }]}
      />
    </>
  );
}

/* ================================== ABOUT ================================= */

function AboutPane() {
  const entryCount = useApp((s) => s.entries.length);
  const user = useApp((s) => s.user);
  const isGoogle = !!user?.id.startsWith("g_");

  return (
    <>
      <div className="flex flex-col items-center pb-1 text-center">
        <LogoMark className="h-16 w-16" />
        <p className="mt-3 text-[20px] font-semibold tracking-[-0.01em] text-ink">Edgebook</p>
      </div>
      <Group>
        <Row icon={<InfoIcon />} tone="ink" title="Journal entries" value={entryCount.toLocaleString()} />
        <Row icon={<ShieldIcon />} tone="info" title="Account type" value={isGoogle ? "Google" : "Local"} />
      </Group>
      <Group>
        <Row title="Privacy Policy" href="/privacy" newTab />
      </Group>
    </>
  );
}

/* ================================ dispatcher ================================ */

export function PaneView({ id, usage }: { id: PaneId; usage: number | null }) {
  switch (id) {
    case "profile": return <ProfilePane />;
    case "account": return <AccountPane />;
    case "appearance": return <AppearancePane />;
    case "minato": return <MinatoPane />;
    case "trading": return <TradingPane />;
    case "privacy": return <PrivacyPane />;
    case "data": return <DataPane usage={usage} />;
    case "about": return <AboutPane />;
  }
}

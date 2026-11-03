"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  CloudIcon,
  DownloadIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { Eyebrow } from "./ledger";
import { awardGameAction, getRankForXp, useLandingGame } from "./game-state";

/* ========================================================================== */
/*  QUEST 06B — SOVEREIGN GOOGLE DRIVE VAULT SIMULATOR (#drive)               */
/*  Interactive Vault Switcher & Live journal.json Inspector                  */
/* ========================================================================== */

export function DriveStatement() {
  const game = useLandingGame();
  const { rank } = getRankForXp(game.xp);

  const [storageMode, setStorageMode] = useState<"drive" | "local">("drive");
  const [showJson, setShowJson] = useState(false);
  const [exported, setExported] = useState(false);

  const handleToggleStorage = (mode: "drive" | "local") => {
    setStorageMode(mode);
    awardGameAction({
      xpDelta: 20,
      title:
        mode === "drive"
          ? "Google Drive Vault Synced"
          : "Local IndexedDB Mode Active",
      subtitle:
        mode === "drive"
          ? "Synced directly to EdgeBook/journals/journal.json in your own Drive."
          : "100% offline device storage—zero external servers.",
      tone: "gold",
    });
  };

  const handleSimulateExport = () => {
    setExported(true);
    setShowJson(true);
    awardGameAction({
      xpDelta: 45,
      composureDelta: 3,
      questId: "q6_vault",
      title: "journal.json Verified & Exported",
      subtitle: "You own 100% of your journal data in plain, portable JSON.",
      tone: "profit",
    });
  };

  const liveJsonPreview = JSON.stringify(
    {
      schema: "edgebook.journal.v1",
      owner: "you@google-drive",
      storage:
        storageMode === "drive"
          ? "Google Drive / EdgeBook / journals / journal.json"
          : "Local Device / IndexedDB",
      operatorProfile: {
        level: rank.level,
        rank: rank.title,
        xp: game.xp,
        composureScore: `${game.composure}%`,
        simulatedEquity: `$${game.equity.toLocaleString()}`,
        activeGuardrail: game.guardrailEquipped,
        unlockedBadges: game.badges,
      },
    },
    null,
    2,
  );

  return (
    <section id="drive" className="lp-wide relative py-12 sm:py-16">
      <div className="lp-game-card relative w-full overflow-hidden px-6 py-12 sm:px-10 sm:py-16 lg:px-14">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(820px 380px at 10% 0%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 70%), radial-gradient(640px 360px at 100% 100%, color-mix(in srgb, var(--profit) 8%, transparent), transparent 70%)",
          }}
        />

        <div className="relative grid items-center gap-8 lg:grid-cols-12">
          {/* Left 7 Cols: Sovereign Statement & Interactive Storage Controls */}
          <div className="lg:col-span-7">
            <Eyebrow n="06B">SOVEREIGN DATA VAULT · ZERO LOCK-IN</Eyebrow>
            <h2 className="mt-4 font-display text-[clamp(1.85rem,3.8vw,3.2rem)] font-semibold leading-[1.08] tracking-[-0.038em] text-ink">
              Your journal is one file in{" "}
              <span className="font-serif text-[1.08em] font-normal italic text-gold">
                your own Google Drive.
              </span>{" "}
              Open it, export it, or walk away with it whenever you like.
            </h2>

            {/* Interactive Storage Mode Switcher + JSON Inspector Buttons */}
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <div className="segmented">
                <button
                  type="button"
                  aria-selected={storageMode === "drive"}
                  onClick={() => handleToggleStorage("drive")}
                >
                  Google Drive Sync
                </button>
                <button
                  type="button"
                  aria-selected={storageMode === "local"}
                  onClick={() => handleToggleStorage("local")}
                >
                  Local Device Only
                </button>
              </div>

              <button
                type="button"
                onClick={() => setShowJson((prev) => !prev)}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-line-strong bg-raised px-4 font-mono text-[11px] font-semibold text-ink transition hover:border-gold"
              >
                <ShieldIcon className="h-3.5 w-3.5 text-gold" />
                {showJson ? "Hide Live JSON" : "Inspect Your Live journal.json"}
              </button>

              <button
                type="button"
                onClick={handleSimulateExport}
                className={`inline-flex h-9 items-center gap-1.5 rounded-full px-4 font-mono text-[11px] font-semibold transition ${
                  exported
                    ? "border border-profit/45 bg-profit/12 text-profit"
                    : "bg-gold-strong text-on-gold hover:bg-gold-strong-hover"
                }`}
              >
                {exported ? (
                  <>
                    <CheckCircleIcon className="h-3.5 w-3.5" />
                    <span>JSON Verified (+45 XP)</span>
                  </>
                ) : (
                  <>
                    <DownloadIcon className="h-3.5 w-3.5" />
                    <span>Verify 1-Click Export (+45 XP)</span>
                  </>
                )}
              </button>
            </div>

            {/* File Path Badge */}
            <div className="mt-5 flex flex-wrap items-center gap-4">
              <div className="inline-flex max-w-full items-center gap-2.5 rounded-2xl border border-line bg-raised px-4 py-2.5 shadow-[var(--shadow-rest)]">
                <CloudIcon className="h-4 w-4 shrink-0 text-gold" />
                <code className="font-mono text-[12px] text-ink">
                  {storageMode === "drive"
                    ? "Google Drive / EdgeBook / journals / journal.json"
                    : "IndexedDB / edgebook.local.journal.json"}
                </code>
              </div>
              <span className="font-serif text-[17.5px] italic text-gold">
                &ldquo;Own your words. Own your history. Own your edge.&rdquo;
              </span>
            </div>
          </div>

          {/* Right 5 Cols: Live Architecture Diagram OR Live Game JSON Payload */}
          <div className="rounded-[24px] border border-line-strong bg-canvas/85 p-5 lg:col-span-5">
            <div className="mb-2.5 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              <span>
                {showJson
                  ? "Live Game State -> journal.json"
                  : "Zero-Lock Vault Architecture"}
              </span>
              <span className="font-semibold text-profit">
                ● {storageMode === "drive" ? "Direct Drive Sync" : "Local IndexedDB"}
              </span>
            </div>

            {showJson ? (
              <pre className="max-h-[210px] overflow-auto rounded-xl border border-line bg-surface p-3.5 font-mono text-[11px] leading-relaxed text-ink">
                {liveJsonPreview}
              </pre>
            ) : (
              <svg
                viewBox="0 0 320 140"
                className="w-full"
                role="img"
                aria-label="Direct sync diagram between your browser and your own Google Drive vault"
              >
                <rect
                  x="12"
                  y="30"
                  width="102"
                  height="78"
                  rx="14"
                  fill="var(--color-raised)"
                  stroke="var(--color-line-strong)"
                  strokeWidth="1.5"
                />
                <text
                  x="63"
                  y="64"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--color-ink)"
                >
                  Your Device
                </text>
                <text
                  x="63"
                  y="82"
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--color-muted)"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  IndexedDB Local
                </text>

                <path
                  d="M120 60 H198"
                  stroke="var(--color-gold)"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  style={{ animation: "dash-flow 1.4s linear infinite" }}
                />
                <path
                  d="M198 78 H120"
                  stroke="var(--color-profit)"
                  strokeWidth="2"
                  strokeDasharray="5 5"
                  style={{ animation: "dash-flow 1.4s linear infinite" }}
                />

                <rect
                  x="204"
                  y="30"
                  width="104"
                  height="78"
                  rx="14"
                  fill="var(--color-raised)"
                  stroke={
                    storageMode === "drive"
                      ? "var(--color-gold)"
                      : "var(--color-line-strong)"
                  }
                  strokeWidth="2"
                />
                <text
                  x="256"
                  y="64"
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="600"
                  fill="var(--color-ink)"
                >
                  {storageMode === "drive" ? "Your Google Drive" : "JSON Export"}
                </text>
                <text
                  x="256"
                  y="82"
                  textAnchor="middle"
                  fontSize="9.5"
                  fill="var(--color-gold)"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  journal.json
                </text>
              </svg>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

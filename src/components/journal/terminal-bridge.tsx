"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sym } from "./symbols";
import { toast } from "@/components/ui/toast";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";

interface TerminalBridgeProps {
  visible: boolean;
  className?: string;
}

const FALLBACK_COMMAND = "curl -fsSL https://edgebook.trade/api/cli/bridge | bash && cd edgebook-journal && agy";

export function TerminalBridge({ visible, className }: TerminalBridgeProps) {
  const [copied, setCopied] = useState(false);
  const [command, setCommand] = useState(FALLBACK_COMMAND);
  const [syncing, setSyncing] = useState(false);
  const [syncedCount, setSyncedCount] = useState<number | null>(null);

  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const plans = useApp((s) => s.plans);
  const dayLogs = useApp((s) => s.dayLogs);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;

    async function registerSync() {
      setSyncing(true);
      try {
        const origin = window.location.origin;
        const res = await fetch("/api/cli/bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries,
            challenges: settings.challenges ?? [],
            plans: plans ?? [],
            dayLogs: dayLogs ?? [],
            settings,
          }),
        });

        if (res.ok) {
          const data = await res.json();
          if (active && data.key) {
            setCommand(`curl -fsSL "${origin}/api/cli/bridge?k=${data.key}" | bash && cd edgebook-journal && agy`);
            setSyncedCount(entries.length);
          }
        }
      } catch {
        // Fallback to origin without key
        if (active) {
          setCommand(`curl -fsSL "${window.location.origin}/api/cli/bridge" | bash && cd edgebook-journal && agy`);
        }
      } finally {
        if (active) setSyncing(false);
      }
    }

    registerSync();
    return () => {
      active = false;
    };
  }, [entries, settings.challenges, plans, dayLogs]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      haptic.success();
      setCopied(true);
      toast.success("Command copied to clipboard", "Paste in your terminal to bridge data to agy.");
      setTimeout(() => setCopied(false), 2400);
    } catch {
      haptic.error();
      toast.error("Could not copy automatically", "Please select and copy the command manually.");
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          aria-label="Terminal AI Bridge"
          initial={{ opacity: 0, y: 22, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.99 }}
          transition={{ duration: 0.32, ease: [0.16, 1, 0.3, 1] }}
          className={cn(
            "relative mx-auto mt-12 w-full max-w-[960px] overflow-hidden rounded-[20px] border border-line bg-surface/90 p-5 shadow-[0_16px_40px_-16px_rgba(0,0,0,0.22),0_0_0_1px_rgba(255,255,255,0.04)] backdrop-blur-xl sm:p-6",
            className,
          )}
        >
          {/* Subtle gradient aura */}
          <div
            aria-hidden
            className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-gold/10 blur-3xl"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-emerald-500/10 blur-3xl"
          />

          <div className="relative z-10 flex flex-col gap-4">
            {/* Top metadata row */}
            <div className="flex flex-wrap items-center justify-between gap-2.5">
              <div className="flex items-center gap-2">
                <span className="grid h-7 w-7 place-items-center rounded-lg border border-line-strong bg-raised/90 text-gold shadow-sm">
                  <span className="font-mono text-[13px] font-bold tracking-tight">&gt;_</span>
                </span>
                <div>
                  <h3 className="text-[15px] font-semibold tracking-[-0.01em] text-ink sm:text-[16px]">
                    Terminal AI Bridge
                  </h3>
                  <p className="text-[12.5px] text-muted">
                    Private analysis in your terminal with Gemini Pro via <code className="font-mono text-ink">agy</code>
                  </p>
                </div>
              </div>

              {/* Status pill */}
              <div className="inline-flex items-center gap-1.5 rounded-full border border-line-soft bg-canvas/70 px-2.5 py-1 text-[11.5px] font-medium text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>
                  {syncedCount !== null ? `${syncedCount} trades linked` : syncing ? "Connecting..." : "Zero download required"}
                </span>
              </div>
            </div>

            {/* Description */}
            <p className="text-[13.5px] leading-relaxed text-muted">
              Bridges your Google Drive journal directly into a local workspace folder with structured{" "}
              <span className="font-mono text-[12px] text-ink">trades.csv</span>,{" "}
              <span className="font-mono text-[12px] text-ink">journals/</span>, and automated{" "}
              <span className="font-mono text-[12px] text-ink">reports/</span>. Everything stays 100% local and private.
            </p>

            {/* One line command container */}
            <div className="group relative flex flex-col items-stretch justify-between gap-2 rounded-xl border border-line-strong bg-black/[0.88] p-2.5 shadow-inner sm:flex-row sm:items-center sm:gap-3 sm:py-2 sm:pl-3.5 sm:pr-2">
              <div className="flex min-w-0 flex-1 items-center gap-2 overflow-x-auto py-1 font-mono text-[12.5px] text-neutral-200 sm:text-[13px]">
                <span className="select-none font-bold text-gold">&gt;</span>
                <span className="select-all whitespace-nowrap font-medium tracking-tight text-neutral-100">
                  {command}
                </span>
              </div>

              <button
                type="button"
                onClick={copyCommand}
                aria-label="Copy terminal command"
                className={cn(
                  "inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-semibold transition-all duration-200 active:scale-[0.97]",
                  copied
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                    : "bg-gold text-neutral-950 hover:bg-gold-strong shadow-sm hover:shadow",
                )}
              >
                <Sym
                  name={copied ? "check" : "sparkles"}
                  className={cn("h-3.5 w-3.5", copied ? "text-emerald-300" : "text-neutral-950")}
                  strokeWidth={2.4}
                />
                <span>{copied ? "Copied!" : "Copy command"}</span>
              </button>
            </div>

            {/* Feature tags footer */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-[12px] text-faint">
              <span className="inline-flex items-center gap-1">
                <Sym name="shield" className="h-3.5 w-3.5 text-muted" />
                <span>100% Local &amp; Private</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Sym name="folder" className="h-3.5 w-3.5 text-muted" />
                <span>No zip extraction needed</span>
              </span>
              <span className="inline-flex items-center gap-1">
                <Sym name="chart" className="h-3.5 w-3.5 text-muted" />
                <span>Persistent memory in reports/</span>
              </span>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

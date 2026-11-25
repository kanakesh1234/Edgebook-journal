"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Sym } from "./symbols";
import { SPRING } from "./journal-ui";
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
  const [ready, setReady] = useState(false);

  const entries = useApp((s) => s.entries);
  const settings = useApp((s) => s.settings);
  const plans = useApp((s) => s.plans);
  const dayLogs = useApp((s) => s.dayLogs);

  useEffect(() => {
    if (typeof window === "undefined") return;
    let active = true;

    async function registerSync() {
      try {
        const origin = window.location.origin;
        const lessons = await fetch("/api/lessons", { cache: "no-store" })
          .then((r) => (r.ok ? r.json() : null))
          .then((d) => (Array.isArray(d?.lessons) ? d.lessons : undefined))
          .catch(() => undefined);

        const res = await fetch("/api/cli/bridge", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            entries,
            challenges: settings.challenges ?? [],
            plans: plans ?? [],
            dayLogs: dayLogs ?? [],
            settings,
            lessons,
          }),
        });

        if (res.ok) {
          const data = (await res.json()) as { key?: string; token?: string | null };
          if (!active) return;
          const qs = new URLSearchParams();
          if (data.token) qs.set("t", data.token);
          if (data.key) qs.set("k", data.key);
          const query = qs.toString() ? `?${qs.toString()}` : "";
          setCommand(`curl -fsSL "${origin}/api/cli/bridge${query}" | bash && cd edgebook-journal && agy`);
          setReady(true);
        }
      } catch {
        if (active) {
          setCommand(`curl -fsSL "${window.location.origin}/api/cli/bridge" | bash && cd edgebook-journal && agy`);
        }
      }
    }

    registerSync();
    return () => {
      active = false;
    };
  }, [entries, settings, plans, dayLogs]);

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      haptic.success();
      setCopied(true);
      toast.success("Copied to clipboard", "Paste in Terminal to open your workspace in agy.");
      setTimeout(() => setCopied(false), 2200);
    } catch {
      haptic.error();
      toast.error("Could not copy command");
    }
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.section
          aria-label="Terminal AI"
          initial={{ opacity: 0, y: 14, scale: 0.99 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.99 }}
          transition={SPRING}
          className={cn(
            "mx-auto mt-14 w-full max-w-[960px] rounded-[20px] border border-line-soft bg-surface/80 px-5 py-4 shadow-[0_8px_30px_-12px_rgb(0_0_0/0.12),0_0_0_0.5px_rgb(0_0_0/0.05)] backdrop-blur-2xl dark:shadow-[0_12px_36px_-12px_rgb(0_0_0/0.45),0_0_0_0.5px_rgb(255_255_255/0.08)]",
            className,
          )}
        >
          <div className="flex flex-col gap-3.5 sm:flex-row sm:items-center sm:justify-between sm:gap-5">
            {/* Left — quiet Apple-style title lockup */}
            <div className="flex min-w-0 items-center gap-3.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-[12px] border border-line-soft bg-ink/[0.035] text-ink">
                <span className="font-mono text-[13px] font-semibold tracking-tight text-gold">&gt;_</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-[14.5px] font-semibold tracking-[-0.015em] text-ink">
                    Terminal AI
                  </h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-ink/[0.05] px-2 py-0.5 text-[11px] font-medium text-muted">
                    <span className={cn("h-1.5 w-1.5 rounded-full", ready ? "bg-profit" : "bg-gold")} />
                    <span>agy</span>
                  </span>
                </div>
                <p className="truncate text-[12.5px] text-muted">
                  Local workspace · Private
                </p>
              </div>
            </div>

            {/* Right — masked command capsule + tactile Copy action (raw URL never exposed) */}
            <div className="flex items-center justify-between gap-2 rounded-full border border-line-soft bg-canvas/70 p-1 pl-3.5 sm:justify-end">
              <div className="flex items-center gap-2 select-none">
                <Sym name="shield" className="h-3.5 w-3.5 text-faint" strokeWidth={1.7} />
                <span className="font-mono text-[12px] tracking-[0.04em] text-muted">
                  edgebook · <span className="tracking-[0.14em] text-faint">••••••••</span>
                </span>
              </div>

              <motion.button
                type="button"
                onClick={copyCommand}
                whileTap={{ scale: 0.96 }}
                aria-label="Copy terminal command"
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[12.5px] font-medium transition-colors duration-200 outline-none focus-visible:ring-2 focus-visible:ring-gold-strong/50",
                  copied
                    ? "bg-profit/15 text-profit"
                    : "bg-ink text-canvas hover:opacity-90",
                )}
              >
                <Sym name={copied ? "check" : "link"} className="h-3.5 w-3.5" strokeWidth={2} />
                <span>{copied ? "Copied" : "Copy command"}</span>
              </motion.button>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
}

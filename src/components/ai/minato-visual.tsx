"use client";

import { useEffect } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { MinatoState } from "@/lib/minato/insights";
import { cn } from "@/lib/utils";

/**
 * MINATO SENSEI — ORIGINAL EdgeBook mentor character.
 * Anime-inspired trading sensei: dark spiky hair, calm confident eyes,
 * headband with a candlestick motif, high collar. 100% original artwork
 * drawn as inline SVG — no copyrighted character is referenced.
 *
 * Compact footprint (~44px default) with expressive states.
 */

const SKIN = "#f2d3b3";
const SKIN_SHADE = "#e0b894";
const HAIR = "#2b2f3a";
const HAIR_LIGHT = "#3d4354";
const COLLAR = "#3a4152";
const GOLD = "#c9a96b";

const STATE_EXPRESSION: Record<MinatoState, { brow: string; mouth: string; glow: string }> = {
  idle: { brow: "#2b2f3a", mouth: "M0 0", glow: "#8c8c8c" },
  curious: { brow: "#2b2f3a", mouth: "q0 3 3 0", glow: "#7da2d6" },
  thinking: { brow: "#2b2f3a", mouth: "M-2 1h4", glow: "#7da2d6" },
  warning: { brow: "#8a4b3a", mouth: "M-2.5 1.5h5", glow: "#d6a24b" },
  firm: { brow: "#7a3b2e", mouth: "M-3 1h6", glow: "#c96b5a" },
  proud: { brow: "#2b2f3a", mouth: "q0 4 4 -1", glow: "#6fae87" },
  celebration: { brow: "#2b2f3a", mouth: "q0 5 4.5 -1.5", glow: "#c9a96b" },
};

export function MinatoAvatar({
  state = "idle",
  size = 44,
  className,
}: {
  state?: MinatoState;
  size?: number;
  className?: string;
}) {
  const ex = STATE_EXPRESSION[state] ?? STATE_EXPRESSION.idle;
  const reduce = useReducedMotion();

  return (
    <motion.span
      className={cn("inline-block shrink-0", className)}
      style={{ width: size, height: size }}
      role="img"
      aria-label={`MINATO sensei — ${state}`}
      animate={reduce || state === "idle" ? undefined : { y: [0, -2, 0] }}
      transition={reduce ? undefined : { duration: 3, repeat: Infinity, ease: "easeInOut" }}
    >
      <svg viewBox="0 0 48 48" width={size} height={size} aria-hidden>
        {/* soft aura by state */}
        <circle cx="24" cy="24" r="22" fill={ex.glow} opacity={state === "idle" ? 0.06 : 0.14} />

        {/* head */}
        <ellipse cx="24" cy="26" rx="12" ry="13" fill={SKIN} />
        <ellipse cx="24" cy="26" rx="12" ry="13" fill={SKIN_SHADE} opacity="0.25" clipPath="url(#minato-shade)" />
        <clipPath id="minato-shade"><rect x="24" y="13" width="12" height="26" /></clipPath>

        {/* dark spiky hair */}
        <path
          d="M12 22 Q11 12 18 9 Q24 6 30 9 Q37 12 36 22 L33 20 Q33 15 28 14 L29 17 L25 13 L21 16 L20 13 Q15 15 15 20 Z"
          fill={HAIR}
        />
        <path d="M14 18 Q16 12 22 10" stroke={HAIR_LIGHT} strokeWidth="1.2" fill="none" strokeLinecap="round" />

        {/* headband with candlestick motif */}
        <rect x="12" y="18.5" width="24" height="4.5" rx="2" fill={COLLAR} />
        <line x1="21" y1="19.5" x2="21" y2="22" stroke={GOLD} strokeWidth="1.1" />
        <rect x="19.9" y="20" width="2.2" height="1.6" rx="0.4" fill={GOLD} />

        {/* eyes — calm, confident */}
        <ellipse cx="19" cy="27" rx="2.1" ry={state === "firm" ? 1.4 : 2.2} fill="#fff" />
        <ellipse cx="29" cy="27" rx="2.1" ry={state === "firm" ? 1.4 : 2.2} fill="#fff" />
        <circle cx={state === "curious" ? 19.8 : 19} cy="27" r="1" fill="#22303f" />
        <circle cx={state === "curious" ? 29.8 : 29} cy="27" r="1" fill="#22303f" />
        {/* brows */}
        <path d={`M16.8 ${state === "firm" ? 23.2 : 23.8} l4 ${state === "warning" || state === "firm" ? 1.2 : -0.8}`} stroke={ex.brow} strokeWidth="1.1" strokeLinecap="round" />
        <path d={`M31.2 ${state === "firm" ? 23.2 : 23.8} l-4 ${state === "warning" || state === "firm" ? 1.2 : -0.8}`} stroke={ex.brow} strokeWidth="1.1" strokeLinecap="round" />

        {/* mouth */}
        <path d={`M${22.5 + 1.5} 31.5 ${ex.mouth}`} stroke="#a06b52" strokeWidth="1.1" strokeLinecap="round" fill="none" />

        {/* high collar (sensei vibe) */}
        <path d="M14 40 Q24 34 34 40 L34 46 L14 46 Z" fill={COLLAR} />
        <path d="M22 36 L24 39 L26 36" stroke={GOLD} strokeWidth="1.1" fill="none" strokeLinecap="round" />

        {/* state accents */}
        {state === "celebration" && (
          <g stroke={GOLD} strokeWidth="1.3" strokeLinecap="round">
            <path d="M8 12 l2 2 M40 12 l-2 2 M24 2 v3" />
          </g>
        )}
        {state === "warning" && (
          <circle cx="38" cy="12" r="4" fill="#d6a24b" opacity="0.9" />
        )}
        {state === "thinking" && (
          <g fill="#7da2d6">
            <circle cx="38" cy="10" r="1.6" />
            <circle cx="41" cy="7" r="2.2" />
          </g>
        )}
      </svg>
    </motion.span>
  );
}

/** Compact dismissible speech bubble next to the avatar. */
export function MinatoBubble({
  text,
  state = "curious",
  onDismiss,
  className,
  autoHideMs,
}: {
  text: string;
  state?: MinatoState;
  onDismiss?: () => void;
  className?: string;
  autoHideMs?: number;
}) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!autoHideMs || !onDismiss) return;
    const t = setTimeout(onDismiss, autoHideMs);
    return () => clearTimeout(t);
  }, [autoHideMs, onDismiss]);

  return (
    <AnimatePresence>
      <motion.div
        initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative max-w-[240px] rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[12.5px] leading-relaxed text-ink shadow-lift",
          className,
        )}
        role="status"
      >
        {text}
        {onDismiss && (
          <button
            onClick={onDismiss}
            aria-label="Dismiss message"
            className="absolute -right-1.5 -top-1.5 grid h-4 w-4 place-items-center rounded-full border border-line bg-surface text-[9px] text-faint hover:text-ink"
          >
            ✕
          </button>
        )}
        {/* bubble tail pointing right (toward the avatar) */}
        <span className="absolute right-[-5px] top-4 h-2.5 w-2.5 rotate-45 border-b border-l border-line bg-surface" aria-hidden />
        <span className="sr-only">MINATO is {state}</span>
      </motion.div>
    </AnimatePresence>
  );
}

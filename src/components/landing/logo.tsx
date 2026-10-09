import { useId } from "react";
import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  // Unique gradient ids per instance: the logo renders in several shells at once
  // (sidebar, rail, top bar) and the hidden ones are display:none. With shared ids the
  // browser resolves the gradient to the hidden copy and the visible icon paints blank
  // on mobile. Colours go through `style` because Safari ignores var() in SVG attributes.
  const uid = useId().replace(/:/g, "");
  const tile = `lg-tile-${uid}`;
  const candle = `lg-candle-${uid}`;
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("h-8 w-8", className)} aria-hidden>
      <defs>
        <linearGradient id={tile} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--color-raised)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-canvas)" }} />
        </linearGradient>
        <linearGradient id={candle} x1="20" y1="9" x2="24" y2="19" gradientUnits="userSpaceOnUse">
          <stop style={{ stopColor: "var(--color-gold-strong-hover)" }} />
          <stop offset="1" style={{ stopColor: "var(--color-gold-strong)" }} />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill={`url(#${tile})`} style={{ stroke: "var(--color-line-strong)" }} />
      {/* red candle */}
      <path d="M10.5 7v18" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" style={{ stroke: "var(--color-loss)" }} />
      <rect x="7.75" y="14.5" width="5.5" height="7" rx="1.4" opacity="0.8" style={{ fill: "var(--color-loss)" }} />
      {/* gold candle */}
      <path d="M21.5 5v22" stroke={`url(#${candle})`} strokeWidth="1.6" strokeLinecap="round" />
      <rect x="18.75" y="9" width="5.5" height="10" rx="1.4" fill={`url(#${candle})`} />
    </svg>
  );
}

export function Wordmark({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="font-display text-[17px] font-bold tracking-tight text-ink">
        edge<span className="text-gold">book</span>
      </span>
    </span>
  );
}

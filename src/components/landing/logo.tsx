import { cn } from "@/lib/utils";

export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" className={cn("h-8 w-8", className)} aria-hidden>
      <defs>
        <linearGradient id="lg-tile" x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop stopColor="#141b28" />
          <stop offset="1" stopColor="#0a0e16" />
        </linearGradient>
        <linearGradient id="lg-candle" x1="20" y1="9" x2="24" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#f3d491" />
          <stop offset="1" stopColor="#ecc063" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#lg-tile)" stroke="#2a3750" />
      {/* red candle */}
      <path d="M10.5 7v18" stroke="#fb5570" strokeWidth="1.6" strokeLinecap="round" opacity="0.85" />
      <rect x="7.75" y="14.5" width="5.5" height="7" rx="1.4" fill="#fb5570" opacity="0.8" />
      {/* gold candle */}
      <path d="M21.5 5v22" stroke="url(#lg-candle)" strokeWidth="1.6" strokeLinecap="round" />
      <rect x="18.75" y="9" width="5.5" height="10" rx="1.4" fill="url(#lg-candle)" />
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

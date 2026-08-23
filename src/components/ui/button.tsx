"use client";

import { forwardRef } from "react";
import { motion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "gold" | "ghost" | "outline" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

export interface ButtonProps extends Omit<HTMLMotionProps<"button">, "children"> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  children?: React.ReactNode;
}

const variants: Record<Variant, string> = {
  primary:
    "bg-ink text-canvas font-semibold hover:opacity-85 shadow-sm",
  gold: "bg-gold-strong text-on-gold font-semibold hover:bg-gold-strong-hover shadow-sm",
  ghost: "text-muted hover:text-ink hover:bg-ink/[0.05]",
  outline: "border border-line-strong text-ink bg-transparent hover:bg-ink/[0.04] hover:border-faint",
  danger: "border border-loss/35 text-loss bg-loss/[0.06] hover:bg-loss/[0.14]",
  subtle: "bg-raised border border-line text-muted hover:text-ink hover:border-line-strong",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-3 text-[13px] rounded-lg gap-1.5",
  md: "h-10 px-4 text-sm rounded-control gap-2",
  lg: "h-12 px-6 text-[15px] rounded-control gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { className, variant = "primary", size = "md", loading, children, disabled, ...props },
  ref,
) {
  return (
    <motion.button
      ref={ref}
      whileTap={disabled || loading ? undefined : { scale: 0.97 }}
      transition={{ type: "spring", stiffness: 500, damping: 30 }}
      disabled={disabled || loading}
      className={cn(
        "relative inline-flex select-none items-center justify-center whitespace-nowrap font-medium tracking-[-0.01em] transition-colors duration-200 disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {loading && <Spinner className="absolute h-4 w-4" />}
      <span className={cn("inline-flex items-center gap-[inherit]", loading && "opacity-0")}>{children}</span>
    </motion.button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={cn("animate-spin", className)} aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

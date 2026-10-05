/** Shared button styles for Lessons. Aligned with the app's Button (10px control radius, 40px height) and theme tokens. */
export const btnPrimary =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-control bg-gold-strong px-4 text-sm font-semibold tracking-[-0.01em] text-on-gold transition-[background-color,transform] duration-200 hover:bg-gold-strong-hover active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
export const btn =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-line bg-raised px-4 text-sm font-medium tracking-[-0.01em] text-ink transition-[background-color,border-color,transform] duration-200 hover:border-line-strong active:scale-[0.97] disabled:pointer-events-none disabled:opacity-50";
export const btnDanger =
  "inline-flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-loss/35 bg-loss/[0.07] px-4 text-sm font-semibold tracking-[-0.01em] text-loss transition-[background-color,transform] duration-200 hover:bg-loss/[0.14] active:scale-[0.97] disabled:pointer-events-none disabled:opacity-40";
/** Kept for compatibility; the redesigned screens use the icon-button styles in lessons.css instead. */
export const pill =
  "inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-sm transition-colors duration-200 hover:bg-raised active:scale-[0.97]";

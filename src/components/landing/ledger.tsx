import type { ReactNode } from "react";

/** Ledger-entry eyebrow: "№ 02 ── The gap". The page's one recurring typographic signature. */
export function Eyebrow({ n, children }: { n: string; children: ReactNode }) {
  return (
    <p className="flex items-center gap-3 font-mono text-[12px] uppercase tracking-[0.14em] text-faint">
      <span className="text-gold">№ {n}</span>
      <span aria-hidden className="h-px w-10 bg-line-strong" />
      <span>{children}</span>
    </p>
  );
}

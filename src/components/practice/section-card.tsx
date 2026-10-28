"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Spinner } from "@/components/ui/button";
import { MODE_GLYPH, MODE_META } from "./modes";
import type { ArenaMode } from "@/lib/practice/arena";
import "./practice.css";

interface Props {
  mode: ArenaMode;
  /** One-line reason the section can't start yet. */
  blocked?: string | null;
  busy?: boolean;
  primary: { label: string; onClick?: () => void; href?: string };
  className?: string;
}

/**
 * A compact launch folder. The visual identity remains, while the card only
 * carries the one decision a trader needs to make: start this drill.
 */
export function SectionCard({ mode, blocked, busy, primary, className }: Props) {
  const meta = MODE_META[mode];
  const Glyph = MODE_GLYPH[mode];
  const locked = !!blocked;

  return (
    <article
      aria-label={meta.title}
      className={cn("pr-card", className)}
      style={{ "--pr-accent": meta.accent } as React.CSSProperties}
      data-mode={mode}
      data-locked={locked ? "true" : undefined}
    >
      <div className="pr-stage" aria-hidden="true">
        <span className="pr-stage-mark"><Glyph /></span>
        <span className="pr-icon"><Glyph /></span>
      </div>

      <div className="pr-body">
        <h2 className="pr-title">{meta.title}</h2>

        <div className="pr-foot">
          {primary.href && !locked ? (
            <Link href={primary.href} className="pr-cta">{primary.label}</Link>
          ) : (
            <button type="button" className="pr-cta" onClick={primary.onClick} disabled={locked || busy}>
              {busy && <Spinner className="h-4 w-4" />}{busy ? "Preparing…" : primary.label}
            </button>
          )}
        </div>
        {locked && <p className="pr-note" role="status">{blocked}</p>}
      </div>
    </article>
  );
}

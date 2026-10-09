"use client";

import { useId } from "react";
import { tint } from "./modes";
import type { QuestionVisual, VisualTone } from "@/lib/practice/ict";

const TONE: Record<VisualTone, string> = { gold: "var(--gold-strong)", info: "var(--info)", profit: "var(--profit)", loss: "var(--loss)", muted: "var(--faint)" };

/**
 * Draws an ICT scene: candles, labelled levels and shaded zones. Items flagged `reveal` appear only after
 * the question is answered, so the picture never gives the answer away. Pure SVG, themed with Edgebook tokens.
 */
export function CandleVisual({ visual, revealed }: { visual: QuestionVisual; revealed: boolean }) {
  const uid = useId();
  const { candles, levels = [], zones = [] } = visual;
  const shownLevels = levels.filter((l) => revealed || !l.reveal);
  const shownZones = zones.filter((z) => revealed || !z.reveal);

  const prices = [...candles.flatMap((c) => [c.h, c.l]), ...levels.map((l) => l.price), ...zones.flatMap((z) => [z.from, z.to])];
  const hi = Math.max(...prices);
  const lo = Math.min(...prices);
  const pad = (hi - lo) * 0.12 || 1;
  const top = hi + pad;
  const bottom = lo - pad;

  const W = 560, H = 230, L = 14, R = 150; // right gutter holds the labels
  const plotW = W - L - R;
  const y = (p: number) => 10 + ((top - p) / (top - bottom)) * (H - 20);
  const slot = plotW / Math.max(candles.length, 1);
  const bodyW = Math.min(34, slot * 0.5);

  return (
    <figure className="rounded-[20px] border border-line bg-surface p-3 sm:p-4">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Chart scene for this question" className="h-auto w-full">
        <defs>
          <pattern id={`${uid}-grid`} width="28" height="28" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="0.9" fill="var(--line-strong)" opacity="0.55" /></pattern>
        </defs>
        <rect x="0" y="0" width={W} height={H} fill={`url(#${uid}-grid)`} opacity="0.5" />

        {shownZones.map((z, i) => {
          const c = TONE[z.tone ?? "info"];
          const y1 = y(Math.max(z.from, z.to)); const y2 = y(Math.min(z.from, z.to));
          return (
            <g key={`z${i}`}>
              <rect x={L} y={y1} width={W - L - 6} height={Math.max(2, y2 - y1)} rx="4" fill={tint(c, 16)} stroke={tint(c, 45)} strokeWidth="1" strokeDasharray="3 3" />
              {z.label && <text x={W - R + 6} y={(y1 + y2) / 2 + 4} fontSize="11" fontWeight="600" fill={tint(c, 85, "var(--ink)")}>{z.label}</text>}
            </g>
          );
        })}

        {candles.map((k, i) => {
          const up = k.c >= k.o;
          const c = up ? "var(--profit)" : "var(--loss)";
          const cx = L + slot * i + slot / 2;
          const bTop = y(Math.max(k.o, k.c)); const bBot = y(Math.min(k.o, k.c));
          return (
            <g key={i}>
              <path d={`M${cx} ${y(k.h)}V${y(k.l)}`} stroke={c} strokeWidth="1.6" strokeLinecap="round" />
              <rect x={cx - bodyW / 2} y={bTop} width={bodyW} height={Math.max(2, bBot - bTop)} rx="2.5" fill={tint(c, 78, "var(--surface)")} stroke={c} strokeWidth="1.2" />
            </g>
          );
        })}

        {shownLevels.map((l, i) => {
          const c = TONE[l.tone ?? "muted"];
          const yy = y(l.price);
          return (
            <g key={`l${i}`}>
              <path d={`M${L} ${yy}H${W - R + 2}`} stroke={c} strokeWidth="1.3" strokeDasharray="5 4" opacity="0.9" />
              <text x={W - R + 8} y={yy + 4} fontSize="11" fontWeight="600" fill={tint(c, 90, "var(--ink)")}>{l.label}</text>
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

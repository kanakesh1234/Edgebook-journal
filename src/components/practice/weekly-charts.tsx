"use client";

import { motion, useReducedMotion } from "motion/react";
import type { WeekDay, TrendPoint } from "@/lib/weekly";
import { formatDateMedium } from "@/lib/format";

const SPRING = { type: "spring", stiffness: 140, damping: 22 } as const;

/**
 * Daily P&L for the week. Bars grow from the zero line; a short dash under each bar marks that day's loss limit,
 * so a bar that reaches its dash is a day that used the whole budget. Days over the limit are drawn in red.
 */
export function DailyChart({ days, format }: { days: WeekDay[]; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const W = 700, H = 230, padT = 24, padB = 34, mid = (H - padT - padB) / 2 + padT;
  const maxAbs = Math.max(1, ...days.map((d) => Math.abs(d.net)), ...days.map((d) => d.limit ?? 0));
  const scale = (H - padT - padB) / 2 / (maxAbs * 1.1);
  const slot = W / 7, bw = Math.min(46, slot * 0.54);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Daily profit and loss for the week">
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--line-strong)" strokeWidth="1" />
      {days.map((d, i) => {
        const cx = slot * i + slot / 2, h = Math.abs(d.net) * scale, up = d.net >= 0;
        const breach = d.risk?.status === "over" || d.risk?.status === "hit";
        const color = d.trades.length === 0 ? "var(--line)" : up ? "var(--profit)" : "var(--loss)";
        return (
          <g key={d.date} opacity={d.future ? 0.4 : 1}>
            {d.trades.length > 0 ? (
              <motion.rect
                x={cx - bw / 2} width={bw} rx="8" fill={color}
                initial={reduce ? false : { height: 0, y: mid }}
                animate={{ height: Math.max(h, 3), y: up ? mid - Math.max(h, 3) : mid }}
                transition={{ ...SPRING, delay: i * 0.04 }}
              />
            ) : <rect x={cx - bw / 2} y={mid - 1.5} width={bw} height="3" rx="1.5" fill="var(--line)" />}
            {d.limit && (
              <g>
                <line x1={cx - bw / 2 - 6} x2={cx + bw / 2 + 6} y1={mid + d.limit * scale} y2={mid + d.limit * scale} stroke={breach ? "var(--loss)" : "var(--gold-strong)"} strokeWidth="2" strokeDasharray="4 4" strokeLinecap="round" />
              </g>
            )}
            {d.trades.length > 0 && (
              <text x={cx} y={up ? mid - h - 8 : mid + h + 16} textAnchor="middle" className="fill-ink" style={{ font: "600 12px var(--font-mono, ui-monospace)" }}>{format(d.net)}</text>
            )}
            <text x={cx} y={H - 12} textAnchor="middle" className="fill-muted" style={{ font: "500 12.5px inherit" }}>{d.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

/** Eight weeks of net P&L, oldest first, with plan adherence under each bar. The selected week is solid. */
export function TrendChart({ points, selected, onPick, format }: { points: TrendPoint[]; selected: string; onPick: (start: string) => void; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const maxAbs = Math.max(1, ...points.map((p) => Math.abs(p.net)));
  const half = 62;
  return (
    <div className="grid" style={{ gridTemplateColumns: `repeat(${points.length}, minmax(0, 1fr))` }}>
      {points.map((p, i) => {
        const h = (Math.abs(p.net) / maxAbs) * half, up = p.net >= 0, on = p.start === selected;
        return (
          <button key={p.start} type="button" onClick={() => onPick(p.start)} aria-label={`Week of ${formatDateMedium(p.start)}: ${format(p.net)}, ${p.trades} trades`} aria-pressed={on}
            className="group flex flex-col items-center rounded-xl px-1 py-1.5 outline-none transition-colors hover:bg-ink/[0.04] focus-visible:ring-2 focus-visible:ring-gold-strong/50">
            <div className="relative h-[124px] w-full">
              <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-line-strong" />
              {p.trades > 0 && (
                <motion.span
                  className="absolute left-1/2 w-[58%] max-w-[34px] -translate-x-1/2 rounded-md"
                  style={{ background: up ? "var(--profit)" : "var(--loss)", opacity: on ? 1 : 0.4, [up ? "bottom" : "top"]: "50%" }}
                  initial={reduce ? false : { height: 0 }} animate={{ height: Math.max(h, 3) }} transition={{ ...SPRING, delay: i * 0.03 }}
                />
              )}
            </div>
            <span className={on ? "text-[11.5px] font-semibold text-ink" : "text-[11.5px] text-faint"}>{formatDateMedium(p.start).slice(4)}</span>
            <span className="num mt-0.5 text-[11px] text-faint">{p.adherence == null ? "—" : `${Math.round(p.adherence * 100)}%`}</span>
          </button>
        );
      })}
    </div>
  );
}

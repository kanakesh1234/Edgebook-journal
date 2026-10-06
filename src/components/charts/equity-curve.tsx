"use client";

/**
 * EquityCurve — the performance line, drawn so the trend is the whole picture.
 *
 *  · One line, tinted by whether the period ended up or down. Gold is NOT used
 *    here — it stays reserved for the target and primary actions.
 *  · The y-domain fits the DATA. The target is deliberately kept out of it so a
 *    distant goal never flattens the curve (it is shown in the metrics strip).
 *  · Three hairline gridlines at most, no axis lines, one dashed baseline = the
 *    period's opening equity (what every "change" is measured against).
 *  · Scrub with mouse, touch or ← → keys. There is no vertical cursor line:
 *    a single dot glides to each trading day, the part of the line after it
 *    softens, and a small floating chip (the only material on the chart) names
 *    the day, while the page header above shows the equity at that moment.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import type { CurrencyCode } from "@/lib/types";
import { formatDateMedium, formatMoney, formatSignedMoney, parseDateKey } from "@/lib/format";
import { glass } from "@/components/journal/flow-ui";
import { cn } from "@/lib/utils";

export interface CurvePoint {
  date: string;
  equity: number;
  /** That day's P&L (0 for the baseline point). */
  pnl: number;
  /** The first point is the period's opening baseline, not a trading day. */
  kind: "start" | "day";
}

export type CurveTone = "profit" | "loss" | "neutral";

const PAD = { top: 40, right: 56, bottom: 30, left: 2 };
const TONE_VAR: Record<CurveTone, string> = {
  profit: "var(--profit)",
  loss: "var(--loss)",
  neutral: "var(--muted)",
};

/* --------------------------------- math --------------------------------- */

/** Fritsch–Carlson monotone cubic: smooth, but never overshoots a data point. */
function monotonePath(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => Math.round(v * 100) / 100;
  let d = `M${f(pts[0]![0])},${f(pts[0]![1])}`;
  if (n === 1) return d;
  if (n === 2) return `${d} L${f(pts[1]![0])},${f(pts[1]![1])}`;

  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx[i] = pts[i + 1]![0] - pts[i]![0];
    m[i] = (pts[i + 1]![1] - pts[i]![1]) / dx[i]!;
  }
  const t: number[] = new Array(n);
  t[0] = m[0]!;
  t[n - 1] = m[n - 2]!;
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2;
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i]! / m[i]!;
    const b = t[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i]!;
      t[i + 1] = k * b * m[i]!;
    }
  }
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i]! / 3;
    d += ` C${f(pts[i]![0] + h)},${f(pts[i]![1] + t[i]! * h)} ${f(pts[i + 1]![0] - h)},${f(pts[i + 1]![1] - t[i + 1]! * h)} ${f(pts[i + 1]![0])},${f(pts[i + 1]![1])}`;
  }
  return d;
}

function niceStep(raw: number): number {
  const pow = Math.pow(10, Math.floor(Math.log10(raw)));
  const frac = raw / pow;
  const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 2.5 ? 2.5 : frac <= 5 ? 5 : 10;
  return nice * pow;
}

function dayMonth(key: string, withYear: boolean): string {
  const d = parseDateKey(key);
  return withYear
    ? d.toLocaleDateString("en-GB", { month: "short", year: "numeric" })
    : d.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/* -------------------------------- component ------------------------------ */

export function EquityCurve({
  points,
  currency,
  tone,
  baselineLabel,
  emptyLabel,
  rangeKey,
  onScrub,
  className,
}: {
  points: CurvePoint[];
  currency: CurrencyCode;
  tone: CurveTone;
  /** Shown beside the baseline, e.g. "Starting equity". */
  baselineLabel: string;
  emptyLabel: string;
  /** Changes whenever the visible period changes, so the line redraws. */
  rangeKey: string;
  onScrub?: (index: number | null) => void;
  className?: string;
}) {
  const reduce = useReducedMotion();
  const clipId = `eq-clip-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const wrapRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const [active, setActive] = useState<number | null>(null);
  // Once the draw-in finishes the line becomes a plain stroke, so nothing
  // downstream depends on dash-array precision.
  const [drawn, setDrawn] = useState(false);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const read = () => setSize({ w: Math.round(el.clientWidth), h: Math.round(el.clientHeight) });
    read();
    const ro = new ResizeObserver(read);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const n = points.length;
  // Keep the callback in a ref so an inline handler in the parent never
  // re-triggers the effect below (which would clear the scrub on every render).
  const onScrubRef = useRef(onScrub);
  useEffect(() => {
    onScrubRef.current = onScrub;
  });
  const setScrub = useCallback((i: number | null) => {
    setActive(i);
    onScrubRef.current?.(i);
  }, []);

  // A new period invalidates any scrub position.
  useEffect(() => {
    setScrub(null);
    setDrawn(false);
  }, [rangeKey, setScrub]);

  const color = TONE_VAR[tone];
  const { w, h } = size;
  const plotW = Math.max(0, w - PAD.left - PAD.right);
  const plotH = Math.max(0, h - PAD.top - PAD.bottom);
  const ready = w > 0 && h > 0 && plotW > 40 && plotH > 40;
  const hasCurve = n >= 2;

  /* ---- scales ---- */
  let lo = 0;
  let hi = 1;
  if (n > 0) {
    lo = Math.min(...points.map((p) => p.equity));
    hi = Math.max(...points.map((p) => p.equity));
  }
  const span = hi - lo || Math.max(1, Math.abs(hi) * 0.02);
  const dLo = lo - span * 0.14;
  const dHi = hi + span * 0.14;
  const xAt = (i: number) => PAD.left + (n <= 1 ? 0 : (i / (n - 1)) * plotW);
  const yAt = (v: number) => PAD.top + (1 - (v - dLo) / (dHi - dLo)) * plotH;

  const baseline = n > 0 ? points[0]!.equity : 0;
  const yBase = yAt(baseline);

  // ≤3 quiet gridlines, skipping any that crowd the baseline label.
  const step = niceStep((dHi - dLo) / 3);
  const ticks: number[] = [];
  for (let v = Math.ceil(dLo / step) * step; v <= dHi; v += step) {
    if (Math.abs(yAt(v) - yBase) > 16 && yAt(v) > PAD.top + 6 && yAt(v) < h - PAD.bottom - 6) ticks.push(v);
  }

  const xy: [number, number][] = ready && hasCurve ? points.map((p, i) => [xAt(i), yAt(p.equity)]) : [];
  const line = monotonePath(xy);
  const bottom = PAD.top + plotH;
  const area = xy.length > 1 ? `${line} L${xAt(n - 1)},${bottom} L${xAt(0)},${bottom} Z` : "";

  let peakIdx = 0;
  points.forEach((p, i) => {
    if (p.equity > points[peakIdx]!.equity) peakIdx = i;
  });
  const showPeak = hasCurve && peakIdx > 0 && peakIdx < n - 1 && points[peakIdx]!.equity > baseline;

  // x labels: first, last and up to two between — never touching.
  const xLabelCount = plotW > 560 ? 4 : plotW > 300 ? 3 : 2;
  const xLabelIdx = hasCurve
    ? Array.from(new Set(Array.from({ length: xLabelCount }, (_, k) => Math.round((k / (xLabelCount - 1)) * (n - 1)))))
    : [];
  const longSpan = hasCurve && (parseDateKey(points[n - 1]!.date).getTime() - parseDateKey(points[0]!.date).getTime()) / 86_400_000 > 240;

  /* ---- interaction ---- */
  const indexFromClientX = (clientX: number) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect || n < 2) return null;
    const x = clientX - rect.left - PAD.left;
    return clamp(Math.round((x / plotW) * (n - 1)), 0, n - 1);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!hasCurve) return;
    const big = e.shiftKey ? 5 : 1;
    let next: number | null = null;
    if (e.key === "ArrowLeft") next = clamp((active ?? n - 1) - big, 0, n - 1);
    else if (e.key === "ArrowRight") next = clamp((active ?? n - 1) + big, 0, n - 1);
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = n - 1;
    else if (e.key === "Escape") {
      setScrub(null);
      return;
    } else return;
    e.preventDefault();
    setScrub(next);
  };

  const cur = active != null ? points[active] : null;
  const chipX = active != null ? clamp(xAt(active), PAD.left + 62, PAD.left + plotW - 62) : 0;
  // Soft, tone-tinted lift under the line — depth without a hard shadow.
  const lineShadow = `drop-shadow(0 5px 7px color-mix(in srgb, ${color} 24%, transparent))`;
  const lineProps = {
    d: line,
    fill: "none",
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const draw = reduce ? { duration: 0 } : { duration: 0.9, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <div
      ref={wrapRef}
      className={cn("relative h-[260px] w-full select-none rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-line-strong sm:h-[320px]", className)}
      style={{ touchAction: "pan-y" }}
      tabIndex={hasCurve ? 0 : -1}
      role={hasCurve ? "slider" : "img"}
      aria-label={hasCurve ? "Equity curve. Use the left and right arrow keys to move through trading days." : emptyLabel}
      aria-valuemin={hasCurve ? 0 : undefined}
      aria-valuemax={hasCurve ? n - 1 : undefined}
      aria-valuenow={hasCurve ? (active ?? n - 1) : undefined}
      aria-valuetext={
        hasCurve ? `${formatDateMedium(points[active ?? n - 1]!.date)}: ${formatMoney(points[active ?? n - 1]!.equity, currency)}` : undefined
      }
      onKeyDown={onKeyDown}
      onBlur={() => setScrub(null)}
      onPointerMove={(e) => {
        if (!hasCurve || (e.pointerType === "touch" && e.buttons === 0 && active == null)) return;
        setScrub(indexFromClientX(e.clientX));
      }}
      onPointerDown={(e) => {
        if (hasCurve && e.pointerType === "touch") setScrub(indexFromClientX(e.clientX));
      }}
      onPointerUp={(e) => {
        if (e.pointerType === "touch") setScrub(null);
      }}
      onPointerCancel={() => setScrub(null)}
      onPointerLeave={(e) => {
        if (e.pointerType !== "touch") setScrub(null);
      }}
    >
      {ready && (
        <svg width={w} height={h} className="absolute inset-0 overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={`eq-fill-${tone}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="55%" stopColor={color} stopOpacity={0.05} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>

          {/* quiet gridlines + right-hand labels */}
          {ticks.map((v) => (
            <g key={v}>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={yAt(v)} y2={yAt(v)} stroke="var(--line)" strokeOpacity={0.45} shapeRendering="crispEdges" />
              <text x={w - PAD.right + 12} y={yAt(v) + 3.5} fill="var(--faint)" fontSize={11} fontWeight={500} letterSpacing={0.1} fontFamily="var(--font-sans)" className="tabular">
                {formatMoney(v, currency, { compact: true, decimals: 0 })}
              </text>
            </g>
          ))}

          {/* baseline = where this period opened */}
          {n > 0 && (
            <g>
              <line x1={PAD.left} x2={PAD.left + plotW} y1={yBase} y2={yBase} stroke="var(--line-strong)" strokeOpacity={0.8} strokeDasharray="1 6" strokeLinecap="round" />
              <text x={w - PAD.right + 12} y={yBase + 3.5} fill="var(--muted)" fontSize={11} fontWeight={600} letterSpacing={0.1} fontFamily="var(--font-sans)" className="tabular">
                {formatMoney(baseline, currency, { compact: true, decimals: 0 })}
              </text>
            </g>
          )}

          {/* x labels */}
          {xLabelIdx.map((i, k) => (
            <text
              key={i}
              x={xAt(i)}
              y={h - 8}
              fill="var(--faint)"
              fontSize={11}
              fontWeight={500}
              letterSpacing={0.1}
              fontFamily="var(--font-sans)"
              textAnchor={k === 0 ? "start" : k === xLabelIdx.length - 1 ? "end" : "middle"}
            >
              {dayMonth(points[i]!.date, longSpan)}
            </text>
          ))}

          {hasCurve && (
            <g key={rangeKey}>
              <motion.path d={area} fill={`url(#eq-fill-${tone})`} initial={{ opacity: reduce ? 1 : 0 }} animate={{ opacity: 1 }} transition={{ duration: reduce ? 0 : 0.8, delay: reduce ? 0 : 0.25 }} />
              <g style={{ filter: lineShadow }}>
                {drawn ? (
                  <>
                    {/* the whole line softens while scrubbing; the part up to the dot stays full strength */}
                    <path {...lineProps} opacity={active != null ? 0.28 : 1} style={reduce ? undefined : { transition: "opacity 180ms ease-out" }} />
                    {active != null && (
                      <>
                        <clipPath id={clipId}>
                          <rect x={0} y={0} width={xAt(active)} height={h} />
                        </clipPath>
                        <path {...lineProps} clipPath={`url(#${clipId})`} />
                      </>
                    )}
                  </>
                ) : (
                  <motion.path
                    {...lineProps}
                    initial={{ pathLength: reduce ? 1 : 0 }}
                    animate={{ pathLength: 1 }}
                    transition={draw}
                    onAnimationComplete={() => setDrawn(true)}
                  />
                )}
              </g>
            </g>
          )}

          {/* peak — only worth a mark when we're below it */}
          {showPeak && (
            <g opacity={active != null ? 0.3 : 1} style={{ transition: "opacity .2s" }}>
              <circle cx={xAt(peakIdx)} cy={yAt(points[peakIdx]!.equity)} r={3} fill="var(--surface)" stroke={color} strokeWidth={1.5} />
              <text
                x={clamp(xAt(peakIdx), PAD.left + 40, PAD.left + plotW - 40)}
                y={yAt(points[peakIdx]!.equity) - 10}
                textAnchor="middle"
                fill="var(--faint)"
                fontSize={11}
                fontWeight={500}
                letterSpacing={0.1}
                fontFamily="var(--font-sans)"
              >
                Peak {formatMoney(points[peakIdx]!.equity, currency, { compact: true, decimals: 0 })}
              </text>
            </g>
          )}

          {/* "now" */}
          {hasCurve && active == null && (
            <g>
              <circle cx={xAt(n - 1)} cy={yAt(points[n - 1]!.equity)} r={8} fill={color} className="animate-pulse-soft" opacity={0.14} />
              <circle cx={xAt(n - 1)} cy={yAt(points[n - 1]!.equity)} r={3.5} fill={color} />
            </g>
          )}

          {/* scrub */}
          {cur && active != null && (
            <motion.g
              pointerEvents="none"
              initial={false}
              animate={{ x: xAt(active), y: yAt(cur.equity) }}
              transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 42, mass: 0.6 }}
            >
              <circle r={11} fill={color} opacity={0.12} />
              <circle r={5} fill="var(--surface)" stroke={color} strokeWidth={2.25} />
            </motion.g>
          )}
        </svg>
      )}

      {/* floating scrub chip — the only material on the chart */}
      {cur && active != null && (
        <div
          className="pointer-events-none absolute top-0 z-10 -translate-x-1/2 transition-[left] duration-100 ease-out"
          style={{ left: chipX }}
        >
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.16, ease: [0.16, 1, 0.3, 1] }}
            className={cn("whitespace-nowrap rounded-full px-3 py-1 text-[12px] font-medium text-ink", glass.control)}
          >
            {cur.kind === "start" ? baselineLabel : formatDateMedium(cur.date)}
            {cur.kind === "day" && (
              <span className={cn("num ml-2 text-[12px]", cur.pnl > 0 ? "text-profit" : cur.pnl < 0 ? "text-loss" : "text-muted")}>
                {formatSignedMoney(cur.pnl, currency)}
              </span>
            )}
          </motion.div>
        </div>
      )}

      {/* nothing to draw yet */}
      {ready && !hasCurve && (
        <div className="absolute inset-0 grid place-items-center">
          <p className="max-w-[260px] text-center text-[13px] leading-snug text-faint">{emptyLabel}</p>
        </div>
      )}
    </div>
  );
}

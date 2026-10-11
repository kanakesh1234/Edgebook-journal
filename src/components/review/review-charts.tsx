"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { EASE } from "@/components/journal/journal-ui";
import { formatDateMedium } from "@/lib/format";
import type { CurvePointR, DrawdownMark, DayRow, Streak } from "@/lib/review/metrics";
import { cn } from "@/lib/utils";
import { AnimatedNumber, useMoney } from "./review-ui";

/* ─────────────────────────────────────────────────────────────
   Geometry
───────────────────────────────────────────────────────────── */

/** Monotone cubic through the points: smooth, but never overshoots a real value (so no phantom peaks). */
function smooth(pts: [number, number][]): string {
  const n = pts.length;
  if (n === 0) return "";
  const f = (v: number) => v.toFixed(1);
  if (n === 1) return `M${f(pts[0][0])} ${f(pts[0][1])}`;
  if (n === 2) return `M${f(pts[0][0])} ${f(pts[0][1])} L${f(pts[1][0])} ${f(pts[1][1])}`;
  const dx: number[] = [], m: number[] = [];
  for (let i = 0; i < n - 1; i++) { dx.push(pts[i + 1][0] - pts[i][0]); m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1)); }
  const t: number[] = new Array(n);
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) {
    if (m[i - 1] * m[i] <= 0) t[i] = 0;
    else { const w1 = 2 * dx[i] + dx[i - 1], w2 = dx[i] + 2 * dx[i - 1]; t[i] = (w1 + w2) / (w1 / m[i - 1] + w2 / m[i]); }
  }
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C${f(pts[i][0] + h)} ${f(pts[i][1] + t[i] * h)} ${f(pts[i + 1][0] - h)} ${f(pts[i + 1][1] - t[i + 1] * h)} ${f(pts[i + 1][0])} ${f(pts[i + 1][1])}`;
  }
  return d;
}

const PAD = { t: 26, r: 16, b: 30, l: 56 };

/**
 * Cumulative P&L after each session. One smooth line; green bands mark the best winning streaks, numbered red
 * markers the deepest drawdown troughs. Scrub with mouse/touch or ← → keys; the chip names the session.
 * `activeDrawdown` / `activeStreak` (indexes) emphasise a marker when its row in the list beside the chart is hovered.
 */
export function SessionCurve({ curve, drawdowns, streaks, height = 280, activeDrawdown = null, activeStreak = null }: {
  curve: CurvePointR[]; drawdowns: DrawdownMark[]; streaks: Streak[]; height?: number; activeDrawdown?: number | null; activeStreak?: number | null;
}) {
  const { signed } = useMoney();
  const reduce = useReducedMotion();
  const box = useRef<HTMLDivElement>(null);
  const [w, setW] = useState(640);
  const [sel, setSel] = useState<number | null>(null);
  const gid = useId().replace(/:/g, "");
  useEffect(() => { const el = box.current; if (!el) return; const ro = new ResizeObserver(([e]) => setW(Math.max(280, e.contentRect.width))); ro.observe(el); return () => ro.disconnect(); }, []);
  if (curve.length === 0) return <div className="grid place-items-center rounded-[16px] bg-ink/[0.035] text-[14px] text-muted" style={{ height }}>The curve draws itself after your first session.</div>;

  const vals = [0, ...curve.map((p) => p.cum)];
  const lo = Math.min(...vals), hi = Math.max(...vals), span = hi - lo || 1;
  const yMin = lo - span * 0.14, yMax = hi + span * 0.14;
  const iw = w - PAD.l - PAD.r, ih = height - PAD.t - PAD.b;
  const n = curve.length;
  const x = (i: number) => PAD.l + (n === 1 ? iw / 2 : (i / (n - 1)) * iw);
  const y = (v: number) => PAD.t + (1 - (v - yMin) / (yMax - yMin)) * ih;
  const step = n === 1 ? iw : iw / (n - 1);
  const pts = curve.map((p, i) => [x(i), y(p.cum)] as [number, number]);
  const line = smooth(pts);
  const area = `${line} L${x(n - 1).toFixed(1)} ${y(0).toFixed(1)} L${x(0).toFixed(1)} ${y(0).toFixed(1)} Z`;
  const up = curve[n - 1].cum >= 0;
  const color = up ? "var(--profit)" : "var(--loss)";
  const ticks = [yMin + (yMax - yMin) * 0.12, 0, yMax - (yMax - yMin) * 0.12].filter((t, i, a) => a.findIndex((u) => Math.abs(u - t) < span * 0.14) === i);

  const at = (clientX: number) => { const r = box.current!.getBoundingClientRect(); const px = clientX - r.left; return Math.max(0, Math.min(n - 1, Math.round(((px - PAD.l) / (iw || 1)) * (n - 1)))); };
  const p = sel != null ? curve[sel] : null;
  const chipLeft = p ? Math.min(Math.max(x(sel!), 92), w - 92) : 0;

  return (
    <div ref={box} className="relative select-none" style={{ height }}>
      <svg
        width={w} height={height} role="img" tabIndex={0} aria-label={`Equity curve over ${n} sessions, ending ${signed(curve[n - 1].cum)}`}
        onPointerMove={(e) => setSel(at(e.clientX))} onPointerLeave={() => setSel(null)} onPointerDown={(e) => setSel(at(e.clientX))}
        onKeyDown={(e) => { if (e.key === "ArrowRight") { e.preventDefault(); setSel((s) => Math.min(n - 1, (s ?? -1) + 1)); } else if (e.key === "ArrowLeft") { e.preventDefault(); setSel((s) => Math.max(0, (s ?? n) - 1)); } else if (e.key === "Escape") setSel(null); }}
        onBlur={() => setSel(null)} className="touch-pan-y rounded-[12px] outline-none focus-visible:ring-2 focus-visible:ring-gold-strong/50"
      >
        <defs>
          <linearGradient id={`g${gid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.2" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient>
          <clipPath id={`c${gid}`}><motion.rect x={0} y={0} height={height} initial={reduce ? false : { width: PAD.l }} animate={{ width: w }} transition={{ duration: 1.1, ease: EASE, delay: 0.1 }} /></clipPath>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD.l} x2={w - PAD.r} y1={y(t)} y2={y(t)} stroke="var(--line)" strokeWidth={t === 0 ? 1 : 0.6} strokeDasharray={t === 0 ? "3 5" : undefined} strokeLinecap="round" />
            <text x={PAD.l - 10} y={y(t) + 4} textAnchor="end" className="num fill-faint text-[11px] font-normal">{signed(Math.round(t))}</text>
          </g>
        ))}
        {streaks.map((s, i) => (
          <motion.rect key={i} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: activeStreak === i ? 0.2 : 0.09 }} transition={{ delay: activeStreak == null ? 0.7 + i * 0.08 : 0, duration: 0.25 }} x={x(s.from) - step / 2} width={(s.to - s.from + 1) * step} y={PAD.t - 6} height={ih + 12} rx={10} fill="var(--profit)" />
        ))}
        <g clipPath={`url(#c${gid})`}>
          <path d={area} fill={`url(#g${gid})`} />
          <path d={line} fill="none" stroke={color} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
        </g>
        {n <= 40 && curve.map((c, i) => <motion.circle key={i} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 + (i / n) * 0.6 }} cx={x(i)} cy={y(c.cum)} r={sel === i ? 0 : 2.4} fill="var(--surface)" stroke={color} strokeWidth={1.6} />)}
        {drawdowns.map((d, i) => {
          const idx = curve.findIndex((c) => c.date === d.date); if (idx < 0) return null;
          const on = activeDrawdown === i;
          return (
            <g key={d.date}>
              <motion.circle cx={x(idx)} cy={y(curve[idx].cum)} fill="var(--loss)" initial={false} animate={{ r: on ? 15 : 9, opacity: on ? 0.26 : 0.15 }} transition={{ type: "spring", stiffness: 420, damping: 24 }} />
              <circle cx={x(idx)} cy={y(curve[idx].cum)} r={3.4} fill="var(--loss)" />
              <text x={x(idx)} y={y(curve[idx].cum) + 22} textAnchor="middle" className="fill-loss text-[10.5px] font-semibold">{i + 1}</text>
            </g>
          );
        })}
        {[0, Math.floor((n - 1) / 2), n - 1].filter((v, i, a) => a.indexOf(v) === i).map((i) => <text key={i} x={x(i)} y={height - 9} textAnchor={i === 0 && n > 1 ? "start" : i === n - 1 && n > 1 ? "end" : "middle"} className="num fill-faint text-[11px] font-normal">#{curve[i].session}</text>)}
        {sel != null && (
          <g pointerEvents="none">
            <line x1={x(sel)} x2={x(sel)} y1={PAD.t - 6} y2={PAD.t + ih + 6} stroke="var(--line-strong)" strokeWidth={1} />
            <circle cx={x(sel)} cy={y(curve[sel].cum)} r={9} fill={color} opacity={0.18} />
            <circle cx={x(sel)} cy={y(curve[sel].cum)} r={4.5} fill={color} stroke="var(--surface)" strokeWidth={2} />
          </g>
        )}
      </svg>
      {p && (
        <div className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-[12px] bg-surface/85 px-3 py-2 text-center shadow-[0_10px_30px_-10px_rgb(0_0_0/0.35),0_0_0_0.5px_rgb(0_0_0/0.1)] backdrop-blur-xl" style={{ left: chipLeft }}>
          <p className="text-[11.5px] text-muted">Session {p.session} · {formatDateMedium(p.date)}</p>
          <p className="num text-[13.5px] font-semibold leading-tight text-ink">{signed(p.cum)} <span className={cn("ml-1 font-medium", p.pnl >= 0 ? "text-profit" : "text-loss")}>{signed(p.pnl)}</span></p>
        </div>
      )}
    </div>
  );
}

/** A quiet trend line for hero figures. No axes — it shows shape, the curve section shows detail. */
export function Sparkline({ values, height = 72, className }: { values: number[]; height?: number; className?: string }) {
  const reduce = useReducedMotion();
  const gid = useId().replace(/:/g, "");
  if (values.length < 2) return null;
  const all = [0, ...values];
  const lo = Math.min(...all), hi = Math.max(...all), span = hi - lo || 1;
  const W = 100;
  const X = (i: number) => (i / (values.length - 1)) * W;
  const Y = (v: number) => 4 + (1 - (v - lo) / span) * (height - 8);
  const pts = values.map((v, i) => [X(i), Y(v)] as [number, number]);
  const line = smooth(pts);
  const up = values[values.length - 1] >= 0;
  const color = up ? "var(--profit)" : "var(--loss)";
  return (
    <svg viewBox={`0 0 ${W} ${height}`} preserveAspectRatio="none" aria-hidden className={cn("block w-full overflow-visible", className)} style={{ height }}>
      <defs><linearGradient id={`s${gid}`} x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stopColor={color} stopOpacity="0.18" /><stop offset="100%" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      {lo < 0 && hi > 0 && <line x1={0} x2={W} y1={Y(0)} y2={Y(0)} stroke="var(--line-strong)" strokeWidth={1} strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />}
      <motion.path d={`${line} L${W} ${height} L0 ${height} Z`} fill={`url(#s${gid})`} initial={reduce ? false : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, delay: 0.5 }} />
      <motion.path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 1.1, ease: EASE, delay: 0.15 }} />
    </svg>
  );
}

/** Mon–Fri P&L as soft capsules around a zero line. Non-trading days stay visibly empty; hovering one quiets the rest. */
export function DayBars({ days }: { days: DayRow[] }) {
  const { signed } = useMoney();
  const reduce = useReducedMotion();
  const [hot, setHot] = useState<number | null>(null);
  const trading = days.slice(0, 5);
  const max = Math.max(1, ...trading.map((d) => Math.abs(d.pnl)));
  const H = 64;
  return (
    <div className="grid grid-cols-5 gap-2 sm:gap-4" role="img" aria-label="Net P&L by trading day" onPointerLeave={() => setHot(null)}>
      {trading.map((d, i) => {
        const traded = d.state === "traded";
        const h = traded ? Math.max(6, (Math.abs(d.pnl) / max) * H) : 0;
        return (
          <div key={d.date} onPointerEnter={() => setHot(i)} className={cn("flex flex-col items-center transition-opacity duration-200", hot != null && hot !== i && "opacity-40")}>
            <div className="relative w-full" style={{ height: H * 2 + 2 }}>
              <span className="absolute inset-x-0 top-1/2 h-px bg-line" />
              {traded && (
                <motion.span initial={reduce ? false : { height: 0 }} animate={{ height: h }} transition={{ type: "spring", stiffness: 200, damping: 24, delay: 0.2 + i * 0.06 }}
                  className={cn("absolute left-1/2 w-[52%] max-w-9 -translate-x-1/2 rounded-full", d.pnl >= 0 ? "bottom-1/2 mb-px bg-profit" : "top-1/2 mt-px bg-loss")} />
              )}
              {d.state === "holiday" && <span className="absolute inset-0 grid place-items-center"><span className="rounded-full bg-ink/[0.05] px-2 py-0.5 text-[10.5px] font-medium text-faint">Holiday</span></span>}
            </div>
            <p className="mt-1 text-[12px] font-medium text-faint">{["Mon", "Tue", "Wed", "Thu", "Fri"][i]}</p>
            <p className={cn("num text-[12.5px] font-semibold", !traded ? "text-faint" : d.pnl >= 0 ? "text-profit" : "text-loss")}>{traded ? signed(d.pnl) : "·"}</p>
          </div>
        );
      })}
    </div>
  );
}

/** Win rate as a ring that fills on arrival. */
export function Ring({ value, size = 112, stroke = 9, children }: { value: number | null; size?: number; stroke?: number; children?: ReactNode }) {
  const reduce = useReducedMotion();
  const r = (size - stroke) / 2;
  const good = value != null && value >= 0.5;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={stroke} opacity={0.8} />
        {value != null && value > 0 && (
          <motion.circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={good ? "var(--profit)" : "var(--loss)"} strokeWidth={stroke} strokeLinecap="round" initial={reduce ? false : { pathLength: 0 }} animate={{ pathLength: value }} transition={{ duration: 1.1, ease: EASE, delay: 0.2 }} />
        )}
      </svg>
      <div className="absolute inset-0 grid place-items-center">{children}</div>
    </div>
  );
}

/** Won / break-even / lost as one proportional bar with a legend. */
export function OutcomeBar({ winners, losers, breakevens }: { winners: number; losers: number; breakevens?: number }) {
  const reduce = useReducedMotion();
  const be = breakevens ?? 0;
  const total = winners + losers + be;
  const segs = [
    { n: winners, cls: "bg-profit", dot: "bg-profit", label: "Won" },
    ...(breakevens != null ? [{ n: be, cls: "bg-faint/55", dot: "bg-faint/70", label: "Break-even" }] : []),
    { n: losers, cls: "bg-loss", dot: "bg-loss", label: "Lost" },
  ];
  return (
    <div>
      <div className="flex h-2 gap-[3px] overflow-hidden rounded-full bg-ink/[0.06]" role="img" aria-label={`${winners} won, ${be ? `${be} break-even, ` : ""}${losers} lost`}>
        {total > 0 && segs.filter((s) => s.n > 0).map((s, i) => (
          <motion.span key={s.label} initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.25 + i * 0.08 }} style={{ flex: `${s.n} 1 0%`, transformOrigin: "left" }} className={cn("h-full rounded-full", s.cls)} />
        ))}
      </div>
      <dl className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5">
        {segs.map((s) => (
          <div key={s.label} className="flex items-center gap-1.5 text-[13px]">
            <span className={cn("h-2 w-2 rounded-full", s.dot)} aria-hidden />
            <dd className="num font-semibold text-ink">{s.n}</dd>
            <dt className="text-muted">{s.label}</dt>
          </div>
        ))}
      </dl>
    </div>
  );
}

/** Two proportional bars on one scale — an average win against an average loss. */
export function PairBar({ a, b }: { a: { label: string; value: number; text: string }; b: { label: string; value: number; text: string } }) {
  const reduce = useReducedMotion();
  const max = Math.max(a.value, b.value, 1);
  const row = (r: typeof a, cls: string, i: number) => (
    <div className="grid grid-cols-[88px_1fr_auto] items-center gap-3">
      <span className="text-[13px] text-muted">{r.label}</span>
      <span className="h-2 overflow-hidden rounded-full bg-ink/[0.06]"><motion.span initial={reduce ? false : { scaleX: 0 }} animate={{ scaleX: 1 }} transition={{ duration: 0.8, ease: EASE, delay: 0.3 + i * 0.1 }} style={{ width: `${(r.value / max) * 100}%`, transformOrigin: "left" }} className={cn("block h-full rounded-full", cls)} /></span>
      <span className="num text-[13px] font-semibold text-ink">{r.text}</span>
    </div>
  );
  return <div className="space-y-2.5">{row(a, "bg-profit", 0)}{row(b, "bg-loss", 1)}</div>;
}

/** The win-rate ring with its figure inside — shared by both scorecards. */
export function WinRateRing({ value, size = 112 }: { value: number | null; size?: number }) {
  return (
    <Ring value={value} size={size}>
      <span className={cn("num text-[26px] font-semibold leading-none tracking-[-0.03em]", value == null ? "text-faint" : value >= 0.5 ? "text-profit" : "text-loss")}>
        {value == null ? "—" : <AnimatedNumber value={value} decimals={2} format={(n) => `${Math.round(n * 100)}%`} />}
      </span>
    </Ring>
  );
}

/** Heat colour for a win rate: loss → neutral → profit, never implying precision it doesn't have (n shown by the caller). */
export function heat(winRate: number | null, present: number): string {
  if (winRate == null || present === 0) return "bg-ink/[0.04] text-faint";
  const strong = present >= 3;
  if (winRate >= 0.67) return strong ? "bg-profit/25 text-profit" : "bg-profit/12 text-profit";
  if (winRate >= 0.5) return strong ? "bg-profit/12 text-profit" : "bg-profit/[0.07] text-profit";
  if (winRate >= 0.34) return strong ? "bg-loss/12 text-loss" : "bg-loss/[0.07] text-loss";
  return strong ? "bg-loss/25 text-loss" : "bg-loss/12 text-loss";
}

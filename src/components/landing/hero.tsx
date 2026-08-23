"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from "motion/react";
import { ArrowRightIcon, CheckIcon, RouteIcon, TargetIcon, TrendingUpIcon } from "@/components/ui/icons";
import { EASE } from "./reveal";

/* --------------------------- decorative data --------------------------- */

const CANDLES = [
  { x: 30, o: 210, c: 178, h: 200, l: 168 },
  { x: 74, o: 180, c: 196, h: 204, l: 172 },
  { x: 118, o: 194, c: 158, h: 200, l: 150 },
  { x: 162, o: 160, c: 176, h: 184, l: 152 },
  { x: 206, o: 174, c: 138, h: 178, d: true, l: 132 },
  { x: 250, o: 140, c: 118, h: 148, l: 110 },
  { x: 294, o: 118, c: 134, h: 142, l: 112 },
  { x: 338, o: 132, c: 96, h: 136, l: 90 },
  { x: 382, o: 98, c: 112, h: 118, l: 92 },
  { x: 426, o: 110, c: 74, h: 114, l: 68 },
];

const EQUITY_PATH =
  "M8 262 C60 256 84 224 122 229 C162 234 184 186 232 190 C272 194 292 216 330 198 C372 178 382 128 430 130 C468 132 486 96 552 66";

/* --------------------------------- view --------------------------------- */

export function Hero() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);

  // Pointer parallax (desktop only, enabled after mount to avoid hydration drift)
  const [parallaxOn, setParallaxOn] = useState(false);
  useEffect(() => {
    if (!reduce && window.matchMedia("(hover: hover)").matches) setParallaxOn(true);
  }, [reduce]);
  const enableParallax = parallaxOn;

  // Pointer parallax (desktop only)
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 60, damping: 18 });
  const sy = useSpring(my, { stiffness: 60, damping: 18 });
  const rotX = useTransform(sy, [-1, 1], [5, -5]);
  const rotY = useTransform(sx, [-1, 1], [-6, 6]);
  const chipShiftX = useTransform(sx, [-1, 1], [12, -12]);
  const chipShiftY = useTransform(sy, [-1, 1], [9, -9]);

  const onMouseMove = (e: React.MouseEvent) => {
    if (!enableParallax || !sectionRef.current) return;
    const r = sectionRef.current.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    my.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={onMouseMove}
      className="relative overflow-hidden pb-10 pt-32 sm:pt-40"
      aria-label="Edgebook introduction"
    >
      {/* Backdrop layers */}
      <div className="grid-backdrop absolute inset-0 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_35%,black_35%,transparent_78%)]" aria-hidden />
      <motion.div
        aria-hidden
        className="absolute -top-40 right-[-10%] h-[480px] w-[480px] rounded-full bg-gold/[0.07] blur-[130px]"
        animate={reduce ? undefined : { opacity: [0.7, 1, 0.7] }}
        transition={{ duration: 9, repeat: Infinity }}
      />
      <motion.div
        aria-hidden
        className="absolute bottom-[-30%] left-[-12%] h-[520px] w-[520px] rounded-full bg-profit/[0.06] blur-[140px]"
        animate={reduce ? undefined : { opacity: [1, 0.6, 1] }}
        transition={{ duration: 11, repeat: Infinity }}
      />

      {/* Candlestick field */}
      <svg
        aria-hidden
        viewBox="0 0 470 280"
        className="pointer-events-none absolute right-[-4%] top-[16%] hidden w-[46%] max-w-[640px] opacity-[0.34] lg:block xl:right-[2%]"
        preserveAspectRatio="xMidYMid meet"
      >
        {CANDLES.map((c, i) => {
          const up = !c.d;
          const color = up ? "var(--color-profit)" : "var(--color-loss)";
          const top = Math.min(c.o, c.c);
          const bh = Math.max(10, Math.abs(c.o - c.c));
          return (
            <motion.g
              key={i}
              initial={{ opacity: 0, scaleY: 0 }}
              animate={{ opacity: 1, scaleY: 1 }}
              transition={{ delay: 0.5 + i * 0.09, duration: 0.6, ease: EASE }}
              style={{ transformOrigin: `${c.x}px ${top + bh / 2}px` }}
            >
              <line x1={c.x} y1={c.l} x2={c.x} y2={c.h} stroke={color} strokeWidth="1.6" strokeLinecap="round" />
              <rect x={c.x - 7} y={top} width="14" height={bh} rx="2.5" fill={color} opacity={up ? 0.75 : 0.65} />
            </motion.g>
          );
        })}
      </svg>

      <div className="relative mx-auto grid max-w-6xl items-center gap-16 px-5 sm:px-8 lg:grid-cols-[1.02fr_0.98fr]">
        {/* ------------------------------ Copy ------------------------------ */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised/80 py-1.5 pl-2 pr-3.5 text-xs font-medium text-muted backdrop-blur"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
            </span>
            Local-first trading journal
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.08, ease: EASE }}
            className="mt-6 font-display text-[44px] font-bold leading-[1.04] tracking-[-0.03em] text-ink sm:text-6xl xl:text-[72px]"
          >
            Your trading edge,
            <br />
            <span className="font-serif font-normal italic tracking-normal text-gold-grad">measured daily.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.18, ease: EASE }}
            className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-lg"
          >
            Edgebook turns every session into evidence — journal entries with annotated screenshots,
            performance analytics that expose your patterns, and an animated roadmap from today&apos;s equity
            to your next milestone.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.75, delay: 0.28, ease: EASE }}
            className="mt-9 flex flex-wrap items-center gap-3.5"
          >
            <Link
              href="/login?mode=signup"
              className="group inline-flex h-12 items-center gap-2 rounded-xl bg-ink px-6 text-[15px] font-semibold text-canvas shadow-sm transition-all duration-200 hover:opacity-85 active:scale-[0.97]"
            >
              Start your journal
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#method"
              className="inline-flex h-12 items-center rounded-xl border border-line-strong px-6 text-[15px] font-medium text-ink transition-colors duration-200 hover:border-faint hover:bg-ink/[0.04] active:scale-[0.97]"
            >
              See how it works
            </a>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.8, delay: 0.45 }}
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-faint"
          >
            {["Free forever", "Private by design", "Export anytime"].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon className="h-3.5 w-3.5 text-profit" />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* ---------------------------- App mock ---------------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.9, delay: 0.25, ease: EASE }}
          className="relative mx-auto w-full max-w-[560px] [perspective:1400px]"
        >
          <motion.div
            style={enableParallax ? { rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" } : undefined}
            className="panel relative overflow-hidden p-5 shadow-[0_50px_120px_-40px_rgba(0,0,0,0.85)] sm:p-6"
          >
            {/* Mock header */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-faint">Equity curve</p>
                <p className="mt-1 font-mono text-xl font-semibold tabular text-ink">
                  $14,820{" "}
                  <span className="text-sm font-semibold text-profit">+48.2%</span>
                </p>
              </div>
              <span className="rounded-lg border border-profit/25 bg-profit/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-profit">
                LIVE
              </span>
            </div>

            {/* Chart */}
            <div className="relative mt-5">
              <svg viewBox="0 0 560 300" className="w-full" role="img" aria-label="Animated equity curve rising toward a target line">
                <defs>
                  <linearGradient id="hero-area" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-profit)" stopOpacity="0.28" />
                    <stop offset="100%" stopColor="var(--color-profit)" stopOpacity="0" />
                  </linearGradient>
                  <linearGradient id="hero-line" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="var(--color-profit)" />
                    <stop offset="100%" stopColor="var(--color-gold)" />
                  </linearGradient>
                </defs>

                {[70, 140, 210].map((y) => (
                  <line key={y} x1="0" y1={y} x2="560" y2={y} stroke="var(--color-line)" strokeWidth="1" />
                ))}

                {/* Target */}
                <motion.g
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.6, duration: 0.6 }}
                >
                  <line x1="0" y1="52" x2="560" y2="52" stroke="var(--color-gold)" strokeWidth="1.2" strokeDasharray="5 7" opacity="0.7" />
                  <text x="8" y="44" fontSize="11" fill="var(--color-gold)" fontFamily="var(--font-mono)" letterSpacing="2">
                    TARGET $20,000
                  </text>
                </motion.g>

                {/* Start */}
                <line x1="0" y1="266" x2="560" y2="266" stroke="var(--color-line-strong)" strokeWidth="1" strokeDasharray="3 6" />

                {/* Area + line */}
                <motion.path
                  d={`${EQUITY_PATH} L552 300 L8 300 Z`}
                  fill="url(#hero-area)"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.15, duration: 0.9 }}
                />
                <motion.path
                  d={EQUITY_PATH}
                  fill="none"
                  stroke="url(#hero-line)"
                  strokeWidth="2.6"
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ delay: 0.55, duration: 1.7, ease: "easeInOut" }}
                />
                <motion.circle
                  cx="552"
                  cy="66"
                  r="5"
                  fill="var(--color-gold)"
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 2.2, type: "spring", stiffness: 300, damping: 14 }}
                />
              </svg>
            </div>

            {/* Mock footer stats */}
            <div className="mt-5 grid grid-cols-3 gap-3">
              {[
                { label: "Win rate", value: "61%", tone: "text-ink" },
                { label: "Avg R:R", value: "+1.8R", tone: "text-profit" },
                { label: "Drawdown", value: "−$310", tone: "text-loss" },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.3 + i * 0.12, duration: 0.5, ease: EASE }}
                  className="rounded-xl border border-line bg-raised/70 px-3 py-2.5"
                >
                  <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-faint">{s.label}</p>
                  <p className={`mt-0.5 font-mono text-sm font-semibold tabular ${s.tone}`}>{s.value}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Floating chips */}
          <motion.div style={chipShiftX && enableParallax ? { x: chipShiftX, y: chipShiftY } : undefined}>
            <motion.div
              initial={{ opacity: 0, y: 20, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: -3 }}
              transition={{ delay: 0.9, duration: 0.6, ease: EASE }}
              className={`absolute -right-3 -top-6 sm:-right-8 ${reduce ? "" : "animate-float"}`}
            >
              <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-overlay/95 px-3 py-2 shadow-xl backdrop-blur">
                <TrendingUpIcon className="h-4 w-4 text-profit" />
                <span className="font-mono text-xs font-semibold tabular text-ink">+$420</span>
                <span className="text-[11px] text-faint">NQ long</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20, rotate: 4 }}
              animate={{ opacity: 1, y: 0, rotate: 2 }}
              transition={{ delay: 1.05, duration: 0.6, ease: EASE }}
              className={`absolute -left-3 -bottom-6 sm:-left-9 ${reduce ? "" : "animate-float"}`}
              style={{ animationDelay: "-4s" }}
            >
              <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-overlay/95 px-3 py-2 shadow-xl backdrop-blur">
                <RouteIcon className="h-4 w-4 text-info" />
                <span className="font-mono text-xs font-semibold tabular text-ink">48%</span>
                <span className="text-[11px] text-faint">of journey</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.2, duration: 0.5, ease: EASE }}
              className={`absolute -bottom-5 right-6 ${reduce ? "" : "animate-float"}`}
              style={{ animationDelay: "-7s" }}
            >
              <div className="flex items-center gap-2 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/[0.13] to-transparent px-3 py-2 shadow-xl backdrop-blur">
                <TargetIcon className="h-4 w-4 text-gold" />
                <span className="text-[11px] font-semibold text-gold">$5,180 to target</span>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

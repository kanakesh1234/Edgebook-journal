"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
} from "motion/react";
import { ArrowRightIcon, CheckIcon, RouteIcon, TargetIcon, TrendingUpIcon } from "@/components/ui/icons";
import { EASE } from "./reveal";
import { cn } from "@/lib/utils";

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
  "M8 232 C60 226 84 196 122 201 C162 206 184 162 232 166 C272 170 292 188 330 172 C372 154 382 108 430 110 C468 112 486 78 552 48";

type ShowcaseTab = "equity" | "replay" | "brain" | "practice";

const SHOWCASE_TABS: { id: ShowcaseTab; label: string; badge: string }[] = [
  { id: "equity", label: "Equity & Calendar", badge: "Live Scrub" },
  { id: "replay", label: "16:9 Replay", badge: "60fps" },
  { id: "brain", label: "Plan & AI Brain", badge: "Drive" },
  { id: "practice", label: "5 Arenas & Lab", badge: "Box 0–5" },
];

/* --------------------------------- view --------------------------------- */

export function Hero() {
  const reduce = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  const [activeTab, setActiveTab] = useState<ShowcaseTab>("equity");

  const [parallaxOn, setParallaxOn] = useState(false);
  useEffect(() => {
    if (!reduce && window.matchMedia("(hover: hover)").matches) setParallaxOn(true);
  }, [reduce]);
  const enableParallax = parallaxOn;

  // Pointer 3D tilt
  const mx = useMotionValue(0);
  const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 65, damping: 20 });
  const sy = useSpring(my, { stiffness: 65, damping: 20 });
  const rotX = useTransform(sy, [-1, 1], [6, -6]);
  const rotY = useTransform(sx, [-1, 1], [-7, 7]);
  const chipShiftX = useTransform(sx, [-1, 1], [12, -12]);
  const chipShiftY = useTransform(sy, [-1, 1], [10, -10]);

  // Scroll-linked 3D perspective lift
  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start start", "end start"],
  });
  const scrollScale = useTransform(scrollYProgress, [0, 0.7], [1, 0.94]);
  const scrollY = useTransform(scrollYProgress, [0, 0.7], [0, 28]);

  const onMouseMove = (e: React.MouseEvent) => {
    if (!enableParallax || !sectionRef.current) return;
    const r = sectionRef.current.getBoundingClientRect();
    mx.set(((e.clientX - r.left) / r.width) * 2 - 1);
    my.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };

  const onMouseLeave = () => {
    mx.set(0);
    my.set(0);
  };

  return (
    <section
      ref={sectionRef}
      onMouseMove={onMouseMove}
      onMouseLeave={onMouseLeave}
      className="relative overflow-hidden pb-16 pt-32 sm:pt-40"
      aria-label="Edgebook introduction"
    >
      {/* Backdrop layers using authentic EdgeBook gold & profit ambient light */}
      <div className="grid-backdrop absolute inset-0 [mask-image:radial-gradient(ellipse_75%_65%_at_50%_35%,black_35%,transparent_78%)]" aria-hidden />
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-16 h-[420px] w-[860px] -translate-x-1/2 rounded-full bg-gold/[0.08] blur-[130px]"
      />

      <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-5 sm:px-8 lg:grid-cols-[1.02fr_0.98fr]">
        {/* ------------------------------ Editorial Copy ------------------------------ */}
        <div>
          <motion.div
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, ease: EASE }}
            className="inline-flex items-center gap-2.5 rounded-full border border-line-strong bg-raised/90 py-1.5 pl-2.5 pr-4 text-xs font-medium text-muted shadow-sm backdrop-blur-xl"
          >
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-profit opacity-50" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-profit" />
            </span>
            <span>Private Google Drive Ledger · 16:9 Replays · AI Brain</span>
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 26 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.1, ease: EASE }}
            className="mt-6 font-display text-[44px] font-bold leading-[1.03] tracking-[-0.035em] text-ink sm:text-6xl xl:text-[66px]"
          >
            Where disciplined traders{" "}
            <span className="font-serif font-normal italic tracking-normal text-gold-grad">
              compound their edge.
            </span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.2, ease: EASE }}
            className="mt-6 max-w-xl text-base leading-relaxed text-muted sm:text-[17.5px]"
          >
            Most journals are static spreadsheets you abandon in two weeks. Edgebook connects your{" "}
            <strong className="font-semibold text-ink">Plan → Thought → Setup → 16:9 Replay → Autopsy</strong> into a personal{" "}
            <strong className="font-semibold text-ink">AI Brain</strong> stored privately in your own Google Drive—catching mistakes before entry and turning every leak into spaced-repetition mastery.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8, delay: 0.3, ease: EASE }}
            className="mt-9 flex flex-wrap items-center gap-3.5"
          >
            <Link
              href="/login?mode=signup"
              className="group inline-flex h-12 items-center gap-2.5 rounded-xl bg-gold-strong px-7 text-[15px] font-semibold text-on-gold shadow-sm transition-all duration-200 hover:bg-gold-strong-hover active:scale-[0.97]"
            >
              Start your journal
              <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
            </Link>
            <a
              href="#showcase"
              className="inline-flex h-12 items-center rounded-xl border border-line-strong bg-surface/75 px-6 text-[15px] font-medium text-ink backdrop-blur transition-colors duration-200 hover:border-faint hover:bg-ink/[0.04] active:scale-[0.97]"
            >
              Explore 3D Product Tour
            </a>
          </motion.div>

          <motion.ul
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.85, delay: 0.44 }}
            className="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[13px] text-faint"
          >
            {[
              "100% Owned in Your Google Drive",
              "Pre-Trade Win-Odds & Guardrails",
              "3-Min Reviews & 5 Practice Arenas",
            ].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <CheckIcon className="h-3.5 w-3.5 text-profit" />
                {t}
              </li>
            ))}
          </motion.ul>
        </div>

        {/* ------------------- 3D Perspective Interactive Studio Stage ------------------- */}
        <motion.div
          initial={{ opacity: 0, y: 42, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.95, delay: 0.26, ease: EASE }}
          style={!reduce ? { scale: scrollScale, y: scrollY } : undefined}
          className="relative mx-auto w-full max-w-[590px] [perspective:1600px]"
        >
          <motion.div
            style={enableParallax ? { rotateX: rotX, rotateY: rotY, transformStyle: "preserve-3d" } : undefined}
            className="panel relative overflow-hidden rounded-[28px] border border-line-strong/85 p-5 shadow-[0_48px_110px_-36px_rgba(0,0,0,0.75)] backdrop-blur-2xl sm:p-6"
          >
            {/* Subtle warm gold top rim glow */}
            <div
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-28 opacity-80"
              style={{
                background: "radial-gradient(380px 120px at 50% 0%, rgba(203,167,107,0.14), transparent 75%)",
              }}
            />

            {/* Interactive Segmented Control */}
            <div className="relative flex flex-wrap items-center justify-between gap-2 border-b border-line-soft pb-4">
              <div role="tablist" aria-label="Edgebook workspace stage" className="flex flex-wrap gap-1 rounded-full bg-ink/[0.06] p-1">
                {SHOWCASE_TABS.map((t) => {
                  const on = activeTab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      role="tab"
                      aria-selected={on}
                      onClick={() => setActiveTab(t.id)}
                      className={cn(
                        "relative rounded-full px-3 py-1.5 text-[11.5px] font-semibold transition-colors",
                        on ? "text-ink" : "text-muted hover:text-ink",
                      )}
                    >
                      {on && (
                        <motion.span
                          layoutId="hero-showcase-pill"
                          transition={{ type: "spring", stiffness: 420, damping: 32 }}
                          className="absolute inset-0 rounded-full border border-line-soft bg-raised shadow-sm"
                        />
                      )}
                      <span className="relative">{t.label}</span>
                    </button>
                  );
                })}
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/12 px-2.5 py-1 font-mono text-[10.5px] font-semibold text-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                DRIVE LEDGER
              </span>
            </div>

            {/* Tab Stage Content */}
            <div className="relative mt-5 min-h-[310px]">
              <AnimatePresence mode="wait" initial={false}>
                {activeTab === "equity" && (
                  <motion.div
                    key="tab-equity"
                    initial={{ opacity: 0, y: 10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                    transition={{ duration: 0.32, ease: EASE }}
                  >
                    <div className="flex items-baseline justify-between">
                      <div>
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-faint">
                          Equity Curve &amp; Live-Scrubbing Calendar
                        </p>
                        <p className="kpi mt-1 text-[28px] leading-none text-ink">
                          $16,480<span className="text-[15px] font-medium text-faint">.00</span>{" "}
                          <span className="num ml-1.5 text-sm font-semibold text-profit">+$6,480 (+64.8%)</span>
                        </p>
                      </div>
                      <span className="font-mono text-xs text-muted">18W · 4L · 82% WR</span>
                    </div>

                    <div className="relative mt-4">
                      <svg viewBox="0 0 560 215" className="w-full" role="img" aria-label="Animated equity curve rising toward target">
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
                        {[45, 105, 165].map((y) => (
                          <line key={y} x1="0" y1={y} x2="560" y2={y} stroke="var(--color-line)" strokeWidth="1" />
                        ))}
                        <line x1="0" y1="32" x2="560" y2="32" stroke="var(--color-gold)" strokeWidth="1.2" strokeDasharray="5 7" opacity="0.75" />
                        <text x="8" y="24" fontSize="10" fill="var(--color-gold)" fontFamily="var(--font-mono)" letterSpacing="1.8">
                          TARGET $20,000 · PROP CUSHION +$4,980
                        </text>
                        <motion.path
                          d={`${EQUITY_PATH} L552 215 L8 215 Z`}
                          fill="url(#hero-area)"
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ duration: 0.65 }}
                        />
                        <motion.path
                          d={EQUITY_PATH}
                          fill="none"
                          stroke="url(#hero-line)"
                          strokeWidth="2.8"
                          strokeLinecap="round"
                          initial={{ pathLength: 0 }}
                          animate={{ pathLength: 1 }}
                          transition={{ duration: 1.25, ease: "easeInOut" }}
                        />
                        <circle cx="552" cy="48" r="5.5" fill="var(--color-gold)" />
                      </svg>
                    </div>

                    <div className="mt-3 grid grid-cols-4 gap-2">
                      {[
                        { label: "Win rate", value: "82%", tone: "text-profit" },
                        { label: "Avg R:R", value: "+2.4R", tone: "text-profit" },
                        { label: "Drawdown", value: "0.0%", tone: "text-ink" },
                        { label: "Reviewed", value: "100%", tone: "text-gold" },
                      ].map((s) => (
                        <div key={s.label} className="rounded-xl border border-line bg-raised/80 px-3 py-2">
                          <p className="text-[10px] font-medium uppercase tracking-[0.1em] text-faint">{s.label}</p>
                          <p className={`num mt-0.5 text-sm font-semibold ${s.tone}`}>{s.value}</p>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}

                {activeTab === "replay" && (
                  <motion.div
                    key="tab-replay"
                    initial={{ opacity: 0, y: 10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gold">
                          16:9 Cinema Trade Replay · Tap Anywhere to Pause
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-ink">
                          MNQ · Long · NY Open Liquidity Sweep (+3.2R)
                        </p>
                      </div>
                      <span className="rounded-full bg-profit/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-profit">
                        +$640
                      </span>
                    </div>

                    {/* 16:9 TradingView-Proportional Candlestick Stage */}
                    <div className="relative overflow-hidden rounded-2xl border border-line bg-canvas/90 p-3">
                      <svg viewBox="0 0 470 175" className="w-full" aria-label="16:9 Trade Replay Preview">
                        {[35, 85, 135].map((y) => (
                          <line key={y} x1="0" y1={y} x2="470" y2={y} stroke="var(--color-line)" strokeWidth="0.8" />
                        ))}
                        <line x1="180" y1="115" x2="450" y2="115" stroke="var(--color-gold)" strokeWidth="1" strokeDasharray="4 4" />
                        <line x1="180" y1="55" x2="450" y2="55" stroke="var(--color-profit)" strokeWidth="1" strokeDasharray="4 4" />
                        {CANDLES.map((c, i) => {
                          const up = !c.d;
                          const color = up ? "var(--color-profit)" : "var(--color-loss)";
                          const top = Math.min(c.o, c.c) * 0.65 - 10;
                          const bh = Math.max(8, Math.abs(c.o - c.c) * 0.65);
                          const h = c.h * 0.65 - 10;
                          const l = c.l * 0.65 - 10;
                          return (
                            <g key={i}>
                              <line x1={c.x} y1={l} x2={c.x} y2={h} stroke={color} strokeWidth="1.5" strokeLinecap="round" />
                              <rect x={c.x - 4.5} y={top} width="9" height={bh} rx="2" fill={color} opacity={0.88} />
                            </g>
                          );
                        })}
                      </svg>
                    </div>

                    {/* 2-Line AI Mistake Recognition Strip */}
                    <div className="rounded-xl border border-gold/30 bg-gold/[0.08] px-3.5 py-2.5 text-xs">
                      <p className="font-semibold text-ink">
                        <span className="mr-1.5 text-profit">[A+ Execution]</span>
                        Waited for 9:35 NY sweep + 5m displacement close before entering.
                      </p>
                      <p className="mt-0.5 text-muted">
                        2-Line Mistake Strip: 6/6 setup rules confirmed — zero FOMO or premature entry detected.
                      </p>
                    </div>
                  </motion.div>
                )}

                {activeTab === "brain" && (
                  <motion.div
                    key="tab-brain"
                    initial={{ opacity: 0, y: 10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="space-y-3"
                  >
                    <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/[0.11] via-surface to-profit/[0.06] p-4">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-gold-deep dark:text-gold">
                          EdgeBook AI Brain · High-Precision (92% Calibrated)
                        </span>
                        <span className="font-mono text-xs font-semibold text-profit">Win Odds 74%</span>
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink">
                        &ldquo;Calm state + NY Sweep setup has a 74% historical win rate (+$4,120 net).&rdquo;
                      </p>
                      <p className="mt-1 text-xs text-muted">
                        Auto-tagged Watch Trap: Wait for the 5m candle body close before clicking buy.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div className="rounded-xl border border-line bg-raised/80 p-3">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gold">
                          Plan → Thought → Setup
                        </p>
                        <p className="mt-1 text-xs font-medium text-ink">
                          Unhurried 700ms delayed question reveal + live Win-Odds &amp; 2-loss lockout gate.
                        </p>
                      </div>
                      <div className="rounded-xl border border-line bg-raised/80 p-3">
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-profit">
                          Autopsy &amp; MINATO Sensei
                        </p>
                        <p className="mt-1 text-xs font-medium text-ink">
                          Multi-voter AI tagging + 3-minute Weekly/Monthly smart-chip rituals.
                        </p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {activeTab === "practice" && (
                  <motion.div
                    key="tab-practice"
                    initial={{ opacity: 0, y: 10, scale: 0.985 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.985 }}
                    transition={{ duration: 0.32, ease: EASE }}
                    className="space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gold">
                          5 Solo-Leveling Arenas · Trading Lab · Friends
                        </p>
                        <p className="mt-0.5 text-sm font-semibold text-ink">
                          Mistake trades automatically convert into Box 0–5 drills
                        </p>
                      </div>
                      <span className="rounded-full bg-gold/15 px-2.5 py-0.5 font-mono text-xs font-semibold text-gold">
                        14d Streak
                      </span>
                    </div>

                    <div className="space-y-2.5 rounded-2xl border border-line bg-raised/80 p-3.5">
                      {[
                        { label: "Setup & ICT Criteria", pct: 88, color: "bg-gold-strong" },
                        { label: "Entry Timing & Patience", pct: 79, color: "bg-profit" },
                        { label: "Risk & Stop Sizing Math", pct: 92, color: "bg-info" },
                        { label: "Emotional Discipline", pct: 85, color: "bg-gold" },
                      ].map((bar) => (
                        <div key={bar.label}>
                          <div className="flex justify-between text-xs">
                            <span className="font-medium text-ink">{bar.label}</span>
                            <span className="font-mono font-semibold text-muted">{bar.pct}%</span>
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
                            <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${bar.pct}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>

          {/* 3D Floating Depth Chips */}
          <motion.div style={chipShiftX && enableParallax ? { x: chipShiftX, y: chipShiftY } : undefined}>
            <motion.div
              initial={{ opacity: 0, y: 20, rotate: -4 }}
              animate={{ opacity: 1, y: 0, rotate: -3 }}
              transition={{ delay: 0.85, duration: 0.65, ease: EASE }}
              className={`absolute -right-3 -top-6 sm:-right-8 ${reduce ? "" : "animate-float"}`}
            >
              <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-overlay/95 px-3.5 py-2 shadow-xl backdrop-blur">
                <TrendingUpIcon className="h-4 w-4 text-profit" />
                <span className="text-xs font-semibold tabular text-ink">+$640</span>
                <span className="text-[11px] text-faint">MNQ A+ Sweep</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, y: 20, rotate: 4 }}
              animate={{ opacity: 1, y: 0, rotate: 2 }}
              transition={{ delay: 1.0, duration: 0.65, ease: EASE }}
              className={`absolute -left-3 -bottom-6 sm:-left-9 ${reduce ? "" : "animate-float"}`}
              style={{ animationDelay: "-4s" }}
            >
              <div className="flex items-center gap-2 rounded-xl border border-line-strong bg-overlay/95 px-3.5 py-2 shadow-xl backdrop-blur">
                <RouteIcon className="h-4 w-4 text-gold" />
                <span className="text-xs font-semibold tabular text-ink">AI Brain</span>
                <span className="text-[11px] text-faint">Google Drive</span>
              </div>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 1.15, duration: 0.55, ease: EASE }}
              className={`absolute -bottom-5 right-6 ${reduce ? "" : "animate-float"}`}
              style={{ animationDelay: "-7s" }}
            >
              <div className="flex items-center gap-2 rounded-xl border border-gold/35 bg-gradient-to-br from-gold/[0.15] to-transparent px-3.5 py-2 shadow-xl backdrop-blur">
                <TargetIcon className="h-4 w-4 text-gold" />
                <span className="text-[11px] font-semibold text-gold">3-Min Weekly Ritual</span>
              </div>
            </motion.div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}

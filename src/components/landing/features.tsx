"use client";

import { useRef } from "react";
import { motion, useReducedMotion, useScroll, useSpring, useTransform } from "motion/react";
import {
  BookOpenIcon,
  CalendarIcon,
  ChartLineIcon,
  CheckIcon,
  ImageIcon,
  RouteIcon,
  ShieldIcon,
  TargetIcon,
} from "@/components/ui/icons";
import { Reveal, EASE } from "./reveal";

/* -------------------------------------------------------------------------- */
/*  3D Scroll-Pop Stage Card: Tilts & pops into focus as it enters viewport   */
/* -------------------------------------------------------------------------- */

interface StageSlide {
  badge: string;
  step: string;
  title: string;
  italicTitle: string;
  description: string;
  bullets: string[];
  visual: React.ReactNode;
}

function ScrollPopStageCard({ slide, index }: { slide: StageSlide; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();

  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 92%", "end 18%"],
  });

  const rawRotateX = useTransform(scrollYProgress, [0, 0.35, 0.7, 1], [18, 0, 0, -10]);
  const rawScale = useTransform(scrollYProgress, [0, 0.35, 0.75, 1], [0.9, 1, 1, 0.95]);
  const rawOpacity = useTransform(scrollYProgress, [0, 0.25, 0.8, 1], [0.25, 1, 1, 0.55]);
  const rawY = useTransform(scrollYProgress, [0, 0.35, 0.75, 1], [54, 0, 0, -24]);

  const rotateX = useSpring(rawRotateX, { stiffness: 120, damping: 24 });
  const scale = useSpring(rawScale, { stiffness: 120, damping: 24 });
  const y = useSpring(rawY, { stiffness: 120, damping: 24 });

  return (
    <div ref={ref} className="[perspective:1600px]">
      <motion.article
        style={
          reduce
            ? undefined
            : {
                rotateX,
                scale,
                opacity: rawOpacity,
                y,
                transformStyle: "preserve-3d",
              }
        }
        className="panel relative overflow-hidden rounded-[30px] border border-line-strong/85 p-6 shadow-[0_40px_100px_-36px_rgba(0,0,0,0.75)] sm:p-9"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              index % 2 === 0
                ? "radial-gradient(520px 240px at 15% 0%, rgba(203,167,107,0.11), transparent 70%)"
                : "radial-gradient(520px 240px at 85% 0%, rgba(116,176,140,0.10), transparent 70%)",
          }}
        />

        <div className="relative grid items-center gap-8 lg:grid-cols-[1.02fr_0.98fr]">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="rounded-full border border-gold/35 bg-gold/12 px-3 py-1 font-mono text-[11px] font-semibold text-gold">
                {slide.step}
              </span>
              <span className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-medium text-muted">
                {slide.badge}
              </span>
            </div>

            <h3 className="mt-4 font-display text-2xl font-bold leading-[1.12] tracking-[-0.025em] text-ink sm:text-[34px]">
              {slide.title}{" "}
              <span className="font-serif font-normal italic text-gold-grad">{slide.italicTitle}</span>
            </h3>

            <p className="mt-3.5 text-[15px] leading-relaxed text-muted">{slide.description}</p>

            <ul className="mt-5 space-y-2">
              {slide.bullets.map((b) => (
                <li key={b} className="flex items-start gap-2.5 text-[13.5px] text-ink/90">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* 3D Popped Visual Preview */}
          <motion.div
            whileHover={reduce ? undefined : { scale: 1.015, rotateY: -2, rotateX: 2 }}
            transition={{ type: "spring", stiffness: 260, damping: 22 }}
            className="rounded-[24px] border border-line-strong bg-surface/95 p-4 shadow-xl sm:p-5"
          >
            {slide.visual}
          </motion.div>
        </div>
      </motion.article>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Bento Card Shell                                                          */
/* -------------------------------------------------------------------------- */

function CardShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={`panel group relative overflow-hidden rounded-[26px] p-6 transition-shadow duration-300 hover:shadow-[0_28px_60px_-24px_rgba(0,0,0,0.65)] sm:p-7 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px 200px at 20% 0%, rgba(203,167,107,0.10), transparent 70%)",
        }}
      />
      {children}
    </motion.div>
  );
}

function IconTile({ children, accent = "text-gold" }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className={`mb-4 inline-grid h-11 w-11 place-items-center rounded-2xl border border-line-strong bg-raised shadow-inner ${accent}`}>
      {children}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main Features & 3D Scroll-Pop Showcase                                    */
/* -------------------------------------------------------------------------- */

export function Features() {
  const slides: StageSlide[] = [
    {
      step: "STAGE 01 · PRE-TRADE RITUAL",
      badge: "Plan → Thought → Setup",
      title: "Stop impulsive trades before",
      italicTitle: "you click buy.",
      description:
        "Edgebook slows down FOMO with a calm 700ms delayed progressive question flow. Write your thesis, map the draw on liquidity and invalidation, check your playbook rules, and see your live historical Win-Odds before risking a dollar.",
      bullets: [
        "AI Brain scans your thesis and emotion to pre-tag your likeliest mistake traps",
        "Automatic 2nd-trade pause and 3rd-trade lockout modal after losses",
        "Rule-by-rule historical PnL impact so you know which skipped rule costs you",
      ],
      visual: (
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b border-line-soft pb-2.5">
            <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">
              Pre-Trade Thought &amp; Win-Odds
            </span>
            <span className="rounded-full bg-profit/15 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-profit">
              74% Historical Win Rate
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-line bg-raised p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Draw on Liquidity</p>
              <p className="mt-1 text-xs font-semibold text-ink">London Low Sweep → PDH</p>
            </div>
            <div className="rounded-xl border border-line bg-raised p-3">
              <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-faint">Invalidation</p>
              <p className="mt-1 text-xs font-semibold text-ink">5m close below 18,420</p>
            </div>
          </div>
          <div className="rounded-xl border border-gold/30 bg-gold/[0.08] p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gold-deep dark:text-gold">AI Mistake Guardrail</span>
              <span className="font-mono text-[11px] text-muted">Clarity 94%</span>
            </div>
            <p className="mt-1 text-xs text-ink">
              Watching: <strong>Premature Entry</strong> — wait for 5m displacement body close.
            </p>
          </div>
        </div>
      ),
    },
    {
      step: "STAGE 02 · CINEMA REPLAYS & FEED",
      badge: "16:9 TradingView Proportions",
      title: "Relive every candle in a",
      italicTitle: "full-screen 16:9 feed.",
      description:
        "Scroll through your trade replays, video notes, and lessons like an Apple-crafted Reels feed. Click anywhere on the chart to play or pause 60fps candle interpolation, with a 2-line AI mistake summary right below every replay.",
      bullets: [
        "TradingView-proportioned candlesticks with entry, stop-loss, and target lines",
        "Instant 2-line mistake recognition strip beneath every replay card",
        "5-question post-trade Autopsy + multi-voter AI tagging & MINATO Sensei",
      ],
      visual: (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-semibold text-ink">NQ · Long · +2.8R (+$840)</span>
            <span className="rounded-full border border-line bg-raised px-2.5 py-0.5 font-mono text-[10.5px] text-muted">
              16:9 · 60fps
            </span>
          </div>
          <div className="overflow-hidden rounded-xl border border-line bg-canvas p-3">
            <svg viewBox="0 0 420 135" className="w-full" aria-label="16:9 Candlestick Replay">
              {[28, 68, 108].map((y) => (
                <line key={y} x1="0" y1={y} x2="420" y2={y} stroke="var(--color-line)" strokeWidth="0.8" />
              ))}
              <line x1="110" y1="92" x2="395" y2="92" stroke="var(--color-gold)" strokeWidth="1" strokeDasharray="4 4" />
              <line x1="110" y1="36" x2="395" y2="36" stroke="var(--color-profit)" strokeWidth="1" strokeDasharray="4 4" />
              {[
                { x: 35, top: 78, bh: 22, h: 70, l: 108, up: false },
                { x: 75, top: 84, bh: 18, h: 76, l: 112, up: false },
                { x: 115, top: 68, bh: 26, h: 60, l: 100, up: true },
                { x: 155, top: 56, bh: 20, h: 48, l: 84, up: true },
                { x: 195, top: 62, bh: 14, h: 55, l: 82, up: false },
                { x: 235, top: 44, bh: 24, h: 36, l: 74, up: true },
                { x: 275, top: 34, bh: 20, h: 26, l: 60, up: true },
                { x: 315, top: 24, bh: 22, h: 18, l: 52, up: true },
                { x: 355, top: 18, bh: 18, h: 12, l: 42, up: true },
              ].map((c, i) => {
                const col = c.up ? "var(--color-profit)" : "var(--color-loss)";
                return (
                  <g key={i}>
                    <line x1={c.x} y1={c.h} x2={c.x} y2={c.l} stroke={col} strokeWidth="1.5" />
                    <rect x={c.x - 4.5} y={c.top} width="9" height={c.bh} rx="2" fill={col} />
                  </g>
                );
              })}
            </svg>
          </div>
          <div className="rounded-xl border border-profit/25 bg-profit/[0.08] px-3 py-2 text-xs">
            <p className="font-semibold text-ink">
              <span className="text-profit">[Disciplined Hold]</span> Entered on 5m FVG retest after London sweep.
            </p>
            <p className="text-muted">Held to full 2.8R target without moving stop loss.</p>
          </div>
        </div>
      ),
    },
    {
      step: "STAGE 03 · 3-MIN REVIEWS & NEURAL PRACTICE",
      badge: "Anti-Procrastination + 5 Arenas",
      title: "Reviews you actually finish,",
      italicTitle: "drills that retire mistakes.",
      description:
        "No 20-question essay fatigue. Weekly and Monthly reviews give you an AI Executive Brief plus 3 progressive questions with one-tap smart chips from your data. Then step into 5 Solo-Leveling Practice Arenas where mistakes drill until Box 5 mastery.",
      bullets: [
        "3-Minute Weekly & Monthly rituals with one-tap AI smart chips & criteria heatmaps",
        "5 Practice Arenas: Time Machine, Trade Recall, ICT Lab, Risk Math Duel, Weekend Boss",
        "Trading Lab multi-timeframe backtesting + privacy-safe Friends process leaderboard",
      ],
      visual: (
        <div className="space-y-3">
          <div className="rounded-xl border border-line bg-raised p-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink">3-Min Weekly Ritual · Question 1 of 3</span>
              <span className="font-mono text-[11px] text-gold">Auto-Saved to Drive</span>
            </div>
            <p className="mt-1.5 text-xs text-muted">What worked best this week? (Tap a smart chip)</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-profit/15 px-2.5 py-1 text-[11px] font-medium text-profit">
                + Best day (Thu +$1,120)
              </span>
              <span className="rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-medium text-gold">
                + Top rule: Liquidity Sweep (84%)
              </span>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[
              { name: "Time Machine", sub: "Chart Replay" },
              { name: "Trade Recall", sub: "Box 0–5 Matrix" },
              { name: "Risk Math Duel", sub: "Position Sizing" },
            ].map((a) => (
              <div key={a.name} className="rounded-xl border border-line bg-raised p-2.5 text-center">
                <p className="text-xs font-semibold text-ink">{a.name}</p>
                <p className="mt-0.5 text-[10.5px] text-faint">{a.sub}</p>
              </div>
            ))}
          </div>
        </div>
      ),
    },
  ];

  return (
    <>
      {/* ---------------- 3D Scroll-Pop Product Tour ---------------- */}
      <section id="showcase" className="relative py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">
              Interactive 3D Product Tour
            </p>
            <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[44px]">
              Scroll through the operating system{" "}
              <span className="font-serif font-normal italic text-gold-grad">
                built for real market sessions.
              </span>
            </h2>
          </Reveal>

          <div className="mt-14 space-y-10">
            {slides.map((slide, idx) => (
              <ScrollPopStageCard key={slide.step} slide={slide} index={idx} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Complete Project Architecture Bento ---------------- */}
      <section id="features" className="relative py-20 sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">
              Complete Feature Record
            </p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[44px]">
              Everything serious traders love,{" "}
              <span className="font-serif font-normal italic text-muted">in one calm workspace.</span>
            </h2>
          </Reveal>

          <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {/* 1. Persistent Google Drive AI Brain — wide card */}
            <Reveal className="md:col-span-2" delay={0}>
              <CardShell className="h-full">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <IconTile accent="text-gold">
                    <ChartLineIcon className="h-5 w-5" />
                  </IconTile>
                  <span className="rounded-full border border-gold/30 bg-gold/12 px-3 py-1 text-[11px] font-semibold text-gold">
                    Persistent Memory in Your Google Drive
                  </span>
                </div>
                <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                  An AI Brain that compounds with every trade
                </h3>
                <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                  Every pre-trade Plan, Thought hypothesis, Setup checklist, and post-trade Autopsy updates your personal AI Brain profile inside your own Google Drive. As your sample grows, its pre-trade mistake warnings, Win-Odds, and MINATO coaching grow sharper every single day.
                </p>
                <div className="mt-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4" aria-hidden>
                  {[
                    { k: "1. Plan", v: "Thesis & Emotion" },
                    { k: "2. Thought", v: "AI Trap Guardrails" },
                    { k: "3. Execute", v: "16:9 Chart Replay" },
                    { k: "4. Autopsy", v: "Drive AI Sync" },
                  ].map((step) => (
                    <div key={step.k} className="rounded-2xl border border-line bg-raised/80 px-3 py-2.5">
                      <p className="font-mono text-[10.5px] font-semibold text-gold">{step.k}</p>
                      <p className="mt-0.5 text-xs font-medium text-ink">{step.v}</p>
                    </div>
                  ))}
                </div>
              </CardShell>
            </Reveal>

            {/* 2. 16:9 Replays & 2-Line Mistake Strip */}
            <Reveal delay={0.06}>
              <CardShell className="h-full">
                <IconTile>
                  <ImageIcon className="h-5 w-5" />
                </IconTile>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  16:9 Replays &amp; Mistake Strip
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Full-screen Reels-style feed with TradingView-proportioned candles, 60fps Apple cubic-bezier camera glide, click-anywhere play/pause, and a 2-line mistake summary beneath every replay.
                </p>
              </CardShell>
            </Reveal>

            {/* 3. Equity-Curve Benchmark Calendar & Today Panel */}
            <Reveal delay={0.1}>
              <CardShell className="h-full">
                <IconTile>
                  <CalendarIcon className="h-5 w-5" />
                </IconTile>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  Live-Scrubbing P&amp;L Calendar
                </h3>
                <p className="mt-1.5 mb-5 text-sm leading-relaxed text-muted">
                  Built to the same benchmark as our Equity Curve—scrub across any day to inspect live P&amp;L, switch between Standard, Heatmap, and Cumulative modes, and track today&apos;s intraday trajectory.
                </p>
                <div className="grid grid-cols-7 gap-1" aria-hidden>
                  {[14, 8, -6, 0, 11, -9, 0, 6, 13, 4, -4, 9, 16, 0, 7, -8, 12, 10, -5, 15, 3, 18, -3, 9, 21, 6, -7, 12].map(
                    (v, i) => (
                      <motion.span
                        key={i}
                        initial={{ opacity: 0, scale: 0.6 }}
                        whileInView={{ opacity: 1, scale: 1 }}
                        viewport={{ once: true }}
                        transition={{ delay: i * 0.015, duration: 0.3 }}
                        className={`aspect-square rounded-[5px] ${
                          v > 0 ? "bg-profit/55" : v < 0 ? "bg-loss/45" : "bg-ink/[0.06]"
                        }`}
                      />
                    ),
                  )}
                </div>
              </CardShell>
            </Reveal>

            {/* 4. 3-Minute Weekly & Monthly Reviews */}
            <Reveal delay={0.14}>
              <CardShell className="h-full">
                <IconTile>
                  <BookOpenIcon className="h-5 w-5" />
                </IconTile>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  3-Minute Anti-Procrastination Reviews
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  No 20-question walls of text. Weekly and Monthly reviews give you an instant AI Brain executive brief plus 3 progressive questions with one-tap smart chips from your data.
                </p>
              </CardShell>
            </Reveal>

            {/* 5. Neural Practice Studio & 5 Arenas */}
            <Reveal delay={0.18}>
              <CardShell className="h-full">
                <IconTile>
                  <RouteIcon className="h-5 w-5" />
                </IconTile>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  Neural Practice &amp; 5 Arenas
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Drill your own charts in Time Machine, Trade Recall, ICT Lab, Risk Math, and Week Boss—backed by 5-axis skill telemetry and Box 0–5 spaced repetition.
                </p>
              </CardShell>
            </Reveal>

            {/* 6. Trading Lab, Prop Challenges & Friends Leaderboard */}
            <Reveal delay={0.2} className="md:col-span-2">
              <CardShell className="h-full">
                <IconTile>
                  <TargetIcon className="h-5 w-5" />
                </IconTile>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  Trading Lab Backtesting, Prop Guardrails &amp; Friends Leaderboard
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Backtest multi-timeframe strategies in the Trading Lab, monitor prop-firm drawdown cushions in real time, and compete with trading partners on process adherence, review streaks, and rule discipline—without exposing private dollar balances.
                </p>
              </CardShell>
            </Reveal>

            {/* 7. Private & Portable */}
            <Reveal delay={0.24}>
              <CardShell className="h-full">
                <IconTile>
                  <ShieldIcon className="h-5 w-5" />
                </IconTile>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  100% Owned in Your Google Drive
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Your trades, screenshots, playbook rules, and AI Brain profile live in your private Google Drive folder (`EdgeBook/journals/journal.json`) with instant local caching and one-click JSON export.
                </p>
              </CardShell>
            </Reveal>
          </div>
        </div>
      </section>
    </>
  );
}

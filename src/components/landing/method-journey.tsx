"use client";

import { motion, useReducedMotion } from "motion/react";
import { ArrowRightIcon, CheckIcon } from "@/components/ui/icons";
import { Reveal } from "./reveal";

/* -------------------------------------------------------------------------- */
/*  What Edgebook Offers Differently Than Other Trading Journals              */
/* -------------------------------------------------------------------------- */

const COMPARISONS = [
  {
    dimension: "Pre-Trade Protection",
    others: "Logs trades only after you already lost money",
    edgebook: "Plan → Thought → Setup ritual with 700ms calm reveal, live Win-Odds & 2-loss lockout gate",
  },
  {
    dimension: "AI Intelligence",
    others: "Generic chatbot prompts that forget your history",
    edgebook: "Persistent AI Brain in your Google Drive + Multi-Voter AI Tagging + MINATO Sensei",
  },
  {
    dimension: "Trade Replays & Feed",
    others: "Static screenshots or clunky popups",
    edgebook: "Full-screen 16:9 Reels-style feed, 60fps candle interpolation & 2-line AI mistake strip",
  },
  {
    dimension: "Weekly & Monthly Reviews",
    others: "20-question blank essays that cause procrastination",
    edgebook: "3-Minute Ritual: AI Executive Brief + 3 progressive prompts + 1-tap smart chips",
  },
  {
    dimension: "Fixing Mistakes",
    others: "Shows a red bar chart of mistakes you keep repeating",
    edgebook: "Auto-converts mistake trades into Box 0–5 spaced-repetition drills across 5 Practice Arenas",
  },
  {
    dimension: "Calendar & Intraday Read",
    others: "Static monthly grid with tiny numbers",
    edgebook: "Equity-Curve-benchmarked live pointer scrubbing + Standard, Heatmap & Cumulative modes",
  },
  {
    dimension: "Data Ownership & Privacy",
    others: "$49–$79/mo cloud lock-in on someone else's database",
    edgebook: "100% stored in your own Google Drive (`EdgeBook/journals/journal.json`) + instant JSON export",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Plan & Thought",
    body: "Capture your thesis, liquidity draw, and emotional state. Questions unfold after a calm 700ms pause while the AI Brain flags mistake traps before you enter.",
  },
  {
    n: "02",
    title: "Execute & 16:9 Replay",
    body: "Log your trade in seconds and watch it back on a 16:9 cinema replay with smooth 60fps candle interpolation and a 2-line mistake summary.",
  },
  {
    n: "03",
    title: "Autopsy & 3-Min Review",
    body: "Multi-voter AI tagging files your trade into your Google Drive AI Brain—powering 3-question weekly & monthly rituals you will actually finish.",
  },
  {
    n: "04",
    title: "Drill & Compound",
    body: "Your mistakes automatically become spaced-repetition flashcards across 5 Practice Arenas until every leak is retired at Box 5.",
  },
];

export function Method() {
  return (
    <>
      {/* ---------------- Why Edgebook vs. Other Journals ---------------- */}
      <section id="difference" className="relative py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">
              What We Offer Differently
            </p>
            <h2 className="mt-3 max-w-3xl font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[44px]">
              Why traders switch from{" "}
              <span className="font-serif font-normal italic text-gold-grad">
                traditional journals to Edgebook.
              </span>
            </h2>
            <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
              Other journals act like accounting ledgers after the damage is done. Edgebook is a closed-loop behavioral and execution system designed to protect your capital before entry and compound your skill after the close.
            </p>
          </Reveal>

          <Reveal delay={0.12}>
            <div className="panel mt-12 overflow-hidden rounded-[28px] border border-line-strong">
              <div className="grid grid-cols-1 border-b border-line bg-raised/90 px-6 py-4 text-xs font-semibold uppercase tracking-[0.14em] text-faint md:grid-cols-[0.9fr_1.05fr_1.35fr]">
                <div>Capability</div>
                <div className="hidden md:block">Other Trading Journals</div>
                <div className="hidden text-gold md:block">Edgebook Operating System</div>
              </div>
              <div className="divide-y divide-line-soft">
                {COMPARISONS.map((row, idx) => (
                  <motion.div
                    key={row.dimension}
                    initial={{ opacity: 0, y: 10 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, amount: 0.2 }}
                    transition={{ duration: 0.4, delay: idx * 0.04 }}
                    className="grid grid-cols-1 gap-3 px-6 py-4 transition-colors hover:bg-ink/[0.02] md:grid-cols-[0.9fr_1.05fr_1.35fr] md:items-center md:gap-6"
                  >
                    <div className="font-display text-sm font-semibold text-ink">{row.dimension}</div>
                    <div className="text-xs leading-relaxed text-muted md:text-[13.5px]">
                      <span className="mr-1.5 inline-block font-mono text-[10px] uppercase text-faint md:hidden">
                        Others:
                      </span>
                      {row.others}
                    </div>
                    <div className="flex items-start gap-2 text-xs font-medium leading-relaxed text-ink md:text-[13.5px]">
                      <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
                      <span>{row.edgebook}</span>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ---------------- 4-Step Closed-Loop Ritual ---------------- */}
      <section id="method" className="relative py-24 sm:py-28">
        <div className="mx-auto max-w-6xl px-5 sm:px-8">
          <Reveal>
            <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">The Closed-Loop Ritual</p>
            <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[44px]">
              Four unhurried steps that turn{" "}
              <span className="font-serif font-normal italic text-muted">raw sessions into mastery.</span>
            </h2>
          </Reveal>

          <div className="relative mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
            <div
              aria-hidden
              className="absolute left-[10%] right-[10%] top-7 hidden border-t border-dashed border-line-strong lg:block"
            />
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 0.1}>
                <motion.div
                  whileHover={{ y: -6, rotateX: 3, rotateY: -3 }}
                  transition={{ type: "spring", stiffness: 280, damping: 20 }}
                  className="panel relative h-full rounded-[24px] p-6"
                >
                  <div className="relative z-10 mb-5 inline-grid h-12 w-12 place-items-center rounded-2xl border border-gold/35 bg-raised font-mono text-xs font-bold text-gold shadow-sm">
                    {s.n}
                  </div>
                  <h3 className="font-display text-lg font-semibold tracking-tight text-ink">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                </motion.div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Journey teaser — a taste of the in-app roadmap                     */
/* ------------------------------------------------------------------ */

const ROAD =
  "M20 185 H210 Q240 185 240 155 V105 Q240 75 270 75 H450 Q480 75 480 105 V135 Q480 165 510 165 H700 Q730 165 730 135 V95 Q730 65 760 65 H845";

export function Journey() {
  const reduce = useReducedMotion();

  return (
    <section id="journey" className="relative overflow-hidden py-24 sm:py-28">
      <div className="dot-backdrop absolute inset-0 opacity-60 [mask-image:radial-gradient(70%_70%_at_50%_50%,black,transparent)]" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="mx-auto max-w-2xl text-center">
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">The Equity &amp; Mastery Road</p>
          <h2 className="mt-3 font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[44px]">
            Progress you can{" "}
            <span className="font-serif font-normal italic text-gold-grad">feel and measure.</span>
          </h2>
          <p className="mt-4 text-base leading-relaxed text-muted">
            Every logged trade and completed review advances your milestone roadmap while protecting your prop-firm or personal drawdown floor.
          </p>
        </Reveal>

        <Reveal delay={0.15}>
          <div className="panel relative mx-auto mt-12 max-w-4xl overflow-hidden rounded-[28px] px-4 pb-2 pt-8 sm:px-10">
            <svg viewBox="0 0 880 240" className="w-full" role="img" aria-label="Winding road from start equity through milestone flags to target">
              <defs>
                <linearGradient id="jr-road" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="var(--color-line-strong)" />
                  <stop offset="55%" stopColor="var(--color-profit)" stopOpacity="0.75" />
                  <stop offset="100%" stopColor="var(--color-gold)" />
                </linearGradient>
              </defs>

              <path d={ROAD} fill="none" stroke="var(--color-road-shadow)" strokeWidth="26" strokeLinecap="round" />
              <path d={ROAD} fill="none" stroke="url(#jr-road)" strokeWidth="2.5" strokeLinecap="round" />

              {!reduce && (
                <path
                  d={ROAD}
                  fill="none"
                  stroke="var(--color-gold)"
                  strokeWidth="1.4"
                  strokeDasharray="7 16"
                  strokeLinecap="round"
                  opacity="0.65"
                  style={{ animation: "dash-flow 1.6s linear infinite" }}
                />
              )}

              <g>
                <circle cx="20" cy="185" r="9" fill="var(--color-raised)" stroke="var(--color-muted)" strokeWidth="2" />
                <circle cx="20" cy="185" r="3.2" fill="var(--color-muted)" />
                <text x="20" y="216" textAnchor="middle" fontSize="11" fill="var(--color-muted)" fontFamily="var(--font-mono)" letterSpacing="1.5">
                  START
                </text>
              </g>

              {[
                { x: 115, y: 185, label: "$12.5k", passed: true },
                { x: 360, y: 75, label: "$15k", passed: true },
                { x: 600, y: 165, label: "$17.5k", passed: false },
              ].map((m) => (
                <g key={m.label}>
                  <circle
                    cx={m.x}
                    cy={m.y}
                    r="8"
                    fill={m.passed ? "var(--color-profit)" : "var(--color-raised)"}
                    stroke={m.passed ? "var(--color-profit)" : "var(--color-line-strong)"}
                    strokeWidth="2"
                  />
                  {m.passed && (
                    <circle cx={m.x} cy={m.y} r="13" fill="none" stroke="var(--color-profit)" strokeOpacity="0.25" strokeWidth="1" />
                  )}
                  <text
                    x={m.x}
                    y={m.y - 16}
                    textAnchor="middle"
                    fontSize="11"
                    fontFamily="var(--font-mono)"
                    fill={m.passed ? "var(--color-profit)" : "var(--color-faint)"}
                  >
                    {m.label}
                  </text>
                </g>
              ))}

              <g>
                <rect x="845" y="38" width="3.5" height="52" rx="1.75" fill="var(--color-gold)" />
                <path d="M848.5 40 L888 50 L848.5 62 Z" fill="var(--color-gold)" />
                <text x="842" y="112" textAnchor="end" fontSize="11" fill="var(--color-gold)" fontFamily="var(--font-mono)" letterSpacing="1.5">
                  TARGET
                </text>
              </g>

              {reduce ? (
                <circle cx="480" cy="105" r="7" fill="#fff" />
              ) : (
                <g>
                  <circle r="7" fill="#fff">
                    <animateMotion dur="9s" repeatCount="indefinite" keyPoints="0;0.46;0.46;1;1;0" keyTimes="0;0.34;0.5;0.86;0.93;1" calcMode="linear">
                      <mpath href="#journey-path" />
                    </animateMotion>
                    <animate attributeName="opacity" values="1;1;0;0;1;1" dur="9s" repeatCount="indefinite" />
                  </circle>
                  <circle r="12" fill="none" stroke="var(--color-ink)" strokeOpacity="0.28" strokeWidth="1">
                    <animateMotion dur="9s" repeatCount="indefinite" keyPoints="0;0.46;0.46;1;1;0" keyTimes="0;0.34;0.5;0.86;0.93;1" calcMode="linear">
                      <mpath href="#journey-path" />
                    </animateMotion>
                    <animate attributeName="opacity" values="1;1;0;0;1;1" dur="9s" repeatCount="indefinite" />
                  </circle>
                </g>
              )}

              <path id="journey-path" d={ROAD} fill="none" stroke="none" />
            </svg>

            <div className="flex flex-col items-center gap-3 pb-6 pt-2 sm:flex-row sm:justify-between">
              <p className="text-sm text-muted">
                Milestones light up as your equity crosses them—synced privately to your Google Drive.
              </p>
              <a
                href="/login?mode=signup"
                className="group inline-flex items-center gap-2 text-sm font-semibold text-gold transition-colors hover:text-ink"
              >
                Start your road
                <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
              </a>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

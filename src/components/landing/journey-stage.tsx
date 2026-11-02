"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import {
  bindScrollProgress,
  clamp,
  lerp,
  prefersReducedMotion,
  rangeProgress,
  scrollToPinnedProgress,
  smooth,
} from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  SCENE 01 — THE ENTRANCE (Pinned Scroll-Scrubbed Atelier Introduction)     */
/*  SCENE 03 — THE DECISION (Pinned Scroll-Scrubbed 5-Stage Daily Ritual)     */
/*                                                                            */
/*  100% Original Edgebook Design System (warm paper --canvas, --surface,     */
/*  --ink, --gold, Instrument Serif + Inter Variable + JetBrains Mono).       */
/*  Zero candlesticks, zero charts, zero 3D clutter.                          */
/* ========================================================================== */

interface RitualStage {
  id: string;
  num: string;
  tab: string;
  moment: string;
  headline: string;
  italicAccent: string;
  description: string;
  entries: { label: string; value: string; tone?: string }[];
  note: string;
}

const RITUAL_STAGES: RitualStage[] = [
  {
    id: "plan",
    num: "01",
    tab: "Plan",
    moment: "08:45 AM · Before the Open",
    headline: "Start with a written intention,",
    italicAccent: "not an impulse.",
    description:
      "Before a single order is placed, you write down the one scenario you are waiting for, what would invalidate it, and how your head feels right now.",
    entries: [
      { label: "Session Thesis", value: "Wait for the overnight low to sweep and reclaim" },
      { label: "Invalidation", value: "Acceptance below the pre-market shelf" },
      { label: "Internal State", value: "Calm, rested, unhurried", tone: "text-profit" },
    ],
    note: "Major high-impact economic releases are automatically noted in your plan before the bell.",
  },
  {
    id: "thought",
    num: "02",
    tab: "Thought",
    moment: "09:15 AM · Pre-Commitment",
    headline: "Decide how you will act",
    italicAccent: "before the pressure arrives.",
    description:
      "Write your if-then commitments in plain language. Edgebook surfaces your own historical process odds and reminds you of the personal rules you asked it to guard.",
    entries: [
      { label: "If-Then Rule", value: "If the first 15 minutes chop, I keep my hands off the mouse" },
      { label: "Guardrail", value: "Stop for the day after 2 consecutive losses", tone: "text-gold" },
      { label: "Historical Edge", value: "84% clean-process rate when rested", tone: "text-profit" },
    ],
    note: "Your personal reminders surface quietly as a translucent banner before you act.",
  },
  {
    id: "restraint",
    num: "03",
    tab: "Restraint",
    moment: "09:38 AM · In the Moment",
    headline: "Protect your composure",
    italicAccent: "when the room speeds up.",
    description:
      "Whether you take a clean setup or log a disciplined No-Trade Day because your condition never appeared, Edgebook honors the quality of your decision—not just the dollar outcome.",
    entries: [
      { label: "Checklist Gate", value: "All 4 playbook conditions verified before entry" },
      { label: "Risk Envelope", value: "Sized within your drawdown survival ceiling", tone: "text-profit" },
      { label: "Impulse Check", value: "Zero FOMO or revenge state flagged", tone: "text-gold" },
    ],
    note: "A losing trade with clean rules is recorded as a valid loss; a sloppy win is flagged as a process break.",
  },
  {
    id: "autopsy",
    num: "04",
    tab: "Autopsy",
    moment: "10:20 AM · Honest Mirror",
    headline: "Name the one thing",
    italicAccent: "that helped or hurt you.",
    description:
      "A three-minute post-trade reflection asks what went well, what slipped, and what you will watch next time—turning vague regret into a specific, named lesson.",
    entries: [
      { label: "Process Verdict", value: "Followed plan · Waited for confirmation", tone: "text-profit" },
      { label: "Observation", value: "Felt the urge to tighten the stop early, stayed patient" },
      { label: "Watch Next Time", value: "Keep the same composure on Friday sessions", tone: "text-gold" },
    ],
    note: "Every reflection is indexed locally and in your own Google Drive so Minato remembers it.",
  },
  {
    id: "practise",
    num: "05",
    tab: "Practise",
    moment: "Evening · Spaced Mastery",
    headline: "Turn repeat mistakes into",
    italicAccent: "automatic intuition.",
    description:
      "Mistakes don't sit forgotten in an old entry. Edgebook brings them back on a spaced-repetition schedule across five deliberate practice modes until the habit is retired.",
    entries: [
      { label: "Active Drill", value: "Patience & Early-Exit Recognition" },
      { label: "Mastery Box", value: "Box 4 of 5 · Due in 7 days", tone: "text-gold" },
      { label: "Weekly Ritual", value: "3-minute synthesis completed", tone: "text-profit" },
    ],
    note: "Twenty cards at most in your daily study feed—built to be finished and put down.",
  },
];

/* -------------------------------------------------------------------------- */
/*  SCENE 01 — THE ENTRANCE (#top)                                            */
/* -------------------------------------------------------------------------- */

export function JourneyStage() {
  const secRef = useRef<HTMLElement>(null);
  const headerRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const plateRef = useRef<HTMLDivElement>(null);
  const stepRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        // Camera push: headline subtly recedes while the Atelier Ledger rises and flattens in 3D perspective
        const introFade = smooth(rangeProgress(p, 0.0, 0.65));
        const cardFocus = smooth(rangeProgress(p, 0.0, 0.55));

        if (headerRef.current) {
          const y = -introFade * 32;
          const scale = lerp(1, 0.945, introFade);
          const opacity = lerp(1, 0.28, smooth(rangeProgress(p, 0.35, 0.92)));
          headerRef.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
          headerRef.current.style.opacity = String(opacity);
        }

        if (cardRef.current) {
          const y = lerp(24, -18, cardFocus);
          const scale = lerp(0.935, 1.0, cardFocus);
          const rotX = lerp(5.5, 0, cardFocus);
          cardRef.current.style.transform = `perspective(1400px) translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)}) rotateX(${rotX.toFixed(2)}deg)`;
        }

        if (plateRef.current) {
          const plateScale = lerp(1.0, 1.08, smooth(p));
          const plateY = lerp(8, -12, smooth(p));
          plateRef.current.style.transform = `translate3d(0, ${plateY.toFixed(1)}px, 0) scale(${plateScale.toFixed(4)})`;
        }

        // Scroll-scrubbed illumination of the 4 ledger entries on the right sheet
        stepRefs.current.forEach((el, idx) => {
          if (!el) return;
          const start = idx * 0.16;
          const active = smooth(rangeProgress(p, start, start + 0.28));
          el.style.opacity = String(lerp(0.42, 1, active));
          el.style.transform = `translate3d(${lerp(8, 0, active).toFixed(1)}px, 0, 0)`;
        });
      },
      { pinned: true },
    );
  }, []);

  return (
    <section
      id="top"
      ref={secRef}
      className="lp-entrance-pin relative px-5 sm:px-8"
      aria-label="Edgebook introduction"
    >
      <div className="sticky top-0 flex min-h-svh flex-col justify-center overflow-hidden pb-12 pt-[clamp(84px,11svh,128px)]">
        {/* Subtle warm editorial paper ambient light */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          style={{
            background:
              "radial-gradient(820px 380px at 50% 0%, color-mix(in srgb, var(--gold) 11%, transparent), transparent 72%)",
          }}
        />

        <div
          ref={headerRef}
          className="relative mx-auto flex max-w-5xl flex-col items-center text-center will-change-transform"
        >
          <p
            style={{ "--d": "0s" } as React.CSSProperties}
            className="lp-rise mb-5 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[11.5px] uppercase tracking-[0.14em] text-faint sm:text-[12px]"
          >
            <span className="text-gold">№ 01</span>
            <span aria-hidden="true" className="hidden h-px w-10 bg-line-strong sm:block" />
            <span>Scene I · The trading psychology &amp; decision ledger</span>
          </p>

          <h1
            style={{ "--d": "0.06s" } as React.CSSProperties}
            className="lp-rise font-display text-[clamp(2.4rem,6.4vw,5.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
          >
            Most journals record the result.{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              Edgebook records the decision.
            </span>
          </h1>

          <p
            style={{ "--d": "0.14s" } as React.CSSProperties}
            className="lp-rise mt-5 max-w-2xl text-[clamp(1.02rem,1.55vw,1.24rem)] leading-relaxed text-muted"
          >
            Before the market tests your strategy, it tests your mind. Write your intention before the bell, review your discipline honestly, and turn every mistake into quiet mastery—all stored in your own Google Drive.
          </p>

          <div
            style={{ "--d": "0.22s" } as React.CSSProperties}
            className="lp-rise mt-7 flex flex-wrap items-center justify-center gap-x-7 gap-y-3"
          >
            <Link
              href="/login?mode=signup"
              className="inline-flex h-12 items-center rounded-full bg-gold-strong px-7 text-[16px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
            >
              Start your journal
            </Link>
            <a
              href="#film"
              className="group inline-flex items-center gap-1.5 text-[16px] text-gold transition-colors hover:text-ink"
            >
              Enter The Inner Film
              <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </a>
          </div>

          <ul
            style={{ "--d": "0.3s" } as React.CSSProperties}
            className="lp-rise mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11px] uppercase tracking-[0.11em] text-faint"
          >
            {[
              "Your Google Drive",
              "Pre-Session Clarity",
              "Psychological Autopsy",
              "Export as JSON",
            ].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <span aria-hidden="true" className="h-1 w-1 rounded-full bg-gold" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        {/* Tactile Editorial Atelier Diptych (Scroll-Scrubbed Perspective & Entry Illumination — Zero Charts) */}
        <div
          ref={cardRef}
          className="lp-win-in mx-auto mt-10 w-full max-w-[1140px] will-change-transform"
        >
          <div className="lp-sq grid overflow-hidden rounded-[32px] border border-line-strong/80 bg-surface shadow-[var(--shadow-overlay)] lg:grid-cols-[1.06fr_0.94fr]">
            {/* Left: Atmospheric Photographic Study */}
            <div className="relative min-h-[260px] overflow-hidden bg-[#1a1510] sm:min-h-[340px]">
              <div
                ref={plateRef}
                className="absolute inset-0 bg-cover bg-center will-change-transform"
                style={{ backgroundImage: "url(/landing/act-2-stillness.jpg)" }}
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(18,14,10,0.34) 0%, rgba(18,14,10,0.10) 45%, rgba(18,14,10,0.84) 100%)",
                }}
                aria-hidden="true"
              />
              <div className="relative z-10 flex h-full flex-col justify-between p-6 text-[#f7f4ee] sm:p-8">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-[#dfbe82]">
                  <span>Archival Study · Morning Ritual</span>
                  <span>09:05 NY</span>
                </div>
                <div className="mt-16">
                  <p className="font-serif text-[clamp(1.45rem,2.4vw,2.05rem)] italic leading-snug text-[#f7f4ee]">
                    &ldquo;When your rules are written in calm, the market cannot rewrite them in noise.&rdquo;
                  </p>
                  <p className="mt-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#d6cebd]">
                    The Edgebook Philosophy · Process Over Outcome
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Live Archival Ledger Entry Sheet */}
            <div className="relative flex flex-col justify-between p-6 sm:p-8 lg:p-10">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-7 w-px bg-loss/20 sm:left-9"
              />
              <div className="pl-5 sm:pl-6">
                <div className="flex items-center justify-between border-b border-line pb-3.5">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                    Session Entry #048
                  </span>
                  <span className="rounded-full border border-profit/30 bg-profit/10 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-profit">
                    Process Verified
                  </span>
                </div>

                <div className="mt-5 space-y-4">
                  <div
                    ref={(el) => {
                      stepRefs.current[0] = el;
                    }}
                    className="transition-opacity duration-150"
                  >
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                      01 · Pre-Session Intention
                    </p>
                    <p className="mt-1 font-display text-[15.5px] font-medium leading-snug text-ink">
                      Wait for the overnight liquidity sweep to reclaim on a 5-minute close. Do not chase the opening drive.
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-y border-line py-3.5">
                    <div
                      ref={(el) => {
                        stepRefs.current[1] = el;
                      }}
                      className="transition-opacity duration-150"
                    >
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                        02 · Headspace
                      </p>
                      <p className="mt-0.5 text-[14px] font-medium text-profit">
                        Calm · Composed
                      </p>
                    </div>
                    <div
                      ref={(el) => {
                        stepRefs.current[2] = el;
                      }}
                      className="transition-opacity duration-150"
                    >
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                        03 · Guardrail
                      </p>
                      <p className="mt-0.5 text-[14px] font-medium text-ink">
                        Max 2 trades · Clean stop
                      </p>
                    </div>
                  </div>

                  <div
                    ref={(el) => {
                      stepRefs.current[3] = el;
                    }}
                    className="transition-opacity duration-150"
                  >
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                      04 · Post-Session Reflection
                    </p>
                    <p className="mt-1 font-serif text-[18px] italic leading-snug text-ink">
                      &ldquo;Let the first false move pass at 09:34 without clicking. Entered only when my condition appeared.&rdquo;
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-between border-t border-line pl-5 pt-4 text-[12.5px] text-muted sm:pl-6">
                <span>Stored privately in your Google Drive</span>
                <a
                  href="#how"
                  className="font-medium text-gold transition-colors hover:text-ink"
                >
                  Explore the 5-step ritual →
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  SCENE 03 — THE DECISION (#how — Pinned Scroll-Scrubbed 5-Stage Ritual)    */
/* -------------------------------------------------------------------------- */

export function DecisionRitualStage() {
  const secRef = useRef<HTMLElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [scrollProg, setScrollProg] = useState(0);
  const [stageLocalProg, setStageLocalProg] = useState(1);

  const stage = RITUAL_STAGES[activeIdx] ?? RITUAL_STAGES[0]!;

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        const clamped = clamp(p, 0, 0.9999);
        const scaled = clamped * RITUAL_STAGES.length;
        const idx = Math.min(RITUAL_STAGES.length - 1, Math.floor(scaled));
        const local = clamp(scaled - idx, 0, 1);

        setScrollProg((prev) => (Math.abs(prev - clamped) < 0.003 ? prev : clamped));
        setActiveIdx((prev) => (prev === idx ? prev : idx));
        setStageLocalProg((prev) => (Math.abs(prev - local) < 0.01 ? prev : local));
      },
      { pinned: true },
    );
  }, []);

  const jumpToStage = (idx: number) => {
    setActiveIdx(idx);
    setStageLocalProg(0.5);
    if (!prefersReducedMotion() && secRef.current) {
      const targetP = (idx + 0.25) / RITUAL_STAGES.length;
      scrollToPinnedProgress(secRef.current, targetP, true);
    }
  };

  // Subtle bidirectional entrance curve within each stage
  const entryLift = prefersReducedMotion()
    ? 1
    : smooth(clamp(stageLocalProg * 4.2, 0.25, 1));

  return (
    <section
      id="how"
      ref={secRef}
      className="lp-ritual-pin relative px-5 sm:px-8"
      aria-labelledby="ritual-title"
    >
      <div className="sticky top-0 flex min-h-svh flex-col justify-center py-16 sm:py-20">
        <div className="mx-auto w-full max-w-[1200px]">
          <div data-scrub-reveal>
            <Eyebrow n="03">Scene III · The daily ritual</Eyebrow>
            <div className="mt-5 flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <h2
                id="ritual-title"
                className="max-w-3xl font-display text-[clamp(2rem,4.8vw,3.9rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
              >
                A quiet system for{" "}
                <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                  every part of a decision.
                </span>
              </h2>
              <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
                Scroll through the five moments of a disciplined session—from the first thought before the bell to the lesson you practise that evening.
              </p>
            </div>
          </div>

          {/* Apple HIG Segmented Stage Selector + Scroll-Scrubbed Progress Rail */}
          <div className="mt-8 flex flex-col gap-2.5">
            <div className="flex overflow-x-auto pb-1 [scrollbar-width:none]">
              <div
                role="tablist"
                aria-label="Five stages of the Edgebook ritual"
                className="inline-grid min-w-full grid-cols-5 rounded-full border border-line bg-surface p-1.5 sm:min-w-[620px]"
              >
                {RITUAL_STAGES.map((s, idx) => {
                  const isSelected = idx === activeIdx;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => jumpToStage(idx)}
                      className={`rounded-full px-3 py-2 text-center text-[12.5px] font-medium transition duration-200 sm:px-5 sm:text-[13.5px] ${
                        isSelected
                          ? "border border-line-soft bg-raised text-ink shadow-[var(--shadow-rest)]"
                          : "text-muted hover:text-ink"
                      }`}
                    >
                      <span className="mr-1.5 hidden font-mono text-[11px] text-gold sm:inline">
                        {s.num}
                      </span>
                      {s.tab}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Continuous Scroll Progress Hairline Across the 5 Ritual Stages */}
            <div
              aria-hidden="true"
              className="h-1 w-full overflow-hidden rounded-full bg-line/70"
            >
              <div
                className="h-full rounded-full bg-gold transition-transform duration-75 ease-out origin-left"
                style={{
                  transform: `scaleX(${Math.max(0.08, scrollProg || (activeIdx + 1) / RITUAL_STAGES.length)})`,
                }}
              />
            </div>
          </div>

          {/* Scroll-Scrubbed Stage Card */}
          <div className="lp-sq mt-6 grid items-center gap-8 rounded-[32px] border border-line-strong/80 bg-surface p-6 shadow-[var(--shadow-overlay)] sm:p-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:p-12">
            <div
              style={{
                opacity: entryLift,
                transform: `translate3d(0, ${((1 - entryLift) * 14).toFixed(1)}px, 0)`,
              }}
              className="transition-transform duration-150 ease-out"
            >
              <p className="font-mono text-[11.5px] uppercase tracking-[0.14em] text-gold">
                Stage {stage.num} of 05 · {stage.moment}
              </p>
              <h3 className="mt-3.5 font-display text-[clamp(1.65rem,3.2vw,2.6rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-ink">
                {stage.headline}{" "}
                <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                  {stage.italicAccent}
                </span>
              </h3>
              <p className="mt-4 text-[16px] leading-relaxed text-muted">
                {stage.description}
              </p>

              <div className="mt-7 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() =>
                    jumpToStage((activeIdx - 1 + RITUAL_STAGES.length) % RITUAL_STAGES.length)
                  }
                  className="inline-flex h-9 items-center rounded-full border border-line-strong bg-raised px-4 text-[13px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
                >
                  ← Previous
                </button>
                <button
                  type="button"
                  onClick={() => jumpToStage((activeIdx + 1) % RITUAL_STAGES.length)}
                  className="inline-flex h-9 items-center rounded-full border border-line-strong bg-raised px-4 text-[13px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
                >
                  Next stage →
                </button>
              </div>
            </div>

            {/* Right: Tactile Ledger Sheet for the Active Stage */}
            <div className="rounded-[24px] border border-line bg-canvas/80 p-5 sm:p-7">
              <div className="space-y-3">
                {stage.entries.map((item, idx) => {
                  const rowProgress = prefersReducedMotion()
                    ? 1
                    : smooth(clamp((stageLocalProg - idx * 0.08) * 3.8, 0.35, 1));
                  return (
                    <div
                      key={item.label}
                      style={{
                        opacity: rowProgress,
                        transform: `translate3d(0, ${((1 - rowProgress) * 10).toFixed(1)}px, 0)`,
                      }}
                      className="rounded-2xl border border-line bg-raised px-4 py-3.5 shadow-[var(--shadow-rest)] transition-transform duration-150"
                    >
                      <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                        {item.label}
                      </p>
                      <p
                        className={`mt-1 text-[15px] font-medium leading-snug ${
                          item.tone ?? "text-ink"
                        }`}
                      >
                        {item.value}
                      </p>
                    </div>
                  );
                })}
              </div>
              <p className="mt-4 flex items-center gap-2 px-1 text-[13px] text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                <span>{stage.note}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

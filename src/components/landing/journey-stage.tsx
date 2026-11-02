"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  bindScrollProgress,
  clamp,
  notifyTheatreUi,
  prefersReducedMotion,
  smooth,
  subscribeTheatreUi,
  theatreState,
} from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  ACT 01: HERO — Dark Study at Night (Camera Push-In to Open Notebook)      */
/*  ACT 03: DAILY RITUAL — 5 Glowing Portal Doors Along the 3D Camera Path    */
/* ========================================================================== */

interface RitualStage {
  id: string;
  num: string;
  tab: string;
  portalCode: string;
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
    portalCode: "STATION I · INTENTION THRESHOLD",
    moment: "08:45 AM · Before the Open",
    headline: "Start with a written intention,",
    italicAccent: "not an impulse.",
    description:
      "Before a single order is placed, you write down the one scenario you are waiting for, what would invalidate it, and how your head feels right now.",
    entries: [
      { label: "Session Thesis", value: "Wait for the overnight low to sweep and reclaim" },
      { label: "Invalidation", value: "Acceptance below the pre-market shelf" },
      { label: "Internal State", value: "Calm, rested, unhurried", tone: "text-[#74b08c]" },
    ],
    note: "Major high-impact economic releases are automatically noted in your plan before the bell.",
  },
  {
    id: "thought",
    num: "02",
    tab: "Thought",
    portalCode: "STATION II · PRE-COMMITMENT ARCH",
    moment: "09:15 AM · Pre-Commitment",
    headline: "Decide how you will act",
    italicAccent: "before the pressure arrives.",
    description:
      "Write your if-then commitments in plain language. Edgebook surfaces your own historical process odds and reminds you of the personal rules you asked it to guard.",
    entries: [
      { label: "If-Then Rule", value: "If the first 15 minutes chop, I keep my hands off the mouse" },
      { label: "Guardrail", value: "Stop for the day after 2 consecutive losses", tone: "text-[#cba76b]" },
      { label: "Historical Edge", value: "84% clean-process rate when rested", tone: "text-[#74b08c]" },
    ],
    note: "Your personal reminders surface quietly as a translucent banner before you act.",
  },
  {
    id: "restraint",
    num: "03",
    tab: "Restraint",
    portalCode: "STATION III · COMPOSURE GATE",
    moment: "09:38 AM · In the Moment",
    headline: "Protect your composure",
    italicAccent: "when the room speeds up.",
    description:
      "Whether you take a clean setup or log a disciplined No-Trade Day because your condition never appeared, Edgebook honors the quality of your decision—not just the dollar outcome.",
    entries: [
      { label: "Checklist Gate", value: "All 4 playbook conditions verified before entry" },
      { label: "Risk Envelope", value: "Sized within your drawdown survival ceiling", tone: "text-[#74b08c]" },
      { label: "Impulse Check", value: "Zero FOMO or revenge state flagged", tone: "text-[#cba76b]" },
    ],
    note: "A losing trade with clean rules is recorded as a valid loss; a sloppy win is flagged as a process break.",
  },
  {
    id: "autopsy",
    num: "04",
    tab: "Autopsy",
    portalCode: "STATION IV · HONEST MIRROR",
    moment: "10:20 AM · Honest Mirror",
    headline: "Name the one thing",
    italicAccent: "that helped or hurt you.",
    description:
      "A three-minute post-trade reflection asks what went well, what slipped, and what you will watch next time—turning vague regret into a specific, named lesson.",
    entries: [
      { label: "Process Verdict", value: "Followed plan · Waited for confirmation", tone: "text-[#74b08c]" },
      { label: "Observation", value: "Felt the urge to tighten the stop early, stayed patient" },
      { label: "Watch Next Time", value: "Keep the same composure on Friday sessions", tone: "text-[#cba76b]" },
    ],
    note: "Every reflection is indexed locally and in your own Google Drive so Minato remembers it.",
  },
  {
    id: "practise",
    num: "05",
    tab: "Practise",
    portalCode: "STATION V · SPACED MASTERY",
    moment: "Evening · Spaced Mastery",
    headline: "Turn repeat mistakes into",
    italicAccent: "automatic intuition.",
    description:
      "Mistakes don't sit forgotten in an old entry. Edgebook brings them back on a spaced-repetition schedule across five deliberate practice modes until the habit is retired.",
    entries: [
      { label: "Active Drill", value: "Patience & Early-Exit Recognition" },
      { label: "Mastery Box", value: "Box 4 of 5 · Due in 7 days", tone: "text-[#cba76b]" },
      { label: "Weekly Ritual", value: "3-minute synthesis completed", tone: "text-[#74b08c]" },
    ],
    note: "Twenty cards at most in your daily study feed—built to be finished and put down.",
  },
];

/* -------------------------------------------------------------------------- */
/*  1. Hero Section — Dark Study at Night, Open Notebook, Push-In Camera      */
/* -------------------------------------------------------------------------- */

export function JourneyStage() {
  const secRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    return bindScrollProgress(
      secRef.current,
      (p) => {
        // As camera pushes into the study notebook & candlestick canyon, copy gently scales and lifts
        if (copyRef.current) {
          const lift = smooth(clamp(p * 1.35, 0, 1));
          copyRef.current.style.transform = `translate3d(0, ${-lift * 38}px, 0) scale(${1 + lift * 0.025})`;
          copyRef.current.style.opacity = String(1 - smooth(clamp((p - 0.55) / 0.42, 0, 1)) * 0.88);
        }
        if (hudRef.current) {
          const revealHud = smooth(clamp((p - 0.05) / 0.45, 0, 1));
          hudRef.current.style.transform = `translate3d(0, ${(1 - revealHud) * 18}px, 0)`;
        }
      },
      { pinned: true },
    );
  }, []);

  return (
    <section
      id="top"
      ref={secRef}
      aria-label="Edgebook introduction"
      className="lp-hero-pinned relative h-[175svh]"
    >
      <div className="sticky top-0 flex min-h-svh flex-col justify-between overflow-hidden px-5 pb-10 pt-24 sm:px-8 sm:pb-12 sm:pt-28">
        {/* Top Study Ambient Light Beam Glow */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[540px]"
          style={{
            background:
              "radial-gradient(640px 420px at 50% 18%, rgba(203, 167, 107, 0.22), transparent 72%)",
          }}
        />

        {/* Main Center Stage: One Headline, One Primary CTA */}
        <div
          ref={copyRef}
          className="relative z-10 mx-auto my-auto flex max-w-4xl flex-col items-center text-center will-change-transform"
        >
          <p
            style={{ "--d": "0s" } as React.CSSProperties}
            className="lp-rise mb-6 inline-flex items-center gap-3 rounded-full border border-[#cba76b]/30 bg-[#15120d]/75 px-4 py-1.5 font-mono text-[11px] uppercase tracking-[0.16em] text-[#d6cebd] backdrop-blur-md sm:text-[11.5px]"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-[#cba76b]" aria-hidden="true" />
            <span className="text-[#cba76b]">ACT 01 · NIGHT STUDY</span>
            <span aria-hidden="true" className="h-3 w-px bg-[#453b2b]" />
            <span>The decision ledger</span>
          </p>

          <h1
            style={{ "--d": "0.06s" } as React.CSSProperties}
            className="lp-rise font-display text-[clamp(2.55rem,6.6vw,5.5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#f7f4ee] drop-shadow-[0_12px_36px_rgba(0,0,0,0.65)]"
          >
            Most journals record the result.{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#cba76b]">
              Edgebook records the decision.
            </span>
          </h1>

          <p
            style={{ "--d": "0.14s" } as React.CSSProperties}
            className="lp-rise mt-6 max-w-2xl text-[clamp(1.05rem,1.55vw,1.24rem)] leading-relaxed text-[#d6cebd]"
          >
            A quiet study before the opening bell. Write your intention in the ledger, step through the candlestick noise with composure, and keep every entry in your own Google Drive.
          </p>

          {/* Single Primary CTA */}
          <div
            style={{ "--d": "0.22s" } as React.CSSProperties}
            className="lp-rise mt-9 flex items-center justify-center"
          >
            <Link
              href="/login?mode=signup"
              className="inline-flex h-12 items-center rounded-full bg-gold-strong px-8 text-[16.5px] font-medium text-on-gold shadow-[0_16px_40px_-10px_rgba(183,142,62,0.55)] transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
            >
              Start your journal
            </Link>
          </div>
        </div>

        {/* Bottom Desk Notebook Telemetry Strip (Frames the 3D Open Notebook on the Desk) */}
        <div
          ref={hudRef}
          className="lp-win-in relative z-10 mx-auto w-full max-w-[1060px] will-change-transform"
        >
          <div className="lp-theatre-panel lp-sq grid items-center gap-4 rounded-[24px] px-5 py-4 sm:grid-cols-[1.2fr_1fr_auto] sm:px-7 sm:py-4.5">
            <div className="flex items-center gap-3.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-[#cba76b]/35 bg-[#cba76b]/12 font-mono text-[11px] font-semibold text-[#cba76b]">
                #48
              </span>
              <div>
                <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#cba76b]">
                  Open on Desk · Pre-Session Intention
                </p>
                <p className="mt-0.5 text-[14px] font-medium text-[#f7f4ee]">
                  &ldquo;Wait for overnight sweep &amp; 5m reclaim. Zero impulse clicks.&rdquo;
                </p>
              </div>
            </div>

            <div className="hidden items-center gap-6 border-l border-white/10 pl-6 sm:flex">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#a69d8c]">
                  Headspace
                </p>
                <p className="mt-0.5 text-[13.5px] font-medium text-[#74b08c]">
                  Calm · Rested
                </p>
              </div>
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#a69d8c]">
                  Storage
                </p>
                <p className="mt-0.5 text-[13.5px] font-medium text-[#f0eae0]">
                  Your Google Drive
                </p>
              </div>
            </div>

            <a
              href="#film"
              className="inline-flex items-center gap-2 self-start rounded-full border border-[#cba76b]/35 bg-white/[0.04] px-4 py-2 font-mono text-[11px] uppercase tracking-[0.12em] text-[#dfbe82] transition hover:border-[#cba76b] hover:text-white sm:self-center"
            >
              <span>Scroll into theatre</span>
              <span aria-hidden="true">↓</span>
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Daily Ritual (#how) — Five Glowing 3D Doors Along the Camera Spline    */
/* -------------------------------------------------------------------------- */

export function DecisionRitualStage() {
  const [activeIdx, setActiveIdx] = useState(0);
  const stage = RITUAL_STAGES[activeIdx] ?? RITUAL_STAGES[0]!;

  useEffect(() => {
    return subscribeTheatreUi((st) => {
      setActiveIdx((prev) => (prev === st.ritualStep ? prev : st.ritualStep));
    });
  }, []);

  const selectDoor = (idx: number) => {
    theatreState.manualRitualStep = idx;
    theatreState.ritualStep = idx;
    setActiveIdx(idx);
    notifyTheatreUi();
  };

  return (
    <section
      id="how"
      aria-labelledby="ritual-title"
      className="relative px-5 py-24 sm:px-8 sm:py-32 lg:min-h-[260svh]"
    >
      <div className="mx-auto max-w-[1200px] lg:sticky lg:top-20">
        <div data-theatre-reveal>
          <Eyebrow n="03">The daily ritual · Five Glowing Stations</Eyebrow>
          <div className="mt-5 flex flex-col justify-between gap-6 lg:flex-row lg:items-end">
            <h2
              id="ritual-title"
              className="max-w-3xl font-display text-[clamp(2.1rem,4.8vw,3.9rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-[#f7f4ee]"
            >
              Five thresholds between{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#cba76b]">
                impulse and mastery.
              </span>
            </h2>
            <p className="max-w-md text-[15.5px] leading-relaxed text-[#d6cebd]">
              As the camera travels through the five ritual doorways, the active threshold illuminates. Scroll through each station or select a door below.
            </p>
          </div>
        </div>

        {/* 5 Portal Station Selector Bar */}
        <div className="mt-8 flex overflow-x-auto pb-2 [scrollbar-width:none]">
          <div
            role="tablist"
            aria-label="Five stations of the Edgebook ritual"
            className="lp-theatre-panel inline-grid min-w-full grid-cols-5 rounded-full p-1.5 sm:min-w-[640px]"
          >
            {RITUAL_STAGES.map((s, idx) => {
              const isSelected = idx === activeIdx;
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => selectDoor(idx)}
                  className={`rounded-full px-3 py-2 text-center text-[12.5px] font-medium transition duration-200 sm:px-5 sm:text-[13.5px] ${
                    isSelected
                      ? "bg-[#cba76b] text-[#231a09] shadow-md font-semibold"
                      : "text-[#d6cebd] hover:text-white"
                  }`}
                >
                  <span
                    className={`mr-1.5 hidden font-mono text-[11px] sm:inline ${
                      isSelected ? "text-[#231a09]/80" : "text-[#cba76b]"
                    }`}
                  >
                    {s.num}
                  </span>
                  {s.tab}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active Station Glass Card */}
        <div className="lp-theatre-panel lp-sq mt-6 grid items-center gap-8 rounded-[32px] p-6 sm:p-10 lg:grid-cols-[0.95fr_1.05fr] lg:gap-14 lg:p-12">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-[#cba76b]/35 bg-[#cba76b]/12 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#dfbe82]">
              <span className="h-2 w-2 rounded-full bg-[#cba76b] animate-pulse" aria-hidden="true" />
              <span>{stage.portalCode}</span>
            </div>

            <p className="mt-4 font-mono text-[11.5px] uppercase tracking-[0.14em] text-[#a69d8c]">
              Door {stage.num} of 05 · {stage.moment}
            </p>

            <h3 className="mt-2.5 font-display text-[clamp(1.65rem,3.2vw,2.6rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-[#f7f4ee]">
              {stage.headline}{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#cba76b]">
                {stage.italicAccent}
              </span>
            </h3>
            <p className="mt-4 text-[16px] leading-relaxed text-[#d6cebd]">
              {stage.description}
            </p>

            <div className="mt-7 flex items-center gap-3">
              <button
                type="button"
                onClick={() => selectDoor((activeIdx - 1 + RITUAL_STAGES.length) % RITUAL_STAGES.length)}
                className="inline-flex h-9 items-center rounded-full border border-[#cba76b]/40 bg-white/[0.05] px-4 text-[13px] font-medium text-[#f0eae0] transition hover:border-[#cba76b] active:scale-[0.98]"
              >
                ← Previous door
              </button>
              <button
                type="button"
                onClick={() => selectDoor((activeIdx + 1) % RITUAL_STAGES.length)}
                className="inline-flex h-9 items-center rounded-full border border-[#cba76b]/40 bg-white/[0.05] px-4 text-[13px] font-medium text-[#f0eae0] transition hover:border-[#cba76b] active:scale-[0.98]"
              >
                Next door →
              </button>
            </div>
          </div>

          {/* Right: Illuminated Portal Ledger Entries */}
          <div className="rounded-[24px] border border-white/12 bg-[#14110c]/85 p-5 sm:p-7">
            <div className="mb-3 flex items-center justify-between border-b border-white/10 pb-3 font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#a69d8c]">
              <span>Portal {stage.num} Telemetry</span>
              <span className="text-[#cba76b]">● Active Station Brightened</span>
            </div>
            <div className="space-y-3">
              {stage.entries.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-white/10 bg-[#1d1812] px-4 py-3.5"
                >
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-[#a69d8c]">
                    {item.label}
                  </p>
                  <p className={`mt-1 text-[15px] font-medium leading-snug ${item.tone ?? "text-[#f7f4ee]"}`}>
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-4 flex items-center gap-2 px-1 text-[13px] text-[#d6cebd]">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#cba76b]" aria-hidden="true" />
              <span>{stage.note}</span>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

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
/*  SCENE 01 — THE ENTRANCE (Interactive Writer's Desk & Focus Reticle)       */
/*  SCENE 03 — THE DECISION (Pinned 5-Gate Tactical Decision Flowchart)       */
/* ========================================================================== */

interface DeskCheckpoint {
  id: string;
  code: string;
  label: string;
  summary: string;
  detail: string;
  status: string;
  tone: "gold" | "profit";
}

const DESK_CHECKPOINTS: DeskCheckpoint[] = [
  {
    id: "intention",
    code: "NODE 01",
    label: "Pre-Session Intention",
    summary: "Wait for the overnight liquidity sweep to reclaim on a 5-minute close. Do not chase the opening drive.",
    detail: "Written at 08:45 AM before the opening bell. Eliminates reactive impulse clicking by defining a single high-conviction scenario.",
    status: "LOCKED IN INK",
    tone: "gold",
  },
  {
    id: "headspace",
    code: "NODE 02",
    label: "Internal State Check",
    summary: "Calm · Composed · 8h Rest",
    detail: "Your historical journal data shows an 84% clean-process rate when rested vs. 41% when rushed or fatigued.",
    status: "OPTIMAL",
    tone: "profit",
  },
  {
    id: "guardrail",
    code: "NODE 03",
    label: "Risk Guardrail",
    summary: "Max 2 trades · Stop after first clean win",
    detail: "Automatically surfaces as a quiet banner before order entry so you never overtrade a green morning.",
    status: "ARMED",
    tone: "gold",
  },
  {
    id: "reflection",
    code: "NODE 04",
    label: "Post-Session Autopsy",
    summary: "“Let the first false move pass at 09:34 without clicking. Entered only when my condition appeared.”",
    detail: "Indexed locally and in your own Google Drive so Minato remembers the lesson tomorrow.",
    status: "VERIFIED A+",
    tone: "profit",
  },
];

interface RitualStage {
  id: string;
  num: string;
  tab: string;
  gateCode: string;
  moment: string;
  headline: string;
  italicAccent: string;
  description: string;
  integrityScore: string;
  entries: { label: string; value: string; tone?: string }[];
  note: string;
}

const RITUAL_STAGES: RitualStage[] = [
  {
    id: "plan",
    num: "01",
    tab: "Plan",
    gateCode: "GATE 01 · INTENTION",
    moment: "08:45 AM · Before the Open",
    headline: "Start with a written intention,",
    italicAccent: "not an impulse.",
    description:
      "Before a single order is placed, you write down the one scenario you are waiting for, what would invalidate it, and how your head feels right now.",
    integrityScore: "100% Clarity",
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
    gateCode: "GATE 02 · PRE-COMMITMENT",
    moment: "09:15 AM · Pre-Commitment",
    headline: "Decide how you will act",
    italicAccent: "before the pressure arrives.",
    description:
      "Write your if-then commitments in plain language. Edgebook surfaces your own historical process odds and reminds you of the personal rules you asked it to guard.",
    integrityScore: "84% Historical Odds",
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
    gateCode: "GATE 03 · COMPOSURE",
    moment: "09:38 AM · In the Moment",
    headline: "Protect your composure",
    italicAccent: "when the room speeds up.",
    description:
      "Whether you take a clean setup or log a disciplined No-Trade Day because your condition never appeared, Edgebook honors the quality of your decision—not just the dollar outcome.",
    integrityScore: "0 Impulse Flags",
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
    gateCode: "GATE 04 · HONEST MIRROR",
    moment: "10:20 AM · Honest Mirror",
    headline: "Name the one thing",
    italicAccent: "that helped or hurt you.",
    description:
      "A three-minute post-trade reflection asks what went well, what slipped, and what you will watch next time—turning vague regret into a specific, named lesson.",
    integrityScore: "Lesson Indexed",
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
    gateCode: "GATE 05 · SPACED MASTERY",
    moment: "Evening · Spaced Mastery",
    headline: "Turn repeat mistakes into",
    italicAccent: "automatic intuition.",
    description:
      "Mistakes don't sit forgotten in an old entry. Edgebook brings them back on a spaced-repetition schedule across five deliberate practice modes until the habit is retired.",
    integrityScore: "Box 4 of 5",
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

  const [focusedNode, setFocusedNode] = useState(0);
  const [manualNode, setManualNode] = useState<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
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

        // Scroll automatically locks the inspection reticle across Nodes 01 -> 04
        if (manualNode === null) {
          const autoIdx = Math.min(3, Math.floor(clamp(p, 0, 0.999) * 4));
          setFocusedNode((prev) => (prev === autoIdx ? prev : autoIdx));
        }
      },
      { pinned: true },
    );
  }, [manualNode]);

  const activeCheckpoint = DESK_CHECKPOINTS[focusedNode] ?? DESK_CHECKPOINTS[0]!;

  return (
    <section
      id="top"
      ref={secRef}
      className="lp-entrance-pin relative px-5 sm:px-8"
      aria-label="Edgebook introduction"
    >
      <div className="sticky top-0 flex min-h-svh flex-col justify-center overflow-hidden pb-12 pt-[clamp(80px,10svh,120px)]">
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
            <span>CH.01 · The trading psychology &amp; decision ledger</span>
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
              Enter Theatre Mode
              <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </a>
          </div>
        </div>

        {/* Interactive Writer's Room Atelier Diptych (Scroll & Click Node Inspection) */}
        <div
          ref={cardRef}
          className="lp-win-in mx-auto mt-9 w-full max-w-[1140px] will-change-transform"
        >
          <div className="lp-sq grid overflow-hidden rounded-[32px] border border-line-strong/80 bg-surface shadow-[var(--shadow-overlay)] lg:grid-cols-[1.04fr_0.96fr]">
            {/* Left: Atmospheric Study Plate + Live Node Inspector Telemetry */}
            <div className="relative min-h-[280px] overflow-hidden bg-[#1a1510] sm:min-h-[360px]">
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
                    "linear-gradient(180deg, rgba(18,14,10,0.42) 0%, rgba(18,14,10,0.14) 42%, rgba(18,14,10,0.88) 100%)",
                }}
                aria-hidden="true"
              />
              <div className="relative z-10 flex h-full flex-col justify-between p-6 text-[#f7f4ee] sm:p-8">
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-[#dfbe82]">
                  <span>Writer&apos;s Study · Inspection Mode</span>
                  <span className="rounded-full border border-[#dfbe82]/40 bg-black/45 px-2.5 py-0.5 text-[10px]">
                    {activeCheckpoint.code} ACTIVE
                  </span>
                </div>

                {/* Diegetic Inspector Readout Box */}
                <div className="mt-14 rounded-2xl border border-white/15 bg-black/50 p-4 backdrop-blur-md">
                  <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em]">
                    <span className="text-[#cba76b]">{activeCheckpoint.label}</span>
                    <span className="text-[#74b08c]">● {activeCheckpoint.status}</span>
                  </div>
                  <p className="mt-2 font-serif text-[19px] italic leading-snug text-[#f7f4ee]">
                    &ldquo;{activeCheckpoint.summary}&rdquo;
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-[#d6cebd]">
                    {activeCheckpoint.detail}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: Interactive Archival Ledger Sheet with 4 Selectable Checkpoints */}
            <div className="relative flex flex-col justify-between p-6 sm:p-8 lg:p-9">
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-y-0 left-7 w-px bg-loss/20 sm:left-9"
              />
              <div className="pl-5 sm:pl-6">
                <div className="flex items-center justify-between border-b border-line pb-3">
                  <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                    Session Entry #048 · Click or Scroll to Inspect
                  </span>
                  <span className="rounded-full border border-profit/30 bg-profit/10 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-profit">
                    Process Verified
                  </span>
                </div>

                <div className="mt-4 space-y-2.5" role="listbox" aria-label="Session #048 decision nodes">
                  {DESK_CHECKPOINTS.map((cp, idx) => {
                    const isFocused = idx === focusedNode;
                    return (
                      <button
                        key={cp.id}
                        type="button"
                        role="option"
                        aria-selected={isFocused}
                        onClick={() => {
                          setManualNode(idx);
                          setFocusedNode(idx);
                        }}
                        onMouseEnter={() => {
                          setFocusedNode(idx);
                        }}
                        className={`w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                          isFocused
                            ? "border-gold bg-raised shadow-[var(--shadow-rest)] translate-x-1"
                            : "border-line bg-canvas/50 opacity-75 hover:opacity-100"
                        }`}
                      >
                        <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
                          <span className={isFocused ? "text-gold font-semibold" : "text-faint"}>
                            [{cp.code}] · {cp.label}
                          </span>
                          <span className={cp.tone === "profit" ? "text-profit" : "text-gold"}>
                            {isFocused ? "◉ LOCKED" : cp.status}
                          </span>
                        </div>
                        <p className="mt-1 line-clamp-2 text-[14px] font-medium leading-snug text-ink">
                          {cp.summary}
                        </p>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="mt-5 flex items-center justify-between border-t border-line pl-5 pt-3.5 text-[12.5px] text-muted sm:pl-6">
                <span>Stored privately in your Google Drive</span>
                <a
                  href="#film"
                  className="font-medium text-gold transition-colors hover:text-ink"
                >
                  Scroll into Theatre Mode →
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
/*  SCENE 03 — THE DECISION (#how — Pinned 5-Gate Tactical Decision Tree)     */
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
      <div className="sticky top-0 flex min-h-svh flex-col justify-center py-14 sm:py-20">
        <div className="mx-auto w-full max-w-[1200px]">
          <div data-scrub-reveal>
            <Eyebrow n="03">CH.03 · The 5-Gate Decision Flowchart</Eyebrow>
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
                Scroll to advance through the five tactical gates of an Edgebook session—or select any node in the flowchart below.
              </p>
            </div>
          </div>

          {/* Connected 5-Node Game Flowchart Rail */}
          <div className="mt-8 flex flex-col gap-2.5">
            <div className="flex overflow-x-auto pb-1 [scrollbar-width:none]">
              <div
                role="tablist"
                aria-label="Five stages of the Edgebook ritual"
                className="inline-grid min-w-full grid-cols-5 rounded-full border border-line bg-surface p-1.5 sm:min-w-[640px]"
              >
                {RITUAL_STAGES.map((s, idx) => {
                  const isSelected = idx === activeIdx;
                  const isUnlocked = idx <= activeIdx;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => jumpToStage(idx)}
                      className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-center text-[12.5px] font-medium transition duration-200 sm:px-5 sm:text-[13.5px] ${
                        isSelected
                          ? "border border-line-strong bg-raised text-ink shadow-[var(--shadow-rest)]"
                          : isUnlocked
                            ? "text-ink/80 hover:text-ink"
                            : "text-muted hover:text-ink"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected
                            ? "bg-gold"
                            : isUnlocked
                              ? "bg-profit"
                              : "bg-line-strong"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="hidden font-mono text-[11px] text-gold sm:inline">
                        {s.num}
                      </span>
                      <span>{s.tab}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Continuous Scroll Circuit Trace */}
            <div
              aria-hidden="true"
              className="h-1 w-full overflow-hidden rounded-full bg-line/70"
            >
              <div
                className="h-full origin-left rounded-full bg-gradient-to-r from-profit via-gold to-gold-strong transition-transform duration-75 ease-out"
                style={{
                  transform: `scaleX(${Math.max(0.08, scrollProg || (activeIdx + 1) / RITUAL_STAGES.length)})`,
                }}
              />
            </div>
          </div>

          {/* Scroll-Scrubbed 3D Perspective Stage Card */}
          <div className="lp-sq mt-6 grid items-center gap-8 rounded-[32px] border border-line-strong/80 bg-surface p-6 shadow-[var(--shadow-overlay)] sm:p-10 lg:grid-cols-[0.92fr_1.08fr] lg:gap-14 lg:p-12">
            <div
              style={{
                opacity: entryLift,
                transform: `translate3d(0, ${((1 - entryLift) * 14).toFixed(1)}px, 0)`,
              }}
              className="transition-transform duration-150 ease-out"
            >
              <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-gold">
                <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden="true" />
                <span>{stage.gateCode}</span>
                <span className="text-faint">·</span>
                <span className="text-profit">{stage.integrityScore}</span>
              </div>

              <p className="mt-4 font-mono text-[11.5px] uppercase tracking-[0.14em] text-faint">
                Stage {stage.num} of 05 · {stage.moment}
              </p>

              <h3 className="mt-2.5 font-display text-[clamp(1.65rem,3.2vw,2.6rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-ink">
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
                  ← Previous gate
                </button>
                <button
                  type="button"
                  onClick={() => jumpToStage((activeIdx + 1) % RITUAL_STAGES.length)}
                  className="inline-flex h-9 items-center rounded-full border border-line-strong bg-raised px-4 text-[13px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
                >
                  Next gate →
                </button>
              </div>
            </div>

            {/* Right: Tactile Ledger Sheet for the Active Gate */}
            <div className="rounded-[24px] border border-line bg-canvas/80 p-5 sm:p-7">
              <div className="mb-3 flex items-center justify-between border-b border-line pb-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                <span>Gate {stage.num} Telemetry</span>
                <span className="text-profit">● Unlocked by Scroll</span>
              </div>
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

"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  bindScrollProgress,
  lerp,
  prefersReducedMotion,
  rangeProgress,
  smooth,
} from "./motion-utils";
import { Eyebrow } from "./ledger";

const POINTS = [
  {
    t: "It reads what you wrote.",
    d: "Journal notes, plans, reflections, practice sessions and screenshots all count.",
  },
  {
    t: "It remembers the conversation.",
    d: "Pick up tomorrow where you stopped today.",
  },
  {
    t: "It reviews process, not markets.",
    d: "No signals, no predictions, no financial advice.",
  },
] as const;

interface DialogueBranch {
  id: string;
  chip: string;
  userPrompt: string;
  minatoReply: string;
  findingBadge: string;
  followUpPrompt: string;
  followUpReply: string;
  recommendedDrill: string;
  memoryNodes: string[];
  quote: string;
}

const DIALOGUE_BRANCHES: DialogueBranch[] = [
  {
    id: "fridays",
    chip: "Friday givebacks",
    userPrompt: "Why do I keep giving back my Friday gains?",
    minatoReply:
      "You tend to take a second trade right after a green one, and your notes in those trades mention feeling “ahead”. A simple rule may help: on Fridays, stop after the first winner.",
    findingBadge: "4 of 5 Friday losses followed a green opener",
    followUpPrompt: "Okay. What should I practise?",
    followUpReply:
      "Your last two mistakes were moving the stop early. A short Time Machine drill on that is a good next step.",
    recommendedDrill: "Time Machine · Friday Winner Stop-Rule",
    memoryNodes: ["14 Oct Plan", "21 Oct Autopsy #31", "28 Oct Reflection", "01 Nov Lab"],
    quote: "The hardest moment to stay disciplined is right after you win.",
  },
  {
    id: "early-stop",
    chip: "Early stop moves",
    userPrompt: "Why did I choke my stop to breakeven at 09:42?",
    minatoReply:
      "In 6 of your last 9 entries, you moved your stop within 4 minutes whenever you kept dollar P&L visible. When you switch to R-multiples, your premature exits drop by 70%.",
    findingBadge: "Trigger identified: Watching live dollar P&L",
    followUpPrompt: "How do I lock that habit out tomorrow?",
    followUpReply:
      "I've added a pre-session guardrail reminder for 09:25 AM: hide dollar P&L and wait for the 5-minute candle close.",
    recommendedDrill: "Matrix Arena · R-Multiple Patience",
    memoryNodes: ["09:05 AM Thesis", "Autopsy #42", "Autopsy #48", "Playbook Rule #3"],
    quote: "Count in R, never in dollars, while the decision is still alive.",
  },
  {
    id: "size-up",
    chip: "Readiness to size up",
    userPrompt: "Am I disciplined enough to increase my risk per trade?",
    minatoReply:
      "Your clean-process rate over the last 20 sessions is 88%, and you logged two disciplined No-Trade Days during chop. Your process supports a 1.25× step-up with a hard two-loss circuit breaker.",
    findingBadge: "88% clean process across 20 sessions",
    followUpPrompt: "What would invalidate the size increase?",
    followUpReply:
      "Any single unscheduled revenge entry immediately resets sizing back to baseline until three clean reviews are logged.",
    recommendedDrill: "Weekend Boss · Drawdown Envelope Test",
    memoryNodes: ["20-Day Process Log", "2 No-Trade Days", "Challenge #04", "Risk Envelope"],
    quote: "Size is earned by kept rules, never by a single lucky week.",
  },
];

function Bubble({
  me,
  children,
  bubbleRef,
}: {
  me?: boolean;
  children: React.ReactNode;
  bubbleRef?: (el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={bubbleRef}
      className={`transition-transform duration-150 will-change-transform ${
        me ? "flex justify-end" : "flex justify-start"
      }`}
    >
      <p
        className={`max-w-[88%] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-[1.45] ${
          me
            ? "rounded-br-[6px] bg-ink text-canvas"
            : "rounded-bl-[6px] bg-ink/[0.06] text-ink"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * CHAPTER 04B — MINATO COMPANION COMMAND DECK (#minato)
 * Full-width widescreen 12-column game layout (.lp-wide) featuring:
 * - Left (4 cols): Editorial copy + Philosophical quote + 3 core principles
 * - Center (5 cols): Interactive RPG Dialogue Tree Simulator
 * - Right (3 cols): Animated Neural Memory Map & Recommended Practice Drill Card
 */
export function MinatoDemo() {
  const secRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);

  const [branchIdx, setBranchIdx] = useState(0);
  const branch = DIALOGUE_BRANCHES[branchIdx] ?? DIALOGUE_BRANCHES[0]!;

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        if (panelRef.current) {
          const panelProg = smooth(rangeProgress(p, 0.0, 0.45));
          const y = lerp(24, 0, panelProg);
          const scale = lerp(0.96, 1, panelProg);
          panelRef.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        }

        bubbleRefs.current.forEach((b, idx) => {
          if (!b) return;
          const start = 0.06 + idx * 0.14;
          const bProg = smooth(rangeProgress(p, start, start + 0.24));
          b.style.opacity = String(lerp(0.22, 1, bProg));
          b.style.transform = `translate3d(0, ${lerp(12, 0, bProg).toFixed(1)}px, 0)`;
        });
      },
      { startRatio: 0.88, endRatio: 0.2 },
    );
  }, []);

  return (
    <section
      id="minato"
      ref={secRef}
      className="lp-wide py-24 sm:py-32"
      aria-labelledby="minato-title"
    >
      <div className="grid w-full items-stretch gap-8 lg:grid-cols-12 xl:gap-10">
        {/* LEFT 4 COLS: Editorial Copy & Principles */}
        <div className="flex flex-col justify-between lg:col-span-4">
          <div>
            <div data-scrub-reveal>
              <Eyebrow n="05">CH.04B · Minato AI Companion</Eyebrow>
              <h2
                id="minato-title"
                className="mt-5 font-display text-[clamp(2rem,4vw,3.5rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
              >
                Ask the one who has{" "}
                <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                  read every entry.
                </span>
              </h2>
            </div>

            <ul className="mt-8 divide-y divide-line border-y border-line">
              {POINTS.map((p) => (
                <li key={p.t} className="py-4">
                  <p className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">
                    {p.t}
                  </p>
                  <p className="mt-1 text-[14.5px] leading-relaxed text-muted">
                    {p.d}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-6">
            <Link
              href="/login?mode=signup"
              className="group inline-flex items-center gap-1.5 text-[16.5px] font-medium text-gold transition-colors hover:text-ink"
            >
              Meet Minato in your journal
              <svg
                viewBox="0 0 24 24"
                className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="m9 6 6 6-6 6" />
              </svg>
            </Link>
          </div>
        </div>

        {/* CENTER 5 COLS: Interactive RPG Dialogue Tree Simulator */}
        <div className="lg:col-span-5">
          <div
            ref={panelRef}
            className="lp-sq flex h-full flex-col justify-between overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface shadow-[var(--shadow-overlay)] will-change-transform"
            role="region"
            aria-label="Interactive conversation with Minato about a trading habit"
          >
            <div>
              <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/minato-avatar.jpg"
                  alt=""
                  width={38}
                  height={38}
                  className="h-9.5 w-9.5 rounded-full border border-gold/40 object-cover"
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                    Minato
                  </p>
                  <p className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                    Journal-Grounded Companion
                  </p>
                </div>
                <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.1em] text-gold">
                  Select Prompt
                </span>
              </div>

              {/* 3 Playable Dialogue Branch Chips */}
              <div className="flex flex-wrap gap-1.5 border-b border-line bg-canvas/55 px-4 py-2.5">
                {DIALOGUE_BRANCHES.map((b, idx) => {
                  const active = idx === branchIdx;
                  return (
                    <button
                      key={b.id}
                      type="button"
                      onClick={() => setBranchIdx(idx)}
                      className={`rounded-full px-3 py-1 font-mono text-[10.5px] transition ${
                        active
                          ? "bg-gold-strong font-medium text-on-gold shadow-sm"
                          : "border border-line bg-raised text-muted hover:text-ink"
                      }`}
                    >
                      [{idx + 1}] {b.chip}
                    </button>
                  );
                })}
              </div>

              <div className="space-y-3 px-5 py-5">
                <Bubble
                  me
                  bubbleRef={(el) => {
                    bubbleRefs.current[0] = el;
                  }}
                >
                  {branch.userPrompt}
                </Bubble>
                <Bubble
                  bubbleRef={(el) => {
                    bubbleRefs.current[1] = el;
                  }}
                >
                  {branch.minatoReply}
                </Bubble>

                <div
                  ref={(el) => {
                    bubbleRefs.current[2] = el;
                  }}
                  className="minato-finding transition-transform duration-150"
                >
                  <span className="minato-finding-number">!</span>
                  <span className="font-mono text-[11.5px] font-medium text-ink">
                    {branch.findingBadge}
                  </span>
                </div>

                <Bubble
                  me
                  bubbleRef={(el) => {
                    bubbleRefs.current[3] = el;
                  }}
                >
                  {branch.followUpPrompt}
                </Bubble>
                <Bubble
                  bubbleRef={(el) => {
                    bubbleRefs.current[4] = el;
                  }}
                >
                  {branch.followUpReply}
                </Bubble>
              </div>
            </div>

            <div className="px-4 pb-4">
              <div className="flex items-center gap-2 rounded-[22px] bg-ink/[0.06] py-1.5 pl-4 pr-1.5">
                <span className="flex-1 text-[14px] text-faint">
                  Choose branch [1–3] above to test Minato…
                </span>
                <span
                  className="grid h-8 w-8 place-items-center rounded-full bg-gold-strong text-on-gold"
                  aria-hidden="true"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 19V5M5 12l7-7 7 7" />
                  </svg>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT 3 COLS: Animated Neural Memory Graph & Drill Dossier */}
        <div className="lp-sq flex flex-col justify-between rounded-[28px] border border-line-strong/80 bg-surface p-6 shadow-[var(--shadow-rest)] lg:col-span-3">
          <div>
            <p className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-gold">
              Memory Graph · Sources Cited
            </p>
            <p className="mt-1 text-[13px] text-muted">
              Entries Minato cross-referenced for this answer:
            </p>

            {/* Animated SVG Neural Memory Constellation */}
            <div className="my-4 rounded-2xl border border-line bg-canvas/80 p-3">
              <svg
                viewBox="0 0 260 150"
                className="w-full overflow-visible"
                role="img"
                aria-label="Minato neural memory graph connecting past journal entries"
              >
                <line x1="130" y1="75" x2="45" y2="30" stroke="var(--color-gold)" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="130" y1="75" x2="215" y2="30" stroke="var(--color-gold)" strokeWidth="1.5" strokeDasharray="3 3" />
                <line x1="130" y1="75" x2="45" y2="120" stroke="var(--color-profit)" strokeWidth="1.5" />
                <line x1="130" y1="75" x2="215" y2="120" stroke="var(--color-profit)" strokeWidth="1.5" />

                <circle cx="130" cy="75" r="18" fill="var(--color-gold-strong)" />
                <text x="130" y="79" textAnchor="middle" fontSize="9" fontWeight="700" fill="var(--color-on-gold)">
                  MINATO
                </text>

                {[
                  { x: 45, y: 30, label: branch.memoryNodes[0] },
                  { x: 215, y: 30, label: branch.memoryNodes[1] },
                  { x: 45, y: 120, label: branch.memoryNodes[2] },
                  { x: 215, y: 120, label: branch.memoryNodes[3] },
                ].map((n, i) => (
                  <g key={i}>
                    <circle cx={n.x} cy={n.y} r="7" fill="var(--color-raised)" stroke="var(--color-gold)" strokeWidth="2" />
                    <text
                      x={n.x}
                      y={i < 2 ? n.y - 12 : n.y + 18}
                      textAnchor="middle"
                      fontSize="9"
                      fill="var(--color-ink)"
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {n.label}
                    </text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="rounded-2xl border border-profit/30 bg-profit/10 p-3.5">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-profit">
                Recommended Next Quest
              </p>
              <p className="mt-1 text-[14px] font-semibold text-ink">
                {branch.recommendedDrill}
              </p>
            </div>
          </div>

          <blockquote className="mt-5 border-t border-line pt-4">
            <p className="font-serif text-[16.5px] italic leading-snug text-ink">
              &ldquo;{branch.quote}&rdquo;
            </p>
            <footer className="mt-1 font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              — Minato Pattern Engine
            </footer>
          </blockquote>
        </div>
      </div>
    </section>
  );
}

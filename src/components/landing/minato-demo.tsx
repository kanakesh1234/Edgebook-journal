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
        className={`max-w-[86%] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-[1.45] ${
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
 * SCENE 04B — MINATO (#minato)
 * Interactive Game Dialogue Tree + Scroll-Scrubbed Conversation Reveal
 * using 100% original Edgebook tokens.
 */
export function MinatoDemo() {
  const secRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pointRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [branchIdx, setBranchIdx] = useState(0);
  const branch = DIALOGUE_BRANCHES[branchIdx] ?? DIALOGUE_BRANCHES[0]!;

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        if (panelRef.current) {
          const panelProg = smooth(rangeProgress(p, 0.0, 0.45));
          const y = lerp(28, 0, panelProg);
          const scale = lerp(0.95, 1, panelProg);
          panelRef.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        }

        bubbleRefs.current.forEach((b, idx) => {
          if (!b) return;
          const start = 0.08 + idx * 0.14;
          const bProg = smooth(rangeProgress(p, start, start + 0.24));
          b.style.opacity = String(lerp(0.18, 1, bProg));
          b.style.transform = `translate3d(0, ${lerp(14, 0, bProg).toFixed(1)}px, 0)`;
        });

        pointRefs.current.forEach((pt, idx) => {
          if (!pt) return;
          const start = 0.12 + idx * 0.18;
          const ptProg = smooth(rangeProgress(p, start, start + 0.26));
          pt.style.opacity = String(lerp(0.25, 1, ptProg));
          pt.style.transform = `translate3d(${lerp(16, 0, ptProg).toFixed(1)}px, 0, 0)`;
        });
      },
      { startRatio: 0.88, endRatio: 0.2 },
    );
  }, []);

  return (
    <section
      id="minato"
      ref={secRef}
      className="px-5 py-24 sm:px-8 sm:py-36"
      aria-labelledby="minato-title"
    >
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-24">
        <div className="order-2 lg:order-1">
          <div
            ref={panelRef}
            className="lp-sq mx-auto w-full max-w-[470px] overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface shadow-[0_50px_110px_-50px_rgba(0,0,0,0.55)] will-change-transform"
            role="region"
            aria-label="Interactive conversation with Minato about a trading habit"
          >
            <div className="flex items-center gap-3 border-b border-line px-4 py-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/minato-avatar.jpg"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">
                  Minato
                </p>
                <p className="flex items-center gap-1.5 text-[12px] text-muted">
                  <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                  Your trading companion
                </p>
              </div>
              <span className="rounded-full bg-ink/[0.06] px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-faint">
                Interactive
              </span>
            </div>

            {/* Interactive Dialogue Branch Selector */}
            <div className="flex flex-wrap gap-1.5 border-b border-line bg-canvas/55 px-4 py-2.5">
              {DIALOGUE_BRANCHES.map((b, idx) => {
                const active = idx === branchIdx;
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => setBranchIdx(idx)}
                    className={`rounded-full px-2.5 py-1 font-mono text-[10.5px] transition ${
                      active
                        ? "bg-gold-strong font-medium text-on-gold"
                        : "border border-line bg-raised text-muted hover:text-ink"
                    }`}
                  >
                    {b.chip}
                  </button>
                );
              })}
            </div>

            <div className="space-y-2.5 px-4 py-5">
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

              {/* Native Minato analytical finding card from globals.css */}
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

            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 rounded-[22px] bg-ink/[0.06] py-1.5 pl-4 pr-1.5">
                <span className="flex-1 text-[14.5px] text-faint">
                  Select a prompt above or ask Minato…
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

        <div className="order-1 lg:order-2">
          <div data-scrub-reveal>
            <Eyebrow n="05">Minato · Contextual Companion</Eyebrow>
            <h2
              id="minato-title"
              className="mt-6 font-display text-[clamp(2.3rem,5.4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
            >
              Ask the one who has{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                read every entry.
              </span>
            </h2>
          </div>

          <ul className="mt-10 divide-y divide-line border-y border-line">
            {POINTS.map((p, i) => (
              <li
                key={p.t}
                ref={(el) => {
                  pointRefs.current[i] = el;
                }}
                className="py-5 transition-opacity duration-150 will-change-transform"
              >
                <p className="font-display text-[clamp(1.2rem,2vw,1.5rem)] font-semibold tracking-[-0.025em] text-ink">
                  {p.t}
                </p>
                <p className="mt-1.5 max-w-md text-[15.5px] leading-relaxed text-muted">
                  {p.d}
                </p>
              </li>
            ))}
          </ul>

          <Link
            href="/login?mode=signup"
            className="group mt-8 inline-flex items-center gap-1 text-[17px] text-gold transition-colors hover:text-ink"
          >
            Meet Minato
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
    </section>
  );
}

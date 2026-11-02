"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { bindScrollProgress, clamp, prefersReducedMotion } from "./motion-utils";
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

interface DialogueThread {
  id: string;
  label: string;
  q1: string;
  a1: string;
  q2: string;
  a2: string;
}

const THREADS: DialogueThread[] = [
  {
    id: "fridays",
    label: "Friday givebacks",
    q1: "Why do I keep giving back my Friday gains?",
    a1: "You tend to take a second trade right after a green one, and your notes in those trades mention feeling “ahead”. A simple rule may help: on Fridays, stop after the first winner.",
    q2: "Okay. What should I practise?",
    a2: "Your last two mistakes were moving the stop early. A short Time Machine drill on that is a good next step.",
  },
  {
    id: "stops",
    label: "Early stop moves",
    q1: "When do I usually choke a winning trade?",
    a1: "Across your last 18 entries, 5 early exits happened between 09:45 and 10:05 NY when you watched unrealized P&L instead of the 5-minute candle close.",
    q2: "How do I lock that habit out?",
    a2: "Enable your pre-session guardrail banner for the first 30 minutes and hide dollar P&L during active execution.",
  },
];

function Bubble({ me, children }: { me?: boolean; children: React.ReactNode }) {
  return (
    <div className={me ? "flex justify-end" : "flex justify-start"}>
      <p
        className={`max-w-[86%] rounded-[20px] px-3.5 py-2.5 text-[14px] leading-[1.48] ${
          me
            ? "rounded-br-[6px] bg-[#cba76b] font-medium text-[#231a09]"
            : "rounded-bl-[6px] border border-white/12 bg-white/[0.07] text-[#f7f4ee]"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

/**
 * ACT 05: MINATO — Camera arrives at a 3D glass panel where a Minato conversation types in live.
 */
export function MinatoDemo() {
  const secRef = useRef<HTMLElement>(null);
  const [threadIdx, setThreadIdx] = useState(0);
  const [typeProg, setTypeProg] = useState(1);

  const activeThread = THREADS[threadIdx] ?? THREADS[0]!;

  useEffect(() => {
    if (prefersReducedMotion()) {
      setTypeProg(1);
      return;
    }

    return bindScrollProgress(
      secRef.current,
      (p) => {
        // As the camera arrives at the glass panel, type the conversation in from 0 -> 1
        const t = clamp((p - 0.08) / 0.58, 0.15, 1);
        setTypeProg((prev) => (Math.abs(prev - t) < 0.01 ? prev : t));
      },
      { startRatio: 0.88, endRatio: 0.2 },
    );
  }, []);

  const switchThread = (idx: number) => {
    setThreadIdx(idx);
    setTypeProg(1);
  };

  // Slice replies progressively based on typeProg
  const a1Len = Math.ceil(activeThread.a1.length * clamp((typeProg - 0.12) / 0.42, 0, 1));
  const showQ2 = typeProg > 0.56;
  const a2Len = Math.ceil(activeThread.a2.length * clamp((typeProg - 0.62) / 0.36, 0, 1));

  return (
    <section
      id="minato"
      ref={secRef}
      className="relative z-10 px-5 py-24 sm:px-8 sm:py-36"
      aria-labelledby="minato-title"
    >
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-24">
        {/* Left: Translucent 3D Glass Monolith Conversation Panel */}
        <div className="order-2 lg:order-1">
          <div
            className="lp-theatre-panel lp-sq mx-auto w-full max-w-[480px] overflow-hidden rounded-[28px]"
            role="region"
            aria-label="Live conversation with Minato about a trading habit"
          >
            <div className="flex items-center gap-3 border-b border-white/12 px-4 py-3.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/minato-avatar.jpg"
                alt=""
                width={36}
                height={36}
                className="h-9 w-9 rounded-full border border-[#cba76b]/40 object-cover"
              />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-[#f7f4ee]">
                  Minato
                </p>
                <p className="flex items-center gap-1.5 text-[12px] text-[#d6cebd]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#74b08c]" />
                  <span>Your trading companion · Live on Glass</span>
                </p>
              </div>
              <div className="flex gap-1">
                {THREADS.map((th, idx) => (
                  <button
                    key={th.id}
                    type="button"
                    onClick={() => switchThread(idx)}
                    className={`rounded-full px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition ${
                      threadIdx === idx
                        ? "bg-[#cba76b] text-[#231a09] font-semibold"
                        : "bg-white/[0.06] text-[#a69d8c] hover:text-white"
                    }`}
                  >
                    {th.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="min-h-[268px] space-y-3 px-4 py-5">
              <Bubble me>{activeThread.q1}</Bubble>
              <Bubble>
                {activeThread.a1.slice(0, Math.max(18, a1Len))}
                {a1Len < activeThread.a1.length && (
                  <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-[#cba76b] align-middle" />
                )}
              </Bubble>
              {showQ2 && <Bubble me>{activeThread.q2}</Bubble>}
              {showQ2 && (
                <Bubble>
                  {activeThread.a2.slice(0, Math.max(12, a2Len))}
                  {a2Len < activeThread.a2.length && (
                    <span className="ml-1 inline-block h-3.5 w-1.5 animate-pulse bg-[#cba76b] align-middle" />
                  )}
                </Bubble>
              )}
            </div>

            <div className="px-3 pb-3">
              <div className="flex items-center gap-2 rounded-[22px] border border-white/10 bg-black/35 py-1.5 pl-4 pr-1.5">
                <span className="flex-1 text-[14.5px] text-[#a69d8c]">
                  Ask Minato about your journal…
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

        {/* Right: Editorial Copy */}
        <div className="order-1 lg:order-2">
          <div data-theatre-reveal>
            <Eyebrow n="05">Minato · Contextual Companion</Eyebrow>
            <h2
              id="minato-title"
              className="mt-6 font-display text-[clamp(2.3rem,5.4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#f7f4ee]"
            >
              Ask the one who has{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#cba76b]">
                read every entry.
              </span>
            </h2>
          </div>

          <ul className="mt-10 divide-y divide-white/12 border-y border-white/12">
            {POINTS.map((p) => (
              <li key={p.t} className="py-5">
                <p className="font-display text-[clamp(1.2rem,2vw,1.5rem)] font-semibold tracking-[-0.025em] text-[#f7f4ee]">
                  {p.t}
                </p>
                <p className="mt-1.5 max-w-md text-[15.5px] leading-relaxed text-[#d6cebd]">
                  {p.d}
                </p>
              </li>
            ))}
          </ul>

          <Link
            href="/login?mode=signup"
            className="group mt-8 inline-flex items-center gap-1.5 text-[17px] text-[#cba76b] transition-colors hover:text-white"
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

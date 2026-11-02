"use client";

import { useEffect, useRef, useState } from "react";
import { bindScrollProgress, clamp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/** The five questions every reviewed trade answers (the Autopsy), with example answers. */
const QUESTIONS = [
  { q: "Did you follow the plan?", a: "Yes", tone: "text-[#74b08c] bg-[#74b08c]/12 border-[#74b08c]/30" },
  { q: "What were you feeling?", a: "Calm, then rushed", tone: "text-[#cba76b] bg-[#cba76b]/12 border-[#cba76b]/35" },
  { q: "Was it good process, whatever the result?", a: "Process failure", tone: "text-[#cd8484] bg-[#cd8484]/12 border-[#cd8484]/30" },
  { q: "What was the mistake, or the lesson?", a: "Moved the stop early", tone: "text-[#f0eae0] bg-white/[0.06] border-white/15" },
  { q: "What will you watch next time?", a: "The 5m close first", tone: "text-[#f0eae0] bg-white/[0.06] border-white/15" },
] as const;

/**
 * ACT 04: THE GAP — The world splits into Plan vs. Execution and closes as you scroll.
 * Synchronized with the 3D tectonic monoliths in TheatreCanvas.
 */
export function Gap() {
  const secRef = useRef<HTMLElement>(null);
  const leftSplitRef = useRef<HTMLDivElement>(null);
  const rightSplitRef = useRef<HTMLDivElement>(null);
  const [closurePct, setClosurePct] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setClosurePct(100);
      return;
    }

    return bindScrollProgress(
      secRef.current,
      (p) => {
        const closed = smooth(clamp((p - 0.12) / 0.68, 0, 1));
        const splitFactor = 1 - closed;
        const pct = Math.round(closed * 100);
        setClosurePct((prev) => (prev === pct ? prev : pct));

        if (leftSplitRef.current && rightSplitRef.current) {
          const offsetPx = splitFactor * 44;
          leftSplitRef.current.style.transform = `translate3d(${-offsetPx}px, 0, 0) rotate(${-splitFactor * 1.6}deg)`;
          rightSplitRef.current.style.transform = `translate3d(${offsetPx}px, 0, 0) rotate(${splitFactor * 1.6}deg)`;
        }
      },
      { startRatio: 0.85, endRatio: 0.15 },
    );
  }, []);

  const isLocked = closurePct >= 92;

  return (
    <section
      id="gap"
      ref={secRef}
      className="relative z-10 px-5 py-24 sm:px-8 sm:py-36"
      aria-labelledby="gap-title"
    >
      <div className="mx-auto max-w-[1200px]">
        <div data-theatre-reveal className="max-w-3xl">
          <Eyebrow n="04">The gap · Plan vs. Execution</Eyebrow>
          <h2
            id="gap-title"
            className="mt-6 font-display text-[clamp(2.3rem,5.4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#f7f4ee]"
          >
            A normal journal logs the result.{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#cba76b]">
              Yours should log the decision.
            </span>
          </h2>
          <p className="mt-5 max-w-2xl text-[clamp(1.05rem,1.45vw,1.22rem)] leading-relaxed text-[#d6cebd]">
            Every drawdown lives in the fracture between what you planned in calm and what you executed in noise. Scroll to close the gap between intention and action.
          </p>
        </div>

        {/* Interactive Split-World Comparison Bar that physically converges on scroll */}
        <div className="mt-10 grid items-stretch gap-4 md:grid-cols-2">
          <div
            ref={leftSplitRef}
            className="lp-theatre-panel lp-sq rounded-[26px] border-l-4 border-l-[#cba76b] p-6 will-change-transform sm:p-7"
          >
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-[#cba76b]">
              <span>Left Monolith · 08:45 AM Plan</span>
              <span>Written in Calm</span>
            </div>
            <p className="mt-3 font-serif text-[22px] italic leading-snug text-[#f7f4ee]">
              &ldquo;Wait for the 5-minute reclaim above overnight low. Risk 0.5R with stop beneath the wick.&rdquo;
            </p>
            <p className="mt-3 font-mono text-[12px] text-[#a69d8c]">
              The usual spreadsheet only records: <span className="text-[#cd8484]">04 Mar · MNQ · Long · −$140</span>
            </p>
          </div>

          <div
            ref={rightSplitRef}
            className="lp-theatre-panel lp-sq rounded-[26px] border-r-4 border-r-[#74b08c] p-6 will-change-transform sm:p-7"
          >
            <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em]">
              <span className={isLocked ? "text-[#74b08c]" : "text-[#cd8484]"}>
                Right Monolith · 09:38 AM Execution
              </span>
              <span className="rounded-full border border-white/15 bg-white/[0.06] px-2.5 py-0.5 text-[10.5px] text-[#f0eae0]">
                Alignment: {closurePct}%
              </span>
            </div>
            <p className="mt-3 font-display text-[17px] font-medium leading-snug text-[#f7f4ee]">
              {isLocked
                ? "Gap closed: Autopsy named the early stop move and scheduled a Time Machine drill so the mistake is retired."
                : "Impulse drift: Entered on the 5m close, but dragged the stop to breakeven prematurely out of fear."}
            </p>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#cd8484] via-[#cba76b] to-[#74b08c] transition-all duration-150"
                style={{ width: `${closurePct}%` }}
              />
            </div>
          </div>
        </div>

        {/* The 5-Question Autopsy Ledger */}
        <div className="lp-theatre-panel lp-sq relative mt-8 overflow-hidden rounded-[28px]">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-12 w-px bg-[#cd8484]/30 sm:left-16"
          />
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-3.5 pl-16 sm:px-6 sm:pl-20">
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#cba76b]">
              An Edgebook 5-Question Autopsy
            </p>
            <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#a69d8c]">
              {isLocked ? "✓ Gap Bridged" : "Scroll to Converge"}
            </p>
          </div>
          <ol>
            {QUESTIONS.map((x, i) => (
              <li
                key={x.q}
                className="grid grid-cols-[2.75rem_1fr] items-center gap-x-4 border-b border-white/10 py-5 pr-5 last:border-b-0 sm:grid-cols-[3.75rem_1fr_auto] sm:pr-6"
              >
                <span className="pl-4 font-mono text-[13px] text-[#cba76b] sm:pl-6">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="pl-2 font-display text-[clamp(1.05rem,1.8vw,1.3rem)] font-semibold leading-snug tracking-[-0.02em] text-[#f7f4ee] sm:pl-4">
                  {x.q}
                </p>
                <span
                  className={`col-start-2 mt-2 w-fit rounded-full border px-3 py-1 text-[12.5px] font-medium sm:col-start-3 sm:mt-0 ${x.tone}`}
                >
                  {x.a}
                </span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}

"use client";

import { useEffect, useRef, useState } from "react";
import {
  bindScrollProgress,
  clamp,
  lerp,
  prefersReducedMotion,
  rangeProgress,
  smooth,
} from "./motion-utils";
import { Eyebrow } from "./ledger";

interface AutopsyQuestion {
  q: string;
  a: string;
  tone: string;
  insight: string;
  metric: string;
}

const QUESTIONS: AutopsyQuestion[] = [
  {
    q: "Did you follow the plan?",
    a: "Yes — Entry matched thesis",
    tone: "text-profit bg-profit/10 border-profit/25",
    insight: "Overnight low swept at 09:32 NY and reclaimed on the 5-minute close before entry.",
    metric: "Entry Discipline: 100%",
  },
  {
    q: "What were you feeling?",
    a: "Calm, then rushed",
    tone: "text-gold bg-gold/10 border-gold/30",
    insight: "Heart rate and urgency spiked 4 minutes after entry when a single red 1-minute candle printed.",
    metric: "Emotional Shift @ 09:39",
  },
  {
    q: "Was it good process, whatever the result?",
    a: "Process failure on exit",
    tone: "text-loss bg-loss/10 border-loss/25",
    insight: "Even if a trade makes or loses money, breaking your exit rule is logged as a process break.",
    metric: "Exit Rule Broken",
  },
  {
    q: "What was the mistake, or the lesson?",
    a: "Moved the stop early",
    tone: "text-ink bg-ink/[0.05] border-line-strong",
    insight: "Choked the stop to breakeven out of fear of giveback; price tapped the stop and ran +3.2R to target.",
    metric: "Cost of Fear: −3.2R",
  },
  {
    q: "What will you watch next time?",
    a: "The 5m close first",
    tone: "text-profit bg-profit/10 border-profit/25",
    insight: "Queued into your evening Time Machine practice feed until early-exit interference drops to zero.",
    metric: "Queued for Practice",
  },
];

/**
 * CHAPTER 04A — THE GAP (#gap)
 * Full-width widescreen desktop game layout (.lp-wide) contrasting a shallow
 * P&L spreadsheet row against an interactive 5-Question Autopsy X-Ray Scanner.
 */
export function Gap() {
  const secRef = useRef<HTMLElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  const [scannedIdx, setScannedIdx] = useState(3);
  const [manualScan, setManualScan] = useState<number | null>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        if (cardRef.current) {
          const lift = smooth(rangeProgress(p, 0.0, 0.35));
          const y = lerp(24, 0, lift);
          const scale = lerp(0.965, 1, lift);
          cardRef.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        }

        rowRefs.current.forEach((row, idx) => {
          if (!row) return;
          const start = 0.06 + idx * 0.14;
          const rowP = smooth(rangeProgress(p, start, start + 0.24));
          row.style.opacity = String(lerp(0.28, 1, rowP));
          row.style.transform = `translate3d(${lerp(16, 0, rowP).toFixed(1)}px, 0, 0)`;
        });

        if (manualScan === null) {
          const autoIdx = Math.min(4, Math.floor(clamp(p, 0, 0.999) * 5));
          setScannedIdx((prev) => (prev === autoIdx ? prev : autoIdx));
        }
      },
      { pinned: true },
    );
  }, [manualScan]);

  const activeQ = QUESTIONS[scannedIdx] ?? QUESTIONS[0]!;

  return (
    <section
      id="gap"
      ref={secRef}
      className="lp-gap-pin relative w-full py-20 lg:py-0"
      aria-labelledby="gap-title"
    >
      <div className="lg:sticky lg:top-0 lg:flex lg:min-h-svh lg:w-full lg:flex-col lg:justify-center">
        <div className="lp-wide grid w-full items-stretch gap-8 lg:grid-cols-12 xl:gap-10">
          {/* LEFT 5 COLS: Headline + Shallow Spreadsheet vs. X-Ray Diagnostic Cartoon */}
          <div className="flex flex-col justify-between lg:col-span-5">
            <div>
              <div data-scrub-reveal>
                <Eyebrow n="04">CH.04 · The Autopsy X-Ray</Eyebrow>
                <h2
                  id="gap-title"
                  className="mt-5 font-display text-[clamp(2.1rem,4.4vw,3.8rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
                >
                  A normal journal logs the result.{" "}
                  <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                    Yours should log the decision.
                  </span>
                </h2>
              </div>

              <p className="mt-4 text-[15.5px] leading-relaxed text-muted">
                A row of date, symbol and P&amp;L can&apos;t tell you why you moved the stop. A winning trade with broken rules is still a process failure. A losing trade with clean rules is a valid loss.
              </p>

              {/* Visual X-Ray Comparison: Normal Spreadsheet vs. Edgebook Mind Scan */}
              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-dashed border-line-strong bg-surface/65 p-4">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                    <span>The Usual Spreadsheet</span>
                    <span className="text-loss">Blind</span>
                  </div>
                  <p className="mt-2 font-mono text-[13px] font-medium text-muted">
                    04 Mar · MNQ · Long · −$140
                  </p>
                  <p className="mt-1.5 text-[12.5px] text-faint">
                    Zero record of what you planned, felt, or broke.
                  </p>
                </div>

                <div className="rounded-2xl border border-gold/40 bg-raised p-4 shadow-[var(--shadow-rest)]">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                    <span>Edgebook X-Ray</span>
                    <span className="text-profit">{activeQ.metric}</span>
                  </div>
                  <p className="mt-2 text-[13px] font-semibold text-ink">
                    {activeQ.a}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-muted">
                    {activeQ.insight}
                  </p>
                </div>
              </div>
            </div>

            {/* Philosophical Quote Card */}
            <blockquote className="mt-6 rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-rest)]">
              <p className="font-serif text-[19px] italic leading-snug text-ink">
                &ldquo;An unexamined trade is a tuition fee paid for nothing. Name the mistake once so you never pay for it twice.&rdquo;
              </p>
              <footer className="mt-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-gold">
                — The Edgebook Autopsy Principle
              </footer>
            </blockquote>
          </div>

          {/* RIGHT 7 COLS: Interactive 5-Question Autopsy Scanner Ledger */}
          <div
            ref={cardRef}
            className="lp-sq relative flex flex-col justify-between overflow-hidden rounded-[32px] border border-line-strong/80 bg-surface shadow-[var(--shadow-overlay)] will-change-transform lg:col-span-7"
          >
            {/* The ledger's red margin rule */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-12 w-px bg-loss/25 sm:left-16"
            />
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-5 py-4 pl-16 sm:px-6 sm:pl-20">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-gold">
                Interactive 5-Question Autopsy · Click or Scroll to Scan
              </p>
              <span className="rounded-full border border-profit/30 bg-profit/10 px-3 py-0.5 font-mono text-[10.5px] font-medium text-profit">
                Scanning Node 0{scannedIdx + 1} of 05
              </span>
            </div>

            <ol className="divide-y divide-line">
              {QUESTIONS.map((x, i) => {
                const isScanned = i === scannedIdx;
                return (
                  <li
                    key={x.q}
                    ref={(el) => {
                      rowRefs.current[i] = el;
                    }}
                    onClick={() => {
                      setManualScan(i);
                      setScannedIdx(i);
                    }}
                    onMouseEnter={() => setScannedIdx(i)}
                    className={`cursor-pointer py-4 pr-5 transition-colors duration-150 sm:pr-6 ${
                      isScanned ? "bg-gold/[0.06]" : "hover:bg-ink/[0.02]"
                    }`}
                  >
                    <div className="grid grid-cols-[2.75rem_1fr] items-center gap-x-4 sm:grid-cols-[3.75rem_1fr_auto]">
                      <span
                        className={`pl-4 font-mono text-[13px] sm:pl-6 ${
                          isScanned ? "font-bold text-gold" : "text-faint"
                        }`}
                      >
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <p className="pl-2 font-display text-[clamp(1.05rem,1.6vw,1.25rem)] font-semibold leading-snug tracking-[-0.02em] text-ink sm:pl-4">
                          {x.q}
                        </p>
                        {isScanned && (
                          <p className="mt-1 pl-2 text-[13px] leading-snug text-muted sm:pl-4">
                            {x.insight}
                          </p>
                        )}
                      </div>
                      <span
                        className={`col-start-2 mt-2 w-fit rounded-full border px-3 py-1 text-[12px] font-medium sm:col-start-3 sm:mt-0 ${x.tone}`}
                      >
                        {x.a}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="flex items-center justify-between border-t border-line bg-canvas/60 px-5 py-3.5 pl-16 text-[12.5px] text-muted sm:px-6 sm:pl-20">
              <span>Diagnostic output: <strong className="font-medium text-ink">{activeQ.metric}</strong></span>
              <span className="font-mono text-[11px] uppercase tracking-[0.1em] text-gold">
                Indexed for Minato AI →
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

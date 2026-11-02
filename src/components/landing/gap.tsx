"use client";

import { useEffect, useRef } from "react";
import {
  bindScrollProgress,
  lerp,
  prefersReducedMotion,
  rangeProgress,
  smooth,
} from "./motion-utils";
import { Eyebrow } from "./ledger";

/** The five questions every reviewed trade answers (the Autopsy), with example answers. */
const QUESTIONS = [
  { q: "Did you follow the plan?", a: "Yes", tone: "text-profit bg-profit/10 border-profit/25" },
  { q: "What were you feeling?", a: "Calm, then rushed", tone: "text-gold bg-gold/10 border-gold/30" },
  { q: "Was it good process, whatever the result?", a: "Process failure", tone: "text-loss bg-loss/10 border-loss/25" },
  { q: "What was the mistake, or the lesson?", a: "Moved the stop early", tone: "text-ink bg-ink/[0.05] border-line-strong" },
  { q: "What will you watch next time?", a: "The 5m close first", tone: "text-ink bg-ink/[0.05] border-line-strong" },
] as const;

/**
 * SCENE 04A — THE GAP (#gap)
 * Scroll-scrubbed pinned scene contrasting a normal P&L row ("The usual line")
 * against the 5-Question Edgebook Autopsy. Scrolling forward unfolds and illuminates
 * each question along the red archival margin rule; scrolling backward reverses it.
 */
export function Gap() {
  const secRef = useRef<HTMLElement>(null);
  const usualRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        // As scroll progresses, "The usual line" recedes slightly while the 5-Question Autopsy unfolds
        if (usualRef.current) {
          const recede = smooth(rangeProgress(p, 0.15, 0.7));
          usualRef.current.style.opacity = String(lerp(1, 0.58, recede));
          usualRef.current.style.transform = `scale(${lerp(1, 0.975, recede).toFixed(4)})`;
        }

        if (cardRef.current) {
          const lift = smooth(rangeProgress(p, 0.0, 0.35));
          const y = lerp(24, 0, lift);
          const scale = lerp(0.955, 1, lift);
          cardRef.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        }

        rowRefs.current.forEach((row, idx) => {
          if (!row) return;
          const start = 0.08 + idx * 0.14;
          const rowP = smooth(rangeProgress(p, start, start + 0.24));
          row.style.opacity = String(lerp(0.22, 1, rowP));
          row.style.transform = `translate3d(${lerp(18, 0, rowP).toFixed(1)}px, 0, 0)`;
        });
      },
      { pinned: true },
    );
  }, []);

  return (
    <section
      id="gap"
      ref={secRef}
      className="lp-gap-pin relative px-5 py-20 sm:px-8 lg:py-0"
      aria-labelledby="gap-title"
    >
      <div className="lg:sticky lg:top-0 lg:flex lg:min-h-svh lg:flex-col lg:justify-center">
        <div className="mx-auto grid w-full max-w-[1200px] items-center gap-12 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
          <div>
            <div data-scrub-reveal>
              <Eyebrow n="04">Scene IV · The gap</Eyebrow>
              <h2
                id="gap-title"
                className="mt-6 font-display text-[clamp(2.3rem,5.4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
              >
                A normal journal logs the result.{" "}
                <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                  Yours should log the decision.
                </span>
              </h2>
            </div>

            <p className="mt-6 max-w-md text-[clamp(1.05rem,1.5vw,1.25rem)] leading-snug text-muted">
              A row of date, symbol and P&amp;L can&apos;t tell you why you moved the stop. A winning trade with broken rules is still a process failure. A losing trade with clean rules is a valid loss.
            </p>

            <div
              ref={usualRef}
              className="mt-8 max-w-md rounded-2xl border border-dashed border-line-strong bg-surface/60 px-4 py-3.5 transition-transform duration-150 will-change-transform"
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                The usual line
              </p>
              <p className="mt-1.5 font-mono text-[13px] text-muted">
                04 Mar · MNQ · Long · −$140
              </p>
              <p className="mt-1 text-[13px] text-faint">
                …and that is all it says.
              </p>
            </div>
          </div>

          <div
            ref={cardRef}
            className="lp-sq relative overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface shadow-[var(--shadow-overlay)] will-change-transform"
          >
            {/* The ledger's red margin rule */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-12 w-px bg-loss/25 sm:left-16"
            />
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5 pl-16 sm:px-6 sm:pl-20">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                An Edgebook entry
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                Sample answers
              </p>
            </div>
            <ol>
              {QUESTIONS.map((x, i) => (
                <li
                  key={x.q}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className="grid grid-cols-[2.75rem_1fr] items-center gap-x-4 border-b border-line py-5 pr-5 transition-opacity duration-150 last:border-b-0 sm:grid-cols-[3.75rem_1fr_auto] sm:pr-6"
                >
                  <span className="pl-4 font-mono text-[13px] text-gold sm:pl-6">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <p className="pl-2 font-display text-[clamp(1.05rem,1.8vw,1.3rem)] font-semibold leading-snug tracking-[-0.02em] text-ink sm:pl-4">
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
      </div>
    </section>
  );
}

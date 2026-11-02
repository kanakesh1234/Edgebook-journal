"use client";

import { useEffect, useRef } from "react";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/** The five questions every reviewed trade answers (the Autopsy), with example answers. */
const QUESTIONS = [
  { q: "Did you follow the plan?", a: "Yes", tone: "text-profit bg-profit/10 border-profit/25" },
  { q: "What were you feeling?", a: "Calm, then rushed", tone: "text-gold bg-gold/10 border-gold/30" },
  { q: "Was it good process, whatever the result?", a: "Process failure", tone: "text-loss bg-loss/10 border-loss/25" },
  { q: "What was the mistake, or the lesson?", a: "Moved the stop early", tone: "text-ink bg-ink/[0.05] border-line-strong" },
  { q: "What will you watch next time?", a: "The 5m close first", tone: "text-ink bg-ink/[0.05] border-line-strong" },
] as const;

export function Gap() {
  const secRef = useRef<HTMLElement>(null);
  const ledgerRef = useRef<HTMLDivElement>(null);
  const redRuleRef = useRef<HTMLSpanElement>(null);
  const rowRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const sec = secRef.current;
    if (!sec) return;

    return bindScrollProgress(
      sec,
      (p) => {
        const e = smooth(clamp(p * 1.3, 0, 1));
        if (ledgerRef.current) {
          const rotX = lerp(12, 0, e);
          const rotY = lerp(-6, 0, e);
          const scale = lerp(0.93, 1.0, e);
          ledgerRef.current.style.transform = `perspective(1600px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        }
        if (redRuleRef.current) {
          redRuleRef.current.style.transform = `scaleY(${clamp(p * 1.4, 0.05, 1)})`;
        }
        rowRefs.current.forEach((row, i) => {
          if (!row) return;
          const rowP = smooth(clamp((p - i * 0.11) * 3.2, 0, 1));
          row.style.opacity = String(lerp(0.2, 1, rowP));
          row.style.transform = `translate3d(${lerp(22, 0, rowP)}px, ${lerp(12, 0, rowP)}px, 0)`;
        });
      },
      { startRatio: 0.9, endRatio: 0.25 },
    );
  }, []);

  return (
    <section id="gap" ref={secRef} className="px-5 py-24 sm:px-8 sm:py-36" aria-labelledby="gap-title">
      <div className="mx-auto grid max-w-[1240px] gap-14 lg:grid-cols-[0.95fr_1.05fr] lg:gap-20">
        <div className="lg:sticky lg:top-28 lg:self-start">
          <Eyebrow n="04">The gap</Eyebrow>
          <h2
            id="gap-title"
            className="mt-6 font-display text-[clamp(2.3rem,5.4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
          >
            A normal journal logs the result.{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              Yours should log the decision.
            </span>
          </h2>
          <p className="mt-6 max-w-md text-[clamp(1.05rem,1.5vw,1.25rem)] leading-snug text-muted">
            A row of date, symbol and P&amp;L can&apos;t tell you why you moved the stop. A winning trade with broken rules is still a process failure. A losing trade with clean rules is a valid loss.
          </p>

          {/* Atmospheric Photographic Study Card */}
          <div className="lp-sq relative mt-8 max-w-md overflow-hidden rounded-[22px] border border-line-strong bg-[#19140f] p-5 text-[#f7f4ee] shadow-lg">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1000&q=80"
              alt=""
              loading="lazy"
              decoding="async"
              onError={(e) => {
                e.currentTarget.style.display = "none";
              }}
              className="absolute inset-0 h-full w-full object-cover opacity-35"
              style={{ filter: "sepia(0.3) contrast(1.1)" }}
            />
            <div className="relative z-10">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-[#dfbe82]">
                The usual spreadsheet line
              </p>
              <p className="mt-1.5 font-mono text-[13.5px] text-[#f0eae0]">
                04 Mar · MNQ · Long · −$140
              </p>
              <p className="mt-2 font-serif text-[17px] italic text-[#d6cebd]">
                &ldquo;…and two weeks later, you make the exact same mistake because nothing about your state of mind was recorded.&rdquo;
              </p>
            </div>
          </div>
        </div>

        <div className="[perspective:1600px]">
          <div
            ref={ledgerRef}
            className="lp-sq relative overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface shadow-[0_48px_110px_-38px_rgba(0,0,0,0.45)] will-change-transform"
          >
            {/* Scroll-drawn archival red margin rule */}
            <span
              ref={redRuleRef}
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-12 w-px origin-top bg-loss/35 sm:left-16"
            />
            <div className="flex items-center justify-between border-b border-line px-5 py-3.5 pl-16 sm:px-6 sm:pl-20">
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-gold">
                An Edgebook Autopsy Entry
              </p>
              <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
                Scroll-Verified Record
              </p>
            </div>
            <ol>
              {QUESTIONS.map((x, i) => (
                <li
                  key={x.q}
                  ref={(el) => {
                    rowRefs.current[i] = el;
                  }}
                  className="grid grid-cols-[2.75rem_1fr] items-center gap-x-4 border-b border-line py-5 pr-5 will-change-transform last:border-b-0 sm:grid-cols-[3.75rem_1fr_auto] sm:pr-6"
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

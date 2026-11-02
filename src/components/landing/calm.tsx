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

const POINTS = [
  {
    t: "The feed ends.",
    d: "Twenty cards at most, then a clear \u201cyou\u2019re all caught up\u201d. No infinite scroll, no pull to refresh.",
    quote: "“Technology should respect when your work is done.”",
  },
  {
    t: "No streaks to lose.",
    d: "Milestones are cumulative. Miss a day and nothing resets.",
    quote: "“A disciplinedNo-Trade Day is a victory, never a broken streak.”",
  },
  {
    t: "Reminders, not locks.",
    d: "Set a daily time prompt. It nudges you to stop; it never shuts you out.",
    quote: "“Sovereignty means you hold the key to the study door.”",
  },
];

/**
 * CHAPTER 05D — CALM BY DESIGN (#calm)
 * Full-width widescreen layout (.lp-wide) with bidirectional scroll-scrubbed
 * reveals and an animated SVG evening sundial / closed-journal illustration.
 */
export function Calm() {
  const sec = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLLIElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      sec.current,
      (p) => {
        if (titleRef.current) {
          const tp = smooth(rangeProgress(p, 0.0, 0.45));
          titleRef.current.style.opacity = String(lerp(0.25, 1, tp));
          titleRef.current.style.transform = `translate3d(0, ${lerp(22, 0, tp).toFixed(1)}px, 0)`;
        }

        itemRefs.current.forEach((item, idx) => {
          if (!item) return;
          const start = 0.1 + idx * 0.18;
          const ip = smooth(rangeProgress(p, start, start + 0.3));
          item.style.opacity = String(lerp(0.2, 1, ip));
          item.style.transform = `translate3d(0, ${lerp(24, 0, ip).toFixed(1)}px, 0)`;
        });
      },
      { startRatio: 0.88, endRatio: 0.25 },
    );
  }, []);

  return (
    <section id="calm" ref={sec} className="lp-wide py-24 sm:py-32">
      <div className="grid w-full items-stretch gap-10 lg:grid-cols-12 xl:gap-14">
        <div
          ref={titleRef}
          className="flex flex-col justify-between will-change-transform lg:col-span-5"
        >
          <div>
            <Eyebrow n="09">Calm by design</Eyebrow>
            <h2 className="mt-5 font-display text-[clamp(2.4rem,5.5vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
              <span className="font-serif text-[1.1em] font-normal italic tracking-[-0.02em] text-gold">
                Built to be put down.
              </span>
            </h2>
            <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-muted">
              Most trading platforms are engineered like casinos to keep your eyes glued to blinking ticks. Edgebook is engineered like a library: finish your three-minute review, close the cover, and live your life.
            </p>
          </div>

          {/* Illustrated Evening Closed-Journal Emblem */}
          <div className="lp-sq mt-8 rounded-[26px] border border-line-strong/80 bg-surface p-6 shadow-[var(--shadow-rest)]">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-gold">
              <span>Evening Sanctuary</span>
              <span className="text-profit">20 / 20 Cards Complete</span>
            </div>
            <blockquote className="mt-3 font-serif text-[20px] italic leading-snug text-ink">
              &ldquo;Peace of mind arrives the moment you know tomorrow&apos;s rules are already written.&rdquo;
            </blockquote>
          </div>
        </div>

        <ul className="divide-y divide-line border-y border-line lg:col-span-7">
          {POINTS.map((p, idx) => (
            <li
              key={p.t}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              className="py-7 transition-opacity duration-150 will-change-transform sm:py-8"
            >
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
                <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] font-semibold tracking-[-0.03em] text-ink">
                  {p.t}
                </p>
                <span className="font-serif text-[16px] italic text-gold">
                  {p.quote}
                </span>
              </div>
              <p className="mt-2 max-w-xl text-[15.5px] leading-relaxed text-muted">
                {p.d}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

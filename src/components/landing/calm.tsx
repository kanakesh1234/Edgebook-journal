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
  },
  {
    t: "No streaks to lose.",
    d: "Milestones are cumulative. Miss a day and nothing resets.",
  },
  {
    t: "Reminders, not locks.",
    d: "Set a daily time prompt. It nudges you to stop; it never shuts you out.",
  },
];

/**
 * SCENE 05D — CALM BY DESIGN (#calm)
 * Bidirectional scroll-scrubbed editorial progression using 100% original tokens.
 */
export function Calm() {
  const sec = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
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
    <section id="calm" ref={sec} className="px-5 py-24 sm:px-8 sm:py-36">
      <div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-24">
        <div className="-mb-6 lg:col-span-2">
          <Eyebrow n="09">Calm by design</Eyebrow>
        </div>
        <h2
          ref={titleRef}
          className="font-display text-[clamp(2.3rem,6vw,4.8rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink will-change-transform"
        >
          <span className="font-serif text-[1.1em] font-normal italic tracking-[-0.02em] text-gold">
            Built to be put down.
          </span>
        </h2>
        <ul className="divide-y divide-line border-y border-line">
          {POINTS.map((p, idx) => (
            <li
              key={p.t}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              className="py-7 transition-opacity duration-150 will-change-transform sm:py-9"
            >
              <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] font-semibold tracking-[-0.03em] text-ink">
                {p.t}
              </p>
              <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-muted">
                {p.d}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

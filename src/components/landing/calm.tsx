"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "./motion-utils";

const POINTS = [
  { t: "The feed ends.", d: "Twenty cards at most, then a clear \u201cyou\u2019re all caught up\u201d. No infinite scroll, no pull to refresh." },
  { t: "No streaks to lose.", d: "Milestones are cumulative. Miss a day and nothing resets." },
  { t: "Reminders, not locks.", d: "Set a daily time prompt. It nudges you to stop; it never shuts you out." },
];

export function Calm() {
  const sec = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.from("[data-row]", {
        opacity: 0,
        y: 36,
        duration: 1,
        ease: "power3.out",
        stagger: 0.14,
        scrollTrigger: { trigger: sec.current, start: "top 62%", once: true },
      });
    }, sec);
    return () => ctx.revert();
  }, []);

  return (
    <section id="calm" ref={sec} className="px-5 py-24 sm:px-8 sm:py-36">
      <div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-24">
        <h2 className="font-display text-[clamp(2.3rem,6vw,4.8rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
          <span className="font-serif text-[1.1em] font-normal italic tracking-[-0.02em] text-gold">Built to be put down.</span>
        </h2>
        <ul className="divide-y divide-line border-y border-line">
          {POINTS.map((p) => (
            <li key={p.t} data-row className="py-7 sm:py-9">
              <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] font-semibold tracking-[-0.03em] text-ink">{p.t}</p>
              <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-muted">{p.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

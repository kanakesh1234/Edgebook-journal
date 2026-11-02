"use client";

import { useEffect, useRef, useState } from "react";
import { prefersReducedMotion } from "./motion-utils";
import { Eyebrow } from "./ledger";

const POINTS = [
  { t: "The feed ends.", d: "Twenty cards at most, then a clear \u201cyou\u2019re all caught up\u201d. No infinite scroll, no pull to refresh." },
  { t: "No streaks to lose.", d: "Milestones are cumulative. Miss a day and nothing resets." },
  { t: "Reminders, not locks.", d: "Set a daily time prompt. It nudges you to stop; it never shuts you out." },
];

export function Calm() {
  const sec = useRef<HTMLElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (prefersReducedMotion()) {
      setVisible(true);
      return;
    }
    const el = sec.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section id="calm" ref={sec} className="px-5 py-24 sm:px-8 sm:py-36">
      <div className="mx-auto grid max-w-[1200px] gap-14 lg:grid-cols-[1fr_1.1fr] lg:gap-24">
        <div className="lg:col-span-2 -mb-6"><Eyebrow n="09">Calm by design</Eyebrow></div>
        <h2 className="font-display text-[clamp(2.3rem,6vw,4.8rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
          <span className="font-serif text-[1.1em] font-normal italic tracking-[-0.02em] text-gold">Built to be put down.</span>
        </h2>
        <ul className="divide-y divide-line border-y border-line">
          {POINTS.map((p, idx) => (
            <li
              key={p.t}
              style={{
                opacity: visible ? 1 : 0,
                transform: visible ? "translate3d(0, 0, 0)" : "translate3d(0, 28px, 0)",
                transition: `opacity 0.75s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.12}s, transform 0.75s cubic-bezier(0.16, 1, 0.3, 1) ${idx * 0.12}s`,
              }}
              className="py-7 sm:py-9"
            >
              <p className="font-display text-[clamp(1.35rem,2.4vw,1.9rem)] font-semibold tracking-[-0.03em] text-ink">{p.t}</p>
              <p className="mt-2 max-w-lg text-[16px] leading-relaxed text-muted">{p.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

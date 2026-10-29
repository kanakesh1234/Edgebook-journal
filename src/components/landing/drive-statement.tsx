"use client";

import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { prefersReducedMotion } from "./motion-utils";

const SENTENCE =
  "Your journal is one file in your own Google Drive. Open it, export it, or walk away with it whenever you like.";

const FACTS = [
  { t: "Sign in with Google", d: "Your journal syncs to a folder only you control." },
  { t: "Prefer to stay local?", d: "Use an email session and keep everything on this device." },
  { t: "Export in one click", d: "Your whole journal as JSON, any time." },
];

/**
 * A quiet pause in the page: the card grows into place on the theme's own
 * surface, then the sentence lights up word by word with the scroll.
 */
export function DriveStatement() {
  const sec = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    gsap.registerPlugin(ScrollTrigger);
    const ctx = gsap.context(() => {
      gsap.fromTo(
        card.current,
        { scale: 0.9, borderRadius: 72 },
        { scale: 1, borderRadius: 44, ease: "none", scrollTrigger: { trigger: sec.current, start: "top 95%", end: "top 25%", scrub: true } },
      );
      const words = text.current!.querySelectorAll("[data-w]");
      gsap.fromTo(
        words,
        { opacity: 0.22 },
        { opacity: 1, ease: "none", stagger: 0.12, scrollTrigger: { trigger: text.current, start: "top 78%", end: "bottom 48%", scrub: true } },
      );
    }, sec);
    return () => ctx.revert();
  }, []);

  return (
    <section id="drive" ref={sec} className="relative px-3 py-10 sm:px-6 sm:py-16">
      <div
        ref={card}
        className="lp-sq relative mx-auto max-w-[1200px] overflow-hidden rounded-[44px] border border-line-strong/70 bg-surface px-6 py-20 text-ink shadow-[var(--shadow-overlay)] will-change-transform sm:px-12 sm:py-28 lg:px-20 lg:py-36"
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 360px at 12% 0%, color-mix(in srgb, var(--gold) 13%, transparent), transparent 70%), radial-gradient(560px 320px at 100% 100%, color-mix(in srgb, var(--profit) 8%, transparent), transparent 70%)",
          }}
        />
        <p
          ref={text}
          className="relative max-w-4xl font-display text-[clamp(1.9rem,4.8vw,4rem)] font-semibold leading-[1.1] tracking-[-0.035em]"
        >
          {SENTENCE.split(" ").map((w, i) => (
            <span key={i} data-w className="inline-block pr-[0.28em]">
              {w}
            </span>
          ))}
        </p>

        {/* the file */}
        <div className="relative mt-14 inline-flex max-w-full items-center gap-3 overflow-x-auto rounded-2xl border border-line bg-raised px-4 py-3 sm:mt-20">
          <svg viewBox="0 0 24 24" className="h-5 w-5 shrink-0 text-gold" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <code className="break-all font-mono text-[12px] text-muted sm:whitespace-nowrap sm:text-sm">EdgeBook / journals / journal.json</code>
        </div>

        <ul className="relative mt-12 grid gap-8 sm:mt-16 md:grid-cols-3 md:gap-10">
          {FACTS.map((f) => (
            <li key={f.t} className="border-t border-line-strong pt-5">
              <p className="text-[17px] font-medium">{f.t}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

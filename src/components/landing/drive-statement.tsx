"use client";

import { useEffect, useRef } from "react";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion } from "./motion-utils";
import { Eyebrow } from "./ledger";

const SENTENCE =
  "Your journal is one file in your own Google Drive. Open it, export it, or walk away with it whenever you like.";

const FACTS = [
  { t: "Sign in with Google", d: "Your journal syncs to a folder only you control." },
  { t: "Prefer to stay local?", d: "Use an email session and keep everything on this device." },
  { t: "Export in one click", d: "Your whole journal as JSON, any time." },
];

/**
 * SCENE 05A — YOUR DRIVE (#drive)
 * A quiet pause in the page: the card grows into place on the theme's own
 * surface (bg-surface), then the sentence lights up word by word with the scroll.
 */
export function DriveStatement() {
  const sec = useRef<HTMLElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLParagraphElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const words = Array.from(text.current?.querySelectorAll<HTMLElement>("[data-w]") ?? []);
    return bindScrollProgress(
      sec.current,
      (p) => {
        const cardProg = clamp(p * 1.35, 0, 1);
        if (card.current) {
          const scale = lerp(0.92, 1, cardProg);
          const radius = Math.round(lerp(64, 44, cardProg));
          card.current.style.transform = `scale(${scale})`;
          card.current.style.borderRadius = `${radius}px`;
        }
        const wordProg = clamp((p - 0.12) / 0.78, 0, 1);
        const total = Math.max(1, words.length);
        words.forEach((w, i) => {
          const threshold = i / total;
          const local = clamp((wordProg - threshold) * 5, 0, 1);
          w.style.opacity = String(lerp(0.24, 1, local));
        });
      },
      { startRatio: 0.92, endRatio: 0.2 },
    );
  }, []);

  return (
    <section id="drive" ref={sec} className="relative px-3 py-10 sm:px-6 sm:py-16">
      <div
        ref={card}
        className="lp-sq relative mx-auto max-w-[1200px] overflow-hidden rounded-[44px] border border-line-strong/70 bg-surface px-6 py-20 text-ink shadow-[var(--shadow-overlay)] will-change-transform sm:px-12 sm:py-28 lg:px-20 lg:py-36"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 360px at 12% 0%, color-mix(in srgb, var(--gold) 13%, transparent), transparent 70%), radial-gradient(560px 320px at 100% 100%, color-mix(in srgb, var(--profit) 8%, transparent), transparent 70%)",
          }}
        />
        <div className="relative mb-8">
          <Eyebrow n="06">Scene V · Your data</Eyebrow>
        </div>
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

        {/* The file */}
        <div className="relative mt-14 inline-flex max-w-full items-center gap-3 overflow-x-auto rounded-2xl border border-line bg-raised px-4 py-3 sm:mt-20">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 text-gold"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <code className="break-all font-mono text-[12px] text-muted sm:whitespace-nowrap sm:text-sm">
            EdgeBook / journals / journal.json
          </code>
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

"use client";

import { useEffect, useRef } from "react";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion } from "./motion-utils";
import { Eyebrow } from "./ledger";

const SENTENCE =
  "Your data stays in your Drive. One plain JSON ledger in a folder only you control—open it, export it, or walk away with it whenever you like.";

const FACTS = [
  { t: "Sign in with Google", d: "Your journal syncs directly to a private folder in your own Google Drive." },
  { t: "Prefer to stay local?", d: "Use a local session and keep every plan and reflection on this device." },
  { t: "Export in one click", d: "Download your entire decision ledger as clean, portable JSON any time." },
];

/**
 * ACT 06: YOUR DRIVE — Data particles stream into a single 3D vault in the WebGL canvas,
 * paired with the word-by-word illuminated sovereignty statement.
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
          const scale = lerp(0.93, 1, cardProg);
          const radius = Math.round(lerp(56, 40, cardProg));
          card.current.style.transform = `scale(${scale})`;
          card.current.style.borderRadius = `${radius}px`;
        }
        const wordProg = clamp((p - 0.1) / 0.72, 0, 1);
        const total = Math.max(1, words.length);
        words.forEach((w, i) => {
          const threshold = i / total;
          const local = clamp((wordProg - threshold) * 5, 0, 1);
          w.style.opacity = String(lerp(0.26, 1, local));
        });
      },
      { startRatio: 0.92, endRatio: 0.2 },
    );
  }, []);

  return (
    <section id="drive" ref={sec} className="relative z-10 px-3 py-14 sm:px-6 sm:py-24">
      <div
        ref={card}
        className="lp-theatre-panel lp-sq relative mx-auto max-w-[1200px] overflow-hidden rounded-[40px] px-6 py-20 will-change-transform sm:px-12 sm:py-28 lg:px-20 lg:py-32"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(720px 360px at 18% 0%, rgba(203, 167, 107, 0.18), transparent 70%), radial-gradient(560px 320px at 92% 100%, rgba(116, 176, 140, 0.14), transparent 70%)",
          }}
        />
        <div className="relative mb-8">
          <Eyebrow n="06">Your Drive · Sovereign Vault</Eyebrow>
        </div>

        <h2 className="sr-only">Your data stays in your Drive</h2>

        <p
          ref={text}
          className="relative max-w-4xl font-display text-[clamp(1.9rem,4.7vw,3.9rem)] font-semibold leading-[1.1] tracking-[-0.035em] text-[#f7f4ee]"
        >
          {SENTENCE.split(" ").map((w, i) => (
            <span
              key={i}
              data-w
              className={`inline-block pr-[0.28em] ${
                i < 6 ? "text-[#cba76b]" : "text-[#f7f4ee]"
              }`}
            >
              {w}
            </span>
          ))}
        </p>

        {/* Vault File Telemetry Badge */}
        <div className="relative mt-12 inline-flex max-w-full flex-wrap items-center gap-3 overflow-x-auto rounded-2xl border border-[#cba76b]/35 bg-[#15120d]/90 px-4 py-3 sm:mt-16">
          <span className="h-2 w-2 rounded-full bg-[#74b08c] animate-pulse" aria-hidden="true" />
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 shrink-0 text-[#cba76b]"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          </svg>
          <code className="break-all font-mono text-[12px] text-[#f0eae0] sm:whitespace-nowrap sm:text-sm">
            EdgeBook / journals / journal.json
          </code>
          <span className="rounded-full bg-[#74b08c]/15 px-2.5 py-0.5 font-mono text-[10.5px] text-[#74b08c]">
            Vault Stream Active
          </span>
        </div>

        <ul className="relative mt-12 grid gap-8 sm:mt-16 md:grid-cols-3 md:gap-10">
          {FACTS.map((f) => (
            <li key={f.t} className="border-t border-white/15 pt-5">
              <p className="text-[17px] font-medium text-[#f7f4ee]">{f.t}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-[#d6cebd]">{f.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

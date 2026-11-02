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
 * CHAPTER 05A — YOUR DRIVE (#drive)
 * Full-width widescreen vault card (.lp-wide) with animated SVG sovereignty diagram,
 * philosophical quote, and word-by-word scroll illumination.
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
          const scale = lerp(0.95, 1, cardProg);
          const radius = Math.round(lerp(56, 36, cardProg));
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
    <section id="drive" ref={sec} className="lp-wide relative py-12 sm:py-16">
      <div
        ref={card}
        className="lp-sq relative w-full overflow-hidden rounded-[36px] border border-line-strong/70 bg-surface px-6 py-16 text-ink shadow-[var(--shadow-overlay)] will-change-transform sm:px-12 sm:py-24 lg:px-16"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(880px 420px at 12% 0%, color-mix(in srgb, var(--gold) 13%, transparent), transparent 70%), radial-gradient(640px 360px at 100% 100%, color-mix(in srgb, var(--profit) 8%, transparent), transparent 70%)",
          }}
        />

        <div className="relative grid items-center gap-10 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <div className="mb-6">
              <Eyebrow n="06">CH.05 · Sovereign Data Vault</Eyebrow>
            </div>
            <p
              ref={text}
              className=" font-display text-[clamp(1.85rem,4.2vw,3.7rem)] font-semibold leading-[1.1] tracking-[-0.035em]"
            >
              {SENTENCE.split(" ").map((w, i) => (
                <span key={i} data-w className="inline-block pr-[0.28em]">
                  {w}
                </span>
              ))}
            </p>

            {/* The file badge + quote */}
            <div className="mt-10 flex flex-wrap items-center gap-4">
              <div className="inline-flex max-w-full items-center gap-3 overflow-x-auto rounded-2xl border border-line bg-raised px-4 py-3 shadow-[var(--shadow-rest)]">
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

              <span className="font-serif text-[18px] italic text-gold">
                &ldquo;Own your words. Own your history. Own your edge.&rdquo;
              </span>
            </div>
          </div>

          {/* Right 4 Cols: Animated SVG Vault Architecture Diagram */}
          <div className="rounded-[24px] border border-line bg-canvas/80 p-5 lg:col-span-4">
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              <span>Zero-Lock Architecture</span>
              <span className="text-profit">● Direct Sync</span>
            </div>
            <svg
              viewBox="0 0 320 140"
              className="w-full"
              role="img"
              aria-label="Direct sync diagram between your browser and your own Google Drive vault"
            >
              <rect x="12" y="34" width="96" height="72" rx="14" fill="var(--color-raised)" stroke="var(--color-line-strong)" strokeWidth="1.5" />
              <text x="60" y="66" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-ink)">
                Your Device
              </text>
              <text x="60" y="84" textAnchor="middle" fontSize="9.5" fill="var(--color-muted)" style={{ fontFamily: "var(--font-mono)" }}>
                IndexedDB Local
              </text>

              <path d="M114 62 H202" stroke="var(--color-gold)" strokeWidth="2" strokeDasharray="5 5" style={{ animation: "dash-flow 1.4s linear infinite" }} />
              <path d="M202 78 H114" stroke="var(--color-profit)" strokeWidth="2" strokeDasharray="5 5" style={{ animation: "dash-flow 1.4s linear infinite" }} />

              <rect x="210" y="34" width="98" height="72" rx="14" fill="var(--color-raised)" stroke="var(--color-gold)" strokeWidth="2" />
              <text x="259" y="66" textAnchor="middle" fontSize="11" fontWeight="600" fill="var(--color-ink)">
                Your Google Drive
              </text>
              <text x="259" y="84" textAnchor="middle" fontSize="9.5" fill="var(--color-gold)" style={{ fontFamily: "var(--font-mono)" }}>
                journal.json
              </text>
            </svg>
          </div>
        </div>

        <ul className="relative mt-12 grid gap-8 border-t border-line pt-8 sm:mt-14 md:grid-cols-3 md:gap-10">
          {FACTS.map((f) => (
            <li key={f.t}>
              <p className="text-[17px] font-medium">{f.t}</p>
              <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{f.d}</p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

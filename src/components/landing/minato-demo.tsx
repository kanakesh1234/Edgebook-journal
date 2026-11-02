"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

const POINTS = [
  { t: "It reads what you wrote.", d: "Journal notes, pre-trade plans, post-session reflections, and practice drills all count." },
  { t: "It remembers the conversation.", d: "Pick up tomorrow where you stopped today—stored in your own Google Drive." },
  { t: "It reviews process, not markets.", d: "No signals, no predictions, no unprompted noise—just a calm mirror for your habits." },
] as const;

export function MinatoDemo() {
  const secRef = useRef<HTMLElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const bubbleRefs = useRef<(HTMLDivElement | null)[]>([]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const sec = secRef.current;
    if (!sec) return;

    return bindScrollProgress(
      sec,
      (p) => {
        const e = smooth(clamp(p * 1.25, 0, 1));
        if (stageRef.current) {
          const rotX = lerp(12, 0, e);
          const rotY = lerp(8, 0, e);
          const scale = lerp(0.92, 1.0, e);
          stageRef.current.style.transform = `perspective(1600px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        }
        bubbleRefs.current.forEach((b, idx) => {
          if (!b) return;
          const bp = smooth(clamp((p - idx * 0.14) * 3.2, 0, 1));
          b.style.opacity = String(lerp(0.15, 1, bp));
          b.style.transform = `translate3d(0, ${lerp(18, 0, bp)}px, 0) scale(${lerp(0.96, 1, bp)})`;
        });
      },
      { startRatio: 0.9, endRatio: 0.25 },
    );
  }, []);

  return (
    <section id="minato" ref={secRef} className="px-5 py-24 sm:px-8 sm:py-36" aria-labelledby="minato-title">
      <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-[1.08fr_0.92fr] lg:gap-20">
        {/* Left: 3D Cinema-Framed Minato Companion Stage */}
        <div className="order-2 [perspective:1600px] lg:order-1">
          <div
            ref={stageRef}
            className="lp-sq relative mx-auto w-full max-w-[540px] overflow-hidden rounded-[32px] border border-line-strong/80 bg-[#16120d] p-4 shadow-[0_54px_120px_-42px_rgba(0,0,0,0.65)] will-change-transform sm:p-6"
          >
            {/* Atmospheric Warm Studio Video & Photo Backdrop behind the Glass Card */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-50"
              style={{ backgroundImage: "url(/landing/act-4-mirror.jpg)" }}
              aria-hidden
            />
            <video
              src="https://assets.mixkit.co/videos/preview/mixkit-turning-pages-of-an-old-book-42868-large.mp4"
              poster="/landing/act-4-mirror.jpg"
              muted
              loop
              autoPlay
              playsInline
              preload="metadata"
              className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-35 mix-blend-screen"
            />
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(480px 300px at 50% 0%, rgba(203,167,107,0.22), transparent 72%)",
              }}
            />

            {/* Floating Translucent Minato Window */}
            <div
              className="lp-sq relative z-10 overflow-hidden rounded-[24px] border border-line-strong/80 bg-surface/95 shadow-2xl backdrop-blur-2xl"
              role="img"
              aria-label="Sample conversation with Minato about a trading habit"
            >
              <div className="flex items-center gap-3 border-b border-line px-4 py-3.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/minato-avatar.jpg" alt="" width={36} height={36} className="h-9 w-9 rounded-full object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold leading-tight tracking-[-0.01em] text-ink">Minato</p>
                  <p className="flex items-center gap-1.5 text-[12px] text-muted">
                    <span className="h-1.5 w-1.5 rounded-full bg-profit" />
                    Your trading companion
                  </p>
                </div>
                <span className="rounded-full bg-gold/12 px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-[0.1em] text-gold">
                  Live Memory
                </span>
              </div>

              <div className="space-y-3 px-4 py-5">
                <div
                  ref={(el) => {
                    bubbleRefs.current[0] = el;
                  }}
                  className="flex justify-end will-change-transform"
                >
                  <p className="max-w-[86%] rounded-[20px] rounded-br-[6px] bg-ink px-3.5 py-2.5 text-[14px] leading-[1.45] text-canvas">
                    Good morning Minato. Why do I keep giving back my Friday gains?
                  </p>
                </div>

                <div
                  ref={(el) => {
                    bubbleRefs.current[1] = el;
                  }}
                  className="flex justify-start will-change-transform"
                >
                  <p className="max-w-[88%] rounded-[20px] rounded-bl-[6px] border border-line bg-raised px-3.5 py-2.5 text-[14px] leading-[1.5] text-ink">
                    Good morning, Nandigam. You tend to take a second trade right after a green one on Fridays, and your notes in those entries mention feeling &ldquo;ahead&rdquo;. A simple rule will protect your week: on Fridays, walk away after your first clean winner.
                  </p>
                </div>

                <div
                  ref={(el) => {
                    bubbleRefs.current[2] = el;
                  }}
                  className="flex justify-end will-change-transform"
                >
                  <p className="max-w-[86%] rounded-[20px] rounded-br-[6px] bg-ink px-3.5 py-2.5 text-[14px] leading-[1.45] text-canvas">
                    Remind me of that before I plan my trade tomorrow.
                  </p>
                </div>

                <div
                  ref={(el) => {
                    bubbleRefs.current[3] = el;
                  }}
                  className="flex justify-start will-change-transform"
                >
                  <p className="max-w-[88%] rounded-[20px] rounded-bl-[6px] border border-gold/30 bg-gold/10 px-3.5 py-2.5 text-[14px] leading-[1.5] text-ink">
                    Saved. I&apos;ll surface that reminder the moment you open your pre-session plan tomorrow morning.
                  </p>
                </div>
              </div>

              <div className="px-3 pb-3">
                <div className="flex items-center gap-2 rounded-[22px] bg-ink/[0.06] py-1.5 pl-4 pr-1.5">
                  <span className="flex-1 text-[15px] text-faint">Ask Minato…</span>
                  <span className="grid h-8 w-8 place-items-center rounded-full bg-gold-strong text-on-gold" aria-hidden>
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 19V5M5 12l7-7 7 7" />
                    </svg>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right: Editorial Explanation */}
        <div className="order-1 lg:order-2">
          <Eyebrow n="05">Minato</Eyebrow>
          <h2
            id="minato-title"
            className="mt-6 font-display text-[clamp(2.3rem,5.4vw,4.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
          >
            Ask the one who has{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              read every entry.
            </span>
          </h2>
          <ul className="mt-10 divide-y divide-line border-y border-line">
            {POINTS.map((p) => (
              <li key={p.t} className="py-5">
                <p className="font-display text-[clamp(1.2rem,2vw,1.5rem)] font-semibold tracking-[-0.025em] text-ink">
                  {p.t}
                </p>
                <p className="mt-1.5 max-w-md text-[15.5px] leading-relaxed text-muted">{p.d}</p>
              </li>
            ))}
          </ul>
          <Link
            href="/login?mode=signup"
            className="group mt-8 inline-flex items-center gap-1 text-[17px] text-gold transition-colors hover:text-ink"
          >
            Meet Minato
            <svg viewBox="0 0 24 24" className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="m9 6 6 6-6 6" />
            </svg>
          </Link>
        </div>
      </div>
    </section>
  );
}

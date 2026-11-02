"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { bindScrollProgress, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Wordmark } from "./logo";
import { Eyebrow } from "./ledger";

/**
 * CHAPTER 06 — THE INVITATION (FinalCta & SiteFooter)
 * Full-width widescreen closing composition (.lp-wide) with scroll-scrubbed focal lift.
 */
export function FinalCta() {
  const secRef = useRef<HTMLElement>(null);
  const innerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    return bindScrollProgress(
      secRef.current,
      (p) => {
        if (!innerRef.current) return;
        const s = smooth(p);
        const y = lerp(32, 0, s);
        const scale = lerp(0.95, 1, s);
        innerRef.current.style.opacity = String(lerp(0.25, 1, s));
        innerRef.current.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
      },
      { startRatio: 0.9, endRatio: 0.35 },
    );
  }, []);

  return (
    <section
      id="finale"
      ref={secRef}
      className="lp-wide relative pb-24 pt-16 text-center sm:pb-32 sm:pt-24"
      aria-label="Get started"
    >
      <div
        ref={innerRef}
        className="lp-sq relative w-full overflow-hidden rounded-[40px] border border-line-strong/80 bg-surface px-6 py-20 shadow-[var(--shadow-overlay)] will-change-transform sm:px-14 sm:py-28"
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(840px 420px at 50% 0%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 72%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="mb-6 flex justify-center">
            <Eyebrow n="10">CH.06 · The Invitation</Eyebrow>
          </div>

          <h2 className="font-display text-[clamp(2.5rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
            Your edge deserves{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              a&nbsp;ledger.
            </span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-[clamp(1.05rem,1.6vw,1.28rem)] leading-snug text-muted">
            Start with today&apos;s session. Sign in with Google, or keep it on this device. Export everything whenever you like.
          </p>

          <blockquote className="mx-auto mt-6 max-w-lg font-serif text-[19px] italic text-gold">
            &ldquo;Discipline is choosing between what you want right now and what you want most.&rdquo;
          </blockquote>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex h-12 items-center rounded-full bg-gold-strong px-8 text-[17px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
            >
              Create your journal
            </Link>
            <Link
              href="/login"
              className="group inline-flex items-center gap-1 text-[17px] text-gold transition-colors hover:text-ink"
            >
              Log in
              <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

const CONTACT_EMAIL = "kanakesh939264@gmail.com";

/** Full-width in-flow footer: contact, links and a one-line disclaimer. */
export function SiteFooter() {
  return (
    <footer id="contact" className="lp-wide border-t border-line bg-canvas pb-24 pt-14 sm:pb-20 sm:pt-16">
      <div className="grid w-full gap-12 md:grid-cols-[1.2fr_1fr] md:gap-16">
        <div>
          <h2 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-[-0.035em] text-ink">
            Contact us
          </h2>
          <p className="mt-2 max-w-sm text-[15px] leading-snug text-muted">
            Questions or feedback? We read every message.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Edgebook`}
            className="group mt-5 inline-flex h-11 items-center gap-2.5 rounded-full border border-line-strong bg-raised px-5 text-[14.5px] font-medium text-ink transition-[background-color,border-color,transform] duration-200 hover:border-gold/60 hover:bg-ink/[0.04] active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[17px] w-[17px] text-gold transition-transform duration-300 group-hover:-rotate-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7.5 8 6 8-6" />
            </svg>
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="flex flex-col gap-8 md:items-end">
          <Wordmark />
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-7 gap-y-3 text-[14px] text-muted md:justify-end"
          >
            <a href="#film" className="transition-colors hover:text-ink">
              The Inner Film
            </a>
            <a href="#how" className="transition-colors hover:text-ink">
              Daily Ritual
            </a>
            <a href="#gap" className="transition-colors hover:text-ink">
              The Gap
            </a>
            <a href="#minato" className="transition-colors hover:text-ink">
              Minato
            </a>
            <a href="#drive" className="transition-colors hover:text-ink">
              Your Drive
            </a>
            <a href="#toolkit" className="transition-colors hover:text-ink">
              Toolkit
            </a>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/login" className="transition-colors hover:text-ink">
              Log in
            </Link>
          </nav>
        </div>
      </div>

      <div className="mt-12 w-full border-t border-line pt-6 text-[12.5px] leading-relaxed text-faint">
        <p>
          Edgebook is for educational and journaling purposes only. It is not financial advice, and trading involves risk.
        </p>
        <p className="mt-1">&copy; {new Date().getFullYear()} Edgebook</p>
      </div>
    </footer>
  );
}

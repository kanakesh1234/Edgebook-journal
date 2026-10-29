"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Wordmark } from "./logo";

export function FinalCta() {
  return (
    <section className="relative px-5 pb-20 pt-20 text-center sm:px-8 sm:pb-28 sm:pt-28" aria-label="Get started">
      <h2 className="mx-auto max-w-4xl font-display text-[clamp(2.4rem,7vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
        Your edge deserves{" "}
        <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">a&nbsp;ledger.</span>
      </h2>
      <p className="mx-auto mt-6 max-w-xl text-[clamp(1.05rem,1.6vw,1.3rem)] leading-snug text-muted">
        Start with today&apos;s session. In a month you&apos;ll have something most traders never build: evidence.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
        <Link
          href="/login?mode=signup"
          className="inline-flex h-12 items-center rounded-full bg-gold-strong px-8 text-[17px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
        >
          Create your journal
        </Link>
        <Link href="/login" className="group inline-flex items-center gap-1 text-[17px] text-gold transition-colors hover:text-ink">
          Log in
          <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
        </Link>
      </div>
    </section>
  );
}

const CONTACT_EMAIL = "kanakesh939264@gmail.com";

/** Plain, in-flow footer: contact, links and a one-line disclaimer. No fixed layers, no extra scroll. */
export function SiteFooter() {
  return (
    <footer id="contact" className="border-t border-line bg-canvas px-5 py-14 sm:px-8 sm:py-16">
      <div className="mx-auto grid w-full max-w-[1200px] gap-12 md:grid-cols-[1.2fr_1fr] md:gap-16">
        <div>
          <h2 className="font-display text-[clamp(1.6rem,3vw,2.2rem)] font-semibold tracking-[-0.035em] text-ink">Contact us</h2>
          <p className="mt-2 max-w-sm text-[15px] leading-snug text-muted">Questions or feedback? We read every message.</p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Edgebook`}
            className="group mt-5 inline-flex h-11 items-center gap-2.5 rounded-full border border-line-strong bg-raised px-5 text-[14.5px] font-medium text-ink transition-[background-color,border-color,transform] duration-200 hover:border-gold/60 hover:bg-ink/[0.04] active:scale-[0.98]"
          >
            <svg viewBox="0 0 24 24" className="h-[17px] w-[17px] text-gold transition-transform duration-300 group-hover:-rotate-6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7.5 8 6 8-6" />
            </svg>
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="flex flex-col gap-8 md:items-end">
          <Wordmark />
          <nav aria-label="Footer" className="flex flex-wrap gap-x-7 gap-y-3 text-[14px] text-muted md:justify-end">
            <a href="#how" className="transition-colors hover:text-ink">How it works</a>
            <a href="#toolkit" className="transition-colors hover:text-ink">Toolkit</a>
            <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
            <Link href="/login" className="transition-colors hover:text-ink">Log in</Link>
          </nav>
        </div>
      </div>

      <div className="mx-auto mt-12 w-full max-w-[1200px] border-t border-line pt-6 text-[12.5px] leading-relaxed text-faint">
        <p>Edgebook is for educational and journaling purposes only. It is not financial advice, and trading involves risk.</p>
        <p className="mt-1">&copy; {new Date().getFullYear()} Edgebook</p>
      </div>
    </footer>
  );
}

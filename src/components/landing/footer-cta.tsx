"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Wordmark } from "./logo";

export function FinalCta() {
  return (
    <section className="relative px-5 pb-28 pt-24 text-center sm:px-8 sm:pb-36 sm:pt-32" aria-label="Get started">
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

/**
 * Curtain footer: fixed behind the page, uncovered as the last section lifts away.
 * Height is --lp-foot (landing.css); the page wrapper reserves the same space.
 */
export function SiteFooter() {
  return (
    <footer className="fixed inset-x-0 bottom-0 z-0 flex h-[var(--lp-foot)] flex-col justify-between overflow-hidden bg-surface px-5 pb-7 pt-12 sm:px-8">
      <div className="mx-auto flex w-full max-w-[1200px] flex-wrap items-start justify-between gap-6">
        <Wordmark />
        <nav aria-label="Footer" className="flex flex-wrap gap-x-8 gap-y-3 text-[14px] text-muted">
          <a href="#how" className="transition-colors hover:text-ink">How it works</a>
          <a href="#toolkit" className="transition-colors hover:text-ink">Toolkit</a>
          <Link href="/privacy" className="transition-colors hover:text-ink">Privacy</Link>
          <Link href="/login" className="transition-colors hover:text-ink">Log in</Link>
        </nav>
      </div>
      <div className="mx-auto w-full max-w-[1200px]">
        <p
          aria-hidden
          className="select-none pb-[0.14em] text-center font-display text-[clamp(3.6rem,18.5vw,15rem)] font-semibold leading-[0.95] tracking-[-0.06em] text-ink"
        >
          edge<span className="text-gold">book</span>
        </p>
        <p className="mt-4 text-center text-[12.5px] text-faint">
          &copy; {new Date().getFullYear()} Edgebook. Crafted for traders who review. Not investment advice.
        </p>
      </div>
    </footer>
  );
}

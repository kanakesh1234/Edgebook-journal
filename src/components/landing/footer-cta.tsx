"use client";

import Link from "next/link";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Wordmark } from "./logo";
import { Reveal } from "./reveal";

export function FinalCta() {
  return (
    <section className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <div className="panel relative overflow-hidden px-6 py-16 text-center sm:px-12 sm:py-20">
            <div className="grid-backdrop absolute inset-0 opacity-70 [mask-image:radial-gradient(60%_80%_at_50%_50%,black,transparent)]" aria-hidden />
            <div
              aria-hidden
              className="absolute left-1/2 top-0 h-[300px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gold/[0.09] blur-[110px]"
            />
            <div className="relative">
              <h2 className="mx-auto max-w-3xl font-display text-4xl font-bold leading-[1.08] tracking-[-0.03em] text-ink sm:text-6xl">
                Your edge deserves{" "}
                <span className="font-serif font-normal italic text-gold-grad">a ledger.</span>
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-muted">
                Start with today&apos;s session. In a month you&apos;ll have something most traders never
                build — evidence.
              </p>
              <div className="mt-9 flex flex-wrap items-center justify-center gap-3.5">
                <Link
                  href="/login?mode=signup"
                  className="group inline-flex h-13 items-center gap-2.5 rounded-xl bg-gold-strong px-7 py-3.5 text-base font-semibold text-on-gold shadow-sm transition-all duration-200 hover:bg-gold-strong-hover active:scale-[0.97]"
                >
                  Create your journal
                  <ArrowRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/login"
                  className="inline-flex items-center rounded-xl border border-line-strong px-7 py-3.5 text-base font-medium text-ink transition-colors duration-200 hover:border-faint hover:bg-ink/[0.04]"
                >
                  Log in
                </Link>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

export function SiteFooter() {
  return (
    <footer className="border-t border-line py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 px-5 sm:flex-row sm:px-8">
        <Wordmark />
        <p className="text-[13px] text-faint">Crafted for traders who review.</p>
        <nav aria-label="Footer" className="flex items-center gap-6 text-[13px] text-muted">
          <a href="#features" className="transition-colors hover:text-ink">Features</a>
          <a href="#journey" className="transition-colors hover:text-ink">Journey</a>
          <Link href="/login" className="transition-colors hover:text-ink">Log in</Link>
        </nav>
      </div>
      <p className="mt-8 text-center text-xs text-faint/70">
        © {new Date().getFullYear()} Edgebook · Not investment advice.
      </p>
    </footer>
  );
}

"use client";

import Link from "next/link";
import { ChevronRightIcon } from "@/components/ui/icons";
import { Wordmark } from "./logo";

export function FinalCta() {
  return (
    <section className="relative px-4 pb-20 pt-12 sm:px-8 sm:pb-28 sm:pt-20" aria-label="Get started">
      <div className="lp-sq relative mx-auto max-w-[1280px] overflow-hidden rounded-[36px] border border-line-strong/80 bg-[#14110d] px-6 py-24 text-center text-[#f7f4ee] shadow-[0_54px_120px_-38px_rgba(0,0,0,0.68)] sm:px-12 sm:py-32">
        {/* Golden-Hour Cinema Video & 4K Landscape Backdrop */}
        <div
          className="absolute inset-0 bg-cover bg-center opacity-70"
          style={{ backgroundImage: "url(/landing/act-5-quiet-edge.jpg)" }}
          aria-hidden
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2200&q=85"
          alt=""
          loading="lazy"
          decoding="async"
          onError={(e) => {
            e.currentTarget.style.display = "none";
          }}
          className="absolute inset-0 h-full w-full object-cover opacity-55"
          style={{ filter: "sepia(0.24) contrast(1.06) brightness(0.82)" }}
        />
        <video
          src="https://assets.mixkit.co/videos/preview/mixkit-sunrise-over-a-calm-lake-and-mountains-41572-large.mp4"
          poster="/landing/act-5-quiet-edge.jpg"
          muted
          loop
          autoPlay
          playsInline
          preload="metadata"
          className="pointer-events-none absolute inset-0 h-full w-full object-cover opacity-45 mix-blend-screen"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(640px 380px at 50% 35%, rgba(18,14,10,0.45), rgba(14,11,8,0.88) 80%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl">
          <p className="font-mono text-[11.5px] uppercase tracking-[0.16em] text-[#dfbe82]">
            Begin Your Ledger · 100% Owned in Your Google Drive
          </p>
          <h2 className="mt-5 font-display text-[clamp(2.4rem,6.8vw,5.4rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-[#f7f4ee]">
            Your edge deserves{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#dfbe82]">
              a&nbsp;ledger.
            </span>
          </h2>
          <p className="mx-auto mt-5 max-w-xl font-serif text-[clamp(1.2rem,2vw,1.6rem)] italic text-[#e8dec9]">
            &ldquo;Your edge was never in the market. It was in the person you became.&rdquo;
          </p>
          <p className="mx-auto mt-4 max-w-xl text-[clamp(1rem,1.45vw,1.18rem)] leading-relaxed text-[#d6cebd]">
            Start with today&apos;s session. Sign in with Google, or keep it on this device. Export everything whenever you like.
          </p>
          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex h-12 items-center rounded-full bg-gold-strong px-8 text-[17px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
            >
              Create your journal
            </Link>
            <Link
              href="/login"
              className="group inline-flex items-center gap-1 text-[17px] text-[#dfbe82] transition-colors hover:text-white"
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

/** Plain, in-flow footer: contact, links and a one-line disclaimer. */
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
            <a href="#film" className="transition-colors hover:text-ink">The Inner Film</a>
            <a href="#how" className="transition-colors hover:text-ink">Daily Ritual</a>
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

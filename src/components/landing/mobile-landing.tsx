"use client";

import { useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";
import { Glyph } from "./glyphs";
import { CATALOG, COPY, FINALE, FOOTER, QUOTES, STATEMENT } from "./scene-config";

const MOBILE_STEPS = [
  { num: "01", title: "Morning intention", body: "Set your bias, risk ceiling, and max trades in two quiet minutes before the bell." },
  { num: "02", title: "Disciplined replay & execution", body: "Rewind sessions bar by bar, tag clean entries, and stay inside 1R rules." },
  { num: "03", title: "Grade & review with Minato", body: "Reflect on execution quality over outcomes, with an assistant that reads every log." },
] as const;

export function MobileLanding() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [methodTab, setMethodTab] = useState<"plan" | "review">("plan");
  const [activeFeature, setActiveFeature] = useState(0);

  const jumpTo = (id: string) => {
    setMenuOpen(false);
    const el = document.querySelector<HTMLElement>(`.lp-tier-mobile [data-lp-section="${id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {/* Compact Thumb-First Glass Header */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="flex h-14 items-center justify-between gap-2 px-4">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Edgebook home"
            className="inline-flex h-11 items-center"
          >
            <Wordmark />
          </button>

          <div className="flex items-center gap-1.5">
            <ThemeToggle className="h-9 w-9 rounded-full" />
            <Link
              href="/login?mode=signup"
              className="inline-flex h-9 items-center rounded-full bg-gold-strong px-3.5 text-[12.5px] font-semibold text-on-gold shadow-sm active:scale-[0.97]"
            >
              Get started
            </Link>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              aria-expanded={menuOpen}
              aria-label="Toggle navigation menu"
              className="inline-grid h-10 w-10 place-items-center rounded-xl border border-line bg-surface text-ink"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                {menuOpen ? (
                  <>
                    <path d="M6 6l12 12" />
                    <path d="M18 6L6 18" />
                  </>
                ) : (
                  <>
                    <path d="M4 7h16" />
                    <path d="M4 12h16" />
                    <path d="M4 17h12" />
                  </>
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Slide-down mobile navigation drawer */}
        <AnimatePresence>
          {menuOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22 }}
              className="overflow-hidden border-t border-line bg-surface/98 px-4 pb-4 pt-3 backdrop-blur-lg"
            >
              <nav className="grid gap-1" aria-label="Mobile sections">
                {[
                  { id: "method", label: "Plan & Review" },
                  { id: "features", label: "Inside Edgebook" },
                  { id: "vault", label: "Your Google Drive" },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => jumpTo(item.id)}
                    className="flex h-11 items-center justify-between rounded-xl px-3 text-left text-[15px] font-medium text-ink active:bg-well"
                  >
                    <span>{item.label}</span>
                    <span className="text-faint">→</span>
                  </button>
                ))}
              </nav>
              <div className="mt-3 grid grid-cols-2 gap-2.5 border-t border-line pt-3">
                <Link
                  href="/login"
                  className="flex h-11 items-center justify-center rounded-xl border border-line bg-raised text-[14px] font-semibold text-ink"
                >
                  Log in
                </Link>
                <Link
                  href="/login?mode=signup"
                  className="flex h-11 items-center justify-center rounded-xl bg-gold-strong text-[14px] font-semibold text-on-gold"
                >
                  Start journal
                </Link>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </header>

      <main className="px-4 pb-10">
        {/* Hero */}
        <section className="relative pt-7 pb-8">
          <div
            aria-hidden
            className="pointer-events-none absolute -top-6 left-1/2 h-52 w-[92%] -translate-x-1/2 rounded-full opacity-70 blur-3xl"
            style={{
              background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 22%, transparent) 0%, transparent 72%)",
            }}
          />

          <p className="relative text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">
            {COPY.intro.eyebrow}
          </p>
          <h1 className="relative mt-2.5 font-display text-[2.45rem] font-semibold leading-[1.02] tracking-[-0.035em] text-ink">
            {COPY.intro.titleLead}{" "}
            <em className="font-serif text-[2.6rem] font-normal italic text-gold">
              {COPY.intro.titleAccent}
            </em>
          </h1>
          <p className="relative mt-3 max-w-[34ch] text-[15.5px] leading-relaxed text-muted">
            {COPY.intro.sub} Built for fast pre-market plans, mobile session replay, and honest AI review.
          </p>

          <div className="relative mt-5 flex flex-col gap-2.5">
            <Link
              href={COPY.intro.primary.href}
              className="flex h-12 w-full items-center justify-center rounded-full bg-gold-strong text-[15px] font-semibold text-on-gold shadow-sm active:scale-[0.98]"
            >
              {COPY.intro.primary.label}
            </Link>
            <button
              type="button"
              onClick={() => jumpTo("method")}
              className="flex h-11 w-full items-center justify-center rounded-full border border-line-strong bg-surface text-[14px] font-medium text-ink active:bg-well"
            >
              {COPY.intro.secondary.label}
            </button>
          </div>

          {/* Mobile Hero Live Snapshot Card */}
          <div className="lp-card-surface relative mt-6 p-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">Today’s session</span>
                <p className="mt-0.5 text-sm font-semibold text-ink">NY Open · ES / NQ Plan</p>
              </div>
              <span className="rounded-full border border-profit/30 bg-profit/12 px-2.5 py-0.5 text-[11.5px] font-semibold text-profit">
                {COPY.panelA.chip.time} Locked
              </span>
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-xl border border-line bg-raised px-2 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-faint">Max Risk</p>
                <p className="num mt-0.5 text-[14px] text-ink">1.0R</p>
              </div>
              <div className="rounded-xl border border-line bg-raised px-2 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-faint">Grade</p>
                <p className="num mt-0.5 text-[14px] text-gold">A-</p>
              </div>
              <div className="rounded-xl border border-line bg-raised px-2 py-2.5">
                <p className="text-[10px] uppercase tracking-wider text-faint">Rule</p>
                <p className="num mt-0.5 text-[14px] text-profit">Held</p>
              </div>
            </div>
          </div>
        </section>

        {/* Method Section — Interactive Segmented Plan / Minato */}
        <section data-lp-section="method" className="py-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">How it works</p>
              <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
                Quiet before. Honest after.
              </h2>
            </div>
          </div>

          <div className="segmented mt-4 w-full" role="tablist" aria-label="Workflow focus">
            <button
              type="button"
              role="tab"
              aria-selected={methodTab === "plan"}
              onClick={() => setMethodTab("plan")}
              className="flex-1"
            >
              01 · Pre-bell Plan
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={methodTab === "review"}
              onClick={() => setMethodTab("review")}
              className="flex-1"
            >
              02 · Minato AI
            </button>
          </div>

          <div className="lp-card-surface mt-3 p-5">
            {methodTab === "plan" ? (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">{COPY.panelA.eyebrow}</p>
                <h3 className="mt-1.5 font-display text-xl font-semibold text-ink">{COPY.panelA.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{COPY.panelA.body}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {COPY.panelA.pops.map((chip) => (
                    <span key={chip} className="rounded-full border border-line bg-raised px-3 py-1 text-xs font-medium text-ink">
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">{COPY.panelB.eyebrow}</p>
                <h3 className="mt-1.5 font-display text-xl font-semibold text-ink">{COPY.panelB.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted">{COPY.panelB.body}</p>
                <div className="mt-4 space-y-2.5 rounded-2xl border border-line bg-raised p-3.5">
                  <div className="ml-auto max-w-[85%] rounded-2xl rounded-tr-sm border border-gold/30 bg-gold/12 px-3 py-2 text-[13px] font-medium text-ink">
                    “{COPY.panelB.ask}”
                  </div>
                  <div className="max-w-[92%] rounded-2xl rounded-tl-sm border border-line bg-surface px-3 py-2 text-[13px] leading-snug text-muted">
                    {COPY.panelB.answer}
                  </div>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Inside Edgebook — Horizontal Touch Snap Carousel */}
        <section data-lp-section="features" className="py-5">
          <div className="flex items-end justify-between gap-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{COPY.catalog.eyebrow}</p>
              <h2 className="mt-1 font-display text-2xl font-semibold tracking-tight text-ink">
                {COPY.catalog.title}
              </h2>
            </div>
            <span className="text-xs text-faint">Swipe →</span>
          </div>

          <div
            className="lp-no-scrollbar -mx-4 mt-3.5 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2"
            onScroll={(e) => {
              const el = e.currentTarget;
              const idx = Math.round(el.scrollLeft / 248);
              if (idx >= 0 && idx < CATALOG.length && idx !== activeFeature) {
                setActiveFeature(idx);
              }
            }}
          >
            {CATALOG.map((item, i) => (
              <article
                key={item.title}
                onClick={() => setActiveFeature(i)}
                className={cn(
                  "lp-card-surface w-[236px] shrink-0 snap-start p-4 transition-colors",
                  activeFeature === i && "border-gold/55",
                )}
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-line bg-raised text-gold">
                  <Glyph name={item.glyph} className="h-6 w-6" />
                </div>
                <h3 className="mt-3 font-display text-[17px] font-semibold text-ink">{item.title}</h3>
                <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{item.line}</p>
              </article>
            ))}
          </div>

          <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
            {CATALOG.map((c, i) => (
              <span
                key={c.title}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  activeFeature === i ? "w-4 bg-gold" : "w-1.5 bg-line-strong",
                )}
              />
            ))}
          </div>
        </section>

        {/* Three-step Ritual */}
        <section className="py-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">The rhythm</p>
          <div className="mt-3 space-y-2.5">
            {MOBILE_STEPS.map((step) => (
              <div key={step.num} className="lp-card-surface flex items-start gap-3.5 p-4">
                <span className="num mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-gold/10 text-xs text-gold">
                  {step.num}
                </span>
                <div>
                  <h3 className="font-display text-[15.5px] font-semibold text-ink">{step.title}</h3>
                  <p className="mt-1 text-[13.5px] leading-relaxed text-muted">{step.body}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Drive Vault Ownership */}
        <section data-lp-section="vault" className="py-5">
          <div className="lp-card-surface p-5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Ownership</span>
              <span className="rounded-full border border-profit/30 bg-profit/12 px-2.5 py-0.5 text-[11px] font-medium text-profit">
                {STATEMENT.note.title}
              </span>
            </div>
            <p className="mt-3 font-display text-lg font-semibold leading-snug text-ink">{STATEMENT.text}</p>
            <pre className="mt-3.5 overflow-x-auto rounded-xl border border-line bg-raised p-3 font-mono text-[11.5px] leading-relaxed text-muted">
              {JSON.stringify(STATEMENT.json, null, 2)}
            </pre>
          </div>
        </section>

        {/* Quotes */}
        <section className="space-y-2.5 py-4">
          {QUOTES.map((q) => (
            <blockquote key={q} className="lp-card-surface px-4 py-3.5 font-serif text-[19px] italic leading-snug text-ink">
              “{q}”
            </blockquote>
          ))}
        </section>

        {/* Mobile Finale */}
        <section className="py-7 text-center">
          <h2 className="font-display text-[2rem] font-semibold leading-[1.08] tracking-tight text-ink">
            {FINALE.title} <em className="font-serif italic text-gold">{FINALE.accent}</em>
          </h2>
          <div className="mt-5 flex flex-col gap-2.5">
            <Link
              href={FINALE.primary.href}
              className="flex h-12 items-center justify-center rounded-full bg-gold-strong text-[15px] font-semibold text-on-gold shadow-sm"
            >
              {FINALE.primary.label}
            </Link>
            <Link
              href={FINALE.secondary.href}
              className="flex h-11 items-center justify-center rounded-full border border-line-strong bg-surface text-[14px] font-medium text-ink"
            >
              {FINALE.secondary.label}
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface/60 px-4 py-6 text-xs text-muted">
        <Wordmark />
        <p className="mt-3 leading-relaxed text-faint">{FOOTER.disclaimer}</p>
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
          <nav className="flex gap-4">
            <Link href="/privacy" className="hover:text-ink">
              Privacy Policy
            </Link>
            <Link href="/login" className="hover:text-ink">
              Log in
            </Link>
          </nav>
          <span className="text-faint">© {new Date().getFullYear()} Edgebook</span>
        </div>
      </footer>
    </div>
  );
}

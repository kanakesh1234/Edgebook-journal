"use client";

import { useState } from "react";
import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { Wordmark } from "./logo";
import { Glyph } from "./glyphs";
import { CATALOG, COPY, FINALE, FOOTER, QUOTES, STATEMENT } from "./scene-config";

const FEATURE_PREVIEWS: Record<string, { badge: string; statLabel: string; statVal: string; bullets: string[] }> = {
  Plan: { badge: "Before the open", statLabel: "Pre-session checklist", statVal: "4 / 4 Ready", bullets: ["Define market bias and key liquidity levels", "Cap maximum daily risk in R before firing"] },
  Review: { badge: "Decision hygiene", statLabel: "Process score", statVal: "Grade A", bullets: ["Score execution independently from P&L", "Tag setups, mistakes, and emotional state"] },
  Replay: { badge: "Bar-by-bar market", statLabel: "Playback control", statVal: "0.5x – 10x", bullets: ["Step candle-by-candle with realistic bracket fills", "Drag SL/TP directly on price scale"] },
  Practice: { badge: "Deliberate drills", statLabel: "Pattern mastery", statVal: "84% Accuracy", bullets: ["Read historical tape without hindsight bias", "Build conviction on recurring setups"] },
  Minato: { badge: "Journal memory", statLabel: "Indexed logs", statVal: "Every session", bullets: ["Spots subtle day-of-week & tilt leaks", "Answers grounded strictly in your history"] },
  Progress: { badge: "Journey view", statLabel: "Streak & milestones", statVal: "Compound curve", bullets: ["Separate skill growth from variance", "Track process consistency week by week"] },
  "Weekly review": { badge: "Close the week", statLabel: "Three-minute ritual", statVal: "Sunday cadence", bullets: ["Audit best & worst execution side by side", "Carry one clear constraint into Monday"] },
  "Your Drive": { badge: "Zero lock-in", statLabel: "JSON ledger", statVal: "100% Owned", bullets: ["Stored inside your own Google Drive folder", "Works offline cleanly with local cache fallback"] },
};

export function TabletLanding() {
  const [selectedIdx, setSelectedIdx] = useState(0);
  const selected = CATALOG[selectedIdx] ?? CATALOG[0]!;
  const detail = FEATURE_PREVIEWS[selected.title] ?? FEATURE_PREVIEWS.Plan!;

  const jumpTo = (id: string) => {
    const el = document.querySelector<HTMLElement>(`.lp-tier-tablet [data-lp-section="${id}"]`);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-dvh bg-canvas text-ink">
      {/* Tablet Editorial Top Bar */}
      <header className="sticky top-0 z-40 border-b border-line bg-canvas/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-7">
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
            aria-label="Edgebook home"
            className="inline-flex items-center"
          >
            <Wordmark />
          </button>

          <nav className="flex items-center gap-6 text-[13.5px] font-medium text-muted" aria-label="Tablet sections">
            <button type="button" onClick={() => jumpTo("method")} className="transition-colors hover:text-ink">
              Method
            </button>
            <button type="button" onClick={() => jumpTo("features")} className="transition-colors hover:text-ink">
              Features
            </button>
            <button type="button" onClick={() => jumpTo("vault")} className="transition-colors hover:text-ink">
              Ownership
            </button>
          </nav>

          <div className="flex items-center gap-2.5">
            <ThemeToggle className="rounded-full" />
            <Link href="/login" className="px-3 py-2 text-[13.5px] font-medium text-muted hover:text-ink">
              Log in
            </Link>
            <Link
              href="/login?mode=signup"
              className="inline-flex h-10 items-center rounded-full bg-gold-strong px-4 text-[13.5px] font-semibold text-on-gold shadow-sm hover:bg-gold-strong-hover"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-7 pb-14">
        {/* Asymmetric Split Tablet Hero */}
        <section className="relative grid grid-cols-12 items-center gap-8 py-12 lg:py-16">
          <div className="col-span-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-gold">{COPY.intro.eyebrow}</p>
            <h1 className="mt-3 font-display text-[3.1rem] font-semibold leading-[1.01] tracking-[-0.04em] text-ink">
              {COPY.intro.titleLead}{" "}
              <em className="font-serif text-[3.35rem] font-normal italic text-gold">{COPY.intro.titleAccent}</em>
            </h1>
            <p className="mt-4 max-w-[34ch] text-[16.5px] leading-relaxed text-muted">
              {COPY.intro.sub} Structured morning planning, realistic bar replay, and reflective review in one calm ledger.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <Link
                href={COPY.intro.primary.href}
                className="inline-flex h-12 items-center rounded-full bg-gold-strong px-6 text-[14.5px] font-semibold text-on-gold shadow-sm hover:bg-gold-strong-hover"
              >
                {COPY.intro.primary.label}
              </Link>
              <button
                type="button"
                onClick={() => jumpTo("features")}
                className="inline-flex h-12 items-center rounded-full border border-line-strong bg-surface px-5 text-[14px] font-medium text-ink hover:bg-well"
              >
                Explore features
              </button>
            </div>
            <div className="mt-7 flex flex-wrap gap-2 text-xs text-muted">
              <span className="rounded-full border border-line bg-surface px-3 py-1">Google Drive owned</span>
              <span className="rounded-full border border-line bg-surface px-3 py-1">Replay & Paper Simulator</span>
              <span className="rounded-full border border-line bg-surface px-3 py-1">Minato AI</span>
            </div>
          </div>

          {/* Framed Ledger Stage Preview */}
          <div className="col-span-6">
            <div className="lp-card-surface relative overflow-hidden p-6">
              <div
                aria-hidden
                className="pointer-events-none absolute -right-14 -top-14 h-44 w-44 rounded-full blur-2xl"
                style={{
                  background: "radial-gradient(circle, color-mix(in srgb, var(--gold) 24%, transparent) 0%, transparent 72%)",
                }}
              />
              <div className="relative flex items-center justify-between border-b border-line pb-4">
                <div>
                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-gold">Pre-Market Ledger</span>
                  <p className="mt-0.5 font-display text-lg font-semibold text-ink">Wednesday · New York Session</p>
                </div>
                <span className="shrink-0 whitespace-nowrap rounded-full border border-profit/30 bg-profit/12 px-3 py-1 text-xs font-semibold text-profit">
                  {COPY.panelA.chip.time} {COPY.panelA.chip.label}
                </span>
              </div>

              <div className="relative mt-4 grid grid-cols-3 gap-2.5">
                <div className="rounded-xl border border-line bg-raised p-3">
                  <p className="text-[11px] text-faint">Risk Cap</p>
                  <p className="num mt-1 text-lg text-ink">1.0R</p>
                </div>
                <div className="rounded-xl border border-line bg-raised p-3">
                  <p className="text-[11px] text-faint">Max Trades</p>
                  <p className="num mt-1 text-lg text-ink">2 Setups</p>
                </div>
                <div className="rounded-xl border border-line bg-raised p-3">
                  <p className="text-[11px] text-faint">Process</p>
                  <p className="num mt-1 text-lg text-profit">+2.4R</p>
                </div>
              </div>

              <div className="relative mt-4 rounded-2xl border border-line bg-raised p-4">
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">{COPY.panelB.tag}</p>
                <p className="mt-1.5 text-[13.5px] font-medium text-ink">“{COPY.panelB.ask}”</p>
                <p className="mt-1 text-[13px] leading-relaxed text-muted">{COPY.panelB.answer}</p>
              </div>
            </div>
          </div>
        </section>

        {/* Two-Up Method Grid */}
        <section data-lp-section="method" className="grid grid-cols-2 gap-6 py-6">
          <article className="lp-card-surface flex flex-col justify-between p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{COPY.panelA.eyebrow}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{COPY.panelA.title}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{COPY.panelA.body}</p>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {COPY.panelA.pops.map((chip) => (
                <span key={chip} className="rounded-full border border-line bg-raised px-3 py-1.5 text-xs font-medium text-ink">
                  {chip}
                </span>
              ))}
            </div>
          </article>

          <article className="lp-card-surface flex flex-col justify-between p-6">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{COPY.panelB.eyebrow}</p>
              <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight text-ink">{COPY.panelB.title}</h2>
              <p className="mt-2 text-[14.5px] leading-relaxed text-muted">{COPY.panelB.body}</p>
            </div>
            <div className="mt-5 rounded-xl border border-gold/25 bg-gold/[0.08] px-4 py-3 text-[13.5px] font-medium text-ink">
              {COPY.quote}
            </div>
          </article>
        </section>

        {/* Tablet Interactive Master-Detail Feature Explorer */}
        <section data-lp-section="features" className="py-10">
          <div className="mb-5">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">{COPY.catalog.eyebrow}</p>
            <h2 className="mt-1 font-display text-[2rem] font-semibold tracking-tight text-ink">{COPY.catalog.title}</h2>
          </div>

          <div className="lp-card-surface grid grid-cols-12 overflow-hidden">
            <div className="col-span-5 border-r border-line p-3">
              <div className="grid grid-cols-1 gap-1">
                {CATALOG.map((item, idx) => {
                  const active = idx === selectedIdx;
                  return (
                    <button
                      key={item.title}
                      type="button"
                      onClick={() => setSelectedIdx(idx)}
                      className={cn(
                        "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-left transition-colors",
                        active ? "bg-gold/12 text-ink ring-1 ring-inset ring-gold/30" : "text-muted hover:bg-well hover:text-ink",
                      )}
                    >
                      <Glyph name={item.glyph} className={cn("h-5 w-5 shrink-0", active ? "text-gold" : "text-faint")} />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] font-semibold">{item.title}</p>
                        <p className="truncate text-[11.5px] text-faint">{item.line}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="col-span-7 flex flex-col justify-between p-7">
              <div>
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                    {detail.badge}
                  </span>
                  <Glyph name={selected.glyph} className="h-8 w-8 text-gold" />
                </div>
                <h3 className="mt-4 font-display text-2xl font-semibold text-ink">{selected.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-muted">{selected.line}</p>

                <ul className="mt-5 space-y-2.5">
                  {detail.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2.5 text-[14px] text-ink">
                      <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-gold" />
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="mt-6 flex items-center justify-between rounded-2xl border border-line bg-raised px-4 py-3">
                <span className="text-xs font-medium text-muted">{detail.statLabel}</span>
                <span className="num text-sm text-gold">{detail.statVal}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Vault + Quotes */}
        <section data-lp-section="vault" className="grid grid-cols-12 gap-6 py-6">
          <div className="lp-card-surface col-span-7 p-6">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-gold">Ownership</span>
              <span className="rounded-full border border-profit/30 bg-profit/12 px-2.5 py-0.5 text-[11px] font-medium text-profit">
                {STATEMENT.note.title}
              </span>
            </div>
            <p className="mt-3 font-display text-xl font-semibold leading-snug text-ink">{STATEMENT.text}</p>
            <pre className="mt-4 rounded-xl border border-line bg-raised p-4 font-mono text-xs leading-relaxed text-muted">
              {JSON.stringify(STATEMENT.json, null, 2)}
            </pre>
          </div>

          <div className="col-span-5 flex flex-col justify-between gap-3">
            {QUOTES.map((q) => (
              <blockquote key={q} className="lp-card-surface flex-1 px-5 py-4 font-serif text-lg italic leading-snug text-ink">
                “{q}”
              </blockquote>
            ))}
          </div>
        </section>

        {/* Closing */}
        <section className="py-12 text-center">
          <h2 className="font-display text-4xl font-semibold tracking-tight text-ink">
            {FINALE.title} <em className="font-serif italic text-gold">{FINALE.accent}</em>
          </h2>
          <div className="mt-6 flex items-center justify-center gap-4">
            <Link
              href={FINALE.primary.href}
              className="inline-flex h-12 items-center rounded-full bg-gold-strong px-7 text-[15px] font-semibold text-on-gold shadow-sm hover:bg-gold-strong-hover"
            >
              {FINALE.primary.label}
            </Link>
            <Link href={FINALE.secondary.href} className="px-4 py-2 text-[14.5px] font-medium text-muted hover:text-ink">
              {FINALE.secondary.label} →
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line bg-surface/60 px-7 py-7 text-xs text-muted">
        <div className="mx-auto max-w-6xl">
          <div className="flex items-start justify-between gap-6">
            <div>
              <Wordmark />
              <p className="mt-3 max-w-[60ch] leading-relaxed text-faint">{FOOTER.disclaimer}</p>
            </div>
            <nav className="flex shrink-0 gap-5 text-[13px]">
              <Link href="/privacy" className="hover:text-ink">
                Privacy Policy
              </Link>
              <Link href="/login" className="hover:text-ink">
                Log in
              </Link>
            </nav>
          </div>
          <p className="mt-5 text-faint">© {new Date().getFullYear()} Edgebook</p>
        </div>
      </footer>
    </div>
  );
}

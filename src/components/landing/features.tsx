"use client";

import { motion } from "motion/react";
import {
  BookOpenIcon,
  CalendarIcon,
  ChartLineIcon,
  ImageIcon,
  RouteIcon,
  SearchIcon,
  ShieldIcon,
} from "@/components/ui/icons";
import { Reveal, EASE } from "./reveal";

function CardShell({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -5 }}
      transition={{ duration: 0.35, ease: EASE }}
      className={`panel group relative overflow-hidden p-6 transition-shadow duration-300 hover:shadow-[0_28px_60px_-24px_rgba(0,0,0,0.75)] sm:p-7 ${className}`}
    >
      {/* hover glow */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px 200px at 20% 0%, rgba(236,192,99,0.07), transparent 70%)",
        }}
      />
      {children}
    </motion.div>
  );
}

function IconTile({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 inline-grid h-11 w-11 place-items-center rounded-xl border border-line-strong bg-raised text-gold shadow-inner">
      {children}
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">The toolkit</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-0.02em] text-ink sm:text-[44px]">
            Everything a serious journal needs,{" "}
            <span className="font-serif font-normal italic text-muted">nothing it doesn&apos;t.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Performance analytics — wide card */}
          <Reveal className="md:col-span-2" delay={0}>
            <CardShell className="h-full">
              <IconTile>
                <ChartLineIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Performance dashboard
              </h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted">
                Total P&amp;L, win rate, average R:R, drawdown and best day — computed live from your
                journal and rendered as charts you&apos;ll actually want to read.
              </p>
              <div className="pointer-events-none mt-6 flex items-end gap-1.5" aria-hidden>
                {[34, 52, 40, 66, 48, 78, 58, 88].map((h, i) => (
                  <motion.div
                    key={i}
                    className={`w-full rounded-t-md ${
                      i % 3 === 2 ? "bg-loss/45" : "bg-profit/55"
                    } ${i === 7 ? "bg-gradient-to-t from-profit/30 to-gold/80" : ""}`}
                    style={{ height: h }}
                    initial={{ scaleY: 0, opacity: 0 }}
                    whileInView={{ scaleY: 1, opacity: 1 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ delay: 0.15 + i * 0.06, duration: 0.5, ease: EASE }}
                  />
                ))}
              </div>
            </CardShell>
          </Reveal>

          {/* Roadmap */}
          <Reveal delay={0.08}>
            <CardShell className="h-full">
              <IconTile>
                <RouteIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Animated progress roadmap
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Watch your avatar ride the road from starting equity to your target. Every logged
                session moves you forward.
              </p>
            </CardShell>
          </Reveal>

          {/* Journal */}
          <Reveal delay={0.05}>
            <CardShell className="h-full">
              <IconTile>
                <BookOpenIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Daily journaling
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Date, P&amp;L, R:R, instrument, setup and notes. Fast to fill in after the close,
                structured enough to query later.
              </p>
            </CardShell>
          </Reveal>

          {/* Calendar */}
          <Reveal delay={0.12}>
            <CardShell className="h-full">
              <IconTile>
                <CalendarIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Monthly P&amp;L calendar
              </h3>
              <p className="mt-1.5 mb-5 text-sm leading-relaxed text-muted">
                Green days, red days and rest days — your month at a glance.
              </p>
              <div className="grid grid-cols-7 gap-1" aria-hidden>
                {[14, 8, -6, 0, 11, -9, 0, 6, 13, 4, -4, 9, 16, 0, 7, -8, 12, 10, -5, 15, 3, 18, -3, 9, 21, 6, -7, 12].map(
                  (v, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.6 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.02, duration: 0.3 }}
                      className={`aspect-square rounded-[4px] ${
                        v > 0 ? "bg-profit/50" : v < 0 ? "bg-loss/45" : "bg-white/[0.05]"
                      }`}
                    />
                  ),
                )}
              </div>
            </CardShell>
          </Reveal>

          {/* Screenshots */}
          <Reveal delay={0.16}>
            <CardShell className="h-full">
              <IconTile>
                <ImageIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Screenshot archive
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Attach before/after charts to every entry and browse them back in a beautiful gallery.
              </p>
              <div className="relative mt-5 h-16" aria-hidden>
                <div className="absolute left-0 top-1 h-14 w-24 rotate-[-5deg] rounded-lg border border-line-strong bg-raised" />
                <div className="absolute left-10 top-0 h-14 w-28 rotate-[2deg] rounded-lg border border-line-strong bg-overlay shadow-lg">
                  <svg viewBox="0 0 100 30" className="h-full w-full opacity-70">
                    <path d="M2 26 L25 18 L45 22 L70 8 L97 4" stroke="#35e0a1" strokeWidth="1.6" fill="none" strokeLinecap="round" />
                  </svg>
                </div>
              </div>
            </CardShell>
          </Reveal>

          {/* Local-first */}
          <Reveal delay={0.2} className="md:col-span-2 lg:col-span-1">
            <CardShell className="h-full md:flex md:items-start md:gap-6">
              <div>
                <IconTile>
                  <ShieldIcon className="h-5 w-5" />
                </IconTile>
                <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                  Private &amp; portable
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">
                  Your data lives on your device — no server required. Export or import everything as
                  JSON whenever you like.
                </p>
              </div>
            </CardShell>
          </Reveal>

          {/* Search */}
          <Reveal delay={0.24}>
            <CardShell className="h-full">
              <IconTile>
                <SearchIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Find any trade
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Full-text search plus filters for outcome, instrument and direction. Your worst habits
                can hide from you — they can&apos;t hide from search.
              </p>
            </CardShell>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

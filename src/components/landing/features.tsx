"use client";

import { motion } from "motion/react";
import {
  BookOpenIcon,
  CalendarIcon,
  ChartLineIcon,
  ImageIcon,
  RouteIcon,
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
      className={`panel group relative overflow-hidden rounded-[26px] p-6 transition-shadow duration-300 hover:shadow-[0_28px_60px_-24px_rgba(0,0,0,0.65)] sm:p-7 ${className}`}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background:
            "radial-gradient(420px 200px at 20% 0%, rgba(236,192,99,0.08), transparent 70%)",
        }}
      />
      {children}
    </motion.div>
  );
}

function IconTile({ children, accent = "text-gold" }: { children: React.ReactNode; accent?: string }) {
  return (
    <div className={`mb-4 inline-grid h-11 w-11 place-items-center rounded-2xl border border-line-strong bg-raised shadow-inner ${accent}`}>
      {children}
    </div>
  );
}

export function Features() {
  return (
    <section id="features" className="relative py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal>
          <p className="text-[12px] font-semibold uppercase tracking-[0.22em] text-gold">Apple-Grade Architecture</p>
          <h2 className="mt-3 max-w-2xl font-display text-3xl font-bold leading-tight tracking-[-0.025em] text-ink sm:text-[44px]">
            Built around how elite traders{" "}
            <span className="font-serif font-normal italic text-muted">think, execute, and evolve.</span>
          </h2>
        </Reveal>

        <div className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {/* 1. Persistent Google Drive AI Brain — wide card */}
          <Reveal className="md:col-span-2" delay={0}>
            <CardShell className="h-full">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <IconTile accent="text-[#5e5ce6] dark:text-[#a5a4ff]">
                  <ChartLineIcon className="h-5 w-5" />
                </IconTile>
                <span className="rounded-full bg-[#5e5ce6]/15 px-3 py-1 text-[11px] font-semibold text-[#5e5ce6] dark:text-[#a5a4ff]">
                  Persistent Memory in Your Google Drive
                </span>
              </div>
              <h3 className="font-display text-xl font-semibold tracking-tight text-ink">
                An AI Brain that compounds with every trade
              </h3>
              <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
                Every pre-trade Plan, Thought hypothesis, Setup checklist, and post-trade Autopsy updates your personal AI Brain profile inside your own Google Drive. As your sample grows, its pre-trade mistake warnings and post-trade tagging become sharper every single day.
              </p>
              <div className="mt-6 grid grid-cols-3 gap-2.5 sm:grid-cols-4" aria-hidden>
                {[
                  { k: "1. Plan", v: "Thesis & Emotion" },
                  { k: "2. Thought", v: "AI Trap Guardrails" },
                  { k: "3. Execute", v: "16:9 Chart Replay" },
                  { k: "4. Autopsy", v: "Drive AI Sync" },
                ].map((step) => (
                  <div key={step.k} className="rounded-2xl border border-line bg-raised/70 px-3 py-2.5">
                    <p className="font-mono text-[10.5px] font-semibold text-gold">{step.k}</p>
                    <p className="mt-0.5 text-xs font-medium text-ink">{step.v}</p>
                  </div>
                ))}
              </div>
            </CardShell>
          </Reveal>

          {/* 2. 16:9 Replays & 2-Line Mistake Strip */}
          <Reveal delay={0.06}>
            <CardShell className="h-full">
              <IconTile>
                <ImageIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                16:9 Replays &amp; Mistake Strip
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Full-screen Reels-style feed with TradingView-proportioned candles, 60fps Apple cubic-bezier camera glide, click-anywhere play/pause, and a 2-line mistake summary beneath every replay.
              </p>
            </CardShell>
          </Reveal>

          {/* 3. Equity-Curve Benchmark Calendar */}
          <Reveal delay={0.1}>
            <CardShell className="h-full">
              <IconTile>
                <CalendarIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Live-Scrubbing P&amp;L Calendar
              </h3>
              <p className="mt-1.5 mb-5 text-sm leading-relaxed text-muted">
                Built to the same benchmark as our Equity Curve—scrub across any day to inspect live P&amp;L, switch between Standard, Heatmap, and Cumulative modes, and audit review discipline.
              </p>
              <div className="grid grid-cols-7 gap-1" aria-hidden>
                {[14, 8, -6, 0, 11, -9, 0, 6, 13, 4, -4, 9, 16, 0, 7, -8, 12, 10, -5, 15, 3, 18, -3, 9, 21, 6, -7, 12].map(
                  (v, i) => (
                    <motion.span
                      key={i}
                      initial={{ opacity: 0, scale: 0.6 }}
                      whileInView={{ opacity: 1, scale: 1 }}
                      viewport={{ once: true }}
                      transition={{ delay: i * 0.015, duration: 0.3 }}
                      className={`aspect-square rounded-[5px] ${
                        v > 0 ? "bg-profit/55" : v < 0 ? "bg-loss/45" : "bg-ink/[0.06]"
                      }`}
                    />
                  ),
                )}
              </div>
            </CardShell>
          </Reveal>

          {/* 4. 3-Minute Weekly & Monthly Reviews */}
          <Reveal delay={0.14}>
            <CardShell className="h-full">
              <IconTile>
                <BookOpenIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                3-Minute Anti-Procrastination Reviews
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                No 20-question walls of text. Weekly and Monthly reviews give you an instant AI Brain executive brief plus 3 progressive questions with one-tap smart chips from your data.
              </p>
            </CardShell>
          </Reveal>

          {/* 5. Neural Practice Studio */}
          <Reveal delay={0.18}>
            <CardShell className="h-full">
              <IconTile>
                <RouteIcon className="h-5 w-5" />
              </IconTile>
              <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                Neural Practice &amp; 5 Arenas
              </h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">
                Drill your own charts in Time Machine, Trade Recall, ICT Lab, Risk Math, and Week Boss—backed by 5-axis skill telemetry and Box 0–5 spaced repetition.
              </p>
            </CardShell>
          </Reveal>

          {/* 6. Private & Portable */}
          <Reveal delay={0.22} className="md:col-span-2 lg:col-span-3">
            <CardShell className="flex flex-col justify-between gap-6 sm:flex-row sm:items-center">
              <div className="flex items-start gap-4">
                <IconTile>
                  <ShieldIcon className="h-5 w-5" />
                </IconTile>
                <div>
                  <h3 className="font-display text-lg font-semibold tracking-tight text-ink">
                    Owned by you, stored in your Google Drive
                  </h3>
                  <p className="mt-1 max-w-2xl text-sm leading-relaxed text-muted">
                    Your trades, screenshots, playbook rules, and AI Brain profile live in your private Google Drive folder (`EdgeBook/journals/journal.json`) with instant local caching and one-click JSON export.
                  </p>
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-profit/30 bg-profit/10 px-4 py-1.5 font-mono text-xs font-semibold text-profit">
                Zero Vendor Lock-In
              </span>
            </CardShell>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

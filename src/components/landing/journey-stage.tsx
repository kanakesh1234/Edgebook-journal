"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  CHAPTER 01: 3D VIDEO-SCROLL HERO & ATELIER STAGE                          */
/*  CHAPTER 03: 3D SCROLL-DRIVEN 5-STAGE DAILY RITUAL DECK                    */
/*  GLOBAL: 35MM FILM REEL PAGE PROGRESS RAIL                                 */
/* ========================================================================== */

interface RitualStage {
  id: string;
  num: string;
  tab: string;
  moment: string;
  headline: string;
  italicAccent: string;
  quote: string;
  description: string;
  photoUrl: string;
  localPlate: string;
  videoUrl: string;
  entries: { label: string; value: string; tone?: string }[];
  note: string;
}

const RITUAL_STAGES: RitualStage[] = [
  {
    id: "plan",
    num: "01",
    tab: "Plan",
    moment: "08:45 AM · Before the Open",
    headline: "Start with a written intention,",
    italicAccent: "not an impulse.",
    quote: "“When your rules are written in calm, the market cannot rewrite them in noise.”",
    description:
      "Before a single order is placed, you write down the one scenario you are waiting for, what would invalidate it, and how your head feels right now.",
    photoUrl:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1800&q=85",
    localPlate: "/landing/act-2-stillness.jpg",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-person-writing-in-a-notebook-with-a-pen-4706-large.mp4",
    entries: [
      { label: "Session Thesis", value: "Wait for the overnight low to sweep and reclaim" },
      { label: "Invalidation", value: "Acceptance below the pre-market shelf" },
      { label: "Internal State", value: "Calm, rested, unhurried", tone: "text-profit" },
    ],
    note: "Major high-impact economic releases are automatically noted in your plan before the bell.",
  },
  {
    id: "thought",
    num: "02",
    tab: "Thought",
    moment: "09:15 AM · Pre-Commitment",
    headline: "Decide how you will act",
    italicAccent: "before the pressure arrives.",
    quote: "“Decide in stillness what you will do in the storm.”",
    description:
      "Write your if-then commitments in plain language. Edgebook surfaces your own historical process odds and reminds you of the personal rules you asked it to guard.",
    photoUrl:
      "https://images.unsplash.com/photo-1513519245088-0e12902e5a38?auto=format&fit=crop&w=1800&q=85",
    localPlate: "/landing/act-1-noise.jpg",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-rain-falling-on-the-window-of-a-room-42881-large.mp4",
    entries: [
      { label: "If-Then Rule", value: "If the first 15 minutes chop, I keep my hands off the mouse" },
      { label: "Guardrail", value: "Stop for the day after 2 consecutive losses", tone: "text-gold" },
      { label: "Historical Edge", value: "84% clean-process rate when rested", tone: "text-profit" },
    ],
    note: "Your personal reminders surface quietly as a translucent banner before you act.",
  },
  {
    id: "restraint",
    num: "03",
    tab: "Restraint",
    moment: "09:38 AM · In the Moment",
    headline: "Protect your composure",
    italicAccent: "when the room speeds up.",
    quote: "“The hardest trade is the one you choose not to take.”",
    description:
      "Whether you take a clean setup or log a disciplined No-Trade Day because your condition never appeared, Edgebook honors the quality of your decision—not just the dollar outcome.",
    photoUrl:
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=1800&q=85",
    localPlate: "/landing/act-3-temptation.jpg",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-close-up-of-a-vintage-pocket-watch-42874-large.mp4",
    entries: [
      { label: "Checklist Gate", value: "All 4 playbook conditions verified before entry" },
      { label: "Risk Envelope", value: "Sized within your drawdown survival ceiling", tone: "text-profit" },
      { label: "Impulse Check", value: "Zero FOMO or revenge state flagged", tone: "text-gold" },
    ],
    note: "A losing trade with clean rules is recorded as a valid loss; a sloppy win is flagged as a process break.",
  },
  {
    id: "autopsy",
    num: "04",
    tab: "Autopsy",
    moment: "10:20 AM · Honest Mirror",
    headline: "Name the one thing",
    italicAccent: "that helped or hurt you.",
    quote: "“Every decision leaves something behind. Learn from it.”",
    description:
      "A three-minute post-trade reflection asks what went well, what slipped, and what you will watch next time—turning vague regret into a specific, named lesson.",
    photoUrl:
      "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1800&q=85",
    localPlate: "/landing/act-4-mirror.jpg",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-turning-pages-of-an-old-book-42868-large.mp4",
    entries: [
      { label: "Process Verdict", value: "Followed plan · Waited for confirmation", tone: "text-profit" },
      { label: "Observation", value: "Felt the urge to tighten the stop early, stayed patient" },
      { label: "Watch Next Time", value: "Keep the same composure on Friday sessions", tone: "text-gold" },
    ],
    note: "Every reflection is indexed locally and in your own Google Drive so Minato remembers it.",
  },
  {
    id: "practise",
    num: "05",
    tab: "Practise",
    moment: "Evening · Spaced Mastery",
    headline: "Turn repeat mistakes into",
    italicAccent: "automatic intuition.",
    quote: "“Your edge was never in the market. It was in the person you became.”",
    description:
      "Mistakes don't sit forgotten in an old entry. Edgebook brings them back on a spaced-repetition schedule across five deliberate practice modes until the habit is retired.",
    photoUrl:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1800&q=85",
    localPlate: "/landing/act-5-quiet-edge.jpg",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-sunrise-over-a-calm-lake-and-mountains-41572-large.mp4",
    entries: [
      { label: "Active Drill", value: "Patience & Early-Exit Recognition" },
      { label: "Mastery Box", value: "Box 4 of 5 · Due in 7 days", tone: "text-gold" },
      { label: "Weekly Ritual", value: "3-minute synthesis completed", tone: "text-profit" },
    ],
    note: "Twenty cards at most in your daily study feed—built to be finished and put down.",
  },
];

/* -------------------------------------------------------------------------- */
/*  1. Hero Section — 3D Scroll-Scrubbed Atelier & Decision Ledger Stage      */
/* -------------------------------------------------------------------------- */

export function JourneyStage() {
  const heroSecRef = useRef<HTMLElement>(null);
  const copyRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLDivElement>(null);
  const photoPlaneRef = useRef<HTMLDivElement>(null);
  const floatBadgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const sec = heroSecRef.current;
    if (!sec) return;

    return bindScrollProgress(
      sec,
      (p) => {
        const t = clamp(p, 0, 1);
        const e = smooth(t);
        if (copyRef.current) {
          copyRef.current.style.transform = `translate3d(0, ${-t * 48}px, 0) scale(${lerp(1, 0.96, t)})`;
          copyRef.current.style.opacity = String(clamp(1 - t * 0.85, 0.15, 1));
        }
        if (cardRef.current) {
          // 3D perspective un-tilt & elevation as you scroll into the Atelier card
          const rotX = lerp(14, 0, smooth(clamp(t * 2.2, 0, 1)));
          const scale = lerp(0.93, 1.02, smooth(clamp(t * 1.8, 0, 1)));
          const liftY = lerp(34, -18, e);
          cardRef.current.style.transform = `perspective(1800px) translate3d(0, ${liftY}px, 0) rotateX(${rotX.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
        }
        if (photoPlaneRef.current) {
          photoPlaneRef.current.style.transform = `scale(${lerp(1.02, 1.14, e)}) translate3d(0, ${lerp(-10, 16, e)}px, 0)`;
        }
        if (floatBadgeRef.current) {
          floatBadgeRef.current.style.transform = `translate3d(0, ${lerp(18, -22, e)}px, 36px)`;
        }
      },
      { startRatio: 0.95, endRatio: 0.05 },
    );
  }, []);

  const onCardPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (prefersReducedMotion() || !cardRef.current) return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
    const py = ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
    cardRef.current.style.transform = `perspective(1800px) rotateX(${(-py * 4.5).toFixed(2)}deg) rotateY(${(px * 5.5).toFixed(2)}deg) scale(1.01)`;
  };

  const onCardPointerLeave = () => {
    if (prefersReducedMotion() || !cardRef.current) return;
    cardRef.current.style.transform = "perspective(1800px) rotateX(0deg) rotateY(0deg) scale(1)";
  };

  return (
    <section
      id="top"
      ref={heroSecRef}
      className="relative overflow-hidden px-5 pb-20 pt-[clamp(96px,14svh,148px)] sm:px-8 sm:pb-28"
      aria-label="Edgebook introduction"
    >
      {/* Ambient volumetric golden studio light */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[580px]"
        style={{
          background:
            "radial-gradient(920px 420px at 50% 0%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 74%)",
        }}
      />

      <div ref={copyRef} className="relative mx-auto flex max-w-5xl flex-col items-center text-center will-change-transform">
        <p
          style={{ "--d": "0s" } as React.CSSProperties}
          className="lp-rise mb-6 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 font-mono text-[11.5px] uppercase tracking-[0.14em] text-faint sm:text-[12px]"
        >
          <span className="text-gold">№ 01</span>
          <span aria-hidden className="hidden h-px w-10 bg-line-strong sm:block" />
          <span>The trading psychology &amp; decision ledger</span>
        </p>

        <h1
          style={{ "--d": "0.06s" } as React.CSSProperties}
          className="lp-rise font-display text-[clamp(2.5rem,6.8vw,5.6rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink"
        >
          Most journals record the result.{" "}
          <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
            Edgebook records the decision.
          </span>
        </h1>

        <p
          style={{ "--d": "0.16s" } as React.CSSProperties}
          className="lp-rise mt-6 max-w-2xl text-[clamp(1.05rem,1.65vw,1.28rem)] leading-relaxed text-muted"
        >
          Before the market tests your strategy, it tests your mind. Write your intention before the bell, review your discipline honestly, and turn every mistake into quiet mastery—all stored in your own Google Drive.
        </p>

        <div
          style={{ "--d": "0.26s" } as React.CSSProperties}
          className="lp-rise mt-9 flex flex-wrap items-center justify-center gap-x-7 gap-y-3.5"
        >
          <Link
            href="/login?mode=signup"
            className="inline-flex h-12 items-center rounded-full bg-gold-strong px-7 text-[16.5px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
          >
            Start your journal
          </Link>
          <a
            href="#film"
            className="group inline-flex items-center gap-1.5 text-[16.5px] text-gold transition-colors hover:text-ink"
          >
            Watch The Inner Film
            <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
          </a>
        </div>

        <ul
          style={{ "--d": "0.36s" } as React.CSSProperties}
          className="lp-rise mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 font-mono text-[11.5px] uppercase tracking-[0.11em] text-faint"
        >
          {["Your Google Drive", "Pre-Session Clarity", "Psychological Autopsy", "Export as JSON"].map((t) => (
            <li key={t} className="flex items-center gap-2">
              <span aria-hidden className="h-1 w-1 rounded-full bg-gold" />
              {t}
            </li>
          ))}
        </ul>
      </div>

      {/* 3D Perspective Atelier Video & Archival Ledger Stage */}
      <div className="lp-win-in mx-auto mt-14 max-w-[1180px] [perspective:1800px]">
        <div
          ref={cardRef}
          onPointerMove={onCardPointerMove}
          onPointerLeave={onCardPointerLeave}
          className="lp-sq grid overflow-hidden rounded-[32px] border border-line-strong/80 bg-surface shadow-[0_54px_120px_-42px_rgba(0,0,0,0.52)] transition-transform duration-200 ease-out will-change-transform lg:grid-cols-[1.1fr_0.9fr]"
        >
          {/* Left: Live Video + 4K Photographic Atelier Stage */}
          <div className="relative min-h-[320px] overflow-hidden bg-[#1a1510] sm:min-h-[400px]">
            <div
              ref={photoPlaneRef}
              className="absolute inset-0 will-change-transform"
            >
              <div
                className="absolute inset-0 bg-cover bg-center"
                style={{ backgroundImage: "url(/landing/act-2-stillness.jpg)" }}
                aria-hidden
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=2000&q=85"
                alt="Morning sunlight falling across an open handwritten journal and fountain pen"
                loading="eager"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="absolute inset-0 h-full w-full object-cover opacity-80"
                style={{ filter: "sepia(0.22) contrast(1.06) brightness(0.9)" }}
              />
              <video
                src="https://assets.mixkit.co/videos/preview/mixkit-person-writing-in-a-notebook-with-a-pen-4706-large.mp4"
                poster="/landing/act-2-stillness.jpg"
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover opacity-55 mix-blend-screen"
              />
            </div>

            {/* Diagonal Venetian window blind light rays */}
            <div className="lp-film-blinds pointer-events-none absolute -inset-20 opacity-40 rotate-[-18deg]" aria-hidden />

            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(16,12,8,0.42) 0%, rgba(16,12,8,0.10) 42%, rgba(16,12,8,0.88) 100%)",
              }}
              aria-hidden
            />

            <div className="relative z-10 flex h-full flex-col justify-between p-6 text-[#f7f4ee] sm:p-9">
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-[#dfbe82]">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-black/40 px-3 py-1 backdrop-blur-md">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#74b08c]" />
                  Atelier Study · 09:05 NY
                </span>
                <span className="rounded-full border border-white/12 bg-black/35 px-3 py-1 backdrop-blur-md">
                  35MM FILM
                </span>
              </div>

              <div ref={floatBadgeRef} className="mt-20 will-change-transform">
                <p className="font-serif text-[clamp(1.5rem,2.6vw,2.25rem)] italic leading-[1.18] text-[#f7f4ee]">
                  &ldquo;When your rules are written in calm, the market cannot rewrite them in noise.&rdquo;
                </p>
                <p className="mt-3 font-mono text-[11px] uppercase tracking-[0.14em] text-[#dfbe82]">
                  The Edgebook Philosophy · Process Over Outcome
                </p>
              </div>
            </div>
          </div>

          {/* Right: Live 3D Archival Ledger Entry Sheet */}
          <div className="relative flex flex-col justify-between p-6 sm:p-8 lg:p-10">
            <span aria-hidden className="pointer-events-none absolute inset-y-0 left-7 w-px bg-loss/20 sm:left-9" />
            <div className="pl-5 sm:pl-6">
              <div className="flex items-center justify-between border-b border-line pb-3.5">
                <span className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                  Session Entry #048
                </span>
                <span className="rounded-full border border-profit/30 bg-profit/10 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-profit">
                  Process Verified
                </span>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                    01 · Pre-Session Intention
                  </p>
                  <p className="mt-1 font-display text-[15.5px] font-medium leading-snug text-ink">
                    Wait for the overnight liquidity sweep to reclaim on a 5-minute close. Do not chase the opening drive.
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 border-y border-line py-3.5">
                  <div>
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                      02 · Headspace
                    </p>
                    <p className="mt-0.5 text-[14px] font-medium text-profit">
                      Calm · Composed
                    </p>
                  </div>
                  <div>
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                      03 · Guardrail
                    </p>
                    <p className="mt-0.5 text-[14px] font-medium text-ink">
                      Max 2 trades · Clean stop
                    </p>
                  </div>
                </div>

                <div>
                  <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                    04 · Post-Session Reflection
                  </p>
                  <p className="mt-1 font-serif text-[18px] italic leading-snug text-ink">
                    &ldquo;Let the first false move pass at 09:34 without clicking. Entered only when my condition appeared.&rdquo;
                  </p>
                </div>
              </div>
            </div>

            <div className="mt-6 flex items-center justify-between border-t border-line pl-5 pt-4 text-[12.5px] text-muted sm:pl-6">
              <span>Stored privately in your Google Drive</span>
              <a href="#film" className="font-medium text-gold transition-colors hover:text-ink">
                Scroll into The Inner Film ↓
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  2. Chapter 03 (#how) — 3D Scroll-Driven 5-Stage Daily Ritual Deck         */
/*  Scrolling automatically scrubs through all 5 stages with 3D card depth    */
/*  and stage-specific cinema video/photography!                              */
/* -------------------------------------------------------------------------- */

export function DecisionRitualStage() {
  const secRef = useRef<HTMLElement>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [stageProg, setStageProg] = useState(0);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const sec = secRef.current;
    if (!sec) return;

    return bindScrollProgress(
      sec,
      (p) => {
        const scaled = clamp(p, 0, 0.9999) * RITUAL_STAGES.length;
        const idx = Math.min(RITUAL_STAGES.length - 1, Math.floor(scaled));
        const local = clamp(scaled - idx, 0, 1);
        setActiveIdx((prev) => (prev === idx ? prev : idx));
        setStageProg(local);
      },
      { pinned: true },
    );
  }, []);

  const jumpToStage = (idx: number) => {
    setActiveIdx(idx);
    setStageProg(0.35);
    const sec = secRef.current;
    if (sec && !prefersReducedMotion()) {
      const top = sec.getBoundingClientRect().top + window.scrollY;
      const scrollable = Math.max(0, sec.offsetHeight - window.innerHeight);
      const targetP = (idx + 0.25) / RITUAL_STAGES.length;
      window.scrollTo({ top: top + targetP * scrollable, behavior: "smooth" });
    }
  };

  const stage = RITUAL_STAGES[activeIdx] ?? RITUAL_STAGES[0]!;
  const cardTiltX = lerp(8, 0, smooth(Math.min(1, stageProg * 2.5)));
  const cardScale = lerp(0.96, 1.0, smooth(Math.min(1, stageProg * 2.5)));

  return (
    <section
      id="how"
      ref={secRef}
      className="relative lg:h-[360svh]"
      aria-labelledby="ritual-title"
    >
      <div className="px-5 py-20 sm:px-8 lg:sticky lg:top-0 lg:flex lg:h-svh lg:flex-col lg:justify-center lg:overflow-hidden lg:py-8">
        <div className="mx-auto w-full max-w-[1240px]">
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <Eyebrow n="03">The daily ritual · 3D Scroll Deck</Eyebrow>
              <h2
                id="ritual-title"
                className="mt-4 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.75rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
              >
                A quiet system for{" "}
                <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                  every part of a decision.
                </span>
              </h2>
            </div>
            <p className="max-w-md text-[15px] leading-relaxed text-muted">
              Scroll to step through all five stages of the Edgebook ritual—from your morning intention to evening mastery.
            </p>
          </div>

          {/* Apple HIG Segmented Stage Selector */}
          <div className="mt-7 flex overflow-x-auto pb-1 [scrollbar-width:none]">
            <div
              role="tablist"
              aria-label="Five stages of the Edgebook ritual"
              className="inline-grid min-w-full grid-cols-5 rounded-full border border-line bg-surface p-1.5 sm:min-w-[640px]"
            >
              {RITUAL_STAGES.map((s, idx) => {
                const isSelected = idx === activeIdx;
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => jumpToStage(idx)}
                    className={`rounded-full px-3 py-2 text-center text-[12.5px] font-medium transition duration-200 sm:px-5 sm:text-[13.5px] ${
                      isSelected
                        ? "border border-line-soft bg-raised text-ink shadow-[var(--shadow-rest)]"
                        : "text-muted hover:text-ink"
                    }`}
                  >
                    <span className="mr-1.5 hidden font-mono text-[11px] text-gold sm:inline">
                      {s.num}
                    </span>
                    {s.tab}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3D Scroll-Driven Stage Card with Live Photographic & Video Backdrop */}
          <div
            style={{
              transform: `perspective(1800px) rotateX(${cardTiltX.toFixed(2)}deg) scale(${cardScale.toFixed(3)})`,
            }}
            className="lp-sq mt-5 grid overflow-hidden rounded-[32px] border border-line-strong/80 bg-surface shadow-[0_48px_110px_-38px_rgba(0,0,0,0.48)] transition-transform duration-200 ease-out will-change-transform lg:grid-cols-[1.02fr_0.98fr]"
          >
            {/* Left: Stage Cinema Video + 4K Photography + Beloved Quote */}
            <div className="relative min-h-[280px] overflow-hidden bg-[#16120d] sm:min-h-[380px]">
              <div
                className="absolute inset-0 bg-cover bg-center transition-all duration-700"
                style={{
                  backgroundImage: `url(${stage.localPlate})`,
                  transform: `scale(${lerp(1.02, 1.12, smooth(stageProg))})`,
                }}
                aria-hidden
              />
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                key={stage.photoUrl}
                src={stage.photoUrl}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.display = "none";
                }}
                className="absolute inset-0 h-full w-full object-cover opacity-75 transition-transform duration-700"
                style={{
                  transform: `scale(${lerp(1.02, 1.12, smooth(stageProg))})`,
                  filter: "sepia(0.24) contrast(1.06) brightness(0.84)",
                }}
              />
              <video
                key={stage.videoUrl}
                src={stage.videoUrl}
                poster={stage.localPlate}
                muted
                loop
                autoPlay
                playsInline
                preload="metadata"
                className="absolute inset-0 h-full w-full object-cover opacity-50 mix-blend-screen"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(14,11,8,0.52) 0%, rgba(14,11,8,0.16) 40%, rgba(14,11,8,0.92) 100%)",
                }}
                aria-hidden
              />

              <div className="relative z-10 flex h-full flex-col justify-between p-6 text-[#f7f4ee] sm:p-9">
                <div className="flex items-center justify-between">
                  <span className="rounded-full border border-white/15 bg-black/45 px-3.5 py-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[#dfbe82] backdrop-blur-md">
                    Stage {stage.num} of 05 · {stage.moment}
                  </span>
                </div>

                <div className="mt-12">
                  <h3 className="font-display text-[clamp(1.65rem,3vw,2.55rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-[#f7f4ee]">
                    {stage.headline}{" "}
                    <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#dfbe82]">
                      {stage.italicAccent}
                    </span>
                  </h3>
                  <p className="mt-3 text-[15px] leading-relaxed text-[#d6cebd]">
                    {stage.description}
                  </p>
                  <p className="mt-4 border-l-2 border-[#cba76b] pl-3.5 font-serif text-[17.5px] italic text-[#f7f4ee]">
                    {stage.quote}
                  </p>
                </div>
              </div>
            </div>

            {/* Right: 3D Stacked Ledger Sheet for the Active Stage */}
            <div className="flex flex-col justify-between bg-canvas/75 p-6 sm:p-8 lg:p-10">
              <div className="space-y-3.5">
                {stage.entries.map((item, eIdx) => (
                  <div
                    key={item.label}
                    style={{
                      transform: `translate3d(0, ${(1 - smooth(Math.min(1, stageProg * 3 - eIdx * 0.2))) * 12}px, 0)`,
                    }}
                    className="rounded-2xl border border-line bg-raised px-4 py-3.5 shadow-[var(--shadow-rest)] transition-transform duration-200"
                  >
                    <p className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                      {item.label}
                    </p>
                    <p className={`mt-1 text-[15px] font-medium leading-snug ${item.tone ?? "text-ink"}`}>
                      {item.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
                <p className="flex items-center gap-2 text-[13px] text-muted">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden />
                  <span>{stage.note}</span>
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => jumpToStage((activeIdx - 1 + RITUAL_STAGES.length) % RITUAL_STAGES.length)}
                    className="inline-flex h-8 items-center rounded-full border border-line-strong bg-raised px-3.5 text-[12px] font-medium text-ink transition hover:border-gold/60"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToStage((activeIdx + 1) % RITUAL_STAGES.length)}
                    className="inline-flex h-8 items-center rounded-full border border-line-strong bg-raised px-3.5 text-[12px] font-medium text-ink transition hover:border-gold/60"
                  >
                    Next →
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

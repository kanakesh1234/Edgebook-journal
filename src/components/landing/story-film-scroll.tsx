"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  THE INNER FILM — Five-Act Scroll-Driven Cinematic Experience              */
/*  Art-directed photographic plates, layered optical depth, natural light    */
/*  and shadow motion, and editorial storytelling. Zero charts or candles.    */
/* ========================================================================== */

export interface FilmActSpec {
  id: string;
  actNumber: string;
  roman: string;
  title: string;
  theme: string;
  line: string;
  italicPart: string;
  reflection: string;
  marginNote: string;
  timeStamp: string;
  atmosphere: string;
  localPlate: string;
  unsplashPhoto: string;
  accentTone: "loss" | "gold" | "profit";
}

const FILM_ACTS: FilmActSpec[] = [
  {
    id: "act-1-noise",
    actNumber: "01",
    roman: "ACT I",
    title: "THE NOISE",
    theme: "Before discipline, there is chaos.",
    line: "Every morning begins with",
    italicPart: "a thousand possibilities.",
    reflection:
      "The room is still dark. Rain traces the glass while the world outside wakes in a blur of opinions, urgency, and unfinished thoughts. Without a written boundary, every flicker of movement feels like an invitation.",
    marginNote: "08:14 AM · Pre-session tension · Unwritten mind",
    timeStamp: "00:00:08:14",
    atmosphere: "Pre-dawn glass & rain reflections",
    localPlate: "/landing/act-1-noise.jpg",
    unsplashPhoto:
      "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=1800&q=82",
    accentTone: "loss",
  },
  {
    id: "act-2-stillness",
    actNumber: "02",
    roman: "ACT II",
    title: "THE STILLNESS",
    theme: "The decision to become intentional.",
    line: "Before you enter the market,",
    italicPart: "enter yourself.",
    reflection:
      "Morning light cuts quietly across warm paper. Pen meets page. The moment you write down the single condition you are willing to wait for—and the exact state of your head—the noise outside loses its vote.",
    marginNote: "09:05 AM · Linen ledger & fountain pen · Intention set",
    timeStamp: "00:00:24:00",
    atmosphere: "Morning sun & slow window shadows on paper",
    localPlate: "/landing/act-2-stillness.jpg",
    unsplashPhoto:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=1800&q=82",
    accentTone: "gold",
  },
  {
    id: "act-3-temptation",
    actNumber: "03",
    roman: "ACT III",
    title: "THE TEMPTATION",
    theme: "The emotional battle.",
    line: "The hardest trade is the one",
    italicPart: "you choose not to take.",
    reflection:
      "The clock approaches the open. Your hand hovers, pulled by the oldest reflex in trading: the fear of being left behind. Then you remember what you wrote ten minutes ago—and let your hand rest.",
    marginNote: "09:29:58 AM · Chiaroscuro hesitation · Restraint over impulse",
    timeStamp: "00:00:42:18",
    atmosphere: "Chiaroscuro timepiece & the pause before action",
    localPlate: "/landing/act-3-temptation.jpg",
    unsplashPhoto:
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=1800&q=82",
    accentTone: "gold",
  },
  {
    id: "act-4-mirror",
    actNumber: "04",
    roman: "ACT IV",
    title: "THE MIRROR",
    theme: "Learning from yourself.",
    line: "Every decision leaves something behind.",
    italicPart: "Learn from it.",
    reflection:
      "Pages accumulate across weeks and seasons. Not a spreadsheet of numbers, but an honest mirror of your own character under pressure—where every named mistake becomes a pattern you no longer have to repeat.",
    marginNote: "10:45 AM · Layered autopsies & marginalia · Self-knowledge",
    timeStamp: "00:01:02:09",
    atmosphere: "Layered archival journal pages & glass reflection",
    localPlate: "/landing/act-4-mirror.jpg",
    unsplashPhoto:
      "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=1800&q=82",
    accentTone: "profit",
  },
  {
    id: "act-5-quiet-edge",
    actNumber: "05",
    roman: "ACT V",
    title: "THE QUIET EDGE",
    theme: "Mastery through consistency.",
    line: "Your edge was never in the market.",
    italicPart: "It was in the person you became.",
    reflection:
      " You close the notebook. The session is over, and nothing carries over into your evening. Calm is no longer a mood you hope for—it is the natural result of a process you trust.",
    marginNote: "SESSION CLOSED · Sovereign process · Edgebook",
    timeStamp: "00:01:20:00",
    atmosphere: "Golden-hour stillness & the closed ledger",
    localPlate: "/landing/act-5-quiet-edge.jpg",
    unsplashPhoto:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=1800&q=82",
    accentTone: "profit",
  },
];

/* -------------------------------------------------------------------------- */
/*  Bespoke Layered Visual Compositions for Each Act                          */
/*  Combines real photographic plates with natural environmental motion,      */
/*  layered depth planes, window shadows, and tactile archival details.       */
/* -------------------------------------------------------------------------- */

function ActVisualLayer({
  act,
  index,
  localProgress,
}: {
  act: FilmActSpec;
  index: number;
  /** 0..1 progress within this act */
  localProgress: number;
}) {
  // Subtle Ken Burns camera movement driven by scroll/play progress
  const scale = lerp(1.08, 1.0, smooth(localProgress));
  const panX = lerp(index % 2 === 0 ? -14 : 14, 0, smooth(localProgress));
  const panY = lerp(10, -8, smooth(localProgress));

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#14110d] select-none">
      {/* Plane 1: Local High-Res 35mm Photographic Base Plate (Always instant, zero network latency) */}
      <div
        className="absolute inset-0 bg-cover bg-center will-change-transform"
        style={{
          backgroundImage: `url(${act.localPlate})`,
          transform: `translate3d(${panX * 0.6}px, ${panY * 0.6}px, 0) scale(${scale})`,
        }}
        aria-hidden
      />

      {/* Plane 2: Curated Editorial Photographic Layer (blends organically with warm film grading) */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={act.unsplashPhoto}
        alt=""
        loading={index <= 1 ? "eager" : "lazy"}
        decoding="async"
        onError={(e) => {
          e.currentTarget.style.display = "none";
        }}
        className="absolute inset-0 h-full w-full object-cover opacity-55 mix-blend-soft-light will-change-transform"
        style={{
          transform: `translate3d(${panX}px, ${panY}px, 0) scale(${scale * 1.02})`,
          filter:
            index === 0
              ? "contrast(1.08) saturate(0.78) brightness(0.84)"
              : index === 1
                ? "sepia(0.28) contrast(1.04) brightness(0.95)"
                : index === 2
                  ? "contrast(1.16) sepia(0.22) brightness(0.82)"
                  : index === 3
                    ? "sepia(0.32) contrast(1.05) brightness(0.9)"
                    : "sepia(0.24) contrast(1.06) brightness(0.96)",
        }}
      />

      {/* Plane 3: Act-Specific Environmental Motion & Layered Physical Details */}
      {index === 0 && (
        /* ACT I: Rain-on-glass refraction streaks, window mullions & pre-dawn bokeh drift */
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {/* Ambient twilight bokeh reflection drifting across the glass */}
          <div
            className="absolute -inset-12 opacity-65"
            style={{
              background:
                "radial-gradient(280px 240px at 62% 48%, rgba(226, 168, 92, 0.24), transparent 70%), radial-gradient(360px 280px at 38% 58%, rgba(112, 156, 198, 0.2), transparent 72%)",
              transform: `translate3d(${(0.5 - localProgress) * 36}px, ${(localProgress - 0.5) * 22}px, 0)`,
            }}
          />
          {/* Subtle animated rain rivulets on window glass */}
          <div className="lp-film-rain absolute inset-0 opacity-40" />
          {/* Architectural window mullions in foreground parallax */}
          <div
            className="absolute inset-0"
            style={{
              transform: `translate3d(${(0.5 - localProgress) * -24}px, 0, 0)`,
            }}
          >
            <div className="absolute inset-y-0 left-[31%] w-3 bg-[#0c0a08]/85 shadow-[2px_0_12px_rgba(218,178,118,0.14)]" />
            <div className="absolute inset-y-0 left-[71%] w-3 bg-[#0c0a08]/85 shadow-[2px_0_12px_rgba(218,178,118,0.12)]" />
            <div className="absolute inset-x-0 top-[68%] h-3 bg-[#0c0a08]/85" />
          </div>
        </div>
      )}

      {index === 1 && (
        /* ACT II: Slow-moving Venetian window shadows + tactile handwritten journal card in morning light */
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {/* Slow-moving diagonal sunlight & window-blind shadow bars */}
          <div
            className="lp-film-blinds absolute -inset-24 opacity-55"
            style={{
              transform: `translate3d(${(localProgress - 0.5) * 44}px, ${(localProgress - 0.5) * 28}px, 0) rotate(-21deg)`,
            }}
          />
          {/* Layered physical cotton-paper journal sheet in foreground depth */}
          <div
            className="absolute bottom-7 right-6 hidden max-w-[330px] rounded-[18px] border border-[#d8ccb6]/40 bg-[#faf5ea]/92 p-5 text-[#26221a] shadow-[0_28px_60px_-18px_rgba(12,9,5,0.65)] backdrop-blur-md sm:block"
            style={{
              transform: `translate3d(0, ${(1 - smooth(localProgress * 1.3)) * 22}px, 0) rotate(-1.5deg)`,
            }}
          >
            <div className="flex items-center justify-between border-b border-[#e2d8c5] pb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-[#8c6d2e]">
              <span>Entry Plan · 09:05 NY</span>
              <span>Calm · Rested</span>
            </div>
            <p className="mt-3 font-serif text-[19px] italic leading-snug text-[#26221a]">
              &ldquo;If the Asia low is swept and 5m closes back inside, I act. If the open is noisy, I sit on my hands.&rdquo;
            </p>
            <div className="mt-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[#6e6657]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#40795b]" />
              <span>Written before the bell</span>
            </div>
          </div>
        </div>
      )}

      {index === 2 && (
        /* ACT III: Chiaroscuro tension — approaching 09:30 open & the choice of restraint */
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {/* Shifting chiaroscuro light split: crimson impulse fading as golden restraint takes over */}
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(105deg, rgba(172, 81, 87, ${0.32 * (1 - localProgress)}) 0%, transparent 48%, rgba(203, 167, 107, ${0.26 * localProgress}) 100%)`,
            }}
          />
          {/* Tactile optical chronograph ring & moment-of-restraint callout */}
          <div
            className="absolute bottom-7 right-6 hidden max-w-[320px] rounded-[18px] border border-[#cba76b]/30 bg-[#1c1813]/90 p-4 text-[#f0eae0] shadow-[0_28px_60px_-18px_rgba(0,0,0,0.75)] backdrop-blur-md sm:block"
            style={{
              transform: `translate3d(0, ${(0.5 - localProgress) * 18}px, 0)`,
            }}
          >
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.14em] text-[#cba76b]">
              <span>09:29:58 NY · Market Open</span>
              <span className="text-[#74b08c]">Hand at rest</span>
            </div>
            <p className="mt-2.5 font-serif text-[18px] italic leading-snug text-[#f0eae0]">
              &ldquo;No 5m reclaim yet. Let the first wave pass without you.&rdquo;
            </p>
          </div>
        </div>
      )}

      {index === 3 && (
        /* ACT IV: Layered archival journal pages & glass reflection moving in multi-plane parallax */
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {/* Diagonal glass reflection sweep */}
          <div
            className="absolute -inset-20 opacity-45"
            style={{
              background:
                "linear-gradient(125deg, transparent 30%, rgba(255, 236, 198, 0.18) 47%, rgba(255, 236, 198, 0.03) 53%, transparent 70%)",
              transform: `translate3d(${(localProgress - 0.5) * 90}px, 0, 0)`,
            }}
          />
          {/* Layered archival cards in foreground parallax */}
          <div className="absolute bottom-7 right-6 hidden sm:flex sm:flex-col sm:gap-2.5">
            <div
              className="w-[310px] rounded-[16px] border border-[#d8ccb6]/35 bg-[#f4ede0]/90 px-4 py-3 text-[#26221a] shadow-lg backdrop-blur-md"
              style={{
                transform: `translate3d(${(0.5 - localProgress) * 26}px, 0, 0) rotate(-2deg)`,
              }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#8c6d2e]">
                14 Sept · Autopsy #12
              </p>
              <p className="mt-1 font-serif text-[16px] italic text-[#26221a]">
                &ldquo;Moved the stop early because I watched P&amp;L instead of structure.&rdquo;
              </p>
            </div>
            <div
              className="w-[310px] rounded-[16px] border border-[#40795b]/40 bg-[#fcf9f2]/95 px-4 py-3 text-[#26221a] shadow-xl backdrop-blur-md"
              style={{
                transform: `translate3d(${(localProgress - 0.5) * 18}px, 0, 0) rotate(1deg)`,
              }}
            >
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[#40795b]">
                02 Nov · Autopsy #48 · Pattern Retired
              </p>
              <p className="mt-1 font-serif text-[16px] italic text-[#26221a]">
                &ldquo;Held through the retest with zero interference. Process success.&rdquo;
              </p>
            </div>
          </div>
        </div>
      )}

      {index === 4 && (
        /* ACT V: Golden-hour morning mist drifting across still water & serene completion */
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div
            className="lp-film-mist absolute inset-x-0 top-[36%] h-[32%] opacity-55"
            style={{
              transform: `translate3d(${(localProgress - 0.5) * -55}px, 0, 0)`,
            }}
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(520px 280px at 54% 52%, rgba(255, 232, 178, 0.24), transparent 72%)",
            }}
          />
        </div>
      )}

      {/* Plane 4: Unified 35mm Anamorphic Vignette & Scrim for Editorial Readability */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(14,11,8,0.52) 0%, rgba(14,11,8,0.12) 38%, rgba(14,11,8,0.28) 65%, rgba(14,11,8,0.86) 100%)",
        }}
        aria-hidden
      />
      <div className="lp-film-grain pointer-events-none absolute inset-0 opacity-25" aria-hidden />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Main StoryFilmScroll Component                                            */
/* -------------------------------------------------------------------------- */

export function StoryFilmScroll() {
  const trackRef = useRef<HTMLElement>(null);
  const progressRef = useRef(0);
  const playingRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);

  const [activeIndex, setActiveIndex] = useState(0);
  const [actProgress, setActProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);

  const applyProgress = useCallback((p: number) => {
    const clamped = clamp(p, 0, 1);
    progressRef.current = clamped;
    setOverallProgress(clamped);

    const scaled = clamped * FILM_ACTS.length;
    const idx = Math.min(FILM_ACTS.length - 1, Math.floor(scaled));
    const local = clamp(scaled - idx, 0, 1);
    setActiveIndex(idx);
    setActProgress(local);
  }, []);

  // Native 60fps scroll binding — visitors always retain 100% control of scrolling
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const track = trackRef.current;
    if (!track) return;

    const unbind = bindScrollProgress(
      track,
      (progress) => {
        if (!playingRef.current) {
          applyProgress(progress);
        }
      },
      { pinned: true },
    );

    const stopAutoOnUserScroll = () => {
      if (playingRef.current) {
        playingRef.current = false;
        setIsPlaying(false);
      }
    };
    window.addEventListener("wheel", stopAutoOnUserScroll, { passive: true });
    window.addEventListener("touchmove", stopAutoOnUserScroll, { passive: true });

    return () => {
      unbind();
      window.removeEventListener("wheel", stopAutoOnUserScroll);
      window.removeEventListener("touchmove", stopAutoOnUserScroll);
    };
  }, [applyProgress]);

  // Auto-play loop when the visitor clicks "Play Story Film"
  useEffect(() => {
    if (!isPlaying) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }

    lastTimeRef.current = performance.now();
    const tick = (now: number) => {
      if (!playingRef.current) return;
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      // 24 seconds for the full 5-act film (~4.8s per act)
      const next = progressRef.current + dt / 24;
      if (next >= 1) {
        applyProgress(1);
        playingRef.current = false;
        setIsPlaying(false);
        return;
      }

      applyProgress(next);

      // Keep page scroll position gently synchronized if the film section is currently pinned in view
      const track = trackRef.current;
      if (track) {
        const rect = track.getBoundingClientRect();
        const scrollable = track.offsetHeight - window.innerHeight;
        if (scrollable > 0 && rect.top <= 4 && rect.bottom >= window.innerHeight - 4) {
          const targetScrollY = window.scrollY + rect.top + next * scrollable;
          window.scrollTo({ top: targetScrollY, behavior: "instant" as ScrollBehavior });
        }
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPlaying, applyProgress]);

  const togglePlay = () => {
    if (playingRef.current) {
      playingRef.current = false;
      setIsPlaying(false);
    } else {
      if (progressRef.current >= 0.98) {
        applyProgress(0);
      }
      playingRef.current = true;
      setIsPlaying(true);
    }
  };

  const selectAct = (idx: number) => {
    playingRef.current = false;
    setIsPlaying(false);
    const targetP = (idx + 0.15) / FILM_ACTS.length;
    applyProgress(targetP);

    const track = trackRef.current;
    if (track && !prefersReducedMotion()) {
      const top = track.getBoundingClientRect().top + window.scrollY;
      const scrollable = Math.max(0, track.offsetHeight - window.innerHeight);
      window.scrollTo({ top: top + targetP * scrollable, behavior: "smooth" });
    }
  };

  const currentAct = FILM_ACTS[activeIndex] ?? FILM_ACTS[0]!;

  return (
    <>
      {/* ---------------- Editorial Prologue Transition into The Inner Film ---------------- */}
      <div className="mx-auto max-w-[1200px] px-5 pb-10 pt-16 sm:px-8 sm:pb-14 sm:pt-24">
        <div className="flex flex-col items-start justify-between gap-6 border-t border-line pt-10 md:flex-row md:items-end">
          <div>
            <Eyebrow n="02">The Inner Film · Five Acts</Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-ink">
              The market is external.{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                The battle is inside.
              </span>
            </h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
            Scroll through the five moments that shape a trader&apos;s mind—or press{" "}
            <strong className="font-medium text-ink">Play Story Film</strong> to watch the chapters unfold.
          </p>
        </div>
      </div>

      {/* ---------------- Pinned Scroll-Driven Five-Act Cinema Stage ---------------- */}
      <section
        id="film"
        ref={trackRef}
        aria-label="The Inner Film — Five-act visual story"
        className="lp-pinned relative h-[460svh]"
      >
        <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto flex h-full max-h-[820px] w-full max-w-[1240px] flex-col justify-between">
            {/* Widescreen Cinema Frame */}
            <div className="lp-sq relative flex-1 overflow-hidden rounded-[28px] border border-line-strong/80 bg-[#14110d] shadow-[0_48px_120px_-36px_rgba(0,0,0,0.68)] sm:rounded-[36px]">
              {/* Cross-Dissolving Photographic Act Plates */}
              {FILM_ACTS.map((act, idx) => {
                const isCurrent = idx === activeIndex;
                return (
                  <div
                    key={act.id}
                    aria-hidden={!isCurrent}
                    className="absolute inset-0 transition-opacity duration-700 ease-out"
                    style={{
                      opacity: isCurrent ? 1 : 0,
                      pointerEvents: isCurrent ? "auto" : "none",
                      zIndex: isCurrent ? 2 : 1,
                    }}
                  >
                    <ActVisualLayer
                      act={act}
                      index={idx}
                      localProgress={isCurrent ? actProgress : idx < activeIndex ? 1 : 0}
                    />
                  </div>
                );
              })}

              {/* Top Cinema HUD Bar (Apple HIG Translucent Material) */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-8 sm:pt-7">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/45 px-3.5 py-1.5 backdrop-blur-xl">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      currentAct.accentTone === "loss"
                        ? "bg-[#cd8484]"
                        : currentAct.accentTone === "gold"
                          ? "bg-[#cba76b]"
                          : "bg-[#74b08c]"
                    }`}
                  />
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.14em] text-[#f0eae0]">
                    {currentAct.roman} · {currentAct.title}
                  </span>
                  <span className="hidden font-mono text-[11px] text-[#a69d8c] sm:inline">
                    — {currentAct.theme}
                  </span>
                </div>

                <div className="flex items-center gap-2.5">
                  <span className="hidden rounded-full border border-white/12 bg-black/40 px-3 py-1.5 font-mono text-[11px] tracking-[0.12em] text-[#a69d8c] backdrop-blur-xl md:inline-block">
                    {currentAct.timeStamp}
                  </span>
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? "Pause story film" : "Play story film"}
                    className="inline-flex items-center gap-2 rounded-full border border-[#cba76b]/45 bg-[#1c1813]/85 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#f0eae0] backdrop-blur-xl transition hover:border-[#cba76b] hover:bg-[#272219] active:scale-[0.97]"
                  >
                    <span className="text-[#cba76b]">{isPlaying ? "❚❚" : "▶"}</span>
                    <span>{isPlaying ? "Pause Film" : "Play Story Film"}</span>
                  </button>
                </div>
              </div>

              {/* Lower-Third Narrative Composition & Act V Identity Moment */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end p-5 sm:p-8 lg:p-12">
                <div className="max-w-2xl">
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#cba76b]">
                    {currentAct.marginNote}
                  </p>

                  <h3 className="mt-2.5 font-display text-[clamp(1.65rem,3.8vw,3.35rem)] font-semibold leading-[1.06] tracking-[-0.038em] text-[#f7f4ee]">
                    {currentAct.line}{" "}
                    <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.015em] text-[#dfbe82]">
                      {currentAct.italicPart}
                    </span>
                  </h3>

                  <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-[#d6cebd] sm:text-[16.5px]">
                    {currentAct.reflection}
                  </p>

                  {/* Act V culminates in an Edgebook identity moment & CTA */}
                  {activeIndex === 4 && (
                    <div className="pointer-events-auto mt-6 flex flex-wrap items-center gap-4">
                      <Link
                        href="/login?mode=signup"
                        className="inline-flex h-11 items-center rounded-full bg-gold-strong px-6 text-[15px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
                      >
                        Begin your Edgebook
                      </Link>
                      <a
                        href="#how"
                        className="group inline-flex items-center gap-1 text-[15px] text-[#dfbe82] transition-colors hover:text-white"
                      >
                        See the daily ritual
                        <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </a>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Bottom 5-Act Chapter Scrubber Bar (Responsive on Mobile, Tablet & Desktop) */}
            <div className="mt-3.5 rounded-[22px] border border-line bg-surface/90 px-3 py-2.5 backdrop-blur-xl sm:px-5 sm:py-3">
              <div className="grid grid-cols-5 gap-1.5 sm:gap-3" role="tablist" aria-label="Five acts of The Inner Film">
                {FILM_ACTS.map((act, idx) => {
                  const isCurrent = idx === activeIndex;
                  const isCompleted = idx < activeIndex;
                  const fillPct = isCurrent ? Math.round(actProgress * 100) : isCompleted ? 100 : 0;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      onClick={() => selectAct(idx)}
                      className={`group flex flex-col items-start rounded-xl px-2.5 py-1.5 text-left transition ${
                        isCurrent
                          ? "bg-gold/12 text-ink"
                          : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                      }`}
                    >
                      <div className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
                        <span className={isCurrent ? "text-gold font-semibold" : "text-faint"}>
                          {act.actNumber}
                        </span>
                        <span className="hidden text-[10px] text-faint md:inline">
                          {act.roman}
                        </span>
                      </div>
                      <span className="mt-0.5 w-full truncate text-[11.5px] font-medium sm:text-[13px]">
                        {act.title.replace("THE ", "")}
                      </span>
                      <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-ink/[0.09]">
                        <div
                          className="h-full rounded-full bg-gold-strong transition-[width] duration-150 ease-out"
                          style={{ width: `${fillPct}%` }}
                        />
                      </div>
                    </button>
                  );
                })}
              </div>
              <div className="sr-only" aria-live="polite">
                Act {activeIndex + 1} of 5: {currentAct.title}. {Math.round(overallProgress * 100)}% through film.
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Reduced Motion Fallback: Editorial 5-Act Photographic Essay ---------------- */}
      <section className="lp-static px-5 py-16 sm:px-8" aria-label="The Inner Film — Five Acts">
        <div className="mx-auto max-w-[1100px] space-y-8">
          {FILM_ACTS.map((act, idx) => (
            <article
              key={act.id}
              className="lp-sq grid overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface md:grid-cols-2"
            >
              <div className="relative min-h-[260px]">
                <ActVisualLayer act={act} index={idx} localProgress={0.6} />
              </div>
              <div className="flex flex-col justify-center p-6 sm:p-8">
                <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                  {act.roman} · {act.title} — {act.theme}
                </p>
                <h3 className="mt-3 font-display text-2xl font-semibold leading-tight tracking-[-0.03em] text-ink sm:text-3xl">
                  {act.line}{" "}
                  <span className="font-serif font-normal italic text-gold">{act.italicPart}</span>
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">{act.reflection}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

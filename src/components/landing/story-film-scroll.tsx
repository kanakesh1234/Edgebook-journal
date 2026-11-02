"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  THE INNER FILM — Scroll-Scrubbed & Playable 60fps Story Cinema            */
/*  Zero charts, zero candles. A 5-act visual metaphor of a trader's mind     */
/*  rendered in EdgeBook's warm editorial paper, ink, sage, crimson & gold.   */
/* ========================================================================== */

interface FilmAct {
  act: string;
  timecode: string;
  stamp: string;
  title: string;
  italicAccent: string;
  subtitle: string;
  quote: string;
  pulseBpm: number;
  stateLabel: string;
}

const ACTS: FilmAct[] = [
  {
    act: "ACT I",
    timecode: "08:28:14 NY",
    stamp: "THE NOISE",
    title: "Before a plan, the morning is a",
    italicAccent: "storm of impulse.",
    subtitle:
      "A hundred competing ticks, opinions, and urges pull at your attention. When nothing is written down, every sudden move feels like the one you cannot afford to miss.",
    quote: "“Unwritten rules bend the moment the tape speeds up.”",
    pulseBpm: 114,
    stateLabel: "Scattered · Reactive",
  },
  {
    act: "ACT II",
    timecode: "09:15:00 NY",
    stamp: "THE STILLNESS",
    title: "One honest line on paper",
    italicAccent: "quiets the room.",
    subtitle:
      "You write your thesis and your invalidation before the bell. The noise settles into concentric order — you already know what you are waiting for, and what you will ignore.",
    quote: "“If the sweep doesn't reclaim with a 5m close, I sit on my hands.”",
    pulseBpm: 68,
    stateLabel: "Centered · Intentional",
  },
  {
    act: "ACT III",
    timecode: "09:42:30 NY",
    stamp: "THE TEMPTATION",
    title: "The hardest decision is the trade",
    italicAccent: "you let pass.",
    subtitle:
      "Impatience flares in crimson, trying to pull you off your center. Your guardrails hold the line — turning the urge to chase into the quiet discipline of waiting.",
    quote: "“Protecting your capital and your head IS a winning session.”",
    pulseBpm: 72,
    stateLabel: "Guarded · Composed",
  },
  {
    act: "ACT IV",
    timecode: "10:18:45 NY",
    stamp: "THE MIRROR",
    title: "Every decision weaves into",
    italicAccent: "living memory.",
    subtitle:
      "Win or lose, you step in front of the mirror. Each reflection, emotion, and lesson links into a constellation that remembers your patterns better than willpower ever could.",
    quote: "“A mistake named and practiced is a tuition bill paid only once.”",
    pulseBpm: 64,
    stateLabel: "Reflective · Learning",
  },
  {
    act: "ACT V",
    timecode: "11:00:00 NY",
    stamp: "THE QUIET EDGE",
    title: "Calm is not the absence of risk.",
    italicAccent: "It is knowing your compass.",
    subtitle:
      "When your preparation, guardrails, and reflections compound in one place, you stop trading against yourself. The instrument is just the vehicle — you are the edge.",
    quote: "“Process over outcome. Every single session.”",
    pulseBpm: 60,
    stateLabel: "Aligned · Sovereign",
  },
];

interface Particle {
  seedX: number;
  seedY: number;
  angle: number;
  radius: number;
  speed: number;
  size: number;
  orbitLayer: number;
  hueKind: "ink" | "gold" | "profit" | "loss";
}

function createParticles(count = 130): Particle[] {
  const out: Particle[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / count;
    const goldenAngle = i * 2.399963229728653;
    out.push({
      seedX: (Math.sin(i * 12.9898) * 43758.5453) % 1,
      seedY: (Math.cos(i * 78.233) * 23421.631) % 1,
      angle: goldenAngle,
      radius: 0.14 + Math.sqrt(t) * 0.78,
      speed: 0.45 + (i % 7) * 0.14,
      size: 1.4 + (i % 5) * 0.65,
      orbitLayer: i % 4,
      hueKind: i % 11 === 0 ? "loss" : i % 5 === 0 ? "profit" : i % 2 === 0 ? "gold" : "ink",
    });
  }
  return out;
}

const PARTICLES = createParticles(130);
const TOTAL_FRAMES = 480;

function readThemePalette(el: HTMLElement) {
  const cs = getComputedStyle(el);
  const pick = (v: string, fallback: string) => cs.getPropertyValue(v).trim() || fallback;
  return {
    canvas: pick("--color-canvas", "#f6f1e7"),
    surface: pick("--color-surface", "#efe9dc"),
    raised: pick("--color-raised", "#faf6ee"),
    ink: pick("--color-ink", "#1b1916"),
    muted: pick("--color-muted", "#655e52"),
    faint: pick("--color-faint", "#948b7b"),
    gold: pick("--color-gold", "#b88728"),
    profit: pick("--color-profit", "#2a6f4e"),
    loss: pick("--color-loss", "#b84438"),
    line: pick("--color-line", "rgba(27,25,22,0.1)"),
  };
}

export function StoryFilmScroll() {
  const sectionRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const progressRef = useRef(0);
  const clockPhaseRef = useRef(0);
  const isPlayingRef = useRef(false);

  const [activeAct, setActiveAct] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [frameNum, setFrameNum] = useState(1);
  const [bpm, setBpm] = useState(ACTS[0]!.pulseBpm);

  const syncUiFromProgress = useCallback((p: number) => {
    const clamped = clamp(p, 0, 1);
    const idx = Math.min(ACTS.length - 1, Math.floor(clamped * ACTS.length));
    setActiveAct((prev) => (prev === idx ? prev : idx));
    const f = Math.max(1, Math.min(TOTAL_FRAMES, Math.round(1 + clamped * (TOTAL_FRAMES - 1))));
    setFrameNum((prev) => (prev === f ? prev : f));

    // Smoothly interpolate BPM between acts
    const exactAct = clamped * (ACTS.length - 1);
    const i0 = Math.floor(exactAct);
    const i1 = Math.min(ACTS.length - 1, i0 + 1);
    const curBpm = Math.round(lerp(ACTS[i0]!.pulseBpm, ACTS[i1]!.pulseBpm, exactAct - i0));
    setBpm((prev) => (prev === curBpm ? prev : curBpm));
  }, []);

  useEffect(() => {
    const section = sectionRef.current;
    const canvas = canvasRef.current;
    if (!section || !canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastTs = performance.now();
    let palette = readThemePalette( document.documentElement );

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(320, Math.floor(rect.width * dpr));
      canvas.height = Math.max(200, Math.floor(rect.height * dpr));
      palette = readThemePalette(document.documentElement);
    };

    resize();
    window.addEventListener("resize", resize);

    const observer = new MutationObserver(() => {
      palette = readThemePalette(document.documentElement);
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "style"] });

    // 5-Act weights from overall progress p in [0, 1]
    const actWeight = (p: number, actIdx: number) => {
      const scaled = p * (ACTS.length - 1);
      const dist = Math.abs(scaled - actIdx);
      return smooth(clamp(1 - dist, 0, 1));
    };

    const drawFrame = (now: number) => {
      const dt = Math.min(0.05, (now - lastTs) / 1000);
      lastTs = now;
      clockPhaseRef.current += dt;

      if (isPlayingRef.current) {
        const nextP = progressRef.current + dt * 0.055; // ~18 second full story film
        if (nextP >= 1) {
          progressRef.current = 1;
          isPlayingRef.current = false;
          setIsPlaying(false);
        } else {
          progressRef.current = nextP;
        }
        syncUiFromProgress(progressRef.current);
      }

      const p = clamp(progressRef.current, 0, 1);
      const t = clockPhaseRef.current;

      const w1 = actWeight(p, 0); // Noise / Chaos
      const w2 = actWeight(p, 1); // Stillness / Ink ripple
      const w3 = actWeight(p, 2); // Temptation / Guardrail shield
      const w4 = actWeight(p, 3); // Mirror / Constellation memory
      const w5 = actWeight(p, 4); // Compass / Astrolabe mastery

      const W = canvas.width;
      const H = canvas.height;
      const cx = W * 0.5;
      const cy = H * 0.5;
      const minDim = Math.min(W, H);

      ctx.clearRect(0, 0, W, H);

      // 1. Subtle archival radial vignette & warm focal glow
      const bgGrad = ctx.createRadialGradient(cx, cy, minDim * 0.04, cx, cy, Math.max(W, H) * 0.65);
      bgGrad.addColorStop(0, palette.raised);
      bgGrad.addColorStop(0.65, palette.surface);
      bgGrad.addColorStop(1, palette.canvas);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, W, H);

      // 2. Subtle architectural registration crosshairs & film rule lines
      ctx.save();
      ctx.strokeStyle = palette.line;
      ctx.lineWidth = 1;
      // Horizontal horizon line that steadies after Act I
      const horizonTilt = (1 - smooth(clamp(p * 3, 0, 1))) * Math.sin(t * 2.4) * 0.14;
      ctx.translate(cx, cy);
      ctx.rotate(horizonTilt);
      ctx.beginPath();
      ctx.moveTo(-W * 0.44, 0);
      ctx.lineTo(W * 0.44, 0);
      ctx.stroke();

      // Fine vertical meridian
      ctx.beginPath();
      ctx.moveTo(0, -H * 0.38);
      ctx.lineTo(0, H * 0.38);
      ctx.stroke();
      ctx.restore();

      // 3. ACT II & III & V: Concentric Zen Ripples / Guardrail Rings / Astrolabe Orbits
      const orderStrength = clamp(w2 + w3 * 0.9 + w4 * 0.7 + w5, 0, 1);
      if (orderStrength > 0.01) {
        const ringCount = 5;
        for (let rIdx = 1; rIdx <= ringCount; rIdx++) {
          const baseR = minDim * (0.09 * rIdx);
          const breathe = Math.sin(t * 1.4 - rIdx * 0.55) * minDim * 0.006 * (w2 + w5 * 0.5);
          const radius = baseR + breathe;

          ctx.save();
          ctx.beginPath();
          ctx.arc(cx, cy, radius, 0, Math.PI * 2);
          ctx.strokeStyle = rIdx === 2 && w3 > 0.15 ? palette.gold : palette.ink;
          ctx.globalAlpha = orderStrength * (rIdx === 2 ? 0.28 : 0.11);
          ctx.lineWidth = rIdx === 2 ? 1.8 : 1;
          if (rIdx % 2 === 1 && (w4 > 0.2 || w5 > 0.2)) {
            ctx.setLineDash([4, 8]);
          }
          ctx.stroke();
          ctx.restore();
        }
      }

      // 4. ACT II: Calligraphy Ink Wave ("One honest line on paper")
      if (w2 > 0.02 || w3 > 0.02) {
        const inkAlpha = clamp(w2 + w3 * 0.45, 0, 1);
        ctx.save();
        ctx.beginPath();
        const spanX = W * 0.38;
        const steps = 64;
        for (let i = 0; i <= steps; i++) {
          const u = i / steps;
          const x = cx - spanX + u * spanX * 2;
          // Smooth harmonic standing wave that flattens into calm focus
          const amp = minDim * 0.065 * (1 - 0.55 * smooth(clamp((p - 0.2) * 2.5, 0, 1)));
          const y =
            cy +
            Math.sin(u * Math.PI * 2 - t * 1.6) * amp * Math.sin(u * Math.PI);
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.strokeStyle = palette.gold;
        ctx.globalAlpha = inkAlpha * 0.75;
        ctx.lineWidth = 2.2;
        ctx.stroke();
        ctx.restore();
      }

      // 5. ACT III: The Crimson Temptation Flare vs. The Golden Guardrail Shield
      if (w3 > 0.02) {
        const flarePhase = (t * 0.65) % 1;
        const flareAngle = t * 0.9;
        const flareDist = minDim * lerp(0.38, 0.21, Math.sin(flarePhase * Math.PI));
        const fx = cx + Math.cos(flareAngle) * flareDist;
        const fy = cy + Math.sin(flareAngle) * flareDist * 0.68;

        // Crimson temptation pulse outside the guardrail
        ctx.save();
        const flareGrad = ctx.createRadialGradient(fx, fy, 2, fx, fy, minDim * 0.14);
        flareGrad.addColorStop(0, palette.loss);
        flareGrad.addColorStop(1, "transparent");
        ctx.globalAlpha = w3 * 0.42;
        ctx.fillStyle = flareGrad;
        ctx.beginPath();
        ctx.arc(fx, fy, minDim * 0.14, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();

        // Luminous Guardrail Shield Ring holding the center untouched
        const shieldR = minDim * 0.19;
        ctx.save();
        ctx.beginPath();
        ctx.arc(cx, cy, shieldR, 0, Math.PI * 2);
        ctx.strokeStyle = palette.gold;
        ctx.globalAlpha = w3 * 0.85;
        ctx.lineWidth = 2.4;
        ctx.stroke();

        // Bright deflection arc facing the temptation flare
        ctx.beginPath();
        ctx.arc(cx, cy, shieldR + 4, flareAngle - 0.55, flareAngle + 0.55);
        ctx.strokeStyle = palette.profit;
        ctx.globalAlpha = w3 * 0.9;
        ctx.lineWidth = 3.2;
        ctx.stroke();
        ctx.restore();
      }

      // 6. Multi-Act Particle Choreography (130 particles morphing across all 5 acts)
      const nodePositions: { x: number; y: number }[] = [];

      for (let i = 0; i < PARTICLES.length; i++) {
        const pt = PARTICLES[i]!;

        // Act I position: turbulent storm swirl
        const swirlAngle = pt.angle + t * pt.speed * 1.9 + Math.sin(t * 2.3 + i) * 0.9;
        const swirlR = minDim * (0.08 + pt.radius * 0.44 + Math.sin(t * 3.1 + i * 0.7) * 0.05);
        const x1 = cx + Math.cos(swirlAngle) * swirlR * 1.25;
        const y1 = cy + Math.sin(swirlAngle) * swirlR * 0.85;

        // Act II position: concentric breathing Zen rings
        const ringR = minDim * (0.09 * (pt.orbitLayer + 1));
        const ringAngle = pt.angle + t * 0.28 * (pt.orbitLayer % 2 === 0 ? 1 : -1);
        const x2 = cx + Math.cos(ringAngle) * ringR;
        const y2 = cy + Math.sin(ringAngle) * ringR;

        // Act III position: half inside guardrail core, outer particles deflected outside shield
        const isOuter = pt.orbitLayer >= 2;
        const r3 = isOuter ? minDim * (0.25 + (i % 5) * 0.035) : minDim * (0.06 + pt.orbitLayer * 0.05);
        const a3 = pt.angle + t * (isOuter ? 0.9 : 0.22);
        const x3 = cx + Math.cos(a3) * r3;
        const y3 = cy + Math.sin(a3) * r3;

        // Act IV position: 3D Rotating Mirror / Neural Memory Constellation
        const fibPhi = Math.acos(1 - (2 * (i + 0.5)) / PARTICLES.length);
        const fibTheta = Math.PI * (1 + Math.sqrt(5)) * i + t * 0.35;
        const sphereR = minDim * 0.31;
        const sx = Math.sin(fibPhi) * Math.cos(fibTheta);
        const sy = Math.cos(fibPhi);
        const sz = Math.sin(fibPhi) * Math.sin(fibTheta);
        const persp = 1 / (1.65 - sz * 0.45);
        const x4 = cx + sx * sphereR * persp;
        const y4 = cy + sy * sphereR * persp;

        // Act V position: Precision Golden Astrolabe / Compass Rose
        const spoke = i % 8;
        const spokeAngle = (spoke * Math.PI) / 4 + t * 0.12;
        const onRing = i % 3 === 0;
        const astroR = onRing
          ? minDim * (0.12 + (pt.orbitLayer * 0.075))
          : minDim * (0.05 + ((i % 9) / 9) * 0.31);
        const a5 = onRing ? pt.angle + t * 0.18 * (pt.orbitLayer % 2 === 0 ? 1 : -1) : spokeAngle;
        const x5 = cx + Math.cos(a5) * astroR;
        const y5 = cy + Math.sin(a5) * astroR;

        // Blend positions smoothly by continuous progress p
        const scaled = p * (ACTS.length - 1);
        const seg = Math.min(ACTS.length - 2, Math.floor(scaled));
        const frac = smooth(scaled - seg);
        const xs = [x1, x2, x3, x4, x5];
        const ys = [y1, y2, y3, y4, y5];
        const x = lerp(xs[seg]!, xs[seg + 1]!, frac);
        const y = lerp(ys[seg]!, ys[seg + 1]!, frac);

        if (i < 42) nodePositions.push({ x, y });

        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, pt.size * (w5 > 0.3 && i % 8 === 0 ? 1.35 : 1), 0, Math.PI * 2);
        if (w1 > 0.4 && pt.hueKind === "loss") {
          ctx.fillStyle = palette.loss;
        } else if (pt.hueKind === "gold" || w5 > 0.4) {
          ctx.fillStyle = palette.gold;
        } else if (pt.hueKind === "profit" && p > 0.25) {
          ctx.fillStyle = palette.profit;
        } else {
          ctx.fillStyle = palette.ink;
        }
        ctx.globalAlpha = 0.28 + 0.52 * (1 - w1 * 0.25);
        ctx.fill();
        ctx.restore();
      }

      // 7. ACT IV & V: Neural Memory Constellation Threads connecting nearby nodes
      const webAlpha = clamp(w4 * 0.95 + w5 * 0.65, 0, 1);
      if (webAlpha > 0.02) {
        const maxDist = minDim * 0.16;
        const maxDistSq = maxDist * maxDist;
        ctx.save();
        ctx.lineWidth = 1;
        for (let i = 0; i < nodePositions.length; i++) {
          const a = nodePositions[i]!;
          for (let j = i + 1; j < nodePositions.length; j++) {
            const b = nodePositions[j]!;
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dSq = dx * dx + dy * dy;
            if (dSq < maxDistSq) {
              const proximity = 1 - Math.sqrt(dSq) / maxDist;
              ctx.strokeStyle = (i + j) % 3 === 0 ? palette.gold : palette.ink;
              ctx.globalAlpha = webAlpha * proximity * 0.34;
              ctx.beginPath();
              ctx.moveTo(a.x, a.y);
              ctx.lineTo(b.x, b.y);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // 8. Central True-North Compass / Focal Core (evolves from jittery needle in Act I to serene Astrolabe in Act V)
      ctx.save();
      ctx.translate(cx, cy);
      // In Act I the needle jitters wildly; from Act II onward it locks smoothly toward True North (-Math.PI / 2)
      const jitter = w1 * (Math.sin(t * 7.5) * 0.85 + Math.cos(t * 11.2) * 0.55);
      const compassAngle = jitter + (1 - w1) * Math.sin(t * 0.6) * 0.04;
      ctx.rotate(compassAngle);

      const needleLen = minDim * lerp(0.11, 0.16, w5);
      // North pointer (Gold)
      ctx.beginPath();
      ctx.moveTo(0, -needleLen);
      ctx.lineTo(5.5, 0);
      ctx.lineTo(-5.5, 0);
      ctx.closePath();
      ctx.fillStyle = palette.gold;
      ctx.globalAlpha = 0.92;
      ctx.fill();

      // South counterweight (Ink)
      ctx.beginPath();
      ctx.moveTo(0, needleLen * 0.72);
      ctx.lineTo(4.5, 0);
      ctx.lineTo(-4.5, 0);
      ctx.closePath();
      ctx.fillStyle = palette.ink;
      ctx.globalAlpha = 0.35;
      ctx.fill();

      // Center jewel pivot
      ctx.beginPath();
      ctx.arc(0, 0, 5, 0, Math.PI * 2);
      ctx.fillStyle = palette.raised;
      ctx.globalAlpha = 1;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = palette.gold;
      ctx.stroke();
      ctx.restore();

      rafId = window.requestAnimationFrame(drawFrame);
    };

    rafId = window.requestAnimationFrame(drawFrame);

    let st: ScrollTrigger | null = null;
    if (!prefersReducedMotion()) {
      gsap.registerPlugin(ScrollTrigger);
      st = ScrollTrigger.create({
        trigger: section,
        start: "top top",
        end: "bottom bottom",
        onUpdate: (self) => {
          if (!isPlayingRef.current) {
            progressRef.current = self.progress;
            syncUiFromProgress(self.progress);
          }
        },
      });
    }

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
      observer.disconnect();
      st?.kill();
    };
  }, [syncUiFromProgress]);

  const togglePlay = () => {
    if (isPlayingRef.current) {
      isPlayingRef.current = false;
      setIsPlaying(false);
    } else {
      if (progressRef.current >= 0.98) {
        progressRef.current = 0;
        syncUiFromProgress(0);
      }
      isPlayingRef.current = true;
      setIsPlaying(true);
    }
  };

  const jumpToAct = (idx: number) => {
    isPlayingRef.current = false;
    setIsPlaying(false);
    const targetP = idx / (ACTS.length - 1);
    progressRef.current = targetP;
    syncUiFromProgress(targetP);
  };

  const cur = ACTS[activeAct] ?? ACTS[0]!;
  const progressPct = Math.round(((frameNum - 1) / (TOTAL_FRAMES - 1)) * 100);

  return (
    <section
      id="film"
      ref={sectionRef}
      aria-label="The Inner Film — A scroll-driven visual story"
      className="relative h-[420svh]"
    >
      <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-4 py-6 sm:px-8">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-5">
          {/* Top Editorial Ledger Header */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow n="02">The inner film · Scroll or press play</Eyebrow>
            <div className="flex items-center gap-4 font-mono text-[11px] uppercase tracking-[0.14em] text-faint">
              <span className="hidden sm:inline">35MM PROCEDURAL REEL · NO CHARTS</span>
              <span className="rounded-full border border-line-strong bg-surface px-3 py-1 text-ink">
                FRM {String(frameNum).padStart(4, "0")} / {String(TOTAL_FRAMES).padStart(4, "0")}
              </span>
            </div>
          </div>

          {/* Main Cinema Viewport + Editorial Story Split */}
          <div className="lp-sq relative grid overflow-hidden rounded-[32px] border border-line-strong/80 bg-surface shadow-[0_50px_110px_-40px_rgba(0,0,0,0.45)] lg:grid-cols-[1.18fr_0.82fr]">
            {/* Left / Top: 60fps Procedural Cinema Stage */}
            <div className="relative min-h-[300px] overflow-hidden border-b border-line bg-canvas sm:min-h-[400px] lg:min-h-[500px] lg:border-b-0 lg:border-r">
              <canvas
                ref={canvasRef}
                className="block h-full w-full"
                aria-label="Procedural visual story showing chaos turning into stillness, resilience, memory, and mastery"
              />

              {/* Top Film HUD Overlay */}
              <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-4 py-3.5 sm:px-6">
                <div className="flex items-center gap-2.5 rounded-full border border-line bg-raised/85 px-3 py-1 backdrop-blur-md">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      activeAct === 0
                        ? "bg-loss animate-pulse"
                        : activeAct === 2
                          ? "bg-gold"
                          : "bg-profit"
                    }`}
                  />
                  <span className="font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink">
                    {cur.act} · {cur.stamp}
                  </span>
                </div>

                <div className="flex items-center gap-3 rounded-full border border-line bg-raised/85 px-3 py-1 font-mono text-[11px] tracking-[0.1em] text-muted backdrop-blur-md">
                  <span>{cur.timecode}</span>
                  <span aria-hidden className="text-line-strong">·</span>
                  <span className={activeAct === 0 ? "text-loss" : "text-profit"}>
                    {bpm} BPM
                  </span>
                </div>
              </div>

              {/* Bottom Cinema Subtitle & Play/Pause Control Overlay */}
              <div className=" inset-x-0 bottom-0 absolute flex flex-col gap-3 bg-gradient-to-t from-canvas/95 via-canvas/70 to-transparent px-4 pb-4 pt-10 sm:px-6">
                <p className="font-serif text-[clamp(1.05rem,1.8vw,1.35rem)] italic tracking-[-0.01em] text-ink">
                  {cur.quote}
                </p>

                <div className="flex items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised px-3.5 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink transition hover:border-gold hover:text-gold active:scale-[0.98]"
                  >
                    <span className="text-gold">{isPlaying ? "❚❚" : "▶"}</span>
                    <span>{isPlaying ? "Pause film" : "Play story film"}</span>
                  </button>

                  <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-muted">
                    {cur.stateLabel}
                  </span>
                </div>
              </div>
            </div>

            {/* Right: Editorial Narrative Chapter & 5-Act Scrubber */}
            <div className="flex flex-col justify-between p-6 sm:p-8 lg:p-10">
              <div>
                <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.14em] text-gold">
                  <span>
                    {cur.act} OF 05 — {cur.stamp}
                  </span>
                  <span>{progressPct}%</span>
                </div>

                <h2 className="mt-4 font-display text-[clamp(1.75rem,3.2vw,2.75rem)] font-semibold leading-[1.06] tracking-[-0.038em] text-ink">
                  {cur.title}{" "}
                  <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                    {cur.italicAccent}
                  </span>
                </h2>

                <p className="mt-4 text-[15.5px] leading-relaxed text-muted sm:text-[16.5px]">
                  {cur.subtitle}
                </p>
              </div>

              {/* 5-Act Interactive Film Strip Timeline */}
              <div className="mt-8 space-y-3 border-t border-line pt-5">
                <div className="grid grid-cols-5 gap-1.5" role="tablist" aria-label="Story film acts">
                  {ACTS.map((item, idx) => {
                    const isCurrent = idx === activeAct;
                    const isPassed = idx < activeAct;
                    return (
                      <button
                        key={item.act}
                        type="button"
                        role="tab"
                        aria-selected={isCurrent}
                        onClick={() => jumpToAct(idx)}
                        className={`group flex flex-col items-start rounded-xl border px-2.5 py-2 text-left transition ${
                          isCurrent
                            ? "border-gold/60 bg-gold/10 text-ink"
                            : isPassed
                              ? "border-line bg-raised/60 text-muted hover:border-line-strong"
                              : "border-line/60 bg-transparent text-faint hover:border-line-strong"
                        }`}
                      >
                        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                          0{idx + 1}
                        </span>
                        <span className="mt-0.5 truncate w-full text-[11.5px] font-medium">
                          {item.stamp.replace("THE ", "")}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Continuous Film Scrub Bar */}
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
                  <div
                    className="h-full rounded-full bg-gold transition-[width] duration-150 ease-out"
                    style={{ width: `${Math.max(4, progressPct)}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

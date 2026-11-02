"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  THE INNER FILM — 600-Frame Scrubbed Canvas Sequence + 3D Pillar Flight    */
/*                                                                            */
/*  - Poster first (/landing/act-1-noise.jpg) for instant first paint.        */
/*  - Chunked frame preloader if /landing/frames/frame-0001.webp..0600.webp   */
/*    exist on disk (probes frame 1 once; zero 404 spam if absent).           */
/*  - Graceful procedural 600-frame cinema renderer (local plates + 3D        */
/*    candlestick pillar corridor, rain on glass, live fountain pen ink,      */
/*    chiaroscuro chronograph, archival autopsy stack, and golden sunrise).   */
/*  - Zero external video/image URLs.                                         */
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
  localPlate: string;
  accentTone: "loss" | "gold" | "profit";
}

const TOTAL_FRAMES = 600;
const CHUNK_SIZE = 24;

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
      "The room is still dark. Glowing candlestick pillars pulse in the mist while the world wakes in a blur of urgency. Without a written boundary, every flicker of movement feels like an invitation.",
    marginNote: "08:14 AM · Candlestick canyon · Unwritten mind",
    timeStamp: "00:00:08:14",
    localPlate: "/landing/act-1-noise.jpg",
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
      "Warm gold light cuts quietly across cream paper. Pen meets page. The moment you write down the single condition you are willing to wait for—and the exact state of your head—the noise outside loses its vote.",
    marginNote: "09:05 AM · Linen ledger & fountain pen · Intention set",
    timeStamp: "00:00:24:00",
    localPlate: "/landing/act-2-stillness.jpg",
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
    localPlate: "/landing/act-3-temptation.jpg",
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
    localPlate: "/landing/act-4-mirror.jpg",
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
      "You close the notebook. The session is over, and nothing carries over into your evening. Calm is no longer a mood you hope for—it is the natural result of a process you trust.",
    marginNote: "SESSION CLOSED · Sovereign process · Edgebook",
    timeStamp: "00:01:20:00",
    localPlate: "/landing/act-5-quiet-edge.jpg",
    accentTone: "profit",
  },
];

function formatTimecode(progress: number): string {
  const totalSec = progress * 80;
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const frames = Math.floor((totalSec % 1) * 24);
  return `00:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

function frameUrl(frameIndex1Based: number): string {
  return `/landing/frames/frame-${String(frameIndex1Based).padStart(4, "0")}.webp`;
}

/* ========================================================================== */
/*  600-Frame Scrubbed Canvas Renderer (Sequence Frames + Procedural Cinema)  */
/* ========================================================================== */

function drawCinemaFrame(opts: {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  p: number;
  frameIdx: number;
  velocity: number;
  pointerX: number;
  pointerY: number;
  time: number;
  plates: (HTMLImageElement | null)[];
  seqFrames: Map<number, HTMLImageElement>;
}) {
  const { ctx, W, H, p, frameIdx, velocity, pointerX, pointerY, time, plates, seqFrames } = opts;
  const scaled = clamp(p, 0, 0.9999) * FILM_ACTS.length;
  const actIdx = Math.min(FILM_ACTS.length - 1, Math.floor(scaled));
  const localP = clamp(scaled - actIdx, 0, 1);
  const absVel = Math.min(1, Math.abs(velocity) * 18);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#120f0b";
  ctx.fillRect(0, 0, W, H);

  // If a dedicated 600-frame sequence image is loaded for this frame, draw it first
  const seqImg = seqFrames.get(frameIdx);
  if (seqImg && seqImg.complete && seqImg.naturalWidth > 0) {
    const coverScale = Math.max(W / seqImg.naturalWidth, H / seqImg.naturalHeight);
    const dw = seqImg.naturalWidth * coverScale;
    const dh = seqImg.naturalHeight * coverScale;
    ctx.drawImage(seqImg, (W - dw) * 0.5, (H - dh) * 0.5, dw, dh);
  }

  // Render procedural 3D candlestick corridor + act choreography
  const renderActScene = (idx: number, prog: number, alpha: number) => {
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    const camScale = lerp(1.02, 1.15, smooth(prog)) + absVel * 0.014;
    const camPanX = lerp(idx % 2 === 0 ? -24 : 24, 0, smooth(prog)) + pointerX * -18;
    const camPanY = lerp(14, -14, smooth(prog)) + pointerY * -12;

    const img = plates[idx];
    if (!seqImg && img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(W * 0.5 + camPanX, H * 0.5 + camPanY);
      ctx.scale(camScale, camScale);
      const coverScale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * coverScale;
      const dh = img.naturalHeight * coverScale;
      ctx.drawImage(img, -dw * 0.5, -dh * 0.5, dw, dh);
      ctx.restore();
    }

    // Procedural 3D-perspective Candlestick Pillars receding through the mist
    ctx.save();
    const pillarFade = idx === 0 ? 0.85 : idx === 1 ? 0.45 : idx === 2 ? 0.55 : 0.25;
    for (let c = 0; c < 18; c++) {
      const side = c % 2 === 0 ? -1 : 1;
      const depthZ = ((c / 18 - prog * 0.55 + 1.0) % 1.0);
      const persp = Math.pow(1 - depthZ, 1.65);
      if (persp < 0.04) continue;

      const cx = W * 0.5 + side * (W * 0.14 + persp * W * 0.36) + pointerX * -32 * persp;
      const cy = H * (0.48 + (persp - 0.5) * 0.12) + pointerY * -18 * persp;
      const bodyW = Math.max(4, 34 * persp);
      const bodyH = (80 + ((c * 19) % 120)) * persp;
      const wickH = bodyH * 1.48;

      const isGold = c % 4 === 0;
      const isBull = (c * 5) % 3 !== 0;
      const col = isGold ? "203, 167, 107" : isBull ? "116, 176, 140" : "205, 132, 132";
      const a = pillarFade * (1 - depthZ) * Math.min(1, depthZ * 4.5);

      ctx.strokeStyle = `rgba(${col}, ${a * 0.75})`;
      ctx.lineWidth = Math.max(1, 2.2 * persp);
      ctx.beginPath();
      ctx.moveTo(cx, cy - wickH * 0.5);
      ctx.lineTo(cx, cy + wickH * 0.5);
      ctx.stroke();

      ctx.fillStyle = `rgba(${col}, ${a * 0.45})`;
      ctx.fillRect(cx - bodyW * 0.5, cy - bodyH * 0.5, bodyW, bodyH);
    }
    ctx.restore();

    if (idx === 0) {
      // ACT I: THE NOISE — Rain rivulets & bokeh orbs scrubbing with scroll
      for (let i = 0; i < 65; i++) {
        const rx = ((i * 89.3) % W) + pointerX * -10;
        const scrollFall = prog * H * (0.9 + (i % 5) * 0.35);
        const ambientFall = time * (38 + (i % 7) * 12);
        const ry = ((i * 113.7 + scrollFall + ambientFall) % (H + 140)) - 70;
        const streakLen = (28 + (i % 6) * 20) * (1 + absVel * 0.7);

        const sg = ctx.createLinearGradient(rx, ry, rx - 2, ry + streakLen);
        sg.addColorStop(0, "rgba(203, 167, 107, 0)");
        sg.addColorStop(1, "rgba(247, 244, 238, 0.36)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 2, ry + streakLen);
        ctx.stroke();
      }
    } else if (idx === 1) {
      // ACT II: THE STILLNESS — Open notebook & live fountain pen handwriting scrubbed by scroll
      ctx.save();
      const sheetX = W * 0.58 + pointerX * -16;
      const sheetY = H * 0.48 + lerp(24, -10, smooth(prog)) + pointerY * -12;
      ctx.translate(sheetX, sheetY);
      ctx.rotate(lerp(-0.07, -0.02, smooth(prog)));

      const jw = Math.min(520, W * 0.46);
      const jh = Math.min(340, H * 0.52);
      ctx.shadowColor = "rgba(10, 7, 4, 0.68)";
      ctx.shadowBlur = 48;
      ctx.fillStyle = "#f7f4ee";
      ctx.beginPath();
      ctx.roundRect(-jw * 0.5, -jh * 0.5, jw, jh, 16);
      ctx.fill();
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "rgba(172, 81, 87, 0.32)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-jw * 0.5 + 48, -jh * 0.5);
      ctx.lineTo(-jw * 0.5 + 48, jh * 0.5);
      ctx.stroke();

      ctx.fillStyle = "#8c6d2e";
      ctx.font = "600 11px monospace";
      ctx.fillText("SESSION PLAN · 09:05 AM NY · WRITTEN IN CALM", -jw * 0.5 + 64, -jh * 0.5 + 40);

      const lines = [
        "If the overnight low sweeps and 5m closes inside,",
        "I take the single planned entry with defined risk.",
        "If the open is loud and choppy, I sit on my hands.",
      ];
      let penTipX = -jw * 0.5 + 64;
      let penTipY = -jh * 0.5 + 88;
      const writeProg = clamp(prog * 1.25, 0, 1);

      ctx.font = "italic 19px Georgia, serif";
      ctx.fillStyle = "#26221a";
      lines.forEach((lineText, row) => {
        const rowStart = row / lines.length;
        const rowEnd = (row + 1) / lines.length;
        const rowLocal = clamp((writeProg - rowStart) / (rowEnd - rowStart), 0, 1);
        if (rowLocal > 0) {
          const chars = Math.ceil(lineText.length * rowLocal);
          const visibleStr = lineText.slice(0, chars);
          const ry = -jh * 0.5 + 88 + row * 60;
          ctx.fillText(visibleStr, -jw * 0.5 + 64, ry);
          penTipX = -jw * 0.5 + 64 + ctx.measureText(visibleStr).width;
          penTipY = ry - 6;
        }
      });

      ctx.save();
      ctx.translate(penTipX + 8, penTipY - 4);
      ctx.rotate(-0.52);
      ctx.fillStyle = "#cba76b";
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(14, -5);
      ctx.lineTo(14, 5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1c1813";
      ctx.beginPath();
      ctx.roundRect(14, -7, 150, 14, 6);
      ctx.fill();
      ctx.restore();
      ctx.restore();
    } else if (idx === 2) {
      // ACT III: THE TEMPTATION — Chronograph approaching 09:30:00 NY
      const cx = W * 0.56 + pointerX * -16;
      const cy = H * 0.46 + pointerY * -12;
      const dialR = Math.min(W, H) * 0.25;

      ctx.save();
      ctx.translate(cx, cy);
      ctx.strokeStyle = `rgba(203, 167, 107, ${0.32 + 0.58 * smooth(prog)})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, dialR + 14, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * smooth(prog * 1.15));
      ctx.stroke();

      ctx.fillStyle = "rgba(21, 18, 13, 0.88)";
      ctx.beginPath();
      ctx.arc(0, 0, dialR, 0, Math.PI * 2);
      ctx.fill();

      const secs = Math.min(60, 50 + prog * 10);
      const secWhole = Math.floor(secs);
      const timeStr = secWhole >= 60 ? "09 : 30 : 00  NY" : `09 : 29 : ${String(secWhole).padStart(2, "0")}  NY`;
      ctx.fillStyle = "#cba76b";
      ctx.font = "600 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(timeStr, 0, -dialR * 0.35);

      const secAng = (secs / 60) * Math.PI * 2 - Math.PI * 0.5;
      ctx.rotate(secAng);
      ctx.strokeStyle = prog > 0.55 ? "#74b08c" : "#cd8484";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(dialR * 0.82, 0);
      ctx.stroke();
      ctx.restore();
    } else if (idx === 3) {
      // ACT IV: THE MIRROR — Layered archival autopsy cards fanning in 3D depth
      const cards = [
        { date: "14 SEPT · AUTOPSY #12", badge: "Mistake Named", tone: "#cd8484", baseX: -170, baseY: 24, rot: -0.11 },
        { date: "03 OCT · AUTOPSY #29", badge: "Habit Shifting", tone: "#cba76b", baseX: 0, baseY: 0, rot: -0.02 },
        { date: "02 NOV · AUTOPSY #48", badge: "Pattern Retired · A+", tone: "#74b08c", baseX: 170, baseY: -22, rot: 0.06 },
      ];
      cards.forEach((c, cIdx) => {
        const reveal = smooth(clamp(prog * 1.35 - cIdx * 0.22, 0, 1));
        ctx.save();
        ctx.globalAlpha = alpha * (0.25 + 0.75 * reveal);
        ctx.translate(W * 0.56 + c.baseX * lerp(0.6, 1.05, smooth(prog)), H * 0.45 + c.baseY);
        ctx.rotate(c.rot);
        const cw = Math.min(310, W * 0.32);
        const ch = Math.min(200, H * 0.34);
        ctx.fillStyle = "#fcfaf5";
        ctx.beginPath();
        ctx.roundRect(-cw * 0.5, -ch * 0.5, cw, ch, 14);
        ctx.fill();
        ctx.fillStyle = c.tone;
        ctx.font = "600 10.5px monospace";
        ctx.fillText(`${c.date} · ${c.badge}`, -cw * 0.5 + 24, -ch * 0.5 + 36);
        ctx.restore();
      });
    } else if (idx === 4) {
      // ACT V: THE QUIET EDGE — Warm gold horizon bloom
      const sunX = W * 0.54 + pointerX * -14;
      const sunY = H * lerp(0.58, 0.44, smooth(prog)) + pointerY * -10;
      const sunGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, Math.max(W, H) * 0.48);
      sunGrad.addColorStop(0, "rgba(247, 244, 238, 0.55)");
      sunGrad.addColorStop(0.35, "rgba(203, 167, 107, 0.28)");
      sunGrad.addColorStop(1, "rgba(21, 18, 13, 0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, W, H);
    }

    ctx.restore();
  };

  const transitionWindow = 0.22;
  if (actIdx < FILM_ACTS.length - 1 && localP > 1 - transitionWindow) {
    const tBlend = smooth((localP - (1 - transitionWindow)) / transitionWindow);
    renderActScene(actIdx, localP, 1);
    renderActScene(actIdx + 1, 0, tBlend);
  } else {
    renderActScene(actIdx, localP, 1);
  }

  // Editorial readability scrim
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, "rgba(12, 10, 8, 0.58)");
  scrim.addColorStop(0.3, "rgba(12, 10, 8, 0.12)");
  scrim.addColorStop(0.6, "rgba(12, 10, 8, 0.28)");
  scrim.addColorStop(1, "rgba(12, 10, 8, 0.88)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);
}

/* ========================================================================== */
/*  Main StoryFilmScroll Component                                            */
/* ========================================================================== */

export function StoryFilmScroll() {
  const trackRef = useRef<HTMLElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const targetProgressRef = useRef(0);
  const smoothProgressRef = useRef(0);
  const velocityRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const playingRef = useRef(false);
  const draggingTimelineRef = useRef(false);

  const platesRef = useRef<(HTMLImageElement | null)[]>([null, null, null, null, null]);
  const seqFramesRef = useRef<Map<number, HTMLImageElement>>(new Map());
  const seqSupportedRef = useRef<boolean | null>(null);
  const loadedChunksRef = useRef<Set<number>>(new Set());

  const [activeIndex, setActiveIndex] = useState(0);
  const [actProgress, setActProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  // Chunked preloader for 600-frame sequence (only runs if /landing/frames/frame-0001.webp exists)
  const preloadChunk = useCallback((chunkIdx: number) => {
    if (seqSupportedRef.current !== true) return;
    if (loadedChunksRef.current.has(chunkIdx)) return;
    loadedChunksRef.current.add(chunkIdx);

    const startFrame = chunkIdx * CHUNK_SIZE + 1;
    const endFrame = Math.min(TOTAL_FRAMES, startFrame + CHUNK_SIZE - 1);
    for (let f = startFrame; f <= endFrame; f++) {
      if (seqFramesRef.current.has(f)) continue;
      const img = new Image();
      img.decoding = "async";
      img.src = frameUrl(f);
      seqFramesRef.current.set(f, img);
    }
  }, []);

  const syncUiState = useCallback(
    (p: number) => {
      const clamped = clamp(p, 0, 1);
      const scaled = clamped * FILM_ACTS.length;
      const idx = Math.min(FILM_ACTS.length - 1, Math.floor(scaled));
      const local = clamp(scaled - idx, 0, 1);
      const frame = Math.max(1, Math.min(TOTAL_FRAMES, Math.round(1 + clamped * (TOTAL_FRAMES - 1))));

      setActiveIndex((prev) => (prev === idx ? prev : idx));
      setActProgress((prev) => (Math.abs(prev - local) < 0.005 ? prev : local));
      setOverallProgress((prev) => (Math.abs(prev - clamped) < 0.002 ? prev : clamped));
      setCurrentFrame((prev) => (prev === frame ? prev : frame));

      if (seqSupportedRef.current === true) {
        const currentChunk = Math.floor((frame - 1) / CHUNK_SIZE);
        preloadChunk(currentChunk);
        preloadChunk(currentChunk + 1);
      }
    },
    [preloadChunk],
  );

  // Preload poster plate first, then remaining 4 plates, and probe frame-0001 once
  useEffect(() => {
    if (typeof window === "undefined") return;

    // 1. Poster first (Act I plate)
    const poster = new Image();
    poster.decoding = "async";
    poster.src = FILM_ACTS[0]!.localPlate;
    platesRef.current[0] = poster;

    // 2. Remaining act plates
    FILM_ACTS.slice(1).forEach((act, i) => {
      const img = new Image();
      img.decoding = "async";
      img.src = act.localPlate;
      platesRef.current[i + 1] = img;
    });

    // 3. Probe whether optional 600-frame folder exists on disk (graceful fallback if not)
    const probe = new Image();
    probe.onload = () => {
      seqSupportedRef.current = true;
      seqFramesRef.current.set(1, probe);
      preloadChunk(0);
    };
    probe.onerror = () => {
      seqSupportedRef.current = false;
    };
    probe.src = frameUrl(1);
  }, [preloadChunk]);

  // 60fps Canvas Render Loop (pauses when off-screen or tab hidden)
  useEffect(() => {
    const canvas = canvasRef.current;
    const track = trackRef.current;
    if (!canvas || !track) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();
    let inViewport = true;

    const io =
      typeof IntersectionObserver !== "undefined"
        ? new IntersectionObserver(
            (entries) => {
              inViewport = entries.some((e) => e.isIntersecting);
            },
            { rootMargin: "200px 0px" },
          )
        : null;
    io?.observe(track);

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const nextW = Math.max(320, Math.floor(rect.width * dpr));
      const nextH = Math.max(220, Math.floor(rect.height * dpr));
      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });

    const tick = (now: number) => {
      rafId = window.requestAnimationFrame(tick);
      if (!inViewport || document.hidden) return;

      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      if (playingRef.current && !draggingTimelineRef.current) {
        const nextTarget = targetProgressRef.current + dt / 22;
        if (nextTarget >= 1) {
          targetProgressRef.current = 1;
          playingRef.current = false;
          setIsPlaying(false);
        } else {
          targetProgressRef.current = nextTarget;
        }
      }

      const prevSmooth = smoothProgressRef.current;
      const diff = targetProgressRef.current - prevSmooth;
      const springStep = Math.abs(diff) < 0.0002 ? diff : diff * Math.min(1, dt * 14);
      const curSmooth = clamp(prevSmooth + springStep, 0, 1);
      smoothProgressRef.current = curSmooth;
      velocityRef.current = springStep / Math.max(0.008, dt);

      const ptr = pointerRef.current;
      ptr.x += (ptr.targetX - ptr.x) * Math.min(1, dt * 10);
      ptr.y += (ptr.targetY - ptr.y) * Math.min(1, dt * 10);

      const frameIdx = Math.max(1, Math.min(TOTAL_FRAMES, Math.round(1 + curSmooth * (TOTAL_FRAMES - 1))));
      syncUiState(curSmooth);

      drawCinemaFrame({
        ctx,
        W: canvas.width,
        H: canvas.height,
        p: curSmooth,
        frameIdx,
        velocity: velocityRef.current,
        pointerX: ptr.x,
        pointerY: ptr.y,
        time: now / 1000,
        plates: platesRef.current,
        seqFrames: seqFramesRef.current,
      });
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      io?.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [syncUiState]);

  useEffect(() => {
    if (prefersReducedMotion()) return;
    const track = trackRef.current;
    if (!track) return;

    const unbind = bindScrollProgress(
      track,
      (progress) => {
        if (!playingRef.current && !draggingTimelineRef.current) {
          targetProgressRef.current = progress;
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
  }, []);

  const scrollPageToProgress = useCallback((p: number, smoothScroll = false) => {
    const track = trackRef.current;
    if (!track || prefersReducedMotion()) return;
    const rect = track.getBoundingClientRect();
    const scrollable = Math.max(0, track.offsetHeight - window.innerHeight);
    if (scrollable <= 0) return;
    const targetY = window.scrollY + rect.top + clamp(p, 0, 1) * scrollable;
    window.scrollTo({ top: targetY, behavior: smoothScroll ? "smooth" : ("instant" as ScrollBehavior) });
  }, []);

  const togglePlay = () => {
    if (playingRef.current) {
      playingRef.current = false;
      setIsPlaying(false);
    } else {
      if (targetProgressRef.current >= 0.98) {
        targetProgressRef.current = 0;
        smoothProgressRef.current = 0;
      }
      playingRef.current = true;
      setIsPlaying(true);
    }
  };

  const selectAct = (idx: number) => {
    playingRef.current = false;
    setIsPlaying(false);
    const targetP = (idx + 0.08) / FILM_ACTS.length;
    targetProgressRef.current = targetP;
    scrollPageToProgress(targetP, true);
  };

  const scrubFromClientX = useCallback(
    (clientX: number) => {
      const bar = timelineRef.current;
      if (!bar) return;
      const r = bar.getBoundingClientRect();
      const nextP = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
      playingRef.current = false;
      setIsPlaying(false);
      targetProgressRef.current = nextP;
      scrollPageToProgress(nextP, false);
    },
    [scrollPageToProgress],
  );

  const onTimelinePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    draggingTimelineRef.current = true;
    scrubFromClientX(e.clientX);

    const onMove = (ev: PointerEvent) => {
      if (draggingTimelineRef.current) scrubFromClientX(ev.clientX);
    };
    const onUp = () => {
      draggingTimelineRef.current = false;
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const currentAct = FILM_ACTS[activeIndex] ?? FILM_ACTS[0]!;

  return (
    <>
      {/* ---------------- Editorial Prologue into The Inner Film ---------------- */}
      <div className="relative z-10 mx-auto max-w-[1200px] px-5 pb-10 pt-16 sm:px-8 sm:pb-14 sm:pt-24">
        <div
          data-theatre-reveal
          className="flex flex-col items-start justify-between gap-6 border-t border-white/15 pt-10 md:flex-row md:items-end"
        >
          <div>
            <Eyebrow n="02">The Inner Film · 600-Frame Scrubbed Sequence</Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-[#f7f4ee]">
              The market is external.{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-[#cba76b]">
                The battle is inside.
              </span>
            </h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-[#d6cebd]">
            As the camera flies through the candlestick pillars, scroll to scrub through the 600-frame film, drag the reel below, or press{" "}
            <strong className="font-medium text-[#f7f4ee]">Play Film</strong>.
          </p>
        </div>
      </div>

      {/* ---------------- Pinned Scroll-Scrubbed 600-Frame Stage ---------------- */}
      <section
        id="film"
        ref={trackRef}
        aria-label="The Inner Film — Interactive 600-frame scroll-scrubbed story"
        className="lp-pinned relative z-10 h-[440svh]"
      >
        <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto flex h-full max-h-[820px] w-full max-w-[1240px] flex-col justify-between">
            <div
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                pointerRef.current.targetX = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
                pointerRef.current.targetY = ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
              }}
              onPointerLeave={() => {
                pointerRef.current.targetX = 0;
                pointerRef.current.targetY = 0;
              }}
              className="lp-sq relative flex-1 overflow-hidden rounded-[28px] border border-[#cba76b]/30 bg-[#120f0b] shadow-[0_48px_120px_-36px_rgba(0,0,0,0.82)] sm:rounded-[36px]"
            >
              {/* Instant CSS/Image Poster Before Canvas Paints */}
              <div
                aria-hidden="true"
                className="absolute inset-0 bg-cover bg-center opacity-35"
                style={{ backgroundImage: "url(/landing/act-1-noise.jpg)" }}
              />

              {/* 60fps 600-Frame Scrubbed Canvas */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 block h-full w-full"
                aria-label={`Act ${activeIndex + 1}: ${currentAct.title} — ${currentAct.line} ${currentAct.italicPart}`}
              />

              <div className="lp-film-grain pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />

              {/* Top Cinema HUD Bar */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-8 sm:pt-7">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/55 px-3.5 py-1.5 backdrop-blur-xl">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      currentAct.accentTone === "loss"
                        ? "bg-[#cd8484] animate-pulse"
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

                <div className="flex items-center gap-2">
                  <span className="hidden rounded-full border border-white/12 bg-black/55 px-3 py-1.5 font-mono text-[11px] tabular-nums tracking-[0.1em] text-[#d6cebd] backdrop-blur-xl sm:inline-block">
                    {formatTimecode(overallProgress)} · FRM {String(currentFrame).padStart(3, "0")}/{TOTAL_FRAMES}
                  </span>
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? "Pause story film" : "Play story film"}
                    className="inline-flex items-center gap-2 rounded-full border border-[#cba76b]/50 bg-[#1c1813]/90 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#f0eae0] backdrop-blur-xl transition hover:border-[#cba76b] hover:bg-[#272219] active:scale-[0.97]"
                  >
                    <span className="text-[#cba76b]">{isPlaying ? "❚❚" : "▶"}</span>
                    <span>{isPlaying ? "Pause" : "Play Film"}</span>
                  </button>
                </div>
              </div>

              {/* Lower-Third Narrative Composition */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end p-5 sm:p-8 lg:p-12">
                <div
                  className="max-w-2xl transition-transform duration-200 ease-out"
                  style={{
                    transform: `translate3d(0, ${(1 - smooth(Math.min(1, actProgress * 3.5))) * 14}px, 0)`,
                  }}
                >
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

            {/* Interactive 600-Frame Scrubber Bar */}
            <div className="lp-theatre-panel mt-3.5 rounded-[22px] px-3.5 py-3 sm:px-5 sm:py-3.5">
              <div
                ref={timelineRef}
                role="slider"
                tabIndex={0}
                aria-label="Scrub through The Inner Film"
                aria-valuemin={1}
                aria-valuemax={TOTAL_FRAMES}
                aria-valuenow={currentFrame}
                onPointerDown={onTimelinePointerDown}
                onKeyDown={(e) => {
                  if (e.key === "ArrowRight") {
                    e.preventDefault();
                    const next = clamp(targetProgressRef.current + 0.05, 0, 1);
                    targetProgressRef.current = next;
                    scrollPageToProgress(next, false);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    const next = clamp(targetProgressRef.current - 0.05, 0, 1);
                    targetProgressRef.current = next;
                    scrollPageToProgress(next, false);
                  }
                }}
                className="group relative flex h-6 cursor-ew-resize touch-none items-center select-none"
              >
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-white/12 transition-[height] duration-150 group-hover:h-2.5">
                  {[0.2, 0.4, 0.6, 0.8].map((pos) => (
                    <span
                      key={pos}
                      aria-hidden="true"
                      style={{ left: `${pos * 100}%` }}
                      className="absolute inset-y-0 z-10 w-px bg-black/60"
                    />
                  ))}
                  <div
                    className="h-full rounded-full bg-gold-strong"
                    style={{ width: `${overallProgress * 100}%` }}
                  />
                </div>
                <span
                  aria-hidden="true"
                  style={{ left: `calc(${overallProgress * 100}% - 8px)` }}
                  className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-[#15120d] bg-gold-strong shadow-md transition-transform duration-150 group-hover:scale-125"
                />
              </div>

              <div className="mt-1.5 grid grid-cols-5 gap-1.5 sm:gap-2.5" role="tablist" aria-label="Five acts of The Inner Film">
                {FILM_ACTS.map((act, idx) => {
                  const isCurrent = idx === activeIndex;
                  return (
                    <button
                      key={act.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      onClick={() => selectAct(idx)}
                      className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition ${
                        isCurrent
                          ? "bg-[#cba76b]/20 text-[#f7f4ee] font-semibold"
                          : "text-[#a69d8c] hover:bg-white/[0.05] hover:text-white"
                      }`}
                    >
                      <span className="truncate text-[11px] sm:text-[12.5px]">
                        <span className="mr-1.5 font-mono text-[10px] text-[#cba76b]">{act.actNumber}</span>
                        {act.title.replace("THE ", "")}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Reduced Motion Static Fallback ---------------- */}
      <section className="lp-static relative z-10 px-5 py-16 sm:px-8" aria-label="The Inner Film — Five Acts">
        <div className="mx-auto max-w-[1100px] space-y-8">
          {FILM_ACTS.map((act) => (
            <article
              key={act.id}
              className="lp-sq grid overflow-hidden rounded-[28px] border border-line-strong/80 bg-surface md:grid-cols-2"
            >
              <div
                className="min-h-[260px] bg-cover bg-center"
                style={{ backgroundImage: `url(${act.localPlate})` }}
              />
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

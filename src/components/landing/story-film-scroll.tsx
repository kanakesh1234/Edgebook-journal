"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  THE INNER FILM — 60fps Interactive Scroll-Scrubbed Cinema Video Engine    */
/*                                                                            */
/*  Combines real HTML5 <video> cinema loops + preloaded 35mm photographic    */
/*  plates inside a unified 60fps WebGL/Canvas Anamorphic Video Compositor    */
/*  with damped spring scroll physics, interactive drag-scrubbing, pointer    */
/*  3D camera parallax, and frame-by-frame physical choreography across       */
/*  600 continuous frames (5 Acts × 120 frames). Zero charts or candles.      */
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
  videoUrl: string;
  accentTone: "loss" | "gold" | "profit";
}

const TOTAL_FRAMES = 600;

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
    localPlate: "/landing/act-1-noise.jpg",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-rain-falling-on-the-window-of-a-room-42881-large.mp4",
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
    localPlate: "/landing/act-2-stillness.jpg",
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-person-writing-in-a-notebook-with-a-pen-4706-large.mp4",
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
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-close-up-of-a-vintage-pocket-watch-42874-large.mp4",
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
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-turning-pages-of-an-old-book-42868-large.mp4",
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
    videoUrl: "https://assets.mixkit.co/videos/preview/mixkit-sunrise-over-a-calm-lake-and-mountains-41572-large.mp4",
    accentTone: "profit",
  },
];

function formatTimecode(progress: number): string {
  const totalSec = progress * 80; // 01:20:00 total film length
  const mins = Math.floor(totalSec / 60);
  const secs = Math.floor(totalSec % 60);
  const frames = Math.floor((totalSec % 1) * 24);
  return `00:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}:${String(frames).padStart(2, "0")}`;
}

/* ========================================================================== */
/*  60fps Scroll-Scrubbed Cinema Video Renderer                               */
/* ========================================================================== */

function drawCinemaVideoFrame(opts: {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  /** Smoothly damped 0..1 progress */
  p: number;
  /** Scroll velocity (-1..1) for reactive motion feel */
  velocity: number;
  /** Pointer parallax (-1..1) */
  pointerX: number;
  pointerY: number;
  /** Ambient time in seconds */
  time: number;
  plates: (HTMLImageElement | null)[];
  videos: (HTMLVideoElement | null)[];
}) {
  const { ctx, W, H, p, velocity, pointerX, pointerY, time, plates, videos } = opts;
  const scaled = clamp(p, 0, 0.9999) * FILM_ACTS.length;
  const actIdx = Math.min(FILM_ACTS.length - 1, Math.floor(scaled));
  const localP = clamp(scaled - actIdx, 0, 1);
  const absVel = Math.min(1, Math.abs(velocity) * 18);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#120f0b";
  ctx.fillRect(0, 0, W, H);

  // Helper to draw a single Act's full video + 3D parallax + physical choreography
  const renderActScene = (idx: number, prog: number, alpha: number) => {
    if (alpha <= 0.005) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    // 1. Continuous 3D Camera Dolly & Pointer Parallax on Base Video / Photographic Plate
    // Scrolling scrubs the camera forward through the scene (scale 1.0 -> 1.15)
    const camScale = lerp(1.02, 1.16, smooth(prog)) + absVel * 0.015;
    const camPanX = lerp(idx % 2 === 0 ? -28 : 28, 0, smooth(prog)) + pointerX * -18;
    const camPanY = lerp(16, -16, smooth(prog)) + pointerY * -12;

    const vid = videos[idx];
    const img = plates[idx];
    const source: CanvasImageSource | null =
      vid && vid.readyState >= 2 && vid.videoWidth > 0 ? vid : img && img.complete && img.naturalWidth > 0 ? img : null;

    if (source) {
      ctx.save();
      ctx.translate(W * 0.5 + camPanX, H * 0.5 + camPanY);
      ctx.scale(camScale, camScale);
      const sw = vid && source === vid ? vid.videoWidth : (img?.naturalWidth ?? 1280);
      const sh = vid && source === vid ? vid.videoHeight : (img?.naturalHeight ?? 800);
      const coverScale = Math.max(W / sw, H / sh);
      const dw = sw * coverScale;
      const dh = sh * coverScale;
      ctx.drawImage(source, -dw * 0.5, -dh * 0.5, dw, dh);
      ctx.restore();
    }

    // 2. Act-Specific Scroll-Scrubbed Physical Choreography (Every pixel of scroll moves the scene)
    if (idx === 0) {
      // ACT I: THE NOISE — Camera pushes toward rain-streaked window glass while bokeh & raindrops scrub with scroll
      const dollyZoom = lerp(1.0, 1.28, smooth(prog));

      // Out-of-focus city twilight bokeh orbs scrubbing with scroll & pointer depth
      for (let i = 0; i < 42; i++) {
        const seed1 = Math.sin(i * 19.7) * 0.5 + 0.5;
        const seed2 = Math.cos(i * 31.3) * 0.5 + 0.5;
        const depth = 0.4 + (i % 4) * 0.25;
        const bx =
          W * (0.28 + seed1 * 0.58) +
          Math.sin(prog * 5 + time * 0.4 + i) * 32 * depth +
          pointerX * -26 * depth;
        const by =
          H * (0.16 + seed2 * 0.58) +
          (prog - 0.5) * -90 * depth +
          pointerY * -18 * depth;
        const rad = (14 + (i % 6) * 14) * dollyZoom * (1 + absVel * 0.25);

        const colors = [
          "238, 178, 96",
          "118, 168, 212",
          "218, 108, 88",
          "246, 222, 178",
        ];
        const c = colors[i % 4]!;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
        g.addColorStop(0, `rgba(${c}, 0.24)`);
        g.addColorStop(0.65, `rgba(${c}, 0.09)`);
        g.addColorStop(1, `rgba(${c}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Refractive rain rivulets on window glass — scrubbed directly by scroll progress + ambient fall
      ctx.save();
      for (let i = 0; i < 95; i++) {
        const rx = ((i * 79.3) % W) + pointerX * -10;
        const scrollFall = prog * H * (0.9 + (i % 5) * 0.35);
        const ambientFall = time * (42 + (i % 7) * 14);
        const ry = ((i * 113.7 + scrollFall + ambientFall) % (H + 160)) - 80;
        const streakLen = (32 + (i % 6) * 22) * (1 + absVel * 0.8);

        const sg = ctx.createLinearGradient(rx, ry, rx - 3, ry + streakLen);
        sg.addColorStop(0, "rgba(225, 238, 250, 0)");
        sg.addColorStop(0.5, "rgba(228, 240, 255, 0.28)");
        sg.addColorStop(1, "rgba(255, 244, 218, 0.45)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 1.2 + (i % 3) * 0.5;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 2.5, ry + streakLen);
        ctx.stroke();
      }
      ctx.restore();

      // Foreground architectural window mullions separating as the camera pushes through the window
      ctx.save();
      ctx.translate(W * 0.5 + pointerX * -32, H * 0.5 + pointerY * -20);
      ctx.scale(dollyZoom, dollyZoom);
      const mullionW = 14;
      ctx.fillStyle = "rgba(11, 9, 7, 0.9)";
      ctx.fillRect(-W * 0.19, -H * 0.6, mullionW, H * 1.2);
      ctx.fillRect(W * 0.21, -H * 0.6, mullionW, H * 1.2);
      ctx.fillRect(-W * 0.6, H * 0.18, W * 1.2, 12);
      // Warm rim reflection on mullions
      ctx.fillStyle = "rgba(228, 184, 114, 0.24)";
      ctx.fillRect(-W * 0.19 + mullionW, -H * 0.6, 2, H * 1.2);
      ctx.fillRect(W * 0.21 + mullionW, -H * 0.6, 2, H * 1.2);
      ctx.restore();
    } else if (idx === 1) {
      // ACT II: THE STILLNESS — Sunlight beams & Venetian window shadows sweep across an open journal while the fountain pen writes live with scroll
      ctx.save();
      const sheetX = W * 0.58 + pointerX * -16;
      const sheetY = H * 0.48 + lerp(28, -10, smooth(prog)) + pointerY * -12;
      const sheetRot = lerp(-0.08, -0.025, smooth(prog));
      const sheetScale = lerp(0.94, 1.04, smooth(prog));

      ctx.translate(sheetX, sheetY);
      ctx.rotate(sheetRot);
      ctx.scale(sheetScale, sheetScale);

      // Physical drop shadow under the open journal
      ctx.shadowColor = "rgba(10, 7, 4, 0.68)";
      ctx.shadowBlur = 56;
      ctx.shadowOffsetX = -16;
      ctx.shadowOffsetY = 28;

      const jw = Math.min(540, W * 0.46);
      const jh = Math.min(360, H * 0.54);
      ctx.fillStyle = "#f8f3e7";
      ctx.beginPath();
      ctx.roundRect(-jw * 0.5, -jh * 0.5, jw, jh, 16);
      ctx.fill();
      ctx.shadowColor = "transparent";

      // Red archival margin rule
      ctx.strokeStyle = "rgba(182, 86, 82, 0.32)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-jw * 0.5 + 52, -jh * 0.5);
      ctx.lineTo(-jw * 0.5 + 52, jh * 0.5);
      ctx.stroke();

      // Horizontal ruled lines
      ctx.strokeStyle = "rgba(120, 106, 86, 0.18)";
      ctx.lineWidth = 1;
      for (let y = -jh * 0.5 + 64; y < jh * 0.5 - 24; y += 32) {
        ctx.beginPath();
        ctx.moveTo(-jw * 0.5 + 22, y);
        ctx.lineTo(jw * 0.5 - 22, y);
        ctx.stroke();
      }

      // Header metadata on the page
      ctx.fillStyle = "#8c6d2e";
      ctx.font = "600 11px monospace";
      ctx.fillText("SESSION PLAN · 09:05 AM NY · WRITTEN IN CALM", -jw * 0.5 + 68, -jh * 0.5 + 42);

      // Scroll-scrubbed live handwriting lines + moving fountain pen nib!
      const lines = [
        "If the overnight low sweeps and 5m closes inside,",
        "I take the single planned entry with defined risk.",
        "If the open is loud and choppy, I sit on my hands.",
      ];
      let penTipX = -jw * 0.5 + 68;
      let penTipY = -jh * 0.5 + 88;
      const writeProg = clamp(prog * 1.25, 0, 1);

      ctx.font = "italic 20px Georgia, serif";
      ctx.fillStyle = "#26221a";

      lines.forEach((lineText, row) => {
        const rowStart = row / lines.length;
        const rowEnd = (row + 1) / lines.length;
        const rowLocal = clamp((writeProg - rowStart) / (rowEnd - rowStart), 0, 1);
        if (rowLocal > 0) {
          const chars = Math.ceil(lineText.length * rowLocal);
          const visibleStr = lineText.slice(0, chars);
          const ry = -jh * 0.5 + 90 + row * 64;
          ctx.fillText(visibleStr, -jw * 0.5 + 68, ry);
          const measured = ctx.measureText(visibleStr).width;
          penTipX = -jw * 0.5 + 68 + measured;
          penTipY = ry - 6;
        }
      });

      // Draw the brass & ebony fountain pen moving with the live ink tip as you scroll!
      ctx.save();
      ctx.translate(penTipX + 8, penTipY - 4);
      ctx.rotate(-0.52 + Math.sin(prog * 36) * 0.025);
      ctx.shadowColor = "rgba(15, 11, 6, 0.45)";
      ctx.shadowBlur = 18;
      ctx.shadowOffsetY = 10;
      // Gold nib
      ctx.fillStyle = "#d8b062";
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(14, -6);
      ctx.lineTo(14, 6);
      ctx.closePath();
      ctx.fill();
      // Ebony barrel
      ctx.fillStyle = "#1c1814";
      ctx.beginPath();
      ctx.roundRect(14, -8, 170, 16, 7);
      ctx.fill();
      // Brass ring
      ctx.fillStyle = "#cba76b";
      ctx.fillRect(14, -8, 12, 16);
      ctx.restore();

      ctx.restore();

      // Slow-moving diagonal Venetian window blind shadows sweeping across the frame with scroll
      ctx.save();
      ctx.translate(W * 0.5 + (prog - 0.5) * 110, H * 0.5);
      ctx.rotate(-0.38);
      for (let s = -800; s <= 800; s += 115) {
        const sg = ctx.createLinearGradient(0, s, 0, s + 54);
        sg.addColorStop(0, "rgba(14, 10, 6, 0)");
        sg.addColorStop(0.5, "rgba(14, 10, 6, 0.34)");
        sg.addColorStop(1, "rgba(14, 10, 6, 0)");
        ctx.fillStyle = sg;
        ctx.fillRect(-1200, s, 2400, 54);
      }
      ctx.restore();
    } else if (idx === 2) {
      // ACT III: THE TEMPTATION — Scroll-scrubbed chiaroscuro mechanical chronograph approaching 09:30:00 & restraint shield
      const cx = W * 0.56 + pointerX * -18;
      const cy = H * 0.47 + pointerY * -14;
      const dialR = Math.min(W, H) * 0.27 * lerp(0.92, 1.08, smooth(prog));

      // Left crimson impulse wave receding as right golden restraint expands with scroll
      const impulseAlpha = 0.34 * (1 - smooth(prog));
      const restraintAlpha = 0.12 + 0.32 * smooth(prog);

      const leftGlow = ctx.createRadialGradient(cx - dialR * 1.1, cy, 10, cx - dialR * 0.8, cy, dialR * 1.8);
      leftGlow.addColorStop(0, `rgba(186, 72, 68, ${impulseAlpha})`);
      leftGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = leftGlow;
      ctx.fillRect(0, 0, W, H);

      const rightGlow = ctx.createRadialGradient(cx + dialR * 0.6, cy, 10, cx, cy, dialR * 1.9);
      rightGlow.addColorStop(0, `rgba(214, 174, 98, ${restraintAlpha})`);
      rightGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rightGlow;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(cx, cy);

      // Luminous Guardrail Ring that locks around the dial as restraint wins
      ctx.strokeStyle = `rgba(218, 182, 112, ${0.28 + 0.62 * smooth(prog)})`;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.arc(0, 0, dialR + 18, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * smooth(prog * 1.15));
      ctx.stroke();

      // Obsidian chronograph dial
      ctx.shadowColor = "rgba(0,0,0,0.78)";
      ctx.shadowBlur = 64;
      ctx.shadowOffsetY = 24;
      ctx.fillStyle = "rgba(20, 16, 12, 0.88)";
      ctx.beginPath();
      ctx.arc(0, 0, dialR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "rgba(208, 172, 104, 0.55)";
      ctx.lineWidth = 3;
      ctx.stroke();

      // 60 chapter ticks
      for (let i = 0; i < 60; i++) {
        const ang = (i / 60) * Math.PI * 2 - Math.PI * 0.5;
        const isMaj = i % 5 === 0;
        const r0 = isMaj ? dialR - 22 : dialR - 11;
        const r1 = dialR - 4;
        ctx.strokeStyle = isMaj ? "rgba(232, 198, 132, 0.88)" : "rgba(200, 180, 145, 0.28)";
        ctx.lineWidth = isMaj ? 2.2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.stroke();
      }

      // Live digital sub-readout scrubbed by scroll: 09:29:50 -> 09:30:00
      const secs = Math.min(60, 50 + prog * 10);
      const secWhole = Math.floor(secs);
      const timeStr = secWhole >= 60 ? "09 : 30 : 00  NY" : `09 : 29 : ${String(secWhole).padStart(2, "0")}  NY`;
      ctx.fillStyle = "rgba(226, 192, 124, 0.86)";
      ctx.font = "600 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(timeStr, 0, -dialR * 0.38);

      ctx.font = "italic 18px Georgia, serif";
      ctx.fillStyle = prog > 0.55 ? "rgba(116, 176, 140, 0.92)" : "rgba(236, 226, 208, 0.68)";
      ctx.fillText(prog > 0.55 ? "Impulse passed · Stillness held" : "Approaching the bell…", 0, dialR * 0.44);

      // Hour hand
      const hourAng = ((9 + 29.9 / 60) / 12) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(hourAng);
      ctx.strokeStyle = "#dfb970";
      ctx.lineWidth = 5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-16, 0);
      ctx.lineTo(dialR * 0.52, 0);
      ctx.stroke();
      ctx.restore();

      // Minute hand
      const minAng = ((29.83 + prog * 0.17) / 60) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(minAng);
      ctx.strokeStyle = "#f2d89e";
      ctx.lineWidth = 3.2;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-22, 0);
      ctx.lineTo(dialR * 0.76, 0);
      ctx.stroke();
      ctx.restore();

      // Second hand scrubbed directly by scroll!
      const secAng = (secs / 60) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(secAng);
      ctx.strokeStyle = prog > 0.55 ? "#74b08c" : "#cd8484";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(dialR * 0.84, 0);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, 7, 0, Math.PI * 2);
      ctx.fillStyle = "#e5c178";
      ctx.fill();
      ctx.restore();
    } else if (idx === 3) {
      // ACT IV: THE MIRROR — Layered archival autopsy pages fanning and gliding in 3D depth with scroll
      const cards = [
        {
          date: "14 SEPT · AUTOPSY #12",
          quote: "“Moved the stop early because I watched P&L instead of structure.”",
          badge: "Mistake Named",
          tone: "#ac5157",
          baseX: -195,
          baseY: 28,
          baseRot: -0.13,
        },
        {
          date: "03 OCT · AUTOPSY #29",
          quote: "“Paused after one loss instead of forcing a revenge entry.”",
          badge: "Habit Shifting",
          tone: "#8c6d2e",
          baseX: 0,
          baseY: 0,
          baseRot: -0.03,
        },
        {
          date: "02 NOV · AUTOPSY #48",
          quote: "“Waited 40 minutes for the clean 5m close. Zero interference.”",
          badge: "Pattern Retired · A+",
          tone: "#40795b",
          baseX: 195,
          baseY: -24,
          baseRot: 0.07,
        },
      ];

      cards.forEach((c, cIdx) => {
        const reveal = smooth(clamp((prog * 1.35) - cIdx * 0.22, 0, 1));
        const depthFactor = 0.7 + cIdx * 0.25;
        const cx =
          W * 0.58 +
          c.baseX * lerp(0.55, 1.05, smooth(prog)) +
          pointerX * -22 * depthFactor;
        const cy =
          H * 0.46 +
          c.baseY +
          (1 - reveal) * 55 +
          pointerY * -14 * depthFactor;
        const rot = c.baseRot * lerp(1.4, 0.75, smooth(prog));

        ctx.save();
        ctx.globalAlpha = alpha * (0.25 + 0.75 * reveal);
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        const cw = Math.min(340, W * 0.34);
        const ch = Math.min(230, H * 0.38);

        ctx.shadowColor = "rgba(8, 6, 4, 0.62)";
        ctx.shadowBlur = 42;
        ctx.shadowOffsetX = -10;
        ctx.shadowOffsetY = 20;

        ctx.fillStyle = cIdx === 2 ? "#fcf9f1" : "#f2eadb";
        ctx.beginPath();
        ctx.roundRect(-cw * 0.5, -ch * 0.5, cw, ch, 14);
        ctx.fill();
        ctx.shadowColor = "transparent";

        // Red margin line
        ctx.strokeStyle = "rgba(176, 84, 84, 0.26)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-cw * 0.5 + 36, -ch * 0.5);
        ctx.lineTo(-cw * 0.5 + 36, ch * 0.5);
        ctx.stroke();

        ctx.fillStyle = c.tone;
        ctx.font = "600 10.5px monospace";
        ctx.fillText(c.date, -cw * 0.5 + 50, -ch * 0.5 + 34);

        ctx.fillStyle = "#26221a";
        ctx.font = "italic 16px Georgia, serif";
        // Wrap quote into 2 lines
        const words = c.quote.split(" ");
        const mid = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, mid).join(" "), -cw * 0.5 + 50, -ch * 0.5 + 76);
        ctx.fillText(words.slice(mid).join(" "), -cw * 0.5 + 50, -ch * 0.5 + 102);

        // Status pill
        ctx.fillStyle = c.tone;
        ctx.font = "600 11px sans-serif";
        ctx.fillText(`● ${c.badge}`, -cw * 0.5 + 50, ch * 0.5 - 28);

        ctx.restore();
      });

      // Warm mirror glass reflection beam sweeping across the pages as you scroll
      const beamX = lerp(-W * 0.3, W * 1.1, smooth(prog));
      const glassGrad = ctx.createLinearGradient(beamX - 180, 0, beamX + 180, H);
      glassGrad.addColorStop(0, "rgba(255, 236, 196, 0)");
      glassGrad.addColorStop(0.5, "rgba(255, 236, 196, 0.18)");
      glassGrad.addColorStop(1, "rgba(255, 236, 196, 0)");
      ctx.fillStyle = glassGrad;
      ctx.fillRect(0, 0, W, H);
    } else if (idx === 4) {
      // ACT V: THE QUIET EDGE — Sunrise rises with scroll, golden water reflections shimmer, and the closed journal rests in peace
      const sunX = W * 0.54 + pointerX * -14;
      const sunY = H * lerp(0.60, 0.44, smooth(prog)) + pointerY * -10;
      const bloomR = Math.max(W, H) * lerp(0.32, 0.58, smooth(prog));

      const sunGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, bloomR);
      sunGrad.addColorStop(0, `rgba(255, 248, 224, ${0.42 + 0.35 * smooth(prog)})`);
      sunGrad.addColorStop(0.35, `rgba(238, 192, 114, ${0.22 + 0.18 * smooth(prog)})`);
      sunGrad.addColorStop(1, "rgba(20, 16, 12, 0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, W, H);

      // Shimmering golden-hour lake reflection ripples scrubbed by scroll + gentle wave
      ctx.save();
      for (let i = 0; i < 48; i++) {
        const tRow = i / 48;
        const wy = H * 0.62 + Math.pow(tRow, 1.3) * (H * 0.24);
        const waveOffset = Math.sin(prog * 14 + time * 1.8 + i * 0.9) * (18 + tRow * 35);
        const wLen = (36 + (1 - tRow) * 130) * (0.7 + 0.3 * smooth(prog));
        ctx.strokeStyle = `rgba(255, 232, 182, ${(1 - tRow) * 0.34})`;
        ctx.lineWidth = 1.2 + (1 - tRow) * 1.4;
        ctx.beginPath();
        ctx.moveTo(sunX + waveOffset - wLen * 0.5, wy);
        ctx.lineTo(sunX + waveOffset + wLen * 0.5, wy);
        ctx.stroke();
      }
      ctx.restore();
    }

    ctx.restore();
  };

  // Render current act and smooth optical cross-dissolve during the transition window (last 20% of each act)
  const transitionWindow = 0.22;
  if (actIdx < FILM_ACTS.length - 1 && localP > 1 - transitionWindow) {
    const tBlend = smooth((localP - (1 - transitionWindow)) / transitionWindow);
    renderActScene(actIdx, localP, 1);
    renderActScene(actIdx + 1, 0, tBlend);
  } else {
    renderActScene(actIdx, localP, 1);
  }

  // 3. Reactive Anamorphic Lens Flare & Scroll-Velocity Vignette
  const flareX = W * (0.5 + pointerX * 0.28);
  const flareY = H * (0.28 + pointerY * 0.18);
  const flare = ctx.createRadialGradient(flareX, flareY, 0, flareX, flareY, W * 0.45);
  flare.addColorStop(0, `rgba(232, 194, 124, ${0.06 + absVel * 0.12})`);
  flare.addColorStop(1, "rgba(0, 0, 0, 0)");
  ctx.fillStyle = flare;
  ctx.fillRect(0, 0, W, H);

  // Editorial readability gradient scrim (top HUD + bottom story typography)
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, "rgba(12, 10, 8, 0.56)");
  scrim.addColorStop(0.28, "rgba(12, 10, 8, 0.10)");
  scrim.addColorStop(0.58, "rgba(12, 10, 8, 0.24)");
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

  // Target vs damped smooth progress for buttery 60fps video scrubbing
  const targetProgressRef = useRef(0);
  const smoothProgressRef = useRef(0);
  const velocityRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const playingRef = useRef(false);
  const draggingTimelineRef = useRef(false);

  const platesRef = useRef<(HTMLImageElement | null)[]>([null, null, null, null, null]);
  const videosRef = useRef<(HTMLVideoElement | null)[]>([null, null, null, null, null]);

  const [activeIndex, setActiveIndex] = useState(0);
  const [actProgress, setActProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);

  const syncUiState = useCallback((p: number) => {
    const clamped = clamp(p, 0, 1);
    const scaled = clamped * FILM_ACTS.length;
    const idx = Math.min(FILM_ACTS.length - 1, Math.floor(scaled));
    const local = clamp(scaled - idx, 0, 1);
    const frame = Math.max(1, Math.min(TOTAL_FRAMES, Math.round(1 + clamped * (TOTAL_FRAMES - 1))));

    setActiveIndex((prev) => (prev === idx ? prev : idx));
    setActProgress((prev) => (Math.abs(prev - local) < 0.005 ? prev : local));
    setOverallProgress((prev) => (Math.abs(prev - clamped) < 0.002 ? prev : clamped));
    setCurrentFrame((prev) => (prev === frame ? prev : frame));
  }, []);

  // Preload photographic plates and background HTML5 <video> streams
  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = prefersReducedMotion();

    FILM_ACTS.forEach((act, idx) => {
      const img = new Image();
      img.decoding = "async";
      img.src = act.localPlate;
      platesRef.current[idx] = img;

      if (!reduce) {
        const vid = document.createElement("video");
        vid.crossOrigin = "anonymous";
        vid.muted = true;
        vid.loop = true;
        vid.playsInline = true;
        vid.preload = idx <= 1 ? "auto" : "metadata";
        vid.src = act.videoUrl;
        videosRef.current[idx] = vid;
      }
    });

    return () => {
      videosRef.current.forEach((v) => {
        if (v) {
          v.pause();
          v.removeAttribute("src");
        }
      });
    };
  }, []);

  // Keep only the active & next act's <video> playing/scrubbed for optimal CPU/GPU performance
  useEffect(() => {
    if (prefersReducedMotion()) return;
    videosRef.current.forEach((vid, idx) => {
      if (!vid) return;
      if (idx === activeIndex || idx === activeIndex + 1) {
        if (vid.paused) {
          vid.play().catch(() => undefined);
        }
      } else if (!vid.paused) {
        vid.pause();
      }
    });
  }, [activeIndex]);

  // Master 60fps Interactive Video Scroll Loop (Damped spring scrub + Canvas compositor)
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    let lastTime = performance.now();

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
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
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      // If auto-playing, advance targetProgress smoothly
      if (playingRef.current && !draggingTimelineRef.current) {
        const nextTarget = targetProgressRef.current + dt / 22; // 22-second full 5-act cinema film
        if (nextTarget >= 1) {
          targetProgressRef.current = 1;
          playingRef.current = false;
          setIsPlaying(false);
        } else {
          targetProgressRef.current = nextTarget;
        }
      }

      // Damped spring interpolation so scroll-scrubbing feels like butter
      const prevSmooth = smoothProgressRef.current;
      const diff = targetProgressRef.current - prevSmooth;
      const springStep = Math.abs(diff) < 0.0002 ? diff : diff * Math.min(1, dt * 14);
      const curSmooth = clamp(prevSmooth + springStep, 0, 1);
      smoothProgressRef.current = curSmooth;
      velocityRef.current = springStep / Math.max(0.008, dt);

      // Smooth pointer parallax interpolation
      const ptr = pointerRef.current;
      ptr.x += (ptr.targetX - ptr.x) * Math.min(1, dt * 10);
      ptr.y += (ptr.targetY - ptr.y) * Math.min(1, dt * 10);

      // Sync video playbackRate slightly with scroll velocity for tactile video feel
      const activeVid = videosRef.current[Math.min(FILM_ACTS.length - 1, Math.floor(curSmooth * FILM_ACTS.length))];
      if (activeVid && !activeVid.paused) {
        const boost = clamp(1 + Math.abs(velocityRef.current) * 4, 0.85, 2.2);
        if (Math.abs(activeVid.playbackRate - boost) > 0.1) {
          try {
            activeVid.playbackRate = boost;
          } catch {
            /* ignore */
          }
        }
      }

      syncUiState(curSmooth);

      drawCinemaVideoFrame({
        ctx,
        W: canvas.width,
        H: canvas.height,
        p: curSmooth,
        velocity: velocityRef.current,
        pointerX: ptr.x,
        pointerY: ptr.y,
        time: now / 1000,
        plates: platesRef.current,
        videos: videosRef.current,
      });

      rafId = window.requestAnimationFrame(tick);
    };

    rafId = window.requestAnimationFrame(tick);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [syncUiState]);

  // Bind page scroll to targetProgressRef
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

  // Interactive Drag-Scrubbing on the Film Timeline Bar
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
      {/* ---------------- Editorial Prologue Transition into The Inner Film ---------------- */}
      <div className="mx-auto max-w-[1200px] px-5 pb-10 pt-16 sm:px-8 sm:pb-14 sm:pt-24">
        <div className="flex flex-col items-start justify-between gap-6 border-t border-line pt-10 md:flex-row md:items-end">
          <div>
            <Eyebrow n="02">The Inner Film · Interactive Video Scroll</Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-ink">
              The market is external.{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                The battle is inside.
              </span>
            </h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
            Scroll to scrub through the 600-frame film at your own pace, drag the timeline reel below, or press{" "}
            <strong className="font-medium text-ink">Play Story Film</strong>.
          </p>
        </div>
      </div>

      {/* ---------------- Pinned Scroll-Scrubbed 60fps Video Stage ---------------- */}
      <section
        id="film"
        ref={trackRef}
        aria-label="The Inner Film — Interactive scroll-scrubbed video story"
        className="lp-pinned relative h-[480svh]"
      >
        <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-3 py-4 sm:px-6 sm:py-6 lg:px-8">
          <div className="mx-auto flex h-full max-h-[840px] w-full max-w-[1240px] flex-col justify-between">
            {/* Widescreen Interactive Video Viewport */}
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
              className="lp-sq relative flex-1 overflow-hidden rounded-[28px] border border-line-strong/80 bg-[#120f0b] shadow-[0_48px_120px_-36px_rgba(0,0,0,0.72)] sm:rounded-[36px]"
            >
              {/* 60fps Scroll-Scrubbed Hybrid Video + Optical Choreography Canvas */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 block h-full w-full"
                aria-label={`Act ${activeIndex + 1}: ${currentAct.title} — ${currentAct.line} ${currentAct.italicPart}`}
              />

              {/* Subtle 35mm Film Grain Overlay */}
              <div className="lp-film-grain pointer-events-none absolute inset-0 opacity-25" aria-hidden />

              {/* Top Cinema HUD Bar (Apple HIG Translucent Material + Live Frame & Timecode Counter) */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-8 sm:pt-7">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/45 px-3.5 py-1.5 backdrop-blur-xl">
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
                  <span className="hidden rounded-full border border-white/12 bg-black/45 px-3 py-1.5 font-mono text-[11px] tabular-nums tracking-[0.1em] text-[#d6cebd] backdrop-blur-xl sm:inline-block">
                    {formatTimecode(overallProgress)} · FRM {String(currentFrame).padStart(3, "0")}/{TOTAL_FRAMES}
                  </span>
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? "Pause story film" : "Play story film"}
                    className="inline-flex items-center gap-2 rounded-full border border-[#cba76b]/50 bg-[#1c1813]/85 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#f0eae0] backdrop-blur-xl transition hover:border-[#cba76b] hover:bg-[#272219] active:scale-[0.97]"
                  >
                    <span className="text-[#cba76b]">{isPlaying ? "❚❚" : "▶"}</span>
                    <span>{isPlaying ? "Pause" : "Play Film"}</span>
                  </button>
                </div>
              </div>

              {/* Lower-Third Narrative Composition & Scroll-Synced Progressive Reveal */}
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

            {/* Interactive Draggable Video Scrubber + 5-Act Chapter Bar */}
            <div className="mt-3.5 rounded-[22px] border border-line bg-surface/92 px-3.5 py-3 shadow-[var(--shadow-rest)] backdrop-blur-xl sm:px-5 sm:py-3.5">
              {/* Continuous Draggable Video Scrub Track */}
              <div
                ref={timelineRef}
                role="slider"
                tabIndex={0}
                aria-label="Scrub through The Inner Film"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={Math.round(overallProgress * 100)}
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
                {/* Film Sprocket Tick Marks */}
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink/[0.09] transition-[height] duration-150 group-hover:h-2.5">
                  {/* Act divider ticks */}
                  {[0.2, 0.4, 0.6, 0.8].map((pos) => (
                    <span
                      key={pos}
                      aria-hidden
                      style={{ left: `${pos * 100}%` }}
                      className="absolute inset-y-0 z-10 w-px bg-surface/80"
                    />
                  ))}
                  {/* Scrubbed Playhead Fill */}
                  <div
                    className="h-full rounded-full bg-gold-strong"
                    style={{ width: `${overallProgress * 100}%` }}
                  />
                </div>

                {/* Playhead Thumb Handle */}
                <span
                  aria-hidden
                  style={{ left: `calc(${overallProgress * 100}% - 8px)` }}
                  className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-surface bg-gold-strong shadow-md transition-transform duration-150 group-hover:scale-125"
                />
              </div>

              {/* 5-Act Chapter Selector Buttons */}
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
                          ? "bg-gold/14 text-ink font-semibold"
                          : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                      }`}
                    >
                      <span className="truncate text-[11px] sm:text-[12.5px]">
                        <span className="mr-1.5 font-mono text-[10px] text-gold">{act.actNumber}</span>
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

      {/* ---------------- Reduced Motion Fallback ---------------- */}
      <section className="lp-static px-5 py-16 sm:px-8" aria-label="The Inner Film — Five Acts">
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

"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { bindScrollProgress, clamp, lerp, prefersReducedMotion, smooth } from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  THE INNER FILM — Full-Viewport 3D & Video-Scrolling Storytelling Theater  */
/*                                                                            */
/*  1. Real DOM <video> loops + 4K editorial photography (no CORS blocking,   */
/*     100% crisp Retina quality) + anti-aliased 1080p local poster plates.   */
/*  2. Transparent 2x Retina Vector Canvas Overlay for frame-accurate         */
/*     scroll-scrubbed choreography (rain rivulets, live fountain-pen         */
/*     handwriting, ticking mechanical chronograph, 3D fanning journal        */
/*     pages, and golden-hour sunrise water shimmer).                         */
/*  3. 3D Perspective Camera Stage (rotateX / rotateY / translateZ) driven    */
/*     by scroll velocity and pointer position.                               */
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
  secondaryQuote: string;
  marginNote: string;
  timeStamp: string;
  localPlate: string;
  photoUrl: string;
  videoUrl: string;
  accentTone: "loss" | "gold" | "profit";
}

const TOTAL_FRAMES = 600;

export const FILM_ACTS: FilmActSpec[] = [
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
    secondaryQuote: "“Unwritten rules bend the moment the room speeds up.”",
    marginNote: "08:14 AM · Pre-session tension · Unwritten mind",
    timeStamp: "00:00:08:14",
    localPlate: "/landing/act-1-noise.jpg",
    photoUrl:
      "https://images.unsplash.com/photo-1515694346937-94d85e41e6f0?auto=format&fit=crop&w=2200&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-rain-falling-on-the-window-of-a-room-42881-large.mp4",
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
    secondaryQuote: "“When your rules are written in calm, the market cannot rewrite them in noise.”",
    marginNote: "09:05 AM · Linen ledger & fountain pen · Intention set",
    timeStamp: "00:00:24:00",
    localPlate: "/landing/act-2-stillness.jpg",
    photoUrl:
      "https://images.unsplash.com/photo-1455390582262-044cdead277a?auto=format&fit=crop&w=2200&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-person-writing-in-a-notebook-with-a-pen-4706-large.mp4",
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
    secondaryQuote: "“Sitting on your hands when your condition is absent is a winning session.”",
    marginNote: "09:29:58 AM · Chiaroscuro hesitation · Restraint over impulse",
    timeStamp: "00:00:42:18",
    localPlate: "/landing/act-3-temptation.jpg",
    photoUrl:
      "https://images.unsplash.com/photo-1508685096489-7aacd43bd3b1?auto=format&fit=crop&w=2200&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-close-up-of-a-vintage-pocket-watch-42874-large.mp4",
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
    secondaryQuote: "“A mistake named, reviewed, and practised is a tuition bill paid only once.”",
    marginNote: "10:45 AM · Layered autopsies & marginalia · Self-knowledge",
    timeStamp: "00:01:02:09",
    localPlate: "/landing/act-4-mirror.jpg",
    photoUrl:
      "https://images.unsplash.com/photo-1517842645767-c639042777db?auto=format&fit=crop&w=2200&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-turning-pages-of-an-old-book-42868-large.mp4",
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
    secondaryQuote: "“Process over outcome. Every single session.”",
    marginNote: "SESSION CLOSED · Sovereign process · Edgebook",
    timeStamp: "00:01:20:00",
    localPlate: "/landing/act-5-quiet-edge.jpg",
    photoUrl:
      "https://images.unsplash.com/photo-1506744038136-46273834b3fb?auto=format&fit=crop&w=2200&q=85",
    videoUrl:
      "https://assets.mixkit.co/videos/preview/mixkit-sunrise-over-a-calm-lake-and-mountains-41572-large.mp4",
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

/* ========================================================================== */
/*  2x Retina Vector Choreography Overlay (Transparent over real DOM video)   */
/* ========================================================================== */

function drawVectorChoreographyOverlay(opts: {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  p: number;
  velocity: number;
  pointerX: number;
  pointerY: number;
  time: number;
}) {
  const { ctx, W, H, p, velocity, pointerX, pointerY, time } = opts;
  const scaled = clamp(p, 0, 0.9999) * FILM_ACTS.length;
  const actIdx = Math.min(FILM_ACTS.length - 1, Math.floor(scaled));
  const localP = clamp(scaled - actIdx, 0, 1);
  const absVel = Math.min(1, Math.abs(velocity) * 18);

  ctx.clearRect(0, 0, W, H);

  const renderActOverlay = (idx: number, prog: number, alpha: number) => {
    if (alpha <= 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;

    if (idx === 0) {
      // ACT I: THE NOISE — Crisp vector rain droplets, twilight bokeh orbs & 3D window mullions
      const dollyZoom = lerp(1.0, 1.24, smooth(prog));

      for (let i = 0; i < 36; i++) {
        const s1 = Math.sin(i * 19.7) * 0.5 + 0.5;
        const s2 = Math.cos(i * 31.3) * 0.5 + 0.5;
        const depth = 0.4 + (i % 4) * 0.25;
        const bx =
          W * (0.22 + s1 * 0.66) +
          Math.sin(prog * 5 + time * 0.45 + i) * 34 * depth +
          pointerX * -28 * depth;
        const by =
          H * (0.14 + s2 * 0.58) +
          (prog - 0.5) * -95 * depth +
          pointerY * -18 * depth;
        const rad = (16 + (i % 6) * 15) * dollyZoom;

        const colors = ["238, 178, 96", "118, 168, 212", "218, 108, 88", "246, 222, 178"];
        const c = colors[i % 4]!;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
        g.addColorStop(0, `rgba(${c}, 0.22)`);
        g.addColorStop(0.65, `rgba(${c}, 0.07)`);
        g.addColorStop(1, `rgba(${c}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Falling refractive rain streaks scrubbed by scroll
      for (let i = 0; i < 80; i++) {
        const rx = ((i * 83.3) % W) + pointerX * -12;
        const scrollFall = prog * H * (0.95 + (i % 5) * 0.35);
        const ambientFall = time * (46 + (i % 7) * 14);
        const ry = ((i * 117.7 + scrollFall + ambientFall) % (H + 160)) - 80;
        const streakLen = (34 + (i % 6) * 20) * (1 + absVel * 0.75);

        const sg = ctx.createLinearGradient(rx, ry, rx - 3, ry + streakLen);
        sg.addColorStop(0, "rgba(225, 238, 250, 0)");
        sg.addColorStop(0.5, "rgba(228, 240, 255, 0.28)");
        sg.addColorStop(1, "rgba(255, 244, 218, 0.44)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 1.3;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 2.5, ry + streakLen);
        ctx.stroke();
      }

      // Architectural window mullions in 3D foreground depth
      ctx.save();
      ctx.translate(W * 0.5 + pointerX * -34, H * 0.5 + pointerY * -22);
      ctx.scale(dollyZoom, dollyZoom);
      ctx.fillStyle = "rgba(10, 8, 6, 0.78)";
      ctx.fillRect(-W * 0.19, -H * 0.6, 12, H * 1.2);
      ctx.fillRect(W * 0.21, -H * 0.6, 12, H * 1.2);
      ctx.fillStyle = "rgba(228, 184, 114, 0.22)";
      ctx.fillRect(-W * 0.19 + 12, -H * 0.6, 1.5, H * 1.2);
      ctx.fillRect(W * 0.21 + 12, -H * 0.6, 1.5, H * 1.2);
      ctx.restore();
    } else if (idx === 1) {
      // ACT II: THE STILLNESS — Live scroll-scrubbed fountain-pen handwriting on an archival journal sheet + Venetian sunlight beams
      ctx.save();
      const sheetX = W * 0.64 + pointerX * -20;
      const sheetY = H * 0.44 + lerp(24, -12, smooth(prog)) + pointerY * -14;
      const sheetRot = lerp(-0.06, -0.018, smooth(prog));
      const sheetScale = lerp(0.94, 1.03, smooth(prog));

      ctx.translate(sheetX, sheetY);
      ctx.rotate(sheetRot);
      ctx.scale(sheetScale, sheetScale);

      const jw = Math.min(480, W * 0.42);
      const jh = Math.min(310, H * 0.48);

      ctx.shadowColor = "rgba(10, 7, 4, 0.65)";
      ctx.shadowBlur = 52;
      ctx.shadowOffsetX = -14;
      ctx.shadowOffsetY = 24;

      ctx.fillStyle = "rgba(250, 245, 234, 0.94)";
      ctx.beginPath();
      ctx.roundRect(-jw * 0.5, -jh * 0.5, jw, jh, 16);
      ctx.fill();
      ctx.shadowColor = "transparent";

      // Red margin rule
      ctx.strokeStyle = "rgba(182, 86, 82, 0.32)";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(-jw * 0.5 + 46, -jh * 0.5);
      ctx.lineTo(-jw * 0.5 + 46, jh * 0.5);
      ctx.stroke();

      // Ruled lines
      ctx.strokeStyle = "rgba(120, 106, 86, 0.18)";
      ctx.lineWidth = 1;
      for (let y = -jh * 0.5 + 58; y < jh * 0.5 - 20; y += 30) {
        ctx.beginPath();
        ctx.moveTo(-jw * 0.5 + 20, y);
        ctx.lineTo(jw * 0.5 - 20, y);
        ctx.stroke();
      }

      ctx.fillStyle = "#8c6d2e";
      ctx.font = "600 10.5px monospace";
      ctx.fillText("SESSION INTENTION · 09:05 AM NY", -jw * 0.5 + 60, -jh * 0.5 + 38);

      const lines = [
        "If the Asia low sweeps and 5m closes inside,",
        "I take the single planned entry with calm risk.",
        "If the open is loud and choppy, I sit on my hands.",
      ];
      let penTipX = -jw * 0.5 + 60;
      let penTipY = -jh * 0.5 + 82;
      const writeProg = clamp(prog * 1.22, 0, 1);

      ctx.font = "italic 18px Georgia, serif";
      ctx.fillStyle = "#26221a";

      lines.forEach((lineText, row) => {
        const rStart = row / lines.length;
        const rEnd = (row + 1) / lines.length;
        const rLocal = clamp((writeProg - rStart) / (rEnd - rStart), 0, 1);
        if (rLocal > 0) {
          const chars = Math.ceil(lineText.length * rLocal);
          const sub = lineText.slice(0, chars);
          const ry = -jh * 0.5 + 84 + row * 60;
          ctx.fillText(sub, -jw * 0.5 + 60, ry);
          penTipX = -jw * 0.5 + 60 + ctx.measureText(sub).width;
          penTipY = ry - 5;
        }
      });

      // Moving brass & ebony fountain pen nib
      ctx.save();
      ctx.translate(penTipX + 6, penTipY - 3);
      ctx.rotate(-0.5 + Math.sin(prog * 34) * 0.025);
      ctx.shadowColor = "rgba(15, 11, 6, 0.45)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#d8b062";
      ctx.beginPath();
      ctx.moveTo(-7, 0);
      ctx.lineTo(12, -5.5);
      ctx.lineTo(12, 5.5);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1c1814";
      ctx.beginPath();
      ctx.roundRect(12, -7, 150, 14, 6);
      ctx.fill();
      ctx.fillStyle = "#cba76b";
      ctx.fillRect(12, -7, 10, 14);
      ctx.restore();

      ctx.restore();
    } else if (idx === 2) {
      // ACT III: THE TEMPTATION — Scroll-scrubbed chiaroscuro mechanical chronograph approaching 09:30:00 & restraint halo
      const cx = W * 0.65 + pointerX * -22;
      const cy = H * 0.44 + pointerY * -16;
      const dialR = Math.min(W, H) * 0.23 * lerp(0.94, 1.06, smooth(prog));

      ctx.save();
      ctx.translate(cx, cy);

      // Golden Guardrail Halo locking around the dial as restraint wins
      ctx.strokeStyle = `rgba(218, 182, 112, ${0.32 + 0.62 * smooth(prog)})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(0, 0, dialR + 16, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * smooth(prog * 1.15));
      ctx.stroke();

      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 54;
      ctx.shadowOffsetY = 20;
      ctx.fillStyle = "rgba(18, 14, 11, 0.86)";
      ctx.beginPath();
      ctx.arc(0, 0, dialR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "rgba(208, 172, 104, 0.55)";
      ctx.lineWidth = 2.5;
      ctx.stroke();

      for (let i = 0; i < 60; i++) {
        const ang = (i / 60) * Math.PI * 2 - Math.PI * 0.5;
        const isMaj = i % 5 === 0;
        const r0 = isMaj ? dialR - 18 : dialR - 9;
        const r1 = dialR - 3;
        ctx.strokeStyle = isMaj ? "rgba(232, 198, 132, 0.88)" : "rgba(200, 180, 145, 0.28)";
        ctx.lineWidth = isMaj ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.stroke();
      }

      const secs = Math.min(60, 50 + prog * 10);
      const secWhole = Math.floor(secs);
      const timeStr = secWhole >= 60 ? "09 : 30 : 00  NY" : `09 : 29 : ${String(secWhole).padStart(2, "0")}  NY`;
      ctx.fillStyle = "rgba(226, 192, 124, 0.9)";
      ctx.font = "600 12px monospace";
      ctx.textAlign = "center";
      ctx.fillText(timeStr, 0, -dialR * 0.36);

      ctx.font = "italic 16px Georgia, serif";
      ctx.fillStyle = prog > 0.55 ? "rgba(116, 176, 140, 0.95)" : "rgba(236, 226, 208, 0.72)";
      ctx.fillText(prog > 0.55 ? "Impulse passed · Stillness held" : "Approaching the bell…", 0, dialR * 0.44);

      const hourAng = ((9 + 29.9 / 60) / 12) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(hourAng);
      ctx.strokeStyle = "#dfb970";
      ctx.lineWidth = 4.5;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(dialR * 0.5, 0);
      ctx.stroke();
      ctx.restore();

      const minAng = ((29.83 + prog * 0.17) / 60) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(minAng);
      ctx.strokeStyle = "#f2d89e";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-18, 0);
      ctx.lineTo(dialR * 0.74, 0);
      ctx.stroke();
      ctx.restore();

      const secAng = (secs / 60) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(secAng);
      ctx.strokeStyle = prog > 0.55 ? "#74b08c" : "#cd8484";
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-24, 0);
      ctx.lineTo(dialR * 0.82, 0);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, 6, 0, Math.PI * 2);
      ctx.fillStyle = "#e5c178";
      ctx.fill();
      ctx.restore();
    } else if (idx === 3) {
      // ACT IV: THE MIRROR — Layered archival autopsy pages fanning in 3D depth with scroll
      const cards = [
        {
          date: "14 SEPT · AUTOPSY #12",
          quote: "“Moved the stop early because I watched P&L instead of structure.”",
          badge: "Mistake Named",
          tone: "#ac5157",
          baseX: -145,
          baseY: 22,
          baseRot: -0.11,
        },
        {
          date: "03 OCT · AUTOPSY #29",
          quote: "“Paused after one loss instead of forcing a revenge entry.”",
          badge: "Habit Shifting",
          tone: "#8c6d2e",
          baseX: 0,
          baseY: 0,
          baseRot: -0.02,
        },
        {
          date: "02 NOV · AUTOPSY #48",
          quote: "“Waited 40 minutes for the clean 5m close. Zero interference.”",
          badge: "Pattern Retired · A+",
          tone: "#40795b",
          baseX: 145,
          baseY: -22,
          baseRot: 0.06,
        },
      ];

      cards.forEach((c, cIdx) => {
        const reveal = smooth(clamp(prog * 1.35 - cIdx * 0.22, 0, 1));
        const depthFactor = 0.7 + cIdx * 0.25;
        const cx =
          W * 0.63 +
          c.baseX * lerp(0.55, 1.05, smooth(prog)) +
          pointerX * -22 * depthFactor;
        const cy =
          H * 0.43 +
          c.baseY +
          (1 - reveal) * 48 +
          pointerY * -14 * depthFactor;
        const rot = c.baseRot * lerp(1.35, 0.75, smooth(prog));

        ctx.save();
        ctx.globalAlpha = alpha * (0.28 + 0.72 * reveal);
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        const cw = Math.min(310, W * 0.32);
        const ch = Math.min(205, H * 0.34);

        ctx.shadowColor = "rgba(8, 6, 4, 0.6)";
        ctx.shadowBlur = 38;
        ctx.shadowOffsetX = -8;
        ctx.shadowOffsetY = 18;

        ctx.fillStyle = cIdx === 2 ? "rgba(252, 249, 241, 0.95)" : "rgba(242, 234, 219, 0.92)";
        ctx.beginPath();
        ctx.roundRect(-cw * 0.5, -ch * 0.5, cw, ch, 14);
        ctx.fill();
        ctx.shadowColor = "transparent";

        ctx.strokeStyle = "rgba(176, 84, 84, 0.26)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-cw * 0.5 + 32, -ch * 0.5);
        ctx.lineTo(-cw * 0.5 + 32, ch * 0.5);
        ctx.stroke();

        ctx.fillStyle = c.tone;
        ctx.font = "600 10px monospace";
        ctx.fillText(c.date, -cw * 0.5 + 44, -ch * 0.5 + 30);

        ctx.fillStyle = "#26221a";
        ctx.font = "italic 14.5px Georgia, serif";
        const words = c.quote.split(" ");
        const mid = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, mid).join(" "), -cw * 0.5 + 44, -ch * 0.5 + 68);
        ctx.fillText(words.slice(mid).join(" "), -cw * 0.5 + 44, -ch * 0.5 + 92);

        ctx.fillStyle = c.tone;
        ctx.font = "600 10.5px sans-serif";
        ctx.fillText(`● ${c.badge}`, -cw * 0.5 + 44, ch * 0.5 - 24);
        ctx.restore();
      });
    } else if (idx === 4) {
      // ACT V: THE QUIET EDGE — Golden-hour sunrise bloom & shimmering water light
      const sunX = W * 0.54 + pointerX * -16;
      const sunY = H * lerp(0.58, 0.42, smooth(prog)) + pointerY * -12;
      const bloomR = Math.max(W, H) * lerp(0.28, 0.52, smooth(prog));

      const sunGrad = ctx.createRadialGradient(sunX, sunY, 6, sunX, sunY, bloomR);
      sunGrad.addColorStop(0, `rgba(255, 248, 224, ${0.32 + 0.28 * smooth(prog)})`);
      sunGrad.addColorStop(0.38, `rgba(238, 192, 114, ${0.16 + 0.14 * smooth(prog)})`);
      sunGrad.addColorStop(1, "rgba(20, 16, 12, 0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, W, H);

      for (let i = 0; i < 42; i++) {
        const tRow = i / 42;
        const wy = H * 0.62 + Math.pow(tRow, 1.3) * (H * 0.24);
        const waveOffset = Math.sin(prog * 14 + time * 1.8 + i * 0.9) * (16 + tRow * 32);
        const wLen = (32 + (1 - tRow) * 120) * (0.7 + 0.3 * smooth(prog));
        ctx.strokeStyle = `rgba(255, 232, 182, ${(1 - tRow) * 0.3})`;
        ctx.lineWidth = 1.2 + (1 - tRow) * 1.2;
        ctx.beginPath();
        ctx.moveTo(sunX + waveOffset - wLen * 0.5, wy);
        ctx.lineTo(sunX + waveOffset + wLen * 0.5, wy);
        ctx.stroke();
      }
    }

    ctx.restore();
  };

  const transitionWindow = 0.22;
  if (actIdx < FILM_ACTS.length - 1 && localP > 1 - transitionWindow) {
    const tBlend = smooth((localP - (1 - transitionWindow)) / transitionWindow);
    renderActOverlay(actIdx, localP, 1 - tBlend * 0.7);
    renderActOverlay(actIdx + 1, 0, tBlend);
  } else {
    renderActOverlay(actIdx, localP, 1);
  }
}

/* ========================================================================== */
/*  Main StoryFilmScroll Component                                            */
/* ========================================================================== */

export function StoryFilmScroll() {
  const trackRef = useRef<HTMLElement>(null);
  const stageCardRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const videoElsRef = useRef<(HTMLVideoElement | null)[]>([null, null, null, null, null]);

  const targetProgressRef = useRef(0);
  const smoothProgressRef = useRef(0);
  const velocityRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const playingRef = useRef(false);
  const draggingTimelineRef = useRef(false);

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
    setActProgress((prev) => (Math.abs(prev - local) < 0.004 ? prev : local));
    setOverallProgress((prev) => (Math.abs(prev - clamped) < 0.002 ? prev : clamped));
    setCurrentFrame((prev) => (prev === frame ? prev : frame));
  }, []);

  // Play only the active & next act's DOM <video> for silky 60fps performance
  useEffect(() => {
    if (prefersReducedMotion()) return;
    videoElsRef.current.forEach((vid, idx) => {
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

  // Master 60fps Interactive Video Scroll + 3D Stage Transform Loop
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

      if (playingRef.current && !draggingTimelineRef.current) {
        const nextTarget = targetProgressRef.current + dt / 24;
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

      // Apply subtle 3D perspective tilt to the entire cinema stage based on pointer + scroll velocity!
      if (stageCardRef.current && !prefersReducedMotion()) {
        const rotX = ptr.y * -2.8 + clamp(velocityRef.current * 14, -3.5, 3.5);
        const rotY = ptr.x * 3.4;
        stageCardRef.current.style.transform = `perspective(1800px) rotateX(${rotX.toFixed(2)}deg) rotateY(${rotY.toFixed(2)}deg)`;
      }

      syncUiState(curSmooth);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      ctx.save();
      ctx.scale(dpr, dpr);
      drawVectorChoreographyOverlay({
        ctx,
        W: canvas.width / dpr,
        H: canvas.height / dpr,
        p: curSmooth,
        velocity: velocityRef.current,
        pointerX: ptr.x,
        pointerY: ptr.y,
        time: now / 1000,
      });
      ctx.restore();

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
  const kenBurnsScale = lerp(1.03, 1.14, smooth(actProgress));
  const kenBurnsX = lerp(activeIndex % 2 === 0 ? -18 : 18, 0, smooth(actProgress));

  return (
    <>
      {/* ---------------- Editorial Prologue Transition into The Inner Film ---------------- */}
      <div className="mx-auto max-w-[1280px] px-5 pb-10 pt-16 sm:px-8 sm:pb-14 sm:pt-24">
        <div className="flex flex-col items-start justify-between gap-6 border-t border-line pt-10 md:flex-row md:items-end">
          <div>
            <Eyebrow n="02">The Inner Film · Five-Act 3D Video Scroll</Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.8vw,3.9rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink">
              The market is external.{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                The battle is inside.
              </span>
            </h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
            Scroll to scrub through all 600 frames in 3D depth, drag the timeline reel, or press{" "}
            <strong className="font-medium text-ink">Play Film</strong>.
          </p>
        </div>
      </div>

      {/* ---------------- Full-Viewport Pinned 3D & Video-Scrolling Stage ---------------- */}
      <section
        id="film"
        ref={trackRef}
        aria-label="The Inner Film — Interactive scroll-scrubbed 3D video story"
        className="lp-pinned relative h-[520svh]"
      >
        <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-2.5 py-3 sm:px-5 sm:py-5 lg:px-8">
          <div className="mx-auto flex h-full max-h-[880px] w-full max-w-[1380px] flex-col justify-between">
            {/* Widescreen 3D-Tilting Cinema Theater Frame */}
            <div
              ref={stageCardRef}
              onPointerMove={(e) => {
                const r = e.currentTarget.getBoundingClientRect();
                pointerRef.current.targetX = ((e.clientX - r.left) / Math.max(1, r.width)) * 2 - 1;
                pointerRef.current.targetY = ((e.clientY - r.top) / Math.max(1, r.height)) * 2 - 1;
              }}
              onPointerLeave={() => {
                pointerRef.current.targetX = 0;
                pointerRef.current.targetY = 0;
              }}
              className="lp-sq relative flex-1 overflow-hidden rounded-[28px] border border-line-strong/80 bg-[#120f0b] shadow-[0_54px_130px_-38px_rgba(0,0,0,0.78)] will-change-transform sm:rounded-[36px]"
            >
              {/* Layer 1: Real DOM <video> + 4K Editorial Photography + Anti-Aliased 1080p Base Plates */}
              {FILM_ACTS.map((act, idx) => {
                const isCurrent = idx === activeIndex;
                const scale = isCurrent ? kenBurnsScale : 1.04;
                const shiftX = isCurrent ? kenBurnsX : 0;
                return (
                  <div
                    key={act.id}
                    aria-hidden={!isCurrent}
                    className="absolute inset-0 transition-opacity duration-700 ease-out"
                    style={{
                      opacity: isCurrent ? 1 : 0,
                      zIndex: isCurrent ? 2 : 1,
                      pointerEvents: "none",
                    }}
                  >
                    {/* 1A: Anti-Aliased 1080p Local Base Plate (Zero-latency, smooth anti-aliased horizon) */}
                    <div
                      className="absolute inset-0 bg-cover bg-center will-change-transform"
                      style={{
                        backgroundImage: `url(${act.localPlate})`,
                        transform: `translate3d(${shiftX * 0.5}px, 0, 0) scale(${scale})`,
                      }}
                    />

                    {/* 1B: 4K High-Resolution Editorial Photography (Crisp Retina photographic detail) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={act.photoUrl}
                      alt=""
                      loading={idx <= 1 ? "eager" : "lazy"}
                      decoding="async"
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                      }}
                      className="absolute inset-0 h-full w-full object-cover opacity-75 will-change-transform"
                      style={{
                        transform: `translate3d(${shiftX}px, 0, 0) scale(${scale})`,
                        filter:
                          idx === 0
                            ? "contrast(1.08) saturate(0.75) brightness(0.78)"
                            : idx === 1
                              ? "sepia(0.24) contrast(1.05) brightness(0.88)"
                              : idx === 2
                                ? "contrast(1.14) sepia(0.22) brightness(0.76)"
                                : idx === 3
                                  ? "sepia(0.28) contrast(1.06) brightness(0.84)"
                                  : "sepia(0.18) contrast(1.06) brightness(0.92)",
                      }}
                    />

                    {/* 1C: Native HTML5 <video> Motion Stream (No crossOrigin restriction so CDN videos play natively) */}
                    <video
                      ref={(el) => {
                        videoElsRef.current[idx] = el;
                      }}
                      src={act.videoUrl}
                      poster={act.localPlate}
                      muted
                      loop
                      playsInline
                      preload={idx <= 1 ? "auto" : "metadata"}
                      className="absolute inset-0 h-full w-full object-cover opacity-55 mix-blend-screen will-change-transform"
                      style={{
                        transform: `translate3d(${shiftX * 0.8}px, 0, 0) scale(${scale})`,
                      }}
                    />
                  </div>
                );
              })}

              {/* Layer 2: 2x Retina Vector Choreography Canvas (Scroll-scrubbed rain, fountain pen, chronograph, 3D pages, sunrise waves) */}
              <canvas
                ref={canvasRef}
                className="pointer-events-none absolute inset-0 z-[3] block h-full w-full"
              />

              {/* Layer 3: Anamorphic Readability Scrim & 35mm Film Grain */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-0 z-[4]"
                style={{
                  background:
                    "linear-gradient(180deg, rgba(12,10,8,0.58) 0%, rgba(12,10,8,0.12) 32%, rgba(12,10,8,0.28) 58%, rgba(12,10,8,0.90) 100%), radial-gradient(900px 500px at 22% 85%, rgba(12,10,8,0.65), transparent 75%)",
                }}
              />
              <div className="lp-film-grain pointer-events-none absolute inset-0 z-[5] opacity-25" aria-hidden />

              {/* Layer 4: Top Cinema HUD Bar */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-8 sm:pt-7">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 backdrop-blur-xl">
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
                  <span className="hidden rounded-full border border-white/12 bg-black/50 px-3 py-1.5 font-mono text-[11px] tabular-nums tracking-[0.1em] text-[#d6cebd] backdrop-blur-xl sm:inline-block">
                    {formatTimecode(overallProgress)} · FRM {String(currentFrame).padStart(3, "0")}/{TOTAL_FRAMES}
                  </span>
                  <button
                    type="button"
                    onClick={togglePlay}
                    aria-label={isPlaying ? "Pause story film" : "Play story film"}
                    className="inline-flex items-center gap-2 rounded-full border border-[#cba76b]/55 bg-[#1c1813]/85 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#f0eae0] backdrop-blur-xl transition hover:border-[#cba76b] hover:bg-[#272219] active:scale-[0.97]"
                  >
                    <span className="text-[#cba76b]">{isPlaying ? "❚❚" : "▶"}</span>
                    <span>{isPlaying ? "Pause" : "Play Film"}</span>
                  </button>
                </div>
              </div>

              {/* Layer 5: Lower-Third Narrative Composition & Beloved Quotes */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 flex flex-col justify-end p-5 sm:p-8 lg:p-12">
                <div
                  className="max-w-2xl transition-transform duration-200 ease-out"
                  style={{
                    transform: `translate3d(0, ${(1 - smooth(Math.min(1, actProgress * 3.5))) * 16}px, 0)`,
                  }}
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#cba76b]">
                    {currentAct.marginNote}
                  </p>

                  <h3 className="mt-2.5 font-display text-[clamp(1.75rem,4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.038em] text-[#f7f4ee]">
                    {currentAct.line}{" "}
                    <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.015em] text-[#dfbe82]">
                      {currentAct.italicPart}
                    </span>
                  </h3>

                  <p className="mt-3 max-w-xl text-[14.5px] leading-relaxed text-[#d6cebd] sm:text-[16.5px]">
                    {currentAct.reflection}
                  </p>

                  <p className="mt-3 font-serif text-[17px] italic text-[#dfbe82]/90 sm:text-[19px]">
                    {currentAct.secondaryQuote}
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

            {/* Interactive Draggable Video Scrubber + 5-Act Chapter Bar */}
            <div className="mt-3.5 rounded-[22px] border border-line bg-surface/92 px-3.5 py-3 shadow-[var(--shadow-rest)] backdrop-blur-xl sm:px-5 sm:py-3.5">
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
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink/[0.09] transition-[height] duration-150 group-hover:h-2.5">
                  {[0.2, 0.4, 0.6, 0.8].map((pos) => (
                    <span
                      key={pos}
                      aria-hidden
                      style={{ left: `${pos * 100}%` }}
                      className="absolute inset-y-0 z-10 w-px bg-surface/80"
                    />
                  ))}
                  <div
                    className="h-full rounded-full bg-gold-strong"
                    style={{ width: `${overallProgress * 100}%` }}
                  />
                </div>
                <span
                  aria-hidden
                  style={{ left: `calc(${overallProgress * 100}% - 8px)` }}
                  className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-surface bg-gold-strong shadow-md transition-transform duration-150 group-hover:scale-125"
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
                style={{ backgroundImage: `url(${act.photoUrl}), url(${act.localPlate})` }}
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

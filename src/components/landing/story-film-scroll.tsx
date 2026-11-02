"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import {
  bindScrollProgress,
  clamp,
  lerp,
  prefersReducedMotion,
  rangeProgress,
  scrollToPinnedProgress,
  smooth,
  updateComposureScore,
} from "./motion-utils";
import { Eyebrow } from "./ledger";

/* ========================================================================== */
/*  SCENE 02 — THE INNER FILM (Interactive Game-Theatre Mode & 600-Frame      */
/*  Scroll-Scrubbed Cinema Engine)                                            */
/*                                                                            */
/*  - Scroll-controlled 600-frame timeline (forward advances, reverse rewinds)*/
/*  - Optional Play/Pause Director's Cut + Keyboard [Space] / [←] [→]         */
/*  - Playable Game Decision Nodes in every Act: test Impulse vs. Discipline  */
/*    to shift the scene's optical atmosphere and live Composure Score.       */
/*  - 100% Candlestick & Chart Free. Pure Edgebook tokens.                    */
/* ========================================================================== */

export type DecisionBranch = "discipline" | "impulse";

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
  promptQuestion: string;
  disciplineChoice: {
    label: string;
    outcome: string;
    delta: string;
  };
  impulseChoice: {
    label: string;
    outcome: string;
    delta: string;
  };
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
    accentTone: "loss",
    promptQuestion: "08:14 AM — Pre-market noise is spiking. What is your first move?",
    disciplineChoice: {
      label: "Close external feeds & open blank plan",
      outcome: "External noise muted. Mind anchored to a single session thesis.",
      delta: "+12% Composure",
    },
    impulseChoice: {
      label: "Scan 10 tickers for early breakouts",
      outcome: "Attention fragmented across random moves before the bell.",
      delta: "−18% Composure",
    },
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
    accentTone: "gold",
    promptQuestion: "09:05 AM — You sit before the open page. How do you define today?",
    disciplineChoice: {
      label: "Write exact invalidation & 2-loss guardrail",
      outcome: "Rule locked in ink: wait for overnight sweep & 5m close.",
      delta: "+15% Composure",
    },
    impulseChoice: {
      label: "Keep the plan loosely in your head",
      outcome: "Unwritten boundaries bend the moment volatility expands.",
      delta: "−15% Composure",
    },
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
    promptQuestion: "09:29:58 AM — Price surges two seconds before your confirmation.",
    disciplineChoice: {
      label: "Hands off mouse · Wait for 5m close",
      outcome: "False opening drive rejected. Capital and composure preserved.",
      delta: "+20% Composure",
    },
    impulseChoice: {
      label: "Click market buy so you don't miss it",
      outcome: "Trapped at the top of an unconfirmed opening wick.",
      delta: "−24% Composure",
    },
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
    promptQuestion: "10:45 AM — The trade is closed. How do you record it?",
    disciplineChoice: {
      label: "Complete 5-question psychological autopsy",
      outcome: "Early-stop urge named and queued for evening Time Machine drill.",
      delta: "+16% Composure",
    },
    impulseChoice: {
      label: "Log only the dollar P&L and walk away",
      outcome: "The hidden behavioural flaw remains unnamed for tomorrow.",
      delta: "−14% Composure",
    },
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
    promptQuestion: "SESSION CLOSED — Your daily 20-card review feed is complete.",
    disciplineChoice: {
      label: "Close the ledger & step away in calm",
      outcome: "Zero carryover stress. Process sovereignty achieved.",
      delta: "Sovereign State",
    },
    impulseChoice: {
      label: "Keep staring at after-hours ticks",
      outcome: "Mental fatigue bleeds into tomorrow's preparation.",
      delta: "Fatigue Risk",
    },
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
/*  60fps 2.5D/3D Spatial Theatre Renderer (Zero Candlesticks / Zero Charts)  */
/* ========================================================================== */

function drawTheatreFrame(opts: {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  p: number;
  velocity: number;
  pointerX: number;
  pointerY: number;
  time: number;
  plates: (HTMLImageElement | null)[];
  branches: Record<number, DecisionBranch>;
}) {
  const { ctx, W, H, p, velocity, pointerX, pointerY, time, plates, branches } = opts;
  const scaled = clamp(p, 0, 0.9999) * FILM_ACTS.length;
  const actIdx = Math.min(FILM_ACTS.length - 1, Math.floor(scaled));
  const localP = clamp(scaled - actIdx, 0, 1);
  const absVel = Math.min(1, Math.abs(velocity) * 16);

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#120f0b";
  ctx.fillRect(0, 0, W, H);

  const renderActScene = (idx: number, prog: number, alpha: number) => {
    if (alpha <= 0.005) return;
    const branch = branches[idx] ?? "discipline";
    const isImpulse = branch === "impulse";

    ctx.save();
    ctx.globalAlpha = alpha;

    // 1. 3D Camera Dolly & Pointer Parallax on Base Photographic Plate
    const camScale = lerp(1.02, 1.18, smooth(prog)) + absVel * 0.015;
    const camPanX = lerp(idx % 2 === 0 ? -28 : 28, 0, smooth(prog)) + pointerX * -20;
    const camPanY = lerp(16, -16, smooth(prog)) + pointerY * -12;

    const img = plates[idx];
    if (img && img.complete && img.naturalWidth > 0) {
      ctx.save();
      ctx.translate(W * 0.5 + camPanX, H * 0.5 + camPanY);
      ctx.scale(camScale, camScale);
      const coverScale = Math.max(W / img.naturalWidth, H / img.naturalHeight);
      const dw = img.naturalWidth * coverScale;
      const dh = img.naturalHeight * coverScale;
      ctx.drawImage(img, -dw * 0.5, -dh * 0.5, dw, dh);
      ctx.restore();
    }

    // Subtle spatial perspective grid floor in the lower theatre plane (game environment depth cue)
    ctx.save();
    const horizonY = H * 0.56 + pointerY * -8;
    ctx.strokeStyle = isImpulse
      ? "rgba(205, 132, 132, 0.08)"
      : "rgba(203, 167, 107, 0.075)";
    ctx.lineWidth = 1;
    for (let ray = -6; ray <= 6; ray++) {
      const topX = W * 0.5 + ray * 42 + pointerX * -12;
      const botX = W * 0.5 + ray * 220 + pointerX * -36;
      ctx.beginPath();
      ctx.moveTo(topX, horizonY);
      ctx.lineTo(botX, H);
      ctx.stroke();
    }
    ctx.restore();

    // 2. Act-Specific Scroll-Scrubbed & Choice-Reactive Choreography
    if (idx === 0) {
      // ACT I: THE NOISE — Camera pushes through rain-streaked window glass & bokeh
      const dollyZoom = lerp(1.0, 1.28, smooth(prog));
      const bokehCount = isImpulse ? 52 : 34;

      for (let i = 0; i < bokehCount; i++) {
        const seed1 = Math.sin(i * 19.7) * 0.5 + 0.5;
        const seed2 = Math.cos(i * 31.3) * 0.5 + 0.5;
        const depth = 0.4 + (i % 4) * 0.25;
        const bx =
          W * (0.24 + seed1 * 0.62) +
          Math.sin(prog * 5 + time * (isImpulse ? 1.1 : 0.35) + i) * 30 * depth +
          pointerX * -24 * depth;
        const by =
          H * (0.14 + seed2 * 0.6) +
          (prog - 0.5) * -90 * depth +
          pointerY * -16 * depth;
        const rad = (14 + (i % 6) * 13) * dollyZoom;

        const colors = isImpulse
          ? ["218, 98, 88", "238, 158, 86", "205, 132, 132", "246, 200, 160"]
          : ["238, 178, 96", "118, 168, 212", "218, 108, 88", "246, 222, 178"];
        const c = colors[i % 4]!;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, rad);
        g.addColorStop(0, `rgba(${c}, ${isImpulse ? 0.3 : 0.22})`);
        g.addColorStop(0.65, `rgba(${c}, 0.08)`);
        g.addColorStop(1, `rgba(${c}, 0)`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, by, rad, 0, Math.PI * 2);
        ctx.fill();
      }

      // Rain rivulets scrubbed by scroll + subtle ambient drift
      ctx.save();
      for (let i = 0; i < 85; i++) {
        const rx = ((i * 79.3) % W) + pointerX * -10;
        const scrollFall = prog * H * (0.95 + (i % 5) * 0.35);
        const ambientFall = time * (isImpulse ? 64 : 28);
        const ry = ((i * 113.7 + scrollFall + ambientFall) % (H + 150)) - 75;
        const streakLen = (30 + (i % 6) * 22) * (1 + absVel * 0.7);

        const sg = ctx.createLinearGradient(rx, ry, rx - 2.5, ry + streakLen);
        sg.addColorStop(0, "rgba(225, 238, 250, 0)");
        sg.addColorStop(0.5, "rgba(228, 240, 255, 0.26)");
        sg.addColorStop(1, "rgba(255, 244, 218, 0.44)");
        ctx.strokeStyle = sg;
        ctx.lineWidth = 1.2 + (i % 3) * 0.4;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 2, ry + streakLen);
        ctx.stroke();
      }
      ctx.restore();

      // Foreground window mullions separating as camera pushes through
      ctx.save();
      ctx.translate(W * 0.5 + pointerX * -30, H * 0.5 + pointerY * -18);
      ctx.scale(dollyZoom, dollyZoom);
      const mullionW = 14;
      ctx.fillStyle = "rgba(11, 9, 7, 0.9)";
      ctx.fillRect(-W * 0.19, -H * 0.6, mullionW, H * 1.2);
      ctx.fillRect(W * 0.21, -H * 0.6, mullionW, H * 1.2);
      ctx.fillRect(-W * 0.6, H * 0.18, W * 1.2, 12);
      ctx.fillStyle = "rgba(228, 184, 114, 0.24)";
      ctx.fillRect(-W * 0.19 + mullionW, -H * 0.6, 2, H * 1.2);
      ctx.fillRect(W * 0.21 + mullionW, -H * 0.6, 2, H * 1.2);
      ctx.restore();
    } else if (idx === 1) {
      // ACT II: THE STILLNESS — Open linen ledger & fountain pen writing live with scroll
      ctx.save();
      const sheetX = W * 0.58 + pointerX * -16;
      const sheetY = H * 0.46 + lerp(26, -12, smooth(prog)) + pointerY * -10;
      const sheetRot = lerp(-0.075, -0.02, smooth(prog));
      const sheetScale = lerp(0.93, 1.05, smooth(prog));

      ctx.translate(sheetX, sheetY);
      ctx.rotate(sheetRot);
      ctx.scale(sheetScale, sheetScale);

      ctx.shadowColor = "rgba(10, 7, 4, 0.68)";
      ctx.shadowBlur = 54;
      ctx.shadowOffsetX = -14;
      ctx.shadowOffsetY = 26;

      const jw = Math.min(540, W * 0.46);
      const jh = Math.min(350, H * 0.52);
      ctx.fillStyle = "#f7f4ee";
      ctx.beginPath();
      ctx.roundRect(-jw * 0.5, -jh * 0.5, jw, jh, 16);
      ctx.fill();
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "rgba(172, 81, 87, 0.32)";
      ctx.lineWidth = 1.3;
      ctx.beginPath();
      ctx.moveTo(-jw * 0.5 + 52, -jh * 0.5);
      ctx.lineTo(-jw * 0.5 + 52, jh * 0.5);
      ctx.stroke();

      ctx.strokeStyle = "rgba(110, 102, 87, 0.18)";
      ctx.lineWidth = 1;
      for (let y = -jh * 0.5 + 64; y < jh * 0.5 - 24; y += 32) {
        ctx.beginPath();
        ctx.moveTo(-jw * 0.5 + 22, y);
        ctx.lineTo(jw * 0.5 - 22, y);
        ctx.stroke();
      }

      ctx.fillStyle = isImpulse ? "#ac5157" : "#8c6d2e";
      ctx.font = "600 11px monospace";
      ctx.fillText(
        isImpulse
          ? "UNWRITTEN SESSION · NO GUARDRAILS SET"
          : "SESSION PLAN · 09:05 AM NY · WRITTEN IN CALM",
        -jw * 0.5 + 68,
        -jh * 0.5 + 42,
      );

      const lines = isImpulse
        ? [
            "No written thesis — reacting to price ticks...",
            "Stop level undecided — watching P&L fluctuate...",
            "Impulse risk elevated before the opening bell.",
          ]
        : [
            "If the overnight low sweeps and 5m closes inside,",
            "I take the single planned entry with defined risk.",
            "If the open is loud and choppy, I sit on my hands.",
          ];
      let penTipX = -jw * 0.5 + 68;
      let penTipY = -jh * 0.5 + 88;
      const writeProg = clamp(prog * 1.25, 0, 1);

      ctx.font = "italic 19.5px Georgia, serif";
      ctx.fillStyle = isImpulse ? "#8f4149" : "#26221a";

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

      ctx.save();
      ctx.translate(penTipX + 8, penTipY - 4);
      ctx.rotate(-0.52 + Math.sin(prog * 32) * 0.025);
      ctx.shadowColor = "rgba(15, 11, 6, 0.42)";
      ctx.shadowBlur = 16;
      ctx.shadowOffsetY = 8;
      ctx.fillStyle = "#d8b062";
      ctx.beginPath();
      ctx.moveTo(-8, 0);
      ctx.lineTo(14, -6);
      ctx.lineTo(14, 6);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = "#1c1813";
      ctx.beginPath();
      ctx.roundRect(14, -8, 165, 16, 7);
      ctx.fill();
      ctx.fillStyle = "#cba76b";
      ctx.fillRect(14, -8, 11, 16);
      ctx.restore();
      ctx.restore();

      // Sunlit dust motes floating through diagonal Venetian blind shafts
      ctx.save();
      for (let m = 0; m < 28; m++) {
        const mx = ((m * 97.1 + prog * 120 + time * 12) % W);
        const my = ((m * 61.3 - prog * 60) % H + H) % H;
        ctx.fillStyle = "rgba(246, 224, 176, 0.38)";
        ctx.beginPath();
        ctx.arc(mx, my, 1.5 + (m % 3) * 0.8, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    } else if (idx === 2) {
      // ACT III: THE TEMPTATION — Chiaroscuro Chronograph & Pressure Tunnel Ring
      const cx = W * 0.56 + pointerX * -16;
      const cy = H * 0.46 + pointerY * -12;
      const dialR = Math.min(W, H) * 0.25 * lerp(0.92, 1.08, smooth(prog));

      const impulseAlpha = isImpulse ? 0.48 : 0.32 * (1 - smooth(prog));
      const restraintAlpha = isImpulse ? 0.08 : 0.14 + 0.34 * smooth(prog);

      const leftGlow = ctx.createRadialGradient(cx - dialR * 1.1, cy, 10, cx - dialR * 0.8, cy, dialR * 1.8);
      leftGlow.addColorStop(0, `rgba(172, 81, 87, ${impulseAlpha})`);
      leftGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = leftGlow;
      ctx.fillRect(0, 0, W, H);

      const rightGlow = ctx.createRadialGradient(cx + dialR * 0.6, cy, 10, cx, cy, dialR * 1.9);
      rightGlow.addColorStop(0, `rgba(203, 167, 107, ${restraintAlpha})`);
      rightGlow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = rightGlow;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      ctx.translate(cx, cy);

      // Concentric Game-Style Focus / Composure Rings
      for (let ring = 1; ring <= 2; ring++) {
        const rr = dialR + ring * 18 + Math.sin(time * 2.5 + ring) * 3;
        ctx.strokeStyle = isImpulse
          ? `rgba(205, 132, 132, ${0.42 / ring})`
          : `rgba(203, 167, 107, ${(0.3 + 0.55 * smooth(prog)) / ring})`;
        ctx.lineWidth = ring === 1 ? 2.4 : 1.2;
        ctx.beginPath();
        ctx.arc(0, 0, rr, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * smooth(prog * 1.15));
        ctx.stroke();
      }

      ctx.shadowColor = "rgba(0,0,0,0.75)";
      ctx.shadowBlur = 56;
      ctx.shadowOffsetY = 20;
      ctx.fillStyle = "rgba(21, 18, 13, 0.88)";
      ctx.beginPath();
      ctx.arc(0, 0, dialR, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowColor = "transparent";

      ctx.strokeStyle = "rgba(203, 167, 107, 0.55)";
      ctx.lineWidth = 2.8;
      ctx.stroke();

      for (let i = 0; i < 60; i++) {
        const ang = (i / 60) * Math.PI * 2 - Math.PI * 0.5;
        const isMaj = i % 5 === 0;
        const r0 = isMaj ? dialR - 20 : dialR - 10;
        const r1 = dialR - 4;
        ctx.strokeStyle = isMaj ? "rgba(232, 198, 132, 0.85)" : "rgba(200, 180, 145, 0.26)";
        ctx.lineWidth = isMaj ? 2 : 1;
        ctx.beginPath();
        ctx.moveTo(Math.cos(ang) * r0, Math.sin(ang) * r0);
        ctx.lineTo(Math.cos(ang) * r1, Math.sin(ang) * r1);
        ctx.stroke();
      }

      const secs = Math.min(60, 50 + prog * 10);
      const secWhole = Math.floor(secs);
      const timeStr = secWhole >= 60 ? "09 : 30 : 00  NY" : `09 : 29 : ${String(secWhole).padStart(2, "0")}  NY`;
      ctx.fillStyle = "rgba(226, 192, 124, 0.88)";
      ctx.font = "600 13px monospace";
      ctx.textAlign = "center";
      ctx.fillText(timeStr, 0, -dialR * 0.36);

      ctx.font = "italic 17.5px Georgia, serif";
      ctx.fillStyle = isImpulse
        ? "rgba(205, 132, 132, 0.92)"
        : prog > 0.55
          ? "rgba(116, 176, 140, 0.92)"
          : "rgba(240, 234, 224, 0.68)";
      ctx.fillText(
        isImpulse
          ? "Impulse clicked · Unconfirmed entry"
          : prog > 0.55
            ? "Impulse passed · Stillness held"
            : "Approaching the bell…",
        0,
        dialR * 0.44,
      );

      const hourAng = ((9 + 29.9 / 60) / 12) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(hourAng);
      ctx.strokeStyle = "#cba76b";
      ctx.lineWidth = 4.8;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-14, 0);
      ctx.lineTo(dialR * 0.5, 0);
      ctx.stroke();
      ctx.restore();

      const minAng = ((29.83 + prog * 0.17) / 60) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(minAng);
      ctx.strokeStyle = "#f0eae0";
      ctx.lineWidth = 3;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-20, 0);
      ctx.lineTo(dialR * 0.74, 0);
      ctx.stroke();
      ctx.restore();

      const secAng = (secs / 60) * Math.PI * 2 - Math.PI * 0.5;
      ctx.save();
      ctx.rotate(secAng);
      ctx.strokeStyle = isImpulse ? "#cd8484" : prog > 0.55 ? "#74b08c" : "#cd8484";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-26, 0);
      ctx.lineTo(dialR * 0.84, 0);
      ctx.stroke();
      ctx.restore();

      ctx.beginPath();
      ctx.arc(0, 0, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#cba76b";
      ctx.fill();
      ctx.restore();
    } else if (idx === 3) {
      // ACT IV: THE MIRROR — 3D Corridor of Floating Archival Autopsy Pages
      const cards = [
        {
          date: "14 SEPT · AUTOPSY #12",
          quote: "“Moved the stop early because I watched P&L instead of structure.”",
          badge: "Mistake Named",
          tone: "#ac5157",
          baseX: -185,
          baseY: 24,
          baseRot: -0.12,
        },
        {
          date: "03 OCT · AUTOPSY #29",
          quote: "“Paused after one loss instead of forcing a revenge entry.”",
          badge: "Habit Shifting",
          tone: "#8c6d2e",
          baseX: 0,
          baseY: -4,
          baseRot: -0.025,
        },
        {
          date: "02 NOV · AUTOPSY #48",
          quote: "“Waited 40 minutes for the clean 5m close. Zero interference.”",
          badge: isImpulse ? "Autopsy Skipped" : "Pattern Retired · A+",
          tone: isImpulse ? "#ac5157" : "#40795b",
          baseX: 185,
          baseY: -26,
          baseRot: 0.065,
        },
      ];

      cards.forEach((c, cIdx) => {
        const reveal = smooth(clamp(prog * 1.35 - cIdx * 0.22, 0, 1));
        const depthFactor = 0.7 + cIdx * 0.25;
        const cx =
          W * 0.58 +
          c.baseX * lerp(0.55, 1.05, smooth(prog)) +
          pointerX * -18 * depthFactor;
        const cy =
          H * 0.44 +
          c.baseY +
          (1 - reveal) * 50 +
          pointerY * -12 * depthFactor;
        const rot = c.baseRot * lerp(1.35, 0.75, smooth(prog));

        ctx.save();
        ctx.globalAlpha = alpha * (0.25 + 0.75 * reveal);
        ctx.translate(cx, cy);
        ctx.rotate(rot);

        const cw = Math.min(335, W * 0.34);
        const ch = Math.min(220, H * 0.36);

        ctx.shadowColor = "rgba(8, 6, 4, 0.60)";
        ctx.shadowBlur = 40;
        ctx.shadowOffsetX = -10;
        ctx.shadowOffsetY = 18;

        ctx.fillStyle = cIdx === 2 ? "#fcfaf5" : "#f7f4ee";
        ctx.beginPath();
        ctx.roundRect(-cw * 0.5, -ch * 0.5, cw, ch, 14);
        ctx.fill();
        ctx.shadowColor = "transparent";

        ctx.strokeStyle = "rgba(172, 81, 87, 0.26)";
        ctx.lineWidth = 1.1;
        ctx.beginPath();
        ctx.moveTo(-cw * 0.5 + 34, -ch * 0.5);
        ctx.lineTo(-cw * 0.5 + 34, ch * 0.5);
        ctx.stroke();

        ctx.fillStyle = c.tone;
        ctx.font = "600 10.5px monospace";
        ctx.fillText(c.date, -cw * 0.5 + 48, -ch * 0.5 + 34);

        ctx.fillStyle = "#26221a";
        ctx.font = "italic 15.5px Georgia, serif";
        const words = c.quote.split(" ");
        const mid = Math.ceil(words.length / 2);
        ctx.fillText(words.slice(0, mid).join(" "), -cw * 0.5 + 48, -ch * 0.5 + 74);
        ctx.fillText(words.slice(mid).join(" "), -cw * 0.5 + 48, -ch * 0.5 + 100);

        ctx.fillStyle = c.tone;
        ctx.font = "600 11px sans-serif";
        ctx.fillText(`● ${c.badge}`, -cw * 0.5 + 48, ch * 0.5 - 26);

        ctx.restore();
      });
    } else if (idx === 4) {
      // ACT V: THE QUIET EDGE — Sunrise rises with scroll & golden lake reflections
      const sunX = W * 0.54 + pointerX * -12;
      const sunY = H * lerp(0.6, 0.42, smooth(prog)) + pointerY * -8;
      const bloomR = Math.max(W, H) * lerp(0.32, 0.58, smooth(prog));

      const sunGrad = ctx.createRadialGradient(sunX, sunY, 8, sunX, sunY, bloomR);
      sunGrad.addColorStop(0, `rgba(255, 248, 224, ${0.42 + 0.35 * smooth(prog)})`);
      sunGrad.addColorStop(0.35, `rgba(203, 167, 107, ${0.22 + 0.18 * smooth(prog)})`);
      sunGrad.addColorStop(1, "rgba(20, 16, 12, 0)");
      ctx.fillStyle = sunGrad;
      ctx.fillRect(0, 0, W, H);

      ctx.save();
      for (let i = 0; i < 44; i++) {
        const tRow = i / 44;
        const wy = H * 0.6 + Math.pow(tRow, 1.3) * (H * 0.24);
        const waveOffset = Math.sin(prog * 14 + time * 1.4 + i * 0.9) * (16 + tRow * 32);
        const wLen = (34 + (1 - tRow) * 125) * (0.7 + 0.3 * smooth(prog));
        ctx.strokeStyle = `rgba(255, 232, 182, ${(1 - tRow) * 0.34})`;
        ctx.lineWidth = 1.1 + (1 - tRow) * 1.3;
        ctx.beginPath();
        ctx.moveTo(sunX + waveOffset - wLen * 0.5, wy);
        ctx.lineTo(sunX + waveOffset + wLen * 0.5, wy);
        ctx.stroke();
      }
      ctx.restore();
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

  // Editorial readability gradient scrim
  const scrim = ctx.createLinearGradient(0, 0, 0, H);
  scrim.addColorStop(0, "rgba(12, 10, 8, 0.62)");
  scrim.addColorStop(0.26, "rgba(12, 10, 8, 0.12)");
  scrim.addColorStop(0.55, "rgba(12, 10, 8, 0.28)");
  scrim.addColorStop(1, "rgba(12, 10, 8, 0.92)");
  ctx.fillStyle = scrim;
  ctx.fillRect(0, 0, W, H);
}

/* ========================================================================== */
/*  Main StoryFilmScroll Component                                            */
/* ========================================================================== */

export function StoryFilmScroll() {
  const trackRef = useRef<HTMLElement>(null);
  const frameWrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const targetProgressRef = useRef(0);
  const smoothProgressRef = useRef(0);
  const velocityRef = useRef(0);
  const pointerRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });
  const playingRef = useRef(false);
  const draggingTimelineRef = useRef(false);

  const platesRef = useRef<(HTMLImageElement | null)[]>([null, null, null, null, null]);
  const branchesRef = useRef<Record<number, DecisionBranch>>({
    0: "discipline",
    1: "discipline",
    2: "discipline",
    3: "discipline",
    4: "discipline",
  });

  const [activeIndex, setActiveIndex] = useState(0);
  const [actProgress, setActProgress] = useState(0);
  const [overallProgress, setOverallProgress] = useState(0);
  const [currentFrame, setCurrentFrame] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [decisions, setDecisions] = useState<Record<number, DecisionBranch>>({
    0: "discipline",
    1: "discipline",
    2: "discipline",
    3: "discipline",
    4: "discipline",
  });

  const chooseBranch = (actIdx: number, branch: DecisionBranch) => {
    const next = { ...branchesRef.current, [actIdx]: branch };
    branchesRef.current = next;
    setDecisions(next);

    // Compute updated Composure Score (each discipline choice = 20 pts)
    const countDiscipline = Object.values(next).filter((b) => b === "discipline").length;
    updateComposureScore(35 + countDiscipline * 13);
  };

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

  useEffect(() => {
    if (typeof window === "undefined") return;
    FILM_ACTS.forEach((act, idx) => {
      const img = new Image();
      img.decoding = "async";
      img.src = act.localPlate;
      platesRef.current[idx] = img;
    });
  }, []);

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
      const springStep = Math.abs(diff) < 0.0002 ? diff : diff * Math.min(1, dt * 15);
      const curSmooth = clamp(prevSmooth + springStep, 0, 1);
      smoothProgressRef.current = curSmooth;
      velocityRef.current = springStep / Math.max(0.008, dt);

      const ptr = pointerRef.current;
      ptr.x += (ptr.targetX - ptr.x) * Math.min(1, dt * 10);
      ptr.y += (ptr.targetY - ptr.y) * Math.min(1, dt * 10);

      if (frameWrapRef.current) {
        const enterBell = smooth(rangeProgress(curSmooth, 0, 0.08));
        const exitBell = 1 - smooth(rangeProgress(curSmooth, 0.93, 1.0)) * 0.035;
        const scale = lerp(0.955, 1.0, enterBell) * exitBell;
        frameWrapRef.current.style.transform = `scale(${scale.toFixed(4)})`;
      }

      syncUiState(curSmooth);

      drawTheatreFrame({
        ctx,
        W: canvas.width,
        H: canvas.height,
        p: curSmooth,
        velocity: velocityRef.current,
        pointerX: ptr.x,
        pointerY: ptr.y,
        time: now / 1000,
        plates: platesRef.current,
        branches: branchesRef.current,
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
    scrollToPinnedProgress(trackRef.current, targetP, true);
  };

  const scrubFromClientX = useCallback((clientX: number) => {
    const bar = timelineRef.current;
    if (!bar) return;
    const r = bar.getBoundingClientRect();
    const nextP = clamp((clientX - r.left) / Math.max(1, r.width), 0, 1);
    playingRef.current = false;
    setIsPlaying(false);
    targetProgressRef.current = nextP;
    scrollToPinnedProgress(trackRef.current, nextP, false);
  }, []);

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
  const currentBranch = decisions[activeIndex] ?? "discipline";
  const branchInfo =
    currentBranch === "discipline" ? currentAct.disciplineChoice : currentAct.impulseChoice;

  return (
    <>
      {/* ---------------- Editorial Prologue Transition into Scene 02 ---------------- */}
      <div className="mx-auto max-w-[1200px] px-5 pb-8 pt-16 sm:px-8 sm:pb-12 sm:pt-24">
        <div
          data-scrub-reveal
          className="flex flex-col items-start justify-between gap-6 border-t border-line pt-10 md:flex-row md:items-end"
        >
          <div>
            <Eyebrow n="02">Scene II · The Inner Film (Interactive Theatre)</Eyebrow>
            <h2 className="mt-5 max-w-3xl font-display text-[clamp(2rem,4.6vw,3.75rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-ink">
              The market is external.{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                The battle is inside.
              </span>
            </h2>
          </div>
          <p className="max-w-md text-[15.5px] leading-relaxed text-muted">
            Scroll to scrub the 600-frame film, press <strong className="font-medium text-ink">Play Film</strong>, or test <strong className="font-medium text-ink">Impulse vs. Discipline</strong> inside each scene.
          </p>
        </div>
      </div>

      {/* ---------------- Full-Screen Pinned Interactive Theatre Sequence ---------------- */}
      <section
        id="film"
        ref={trackRef}
        aria-label="The Inner Film — Interactive scroll-scrubbed theatre sequence"
        className="lp-pinned relative h-[480svh]"
      >
        <div className="sticky top-0 flex h-svh flex-col justify-center overflow-hidden px-3 py-3 sm:px-6 sm:py-5 lg:px-8">
          <div
            ref={frameWrapRef}
            className="mx-auto flex h-full max-h-[860px] w-full max-w-[1280px] flex-col justify-between will-change-transform"
          >
            {/* Widescreen Theatre Frame */}
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
              {/* 60fps Scroll-Scrubbed Optical Choreography Canvas */}
              <canvas
                ref={canvasRef}
                className="absolute inset-0 block h-full w-full"
                aria-label={`Act ${activeIndex + 1}: ${currentAct.title} — ${currentAct.line} ${currentAct.italicPart}`}
              />

              {/* Subtle 35mm Film Grain Overlay */}
              <div className="lp-film-grain pointer-events-none absolute inset-0 opacity-25" aria-hidden="true" />

              {/* Top Theatre HUD Bar */}
              <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 px-4 pt-4 sm:px-8 sm:pt-6">
                <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 backdrop-blur-xl">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      currentBranch === "impulse"
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
                    className="inline-flex items-center gap-2 rounded-full border border-[#cba76b]/50 bg-[#1c1813]/85 px-4 py-1.5 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#f0eae0] backdrop-blur-xl transition hover:border-[#cba76b] hover:bg-[#272219] active:scale-[0.97]"
                  >
                    <span className="text-[#cba76b]">{isPlaying ? "❚❚" : "▶"}</span>
                    <span>{isPlaying ? "Pause" : "Play Film"}</span>
                  </button>
                </div>
              </div>

              {/* Lower-Third Narrative + Playable Game Decision Node */}
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 grid items-end gap-5 p-5 sm:p-8 lg:grid-cols-[1.15fr_0.85fr] lg:p-10">
                <div
                  className="max-w-2xl transition-transform duration-150 ease-out"
                  style={{
                    transform: `translate3d(0, ${(1 - smooth(Math.min(1, actProgress * 3.5))) * 14}px, 0)`,
                  }}
                >
                  <p className="font-mono text-[11px] uppercase tracking-[0.14em] text-[#cba76b]">
                    {currentAct.marginNote}
                  </p>

                  <h3 className="mt-2 font-display text-[clamp(1.55rem,3.5vw,3.15rem)] font-semibold leading-[1.06] tracking-[-0.038em] text-[#f7f4ee]">
                    {currentAct.line}{" "}
                    <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.015em] text-[#dfbe82]">
                      {currentAct.italicPart}
                    </span>
                  </h3>

                  <p className="mt-2.5 max-w-xl text-[14px] leading-relaxed text-[#d6cebd] sm:text-[15.5px]">
                    {currentAct.reflection}
                  </p>

                  {activeIndex === 4 && (
                    <div className="pointer-events-auto mt-5 flex flex-wrap items-center gap-4">
                      <Link
                        href="/login?mode=signup"
                        className="inline-flex h-10 items-center rounded-full bg-gold-strong px-5 text-[14.5px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
                      >
                        Begin your Edgebook
                      </Link>
                      <a
                        href="#how"
                        className="group inline-flex items-center gap-1 text-[14.5px] text-[#dfbe82] transition-colors hover:text-white"
                      >
                        Continue to The Decision
                        <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                      </a>
                    </div>
                  )}
                </div>

                {/* Playable Game Decision Node Card (Interactive Choice Inside the Scene) */}
                <div className="pointer-events-auto rounded-[22px] border border-white/15 bg-[#15120d]/85 p-4 backdrop-blur-xl sm:p-5">
                  <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-[#cba76b]">
                    <span>Decision Node · {currentAct.roman}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 font-semibold ${
                        currentBranch === "discipline"
                          ? "bg-[#74b08c]/20 text-[#74b08c]"
                          : "bg-[#cd8484]/20 text-[#cd8484]"
                      }`}
                    >
                      {branchInfo.delta}
                    </span>
                  </div>

                  <p className="mt-2 text-[13px] font-medium leading-snug text-[#f7f4ee]">
                    {currentAct.promptQuestion}
                  </p>

                  <div className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                    <button
                      type="button"
                      onClick={() => chooseBranch(activeIndex, "discipline")}
                      className={`rounded-xl border px-3 py-2 text-left text-[12px] font-medium transition ${
                        currentBranch === "discipline"
                          ? "border-[#74b08c]/70 bg-[#74b08c]/18 text-[#f7f4ee]"
                          : "border-white/10 bg-white/[0.04] text-[#a69d8c] hover:border-white/25 hover:text-white"
                      }`}
                    >
                      <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#74b08c]">
                        [A] Discipline
                      </span>
                      <span className="mt-0.5 block leading-tight">
                        {currentAct.disciplineChoice.label}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => chooseBranch(activeIndex, "impulse")}
                      className={`rounded-xl border px-3 py-2 text-left text-[12px] font-medium transition ${
                        currentBranch === "impulse"
                          ? "border-[#cd8484]/70 bg-[#cd8484]/18 text-[#f7f4ee]"
                          : "border-white/10 bg-white/[0.04] text-[#a69d8c] hover:border-white/25 hover:text-white"
                      }`}
                    >
                      <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-[#cd8484]">
                        [B] Impulse
                      </span>
                      <span className="mt-0.5 block leading-tight">
                        {currentAct.impulseChoice.label}
                      </span>
                    </button>
                  </div>

                  <p className="mt-2.5 border-t border-white/10 pt-2 text-[12px] leading-snug text-[#d6cebd]">
                    <strong className="font-medium text-[#f0eae0]">Outcome:</strong> {branchInfo.outcome}
                  </p>
                </div>
              </div>
            </div>

            {/* Interactive Scrubber + 5-Act Chapter Bar */}
            <div className="mt-3 rounded-[22px] border border-line bg-surface/92 px-3.5 py-2.5 shadow-[var(--shadow-rest)] backdrop-blur-xl sm:px-5 sm:py-3">
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
                    scrollToPinnedProgress(trackRef.current, next, false);
                  } else if (e.key === "ArrowLeft") {
                    e.preventDefault();
                    const next = clamp(targetProgressRef.current - 0.05, 0, 1);
                    targetProgressRef.current = next;
                    scrollToPinnedProgress(trackRef.current, next, false);
                  }
                }}
                className="group relative flex h-6 cursor-ew-resize touch-none items-center select-none"
              >
                <div className="relative h-2 w-full overflow-hidden rounded-full bg-ink/[0.09] transition-[height] duration-150 group-hover:h-2.5">
                  {[0.2, 0.4, 0.6, 0.8].map((pos) => (
                    <span
                      key={pos}
                      aria-hidden="true"
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
                  aria-hidden="true"
                  style={{ left: `calc(${overallProgress * 100}% - 8px)` }}
                  className="pointer-events-none absolute h-4 w-4 rounded-full border-2 border-surface bg-gold-strong shadow-md transition-transform duration-150 group-hover:scale-125"
                />
              </div>

              <div
                className="mt-1 grid grid-cols-5 gap-1.5 sm:gap-2.5"
                role="tablist"
                aria-label="Five acts of The Inner Film"
              >
                {FILM_ACTS.map((act, idx) => {
                  const isCurrent = idx === activeIndex;
                  const actBranch = decisions[idx] ?? "discipline";
                  return (
                    <button
                      key={act.id}
                      type="button"
                      role="tab"
                      aria-selected={isCurrent}
                      onClick={() => selectAct(idx)}
                      className={`flex items-center justify-between rounded-xl px-2.5 py-1.5 text-left transition ${
                        isCurrent
                          ? "bg-gold/14 font-semibold text-ink"
                          : "text-muted hover:bg-ink/[0.04] hover:text-ink"
                      }`}
                    >
                      <span className="truncate text-[11px] sm:text-[12.5px]">
                        <span className="mr-1.5 font-mono text-[10px] text-gold">{act.actNumber}</span>
                        {act.title.replace("THE ", "")}
                      </span>
                      <span
                        aria-hidden="true"
                        className={`hidden h-1.5 w-1.5 shrink-0 rounded-full sm:inline-block ${
                          actBranch === "discipline" ? "bg-profit" : "bg-loss"
                        }`}
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Reduced Motion Static Fallback ---------------- */}
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

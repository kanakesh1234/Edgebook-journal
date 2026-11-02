"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
/*  CHAPTER 01 — THE WRITER'S ROOM (Full-Screen Widescreen Split Game Stage)  */
/*  CHAPTER 03 — THE 5-GATE RITUAL ARENA (3-Column Widescreen Game Cockpit    */
/*               with 60fps Animated Graphic-Novel Storyboard Canvas)         */
/* ========================================================================== */

interface DeskCheckpoint {
  id: string;
  code: string;
  label: string;
  summary: string;
  detail: string;
  quote: string;
  quoteAuthor: string;
  status: string;
  tone: "gold" | "profit";
  plate: string;
}

const DESK_CHECKPOINTS: DeskCheckpoint[] = [
  {
    id: "intention",
    code: "NODE 01",
    label: "Pre-Session Intention",
    summary: "Wait for the overnight liquidity sweep to reclaim on a 5-minute close. Do not chase the opening drive.",
    detail: "Written at 08:45 AM before the opening bell. Eliminates reactive impulse clicking by defining a single high-conviction scenario.",
    quote: "When your rules are written in calm, the market cannot rewrite them in noise.",
    quoteAuthor: "The Edgebook Philosophy",
    status: "LOCKED IN INK",
    tone: "gold",
    plate: "/landing/hero-atelier.jpg",
  },
  {
    id: "headspace",
    code: "NODE 02",
    label: "Internal State Check",
    summary: "Calm · Composed · 8h Rest · Zero Urgency",
    detail: "Your historical journal data shows an 84% clean-process rate when rested vs. 41% when rushed or fatigued.",
    quote: "You have power over your mind—not outside events. Realize this, and you will find strength.",
    quoteAuthor: "Marcus Aurelius · Meditations",
    status: "OPTIMAL",
    tone: "profit",
    plate: "/landing/act-2-stillness.jpg",
  },
  {
    id: "guardrail",
    code: "NODE 03",
    label: "Risk & Impulse Guardrail",
    summary: "Max 2 trades · Hard stop after first clean win",
    detail: "Automatically surfaces as a quiet translucent banner before order entry so you never give back a green morning.",
    quote: "Between stimulus and response there is a space. In that space is our power to choose our response.",
    quoteAuthor: "Viktor E. Frankl",
    status: "ARMED",
    tone: "gold",
    plate: "/landing/act-3-temptation.jpg",
  },
  {
    id: "reflection",
    code: "NODE 04",
    label: "Post-Session Autopsy",
    summary: "“Let the first false move pass at 09:34 without clicking. Entered only when my condition appeared.”",
    detail: "Indexed locally and in your own Google Drive so Minato remembers the lesson tomorrow.",
    quote: "The best traders aren't afraid to look in the mirror after the bell rings.",
    quoteAuthor: "Mark Douglas · Trading in the Zone (Adapted)",
    status: "VERIFIED A+",
    tone: "profit",
    plate: "/landing/act-4-mirror.jpg",
  },
];

interface RitualStage {
  id: string;
  num: string;
  tab: string;
  gateCode: string;
  moment: string;
  headline: string;
  italicAccent: string;
  description: string;
  quote: string;
  quoteAuthor: string;
  integrityScore: string;
  plate: string;
  entries: { label: string; value: string; tone?: string }[];
  note: string;
}

const RITUAL_STAGES: RitualStage[] = [
  {
    id: "plan",
    num: "01",
    tab: "Plan",
    gateCode: "GATE 01 · INTENTION",
    moment: "08:45 AM · Before the Open",
    headline: "Start with a written intention,",
    italicAccent: "not an impulse.",
    description:
      "Before a single order is placed, you write down the one scenario you are waiting for, what would invalidate it, and how your head feels right now.",
    quote: "Every battle is won before it is ever fought.",
    quoteAuthor: "Sun Tzu · The Art of War",
    integrityScore: "100% Clarity",
    plate: "/landing/hero-atelier.jpg",
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
    gateCode: "GATE 02 · PRE-COMMITMENT",
    moment: "09:15 AM · Pre-Commitment",
    headline: "Decide how you will act",
    italicAccent: "before the pressure arrives.",
    description:
      "Write your if-then commitments in plain language. Edgebook surfaces your own historical process odds and reminds you of the personal rules you asked it to guard.",
    quote: "We do not rise to the level of our expectations. We fall to the level of our training.",
    quoteAuthor: "Archilochus",
    integrityScore: "84% Historical Odds",
    plate: "/landing/act-2-stillness.jpg",
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
    gateCode: "GATE 03 · COMPOSURE",
    moment: "09:38 AM · In the Moment",
    headline: "Protect your composure",
    italicAccent: "when the room speeds up.",
    description:
      "Whether you take a clean setup or log a disciplined No-Trade Day because your condition never appeared, Edgebook honors the quality of your decision—not just the dollar outcome.",
    quote: "Patience is not passive waiting. Patience is active restraint while noise exhausts itself.",
    quoteAuthor: "Edgebook Field Manual",
    integrityScore: "0 Impulse Flags",
    plate: "/landing/act-3-temptation.jpg",
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
    gateCode: "GATE 04 · HONEST MIRROR",
    moment: "10:20 AM · Honest Mirror",
    headline: "Name the one thing",
    italicAccent: "that helped or hurt you.",
    description:
      "A three-minute post-trade reflection asks what went well, what slipped, and what you will watch next time—turning vague regret into a specific, named lesson.",
    quote: "Mistakes are only tuition if you write down what they taught you.",
    quoteAuthor: "Edgebook Autopsy Protocol",
    integrityScore: "Lesson Indexed",
    plate: "/landing/act-4-mirror.jpg",
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
    gateCode: "GATE 05 · SPACED MASTERY",
    moment: "Evening · Spaced Mastery",
    headline: "Turn repeat mistakes into",
    italicAccent: "automatic intuition.",
    description:
      "Mistakes don't sit forgotten in an old entry. Edgebook brings them back on a spaced-repetition schedule across five deliberate practice modes until the habit is retired.",
    quote: "What you practise in stillness becomes your reflex under fire.",
    quoteAuthor: "Spaced Mastery System",
    integrityScore: "Box 4 of 5",
    plate: "/landing/act-5-quiet-edge.jpg",
    entries: [
      { label: "Active Drill", value: "Patience & Early-Exit Recognition" },
      { label: "Mastery Box", value: "Box 4 of 5 · Due in 7 days", tone: "text-gold" },
      { label: "Weekly Ritual", value: "3-minute synthesis completed", tone: "text-profit" },
    ],
    note: "Twenty cards at most in your daily study feed—built to be finished and put down.",
  },
];

/* ========================================================================== */
/*  Animated Graphic-Novel Study Canvas (Chapter 01 Left Widescreen Panel)    */
/* ========================================================================== */

function drawStudyCartoonOverlay(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  nodeIdx: number,
  time: number,
) {
  ctx.clearRect(0, 0, W, H);

  // 1. Warm Banker's Lamp Volumetric Light Cone descending from top-left
  const lampX = W * 0.24;
  const lampY = H * 0.14;
  const coneGrad = ctx.createRadialGradient(lampX, lampY, 10, W * 0.48, H * 0.52, W * 0.68);
  coneGrad.addColorStop(0, "rgba(246, 218, 158, 0.34)");
  coneGrad.addColorStop(0.45, "rgba(203, 167, 107, 0.14)");
  coneGrad.addColorStop(1, "rgba(18, 14, 10, 0)");
  ctx.fillStyle = coneGrad;
  ctx.fillRect(0, 0, W, H);

  // 2. Graphic-Novel Banker's Lamp Silhouette & Brass Arm
  ctx.save();
  ctx.strokeStyle = "#cba76b";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(W * 0.08, H * 0.42);
  ctx.quadraticCurveTo(W * 0.1, H * 0.12, lampX, lampY);
  ctx.stroke();

  // Lamp shade (classic emerald/brass study shade)
  ctx.fillStyle = "#2f5f46";
  ctx.strokeStyle = "#dfbe82";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lampX - 38, lampY + 14);
  ctx.lineTo(lampX - 18, lampY - 12);
  ctx.lineTo(lampX + 26, lampY - 12);
  ctx.lineTo(lampX + 44, lampY + 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();

  // 3. Illustrated Open Archival Journal & Live Fountain Pen in the Study Center
  const bookX = W * 0.52;
  const bookY = H * 0.52 + Math.sin(time * 1.4) * 3;
  const bw = Math.min(340, W * 0.56);
  const bh = Math.min(210, H * 0.4);

  ctx.save();
  ctx.translate(bookX, bookY);
  ctx.rotate(-0.04);

  // Drop shadow
  ctx.shadowColor = "rgba(0, 0, 0, 0.65)";
  ctx.shadowBlur = 36;
  ctx.shadowOffsetY = 18;

  // Leather cover
  ctx.fillStyle = "#262017";
  ctx.strokeStyle = "#cba76b";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-bw * 0.5 - 8, -bh * 0.5 - 8, bw + 16, bh + 16, 14);
  ctx.fill();
  ctx.stroke();
  ctx.shadowColor = "transparent";

  // Left & Right Cream Pages
  ctx.fillStyle = "#f7f4ee";
  ctx.beginPath();
  ctx.roundRect(-bw * 0.5, -bh * 0.5, bw * 0.49, bh, 8);
  ctx.roundRect(bw * 0.01, -bh * 0.5, bw * 0.49, bh, 8);
  ctx.fill();

  // Red margin line on left & right pages
  ctx.strokeStyle = "rgba(172, 81, 87, 0.35)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-bw * 0.38, -bh * 0.5);
  ctx.lineTo(-bw * 0.38, bh * 0.5);
  ctx.moveTo(bw * 0.12, -bh * 0.5);
  ctx.lineTo(bw * 0.12, bh * 0.5);
  ctx.stroke();

  // Ruled lines & animated ink writing
  ctx.strokeStyle = "rgba(110, 102, 87, 0.22)";
  for (let row = 0; row < 5; row++) {
    const ry = -bh * 0.32 + row * 28;
    ctx.beginPath();
    ctx.moveTo(-bw * 0.44, ry);
    ctx.lineTo(-bw * 0.05, ry);
    ctx.moveTo(bw * 0.06, ry);
    ctx.lineTo(bw * 0.44, ry);
    ctx.stroke();
  }

  // Animated handwriting strokes on the right page
  const writeCycle = (time * 0.45) % 1;
  ctx.strokeStyle = "#26221a";
  ctx.lineWidth = 2;
  for (let r = 0; r < 3; r++) {
    const ry = -bh * 0.32 + r * 28 - 4;
    const progress = clamp(writeCycle * 3 - r, 0, 1);
    if (progress > 0) {
      ctx.beginPath();
      ctx.moveTo(bw * 0.15, ry);
      ctx.lineTo(bw * 0.15 + bw * 0.26 * progress, ry);
      ctx.stroke();
    }
  }

  // Animated Fountain Pen Nib gliding across the page
  const penX = bw * 0.15 + bw * 0.26 * ((writeCycle * 3) % 1);
  const penY = -bh * 0.32 + Math.floor(writeCycle * 3) * 28 - 6;
  ctx.save();
  ctx.translate(penX, penY);
  ctx.rotate(-0.55 + Math.sin(time * 8) * 0.04);
  ctx.fillStyle = "#dfbe82";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(14, -5);
  ctx.lineTo(14, 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#15120d";
  ctx.beginPath();
  ctx.roundRect(14, -6, 95, 12, 5);
  ctx.fill();
  ctx.restore();

  ctx.restore();

  // 4. Steaming Morning Coffee Cup (Bottom-Left Study Corner)
  const cupX = W * 0.18;
  const cupY = H * 0.64;
  ctx.save();
  ctx.fillStyle = "#272219";
  ctx.strokeStyle = "#cba76b";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.roundRect(cupX - 20, cupY, 40, 32, [4, 4, 14, 14]);
  ctx.fill();
  ctx.stroke();
  // Rising animated steam wisps
  for (let s = 0; s < 3; s++) {
    const phase = (time * 0.7 + s * 0.33) % 1;
    const sy = cupY - 6 - phase * 36;
    const sx = cupX - 8 + s * 8 + Math.sin(phase * Math.PI * 2 + s) * 6;
    ctx.strokeStyle = `rgba(247, 244, 238, ${(1 - phase) * 0.42})`;
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(sx, sy + 10);
    ctx.quadraticCurveTo(sx + 5, sy + 5, sx, sy);
    ctx.stroke();
  }
  ctx.restore();

  // 5. Game Focus Reticle locked onto the active node
  const reticlePositions = [
    { x: bookX - bw * 0.22, y: bookY - bh * 0.18 },
    { x: cupX, y: cupY + 12 },
    { x: bookX + bw * 0.22, y: bookY - bh * 0.12 },
    { x: bookX + bw * 0.18, y: bookY + bh * 0.2 },
  ];
  const target = reticlePositions[nodeIdx] ?? reticlePositions[0]!;
  const pulseR = 24 + Math.sin(time * 3.5) * 4;

  ctx.save();
  ctx.translate(target.x, target.y);
  ctx.strokeStyle = "#74b08c";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, pulseR, 0, Math.PI * 2);
  ctx.stroke();

  // Corner target brackets
  const bSize = pulseR + 8;
  ctx.strokeStyle = "#dfbe82";
  ctx.lineWidth = 2;
  [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ].forEach(([dx, dy]) => {
    ctx.beginPath();
    ctx.moveTo(dx! * bSize, dy! * (bSize - 8));
    ctx.lineTo(dx! * bSize, dy! * bSize);
    ctx.lineTo(dx! * (bSize - 8), dy! * bSize);
    ctx.stroke();
  });
  ctx.restore();
}

/* ========================================================================== */
/*  Animated 5-Gate Storyboard Cartoon Renderer (Chapter 03 Center Panel)     */
/* ========================================================================== */

function drawGateStoryboardCartoon(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  gateIdx: number,
  time: number,
) {
  ctx.clearRect(0, 0, W, H);
  const cx = W * 0.5;
  const cy = H * 0.45;

  if (gateIdx === 0) {
    // GATE 01 (PLAN): Animated Compass Rose & Architectural Blueprint Grid
    ctx.save();
    ctx.translate(cx, cy);
    ctx.strokeStyle = "rgba(203, 167, 107, 0.22)";
    ctx.lineWidth = 1;
    for (let g = -140; g <= 140; g += 28) {
      ctx.beginPath();
      ctx.moveTo(g, -110);
      ctx.lineTo(g, 110);
      ctx.moveTo(-140, g);
      ctx.lineTo(140, g);
      ctx.stroke();
    }

    const r = Math.min(W, H) * 0.26;
    ctx.strokeStyle = "#dfbe82";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating compass needle locking onto True North (Intention)
    ctx.rotate(Math.sin(time * 1.6) * 0.14);
    ctx.fillStyle = "#74b08c";
    ctx.beginPath();
    ctx.moveTo(0, -r * 0.82);
    ctx.lineTo(10, 0);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#cba76b";
    ctx.beginPath();
    ctx.moveTo(0, r * 0.82);
    ctx.lineTo(10, 0);
    ctx.lineTo(-10, 0);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  } else if (gateIdx === 1) {
    // GATE 02 (THOUGHT): Animated If-Then Neural Decision Tree & Guardrail Shield
    ctx.save();
    ctx.translate(cx, cy);
    const pulse = (time * 0.8) % 1;

    // Left root node -> splits into Upper (Discipline Green) & Lower (Impulse Blocked Red)
    ctx.lineWidth = 3;
    ctx.strokeStyle = "#74b08c";
    ctx.beginPath();
    ctx.moveTo(-120, 0);
    ctx.bezierCurveTo(-40, 0, -20, -55, 95, -55);
    ctx.stroke();

    ctx.strokeStyle = "rgba(205, 132, 132, 0.45)";
    ctx.setLineDash([6, 6]);
    ctx.beginPath();
    ctx.moveTo(-120, 0);
    ctx.bezierCurveTo(-40, 0, -20, 55, 95, 55);
    ctx.stroke();
    ctx.setLineDash([]);

    // Travelling signal pulse along the Discipline path
    const px = lerp(-120, 95, pulse);
    const py = lerp(0, -55, smooth(pulse));
    ctx.fillStyle = "#dfbe82";
    ctx.beginPath();
    ctx.arc(px, py, 7, 0, Math.PI * 2);
    ctx.fill();

    // Nodes
    ctx.fillStyle = "#262017";
    ctx.strokeStyle = "#dfbe82";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(-120, 0, 22, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#74b08c";
    ctx.beginPath();
    ctx.arc(95, -55, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "#cd8484";
    ctx.beginPath();
    ctx.arc(95, 55, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "#f7f4ee";
    ctx.font = "600 10px monospace";
    ctx.textAlign = "center";
    ctx.fillText("IF", -120, 4);
    ctx.fillStyle = "#74b08c";
    ctx.fillText("PLAN", 95, -51);
    ctx.fillStyle = "#cd8484";
    ctx.fillText("STOP", 95, 59);
    ctx.restore();
  } else if (gateIdx === 2) {
    // GATE 03 (RESTRAINT): Composure Dome Shielding Against Swirling Noise Sparks
    ctx.save();
    ctx.translate(cx, cy);
    const domeR = Math.min(W, H) * 0.24;

    // Swirling outer red impulse sparks deflected by the golden dome
    for (let i = 0; i < 18; i++) {
      const ang = time * 1.4 + i * 0.35;
      const dist = domeR + 18 + (i % 4) * 14;
      const sx = Math.cos(ang) * dist;
      const sy = Math.sin(ang) * dist;
      ctx.fillStyle = "rgba(205, 132, 132, 0.65)";
      ctx.beginPath();
      ctx.arc(sx, sy, 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Golden Composure Shield
    ctx.fillStyle = "rgba(116, 176, 140, 0.14)";
    ctx.strokeStyle = "#dfbe82";
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(0, 0, domeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Inner calm pendulum/hourglass
    ctx.strokeStyle = "#74b08c";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-24, -32);
    ctx.lineTo(24, -32);
    ctx.lineTo(-24, 32);
    ctx.lineTo(24, 32);
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  } else if (gateIdx === 3) {
    // GATE 04 (AUTOPSY): Magnifying Optical Lens Scanning Ledger Pages
    ctx.save();
    ctx.translate(cx, cy);
    // Ledger card
    ctx.fillStyle = "#f7f4ee";
    ctx.beginPath();
    ctx.roundRect(-110, -70, 220, 140, 12);
    ctx.fill();

    ctx.strokeStyle = "rgba(172, 81, 87, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(-72, -70);
    ctx.lineTo(-72, 70);
    ctx.stroke();

    ctx.fillStyle = "#26221a";
    ctx.font = "italic 14px Georgia, serif";
    ctx.fillText("“Tightened stop early...”", -56, -18);
    ctx.fillStyle = "#40795b";
    ctx.font = "600 11px monospace";
    ctx.fillText("✓ LESSON EXTRACTED", -56, 22);

    // Moving magnifying lens
    const lx = Math.sin(time * 1.5) * 42;
    const ly = Math.cos(time * 1.1) * 18;
    ctx.strokeStyle = "#cba76b";
    ctx.lineWidth = 4;
    ctx.fillStyle = "rgba(203, 167, 107, 0.16)";
    ctx.beginPath();
    ctx.arc(lx, ly, 44, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  } else {
    // GATE 05 (PRACTISE): 5-Box Spaced-Repetition Mastery Constellation
    ctx.save();
    ctx.translate(cx, cy);
    const activeBox = Math.floor(time * 1.2) % 5;
    for (let b = 0; b < 5; b++) {
      const bx = -128 + b * 64;
      const by = Math.sin(b * 0.9) * 18;
      if (b < 4) {
        const nx = -128 + (b + 1) * 64;
        const ny = Math.sin((b + 1) * 0.9) * 18;
        ctx.strokeStyle = b <= activeBox ? "#74b08c" : "rgba(203, 167, 107, 0.3)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(nx, ny);
        ctx.stroke();
      }
      ctx.fillStyle = b === 3 || b === activeBox ? "#74b08c" : "#262017";
      ctx.strokeStyle = "#dfbe82";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(bx - 22, by - 22, 44, 44, 10);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#f7f4ee";
      ctx.font = "600 11px monospace";
      ctx.textAlign = "center";
      ctx.fillText(`B${b + 1}`, bx, by + 4);
    }
    ctx.restore();
  }
}

/* -------------------------------------------------------------------------- */
/*  CHAPTER 01 — THE ENTRANCE (#top — Full-Screen Split Widescreen Game)      */
/* -------------------------------------------------------------------------- */

export function JourneyStage() {
  const secRef = useRef<HTMLElement>(null);
  const studyCanvasRef = useRef<HTMLCanvasElement>(null);

  const [focusedNode, setFocusedNode] = useState(0);
  const [manualNode, setManualNode] = useState<number | null>(null);
  const [verifiedNodes, setVerifiedNodes] = useState<Record<number, boolean>>({
    0: true,
    1: true,
  });

  // 60fps Animated Graphic-Novel Study Canvas Loop
  useEffect(() => {
    const canvas = studyCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(300, Math.floor(rect.width * dpr));
      const h = Math.max(240, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const render = (now: number) => {
      rafId = window.requestAnimationFrame(render);
      if (document.hidden) return;
      drawStudyCartoonOverlay(ctx, canvas.width, canvas.height, focusedNode, now * 0.001);
    };
    rafId = window.requestAnimationFrame(render);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [focusedNode]);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        if (manualNode === null) {
          const autoIdx = Math.min(3, Math.floor(clamp(p, 0, 0.999) * 4));
          setFocusedNode((prev) => (prev === autoIdx ? prev : autoIdx));
        }
      },
      { pinned: true },
    );
  }, [manualNode]);

  const toggleCheckpoint = (idx: number) => {
    setManualNode(idx);
    setFocusedNode(idx);
    setVerifiedNodes((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      const count = Object.values(next).filter(Boolean).length;
      updateComposureScore(76 + count * 6);
      return next;
    });
  };

  const activeCheckpoint = DESK_CHECKPOINTS[focusedNode] ?? DESK_CHECKPOINTS[0]!;
  const verifiedCount = Object.values(verifiedNodes).filter(Boolean).length;

  return (
    <section
      id="top"
      ref={secRef}
      className="lp-entrance-pin relative w-full"
      aria-label="Edgebook introduction"
    >
      <div className="lg:sticky lg:top-0 flex min-h-svh w-full flex-col justify-center overflow-hidden pb-10 pt-16 sm:pt-20">
        {/* Subtle warm editorial paper ambient light */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
          style={{
            background:
              "radial-gradient(980px 420px at 50% 0%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 72%)",
          }}
        />

        {/* Full-Width Edge-to-Edge Widescreen Game Split Cockpit */}
        <div className="lp-wide relative z-10 grid w-full items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
          {/* LEFT WIDESCREEN STAGE (7 Cols): Animated Graphic-Novel Study + Quote Deck */}
          <div className="lp-sq relative flex min-h-[420px] flex-col justify-between overflow-hidden rounded-[28px] border border-line-strong/80 bg-[#17130e] shadow-[var(--shadow-overlay)] lg:col-span-7 lg:min-h-[calc(100svh-6.5rem)]">
            {/* Photographic Study Backdrop */}
            <div
              className="absolute inset-0 bg-cover bg-center opacity-50 transition-all duration-700"
              style={{ backgroundImage: `url(${activeCheckpoint.plate})` }}
              aria-hidden="true"
            />
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(180deg, rgba(16,13,9,0.58) 0%, rgba(16,13,9,0.22) 45%, rgba(16,13,9,0.92) 100%)",
              }}
              aria-hidden="true"
            />

            {/* Live 60fps Animated Graphic-Novel Study Canvas */}
            <canvas
              ref={studyCanvasRef}
              className="pointer-events-none absolute inset-0 h-full w-full"
              aria-hidden="true"
            />

            {/* Top Study Telemetry HUD */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 p-5 sm:p-7">
              <div className="inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-black/50 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.14em] text-[#f0eae0] backdrop-blur-md">
                <span className="h-2 w-2 rounded-full bg-[#74b08c] animate-pulse" aria-hidden="true" />
                <span>CH.01 · THE WRITER&apos;S STUDY</span>
              </div>

              <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.12em]">
                <span className="rounded-full border border-[#dfbe82]/40 bg-black/50 px-3 py-1 text-[#dfbe82] backdrop-blur-md">
                  {activeCheckpoint.code} · {activeCheckpoint.status}
                </span>
                <span className="hidden rounded-full border border-white/12 bg-black/50 px-3 py-1 text-[#74b08c] backdrop-blur-md sm:inline-block">
                  {verifiedCount}/4 CHECKPOINTS ARMED
                </span>
              </div>
            </div>

            {/* Bottom Philosophical Quote Deck & Active Node Readout */}
            <div className="relative z-10 space-y-4 p-5 sm:p-8">
              <blockquote className="rounded-2xl border border-white/15 bg-black/55 p-5 backdrop-blur-xl">
                <p className="font-serif text-[clamp(1.35rem,2.2vw,1.95rem)] italic leading-snug text-[#f7f4ee]">
                  &ldquo;{activeCheckpoint.quote}&rdquo;
                </p>
                <footer className="mt-2 flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em] text-[#cba76b]">
                  <span>— {activeCheckpoint.quoteAuthor}</span>
                  <span>{activeCheckpoint.label}</span>
                </footer>
              </blockquote>

              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/45 px-4 py-3 text-[13px] text-[#d6cebd] backdrop-blur-md">
                <span>
                  <strong className="font-medium text-[#f7f4ee]">Study Insight:</strong>{" "}
                  {activeCheckpoint.detail}
                </span>
              </div>
            </div>
          </div>

          {/* RIGHT WIDESCREEN STAGE (5 Cols): Headline + Interactive 4-Node Mission Briefing */}
          <div className="lp-sq flex flex-col justify-between rounded-[28px] border border-line-strong/80 bg-surface p-6 shadow-[var(--shadow-overlay)] sm:p-8 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between">
                <Eyebrow n="01">Mission Briefing · 08:45 NY</Eyebrow>
                <span className="rounded-full border border-profit/30 bg-profit/10 px-2.5 py-0.5 font-mono text-[10.5px] font-medium text-profit">
                  Interactive Study
                </span>
              </div>

              <h1 className="mt-4 font-display text-[clamp(2rem,3.4vw,3.35rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink">
                Most journals record the result.{" "}
                <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                  Edgebook records the decision.
                </span>
              </h1>

              <p className="mt-3.5 text-[15px] leading-relaxed text-muted">
                Before the market tests your strategy, it tests your mind. Inspect or arm the four pre-session checkpoints below, then step into <strong className="font-medium text-ink">The Inner Film</strong>.
              </p>

              {/* 4 Playable Mission Checkpoints */}
              <div
                className="mt-5 space-y-2"
                role="listbox"
                aria-label="Session #048 decision checkpoints"
              >
                {DESK_CHECKPOINTS.map((cp, idx) => {
                  const isFocused = idx === focusedNode;
                  const isArmed = !!verifiedNodes[idx];
                  return (
                    <button
                      key={cp.id}
                      type="button"
                      role="option"
                      aria-selected={isFocused}
                      onClick={() => toggleCheckpoint(idx)}
                      onMouseEnter={() => setFocusedNode(idx)}
                      className={`w-full rounded-2xl border px-4 py-3 text-left transition-all duration-200 ${
                        isFocused
                          ? "border-gold bg-raised shadow-[var(--shadow-rest)]"
                          : "border-line bg-canvas/60 hover:border-line-strong"
                      }`}
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
                        <span className={isFocused ? "font-semibold text-gold" : "text-faint"}>
                          [{cp.code}] · {cp.label}
                        </span>
                        <span
                          className={`rounded-full px-2 py-0.5 ${
                            isArmed
                              ? "bg-profit/12 font-semibold text-profit"
                              : "bg-ink/[0.06] text-muted"
                          }`}
                        >
                          {isArmed ? "✓ ARMED" : "CLICK TO ARM"}
                        </span>
                      </div>
                      <p className="mt-1 line-clamp-2 text-[13.5px] font-medium leading-snug text-ink">
                        {cp.summary}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Bottom Actions */}
            <div className="mt-6 border-t border-line pt-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <Link
                  href="/login?mode=signup"
                  className="inline-flex h-11 items-center rounded-full bg-gold-strong px-6 text-[15px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
                >
                  Start your journal
                </Link>
                <a
                  href="#film"
                  className="group inline-flex items-center gap-1.5 text-[15px] font-medium text-gold transition-colors hover:text-ink"
                >
                  Launch Fullscreen Theatre
                  <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*  CHAPTER 03 — THE 5-GATE RITUAL ARENA (#how — Full-Width 3-Col Cockpit)   */
/* -------------------------------------------------------------------------- */

export function DecisionRitualStage() {
  const secRef = useRef<HTMLElement>(null);
  const gateCanvasRef = useRef<HTMLCanvasElement>(null);

  const [activeIdx, setActiveIdx] = useState(0);
  const [scrollProg, setScrollProg] = useState(0);
  const [stageLocalProg, setStageLocalProg] = useState(1);

  const stage = RITUAL_STAGES[activeIdx] ?? RITUAL_STAGES[0]!;

  // 60fps Animated Storyboard Cartoon Loop for the Active Gate
  useEffect(() => {
    const canvas = gateCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let rafId = 0;
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      const w = Math.max(280, Math.floor(rect.width * dpr));
      const h = Math.max(220, Math.floor(rect.height * dpr));
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });

    const render = (now: number) => {
      rafId = window.requestAnimationFrame(render);
      if (document.hidden) return;
      drawGateStoryboardCartoon(ctx, canvas.width, canvas.height, activeIdx, now * 0.001);
    };
    rafId = window.requestAnimationFrame(render);

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("resize", resize);
    };
  }, [activeIdx]);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    return bindScrollProgress(
      secRef.current,
      (p) => {
        const clamped = clamp(p, 0, 0.9999);
        const scaled = clamped * RITUAL_STAGES.length;
        const idx = Math.min(RITUAL_STAGES.length - 1, Math.floor(scaled));
        const local = clamp(scaled - idx, 0, 1);

        setScrollProg((prev) => (Math.abs(prev - clamped) < 0.003 ? prev : clamped));
        setActiveIdx((prev) => (prev === idx ? prev : idx));
        setStageLocalProg((prev) => (Math.abs(prev - local) < 0.01 ? prev : local));
      },
      { pinned: true },
    );
  }, []);

  const jumpToStage = (idx: number) => {
    setActiveIdx(idx);
    setStageLocalProg(0.5);
    if (!prefersReducedMotion() && secRef.current) {
      const targetP = (idx + 0.25) / RITUAL_STAGES.length;
      scrollToPinnedProgress(secRef.current, targetP, true);
    }
  };

  const entryLift = prefersReducedMotion()
    ? 1
    : smooth(clamp(stageLocalProg * 4.2, 0.25, 1));

  return (
    <section
      id="how"
      ref={secRef}
      className="lp-ritual-pin relative w-full"
      aria-labelledby="ritual-title"
    >
      <div className="lg:sticky lg:top-0 flex min-h-svh w-full flex-col justify-center py-14 sm:py-16">
        <div className="lp-wide w-full">
          {/* Top Full-Width Header + 5-Gate Circuit Bar */}
          <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
            <div>
              <Eyebrow n="03">CH.03 · The 5-Gate Decision Flowchart</Eyebrow>
              <h2
                id="ritual-title"
                className="mt-3 font-display text-[clamp(1.9rem,4vw,3.4rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
              >
                A quiet system for{" "}
                <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                  every part of a decision.
                </span>
              </h2>
            </div>

            {/* 5-Gate Segmented Selector */}
            <div className="flex overflow-x-auto pb-1 [scrollbar-width:none]">
              <div
                role="tablist"
                aria-label="Five stages of the Edgebook ritual"
                className="inline-grid min-w-full grid-cols-5 rounded-full border border-line bg-surface p-1.5 sm:min-w-[580px]"
              >
                {RITUAL_STAGES.map((s, idx) => {
                  const isSelected = idx === activeIdx;
                  const isUnlocked = idx <= activeIdx;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      role="tab"
                      aria-selected={isSelected}
                      onClick={() => jumpToStage(idx)}
                      className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-center text-[12.5px] font-medium transition duration-200 sm:px-4 sm:text-[13px] ${
                        isSelected
                          ? "border border-line-strong bg-raised text-ink shadow-[var(--shadow-rest)]"
                          : isUnlocked
                            ? "text-ink/80 hover:text-ink"
                            : "text-muted hover:text-ink"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          isSelected
                            ? "bg-gold"
                            : isUnlocked
                              ? "bg-profit"
                              : "bg-line-strong"
                        }`}
                        aria-hidden="true"
                      />
                      <span className="hidden font-mono text-[11px] text-gold sm:inline">
                        {s.num}
                      </span>
                      <span>{s.tab}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Continuous Scroll Circuit Trace */}
          <div
            aria-hidden="true"
            className="mt-4 h-1 w-full overflow-hidden rounded-full bg-line/70"
          >
            <div
              className="h-full origin-left rounded-full bg-gradient-to-r from-profit via-gold to-gold-strong transition-transform duration-75 ease-out"
              style={{
                transform: `scaleX(${Math.max(0.08, scrollProg || (activeIdx + 1) / RITUAL_STAGES.length)})`,
              }}
            />
          </div>

          {/* Full-Width 3-Column Widescreen Game Cockpit */}
          <div className="lp-sq mt-5 grid items-stretch gap-6 rounded-[32px] border border-line-strong/80 bg-surface p-5 shadow-[var(--shadow-overlay)] sm:p-8 lg:grid-cols-12 xl:gap-8">
            {/* COLUMN 1 (4 Cols): Gate Narrative, Quote & Controls */}
            <div
              style={{
                opacity: entryLift,
                transform: `translate3d(0, ${((1 - entryLift) * 14).toFixed(1)}px, 0)`,
              }}
              className="flex flex-col justify-between transition-transform duration-150 ease-out lg:col-span-4"
            >
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-gold">
                  <span className="h-1.5 w-1.5 rounded-full bg-profit" aria-hidden="true" />
                  <span>{stage.gateCode}</span>
                  <span className="text-faint">·</span>
                  <span className="text-profit">{stage.integrityScore}</span>
                </div>

                <p className="mt-3.5 font-mono text-[11.5px] uppercase tracking-[0.14em] text-faint">
                  Stage {stage.num} of 05 · {stage.moment}
                </p>

                <h3 className="mt-2 font-display text-[clamp(1.55rem,2.6vw,2.35rem)] font-semibold leading-[1.06] tracking-[-0.035em] text-ink">
                  {stage.headline}{" "}
                  <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                    {stage.italicAccent}
                  </span>
                </h3>
                <p className="mt-3 text-[15px] leading-relaxed text-muted">
                  {stage.description}
                </p>
              </div>

              <div className="mt-6 space-y-4">
                <blockquote className="rounded-2xl border border-line bg-canvas/70 p-4">
                  <p className="font-serif text-[17.5px] italic leading-snug text-ink">
                    &ldquo;{stage.quote}&rdquo;
                  </p>
                  <footer className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-gold">
                    — {stage.quoteAuthor}
                  </footer>
                </blockquote>

                <div className="flex items-center gap-2.5">
                  <button
                    type="button"
                    onClick={() =>
                      jumpToStage((activeIdx - 1 + RITUAL_STAGES.length) % RITUAL_STAGES.length)
                    }
                    className="inline-flex h-9 items-center rounded-full border border-line-strong bg-raised px-4 text-[13px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
                  >
                    ← Prev Gate
                  </button>
                  <button
                    type="button"
                    onClick={() => jumpToStage((activeIdx + 1) % RITUAL_STAGES.length)}
                    className="inline-flex h-9 items-center rounded-full border border-line-strong bg-raised px-4 text-[13px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
                  >
                    Next Gate →
                  </button>
                </div>
              </div>
            </div>

            {/* COLUMN 2 (4 Cols): Live 60fps Animated Storyboard Cartoon & Plate Stage */}
            <div className="relative min-h-[260px] overflow-hidden rounded-[24px] border border-line-strong bg-[#16120d] lg:col-span-4">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-40 transition-all duration-500"
                style={{ backgroundImage: `url(${stage.plate})` }}
                aria-hidden="true"
              />
              <div
                className="pointer-events-none absolute inset-0"
                style={{
                  background:
                    "radial-gradient(circle at 50% 45%, rgba(21,18,13,0.2) 0%, rgba(21,18,13,0.86) 100%)",
                }}
                aria-hidden="true"
              />
              <canvas
                ref={gateCanvasRef}
                className="relative z-10 h-full w-full"
                aria-label={`Animated storyboard for ${stage.tab}`}
              />
              <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex items-center justify-between bg-black/55 px-4 py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-[#dfbe82] backdrop-blur-md">
                <span>Animated Storyboard · Gate {stage.num}</span>
                <span className="text-[#74b08c]">60fps Live</span>
              </div>
            </div>

            {/* COLUMN 3 (4 Cols): Tactile Gate Ledger Sheet */}
            <div className="flex flex-col justify-between rounded-[24px] border border-line bg-canvas/80 p-5 sm:p-6 lg:col-span-4">
              <div>
                <div className="mb-3 flex items-center justify-between border-b border-line pb-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                  <span>Gate {stage.num} Telemetry</span>
                  <span className="text-profit">● Unlocked</span>
                </div>
                <div className="space-y-2.5">
                  {stage.entries.map((item, idx) => {
                    const rowProgress = prefersReducedMotion()
                      ? 1
                      : smooth(clamp((stageLocalProg - idx * 0.08) * 3.8, 0.35, 1));
                    return (
                      <div
                        key={item.label}
                        style={{
                          opacity: rowProgress,
                          transform: `translate3d(0, ${((1 - rowProgress) * 10).toFixed(1)}px, 0)`,
                        }}
                        className="rounded-2xl border border-line bg-raised px-4 py-3 shadow-[var(--shadow-rest)] transition-transform duration-150"
                      >
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                          {item.label}
                        </p>
                        <p
                          className={`mt-1 text-[14.5px] font-medium leading-snug ${
                            item.tone ?? "text-ink"
                          }`}
                        >
                          {item.value}
                        </p>
                      </div>
                    );
                  })}
                </div>
              </div>

              <p className="mt-4 flex items-center gap-2 border-t border-line pt-3 text-[12.5px] text-muted">
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold" aria-hidden="true" />
                <span>{stage.note}</span>
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

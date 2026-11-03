"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AwardIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  FlagIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { Eyebrow } from "./ledger";
import { awardGameAction, useLandingGame } from "./game-state";

/* ========================================================================== */
/*  QUEST 06A — INTERACTIVE EQUITY ROAD GAME (#road)                          */
/*  Driven by live game equity ($10,000 -> $20,000) or interactive clicks.    */
/* ========================================================================== */

const ROAD =
  "M20 185 H210 Q240 185 240 155 V105 Q240 75 270 75 H450 Q480 75 480 105 V135 Q480 165 510 165 H700 Q730 165 730 135 V95 Q730 65 760 65 H845";

interface RoadCheckpoint {
  id: string;
  x: number;
  y: number;
  progress: number;
  equityTarget: number;
  label: string;
  title: string;
  detail: string;
  quote: string;
}

const CHECKPOINTS: RoadCheckpoint[] = [
  {
    id: "start",
    x: 20,
    y: 185,
    progress: 0.04,
    equityTarget: 10000,
    label: "Start · $10k",
    title: "Day 01 · The First Written Plan",
    detail:
      "You stop trading from impulse and commit to logging every pre-session intention before the opening bell.",
    quote: "“A journey of a thousand miles begins with a single kept rule.”",
  },
  {
    id: "m1",
    x: 115,
    y: 185,
    progress: 0.18,
    equityTarget: 12500,
    label: "$12.5k",
    title: "Checkpoint I · First 20 Clean Sessions",
    detail:
      "Early stop-move habit identified by Minato and queued into your daily Time Machine drill feed.",
    quote: "“Small disciplines repeated with consistency every day lead to great achievements.”",
  },
  {
    id: "m2",
    x: 360,
    y: 75,
    progress: 0.46,
    equityTarget: 15000,
    label: "$15k",
    title: "Checkpoint II · The Drawdown Survival Badge",
    detail:
      "Two losing sessions handled within your exact risk envelope—zero revenge trades, zero tilt.",
    quote: "“Anyone can hold the helm when the sea is calm.” — Publilius Syrus",
  },
  {
    id: "m3",
    x: 600,
    y: 165,
    progress: 0.74,
    equityTarget: 17500,
    label: "$17.5k",
    title: "Checkpoint III · Box 5 Spaced Mastery",
    detail:
      "Your opening-range reclaim playbook reaches an 84% clean-process rate across 60 logged trades.",
    quote: "“Consistency is what transforms average into excellence.”",
  },
  {
    id: "target",
    x: 845,
    y: 65,
    progress: 1.0,
    equityTarget: 20000,
    label: "Target · $20k",
    title: "Destination · Sovereign Operator",
    detail:
      "Your edge is documented, practiced, and stored in your own Google Drive.",
    quote: "“Your edge was never in the market. It was in the person you became.”",
  },
];

export function Road() {
  const game = useLandingGame();
  const svg = useRef<SVGSVGElement>(null);
  const drawFnRef = useRef<((f: number) => void) | null>(null);

  const [selectedStop, setSelectedStop] = useState<number | null>(null);

  // Derive road progress from live game.equity ($10,000 -> $20,000) unless a stop is manually inspected
  const equityProgress = Math.max(
    0.04,
    Math.min(1, (game.equity - 10000) / 10000),
  );

  let derivedStop = 0;
  CHECKPOINTS.forEach((cp, idx) => {
    if (game.equity >= cp.equityTarget) derivedStop = idx;
  });

  const activeStop = selectedStop ?? derivedStop;
  const currentCp = CHECKPOINTS[activeStop] ?? CHECKPOINTS[0]!;

  const selectCheckpoint = useCallback((idx: number) => {
    setSelectedStop(idx);
    const cp = CHECKPOINTS[idx];
    if (!cp) return;
    if (drawFnRef.current) {
      drawFnRef.current(cp.progress);
    }
    if (idx === 4) {
      awardGameAction({
        xpDelta: 50,
        equityDelta: Math.max(0, 20000 - game.equity),
        questId: "q6_vault",
        title: "Destination Reached · $20,000 Target!",
        subtitle: "Sovereign Operator milestone unlocked on the Equity Road.",
        tone: "profit",
      });
    } else {
      awardGameAction({
        xpDelta: 15,
        title: `Milestone Inspected: ${cp.label}`,
        subtitle: cp.title,
        tone: "gold",
      });
    }
  }, [game.equity]);

  const simulateCleanSession = () => {
    setSelectedStop(null);
    const nextEq = Math.min(20000, game.equity + 2000);
    const reachedTarget = nextEq >= 20000;
    awardGameAction({
      xpDelta: 60,
      composureDelta: 4,
      equityDelta: 2000,
      streakIncrement: true,
      questId: reachedTarget ? "q6_vault" : undefined,
      title: reachedTarget
        ? "$20,000 Target Flag Reached!"
        : "Clean Session Logged (+$2,000)",
      subtitle: reachedTarget
        ? "You drove your operator marker all the way to the $20k target!"
        : `Account equity advanced to $${nextEq.toLocaleString()}.`,
      tone: "profit",
    });
  };

  useEffect(() => {
    const root = svg.current;
    if (!root) return;
    const path = root.querySelector<SVGPathElement>("[data-road]");
    const marker = root.querySelector<SVGGElement>("[data-marker]");
    const ms = Array.from(root.querySelectorAll<SVGGElement>("[data-ms]"));
    const flag = root.querySelector<SVGGElement>("[data-flag]");
    if (!path || !marker || !flag) return;
    const L = path.getTotalLength();

    const at = CHECKPOINTS.slice(1).map((m) => {
      let best = 0;
      let bd = Infinity;
      for (let l = 0; l <= L; l += 4) {
        const p = path.getPointAtLength(l);
        const d = (p.x - m.x) ** 2 + (p.y - m.y) ** 2;
        if (d < bd) {
          bd = d;
          best = l;
        }
      }
      return best / L;
    });

    const draw = (f: number) => {
      path.style.strokeDashoffset = String(L * (1 - f));
      const pt = path.getPointAtLength(L * f);
      marker.setAttribute("transform", `translate(${pt.x} ${pt.y})`);
      marker.style.opacity = "1";
      ms.forEach((m, i) =>
        m.setAttribute("data-on", String(f >= (at[i] ?? 0) - 0.01)),
      );
      flag.setAttribute("data-on", String(f >= (at[3] ?? 1) - 0.01));
    };

    drawFnRef.current = draw;
    path.style.strokeDasharray = String(L);

    const targetF =
      selectedStop !== null
        ? (CHECKPOINTS[selectedStop]?.progress ?? equityProgress)
        : equityProgress;
    draw(targetF);
  }, [equityProgress, selectedStop]);

  return (
    <section
      id="road"
      className="lp-wide relative overflow-hidden py-16 sm:py-24"
      aria-labelledby="road-title"
    >
      <div className="mb-8 flex flex-col justify-between gap-6 border-t border-line pt-10 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Eyebrow n="06">QUEST 06 · INTERACTIVE EQUITY ROAD ($10K → $20K)</Eyebrow>
            {game.questsCompleted.q6_vault && (
              <span className="inline-flex items-center gap-1 rounded-full border border-profit/40 bg-profit/12 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-profit">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                QUEST 06 CLEARED
              </span>
            )}
          </div>
          <h2
            id="road-title"
            className="mt-3 font-display text-[clamp(2rem,4.4vw,3.6rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
          >
            Progress you can{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              play &amp; see.
            </span>
          </h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">
            Every decision you made in Quests 01–05 moved your marker along this road. Click <strong className="font-semibold text-ink">Simulate Clean Session (+$2,000)</strong> or click the <strong className="font-semibold text-gold">$20k Target Flag</strong> to complete the journey!
          </p>
        </div>

        {/* Drive Equity Action Button */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="rounded-2xl border border-line bg-surface px-4 py-2.5 text-right">
            <span className="block font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
              Current Road Equity
            </span>
            <span className="kpi text-[22px] text-profit">
              ${game.equity.toLocaleString()}{" "}
              <span className="text-[13px] font-normal text-muted">/ $20,000</span>
            </span>
          </div>

          <button
            type="button"
            onClick={simulateCleanSession}
            className="inline-flex h-12 items-center gap-2 rounded-full bg-gold-strong px-6 text-[14.5px] font-semibold text-on-gold transition hover:bg-gold-strong-hover active:scale-[0.98]"
          >
            <SparklesIcon className="h-4 w-4" />
            <span>Log Clean Session (+$2,000 &amp; +60 XP)</span>
          </button>
        </div>
      </div>

      <div className="grid items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
        {/* Left 4 Cols: Active Checkpoint Dossier Card */}
        <div className="lp-game-card flex flex-col justify-between p-6 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-gold">
              <span>{currentCp.label}</span>
              <span className="text-profit">
                {game.equity >= currentCp.equityTarget || activeStop === 4
                  ? "● Milestone Reached"
                  : "○ Inspecting"}
              </span>
            </div>
            <h3 className="mt-2.5 font-display text-[21px] font-semibold leading-tight tracking-[-0.025em] text-ink">
              {currentCp.title}
            </h3>
            <p className="mt-2 text-[14.5px] leading-relaxed text-muted">
              {currentCp.detail}
            </p>

            {/* Progress Bar to $20k */}
            <div className="mt-5 rounded-2xl border border-line bg-canvas/75 p-4">
              <div className="flex justify-between font-mono text-[11px]">
                <span className="text-muted">Road Completion</span>
                <strong className="num text-profit">
                  {Math.round(equityProgress * 100)}%
                </strong>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/[0.08]">
                <div
                  className="h-full rounded-full bg-profit transition-all duration-300"
                  style={{ width: `${Math.round(equityProgress * 100)}%` }}
                />
              </div>
            </div>
          </div>

          <blockquote className="mt-5 border-t border-line pt-4 font-serif text-[16.5px] italic text-gold">
            {currentCp.quote}
          </blockquote>
        </div>

        {/* Right 8 Cols: Widescreen Interactive Winding Road SVG Map */}
        <div className="lp-game-card flex flex-col justify-between px-4 pb-5 pt-6 sm:px-8 sm:pt-8 lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              Interactive Equity Map · Click Any Checkpoint [1–5]
            </span>
            <div className="flex flex-wrap gap-1.5">
              {CHECKPOINTS.map((cp, idx) => (
                <button
                  key={cp.id}
                  type="button"
                  onClick={() => selectCheckpoint(idx)}
                  className={`rounded-full px-3 py-1 font-mono text-[10.5px] transition ${
                    activeStop === idx
                      ? "bg-gold-strong font-semibold text-on-gold"
                      : "border border-line bg-raised text-muted hover:text-ink"
                  }`}
                >
                  {cp.label}
                </button>
              ))}
            </div>
          </div>

          <svg
            ref={svg}
            viewBox="0 0 880 240"
            className="w-full overflow-visible"
            role="img"
            aria-label="A winding road from your starting equity through milestones to your $20k target"
          >
            <defs>
              <linearGradient id="lp-road-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-profit)" />
                <stop offset="100%" stopColor="var(--color-gold)" />
              </linearGradient>
            </defs>
            <path
              d={ROAD}
              fill="none"
              stroke="var(--color-road-shadow)"
              strokeWidth="28"
              strokeLinecap="round"
            />
            <path
              d={ROAD}
              fill="none"
              stroke="var(--color-line-strong)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeDasharray="2 9"
            />
            <path
              data-road
              d={ROAD}
              fill="none"
              stroke="url(#lp-road-grad)"
              strokeWidth="5"
              strokeLinecap="round"
              style={{ transition: "stroke-dashoffset 0.45s ease-out" }}
            />

            <g onClick={() => selectCheckpoint(0)} className="cursor-pointer">
              <circle
                cx="20"
                cy="185"
                r="9"
                fill="var(--color-raised)"
                stroke="var(--color-profit)"
                strokeWidth="2"
              />
              <text
                x="20"
                y="214"
                textAnchor="middle"
                fontSize="12"
                fill="var(--color-muted)"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Start $10k
              </text>
            </g>

            {CHECKPOINTS.slice(1, 4).map((m, idx) => (
              <g
                key={m.id}
                data-ms
                className="lp-ms cursor-pointer"
                data-on="false"
                onClick={() => selectCheckpoint(idx + 1)}
              >
                <circle
                  className="lp-ms-ring"
                  cx={m.x}
                  cy={m.y}
                  r="15"
                  fill="none"
                  stroke="var(--color-profit)"
                  strokeOpacity="0.35"
                />
                <circle
                  className="lp-ms-dot"
                  cx={m.x}
                  cy={m.y}
                  r="9"
                  fill="var(--color-raised)"
                  stroke="var(--color-line-strong)"
                  strokeWidth="2"
                />
                <text
                  x={m.x}
                  y={m.y - 22}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="600"
                  fill="var(--color-faint)"
                  style={{ fontFamily: "var(--font-sans)" }}
                >
                  {m.label}
                </text>
              </g>
            ))}

            <g
              data-flag
              className="lp-ms cursor-pointer"
              data-on="false"
              onClick={() => selectCheckpoint(4)}
            >
              <rect
                x="845"
                y="30"
                width="3.5"
                height="52"
                rx="1.75"
                fill="var(--color-gold)"
              />
              <path
                d="M848.5 32 L886 42 L848.5 54 Z"
                fill="var(--color-gold)"
              />
              <text
                x="840"
                y="104"
                textAnchor="end"
                fontSize="12"
                fontWeight="600"
                fill="var(--color-gold)"
                style={{ fontFamily: "var(--font-sans)" }}
              >
                Target $20k
              </text>
            </g>

            <g
              data-marker
              style={{
                opacity: 1,
                transition: "transform 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
              }}
            >
              <circle r="15" fill="var(--color-gold)" fillOpacity="0.24" />
              <circle
                r="8"
                fill="var(--color-ink)"
                stroke="var(--color-gold)"
                strokeWidth="2.5"
              />
            </g>
          </svg>

          <div className="mt-4 flex flex-col items-center gap-2 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <p className="text-[13.5px] text-muted">
              No streaks reset if you take a disciplined No-Trade Day—milestones are cumulative.
            </p>
            <Link
              href="/login?mode=signup"
              className="group inline-flex items-center gap-1 text-[14.5px] font-medium text-gold transition-colors hover:text-ink"
            >
              Start your real road
              <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

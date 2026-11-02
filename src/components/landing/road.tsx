"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronRightIcon } from "@/components/ui/icons";
import { bindScrollProgress, prefersReducedMotion } from "./motion-utils";
import { Eyebrow } from "./ledger";

const ROAD =
  "M20 185 H210 Q240 185 240 155 V105 Q240 75 270 75 H450 Q480 75 480 105 V135 Q480 165 510 165 H700 Q730 165 730 135 V95 Q730 65 760 65 H845";

interface RoadCheckpoint {
  id: string;
  x: number;
  y: number;
  progress: number;
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
    label: "Start · $10k",
    title: "Day 01 · The First Written Plan",
    detail: "You stop trading from impulse and commit to logging every pre-session intention before the opening bell.",
    quote: "“A journey of a thousand miles begins with a single kept rule.”",
  },
  {
    id: "m1",
    x: 115,
    y: 185,
    progress: 0.14,
    label: "$12.5k",
    title: "Checkpoint I · First 20 Clean Sessions",
    detail: "Early stop-move habit identified by Minato and queued into your daily Time Machine drill feed.",
    quote: "“Small disciplines repeated with consistency every day lead to great achievements.”",
  },
  {
    id: "m2",
    x: 360,
    y: 75,
    progress: 0.45,
    label: "$15k",
    title: "Checkpoint II · The Drawdown Survival Badge",
    detail: "Two losing sessions handled within your exact risk envelope—zero revenge trades, zero tilt.",
    quote: "“Anyone can hold the helm when the sea is calm.” — Publilius Syrus",
  },
  {
    id: "m3",
    x: 600,
    y: 165,
    progress: 0.72,
    label: "$17.5k",
    title: "Checkpoint III · Box 5 Spaced Mastery",
    detail: "Your opening-range reclaim playbook reaches an 84% clean-process rate across 60 logged trades.",
    quote: "“Consistency is what transforms average into excellence.”",
  },
  {
    id: "target",
    x: 845,
    y: 65,
    progress: 1.0,
    label: "Target · $20k",
    title: "Destination · Sovereign Operator",
    detail: "Your edge is documented, practiced, and stored in your own Google Drive.",
    quote: "“Your edge was never in the market. It was in the person you became.”",
  },
];

/**
 * CHAPTER 05C — THE ROAD (#road)
 * Full-width widescreen Interactive Equity Road Mini-Game:
 * Scroll or click any checkpoint button to drive the avatar along the winding road.
 */
export function Road() {
  const sec = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const drawFnRef = useRef<((f: number) => void) | null>(null);

  const [activeStop, setActiveStop] = useState(3);
  const [manualOverride, setManualOverride] = useState(false);

  const selectCheckpoint = useCallback((idx: number) => {
    setManualOverride(true);
    setActiveStop(idx);
    const cp = CHECKPOINTS[idx];
    if (cp && drawFnRef.current) {
      drawFnRef.current(cp.progress);
    }
  }, []);

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
      marker.style.opacity = f > 0.005 ? "1" : "0";
      ms.forEach((m, i) => m.setAttribute("data-on", String(f >= (at[i] ?? 0) - 0.01)));
      flag.setAttribute("data-on", String(f >= (at[3] ?? 1) - 0.01));
    };

    drawFnRef.current = draw;
    path.style.strokeDasharray = String(L);

    if (prefersReducedMotion()) {
      draw(1);
      return;
    }

    draw(0.14);
    return bindScrollProgress(
      root,
      (f) => {
        if (!manualOverride) {
          draw(f);
          const idx = Math.min(CHECKPOINTS.length - 1, Math.floor(f * CHECKPOINTS.length));
          setActiveStop((prev) => (prev === idx ? prev : idx));
        }
      },
      { startRatio: 0.85, endRatio: 0.3 },
    );
  }, [manualOverride]);

  const currentCp = CHECKPOINTS[activeStop] ?? CHECKPOINTS[0]!;

  return (
    <section id="road" ref={sec} className="lp-wide relative overflow-hidden py-24 sm:py-32">
      <div className="grid items-center gap-8 lg:grid-cols-12 xl:gap-12">
        {/* Left 4 Cols: Narrative + Active Checkpoint Dossier Card */}
        <div className="lg:col-span-4">
          <Eyebrow n="08">Interactive Equity Road</Eyebrow>
          <h2 className="mt-4 font-display text-[clamp(2rem,4.4vw,3.5rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
            Progress you can{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              play &amp; see.
            </span>
          </h2>
          <p className="mt-3 text-[15.5px] leading-relaxed text-muted">
            Every logged decision and finished review moves your operator marker along the road to your target. Scroll or click any checkpoint to inspect the milestone.
          </p>

          {/* Active Checkpoint Game Dossier */}
          <div className="lp-sq mt-6 rounded-[24px] border border-line-strong bg-surface p-5 shadow-[var(--shadow-rest)]">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em] text-gold">
              <span>{currentCp.label}</span>
              <span className="text-profit">● Checkpoint Unlocked</span>
            </div>
            <h3 className="mt-2 font-display text-[18px] font-semibold text-ink">
              {currentCp.title}
            </h3>
            <p className="mt-1.5 text-[14px] leading-relaxed text-muted">
              {currentCp.detail}
            </p>
            <p className="mt-3 border-t border-line pt-2.5 font-serif text-[15.5px] italic text-gold">
              {currentCp.quote}
            </p>
          </div>
        </div>

        {/* Right 8 Cols: Widescreen Interactive Winding Road SVG Map */}
        <div className="lp-sq rounded-[32px] border border-line-strong/80 bg-surface px-4 pb-5 pt-8 shadow-[var(--shadow-overlay)] sm:px-8 sm:pt-10 lg:col-span-8">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="font-mono text-[11px] uppercase tracking-[0.12em] text-faint">
              Interactive Map · Click Any Milestone to Drive
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
            aria-label="A winding road from your starting equity through milestones to your target"
          >
            <defs>
              <linearGradient id="lp-road-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-profit)" />
                <stop offset="100%" stopColor="var(--color-gold)" />
              </linearGradient>
            </defs>
            <path d={ROAD} fill="none" stroke="var(--color-road-shadow)" strokeWidth="28" strokeLinecap="round" />
            <path d={ROAD} fill="none" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 9" />
            <path data-road d={ROAD} fill="none" stroke="url(#lp-road-grad)" strokeWidth="4" strokeLinecap="round" />

            <g
              onClick={() => selectCheckpoint(0)}
              className="cursor-pointer"
            >
              <circle cx="20" cy="185" r="9" fill="var(--color-raised)" stroke="var(--color-muted)" strokeWidth="2" />
              <text x="20" y="214" textAnchor="middle" fontSize="12" fill="var(--color-muted)" style={{ fontFamily: "var(--font-sans)" }}>
                Start
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
                <circle className="lp-ms-ring" cx={m.x} cy={m.y} r="15" fill="none" stroke="var(--color-profit)" strokeOpacity="0.35" />
                <circle className="lp-ms-dot" cx={m.x} cy={m.y} r="9" fill="var(--color-raised)" stroke="var(--color-line-strong)" strokeWidth="2" />
                <text x={m.x} y={m.y - 22} textAnchor="middle" fontSize="12" fontWeight="600" fill="var(--color-faint)" style={{ fontFamily: "var(--font-sans)" }}>
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
              <rect x="845" y="30" width="3.5" height="52" rx="1.75" fill="var(--color-gold)" />
              <path d="M848.5 32 L886 42 L848.5 54 Z" fill="var(--color-gold)" />
              <text x="840" y="104" textAnchor="end" fontSize="12" fontWeight="600" fill="var(--color-gold)" style={{ fontFamily: "var(--font-sans)" }}>
                Target
              </text>
            </g>

            <g data-marker style={{ opacity: 1 }}>
              <circle r="14" fill="var(--color-gold)" fillOpacity="0.22" />
              <circle r="7.5" fill="var(--color-ink)" stroke="var(--color-gold)" strokeWidth="2" />
            </g>
          </svg>

          <div className="mt-4 flex flex-col items-center gap-2 border-t border-line pt-4 sm:flex-row sm:justify-between">
            <p className="text-[14px] text-muted">
              Milestones light up as your equity and clean-process streak cross them.
            </p>
            <Link
              href="/login?mode=signup"
              className="group inline-flex items-center gap-1 text-[15px] font-medium text-gold transition-colors hover:text-ink"
            >
              Start your road
              <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

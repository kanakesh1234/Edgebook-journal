"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { ChevronRightIcon } from "@/components/ui/icons";
import { prefersReducedMotion } from "./motion-utils";
import { Eyebrow } from "./ledger";

const ROAD =
  "M20 185 H210 Q240 185 240 155 V105 Q240 75 270 75 H450 Q480 75 480 105 V135 Q480 165 510 165 H700 Q730 165 730 135 V95 Q730 65 760 65 H845";

const MILESTONES = [
  { x: 115, y: 185, label: "$12.5k" },
  { x: 360, y: 75, label: "$15k" },
  { x: 600, y: 165, label: "$17.5k" },
];

/** The roadmap teaser: the line is drawn by your scroll, milestones light as it passes them. */
export function Road() {
  const sec = useRef<HTMLElement>(null);
  const svg = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const root = svg.current!;
    const path = root.querySelector<SVGPathElement>("[data-road]")!;
    const marker = root.querySelector<SVGGElement>("[data-marker]")!;
    const ms = Array.from(root.querySelectorAll<SVGGElement>("[data-ms]"));
    const flag = root.querySelector<SVGGElement>("[data-flag]")!;
    const L = path.getTotalLength();

    // where along the road each milestone sits
    const at = [...MILESTONES.map((m) => ({ x: m.x, y: m.y })), { x: 845, y: 65 }].map((m) => {
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
      ms.forEach((m, i) => m.setAttribute("data-on", String(f >= at[i] - 0.004)));
      flag.setAttribute("data-on", String(f >= at[3] - 0.004));
    };

    path.style.strokeDasharray = String(L);
    if (prefersReducedMotion()) {
      draw(1);
      marker.style.opacity = "0";
      return;
    }
    gsap.registerPlugin(ScrollTrigger);
    draw(0);
    const st = ScrollTrigger.create({
      trigger: root,
      start: "top 78%",
      end: "bottom 42%",
      onUpdate: (self) => draw(self.progress),
    });
    return () => st.kill();
  }, []);

  return (
    <section id="road" ref={sec} className="relative overflow-hidden px-5 py-28 sm:px-8 sm:py-40">
      <div className="mx-auto max-w-[1200px] text-center">
        <div className="mb-6 flex justify-center"><Eyebrow n="06">The road</Eyebrow></div>
        <h2 className="mx-auto max-w-3xl font-display text-[clamp(2rem,5vw,3.8rem)] font-semibold leading-[1.05] tracking-[-0.04em] text-ink">
          Progress you can{" "}
          <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">see.</span>
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-[clamp(1rem,1.5vw,1.2rem)] leading-snug text-muted">
          Every logged trade and finished review moves you along the road to your target.
        </p>

        <div className="lp-sq mx-auto mt-14 max-w-4xl rounded-[32px] border border-line bg-surface px-3 pb-3 pt-8 sm:px-10 sm:pt-10">
          <svg ref={svg} viewBox="0 0 880 240" className="w-full overflow-visible" role="img" aria-label="A winding road from your starting equity through milestones to your target">
            <defs>
              <linearGradient id="lp-road-grad" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-profit)" />
                <stop offset="100%" stopColor="var(--color-gold)" />
              </linearGradient>
            </defs>
            <path d={ROAD} fill="none" stroke="var(--color-road-shadow)" strokeWidth="26" strokeLinecap="round" />
            <path d={ROAD} fill="none" stroke="var(--color-line-strong)" strokeWidth="2" strokeLinecap="round" strokeDasharray="2 9" />
            <path data-road d={ROAD} fill="none" stroke="url(#lp-road-grad)" strokeWidth="3.5" strokeLinecap="round" />

            <g>
              <circle cx="20" cy="185" r="8" fill="var(--color-raised)" stroke="var(--color-muted)" strokeWidth="2" />
              <text x="20" y="214" textAnchor="middle" fontSize="12" fill="var(--color-muted)" style={{ fontFamily: "var(--font-sans)" }}>Start</text>
            </g>

            {MILESTONES.map((m) => (
              <g key={m.label} data-ms className="lp-ms" data-on="false">
                <circle className="lp-ms-ring" cx={m.x} cy={m.y} r="14" fill="none" stroke="var(--color-profit)" strokeOpacity="0.3" />
                <circle className="lp-ms-dot" cx={m.x} cy={m.y} r="8" fill="var(--color-raised)" stroke="var(--color-line-strong)" strokeWidth="2" />
                <text x={m.x} y={m.y - 20} textAnchor="middle" fontSize="12" fill="var(--color-faint)" style={{ fontFamily: "var(--font-sans)" }}>{m.label}</text>
              </g>
            ))}

            <g data-flag className="lp-ms" data-on="false">
              <rect x="845" y="30" width="3.5" height="52" rx="1.75" fill="var(--color-gold)" />
              <path d="M848.5 32 L886 42 L848.5 54 Z" fill="var(--color-gold)" />
              <text x="840" y="104" textAnchor="end" fontSize="12" fill="var(--color-gold)" style={{ fontFamily: "var(--font-sans)" }}>Target</text>
            </g>

            <g data-marker style={{ opacity: 0 }}>
              <circle r="13" fill="var(--color-ink)" fillOpacity="0.12" />
              <circle r="6.5" fill="var(--color-ink)" />
            </g>
          </svg>
          <div className="flex flex-col items-center gap-2 px-3 pb-5 pt-2 sm:flex-row sm:justify-between">
            <p className="text-[14px] text-muted">Milestones light up as your equity crosses them.</p>
            <Link href="/login?mode=signup" className="group inline-flex items-center gap-1 text-[15px] text-gold transition-colors hover:text-ink">
              Start your road
              <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

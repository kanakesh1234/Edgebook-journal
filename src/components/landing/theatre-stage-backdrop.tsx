"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";
import { prefersReducedMotion, subscribeTheatreUi, theatreState, type TheatreActId } from "./motion-utils";

const LazyTheatreCanvas = dynamic(() => import("./theatre-canvas"), {
  ssr: false,
});

const ACT_LABELS: Record<TheatreActId, { num: string; title: string }> = {
  hero: { num: "01", title: "THE STUDY" },
  film: { num: "02", title: "THE INNER FILM" },
  ritual: { num: "03", title: "DAILY RITUAL" },
  gap: { num: "04", title: "THE GAP" },
  minato: { num: "05", title: "MINATO" },
  drive: { num: "06", title: "YOUR DRIVE" },
  toolkit: { num: "07", title: "THE TOOLKIT" },
  finale: { num: "08", title: "THE LEDGER" },
};

/**
 * Renders an instant CSS / gradient poster on first paint (0ms CLS, instant LCP),
 * then mounts the lazy-loaded 3D WebGL TheatreCanvas after first paint.
 * Fades out smoothly during calm cream sections (`#toolkit`, `#calm`).
 */
export function TheatreStageBackdrop() {
  const [mountWebGL, setMountWebGL] = useState(false);
  const [activeAct, setActiveAct] = useState<TheatreActId>("hero");
  const [creamFade, setCreamFade] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const unsub = subscribeTheatreUi((st) => {
      setActiveAct(st.activeAct);
      setCreamFade(st.activeAct === "toolkit");
    });

    if (prefersReducedMotion()) {
      return unsub;
    }

    // Load 3D WebGL chunk strictly after first paint so Hero text paints immediately
    let timerId = 0;
    const ric = (window as Window & { requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number })
      .requestIdleCallback;

    if (typeof ric === "function") {
      const idleId = ric(() => setMountWebGL(true), { timeout: 600 });
      return () => {
        unsub();
        const cic = (window as Window & { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        if (typeof cic === "function") cic(idleId);
      };
    }

    timerId = window.setTimeout(() => setMountWebGL(true), 120);
    return () => {
      unsub();
      window.clearTimeout(timerId);
    };
  }, []);

  const actMeta = ACT_LABELS[activeAct] ?? ACT_LABELS.hero;

  return (
    <>
      {/* Fixed 3D Stage Wrapper — fades out smoothly during calm cream sections */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed inset-0 z-0 overflow-hidden transition-opacity duration-700 ${
          creamFade ? "opacity-15 dark:opacity-45" : "opacity-100"
        }`}
      >
        {/* Instant CSS / Gradient Poster (Visible at 0ms before WebGL chunk loads, or on reduced-motion) */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(960px 540px at 50% 24%, rgba(203, 167, 107, 0.16), transparent 72%), radial-gradient(720px 460px at 78% 68%, rgba(116, 176, 140, 0.08), transparent 70%), linear-gradient(180deg, #120f0b 0%, #17130e 52%, #120f0b 100%)",
          }}
        />

        {/* Lazy-loaded 3D WebGL Theatre Canvas */}
        {mountWebGL && <LazyTheatreCanvas />}

        {/* Depth-of-field edge blur & vignette + subtle 35mm film grain */}
        <div className="lp-theatre-vignette absolute inset-0" />
        <div className="lp-film-grain absolute inset-0 opacity-20 mix-blend-overlay" />
      </div>

      {/* Subtle Fixed Camera Stop ("Act") Indicator Pill — Desktop Bottom-Left */}
      <div
        aria-hidden="true"
        className={`pointer-events-none fixed bottom-5 left-6 z-30 hidden items-center gap-2.5 rounded-full border border-line-strong/60 bg-surface/80 px-3.5 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.14em] text-muted shadow-[var(--shadow-rest)] backdrop-blur-xl transition-opacity duration-500 lg:inline-flex ${
          creamFade ? "opacity-60" : "opacity-95"
        }`}
      >
        <span className="h-1.5 w-1.5 rounded-full bg-gold" />
        <span className="text-gold">ACT {actMeta.num}</span>
        <span className="h-2.5 w-px bg-line-strong" />
        <span className="text-ink">{actMeta.title}</span>
      </div>
    </>
  );
}

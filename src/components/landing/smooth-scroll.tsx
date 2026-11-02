"use client";

import { useEffect, useState } from "react";
import { clamp, prefersReducedMotion } from "./motion-utils";

const CHAPTERS = [
  { id: "top", num: "01", label: "Identity" },
  { id: "film", num: "02", label: "The Film" },
  { id: "how", num: "03", label: "Ritual" },
  { id: "gap", num: "04", label: "The Gap" },
  { id: "minato", num: "05", label: "Minato" },
  { id: "drive", num: "06", label: "Drive" },
  { id: "toolkit", num: "07", label: "Toolkit" },
  { id: "road", num: "08", label: "Road" },
  { id: "calm", num: "09", label: "Calm" },
];

/**
 * Global 35mm Film-Reel Scroll Progress Rail along the right viewport edge.
 * Connects the entire landing page from Chapter 01 to Chapter 09 into one continuous
 * interactive storytelling reel while preserving 100% native browser scrolling.
 */
export function SmoothScroll() {
  const [pageProgress, setPageProgress] = useState(0);
  const [activeId, setActiveId] = useState("top");

  useEffect(() => {
    if (prefersReducedMotion()) return;
    let rafId = 0;

    const update = () => {
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const p = clamp(window.scrollY / maxScroll, 0, 1);
      setPageProgress(p);

      // Find which chapter is closest to top-third of viewport
      const anchorY = window.innerHeight * 0.36;
      let current = CHAPTERS[0]!.id;
      for (const ch of CHAPTERS) {
        const el = document.getElementById(ch.id);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.top <= anchorY) {
            current = ch.id;
          }
        }
      }
      setActiveId((prev) => (prev === current ? prev : current));
    };

    const onScroll = () => {
      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(update);
    };

    update();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      if (rafId) cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <aside
      aria-label="Story chapters"
      className="fixed right-3 top-1/2 z-40 hidden -translate-y-1/2 flex-col items-end gap-1.5 xl:flex"
    >
      <div className="flex flex-col items-end gap-1 rounded-2xl border border-line bg-surface/80 px-2.5 py-3 shadow-[var(--shadow-rest)] backdrop-blur-xl">
        <span className="mb-1 font-mono text-[9.5px] uppercase tracking-[0.14em] text-gold">
          REEL {Math.round(pageProgress * 100)}%
        </span>
        {CHAPTERS.map((ch) => {
          const isOn = ch.id === activeId;
          return (
            <a
              key={ch.id}
              href={`#${ch.id}`}
              className={`group flex items-center gap-2 rounded-full px-2 py-0.5 transition ${
                isOn ? "bg-gold/15 text-ink" : "text-faint hover:text-ink"
              }`}
            >
              <span className="font-mono text-[9.5px] tracking-[0.1em]">
                {ch.num}
              </span>
              <span
                className={`text-[10.5px] transition-all duration-200 ${
                  isOn ? "max-w-[68px] font-medium text-ink opacity-100" : "max-w-0 overflow-hidden opacity-0 group-hover:max-w-[68px] group-hover:opacity-100"
                }`}
              >
                {ch.label}
              </span>
              <span
                className={`h-1.5 rounded-full transition-all duration-200 ${
                  isOn ? "w-3.5 bg-gold-strong" : "w-1.5 bg-line-strong group-hover:bg-gold"
                }`}
              />
            </a>
          );
        })}
      </div>
    </aside>
  );
}

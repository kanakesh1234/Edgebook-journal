"use client";

import { useEffect, useState } from "react";
import {
  SCENE_META,
  landingScrollState,
  prefersReducedMotion,
  subscribeLandingScroll,
} from "./motion-utils";

/**
 * Diegetic Game-Style Director HUD Dock
 * - Displays active chapter (CH.01 – CH.06), live scroll depth %, and Composure Score.
 * - Lets the visitor jump directly to any scene or enter Theatre Mode (#film) in one click
 *   or via keyboard hotkeys [1]–[6].
 * - Built strictly with Edgebook's original tokens (lp-glass, border-line-strong, text-ink, text-gold, text-profit).
 */
export function DirectorHud() {
  const [scene, setScene] = useState(1);
  const [depthPct, setDepthPct] = useState(0);
  const [theatre, setTheatre] = useState(false);
  const [composure, setComposure] = useState(88);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const unsub = subscribeLandingScroll((st) => {
      setScene(st.activeScene);
      setDepthPct(Math.round(st.pageProgress * 100));
      setTheatre(st.theatreMode);
      setComposure(st.composureScore);
    });

    // Keyboard chapter hotkeys [1]–[6] when not typing in an input
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const num = Number(e.key);
      if (num >= 1 && num <= 6) {
        const targetMeta = SCENE_META[num - 1];
        if (!targetMeta) return;
        const el = document.querySelector<HTMLElement>(targetMeta.anchor);
        if (el) {
          e.preventDefault();
          el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      unsub();
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const currentMeta = SCENE_META[scene - 1] ?? SCENE_META[0]!;

  const jumpTo = (anchor: string) => {
    setExpanded(false);
    const el = document.querySelector<HTMLElement>(anchor);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  return (
    <aside
      aria-label="Interactive chapter director HUD"
      className={`fixed bottom-4 left-1/2 z-40 -translate-x-1/2 transition-all duration-300 ${
        theatre ? "opacity-90 hover:opacity-100" : "opacity-100"
      }`}
    >
      {/* Expanded Chapter Select Matrix (Game Menu Style) */}
      {expanded && (
        <div className="lp-glass lp-sq mb-2.5 w-[min(92vw,560px)] rounded-[24px] border border-line-strong p-3 shadow-[var(--shadow-overlay)]">
          <div className="mb-2 flex items-center justify-between px-2 font-mono text-[10.5px] uppercase tracking-[0.14em] text-faint">
            <span>Select Scene · Keys [1–6]</span>
            <span className="text-profit">Composure {composure}%</span>
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
            {SCENE_META.map((m) => {
              const active = m.id === scene;
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => jumpTo(m.anchor)}
                  className={`flex flex-col items-start rounded-2xl border px-3 py-2 text-left transition ${
                    active
                      ? "border-gold/60 bg-gold/12 text-ink shadow-[var(--shadow-rest)]"
                      : "border-line bg-raised/75 text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                    [{m.id}] {m.code}
                  </span>
                  <span className="mt-0.5 truncate text-[12px] font-semibold tracking-[-0.01em] text-ink">
                    {m.title}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Compact Diegetic HUD Pill */}
      <div className="lp-glass flex items-center gap-2 rounded-full border border-line-strong/90 px-2.5 py-1.5 shadow-[var(--shadow-lift)] sm:gap-3 sm:px-3.5">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-2 rounded-full bg-raised px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink transition hover:border-gold/50 active:scale-[0.98]"
        >
          <span
            className={`h-2 w-2 rounded-full ${
              theatre ? "bg-gold animate-pulse" : "bg-profit"
            }`}
            aria-hidden="true"
          />
          <span className="text-gold">{currentMeta.code}</span>
          <span className="hidden sm:inline">{currentMeta.title}</span>
          <span className="text-[9px] text-faint">{expanded ? "▼" : "▲"}</span>
        </button>

        {/* Mini 6-dot scene progress bar */}
        <div className="hidden items-center gap-1 md:flex" role="group" aria-label="Scene jump dots">
          {SCENE_META.map((m) => {
            const active = m.id === scene;
            const passed = m.id < scene;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => jumpTo(m.anchor)}
                title={`${m.code}: ${m.title}`}
                aria-label={`Jump to ${m.title}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  active
                    ? "w-6 bg-gold-strong"
                    : passed
                      ? "w-2.5 bg-profit/70 hover:bg-gold"
                      : "w-2 bg-line-strong hover:bg-muted"
                }`}
              />
            );
          })}
        </div>

        <div className="h-3.5 w-px bg-line-strong" aria-hidden="true" />

        {/* Live Composure & Scroll Depth Telemetry */}
        <div className="flex items-center gap-2.5 font-mono text-[10.5px] tabular-nums tracking-[0.08em] text-muted">
          <span className="hidden sm:inline">
            EDGE <strong className="font-semibold text-profit">{composure}%</strong>
          </span>
          <span>{String(depthPct).padStart(3, "0")}%</span>
        </div>

        {/* Quick Theatre Mode Jump if not currently in Scene 02 */}
        {scene !== 2 && (
          <button
            type="button"
            onClick={() => jumpTo("#film")}
            className="hidden rounded-full bg-gold-strong px-2.5 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-on-gold transition hover:bg-gold-strong-hover sm:inline-block"
          >
            Theatre
          </button>
        )}
      </div>
    </aside>
  );
}

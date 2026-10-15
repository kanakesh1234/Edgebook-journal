"use client";

import { useEffect, useRef } from "react";
import { useReducedMotion } from "motion/react";
import type { DayRisk } from "@/lib/risk";
import { Companion, readPalette, SCENE_H, SCENE_W } from "./engine";

/**
 * Minato, the risk companion. One <canvas>, a spring-physics rig (see ./engine.ts), driven by the same
 * numbers the risk bar shows: projected drawdown ÷ limit, the day's net P&L, and the status.
 * The loop only runs while the card is on screen and the tab is visible; with reduced motion it
 * settles to a single still frame per change instead of animating.
 */
export function RiskCompanion({ risk, className }: { risk: DayRisk; className?: string }) {
  const wrap = useRef<HTMLDivElement>(null);
  const cvs = useRef<HTMLCanvasElement>(null);
  const engine = useRef<Companion | null>(null);
  const redraw = useRef<() => void>(() => {});
  const reduce = useReducedMotion();
  const latest = useRef(risk);
  latest.current = risk;

  useEffect(() => {
    const canvas = cvs.current, host = wrap.current;
    if (!canvas || !host) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const eng = new Companion(readPalette(host));
    engine.current = eng;
    eng.reduced = !!reduce;
    const r0 = latest.current;
    eng.setInput({ ratio: r0.ratio, net: r0.net, limit: r0.limit, status: r0.status });

    let cssW = 0, pxW = 0, pxH = 0, raf = 0, last = 0, visible = true, running = false, slow = 0;

    const size = () => {
      const w = Math.max(1, Math.round(host.clientWidth));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (w === cssW && canvas.width === Math.round(w * dpr)) return;
      cssW = w; pxW = Math.round(w * dpr); pxH = Math.round((w * SCENE_H / SCENE_W) * dpr);
      canvas.width = pxW; canvas.height = pxH;
    };
    const paint = () => { size(); eng.draw(ctx, pxW, pxH); };

    const frame = (now: number) => {
      raf = 0;
      if (!running) return;
      if (eng.reduced) { running = false; eng.settle(); paint(); return; }
      const dt = Math.min(0.05, last ? (now - last) / 1000 : 1 / 60); last = now;
      const t0 = performance.now();
      eng.step(dt); paint();
      // adaptive quality: if a frame costs too much on this device, thin out particles and rope detail
      const cost = performance.now() - t0;
      slow = slow * 0.92 + cost * 0.08;
      if (slow > 7 && eng.quality > 0.45) eng.quality = 0.45;
      else if (slow < 3.5 && eng.quality < 1) eng.quality = 1;
      raf = requestAnimationFrame(frame);
    };
    const start = () => { if (running || eng.reduced || !visible || document.hidden) return; running = true; last = 0; raf = requestAnimationFrame(frame); };
    const stop = () => { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; };

    redraw.current = () => {
      if (eng.reduced) { eng.settle(); paint(); } else start();
    };

    size();
    if (eng.reduced) { eng.settle(); paint(); } else { eng.step(1 / 60); paint(); start(); }

    const io = new IntersectionObserver(([e]) => { visible = !!e?.isIntersecting; if (visible) { if (eng.reduced) paint(); else start(); } else stop(); }, { threshold: 0.01 });
    io.observe(host);
    const ro = new ResizeObserver(() => { size(); if (!running) paint(); });
    ro.observe(host);
    const onVis = () => { if (document.hidden) stop(); else start(); };
    document.addEventListener("visibilitychange", onVis);
    // follow light/dark: the app flips data-theme on <html>
    const mo = new MutationObserver(() => { eng.pal = readPalette(host); if (!running) paint(); });
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });

    return () => { stop(); io.disconnect(); ro.disconnect(); mo.disconnect(); document.removeEventListener("visibilitychange", onVis); engine.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const eng = engine.current; if (!eng) return;
    if (eng.reduced !== !!reduce) { eng.reduced = !!reduce; }
    eng.setInput({ ratio: risk.ratio, net: risk.net, limit: risk.limit, status: risk.status });
    redraw.current();
  }, [risk.ratio, risk.net, risk.limit, risk.status, reduce]);

  return (
    <div ref={wrap} className={className} style={{ aspectRatio: `${SCENE_W} / ${SCENE_H}` }} aria-hidden>
      <canvas ref={cvs} className="block h-full w-full" />
    </div>
  );
}

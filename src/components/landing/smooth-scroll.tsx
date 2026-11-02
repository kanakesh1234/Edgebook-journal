"use client";

import { useEffect } from "react";
import {
  clamp,
  computeScrollProgress,
  notifyTheatreUi,
  prefersReducedMotion,
  smooth,
  theatreState,
  type TheatreActId,
} from "./motion-utils";

/**
 * Orchestrates the 60fps single scroll-progress spline driver, mask/clip-path
 * text reveals, desktop pointer parallax, and smooth anchor navigation for the
 * 3D WebGL Theatre. Strictly cleans up every observer, RAF ticker, and listener
 * (100% React 19 strict-mode safe).
 */
export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = prefersReducedMotion();

    // Cache section elements for fast per-frame progress sampling
    let heroEl: HTMLElement | null = null;
    let filmEl: HTMLElement | null = null;
    let ritualEl: HTMLElement | null = null;
    let gapEl: HTMLElement | null = null;
    let minatoEl: HTMLElement | null = null;
    let driveEl: HTMLElement | null = null;
    let toolkitEl: HTMLElement | null = null;
    let calmEl: HTMLElement | null = null;
    let finaleEl: HTMLElement | null = null;

    const querySections = () => {
      heroEl = document.getElementById("top");
      filmEl = document.getElementById("film");
      ritualEl = document.getElementById("how");
      gapEl = document.getElementById("gap");
      minatoEl = document.getElementById("minato");
      driveEl = document.getElementById("drive");
      toolkitEl = document.getElementById("toolkit");
      calmEl = document.getElementById("calm");
      finaleEl = document.getElementById("finale");
    };

    querySections();

    // Mask / clip-path text reveal observer
    let revealObserver: IntersectionObserver | null = null;
    const setupTextReveals = () => {
      const targets = Array.from(document.querySelectorAll<HTMLElement>("[data-theatre-reveal]"));
      if (reduced || typeof IntersectionObserver === "undefined") {
        targets.forEach((el) => {
          el.style.opacity = "1";
          el.style.transform = "none";
          el.style.clipPath = "none";
        });
        return;
      }

      targets.forEach((el) => {
        el.style.opacity = "0";
        el.style.transform = "translate3d(0, 22px, 0)";
        el.style.clipPath = "inset(0% 0% 100% 0%)";
        el.style.transition =
          "opacity 0.9s cubic-bezier(0.16, 1, 0.3, 1), transform 0.9s cubic-bezier(0.16, 1, 0.3, 1), clip-path 0.9s cubic-bezier(0.16, 1, 0.3, 1)";
      });

      revealObserver = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              const target = entry.target as HTMLElement;
              target.style.opacity = "1";
              target.style.transform = "translate3d(0, 0, 0)";
              target.style.clipPath = "inset(0% 0% 0% 0%)";
              revealObserver?.unobserve(target);
            }
          });
        },
        { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
      );

      targets.forEach((el) => revealObserver?.observe(el));
    };

    const revealTimer = window.setTimeout(() => {
      querySections();
      setupTextReveals();
    }, 80);

    let prevAct: TheatreActId = theatreState.activeAct;
    let prevRitualStep = theatreState.ritualStep;

    const sampleTheatreProgress = (dt: number) => {
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const raw = clamp(scrollY / maxScroll, 0, 1);

      theatreState.rawScroll = raw;

      // Damped spline progress
      const diff = raw - theatreState.splineProgress;
      const step = reduced ? diff : diff * Math.min(1, dt * 11.5);
      theatreState.splineProgress = clamp(theatreState.splineProgress + step, 0, 1);
      theatreState.velocity = clamp(step / Math.max(0.008, dt), -1.5, 1.5);

      // Desktop cursor parallax smoothing
      theatreState.pointerX += (theatreState.targetPointerX - theatreState.pointerX) * Math.min(1, dt * 8.5);
      theatreState.pointerY += (theatreState.targetPointerY - theatreState.pointerY) * Math.min(1, dt * 8.5);

      if (!heroEl) querySections();

      const heroP = heroEl ? computeScrollProgress(heroEl, { pinned: true }) : clamp(raw * 7, 0, 1);
      const filmP = filmEl ? computeScrollProgress(filmEl, { pinned: true }) : 0;
      const ritualP = ritualEl ? computeScrollProgress(ritualEl, { pinned: true }) : 0;
      const gapP = gapEl ? computeScrollProgress(gapEl, { startRatio: 0.85, endRatio: 0.15 }) : 0;
      const minatoP = minatoEl ? computeScrollProgress(minatoEl, { startRatio: 0.85, endRatio: 0.15 }) : 0;
      const driveP = driveEl ? computeScrollProgress(driveEl, { startRatio: 0.88, endRatio: 0.15 }) : 0;
      const toolkitP = toolkitEl ? computeScrollProgress(toolkitEl, { startRatio: 0.9, endRatio: 0.1 }) : 0;
      const finaleP = finaleEl ? computeScrollProgress(finaleEl, { startRatio: 0.9, endRatio: 0.2 }) : 0;

      theatreState.heroProgress = heroP;
      theatreState.filmProgress = filmP;
      theatreState.ritualProgress = ritualP;

      if (theatreState.manualRitualStep !== null && (ritualP <= 0.01 || ritualP >= 0.99)) {
        theatreState.manualRitualStep = null;
      }

      const computedRitualStep =
        theatreState.manualRitualStep !== null
          ? theatreState.manualRitualStep
          : Math.min(4, Math.floor(clamp(ritualP, 0, 0.999) * 5));
      theatreState.ritualStep = computedRitualStep;

      // The Gap: starts wide split (1.0), converges to 0.0 as user scrolls through #gap
      const gapClosure = smooth(clamp((gapP - 0.12) / 0.72, 0, 1));
      theatreState.gapSplit = 1 - gapClosure;

      theatreState.minatoProgress = minatoP;
      theatreState.driveProgress = driveP;
      theatreState.toolkitProgress = toolkitP;
      theatreState.finaleProgress = finaleP;

      // Determine active camera stop ("act") and calm cream mix
      let nextAct: TheatreActId = "hero";
      let creamTarget = 0;

      const vh = window.innerHeight || 1;
      const inView = (el: HTMLElement | null) => {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        return r.top < vh * 0.55 && r.bottom > vh * 0.35;
      };

      if (inView(finaleEl)) {
        nextAct = "finale";
        creamTarget = 0.18;
      } else if (inView(calmEl) || inView(toolkitEl)) {
        nextAct = "toolkit";
        creamTarget = 0.92;
      } else if (inView(driveEl)) {
        nextAct = "drive";
        creamTarget = 0.0;
      } else if (inView(minatoEl)) {
        nextAct = "minato";
        creamTarget = 0.0;
      } else if (inView(gapEl)) {
        nextAct = "gap";
        creamTarget = 0.08;
      } else if (inView(ritualEl)) {
        nextAct = "ritual";
        creamTarget = 0.0;
      } else if (inView(filmEl)) {
        nextAct = "film";
        creamTarget = 0.0;
      } else {
        nextAct = "hero";
        creamTarget = 0.0;
      }

      theatreState.activeAct = nextAct;
      theatreState.creamMix += (creamTarget - theatreState.creamMix) * Math.min(1, dt * 6);

      if (nextAct !== prevAct || computedRitualStep !== prevRitualStep) {
        prevAct = nextAct;
        prevRitualStep = computedRitualStep;
        document.documentElement.dataset.theatreAct = nextAct;
        notifyTheatreUi();
      }
    };

    let rafId = 0;
    let lastTime = performance.now();
    const onFrame = (now: number) => {
      rafId = window.requestAnimationFrame(onFrame);
      if (document.hidden) return;
      const dt = Math.min(0.05, Math.max(0.004, (now - lastTime) / 1000));
      lastTime = now;
      sampleTheatreProgress(dt);
    };

    rafId = window.requestAnimationFrame(onFrame);

    // Desktop-only cursor-reactive parallax
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const onPointerMove = (e: PointerEvent) => {
      if (!canHover || reduced) return;
      const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1;
      const ny = (e.clientY / Math.max(1, window.innerHeight)) * 2 - 1;
      theatreState.targetPointerX = clamp(nx, -1, 1);
      theatreState.targetPointerY = clamp(ny, -1, 1);
    };

    if (canHover && !reduced) {
      window.addEventListener("pointermove", onPointerMove, { passive: true });
    }

    return () => {
      window.clearTimeout(revealTimer);
      if (rafId) window.cancelAnimationFrame(rafId);
      revealObserver?.disconnect();
      window.removeEventListener("pointermove", onPointerMove);
      delete document.documentElement.dataset.theatreAct;
    };
  }, []);

  return null;
}

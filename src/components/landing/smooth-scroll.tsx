"use client";

import { useEffect } from "react";
import {
  clamp,
  computeScrollProgress,
  landingScrollState,
  notifyLandingScroll,
  prefersReducedMotion,
  smooth,
} from "./motion-utils";

/**
 * Coordinates bidirectional scroll-scrubbed typography/scene transitions,
 * Theatre Mode immersion detection for #film, and global scroll progress
 * while preserving 100% native browser scrolling (no scroll-jacking).
 */
export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    const reduced = prefersReducedMotion();
    let rafId = 0;
    let ticking = false;

    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const pageProg = clamp(scrollY / maxScroll, 0, 1);

      // Detect whether visitor is immersed inside the full-screen Theatre sequence (#film)
      const filmEl = document.getElementById("film");
      let inTheatre = false;
      if (filmEl && !reduced) {
        const rect = filmEl.getBoundingClientRect();
        const vh = window.innerHeight || 1;
        // Active while #film is pinned in the viewport
        inTheatre = rect.top <= 24 && rect.bottom >= vh - 24;
      }

      if (
        Math.abs(landingScrollState.pageProgress - pageProg) > 0.001 ||
        landingScrollState.theatreMode !== inTheatre
      ) {
        landingScrollState.pageProgress = pageProg;
        landingScrollState.theatreMode = inTheatre;
        if (inTheatre) {
          doc.dataset.theatreMode = "true";
        } else {
          delete doc.dataset.theatreMode;
        }
        notifyLandingScroll();
      }

      // Bidirectional scroll-scrubbed reveal elements ([data-scrub-reveal])
      if (!reduced) {
        const scrubEls = document.querySelectorAll<HTMLElement>("[data-scrub-reveal]");
        scrubEls.forEach((el) => {
          const p = smooth(computeScrollProgress(el, { startRatio: 0.92, endRatio: 0.52 }));
          const y = (1 - p) * 28;
          const scale = 0.975 + p * 0.025;
          el.style.opacity = String(0.15 + p * 0.85);
          el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0) scale(${scale.toFixed(4)})`;
        });
      }
    };

    const requestUpdate = () => {
      if (!ticking) {
        ticking = true;
        rafId = window.requestAnimationFrame(update);
      }
    };

    update();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate, { passive: true });

    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
      delete document.documentElement.dataset.theatreMode;
    };
  }, []);

  return null;
}

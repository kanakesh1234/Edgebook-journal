"use client";

import { useEffect } from "react";
import {
  SCENE_META,
  clamp,
  landingScrollState,
  notifyLandingScroll,
  syncQuestFromScene,
} from "./motion-utils";

/**
 * Tracks active quest section (QUEST 01 – QUEST 06) and overall progress
 * as the player navigates through The Operator's Trial.
 */
export function SmoothScroll() {
  useEffect(() => {
    if (typeof window === "undefined") return;

    let rafId = 0;
    let ticking = false;

    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const maxScroll = Math.max(1, doc.scrollHeight - window.innerHeight);
      const scrollY = window.scrollY || window.pageYOffset || 0;
      const pageProg = clamp(scrollY / maxScroll, 0, 1);
      const vh = window.innerHeight || 1;

      let detectedScene = 1;
      for (let i = SCENE_META.length - 1; i >= 0; i--) {
        const meta = SCENE_META[i]!;
        const el = document.querySelector<HTMLElement>(meta.anchor);
        if (el) {
          const r = el.getBoundingClientRect();
          if (r.top <= vh * 0.45) {
            detectedScene = meta.id;
            break;
          }
        }
      }

      const sceneMeta = SCENE_META[detectedScene - 1] ?? SCENE_META[0]!;

      if (
        Math.abs(landingScrollState.pageProgress - pageProg) > 0.002 ||
        landingScrollState.activeScene !== detectedScene
      ) {
        landingScrollState.pageProgress = pageProg;
        landingScrollState.activeScene = detectedScene;
        landingScrollState.sceneTitle = sceneMeta.title;
        syncQuestFromScene(detectedScene);
        notifyLandingScroll();
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
    };
  }, []);

  return null;
}

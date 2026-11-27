"use client";

import { useEffect } from "react";
import { beatAt, computeScene } from "./cinema-scene";
import { clamp, easeOutBack, rangeProgress, segmentInOut } from "./timeline";
import { QUOTES } from "./scene-config";

/**
 * Behaviour only. All markup is server-rendered; this component renders nothing and
 * attaches to elements by data attribute:
 *   [data-cinema]  the tall film section  (contains [data-cinema-stage])
 *   [data-scrub]   pinned sections whose progress drives CSS (statement words, quotes)
 *
 * One rAF loop serves everything. Scroll / resize / pointer handlers only request a frame.
 * The loop stops by itself once every value has converged, so nothing animates off-screen.
 */

type Updater = (dt: number) => boolean; // returns true while it still needs frames

const setVar = (el: HTMLElement, cache: Map<string, number>, key: string, v: number) => {
  const prev = cache.get(key);
  if (prev !== undefined && Math.abs(prev - v) < 1e-4) return;
  cache.set(key, v);
  el.style.setProperty(`--${key}`, v.toFixed(4));
};

function setup(): () => void {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const nav = navigator as Navigator & { deviceMemory?: number };
  const lite =
    (nav.hardwareConcurrency ?? 8) <= 4 || (nav.deviceMemory ?? 8) <= 4 || !finePointer;

  const root = document.querySelector<HTMLElement>("[data-lp-root]");
  if (root) root.dataset.fx = lite ? "lite" : "full";

  // Reduced motion: CSS presents a static, normal-flow page. No engine at all.
  if (reduced) return () => undefined;

  const updaters: Updater[] = [];
  const disposers: Array<() => void> = [];
  let raf = 0;
  let lastT = 0;

  const request = () => {
    if (!raf) raf = requestAnimationFrame(frame);
  };
  const frame = (t: number) => {
    raf = 0;
    const dt = Math.min(0.05, lastT ? (t - lastT) / 1000 : 0.016);
    lastT = t;
    let more = false;
    for (const u of updaters) more = u(dt) || more;
    if (more) request();
    else lastT = 0;
  };

  const on = <K extends keyof WindowEventMap>(type: K, fn: (e: WindowEventMap[K]) => void) => {
    window.addEventListener(type, fn, { passive: true });
    disposers.push(() => window.removeEventListener(type, fn));
  };

  /* ---------------- The film ---------------- */
  const section = document.querySelector<HTMLElement>("[data-cinema]");
  const stage = section?.querySelector<HTMLElement>("[data-cinema-stage]") ?? null;

  const measures: Array<() => void> = [];

  if (section && stage) {
    const cache = new Map<string, number>();
    let top = 0;
    let travel = 1;
    let target = 0;
    let head = -1; // playhead (smoothed)
    let beat = "";
    let mx = 0;
    let my = 0;
    let tmx = 0;
    let tmy = 0;

    // The rail is scroll-linked during the final phase. Max travel is cached on resize so the
    // frame loop never reads layout.
    const track = stage.querySelector<HTMLElement>(".cx-track");
    let railMax = 0;
    let lastRail = -1;

    const measure = () => {
      top = section.getBoundingClientRect().top + window.scrollY;
      travel = Math.max(1, section.offsetHeight - stage.offsetHeight);
      if (track) railMax = Math.max(0, track.scrollWidth - track.clientWidth);
    };
    measures.push(measure);

    const scrollToP = (p: number) => window.scrollTo({ top: top + p * travel, behavior: "auto" });

    updaters.push((dt) => {
      target = clamp((window.scrollY - top) / travel);
      if (head < 0) head = target; // first frame: no ease-in from zero on refresh mid-page

      // Inertial playhead; snaps once converged so the loop can sleep.
      head += (target - head) * (1 - Math.exp(-dt * 9));
      if (Math.abs(target - head) < 2e-4) head = target;

      // Pointer smoothed separately and only on fine pointers.
      if (finePointer) {
        const k = 1 - Math.exp(-dt * 6);
        mx += (tmx - mx) * k;
        my += (tmy - my) * k;
        if (Math.abs(tmx - mx) < 1e-3 && Math.abs(tmy - my) < 1e-3) {
          mx = tmx;
          my = tmy;
        }
      }

      const vars = computeScene(head);
      for (const key in vars) setVar(stage, cache, key, vars[key]!);
      setVar(stage, cache, "mx", mx);
      setVar(stage, cache, "my", my);

      // Scroll carries the rail. Only write when the value changes, so a person who then uses
      // the buttons / drag / keys is never fought by the engine while the page is idle.
      if (track && Math.abs(vars.rail! - lastRail) > 1e-4) {
        lastRail = vars.rail!;
        const driven = lastRail > 0 && lastRail < 1;
        if (driven) track.dataset.driven = "1"; // scroll-snap off while scroll-linked
        else delete track.dataset.driven;
        track.scrollLeft = lastRail * railMax;
      }

      const b = beatAt(head);
      if (b !== beat) {
        beat = b;
        stage.dataset.beat = b;
      }
      return head !== target || mx !== tmx || my !== tmy;
    });

    if (finePointer) {
      on("pointermove", (e) => {
        tmx = (e.clientX / window.innerWidth - 0.5) * 2;
        tmy = (e.clientY / window.innerHeight - 0.5) * 2;
        request();
      });
      document.addEventListener("pointerleave", () => {
        tmx = 0;
        tmy = 0;
        request();
      });
    }

    // Keyboard users tabbing into a control that is not on screen yet: jump the film to
    // the beat where it lives instead of focusing something invisible.
    const onFocusIn = (e: FocusEvent) => {
      const host = (e.target as HTMLElement | null)?.closest<HTMLElement>("[data-cx-show]");
      if (!host) return;
      const [lo, hi] = host.dataset.cxShow!.split("-").map(Number) as [number, number];
      if (target < lo || target > hi) scrollToP((lo + hi) / 2);
    };
    section.addEventListener("focusin", onFocusIn);
    disposers.push(() => section.removeEventListener("focusin", onFocusIn));
  }

  /* ---------------- Pinned scrub sections ---------------- */
  document.querySelectorAll<HTMLElement>("[data-scrub]").forEach((el) => {
    const kind = el.dataset.scrub;
    const cache = new Map<string, number>();
    let top = 0;
    let travel = 1;
    const measure = () => {
      top = el.getBoundingClientRect().top + window.scrollY;
      travel = Math.max(1, el.offsetHeight - window.innerHeight);
    };
    measures.push(measure);

    updaters.push(() => {
      const p = clamp((window.scrollY - top) / travel);
      setVar(el, cache, "p", p);
      if (kind === "statement") {
        setVar(el, cache, "card", easeOutBack(rangeProgress(p, 0.3, 0.5)));
        setVar(el, cache, "note", easeOutBack(rangeProgress(p, 0.56, 0.74)));
      } else if (kind === "quotes") {
        const n = QUOTES.length;
        for (let i = 0; i < n; i++) {
          const c = (i + 0.5) / n;
          const inA = i === 0 ? 0 : c - 0.5 / n + 0.02;
          const inB = i === 0 ? 0.05 : c - 0.5 / n + 0.09;
          const outA = i === n - 1 ? 2 : c + 0.5 / n - 0.09;
          const outB = i === n - 1 ? 3 : c + 0.5 / n - 0.02;
          setVar(el, cache, `q${i}`, segmentInOut(p, inA, inB, outA, outB));
          // signed offset: below before it enters, above after it leaves
          setVar(el, cache, `qy${i}`, clamp((c - p) * n * 2, -1, 1));
        }
      }
      return false;
    });
  });

  const measureAll = () => {
    measures.forEach((m) => m());
    request();
  };
  measureAll();
  on("scroll", request);
  on("resize", measureAll);
  on("load", measureAll);
  const ro = new ResizeObserver(measureAll);
  ro.observe(document.body);
  disposers.push(() => ro.disconnect());
  // Webfonts change text metrics → re-measure once they settle.
  void document.fonts?.ready.then(measureAll);
  request();

  return () => {
    if (raf) cancelAnimationFrame(raf);
    disposers.forEach((d) => d());
  };
}

export function ScrollController() {
  useEffect(() => {
    let dispose = setup();
    // If the person toggles reduced motion while the page is open, rebuild.
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      dispose();
      dispose = setup();
    };
    mq.addEventListener("change", onChange);
    return () => {
      mq.removeEventListener("change", onChange);
      dispose();
    };
  }, []);
  return null;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { CATALOG } from "./scene-config";
import { Glyph } from "./glyphs";

const N = CATALOG.length;
const pad = (n: number) => String(n).padStart(2, "0");
const prefersReduced = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Horizontal feature rail. Native scrolling + scroll-snap gives touch swipe, trackpad and
 * momentum for free; this adds prev/next buttons, arrow/Home/End keys and mouse drag.
 * Cards are informational (no action), so they are not links and have no hover affordance.
 * Not infinite on purpose: a finite rail has no clone seam to hide and no duplicate content
 * for assistive tech.
 */
export function CatalogRail() {
  const track = useRef<HTMLUListElement>(null);
  const drag = useRef<{ x: number; left: number; id: number } | null>(null);
  const [index, setIndex] = useState(0);
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);
  const [progress, setProgress] = useState(0);
  const [announce, setAnnounce] = useState("");

  const stepPx = () => {
    const kids = track.current?.children;
    if (!kids || kids.length < 2) return 320;
    return (kids[1] as HTMLElement).offsetLeft - (kids[0] as HTMLElement).offsetLeft;
  };

  const sync = useCallback(() => {
    const t = track.current;
    if (!t) return;
    const max = Math.max(0, t.scrollWidth - t.clientWidth);
    const start = t.scrollLeft <= 2;
    const end = t.scrollLeft >= max - 2;
    setAtStart(start);
    setAtEnd(end);
    setProgress(max > 0 ? t.scrollLeft / max : 0);
    setIndex(end ? N - 1 : Math.min(N - 1, Math.round(t.scrollLeft / stepPx())));
  }, []);

  useEffect(() => {
    const t = track.current;
    if (!t) return;
    let raf = 0;
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(() => ((raf = 0), sync()));
    };
    t.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    sync();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      t.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [sync]);

  const goTo = (i: number, say = true) => {
    const t = track.current;
    if (!t) return;
    const next = Math.min(N - 1, Math.max(0, i));
    t.scrollTo({ left: next * stepPx(), behavior: prefersReduced() ? "auto" : "smooth" });
    // Announce only on deliberate navigation, not on every scroll tick.
    if (say) setAnnounce(`${CATALOG[next]!.title}, ${next + 1} of ${N}`);
  };
  const go = (dir: -1 | 1) => {
    const t = track.current;
    if (!t) return;
    goTo(Math.round(t.scrollLeft / stepPx()) + dir);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const t = track.current;
    if (!t) return;
    const cur = Math.round(t.scrollLeft / stepPx());
    if (e.key === "ArrowRight") goTo(cur + 1);
    else if (e.key === "ArrowLeft") goTo(cur - 1);
    else if (e.key === "Home") goTo(0);
    else if (e.key === "End") goTo(N - 1);
    else return;
    e.preventDefault();
  };

  // Mouse drag. Touch and pen already scroll natively, so only handle mouse here.
  const onPointerDown = (e: React.PointerEvent<HTMLUListElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0) return;
    const t = track.current!;
    drag.current = { x: e.clientX, left: t.scrollLeft, id: e.pointerId };
    t.dataset.drag = "1"; // disables snap while dragging
    t.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    if (d) track.current!.scrollLeft = d.left - (e.clientX - d.x);
  };
  const endDrag = (e: React.PointerEvent<HTMLUListElement>) => {
    const d = drag.current;
    if (!d) return;
    const t = track.current!;
    drag.current = null;
    delete t.dataset.drag;
    if (t.hasPointerCapture(d.id)) t.releasePointerCapture(d.id);
    goTo(Math.round(t.scrollLeft / stepPx()), false); // settle onto the nearest card
    void e;
  };

  return (
    <div className="cx-rail" role="region" aria-roledescription="carousel" aria-label="Edgebook features">
      <ul
        ref={track}
        className="cx-track"
        tabIndex={0}
        aria-label="Feature cards. Use the arrow keys to move."
        onKeyDown={onKeyDown}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        {CATALOG.map((c, i) => (
          <li key={c.title} className="cx-card" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${N}`}>
            <div className="cx-card-art">
              <Glyph name={c.glyph} className="cx-card-glyph" />
            </div>
            <div className="cx-card-body">
              <span className="cx-card-n">{pad(i + 1)}</span>
              <h3 className="cx-card-title">{c.title}</h3>
              <p className="cx-card-line">{c.line}</p>
            </div>
          </li>
        ))}
      </ul>

      <div className="cx-rail-bar">
        <div className="cx-rail-meter" aria-hidden="true">
          <span style={{ transform: `scaleX(${(0.12 + 0.88 * progress).toFixed(3)})` }} />
        </div>
        <span className="cx-rail-count" aria-hidden="true">
          {pad(index + 1)} <i>/</i> {pad(N)}
        </span>
        <div className="cx-rail-btns">
          <button type="button" className="cx-round" onClick={() => go(-1)} disabled={atStart} aria-label="Previous feature">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M12.5 4.5 7 10l5.5 5.5" /></svg>
          </button>
          <button type="button" className="cx-round" onClick={() => go(1)} disabled={atEnd} aria-label="Next feature">
            <svg viewBox="0 0 20 20" aria-hidden="true"><path d="M7.5 4.5 13 10l-5.5 5.5" /></svg>
          </button>
        </div>
      </div>
      <p className="lp-sr" role="status" aria-live="polite">{announce}</p>
    </div>
  );
}

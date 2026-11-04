"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./logo";
import { NAV_LINKS } from "./scene-config";

/**
 * Apple-style global bar: translucent, quiet, and out of the way. It slides away while
 * you scroll down (the film gets the whole screen) and returns the moment you scroll up,
 * reach the top, or move focus into it.
 */
export function LandingHeader() {
  const [hidden, setHidden] = useState(false);
  const [solid, setSolid] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    let last = window.scrollY;
    let raf = 0;
    const update = () => {
      raf = 0;
      const y = window.scrollY;
      const dy = y - last;
      setSolid(y > 12);
      if (y < 96) setHidden(false);
      else if (dy > 6) setHidden(true);
      else if (dy < -6) setHidden(false);
      if (Math.abs(dy) > 6 || y < 96) last = y;
    };
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    update();
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  // In-page anchors resolve to real markers inside the film (see Cinema), so a plain hash
  // works without JS; with JS we scroll there with motion that respects the user's setting.
  const jump = (e: React.MouseEvent<HTMLAnchorElement>, href: string) => {
    const marker = document.getElementById(href.slice(1));
    if (!marker) return;
    e.preventDefault();
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    // Reduced motion: the film is a normal-flow page, so go to the real content block.
    const flow = marker.dataset.flow ? document.getElementById(marker.dataset.flow) : null;
    const el = reduce && flow ? flow : marker;
    const top = el.getBoundingClientRect().top + window.scrollY;
    window.scrollTo({ top, behavior: reduce ? "auto" : "smooth" });
    history.replaceState(null, "", href);
  };

  return (
    <header
      ref={ref}
      className="lp-header"
      data-hidden={hidden ? "true" : "false"}
      data-solid={solid ? "true" : "false"}
      onFocusCapture={() => setHidden(false)}
    >
      <nav className="lp-header-in" aria-label="Primary">
        <a href="#top" aria-label="Edgebook, back to top" className="lp-brand" onClick={(e) => jump(e, "#top")}>
          <Wordmark />
        </a>
        <ul className="lp-links">
          {NAV_LINKS.map((l) => (
            <li key={l.href}>
              <a href={l.href} onClick={(e) => jump(e, l.href)}>
                {l.label}
              </a>
            </li>
          ))}
        </ul>
        <div className="lp-actions">
          <Link href="/login" className="lp-text-link">
            Log in
          </Link>
          <Link href="/login?mode=signup" className="lp-pill lp-pill--sm">
            Get started
          </Link>
        </div>
      </nav>
    </header>
  );
}

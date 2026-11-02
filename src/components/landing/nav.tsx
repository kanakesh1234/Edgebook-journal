"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { cn } from "@/lib/utils";
import { SCENE_META, subscribeLandingScroll } from "./motion-utils";

const LINKS = [
  { href: "#film", label: "The Inner Film", cls: "" },
  { href: "#how", label: "Daily Ritual", cls: "" },
  { href: "#gap", label: "The Gap", cls: "hidden lg:inline" },
  { href: "#minato", label: "Minato", cls: "" },
  { href: "#drive", label: "Your Drive", cls: "" },
  { href: "#toolkit", label: "Toolkit", cls: "hidden xl:inline" },
];

/**
 * Full-width edge-to-edge frosted HUD bar in the Apple & narrative-game tradition:
 * spans the entire desktop width with zero wasted side margins.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [activeScene, setActiveScene] = useState(1);
  const [composure, setComposure] = useState(88);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const unsub = subscribeLandingScroll((st) => {
      setProgress(st.pageProgress);
      setActiveScene(st.activeScene);
      setComposure(st.composureScore);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      unsub();
    };
  }, []);

  const currentMeta = SCENE_META[activeScene - 1] ?? SCENE_META[0]!;

  return (
    <header
      className={cn(
        "lp-nav-header fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,opacity,transform] duration-500",
        "border-b",
        scrolled ? "lp-glass border-line" : "lp-glass border-line/50",
      )}
    >
      <nav
        aria-label="Primary"
        className="lp-wide flex h-14 items-center justify-between"
      >
        <div className="flex items-center gap-4">
          <Link href="/" aria-label="Edgebook home" className="rounded-lg">
            <Wordmark />
          </Link>

          {/* Diegetic Game Chapter Telemetry Badge */}
          <div className="hidden items-center gap-2 rounded-full border border-line bg-raised/80 px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.12em] text-muted xl:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-gold" aria-hidden="true" />
            <span className="font-semibold text-gold">{currentMeta.code}</span>
            <span>·</span>
            <span className="text-ink">{currentMeta.title}</span>
          </div>
        </div>

        <div className="hidden items-center gap-7 md:flex">
          {LINKS.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className={cn(
                "text-[13.5px] text-muted transition-colors duration-200 hover:text-ink",
                l.cls,
              )}
            >
              {l.label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <div
            className="hidden items-center gap-1.5 rounded-full border border-profit/30 bg-profit/10 px-3 py-1 font-mono text-[10.5px] font-medium text-profit lg:inline-flex"
            title="Live Composure Score"
          >
            <span>COMPOSURE</span>
            <strong>{composure}%</strong>
          </div>
          <ThemeToggle className="rounded-full" />
          <Link
            href="/login"
            className="hidden rounded-full px-3.5 py-2 text-[13.5px] text-muted transition-colors hover:text-ink sm:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/login?mode=signup"
            className="inline-flex h-9 items-center rounded-full bg-gold-strong px-4 text-[13.5px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.97]"
          >
            Get started
          </Link>
        </div>
      </nav>

      {/* Restrained scroll-progress hairline */}
      <div
        aria-hidden="true"
        className="pointer-events-none h-[1.5px] w-full overflow-hidden bg-transparent"
      >
        <div
          className="h-full origin-left bg-gold transition-transform duration-75 ease-out"
          style={{
            transform: `scaleX(${scrolled ? progress : 0})`,
          }}
        />
      </div>
    </header>
  );
}

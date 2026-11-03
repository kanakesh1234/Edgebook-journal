"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Wordmark } from "./logo";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import {
  CheckCircleIcon,
  FlameIcon,
  ShieldIcon,
  TrophyIcon,
  WalletIcon,
} from "@/components/ui/icons";
import { cn } from "@/lib/utils";
import {
  QUEST_SPECS,
  getRankForXp,
  resetLandingGame,
  useLandingGame,
} from "./game-state";
import { prefersReducedMotion, subscribeLandingScroll } from "./motion-utils";

/**
 * Top Game HUD Bar — Displays Player Rank, XP Bar, 6-Quest Switcher,
 * Live Composure %, Simulated Equity ($10k -> $20k), Streak, and Theme Toggle.
 * Built strictly with Edgebook's theme variables and font families.
 */
export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const game = useLandingGame();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    const unsub = subscribeLandingScroll((st) => {
      setProgress(st.pageProgress);
    });
    return () => {
      window.removeEventListener("scroll", onScroll);
      unsub();
    };
  }, []);

  const { rank, levelProgressPct } = getRankForXp(game.xp);
  const completedCount = Object.values(game.questsCompleted).filter(Boolean).length;

  const jumpToQuest = (anchor: string) => {
    const el = document.querySelector<HTMLElement>(anchor);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  return (
    <header
      className={cn(
        "lp-nav-header fixed inset-x-0 top-0 z-50 transition-[background-color,border-color] duration-300",
        "border-b",
        scrolled ? "lp-glass border-line-strong" : "lp-glass border-line",
      )}
    >
      <nav
        aria-label="Operator Game HUD and Primary Navigation"
        className="lp-wide flex h-15 items-center justify-between gap-3"
      >
        {/* Left: Wordmark + Live Rank & XP Meter */}
        <div className="flex items-center gap-3.5">
          <Link href="/" aria-label="Edgebook home" className="rounded-lg">
            <Wordmark />
          </Link>

          <div className="hidden items-center gap-2.5 rounded-full border border-line-strong bg-raised px-3 py-1 sm:inline-flex">
            <TrophyIcon className="h-3.5 w-3.5 text-gold" />
            <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gold">
              LVL {rank.level}
            </span>
            <span className="text-faint">·</span>
            <span className="text-[12px] font-semibold tracking-[-0.01em] text-ink">
              {rank.title}
            </span>
            <div
              className="hidden h-1.5 w-16 overflow-hidden rounded-full bg-ink/[0.08] xl:block"
              title={`${game.xp} XP (${levelProgressPct}% to next rank)`}
            >
              <div
                className="h-full rounded-full bg-gold-strong transition-[width] duration-500"
                style={{ width: `${levelProgressPct}%` }}
              />
            </div>
            <span className="num font-mono text-[11px] text-muted">
              {game.xp} XP
            </span>
          </div>
        </div>

        {/* Center: Interactive 6-Quest Progress Strip */}
        <div
          className="hidden items-center gap-1 rounded-full border border-line bg-surface/90 p-1 lg:flex"
          role="navigation"
          aria-label="Quest Stages"
        >
          {QUEST_SPECS.map((q, idx) => {
            const done = game.questsCompleted[q.id];
            const active = game.activeQuestIndex === idx;
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => jumpToQuest(q.anchor)}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-medium transition-all duration-150",
                  active
                    ? "border border-line-strong bg-raised text-ink shadow-[var(--shadow-rest)]"
                    : "text-muted hover:text-ink",
                )}
              >
                {done ? (
                  <CheckCircleIcon className="h-3.5 w-3.5 text-profit" />
                ) : (
                  <span className="font-mono text-[10px] text-gold">{q.num}</span>
                )}
                <span className="hidden xl:inline">{q.shortTitle}</span>
              </button>
            );
          })}
        </div>

        {/* Right: Live Composure, Simulated Equity, Streak, Theme & Auth */}
        <div className="flex items-center gap-2">
          {/* Simulated Account Equity Pill */}
          <div
            className="hidden items-center gap-1.5 rounded-full border border-line bg-raised px-2.5 py-1 font-mono text-[11px] md:inline-flex"
            title="Simulated Operator Ledger Equity (Target: $20,000)"
          >
            <WalletIcon className="h-3.5 w-3.5 text-gold" />
            <span className="num font-semibold text-ink">
              ${game.equity.toLocaleString()}
            </span>
          </div>

          {/* Composure Meter Pill */}
          <div
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] font-medium sm:inline-flex",
              game.composure >= 70
                ? "border-profit/35 bg-profit/10 text-profit"
                : game.composure >= 45
                  ? "border-gold/35 bg-gold/10 text-gold"
                  : "border-loss/35 bg-loss/10 text-loss",
            )}
            title="Live Operator Composure Score"
          >
            <ShieldIcon className="h-3.5 w-3.5" />
            <span className="hidden xl:inline">COMPOSURE</span>
            <strong className="num">{game.composure}%</strong>
          </div>

          {/* Discipline Streak Pill */}
          <div
            className="hidden items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2.5 py-1 font-mono text-[11px] font-semibold text-gold xl:inline-flex"
            title="Consecutive Disciplined Decisions"
          >
            <FlameIcon className="h-3.5 w-3.5" />
            <span className="num">{game.streak}</span>
          </div>

          {completedCount > 0 && (
            <button
              type="button"
              onClick={resetLandingGame}
              title="Reset game run"
              className="hidden rounded-full border border-line bg-raised px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] text-muted transition hover:border-line-strong hover:text-ink 2xl:inline-flex"
            >
              Reset
            </button>
          )}

          <ThemeToggle className="rounded-full" />

          <Link
            href="/login"
            className="hidden rounded-full px-3 py-1.5 text-[13px] font-medium text-muted transition-colors hover:text-ink md:inline-flex"
          >
            Log in
          </Link>
          <Link
            href="/login?mode=signup"
            className="inline-flex h-9 items-center rounded-full bg-gold-strong px-4 text-[13px] font-medium text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.97]"
          >
            Save &amp; Start
          </Link>
        </div>
      </nav>

      {/* Quest completion / scroll progress hairline */}
      <div
        aria-hidden="true"
        className="pointer-events-none h-[2px] w-full overflow-hidden bg-line/40"
      >
        <div
          className="h-full origin-left bg-gold-strong transition-transform duration-150 ease-out"
          style={{
            transform: `scaleX(${Math.max(scrolled ? progress : 0.04, completedCount / 6)})`,
          }}
        />
      </div>
    </header>
  );
}

"use client";

import Link from "next/link";
import {
  AwardIcon,
  ChevronRightIcon,
  TrophyIcon,
} from "@/components/ui/icons";
import { Wordmark } from "./logo";
import { Eyebrow } from "./ledger";
import {
  QUEST_SPECS,
  getRankForXp,
  resetLandingGame,
  useLandingGame,
} from "./game-state";

/**
 * FINAL OPERATOR SCORECARD & INVITATION (#finale)
 * Summarizes the player's live trial performance (Rank, XP, Composure, Equity, Badges)
 * and invites them to create their real Edgebook journal.
 */
export function FinalCta() {
  const game = useLandingGame();
  const { rank } = getRankForXp(game.xp);
  const completedCount = Object.values(game.questsCompleted).filter(Boolean).length;

  return (
    <section
      id="finale"
      className="lp-wide relative pb-24 pt-12 text-center sm:pb-32 sm:pt-16"
      aria-label="Operator Scorecard and Get Started"
    >
      <div className="lp-game-card relative w-full overflow-hidden px-6 py-16 sm:px-14 sm:py-22">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(840px 420px at 50% 0%, color-mix(in srgb, var(--gold) 14%, transparent), transparent 72%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl">
          <div className="mb-5 flex justify-center">
            <Eyebrow n="08">TRIAL COMPLETE · YOUR OPERATOR SCORECARD</Eyebrow>
          </div>

          <h2 className="font-display text-[clamp(2.35rem,6vw,4.8rem)] font-semibold leading-[1.02] tracking-[-0.045em] text-ink">
            Your edge deserves{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              a&nbsp;ledger.
            </span>
          </h2>

          <p className="mx-auto mt-4 max-w-xl text-[16px] leading-relaxed text-muted">
            Here is your live performance from <strong className="font-semibold text-ink">The Operator&apos;s Trial</strong>. Carry this exact process into your real trading sessions today.
          </p>

          {/* Live 4-Metric Game Scorecard */}
          <div className="mx-auto mt-8 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-2xl border border-line-strong bg-raised p-4 text-center shadow-[var(--shadow-rest)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                Earned Rank
              </p>
              <p className="mt-1.5 font-display text-[16px] font-semibold text-gold">
                Lvl {rank.level} · {rank.title}
              </p>
              <p className="num mt-0.5 font-mono text-[11px] text-muted">
                {game.xp} Total XP
              </p>
            </div>

            <div className="rounded-2xl border border-line-strong bg-raised p-4 text-center shadow-[var(--shadow-rest)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                Final Equity
              </p>
              <p className="kpi mt-1.5 text-[24px] text-profit">
                ${game.equity.toLocaleString()}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted">
                Started at $10,000
              </p>
            </div>

            <div className="rounded-2xl border border-line-strong bg-raised p-4 text-center shadow-[var(--shadow-rest)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                Composure Score
              </p>
              <p className="kpi mt-1.5 text-[24px] text-ink">
                {game.composure}%
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-profit">
                Streak: {game.streak} Clean
              </p>
            </div>

            <div className="rounded-2xl border border-line-strong bg-raised p-4 text-center shadow-[var(--shadow-rest)]">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                Quests Cleared
              </p>
              <p className="kpi mt-1.5 text-[24px] text-gold">
                {completedCount} / {QUEST_SPECS.length}
              </p>
              <p className="mt-0.5 font-mono text-[11px] text-muted">
                {game.badges.length} Badge(s)
              </p>
            </div>
          </div>

          {/* Unlocked Badges Row */}
          {game.badges.length > 0 && (
            <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
              {game.badges.map((b) => (
                <span
                  key={b}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gold/45 bg-gold/12 px-3 py-1 font-mono text-[11px] font-semibold text-gold"
                >
                  <AwardIcon className="h-3.5 w-3.5" />
                  {b}
                </span>
              ))}
            </div>
          )}

          <blockquote className="mx-auto mt-7 max-w-lg font-serif text-[19px] italic text-gold">
            &ldquo;Discipline is choosing between what you want right now and what you want most.&rdquo;
          </blockquote>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-3">
            <Link
              href="/login?mode=signup"
              className="inline-flex h-12 items-center gap-2 rounded-full bg-gold-strong px-8 text-[16px] font-semibold text-on-gold transition duration-200 hover:bg-gold-strong-hover active:scale-[0.98]"
            >
              <TrophyIcon className="h-4 w-4" />
              <span>Claim your journal &amp; start</span>
            </Link>
            <Link
              href="/login"
              className="group inline-flex items-center gap-1 text-[16px] font-medium text-gold transition-colors hover:text-ink"
            >
              Log in to existing ledger
              <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
            </Link>
            <button
              type="button"
              onClick={resetLandingGame}
              className="rounded-full border border-line bg-raised px-4 py-2 font-mono text-[11px] uppercase tracking-[0.08em] text-muted transition hover:border-line-strong hover:text-ink"
            >
              Replay Trial
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}

const CONTACT_EMAIL = "kanakesh939264@gmail.com";

export function SiteFooter() {
  return (
    <footer
      id="contact"
      className="lp-wide border-t border-line bg-canvas pb-28 pt-14 sm:pb-24 sm:pt-16"
    >
      <div className="grid w-full gap-12 md:grid-cols-[1.2fr_1fr] md:gap-16">
        <div>
          <h2 className="font-display text-[clamp(1.5rem,2.6vw,2rem)] font-semibold tracking-[-0.03em] text-ink">
            Contact us
          </h2>
          <p className="mt-2 max-w-sm text-[14.5px] leading-snug text-muted">
            Questions or feedback on Edgebook? We read every message.
          </p>
          <a
            href={`mailto:${CONTACT_EMAIL}?subject=Edgebook`}
            className="group mt-5 inline-flex h-11 items-center gap-2.5 rounded-full border border-line-strong bg-raised px-5 text-[14px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-[17px] w-[17px] text-gold transition-transform duration-300 group-hover:-rotate-6"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="5" width="18" height="14" rx="3" />
              <path d="m4 7.5 8 6 8-6" />
            </svg>
            {CONTACT_EMAIL}
          </a>
        </div>

        <div className="flex flex-col gap-6 md:items-end">
          <Wordmark />
          <nav
            aria-label="Footer"
            className="flex flex-wrap gap-x-6 gap-y-2.5 text-[13.5px] text-muted md:justify-end"
          >
            <a href="#top" className="transition-colors hover:text-ink">
              Quest 01 · Plan
            </a>
            <a href="#film" className="transition-colors hover:text-ink">
              Quest 02 · Live Tape
            </a>
            <a href="#gap" className="transition-colors hover:text-ink">
              Quest 03 · Autopsy
            </a>
            <a href="#toolkit" className="transition-colors hover:text-ink">
              Quest 04 · Arenas
            </a>
            <a href="#minato" className="transition-colors hover:text-ink">
              Quest 05 · Minato
            </a>
            <a href="#road" className="transition-colors hover:text-ink">
              Quest 06 · Road
            </a>
            <Link href="/privacy" className="transition-colors hover:text-ink">
              Privacy
            </Link>
            <Link href="/login" className="transition-colors hover:text-ink">
              Log in
            </Link>
          </nav>
        </div>
      </div>

      <div className="mt-10 w-full border-t border-line pt-6 text-[12.5px] leading-relaxed text-faint">
        <p>
          Edgebook is for educational and journaling purposes only. It is not financial advice, and trading involves risk.
        </p>
        <p className="mt-1">&copy; {new Date().getFullYear()} Edgebook</p>
      </div>
    </footer>
  );
}

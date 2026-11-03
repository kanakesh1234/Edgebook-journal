"use client";

import { useEffect, useState } from "react";
import {
  AwardIcon,
  CheckCircleIcon,
  SparklesIcon,
  TrophyIcon,
} from "@/components/ui/icons";
import {
  QUEST_SPECS,
  getRankForXp,
  resetLandingGame,
  useLandingGame,
} from "./game-state";
import { prefersReducedMotion } from "./motion-utils";

/**
 * Bottom Quest Log & Live Reward Toast Dock
 * - Pops up floating XP / Badge toasts when the player completes actions.
 * - Lets the player inspect all 6 Quests, unlocked Badges, and jump via hotkeys [1]–[6].
 * - Built strictly with Edgebook's theme tokens and fonts.
 */
export function DirectorHud() {
  const game = useLandingGame();
  const [expanded, setExpanded] = useState(false);
  const [visibleToastId, setVisibleToastId] = useState<number | null>(null);

  useEffect(() => {
    if (!game.lastToast) return;
    setVisibleToastId(game.lastToast.id);
    const timer = window.setTimeout(() => {
      setVisibleToastId((current) =>
        current === game.lastToast?.id ? null : current,
      );
    }, 3600);
    return () => window.clearTimeout(timer);
  }, [game.lastToast]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      const num = Number(e.key);
      if (num >= 1 && num <= QUEST_SPECS.length) {
        const targetQuest = QUEST_SPECS[num - 1];
        if (!targetQuest) return;
        const el = document.querySelector<HTMLElement>(targetQuest.anchor);
        if (el) {
          e.preventDefault();
          el.scrollIntoView({
            behavior: prefersReducedMotion() ? "auto" : "smooth",
          });
        }
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const jumpTo = (anchor: string) => {
    setExpanded(false);
    const el = document.querySelector<HTMLElement>(anchor);
    if (el) {
      el.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth" });
    }
  };

  const currentQuest =
    QUEST_SPECS[game.activeQuestIndex] ?? QUEST_SPECS[0]!;
  const completedCount = Object.values(game.questsCompleted).filter(Boolean).length;
  const { rank } = getRankForXp(game.xp);
  const showToast =
    game.lastToast && visibleToastId === game.lastToast.id ? game.lastToast : null;

  return (
    <aside
      aria-label="Operator Quest Log and Live Telemetry Dock"
      className="fixed bottom-4 left-1/2 z-40 flex -translate-x-1/2 flex-col items-center gap-2"
    >
      {/* Floating Live Game Reward Toast */}
      {showToast && (
        <div
          role="status"
          aria-live="polite"
          className="lp-glass flex items-center gap-3 rounded-full border border-gold/50 px-4 py-2 shadow-[var(--shadow-lift)]"
        >
          <span
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full font-mono text-[11px] font-bold ${
              showToast.tone === "profit"
                ? "bg-profit text-canvas"
                : showToast.tone === "loss"
                  ? "bg-loss text-canvas"
                  : "bg-gold-strong text-on-gold"
            }`}
          >
            {showToast.xpDelta > 0 ? "+" : "★"}
          </span>
          <div className="text-left">
            <p className="text-[12.5px] font-semibold leading-tight text-ink">
              {showToast.title}{" "}
              {showToast.xpDelta !== 0 && (
                <span className="font-mono text-[11px] text-gold">
                  ({showToast.xpDelta > 0 ? `+${showToast.xpDelta}` : showToast.xpDelta} XP)
                </span>
              )}
            </p>
            <p className="text-[11px] leading-tight text-muted">
              {showToast.subtitle}
            </p>
          </div>
        </div>
      )}

      {/* Expanded Quest Matrix & Trophy Case */}
      {expanded && (
        <div className="lp-glass lp-sq mb-1 w-[min(94vw,640px)] rounded-[26px] border border-line-strong p-4 shadow-[var(--shadow-overlay)]">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-line pb-2.5">
            <div className="flex items-center gap-2">
              <TrophyIcon className="h-4 w-4 text-gold" />
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-ink">
                Operator Quest Log · Keys [1–6]
              </span>
            </div>
            <div className="flex items-center gap-3 font-mono text-[11px] text-muted">
              <span>
                Rank: <strong className="text-gold">{rank.title}</strong>
              </span>
              <span>·</span>
              <span>
                Cleared: <strong className="text-profit">{completedCount}/6</strong>
              </span>
              <button
                type="button"
                onClick={resetLandingGame}
                className="rounded-full border border-line bg-raised px-2.5 py-0.5 text-[10px] uppercase tracking-[0.08em] text-muted hover:border-line-strong hover:text-ink"
              >
                Reset Run
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {QUEST_SPECS.map((q, idx) => {
              const active = idx === game.activeQuestIndex;
              const done = game.questsCompleted[q.id];
              return (
                <button
                  key={q.id}
                  type="button"
                  onClick={() => jumpTo(q.anchor)}
                  className={`flex items-start justify-between gap-2 rounded-2xl border p-3 text-left transition ${
                    active
                      ? "border-gold bg-gold/10 text-ink shadow-[var(--shadow-rest)]"
                      : done
                        ? "border-profit/40 bg-profit/[0.06] text-ink hover:border-profit"
                        : "border-line bg-raised/85 text-muted hover:border-line-strong hover:text-ink"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.12em]">
                      <span className="text-gold">[{idx + 1}] {q.code}</span>
                      <span>·</span>
                      <span className={done ? "font-semibold text-profit" : "text-faint"}>
                        {done ? "✓ CLEARED" : `+${q.xpReward} XP`}
                      </span>
                    </div>
                    <p className="mt-0.5 truncate font-display text-[13.5px] font-semibold tracking-[-0.01em] text-ink">
                      {q.title}
                    </p>
                    <p className="mt-0.5 line-clamp-1 text-[11.5px] text-muted">
                      {q.description}
                    </p>
                  </div>
                  {done && (
                    <CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0 text-profit" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Unlocked Badges Strip */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-2.5">
            <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Unlocked Badges ({game.badges.length}/6):
            </span>
            <div className="flex flex-wrap gap-1.5">
              {game.badges.length === 0 ? (
                <span className="text-[11.5px] italic text-faint">
                  Complete any quest on the page to unlock your first badge…
                </span>
              ) : (
                game.badges.map((b) => (
                  <span
                    key={b}
                    className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/12 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-gold"
                  >
                    <AwardIcon className="h-3 w-3" />
                    {b}
                  </span>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Compact Diegetic Quest Bar */}
      <div className="lp-glass flex items-center gap-2 rounded-full border border-line-strong px-3 py-1.5 shadow-[var(--shadow-lift)] sm:gap-3 sm:px-4">
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          aria-expanded={expanded}
          className="inline-flex items-center gap-2 rounded-full border border-line bg-raised px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.1em] text-ink transition hover:border-gold/60 active:scale-[0.98]"
        >
          <SparklesIcon className="h-3.5 w-3.5 text-gold" />
          <span className="font-semibold text-gold">{currentQuest.code}</span>
          <span className="hidden sm:inline">{currentQuest.shortTitle}</span>
          <span className="text-[9px] text-faint">{expanded ? "▼" : "▲"}</span>
        </button>

        {/* 6-Quest Completion Dots */}
        <div
          className="hidden items-center gap-1.5 md:flex"
          role="group"
          aria-label="Quest progress dots"
        >
          {QUEST_SPECS.map((q, idx) => {
            const active = idx === game.activeQuestIndex;
            const done = game.questsCompleted[q.id];
            return (
              <button
                key={q.id}
                type="button"
                onClick={() => jumpTo(q.anchor)}
                title={`${q.code}: ${q.title} (${done ? "Cleared" : `+${q.xpReward} XP`})`}
                aria-label={`Jump to ${q.title}`}
                className={`h-2 rounded-full transition-all duration-300 ${
                  active
                    ? "w-6 bg-gold-strong"
                    : done
                      ? "w-2.5 bg-profit hover:bg-gold"
                      : "w-2 bg-line-strong hover:bg-muted"
                }`}
              />
            );
          })}
        </div>

        <div className="h-3.5 w-px bg-line-strong" aria-hidden="true" />

        {/* Quest Counter & XP */}
        <div className="flex items-center gap-2.5 font-mono text-[11px] tabular-nums text-muted">
          <span>
            QUESTS <strong className="font-semibold text-profit">{completedCount}/6</strong>
          </span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">
            <strong className="font-semibold text-gold">{game.xp} XP</strong>
          </span>
        </div>
      </div>
    </aside>
  );
}

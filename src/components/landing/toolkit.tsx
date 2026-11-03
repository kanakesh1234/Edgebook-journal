"use client";

import { useState } from "react";
import {
  CheckCircleIcon,
  ChevronRightIcon,
  FlameIcon,
  SparklesIcon,
  TrophyIcon,
} from "@/components/ui/icons";
import type { ArenaMode } from "@/lib/practice/arena";
import { MODE_META, ModeBadge, ModeMotif, tint } from "@/components/practice/modes";
import { GateMeter } from "@/components/practice/ui";
import { Eyebrow } from "./ledger";
import { awardGameAction, useLandingGame } from "./game-state";

/* ========================================================================== */
/*  QUEST 04 — THE 5 PRACTICE ARENAS & TOOLKIT ARCADE (#toolkit)              */
/*  Uses Edgebook's authentic Practice Arena components (ModeBadge,           */
/*  ModeMotif, GateMeter) and strict theme tokens & fonts.                    */
/* ========================================================================== */

interface ArenaChallenge {
  mode: ArenaMode;
  level: number;
  question: string;
  contextBadge: string;
  visualType: "chart-reclaim" | "math-duel" | "boss-hp" | "ict-fvg" | "matrix-grid";
  options: string[];
  correctIndex: number;
  explanation: string;
  quote: string;
}

const ARENA_CHALLENGES: ArenaChallenge[] = [
  {
    mode: "matrix",
    level: 4,
    contextBadge: "Mixed Run · Chart + Rule Check",
    question:
      "Your pre-bell plan allows 2 trades max. Trade 1 was a −1.0R clean loss; Trade 2 was a +2.4R clean win. A third setup appears at 11:15 AM. What is the play?",
    visualType: "matrix-grid",
    options: [
      "Stop for the day — 2-trade limit reached (+1.4R net)",
      "Take a 3rd trade using half size since you are green",
      "Raise your daily trade cap to 4 when winning",
      "Scalp on the 1-minute chart without logging it",
    ],
    correctIndex: 0,
    explanation:
      "Matrix Arena tests rule adherence under temptation. A rule you bend when green is a rule you will break when red.",
    quote: "“Enough is a decision, not an amount.”",
  },
  {
    mode: "time-machine",
    level: 6,
    contextBadge: "Saved Screenshot · 21 Oct Replay",
    question:
      "In this saved chart from 21 Oct, price swept the overnight low at 09:32 and printed a 1-minute red pullback at 09:39. Why did you miss the +3.2R move?",
    visualType: "chart-reclaim",
    options: [
      "Moved stop to breakeven while watching live dollar P&L",
      "Entered before the 5-minute candle closed",
      "Forgot to set a take-profit target",
      "Traded during a high-impact CPI release",
    ],
    correctIndex: 0,
    explanation:
      "Time Machine replays your own historical screenshots until the early-choke reflex is permanently retired.",
    quote: "“Practise the mistake until the reflex disappears.”",
  },
  {
    mode: "math-duel",
    level: 5,
    contextBadge: "Rapid Risk Maths · 15s Clock",
    question:
      "Account: $50,000 · Risk Rule: 0.5% ($250) per trade. Your MNQ stop is 12.5 points ($2/point = $25 per contract). How many MNQ contracts can you trade?",
    visualType: "math-duel",
    options: [
      "10 MNQ contracts ($250 ÷ $25 = 10)",
      "20 MNQ contracts ($500 risk)",
      "5 MNQ contracts ($125 risk)",
      "2 NQ full-size contracts ($500 risk)",
    ],
    correctIndex: 0,
    explanation:
      "12.5 points × $2/pt = $25 risk per MNQ contract. $250 max risk ÷ $25 = 10 MNQ contracts.",
    quote: "“Position sizing is the only wall between a loss and a blowup.”",
  },
  {
    mode: "boss",
    level: 3,
    contextBadge: "Weekend Boss · Weekly Pattern Audit",
    question:
      "Your weekly log shows +4.2R Monday–Thursday, followed by −3.1R on Friday across 4 rapid trades after an early win. Which Boss weakness strikes the final blow?",
    visualType: "boss-hp",
    options: [
      "Activate the Friday First-Winner Hard Stop Rule",
      "Switch to a new indicator on Monday morning",
      "Double position size on Mondays to offset Fridays",
      "Stop taking trades on Thursdays",
    ],
    correctIndex: 0,
    explanation:
      "Weekend Boss turns your week's cross-trade leaks into a boss battle. Stopping after your first Friday winner eliminates 80% of your weekly giveback.",
    quote: "“Survive the drawdown first; the upside takes care of itself.”",
  },
  {
    mode: "ict",
    level: 7,
    contextBadge: "ICT Lab · Liquidity & Fair Value Gap",
    question:
      "Sell-side liquidity below the London low is swept at 09:33 NY, followed by displacement creating a bullish Fair Value Gap (FVG) with a 2.5R path to the high. Where is invalidation?",
    visualType: "ict-fvg",
    options: [
      "Below the displacement candle / sweep low",
      "At the midpoint of the target range",
      "No stop needed once an FVG forms",
      "5 ticks below your entry fill regardless of structure",
    ],
    correctIndex: 0,
    explanation:
      "In ICT Lab, every smart-money concept is paired with strict structural invalidation and R-multiple math.",
    quote: "“A setup is only an edge when your log proves it.”",
  },
];

export function Toolkit() {
  const game = useLandingGame();

  const [activeModeIdx, setActiveModeIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [drawdownSimTrades, setDrawdownSimTrades] = useState(1);

  const challenge = ARENA_CHALLENGES[activeModeIdx] ?? ARENA_CHALLENGES[0]!;
  const meta = MODE_META[challenge.mode];
  const selectedOption = answers[activeModeIdx];
  const isCorrect = selectedOption === challenge.correctIndex;

  const clearedModesCount = ARENA_CHALLENGES.filter(
    (c, idx) => answers[idx] === c.correctIndex,
  ).length;

  const handleSelectAnswer = (optionIdx: number) => {
    const right = optionIdx === challenge.correctIndex;
    const nextAnswers = { ...answers, [activeModeIdx]: optionIdx };
    setAnswers(nextAnswers);

    const nextClearedCount = ARENA_CHALLENGES.filter(
      (c, idx) => nextAnswers[idx] === c.correctIndex,
    ).length;

    if (right) {
      awardGameAction({
        xpDelta: 50,
        composureDelta: 4,
        equityDelta: 400,
        streakIncrement: true,
        questId: nextClearedCount >= 3 ? "q4_arena" : undefined,
        title: `${meta.title} Cleared!`,
        subtitle: challenge.explanation,
        tone: "profit",
      });
    } else {
      awardGameAction({
        composureDelta: -4,
        streakReset: true,
        title: `${meta.title} Miss`,
        subtitle: "Try again — check the tactical hint below.",
        tone: "loss",
      });
    }
  };

  return (
    <section
      id="toolkit"
      className="lp-wide py-16 sm:py-24"
      aria-labelledby="arena-title"
    >
      {/* Top Header */}
      <div className="mb-8 flex flex-col justify-between gap-6 border-t border-line pt-10 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Eyebrow n="04">QUEST 04 · THE 5 PRACTICE ARENAS</Eyebrow>
            {game.questsCompleted.q4_arena && (
              <span className="inline-flex items-center gap-1 rounded-full border border-profit/40 bg-profit/12 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-profit">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                QUEST 04 CLEARED
              </span>
            )}
          </div>
          <h2
            id="arena-title"
            className="mt-3 font-display text-[clamp(2rem,4.4vw,3.6rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
          >
            Daily reps built from{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              your own decisions.
            </span>
          </h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">
            Mistakes don&apos;t sit forgotten in an old entry. Play a live round across Edgebook&apos;s <strong className="font-semibold text-ink">5 Practice Arenas</strong> below—clear any <strong className="font-semibold text-profit">3 of 5 arenas</strong> to unlock your Arena Tactician badge (+300 XP).
          </p>
        </div>

        {/* Gauntlet Score Pill */}
        <div className="panel flex items-center gap-4 px-5 py-3.5">
          <TrophyIcon className="h-5 w-5 text-gold" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Arena Gauntlet Progress
            </p>
            <p className="font-display text-[16px] font-semibold text-ink">
              <span className="num text-profit">{clearedModesCount}</span> / 5 Arenas Cleared
            </p>
          </div>
        </div>
      </div>

      {/* 5 Authentic Mode Selector Cards */}
      <div
        className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-5"
        role="tablist"
        aria-label="Five Edgebook Practice Arenas"
      >
        {ARENA_CHALLENGES.map((item, idx) => {
          const m = MODE_META[item.mode];
          const isSelected = idx === activeModeIdx;
          const solved = answers[idx] === item.correctIndex;
          return (
            <button
              key={item.mode}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveModeIdx(idx)}
              className={`relative overflow-hidden rounded-[22px] border p-3.5 text-left transition ${
                isSelected
                  ? "border-gold bg-raised shadow-[var(--shadow-lift)]"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <ModeMotif mode={item.mode} />
              <div className="relative z-10 flex items-center justify-between gap-2">
                <ModeBadge mode={item.mode} size="sm" />
                <span
                  className={`rounded-full px-2 py-0.5 font-mono text-[9.5px] font-semibold ${
                    solved
                      ? "bg-profit/15 text-profit"
                      : "bg-ink/[0.06] text-muted"
                  }`}
                >
                  {solved ? "✓ CLEARED" : `LVL ${item.level}`}
                </span>
              </div>
              <p className="relative z-10 mt-2.5 font-display text-[15px] font-semibold tracking-[-0.015em] text-ink">
                {m.title}
              </p>
              <p className="relative z-10 font-mono text-[10px] uppercase tracking-[0.1em] text-muted">
                {m.stage}
              </p>
            </button>
          );
        })}
      </div>

      {/* Active Arena Playable Stage (12 Columns) */}
      <div className="lp-game-card relative overflow-hidden p-5 sm:p-8">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0"
          style={{
            background: `radial-gradient(80% 120% at 0% 0%, ${tint(meta.accent, 11)}, transparent 62%)`,
          }}
        />

        <div className="relative z-10 grid items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
          {/* LEFT 5 COLS: Arena Identity, GateMeter & Visual Challenge Widget */}
          <div className="flex flex-col justify-between lg:col-span-5">
            <div>
              <div className="flex items-center gap-4">
                <ModeBadge mode={challenge.mode} size="lg" />
                <div>
                  <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
                    {challenge.contextBadge}
                  </p>
                  <h3 className="mt-0.5 font-display text-[26px] font-semibold leading-none tracking-[-0.025em] text-ink">
                    {meta.title}{" "}
                    <span className="font-normal text-muted">
                      · Level {challenge.level}
                    </span>
                  </h3>
                  <p className="mt-1.5 text-[13.5px] text-muted">{meta.blurb}</p>
                </div>
              </div>

              {/* Authentic GateMeter from src/components/practice/ui.tsx */}
              <div className="mt-5 rounded-2xl border border-line bg-canvas/75 p-4">
                <GateMeter
                  value={clearedModesCount}
                  goal={5}
                  accent={meta.accent}
                  variant={challenge.mode === "boss" ? "boss" : "fill"}
                  accuracy={clearedModesCount > 0 ? 1 : 0.88}
                  needAccuracy={0.8}
                  nextLevel={challenge.level + 1}
                />
              </div>

              {/* Mode-Specific Interactive Visual Diagram */}
              <div className="mt-4 rounded-2xl border border-line bg-surface p-4">
                {challenge.visualType === "math-duel" && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-xl border border-line bg-raised p-2.5">
                      <span className="block font-mono text-[9.5px] uppercase text-faint">
                        Max Risk (0.5%)
                      </span>
                      <span className="kpi mt-1 block text-[20px] text-gold">
                        $250
                      </span>
                    </div>
                    <div className="rounded-xl border border-line bg-raised p-2.5">
                      <span className="block font-mono text-[9.5px] uppercase text-faint">
                        Stop Distance
                      </span>
                      <span className="kpi mt-1 block text-[20px] text-loss">
                        12.5 pts
                      </span>
                    </div>
                    <div className="rounded-xl border border-line bg-raised p-2.5">
                      <span className="block font-mono text-[9.5px] uppercase text-faint">
                        MNQ Point Val
                      </span>
                      <span className="kpi mt-1 block text-[20px] text-ink">
                        $2 / pt
                      </span>
                    </div>
                  </div>
                )}

                {challenge.visualType === "boss-hp" && (
                  <div>
                    <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.1em]">
                      <span className="font-semibold text-loss">
                        BOSS: THE FRIDAY GIVEBACK DEMON
                      </span>
                      <span className="num text-ink">
                        HP {isCorrect ? "0 / 100 (DEFEATED)" : "100 / 100"}
                      </span>
                    </div>
                    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-ink/[0.08]">
                      <div
                        className="h-full rounded-full bg-loss transition-all duration-500"
                        style={{ width: isCorrect ? "0%" : "100%" }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-[11px] text-muted">
                      Mon–Thu: <strong className="text-profit">+4.2R</strong> · Fri Overtrading:{" "}
                      <strong className="text-loss">−3.1R</strong>
                    </p>
                  </div>
                )}

                {(challenge.visualType === "chart-reclaim" ||
                  challenge.visualType === "ict-fvg" ||
                  challenge.visualType === "matrix-grid") && (
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                        {challenge.visualType === "ict-fvg"
                          ? "ICT Displacement + Fair Value Gap"
                          : challenge.visualType === "chart-reclaim"
                            ? "Saved Trade Replay · 09:39 Shakeout"
                            : "Session Rule Matrix · 2-Trade Cap"}
                      </p>
                      <p className="mt-1 text-[13px] text-muted">
                        Spaced-repetition Box 4 of 5 · Built directly from your logged journal entries.
                      </p>
                    </div>
                    <span className="shrink-0 rounded-xl border border-profit/35 bg-profit/10 px-3 py-1.5 font-mono text-[11px] font-semibold text-profit">
                      +50 XP
                    </span>
                  </div>
                )}
              </div>
            </div>

            <blockquote className="mt-5 border-t border-line pt-3 font-serif text-[16.5px] italic text-gold">
              {challenge.quote}
            </blockquote>
          </div>

          {/* RIGHT 7 COLS: Interactive Question & 4 Answer Tiles */}
          <div className="flex flex-col justify-between rounded-[22px] border border-line-strong bg-canvas/75 p-5 sm:p-6 lg:col-span-7">
            <div>
              <div className="flex items-center justify-between font-mono text-[11px] uppercase tracking-[0.12em]">
                <span className="text-gold">
                  ARENA ROUND 0{activeModeIdx + 1} OF 05 · SELECT ANSWER [1–4]
                </span>
                <span className="text-profit">
                  {isCorrect ? "✓ SOLVED" : "+50 XP"}
                </span>
              </div>

              <p className="mt-3 font-display text-[clamp(1.1rem,1.6vw,1.35rem)] font-semibold leading-snug tracking-[-0.02em] text-ink">
                {challenge.question}
              </p>

              <div className="mt-4 space-y-2.5">
                {challenge.options.map((opt, idx) => {
                  const picked = selectedOption === idx;
                  const right = idx === challenge.correctIndex;
                  let tileCls = "lp-game-tile";
                  if (selectedOption !== undefined) {
                    if (right) {
                      tileCls = "rounded-[18px] border border-profit bg-profit/12";
                    } else if (picked) {
                      tileCls = "rounded-[18px] border border-loss bg-loss/12";
                    } else {
                      tileCls = "rounded-[18px] border border-line bg-surface opacity-55";
                    }
                  }

                  return (
                    <button
                      key={opt}
                      type="button"
                      onClick={() => handleSelectAnswer(idx)}
                      className={`flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition ${tileCls}`}
                    >
                      <span
                        className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-bold ${
                          selectedOption !== undefined && right
                            ? "bg-profit text-canvas"
                            : selectedOption !== undefined && picked
                              ? "bg-loss text-canvas"
                              : "border border-line-strong bg-raised text-gold"
                        }`}
                      >
                        {selectedOption !== undefined && right
                          ? "✓"
                          : selectedOption !== undefined && picked
                            ? "×"
                            : idx + 1}
                      </span>
                      <span className="text-[14.5px] font-medium leading-snug text-ink">
                        {opt}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Instant Explanation & Next Arena Button */}
            <div className="mt-5 flex flex-col justify-between gap-3 border-t border-line pt-4 sm:flex-row sm:items-center">
              <p className="text-[13px] leading-snug text-muted">
                {selectedOption !== undefined ? (
                  <span>
                    <strong className={isCorrect ? "text-profit" : "text-loss"}>
                      {isCorrect ? "Coach Note: " : "Correction: "}
                    </strong>
                    {challenge.explanation}
                  </span>
                ) : (
                  <span>
                    Click an answer above to test <strong className="text-ink">{meta.title}</strong>.
                  </span>
                )}
              </p>

              <button
                type="button"
                onClick={() =>
                  setActiveModeIdx((activeModeIdx + 1) % ARENA_CHALLENGES.length)
                }
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-full bg-gold-strong px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-on-gold transition hover:bg-gold-strong-hover"
              >
                Next Arena ({((activeModeIdx + 1) % 5) + 1}/5) →
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Interactive Companion Modules Below the Arena (Lab Drawdown Sim, Process Leaderboard, Finite Feed) */}
      <div className="mt-6 grid gap-6 md:grid-cols-3">
        {/* Card 1: Interactive Trading Lab Drawdown Room Simulator */}
        <div className="panel flex flex-col justify-between p-5 sm:p-6">
          <div>
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
              <span>MODULE 01 · TRADING LAB</span>
              <span className="text-profit">Interactive Sim</span>
            </div>
            <h3 className="mt-2 font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">
              Test it before you risk it.
            </h3>
            <p className="mt-1 text-[13.5px] text-muted">
              Simulate how consecutive losses impact your $2,000 funded drawdown buffer at $250/trade risk:
            </p>

            <div className="mt-4 rounded-2xl border border-line bg-raised p-3.5">
              <div className="flex justify-between text-[12px]">
                <span className="text-muted">Simulated Losing Streak:</span>
                <strong className="num text-ink">{drawdownSimTrades} loss(es)</strong>
              </div>
              <div className="mt-2 flex gap-1.5">
                {[1, 2, 4, 6].map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => {
                      setDrawdownSimTrades(n);
                      awardGameAction({
                        xpDelta: 10,
                        title: "Drawdown Envelope Tested",
                        subtitle: `After ${n} loss(es), $${2000 - n * 250} of drawdown buffer remains.`,
                        tone: "gold",
                      });
                    }}
                    className={`flex-1 rounded-lg border py-1 font-mono text-[11px] font-semibold transition ${
                      drawdownSimTrades === n
                        ? "border-gold bg-gold-strong text-on-gold"
                        : "border-line bg-surface text-muted hover:text-ink"
                    }`}
                  >
                    −{n}R
                  </button>
                ))}
              </div>
              <div className="mt-3 flex justify-between text-[12px]">
                <span className="text-muted">Drawdown Room Left:</span>
                <span className="num font-semibold text-profit">
                  ${(2000 - drawdownSimTrades * 250).toLocaleString()} of $2,000
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ink/[0.08]">
                <div
                  className="h-full rounded-full bg-profit transition-all duration-300"
                  style={{
                    width: `${((2000 - drawdownSimTrades * 250) / 2000) * 100}%`,
                  }}
                />
              </div>
            </div>
          </div>
          <p className="mt-4 border-t border-line pt-3 font-serif text-[15px] italic text-gold">
            &ldquo;Survive the drawdown first; the upside takes care of itself.&rdquo;
          </p>
        </div>

        {/* Card 2: Live Process Leaderboard (Compete on Process, Never Balances) */}
        <div className="panel flex flex-col justify-between p-5 sm:p-6">
          <div>
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
              <span>MODULE 02 · FRIENDS LEADERBOARD</span>
              <span className="text-profit">Live Composure</span>
            </div>
            <h3 className="mt-2 font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">
              Compete on process, not bankrolls.
            </h3>
            <p className="mt-1 text-[13.5px] text-muted">
              Dollar balances never leave your journal. Friends only see how well each of you kept your written rules:
            </p>

            <ul className="mt-4 space-y-2">
              {[
                { name: "Aarav", score: 92, you: false },
                { name: "You (Live Run)", score: game.composure, you: true },
                { name: "Mei", score: 81, you: false },
              ]
                .sort((a, b) => b.score - a.score)
                .map((row, rIdx) => (
                  <li
                    key={row.name}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2 text-[13.5px] ${
                      row.you
                        ? "border-gold/50 bg-gold/10 font-semibold text-ink"
                        : "border-line bg-raised text-ink"
                    }`}
                  >
                    <span className="flex items-center gap-2">
                      <span className="font-mono text-[11px] text-gold">
                        #{rIdx + 1}
                      </span>
                      {row.name}
                    </span>
                    <span className="num font-mono text-[12px] text-profit">
                      {row.score}% on plan
                    </span>
                  </li>
                ))}
            </ul>
          </div>
          <p className="mt-4 border-t border-line pt-3 font-serif text-[15px] italic text-gold">
            &ldquo;Compare discipline, never bankrolls.&rdquo;
          </p>
        </div>

        {/* Card 3: Playbook Win-Rate & Finite 20-Card Feed */}
        <div className="panel flex flex-col justify-between p-5 sm:p-6">
          <div>
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
              <span>MODULE 03 · PLAYBOOK &amp; FEED</span>
              <span className="text-profit">20-Card Cap</span>
            </div>
            <h3 className="mt-2 font-display text-[19px] font-semibold tracking-[-0.02em] text-ink">
              Your playbook, proven in ink.
            </h3>
            <p className="mt-1 text-[13.5px] text-muted">
              Every lesson links directly to the trades that prove it, and your daily review feed ends cleanly at 20 cards.
            </p>

            <div className="mt-4 rounded-2xl border border-line bg-raised p-3.5">
              <p className="text-[14px] font-semibold text-ink">
                Setup #01 · Overnight Low Sweep &amp; Reclaim
              </p>
              <p className="mt-1 text-[12.5px] text-muted">
                Wait for the first 15 minutes, then act on the 5m reclaim—never the opening impulse.
              </p>
              <div className="mt-3 flex flex-wrap gap-1.5">
                <span className="rounded-full bg-profit/12 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-profit">
                  84% Clean Process
                </span>
                <span className="rounded-full bg-gold/12 px-2.5 py-0.5 font-mono text-[11px] font-semibold text-gold">
                  +2.1R Expectancy
                </span>
              </div>
            </div>
          </div>
          <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
            <span className="font-serif text-[15px] italic text-gold">
              &ldquo;A feed that actually ends.&rdquo;
            </span>
            <a
              href="#minato"
              className="group inline-flex items-center gap-1 text-[13px] font-medium text-gold hover:text-ink"
            >
              Quest 05: Minato
              <ChevronRightIcon className="h-3.5 w-3.5" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

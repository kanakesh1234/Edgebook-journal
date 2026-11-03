"use client";

import { useState } from "react";
import {
  AwardIcon,
  CandlestickIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  FlameIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { Eyebrow } from "./ledger";
import { awardGameAction, useLandingGame } from "./game-state";

/* ========================================================================== */
/*  QUEST 02 — 09:30 NY LIVE TAPE & IMPULSE DEFENSE SIMULATOR (#film)         */
/*  100% Edgebook Theme Tokens & Fonts (Inter Variable, Instrument Serif,     */
/*  JetBrains Mono). Works identically in Light and Dark modes.               */
/* ========================================================================== */

export type DecisionBranch = "discipline" | "impulse";

interface CandleBar {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  note?: string;
}

interface TapeRound {
  id: string;
  stepNum: string;
  timeStamp: string;
  title: string;
  innerVoiceType: string;
  innerWhisper: string;
  marketContext: string;
  quote: string;
  quoteAuthor: string;
  visibleCandles: number;
  priceLabel: string;
  disciplineChoice: {
    label: string;
    sublabel: string;
    outcome: string;
    rDelta: number;
    dollarDelta: number;
    composureDelta: number;
  };
  impulseChoice: {
    label: string;
    sublabel: string;
    outcome: string;
    rDelta: number;
    dollarDelta: number;
    composureDelta: number;
  };
}

const SESSION_CANDLES: CandleBar[] = [
  { time: "09:15", open: 432, high: 438, low: 426, close: 429 },
  { time: "09:20", open: 429, high: 434, low: 421, close: 423 },
  { time: "09:25", open: 423, high: 428, low: 416, close: 418 },
  // Round 1: 09:29 Fakeout green spike before sweep
  { time: "09:29", open: 418, high: 444, low: 417, close: 439, note: "FOMO Wick" },
  // Round 2: 09:35 Sweep of overnight low (414) + crisp 5m reclaim (428)
  { time: "09:32", open: 439, high: 440, low: 408, close: 412, note: "Low Sweep" },
  { time: "09:35", open: 412, high: 431, low: 410, close: 428, note: "5m Reclaim" },
  // Round 3: 09:39 First leg up + scary red pullback shakeout candle
  { time: "09:37", open: 428, high: 448, low: 426, close: 445 },
  { time: "09:39", open: 445, high: 446, low: 429, close: 432, note: "Shakeout" },
  // Round 4: 09:46 Clean expansion to Pre-Market High Target (476)
  { time: "09:42", open: 432, high: 460, low: 431, close: 458 },
  { time: "09:46", open: 458, high: 478, low: 455, close: 475, note: "+2.8R Target" },
  // Round 5: 09:52 Post-target Friday chop
  { time: "09:50", open: 475, high: 479, low: 461, close: 464 },
  { time: "09:52", open: 464, high: 471, low: 456, close: 462, note: "Friday Chop" },
];

const TAPE_ROUNDS: TapeRound[] = [
  {
    id: "r1-fomo",
    stepNum: "01",
    timeStamp: "09:29:45 AM NY",
    title: "The Opening Fakeout Wick",
    innerVoiceType: "FOMO Impulse Whisper",
    innerWhisper:
      "“Look at that green candle ripping before the bell! Everyone is getting long without you—click Market Buy right now!”",
    marketContext:
      "Price spikes upward 15 seconds before the open, but the overnight low (18,414) has NOT been swept yet. Your written plan requires a sweep + 5m close.",
    quote: "The hardest trade is the one you choose not to take.",
    quoteAuthor: "Edgebook Field Manual",
    visibleCandles: 4,
    priceLabel: "18,439.00",
    disciplineChoice: {
      label: "Hands off mouse · Wait for overnight sweep",
      sublabel: "Honour Gate 01 Thesis · Zero FOMO entry",
      outcome:
        "Restraint held! Sixty seconds later, the opening fakeout collapses 31 points to sweep the overnight low—trapping early chasers.",
      rDelta: 0,
      dollarDelta: 0,
      composureDelta: 6,
    },
    impulseChoice: {
      label: "Click Market Buy to chase the green candle",
      sublabel: "Break written plan · Unconfirmed entry",
      outcome:
        "Trapped at the very top of the opening wick! Price reverses immediately through your stop for an unscheduled −1.0R loss.",
      rDelta: -1.0,
      dollarDelta: -1000,
      composureDelta: -14,
    },
  },
  {
    id: "r2-reclaim",
    stepNum: "02",
    timeStamp: "09:35:00 AM NY",
    title: "The Overnight Sweep & 5m Reclaim",
    innerVoiceType: "Execution Moment",
    innerWhisper:
      "“The overnight low just swept at 18,408 and closed back inside range at 18,428. Your exact A+ setup is on the screen.”",
    marketContext:
      "All 4 playbook conditions are met: liquidity swept, 5-minute candle closed back inside range, and structural invalidation sits 2 ticks below the wick.",
    quote: "When your condition appears, act without hesitation and without greed.",
    quoteAuthor: "Edgebook Execution Protocol",
    visibleCandles: 6,
    priceLabel: "18,428.00",
    disciplineChoice: {
      label: "Execute Planned Long · Fixed 1.0R Risk",
      sublabel: "Entry 18,428 · Hard Stop 18,406 · Target 18,475",
      outcome:
        "Clean execution! Risk is capped at 1.0R ($1,000) with a +2.8R ($2,800) structural target at the pre-market high.",
      rDelta: 0.5,
      dollarDelta: 500,
      composureDelta: 6,
    },
    impulseChoice: {
      label: "Triple size to 3.0R to make a huge week",
      sublabel: "Violate drawdown survival envelope",
      outcome:
        "Over-leveraged! Because your size is 3× too large, every normal 3-tick pullback causes your heart rate to spike in panic.",
      rDelta: -0.5,
      dollarDelta: -500,
      composureDelta: -16,
    },
  },
  {
    id: "r3-pullback",
    stepNum: "03",
    timeStamp: "09:39:15 AM NY",
    title: "The In-Trade Shakeout Candle",
    innerVoiceType: "Fear of Giveback Whisper",
    innerWhisper:
      "“You were up +$900 and now a red 1-minute candle just printed! Drag your stop to breakeven right now so you don't lose a penny!”",
    marketContext:
      "Price pulls back to retest the 18,430 breakout shelf. Your structural 5-minute thesis is completely intact, and dollar P&L is hidden.",
    quote: "Count in R, never in dollars, while the decision is still alive.",
    quoteAuthor: "Minato Pattern Engine",
    visibleCandles: 8,
    priceLabel: "18,432.00",
    disciplineChoice: {
      label: "Keep original stop · Let 5m structure breathe",
      sublabel: "R-Multiple Mode Active · Zero interference",
      outcome:
        "Patience rewarded! The 18,430 retest holds to the tick and buyers step in aggressively for the main expansion leg.",
      rDelta: 1.1,
      dollarDelta: 1100,
      composureDelta: 8,
    },
    impulseChoice: {
      label: "Choke stop to breakeven out of fear",
      sublabel: "React to 1-minute noise instead of 5m plan",
      outcome:
        "Stopped out to the exact tick at breakeven ($0)—and then you watch helplessly as price rockets +45 points to your target without you!",
      rDelta: -0.5,
      dollarDelta: -500,
      composureDelta: -15,
    },
  },
  {
    id: "r4-target",
    stepNum: "04",
    timeStamp: "09:46:00 AM NY",
    title: "Pre-Market High Target Reached (+2.8R)",
    innerVoiceType: "Greed Whisper",
    innerWhisper:
      "“Look at that momentum! Delete your resting take-profit limit order—this thing is going to run 200 points today!”",
    marketContext:
      "Price tags your exact pre-session target at 18,475 (+2.8R / +$2,800). Major opposing liquidity sits right above 18,478.",
    quote: "Enough is a decision, not an amount.",
    quoteAuthor: "Edgebook Archival Creed",
    visibleCandles: 10,
    priceLabel: "18,475.00",
    disciplineChoice: {
      label: "Fill planned Take-Profit at +2.8R (+$2,800)",
      sublabel: "Honour pre-committed exit · Lock clean win",
      outcome:
        "Target filled at 18,475! You bank +2.8R (+$2,800) with 100% plan adherence before the upper liquidity shelf rejects price.",
      rDelta: 1.2,
      dollarDelta: 1200,
      composureDelta: 8,
    },
    impulseChoice: {
      label: "Cancel limit target & hold for a home run",
      sublabel: "Move goalposts mid-trade out of greed",
      outcome:
        "Price rejects 18,478 and snaps back 18 points in two minutes, erasing more than half of your open gain.",
      rDelta: -0.8,
      dollarDelta: -800,
      composureDelta: -12,
    },
  },
  {
    id: "r5-friday",
    stepNum: "05",
    timeStamp: "09:52:00 AM NY",
    title: "The Friday Winner Circuit Breaker",
    innerVoiceType: "Euphoria Whisper",
    innerWhisper:
      "“That was so easy! You feel unstoppable—take one more quick scalp in this mid-range chop to round your day up to $4,000!”",
    marketContext:
      "Your personal guardrail states: 'On Fridays, stop after the first clean winner.' Minato flagged that 4 of your last 5 Friday losses followed a green opener.",
    quote: "The hardest moment to stay disciplined is right after you win.",
    quoteAuthor: "Minato Friday Rule",
    visibleCandles: 12,
    priceLabel: "18,462.00",
    disciplineChoice: {
      label: "Close terminal · Honour Friday Winner Rule",
      sublabel: "Protect +2.8R morning · Log 3-minute autopsy",
      outcome:
        "Session complete! You walk away with +2.8R (+$2,800), 100% clean process, and your entire Friday afternoon free.",
      rDelta: 0,
      dollarDelta: 0,
      composureDelta: 10,
    },
    impulseChoice: {
      label: "Force a second trade in mid-range chop",
      sublabel: "Overtrade out of post-win euphoria",
      outcome:
        "Classic Friday giveback! You get chopped up twice in the mid-range and hand back −1.6R of your hard-earned morning profit.",
      rDelta: -1.6,
      dollarDelta: -1600,
      composureDelta: -18,
    },
  },
];

export function StoryFilmScroll() {
  const game = useLandingGame();

  const [activeStep, setActiveStep] = useState(0);
  const [decisions, setDecisions] = useState<Record<number, DecisionBranch>>({
    0: "discipline",
  });

  const currentRound = TAPE_ROUNDS[activeStep] ?? TAPE_ROUNDS[0]!;
  const currentChoice = decisions[activeStep];

  // Calculate cumulative session R and $ across answered steps
  let sessionR = 0;
  let sessionDollars = 0;
  let disciplineSteps = 0;
  const answeredCount = Object.keys(decisions).length;

  TAPE_ROUNDS.forEach((r, idx) => {
    const pick = decisions[idx];
    if (pick === "discipline") {
      sessionR += r.disciplineChoice.rDelta;
      sessionDollars += r.disciplineChoice.dollarDelta;
      disciplineSteps += 1;
    } else if (pick === "impulse") {
      sessionR += r.impulseChoice.rDelta;
      sessionDollars += r.impulseChoice.dollarDelta;
    }
  });

  const handleDecision = (stepIdx: number, branch: DecisionBranch) => {
    const round = TAPE_ROUNDS[stepIdx]!;
    const info =
      branch === "discipline" ? round.disciplineChoice : round.impulseChoice;

    const nextDecisions = { ...decisions, [stepIdx]: branch };
    setDecisions(nextDecisions);

    const allFiveAnswered = Object.keys(nextDecisions).length >= TAPE_ROUNDS.length;
    const allDiscipline =
      allFiveAnswered &&
      Object.values(nextDecisions).every((b) => b === "discipline");

    awardGameAction({
      xpDelta: branch === "discipline" ? 45 : 10,
      composureDelta: info.composureDelta,
      equityDelta: branch === "discipline" ? 560 : -350,
      streakIncrement: branch === "discipline",
      streakReset: branch === "impulse",
      questId: allDiscipline ? "q2_tape" : undefined,
      title:
        branch === "discipline"
          ? `Tick 0${stepIdx + 1}: Disciplined Execution`
          : `Tick 0${stepIdx + 1}: Impulse Trap Triggered`,
      subtitle: info.outcome,
      tone: branch === "discipline" ? "profit" : "loss",
    });

    // Auto-advance after a short moment if not on the final step and user clicked a fresh step
    if (stepIdx < TAPE_ROUNDS.length - 1 && decisions[stepIdx] === undefined) {
      window.setTimeout(() => {
        setActiveStep((prev) => (prev === stepIdx ? stepIdx + 1 : prev));
      }, 650);
    }
  };

  const simulateFullPath = (mode: DecisionBranch) => {
    const next: Record<number, DecisionBranch> = {};
    TAPE_ROUNDS.forEach((_, i) => {
      next[i] = mode;
    });
    setDecisions(next);
    setActiveStep(TAPE_ROUNDS.length - 1);

    awardGameAction({
      xpDelta: mode === "discipline" ? 120 : 15,
      composureDelta: mode === "discipline" ? 12 : -22,
      equityDelta: mode === "discipline" ? 2800 : -1800,
      streakIncrement: mode === "discipline",
      streakReset: mode === "impulse",
      questId: mode === "discipline" ? "q2_tape" : undefined,
      title:
        mode === "discipline"
          ? "Full Disciplined Session Completed (+2.8R)"
          : "Impulse Session Simulated (−4.4R)",
      subtitle:
        mode === "discipline"
          ? "5/5 disciplined decisions kept. +$2,800 banked with 100% composure."
          : "See how chasing, over-sizing, and Friday overtrading turn a winning setup into a red day.",
      tone: mode === "discipline" ? "profit" : "loss",
    });
  };

  // Price range for SVG chart scaling (404 to 484)
  const minP = 404;
  const maxP = 484;
  const priceToY = (p: number) => 220 - ((p - minP) / (maxP - minP)) * 185;

  const visibleBars = SESSION_CANDLES.slice(0, currentRound.visibleCandles);
  const questCleared = game.questsCompleted.q2_tape;

  return (
    <section
      id="film"
      className="lp-wide py-16 sm:py-24"
      aria-labelledby="tape-game-title"
    >
      {/* Section Header */}
      <div className="mb-8 flex flex-col justify-between gap-6 border-t border-line pt-10 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Eyebrow n="02">QUEST 02 · 09:30 NY LIVE TAPE SIMULATOR</Eyebrow>
            {questCleared && (
              <span className="inline-flex items-center gap-1 rounded-full border border-profit/40 bg-profit/12 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-profit">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                QUEST 02 CLEARED
              </span>
            )}
          </div>
          <h2
            id="tape-game-title"
            className="mt-3 max-w-4xl font-display text-[clamp(2rem,4.4vw,3.6rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
          >
            The market is external.{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              The battle is inside.
            </span>
          </h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">
            Step into the 09:30 AM NY bell. Advance through all 5 live market ticks below and silence FOMO, fear, and Friday euphoria using the rules you wrote in Quest 01.
          </p>
        </div>

        {/* Fast Path Comparison Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => simulateFullPath("discipline")}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-profit/45 bg-profit/12 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-profit transition hover:bg-profit/20"
          >
            <SparklesIcon className="h-3.5 w-3.5" />
            Run 5/5 Disciplined Path (+2.8R)
          </button>
          <button
            type="button"
            onClick={() => simulateFullPath("impulse")}
            className="inline-flex h-10 items-center gap-1.5 rounded-full border border-loss/40 bg-loss/10 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.08em] text-loss transition hover:bg-loss/20"
          >
            Test Impulse Path (−4.4R)
          </button>
        </div>
      </div>

      {/* 5-Tick Stepper Bar */}
      <div
        className="mb-6 grid grid-cols-2 gap-2 sm:grid-cols-5"
        role="tablist"
        aria-label="Five ticks of the 09:30 NY session"
      >
        {TAPE_ROUNDS.map((r, idx) => {
          const isCurrent = idx === activeStep;
          const pick = decisions[idx];
          return (
            <button
              key={r.id}
              type="button"
              role="tab"
              aria-selected={isCurrent}
              onClick={() => setActiveStep(idx)}
              className={`flex flex-col justify-between rounded-2xl border p-3 text-left transition ${
                isCurrent
                  ? "border-gold bg-raised shadow-[var(--shadow-rest)]"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <div className="flex w-full items-center justify-between font-mono text-[10px] uppercase tracking-[0.1em]">
                <span className={isCurrent ? "font-bold text-gold" : "text-faint"}>
                  TICK {r.stepNum}
                </span>
                <span
                  className={`rounded-full px-2 py-0.5 text-[9.5px] font-semibold ${
                    pick === "discipline"
                      ? "bg-profit/15 text-profit"
                      : pick === "impulse"
                        ? "bg-loss/15 text-loss"
                        : "bg-ink/[0.06] text-muted"
                  }`}
                >
                  {pick === "discipline"
                    ? "✓ CLEAN"
                    : pick === "impulse"
                      ? "! IMPULSE"
                      : "PENDING"}
                </span>
              </div>
              <p className="mt-1.5 truncate font-display text-[13px] font-semibold text-ink">
                {r.title}
              </p>
              <p className="font-mono text-[10.5px] text-muted">{r.timeStamp}</p>
            </button>
          );
        })}
      </div>

      {/* Main Widescreen Simulator Arena: Left 7 Cols (Live Chart & Telemetry) | Right 5 Cols (Inner Voice & Decision Card) */}
      <div className="grid items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
        {/* LEFT 7 COLS: Theme-Aware Interactive Candlestick Chart & Session Readout */}
        <div className="lp-game-card flex flex-col justify-between overflow-hidden lg:col-span-7">
          {/* Top Chart Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/70 px-5 py-3.5 sm:px-6">
            <div className="flex items-center gap-2.5">
              <span className="inline-grid h-8 w-8 place-items-center rounded-xl border border-line-strong bg-raised text-gold">
                <CandlestickIcon className="h-4 w-4" />
              </span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display text-[14.5px] font-semibold text-ink">
                    MNQ · Micro Nasdaq Futures
                  </span>
                  <span className="rounded-md border border-line bg-raised px-2 py-0.5 font-mono text-[10px] text-gold">
                    5m Structure
                  </span>
                </div>
                <p className="font-mono text-[11px] text-muted">
                  {currentRound.timeStamp} · Last:{" "}
                  <strong className="text-ink">{currentRound.priceLabel}</strong>
                </p>
              </div>
            </div>

            {/* Live Session Scoreboard Pills */}
            <div className="flex items-center gap-2">
              <div className="rounded-xl border border-line bg-raised px-3 py-1.5 text-right">
                <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
                  Session R-Multiple
                </span>
                <span
                  className={`num font-mono text-[14px] font-bold ${
                    sessionR >= 0 ? "text-profit" : "text-loss"
                  }`}
                >
                  {sessionR >= 0 ? `+${sessionR.toFixed(1)}R` : `${sessionR.toFixed(1)}R`}
                  {" "}
                  ({sessionDollars >= 0 ? `+$${sessionDollars.toLocaleString()}` : `-$${Math.abs(sessionDollars).toLocaleString()}`})
                </span>
              </div>

              <div className="rounded-xl border border-line bg-raised px-3 py-1.5 text-right">
                <span className="block font-mono text-[9.5px] uppercase tracking-[0.1em] text-faint">
                  Process Grade
                </span>
                <span
                  className={`font-mono text-[14px] font-bold ${
                    disciplineSteps === answeredCount
                      ? "text-profit"
                      : disciplineSteps >= 3
                        ? "text-gold"
                        : "text-loss"
                  }`}
                >
                  {disciplineSteps === 5
                    ? "A+ SOVEREIGN"
                    : disciplineSteps >= 4
                      ? "A CLEAN"
                      : disciplineSteps >= 3
                        ? "B MIXED"
                        : "D IMPULSIVE"}
                </span>
              </div>
            </div>
          </div>

          {/* Interactive SVG Candlestick Chart (100% Theme Variable Driven) */}
          <div className="grid-backdrop relative flex-1 px-4 py-5 sm:px-6">
            <svg
              viewBox="0 0 680 250"
              className="h-full min-h-[240px] w-full overflow-visible"
              role="img"
              aria-label={`Candlestick chart at ${currentRound.timeStamp} showing ${currentRound.title}`}
            >
              {/* Key Structural Levels */}
              {/* Target 18,475 (+2.8R) */}
              <line
                x1="16"
                y1={priceToY(475)}
                x2="650"
                y2={priceToY(475)}
                stroke="var(--color-profit)"
                strokeWidth="1.5"
                strokeDasharray="5 5"
              />
              <rect
                x="518"
                y={priceToY(475) - 18}
                width="130"
                height="16"
                rx="4"
                fill="var(--color-raised)"
                stroke="var(--color-profit)"
                strokeWidth="1"
              />
              <text
                x="583"
                y={priceToY(475) - 7}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill="var(--color-profit)"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                TARGET · 18,475 (+2.8R)
              </text>

              {/* Entry Reclaim Level 18,428 */}
              <line
                x1="16"
                y1={priceToY(428)}
                x2="650"
                y2={priceToY(428)}
                stroke="var(--color-gold)"
                strokeWidth="1.5"
                strokeDasharray="4 4"
              />
              <rect
                x="518"
                y={priceToY(428) - 18}
                width="130"
                height="16"
                rx="4"
                fill="var(--color-raised)"
                stroke="var(--color-gold)"
                strokeWidth="1"
              />
              <text
                x="583"
                y={priceToY(428) - 7}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill="var(--color-gold)"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                5M RECLAIM · 18,428
              </text>

              {/* Overnight Low Sweep Shelf 18,414 */}
              <line
                x1="16"
                y1={priceToY(414)}
                x2="650"
                y2={priceToY(414)}
                stroke="var(--color-loss)"
                strokeWidth="1.5"
                strokeDasharray="3 4"
              />
              <rect
                x="508"
                y={priceToY(414) + 4}
                width="140"
                height="16"
                rx="4"
                fill="var(--color-raised)"
                stroke="var(--color-loss)"
                strokeWidth="1"
              />
              <text
                x="578"
                y={priceToY(414) + 15}
                textAnchor="middle"
                fontSize="9.5"
                fontWeight="600"
                fill="var(--color-loss)"
                style={{ fontFamily: "var(--font-mono)" }}
              >
                OVERNIGHT LOW · 18,414
              </text>

              {/* Candlesticks */}
              {visibleBars.map((bar, idx) => {
                const cx = 42 + idx * 40;
                const isBull = bar.close >= bar.open;
                const highY = priceToY(bar.high);
                const lowY = priceToY(bar.low);
                const topY = priceToY(Math.max(bar.open, bar.close));
                const botY = priceToY(Math.min(bar.open, bar.close));
                const bodyH = Math.max(4, botY - topY);
                const isLast = idx === visibleBars.length - 1;

                const strokeColor = isBull
                  ? "var(--color-profit)"
                  : "var(--color-loss)";
                const fillColor = isBull
                  ? "var(--color-profit)"
                  : "var(--color-loss)";

                return (
                  <g key={bar.time}>
                    {/* Active candle highlight halo */}
                    {isLast && (
                      <rect
                        x={cx - 15}
                        y={highY - 8}
                        width={30}
                        height={lowY - highY + 16}
                        rx={8}
                        fill="var(--color-gold)"
                        fillOpacity="0.12"
                        stroke="var(--color-gold)"
                        strokeWidth="1"
                        strokeDasharray="2 2"
                      />
                    )}
                    {/* Wick */}
                    <line
                      x1={cx}
                      y1={highY}
                      x2={cx}
                      y2={lowY}
                      stroke={strokeColor}
                      strokeWidth="2"
                      strokeLinecap="round"
                    />
                    {/* Body */}
                    <rect
                      x={cx - 8}
                      y={topY}
                      width={16}
                      height={bodyH}
                      rx={3}
                      fill={fillColor}
                    />
                    {/* Time label */}
                    <text
                      x={cx}
                      y={240}
                      textAnchor="middle"
                      fontSize="9.5"
                      fill={isLast ? "var(--color-ink)" : "var(--color-faint)"}
                      fontWeight={isLast ? "700" : "400"}
                      style={{ fontFamily: "var(--font-mono)" }}
                    >
                      {bar.time}
                    </text>
                    {/* Callout pill on key candles */}
                    {bar.note && (
                      <g>
                        <rect
                          x={cx - 32}
                          y={highY - 24}
                          width={64}
                          height={15}
                          rx={4}
                          fill="var(--color-raised)"
                          stroke="var(--color-line-strong)"
                        />
                        <text
                          x={cx}
                          y={highY - 14}
                          textAnchor="middle"
                          fontSize="8.5"
                          fontWeight="600"
                          fill="var(--color-ink)"
                          style={{ fontFamily: "var(--font-mono)" }}
                        >
                          {bar.note}
                        </text>
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>

          {/* Bottom Market Structure Context Bar */}
          <div className="border-t border-line bg-surface px-5 py-4 sm:px-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <p className="text-[13.5px] leading-snug text-muted">
                <strong className="font-semibold text-ink">Tape Readout:</strong>{" "}
                {currentRound.marketContext}
              </p>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  type="button"
                  disabled={activeStep === 0}
                  onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                  className="rounded-full border border-line-strong bg-raised px-3.5 py-1.5 font-mono text-[11px] font-medium text-ink transition hover:border-gold disabled:opacity-40"
                >
                  ← Prev Tick
                </button>
                <button
                  type="button"
                  disabled={activeStep === TAPE_ROUNDS.length - 1}
                  onClick={() =>
                    setActiveStep((s) => Math.min(TAPE_ROUNDS.length - 1, s + 1))
                  }
                  className="rounded-full border border-line-strong bg-raised px-3.5 py-1.5 font-mono text-[11px] font-medium text-ink transition hover:border-gold disabled:opacity-40"
                >
                  Next Tick →
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: Inner Voice Temptation Card & Playable Decision Buttons */}
        <div className="lp-game-card flex flex-col justify-between p-5 sm:p-7 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between border-b border-line pb-3.5">
              <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                TICK {currentRound.stepNum} OF 05 · {currentRound.timeStamp}
              </span>
              <span className="rounded-full border border-loss/35 bg-loss/10 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-loss">
                {currentRound.innerVoiceType}
              </span>
            </div>

            <h3 className="mt-4 font-display text-[22px] font-semibold leading-tight tracking-[-0.025em] text-ink">
              {currentRound.title}
            </h3>

            {/* Temptation / Inner Whisper Box */}
            <div className="mt-3.5 rounded-2xl border border-gold/35 bg-gold/[0.07] p-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                The Voice in Your Head Right Now:
              </p>
              <p className="mt-1.5 font-serif text-[18.5px] italic leading-snug text-ink">
                {currentRound.innerWhisper}
              </p>
            </div>

            {/* Two Playable Choices */}
            <div className="mt-4 space-y-2.5">
              {/* Option A: Discipline */}
              <button
                type="button"
                onClick={() => handleDecision(activeStep, "discipline")}
                className={`lp-game-tile flex w-full items-start gap-3.5 p-4 text-left ${
                  currentChoice === "discipline"
                    ? "!border-profit !bg-profit/[0.09]"
                    : ""
                }`}
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-bold ${
                    currentChoice === "discipline"
                      ? "bg-profit text-canvas"
                      : "border border-profit/40 bg-profit/10 text-profit"
                  }`}
                >
                  A
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-profit">
                      Disciplined Operator Move
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-profit">
                      +45 XP
                    </span>
                  </div>
                  <p className="mt-0.5 text-[14.5px] font-semibold leading-snug text-ink">
                    {currentRound.disciplineChoice.label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {currentRound.disciplineChoice.sublabel}
                  </p>
                </div>
              </button>

              {/* Option B: Impulse */}
              <button
                type="button"
                onClick={() => handleDecision(activeStep, "impulse")}
                className={`lp-game-tile flex w-full items-start gap-3.5 p-4 text-left ${
                  currentChoice === "impulse"
                    ? "!border-loss !bg-loss/[0.09]"
                    : ""
                }`}
              >
                <span
                  className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-[12px] font-bold ${
                    currentChoice === "impulse"
                      ? "bg-loss text-canvas"
                      : "border border-loss/40 bg-loss/10 text-loss"
                  }`}
                >
                  B
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-loss">
                      Impulse Reflex
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-loss">
                      {currentRound.impulseChoice.composureDelta}% Composure
                    </span>
                  </div>
                  <p className="mt-0.5 text-[14.5px] font-semibold leading-snug text-ink">
                    {currentRound.impulseChoice.label}
                  </p>
                  <p className="mt-0.5 text-[12px] text-muted">
                    {currentRound.impulseChoice.sublabel}
                  </p>
                </div>
              </button>
            </div>

            {/* Instant Outcome Consequence Box */}
            {currentChoice && (
              <div
                className={`mt-4 rounded-2xl border p-3.5 text-[13px] leading-snug ${
                  currentChoice === "discipline"
                    ? "border-profit/45 bg-profit/10 text-ink"
                    : "border-loss/45 bg-loss/10 text-ink"
                }`}
              >
                <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em]">
                  {currentChoice === "discipline" ? (
                    <span className="text-profit">✓ Consequence · Plan Kept</span>
                  ) : (
                    <span className="text-loss">! Consequence · Process Break</span>
                  )}
                </p>
                <p className="mt-1">
                  {currentChoice === "discipline"
                    ? currentRound.disciplineChoice.outcome
                    : currentRound.impulseChoice.outcome}
                </p>
              </div>
            )}
          </div>

          {/* Footer Quote & Next Quest Link */}
          <div className="mt-5 border-t border-line pt-4">
            <blockquote className="font-serif text-[16px] italic text-gold">
              &ldquo;{currentRound.quote}&rdquo;{" "}
              <span className="font-mono text-[10px] not-italic uppercase tracking-[0.1em] text-faint">
                — {currentRound.quoteAuthor}
              </span>
            </blockquote>

            <div className="mt-3 flex items-center justify-between text-[13px]">
              <span className="font-mono text-[11px] text-muted">
                Disciplined Ticks: <strong className="text-profit">{disciplineSteps}/5</strong>
              </span>
              <a
                href="#gap"
                className="group inline-flex items-center gap-1 font-medium text-gold transition-colors hover:text-ink"
              >
                Next: Quest 03 Autopsy X-Ray
                <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

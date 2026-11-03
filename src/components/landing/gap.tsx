"use client";

import { useState } from "react";
import {
  AlertTriangleIcon,
  AwardIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  EyeIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { Eyebrow } from "./ledger";
import { awardGameAction, useLandingGame } from "./game-state";

/* ========================================================================== */
/*  QUEST 03 — THE AUTOPSY X-RAY DETECTIVE GAME (#gap)                        */
/*  Separating Sloppy Wins from Valid Losses using the 5-Question Autopsy     */
/* ========================================================================== */

type VerdictType = "valid_process" | "process_break";

interface AutopsyCase {
  id: string;
  caseNum: string;
  title: string;
  spreadsheetRow: {
    date: string;
    symbol: string;
    side: string;
    pnl: string;
    isGreen: boolean;
    naiveTake: string;
  };
  correctVerdict: VerdictType;
  verdictTitle: string;
  verdictExplanation: string;
  questions: {
    q: string;
    a: string;
    tone: "profit" | "gold" | "loss" | "ink";
    insight: string;
  }[];
  metricBadge: string;
}

const AUTOPSY_CASES: AutopsyCase[] = [
  {
    id: "case-1-sloppy-win",
    caseNum: "CASE 01",
    title: "The +$940 Green Mirage",
    spreadsheetRow: {
      date: "04 Mar · 09:31",
      symbol: "MNQ",
      side: "Long",
      pnl: "+$940 (+1.9R)",
      isGreen: true,
      naiveTake: "Spreadsheet says: Green trade! Great job!",
    },
    correctVerdict: "process_break",
    verdictTitle: "Sloppy Win = Process Break",
    verdictExplanation:
      "Making money on an unconfirmed FOMO entry with 2.5× oversized risk reinforces the exact habit that blows up accounts.",
    metricBadge: "Hidden Risk: 2.5× Oversized FOMO",
    questions: [
      {
        q: "Did you follow the plan?",
        a: "No — Chased 09:31 spike before 5m close",
        tone: "loss",
        insight: "Entered 4 minutes before the 5-minute candle closed without a liquidity sweep.",
      },
      {
        q: "What were you feeling?",
        a: "Urgency & Fear of Missing Out",
        tone: "gold",
        insight: "Heart rate spiked watching fast green ticks at the opening bell.",
      },
      {
        q: "Was it good process, whatever the result?",
        a: "Process failure on entry & sizing",
        tone: "loss",
        insight: "Risked 2.5R on an unconfirmed candle. A lucky payout does not make a valid decision.",
      },
      {
        q: "What was the mistake, or the lesson?",
        a: "Rewarded bad behaviour with a green number",
        tone: "ink",
        insight: "Dangerous positive reinforcement—logged to prevent tomorrow's blowup.",
      },
      {
        q: "What will you watch next time?",
        a: "Hands off mouse until 09:35 5m close",
        tone: "profit",
        insight: "Queued into Matrix Arena · Opening Bell Restraint Drill.",
      },
    ],
  },
  {
    id: "case-2-valid-loss",
    caseNum: "CASE 02",
    title: "The −$350 Textbook Stop-Out",
    spreadsheetRow: {
      date: "06 Mar · 09:40",
      symbol: "ES",
      side: "Long",
      pnl: "−$350 (−1.0R)",
      isGreen: false,
      naiveTake: "Spreadsheet says: Red trade! Something went wrong!",
    },
    correctVerdict: "valid_process",
    verdictTitle: "Clean Rules = Valid Edge Expense",
    verdictExplanation:
      "Even an 84% win-rate edge loses 16% of the time. Honouring your exact 1.0R stop without flinching is an A+ operator performance.",
    metricBadge: "100% Plan Adherence · A+ Loss",
    questions: [
      {
        q: "Did you follow the plan?",
        a: "Yes — Exact overnight sweep + 5m close",
        tone: "profit",
        insight: "All 4 playbook checklist gates were verified before order entry.",
      },
      {
        q: "What were you feeling?",
        a: "Calm, composed, accepted the 1.0R risk",
        tone: "profit",
        insight: "Zero hesitation on entry; zero negotiation when price hit invalidation.",
      },
      {
        q: "Was it good process, whatever the result?",
        a: "100% Clean Process — Valid Loss",
        tone: "profit",
        insight: "Edgebook scores this session as a process win so you never abandon a working edge.",
      },
      {
        q: "What was the mistake, or the lesson?",
        a: "No mistake — normal statistical variance",
        tone: "ink",
        insight: "A losing trade with clean rules is simply the business overhead of trading.",
      },
      {
        q: "What will you watch next time?",
        a: "Execute the exact same setup tomorrow",
        tone: "gold",
        insight: "Confidence protected. Zero strategy-hopping triggered.",
      },
    ],
  },
  {
    id: "case-3-early-choke",
    caseNum: "CASE 03",
    title: "The +$60 Breakeven Choke",
    spreadsheetRow: {
      date: "08 Mar · 09:39",
      symbol: "MNQ",
      side: "Long",
      pnl: "+$60 (+0.1R)",
      isGreen: true,
      naiveTake: "Spreadsheet says: Harmless scratch trade, no big deal.",
    },
    correctVerdict: "process_break",
    verdictTitle: "Fear Exit = −3.1R Opportunity Cost",
    verdictExplanation:
      "A normal spreadsheet ignores what happened after you exited. Edgebook's autopsy reveals that choking your stop early cost you a +3.2R winner.",
    metricBadge: "Cost of Fear: −3.1R Missed",
    questions: [
      {
        q: "Did you follow the plan?",
        a: "Entry matched thesis · Broke exit rule",
        tone: "gold",
        insight: "Overnight low swept at 09:32 NY and reclaimed on the 5m close.",
      },
      {
        q: "What were you feeling?",
        a: "Calm at entry, then rushed on 1m red bar",
        tone: "gold",
        insight: "Watched live dollar P&L flicker from +$800 to +$300 and panicked.",
      },
      {
        q: "Was it good process, whatever the result?",
        a: "Process failure on exit management",
        tone: "loss",
        insight: "Breaking your exit rule out of fear is logged as a process break.",
      },
      {
        q: "What was the mistake, or the lesson?",
        a: "Moved the stop early to breakeven",
        tone: "loss",
        insight: "Price wicked breakeven to the tick and ran +3.2R ($3,200) to target without you.",
      },
      {
        q: "What will you watch next time?",
        a: "Hide dollar P&L · Wait for 5m close",
        tone: "profit",
        insight: "Queued into your evening Time Machine practice feed until retired.",
      },
    ],
  },
];

export function Gap() {
  const game = useLandingGame();

  const [activeCaseIdx, setActiveCaseIdx] = useState(0);
  const [scannedQIdx, setScannedQIdx] = useState(2);
  const [verdicts, setVerdicts] = useState<Record<string, VerdictType>>({});

  const currentCase = AUTOPSY_CASES[activeCaseIdx] ?? AUTOPSY_CASES[0]!;
  const playerVerdict = verdicts[currentCase.id];
  const isCurrentCorrect = playerVerdict === currentCase.correctVerdict;

  const solvedCount = AUTOPSY_CASES.filter(
    (c) => verdicts[c.id] === c.correctVerdict,
  ).length;

  const submitVerdict = (caseItem: AutopsyCase, choice: VerdictType) => {
    const isCorrect = choice === caseItem.correctVerdict;
    const nextVerdicts = { ...verdicts, [caseItem.id]: choice };
    setVerdicts(nextVerdicts);

    const allSolved = AUTOPSY_CASES.every(
      (c) => nextVerdicts[c.id] === c.correctVerdict,
    );

    if (isCorrect) {
      awardGameAction({
        xpDelta: 55,
        composureDelta: 5,
        equityDelta: 450,
        streakIncrement: true,
        questId: allSolved ? "q3_autopsy" : undefined,
        title: `${caseItem.caseNum} Solved: ${caseItem.verdictTitle}`,
        subtitle: caseItem.verdictExplanation,
        tone: "profit",
      });
    } else {
      awardGameAction({
        composureDelta: -5,
        streakReset: true,
        title: `${caseItem.caseNum} Misdiagnosed`,
        subtitle: "Look past the dollar P&L—inspect the 5-Question X-Ray on the right!",
        tone: "loss",
      });
    }
  };

  const toneBadgeClass = (tone: "profit" | "gold" | "loss" | "ink") => {
    if (tone === "profit") return "text-profit bg-profit/10 border-profit/30";
    if (tone === "gold") return "text-gold bg-gold/10 border-gold/30";
    if (tone === "loss") return "text-loss bg-loss/10 border-loss/30";
    return "text-ink bg-ink/[0.06] border-line-strong";
  };

  return (
    <section
      id="gap"
      className="lp-wide py-16 sm:py-24"
      aria-labelledby="gap-title"
    >
      {/* Top Section Header */}
      <div className="mb-8 flex flex-col justify-between gap-6 border-t border-line pt-10 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Eyebrow n="03">QUEST 03 · THE AUTOPSY X-RAY DETECTIVE</Eyebrow>
            {game.questsCompleted.q3_autopsy && (
              <span className="inline-flex items-center gap-1 rounded-full border border-profit/40 bg-profit/12 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-profit">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                QUEST 03 CLEARED
              </span>
            )}
          </div>
          <h2
            id="gap-title"
            className="mt-3 font-display text-[clamp(2rem,4.4vw,3.6rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
          >
            A normal journal logs the result.{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              Yours should log the decision.
            </span>
          </h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">
            A spreadsheet only sees green or red dollars. Inspect the <strong className="font-semibold text-ink">3 Trade Cases</strong> below using Edgebook&apos;s 5-Question X-Ray and judge whether each trade was <strong className="font-medium text-profit">Valid Process</strong> or a <strong className="font-medium text-loss">Process Break</strong>.
          </p>
        </div>

        {/* Case Progress Pill */}
        <div className="panel flex items-center gap-4 px-5 py-3.5">
          <EyeIcon className="h-5 w-5 text-gold" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
              Autopsy Detective Score
            </p>
            <p className="font-display text-[16px] font-semibold text-ink">
              <span className="num text-profit">{solvedCount}</span> / 3 Cases Diagnosed
            </p>
          </div>
        </div>
      </div>

      {/* 3 Case Dossier Tabs */}
      <div
        className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3"
        role="tablist"
        aria-label="Three Trade Autopsy Cases"
      >
        {AUTOPSY_CASES.map((c, idx) => {
          const isSelected = idx === activeCaseIdx;
          const v = verdicts[c.id];
          const solved = v === c.correctVerdict;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={isSelected}
              onClick={() => setActiveCaseIdx(idx)}
              className={`flex flex-col justify-between rounded-[22px] border p-4 text-left transition ${
                isSelected
                  ? "border-gold bg-raised shadow-[var(--shadow-rest)]"
                  : "border-line bg-surface hover:border-line-strong"
              }`}
            >
              <div className="flex w-full items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em]">
                <span className={isSelected ? "font-bold text-gold" : "text-faint"}>
                  {c.caseNum} · {c.spreadsheetRow.symbol}
                </span>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                    solved
                      ? "bg-profit/15 text-profit"
                      : v
                        ? "bg-loss/15 text-loss"
                        : "bg-ink/[0.06] text-muted"
                  }`}
                >
                  {solved ? "✓ SOLVED" : v ? "! RETRY" : "INSPECT"}
                </span>
              </div>

              <p className="mt-1.5 font-display text-[16px] font-semibold text-ink">
                {c.title}
              </p>

              <div className="mt-2 flex items-center justify-between border-t border-line pt-2 font-mono text-[11.5px]">
                <span className="text-muted">{c.spreadsheetRow.date}</span>
                <span
                  className={`font-semibold ${
                    c.spreadsheetRow.isGreen ? "text-profit" : "text-loss"
                  }`}
                >
                  {c.spreadsheetRow.pnl}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Main Split Detective Workspace: Left 5 Cols (Spreadsheet Illusion + Verdict Judge) | Right 7 Cols (5-Question X-Ray Ledger) */}
      <div className="grid items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
        {/* LEFT 5 COLS: Normal Spreadsheet Illusion vs Operator Verdict Controls */}
        <div className="lp-game-card flex flex-col justify-between p-5 sm:p-7 lg:col-span-5">
          <div>
            <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
              {currentCase.caseNum} · {currentCase.title}
            </p>

            {/* 1. What a Normal Spreadsheet Sees */}
            <div className="mt-3 rounded-2xl border border-dashed border-line-strong bg-canvas/70 p-4">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                <span>1. What a Normal Spreadsheet Logs</span>
                <span className="text-loss">Surface Only</span>
              </div>
              <div className="mt-2.5 flex items-center justify-between rounded-xl border border-line bg-surface px-3.5 py-2.5 font-mono text-[13px]">
                <span className="text-ink">
                  {currentCase.spreadsheetRow.date} · {currentCase.spreadsheetRow.symbol}{" "}
                  {currentCase.spreadsheetRow.side}
                </span>
                <strong
                  className={
                    currentCase.spreadsheetRow.isGreen ? "text-profit" : "text-loss"
                  }
                >
                  {currentCase.spreadsheetRow.pnl}
                </strong>
              </div>
              <p className="mt-2 text-[12.5px] italic text-muted">
                {currentCase.spreadsheetRow.naiveTake}
              </p>
            </div>

            {/* 2. Cast Your Operator Verdict */}
            <div className="mt-5">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink">
                  2. Cast Your Autopsy Verdict (+55 XP)
                </p>
                <span className="font-mono text-[10px] text-muted">
                  Read X-Ray →
                </span>
              </div>
              <p className="mt-1 text-[13.5px] text-muted">
                After reading the 5-Question X-Ray on the right, how should Edgebook classify this trade?
              </p>

              <div className="mt-3.5 grid grid-cols-1 gap-2.5">
                <button
                  type="button"
                  onClick={() => submitVerdict(currentCase, "valid_process")}
                  className={`lp-game-tile flex items-center justify-between gap-3 p-4 text-left ${
                    playerVerdict === "valid_process"
                      ? isCurrentCorrect
                        ? "!border-profit !bg-profit/10"
                        : "!border-loss !bg-loss/10"
                      : ""
                  }`}
                >
                  <div>
                    <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-profit">
                      [Verdict A] · Valid Process
                    </span>
                    <span className="mt-0.5 block text-[14.5px] font-semibold text-ink">
                      Clean Rules Kept — Protect Confidence
                    </span>
                  </div>
                  <CheckCircleIcon className="h-5 w-5 shrink-0 text-profit" />
                </button>

                <button
                  type="button"
                  onClick={() => submitVerdict(currentCase, "process_break")}
                  className={`lp-game-tile flex items-center justify-between gap-3 p-4 text-left ${
                    playerVerdict === "process_break"
                      ? isCurrentCorrect
                        ? "!border-profit !bg-profit/10"
                        : "!border-loss !bg-loss/10"
                      : ""
                  }`}
                >
                  <div>
                    <span className="block font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-loss">
                      [Verdict B] · Process Break
                    </span>
                    <span className="mt-0.5 block text-[14.5px] font-semibold text-ink">
                      Rule Broken — Queue Mistake for Practice
                    </span>
                  </div>
                  <AlertTriangleIcon className="h-5 w-5 shrink-0 text-loss" />
                </button>
              </div>
            </div>

            {/* Verdict Explanation Box */}
            {playerVerdict && (
              <div
                className={`mt-4 rounded-2xl border p-4 text-[13px] leading-snug ${
                  isCurrentCorrect
                    ? "border-profit/45 bg-profit/10 text-ink"
                    : "border-loss/45 bg-loss/10 text-ink"
                }`}
              >
                <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em]">
                  {isCurrentCorrect ? (
                    <span className="text-profit">
                      ✓ Correct Diagnosis · {currentCase.verdictTitle}
                    </span>
                  ) : (
                    <span className="text-loss">
                      ! Look Closer at the 5-Question X-Ray
                    </span>
                  )}
                </p>
                <p className="mt-1">{currentCase.verdictExplanation}</p>
              </div>
            )}
          </div>

          {/* Bottom Case Switcher & Quote */}
          <div className="mt-5 border-t border-line pt-4">
            <blockquote className="font-serif text-[16.5px] italic text-gold">
              &ldquo;An unexamined trade is a tuition fee paid for nothing. Name the mistake once so you never pay for it twice.&rdquo;
            </blockquote>
            <div className="mt-3 flex items-center justify-between">
              <button
                type="button"
                onClick={() =>
                  setActiveCaseIdx((activeCaseIdx + 1) % AUTOPSY_CASES.length)
                }
                className="inline-flex h-9 items-center gap-1 rounded-full border border-line-strong bg-raised px-4 font-mono text-[11px] font-semibold text-ink transition hover:border-gold"
              >
                Inspect Next Case ({((activeCaseIdx + 1) % 3) + 1}/3) →
              </button>
              <a
                href="#toolkit"
                className="group inline-flex items-center gap-1 text-[13.5px] font-medium text-gold transition-colors hover:text-ink"
              >
                Quest 04: Arenas
                <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </div>

        {/* RIGHT 7 COLS: Interactive 5-Question Autopsy X-Ray Scanner Ledger */}
        <div className="lp-game-card relative flex flex-col justify-between overflow-hidden lg:col-span-7">
          {/* Red Archival Ledger Margin Rule */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-12 w-px bg-loss/25 sm:left-16"
          />

          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-canvas/70 px-5 py-4 pl-16 sm:px-6 sm:pl-20">
            <div>
              <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                EDGEBOOK 5-QUESTION AUTOPSY X-RAY · {currentCase.caseNum}
              </p>
              <p className="text-[12px] text-muted">
                Click any question below to inspect the psychological telemetry
              </p>
            </div>
            <span className="rounded-full border border-gold/40 bg-gold/10 px-3 py-1 font-mono text-[10.5px] font-semibold text-gold">
              {currentCase.metricBadge}
            </span>
          </div>

          <ol className="divide-y divide-line">
            {currentCase.questions.map((item, i) => {
              const isScanned = i === scannedQIdx;
              return (
                <li
                  key={item.q}
                  onClick={() => setScannedQIdx(i)}
                  onMouseEnter={() => setScannedQIdx(i)}
                  className={`cursor-pointer py-4 pr-5 transition-colors duration-150 sm:pr-6 ${
                    isScanned ? "bg-gold/[0.07]" : "hover:bg-ink/[0.02]"
                  }`}
                >
                  <div className="grid grid-cols-[2.75rem_1fr] items-center gap-x-4 sm:grid-cols-[3.75rem_1fr_auto]">
                    <span
                      className={`pl-4 font-mono text-[13px] sm:pl-6 ${
                        isScanned ? "font-bold text-gold" : "text-faint"
                      }`}
                    >
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <p className="pl-2 font-display text-[clamp(1.02rem,1.4vw,1.2rem)] font-semibold leading-snug tracking-[-0.02em] text-ink sm:pl-4">
                        {item.q}
                      </p>
                      <p className="mt-1 pl-2 text-[13px] leading-snug text-muted sm:pl-4">
                        {item.insight}
                      </p>
                    </div>
                    <span
                      className={`col-start-2 mt-2 w-fit rounded-full border px-3 py-1 text-[12px] font-medium sm:col-start-3 sm:mt-0 ${toneBadgeClass(
                        item.tone,
                      )}`}
                    >
                      {item.a}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/60 px-5 py-3.5 pl-16 text-[12.5px] text-muted sm:px-6 sm:pl-20">
            <span>
              Three-minute reflection complete ·{" "}
              <strong className="font-medium text-ink">
                Indexed locally &amp; in Google Drive
              </strong>
            </span>
            <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-gold">
              <SparklesIcon className="h-3.5 w-3.5" />
              Feeds Quest 04 Arenas →
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

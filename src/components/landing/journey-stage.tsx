"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AwardIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  FlameIcon,
  ShieldIcon,
  SparklesIcon,
  TargetIcon,
} from "@/components/ui/icons";
import { Eyebrow } from "./ledger";
import {
  awardGameAction,
  getRankForXp,
  useLandingGame,
} from "./game-state";

/* ========================================================================== */
/*  QUEST 01 — THE PRE-BELL INTENTION BUILDER GAME (#top)                     */
/*  100% Edgebook Theme & Fonts (Inter Variable, Instrument Serif, JetBrains) */
/* ========================================================================== */

type ChoiceType = "discipline" | "impulse";

interface LoadoutSlot {
  id: string;
  code: string;
  label: string;
  prompt: string;
  discipline: {
    title: string;
    ledgerLine: string;
    oddsBonus: number;
    note: string;
  };
  impulse: {
    title: string;
    ledgerLine: string;
    oddsPenalty: number;
    warning: string;
  };
}

const LOADOUT_SLOTS: LoadoutSlot[] = [
  {
    id: "thesis",
    code: "SLOT 01 · THESIS",
    label: "Session Thesis",
    prompt: "08:45 AM — What is the single scenario you are waiting for?",
    discipline: {
      title: "Overnight low sweep + 5m close reclaim",
      ledgerLine: "Wait for overnight low liquidity sweep and a confirmed 5-minute close back inside range.",
      oddsBonus: 22,
      note: "Eliminates opening-bell impulse chasing.",
    },
    impulse: {
      title: "Buy whichever candle moves fastest at 09:30",
      ledgerLine: "No specific setup — react to fast green candles after the bell.",
      oddsPenalty: -24,
      warning: "Impulse Trap: Unwritten setups turn every random tick into temptation.",
    },
  },
  {
    id: "invalidation",
    code: "SLOT 02 · INVALIDATION",
    label: "Invalidation & Stop",
    prompt: "Where is your thesis objectively wrong before entry?",
    discipline: {
      title: "Hard stop 2 ticks below sweep wick (1.0R)",
      ledgerLine: "Hard structural stop 2 ticks below the sweep low; risk fixed at 1.0R.",
      oddsBonus: 21,
      note: "Pre-committed exit removes in-trade negotiation.",
    },
    impulse: {
      title: "Mental stop — adjust it live by feel",
      ledgerLine: "No hard stop in system — watch price and decide manually.",
      oddsPenalty: -26,
      warning: "Impulse Trap: Mental stops bend the moment a red candle prints.",
    },
  },
  {
    id: "guardrail",
    code: "SLOT 03 · GUARDRAIL",
    label: "Session Circuit Breaker",
    prompt: "How do you protect your morning gains and survival ceiling?",
    discipline: {
      title: "Max 2 trades · Stop after 1st clean Friday win",
      ledgerLine: "Circuit breaker: Stop for the day after 2 losses or first clean Friday winner.",
      oddsBonus: 20,
      note: "Prevents Friday euphoria givebacks and revenge loops.",
    },
    impulse: {
      title: "Double size after a loss to win it back",
      ledgerLine: "Martingale size if trade 1 loses; keep trading until green.",
      oddsPenalty: -28,
      warning: "Impulse Trap: Revenge sizing is the #1 destroyer of funded accounts.",
    },
  },
  {
    id: "headspace",
    code: "SLOT 04 · HEADSPACE",
    label: "Internal State & Display",
    prompt: "How is your mind configured before the bell?",
    discipline: {
      title: "Rested · Calm · Dollar P&L hidden (R only)",
      ledgerLine: "State: Calm & rested (8h). Display locked to R-multiples so dollar swings don't trigger fear.",
      oddsBonus: 21,
      note: "Historical journal shows 84% clean process when rested in R-mode.",
    },
    impulse: {
      title: "Rushed · Watching live dollar P&L every tick",
      ledgerLine: "State: Urgent to make money today. Watching live dollar P&L tick-by-tick.",
      oddsPenalty: -20,
      warning: "Impulse Trap: Watching dollar P&L increases premature stop-choking by 70%.",
    },
  },
];

export function JourneyStage() {
  const game = useLandingGame();
  const { rank } = getRankForXp(game.xp);

  const [selections, setSelections] = useState<Record<string, ChoiceType>>({
    thesis: "discipline",
    invalidation: "discipline",
    guardrail: "discipline",
    headspace: "discipline",
  });
  const [activeSlotIdx, setActiveSlotIdx] = useState(0);
  const [sealed, setSealed] = useState(false);

  const disciplineCount = Object.values(selections).filter(
    (v) => v === "discipline",
  ).length;
  const impulseCount = 4 - disciplineCount;

  const calculatedOdds = Math.max(
    12,
    Math.min(
      94,
      LOADOUT_SLOTS.reduce((acc, slot) => {
        const pick = selections[slot.id] ?? "discipline";
        return acc + (pick === "discipline" ? slot.discipline.oddsBonus : slot.impulse.oddsPenalty);
      }, 10),
    ),
  );

  const handleSelectChoice = (slotId: string, choice: ChoiceType, idx: number) => {
    setActiveSlotIdx(idx);
    setSelections((prev) => {
      if (prev[slotId] === choice) return prev;
      const next = { ...prev, [slotId]: choice };
      awardGameAction({
        xpDelta: choice === "discipline" ? 15 : 0,
        composureDelta: choice === "discipline" ? 3 : -6,
        title:
          choice === "discipline"
            ? `${LOADOUT_SLOTS[idx]?.label}: Rule Armed`
            : `${LOADOUT_SLOTS[idx]?.label}: Impulse Trap Selected`,
        subtitle:
          choice === "discipline"
            ? LOADOUT_SLOTS[idx]?.discipline.note ?? ""
            : LOADOUT_SLOTS[idx]?.impulse.warning ?? "",
        tone: choice === "discipline" ? "profit" : "loss",
      });
      return next;
    });
  };

  const handleSealPlan = () => {
    if (disciplineCount < 4) {
      awardGameAction({
        composureDelta: -5,
        streakReset: true,
        title: "Impulse Traps Detected!",
        subtitle: `Clean the ${impulseCount} red impulse trap(s) in your plan before sealing in ink.`,
        tone: "loss",
      });
      return;
    }

    setSealed(true);
    awardGameAction({
      xpDelta: 50,
      composureDelta: 8,
      equityDelta: 1500,
      streakIncrement: true,
      questId: "q1_plan",
      title: "Pre-Bell Ledger Sealed in Ink",
      subtitle: "84% Historical Process Odds locked. Ready for the 09:30 NY Open!",
      tone: "profit",
    });
  };

  const loadPreset = (mode: "discipline" | "impulse") => {
    setSelections({
      thesis: mode,
      invalidation: mode,
      guardrail: mode,
      headspace: mode,
    });
    if (mode === "impulse") setSealed(false);
    awardGameAction({
      composureDelta: mode === "discipline" ? 6 : -12,
      title:
        mode === "discipline"
          ? "Sovereign Loadout Equipped"
          : "Impulse Gambler Loadout Equipped",
      subtitle:
        mode === "discipline"
          ? "All 4 pre-session rules aligned with your playbook."
          : "Notice how your historical process odds collapse to 12%.",
      tone: mode === "discipline" ? "profit" : "loss",
    });
  };

  const questDone = game.questsCompleted.q1_plan || sealed;

  return (
    <section
      id="top"
      className="lp-wide relative pb-16 pt-22 sm:pb-24 sm:pt-28"
      aria-label="Quest 01 — The Pre-Bell Intention Builder Game"
    >
      {/* Top Ambient Theme Wash */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[440px]"
        style={{
          background:
            "radial-gradient(920px 380px at 50% 0%, color-mix(in srgb, var(--gold) 12%, transparent), transparent 72%)",
        }}
      />

      {/* Game Hero Banner & Live Player Telemetry Bar */}
      <div className="relative z-10 mb-8 flex flex-col justify-between gap-6 border-b border-line pb-8 lg:flex-row lg:items-end">
        <div className="max-w-3xl">
          <div className="flex flex-wrap items-center gap-2.5">
            <Eyebrow n="01">QUEST 01 · 08:45 AM PRE-BELL RITUAL</Eyebrow>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-3 py-0.5 font-mono text-[10.5px] font-semibold uppercase tracking-[0.1em] text-gold">
              <SparklesIcon className="h-3 w-3" />
              Interactive Trading Process Game
            </span>
          </div>

          <h1 className="mt-4 font-display text-[clamp(2.25rem,4.6vw,4.1rem)] font-semibold leading-[1.02] tracking-[-0.044em] text-ink">
            Most journals record the result.{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              Edgebook records the decision.
            </span>
          </h1>

          <p className="mt-4 max-w-2xl text-[16px] leading-relaxed text-muted">
            Welcome to <strong className="font-semibold text-ink">The Operator&apos;s Trial</strong>. Instead of reading a static page, play through a full session right here: lock your pre-bell plan, trade the 09:30 open, X-ray your autopsies, battle in the 5 practice arenas, and grow your ledger from{" "}
            <span className="num font-semibold text-ink">$10,000</span> to{" "}
            <span className="num font-semibold text-profit">$20,000</span>.
          </p>
        </div>

        {/* Player Quick Scorecard Card */}
        <div className="panel flex shrink-0 flex-wrap items-center gap-4 px-5 py-4 sm:gap-6">
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Operator Rank
            </p>
            <p className="mt-1 font-display text-[16px] font-semibold text-ink">
              Lvl {rank.level} · <span className="text-gold">{rank.title}</span>
            </p>
          </div>
          <div className="h-8 w-px bg-line" aria-hidden="true" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Session Equity
            </p>
            <p className="kpi mt-1 text-[22px] tabular-nums text-profit">
              ${game.equity.toLocaleString()}
            </p>
          </div>
          <div className="h-8 w-px bg-line" aria-hidden="true" />
          <div>
            <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-faint">
              Quests Cleared
            </p>
            <p className="kpi mt-1 text-[22px] tabular-nums text-ink">
              {Object.values(game.questsCompleted).filter(Boolean).length}
              <span className="text-[15px] text-faint"> / 6</span>
            </p>
          </div>
        </div>
      </div>

      {/* Main Split Game Arena: Left 7 Cols (4-Slot Loadout Builder) | Right 5 Cols (Live Archival Ledger) */}
      <div className="relative z-10 grid items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
        {/* LEFT 7 COLS: Interactive 4-Slot Pre-Session Loadout Builder */}
        <div className="lp-game-card flex flex-col justify-between p-5 sm:p-7 lg:col-span-7">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-4">
              <div>
                <span className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                  STEP 1 · CONFIGURE YOUR 4 PRE-BELL RULES
                </span>
                <p className="mt-0.5 text-[13.5px] text-muted">
                  Choose <strong className="font-medium text-profit">Disciplined Rules</strong> or test what happens when you equip <strong className="font-medium text-loss">Impulse Traps</strong>.
                </p>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => loadPreset("discipline")}
                  className="rounded-full border border-profit/40 bg-profit/10 px-3 py-1 font-mono text-[10.5px] font-semibold text-profit transition hover:bg-profit/20"
                >
                  All Discipline
                </button>
                <button
                  type="button"
                  onClick={() => loadPreset("impulse")}
                  className="rounded-full border border-loss/35 bg-loss/10 px-3 py-1 font-mono text-[10.5px] font-semibold text-loss transition hover:bg-loss/20"
                >
                  Test Impulse
                </button>
              </div>
            </div>

            {/* 4 Loadout Slots */}
            <div className="mt-5 space-y-3.5">
              {LOADOUT_SLOTS.map((slot, idx) => {
                const pick = selections[slot.id] ?? "discipline";
                const isFocused = activeSlotIdx === idx;
                return (
                  <div
                    key={slot.id}
                    onMouseEnter={() => setActiveSlotIdx(idx)}
                    className={`rounded-[20px] border p-4 transition-colors duration-150 ${
                      isFocused
                        ? "border-line-strong bg-raised shadow-[var(--shadow-rest)]"
                        : "border-line bg-canvas/55"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.12em] text-gold">
                        {slot.code} · {slot.label}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 font-mono text-[10px] font-semibold ${
                          pick === "discipline"
                            ? "bg-profit/12 text-profit"
                            : "bg-loss/12 text-loss"
                        }`}
                      >
                        {pick === "discipline"
                          ? `+${slot.discipline.oddsBonus}% Process Odds`
                          : `${slot.impulse.oddsPenalty}% Impulse Penalty`}
                      </span>
                    </div>

                    <p className="mt-1 text-[13.5px] font-medium text-ink">
                      {slot.prompt}
                    </p>

                    <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {/* Discipline Option */}
                      <button
                        type="button"
                        onClick={() => handleSelectChoice(slot.id, "discipline", idx)}
                        className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition ${
                          pick === "discipline"
                            ? "border-profit/60 bg-profit/[0.09] text-ink shadow-[var(--shadow-rest)]"
                            : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold ${
                            pick === "discipline"
                              ? "bg-profit text-canvas"
                              : "border border-line-strong bg-raised text-faint"
                          }`}
                        >
                          ✓
                        </span>
                        <div className="min-w-0">
                          <span className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-profit">
                            Disciplined Rule
                          </span>
                          <span className="mt-0.5 block text-[13px] font-medium leading-snug text-ink">
                            {slot.discipline.title}
                          </span>
                        </div>
                      </button>

                      {/* Impulse Trap Option */}
                      <button
                        type="button"
                        onClick={() => handleSelectChoice(slot.id, "impulse", idx)}
                        className={`flex items-start gap-2.5 rounded-2xl border p-3 text-left transition ${
                          pick === "impulse"
                            ? "border-loss/60 bg-loss/[0.09] text-ink shadow-[var(--shadow-rest)]"
                            : "border-line bg-surface text-muted hover:border-line-strong hover:text-ink"
                        }`}
                      >
                        <span
                          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-bold ${
                            pick === "impulse"
                              ? "bg-loss text-canvas"
                              : "border border-line-strong bg-raised text-faint"
                          }`}
                        >
                          !
                        </span>
                        <div className="min-w-0">
                          <span className="block font-mono text-[9.5px] font-semibold uppercase tracking-[0.1em] text-loss">
                            Impulse Trap
                          </span>
                          <span className="mt-0.5 block text-[13px] font-medium leading-snug text-ink">
                            {slot.impulse.title}
                          </span>
                        </div>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4 text-[13px] text-muted">
            <span>
              When your rules are written in calm, the market cannot rewrite them in noise.
            </span>
            <span className="font-mono text-[11px] font-semibold text-gold">
              {disciplineCount}/4 Disciplined Slots Active
            </span>
          </div>
        </div>

        {/* RIGHT 5 COLS: Live Archival Ledger Sheet & Seal Trigger */}
        <div className="lp-game-card flex flex-col justify-between overflow-hidden lg:col-span-5">
          {/* Top Ledger Header Bar */}
          <div className="flex items-center justify-between border-b border-line bg-canvas/70 px-6 py-4">
            <div>
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
                LIVE ARCHIVAL LEDGER · SESSION #048
              </p>
              <p className="text-[12.5px] text-muted">
                08:45 AM NY · Pre-Session Intention Sheet
              </p>
            </div>
            <span
              className={`rounded-full border px-3 py-1 font-mono text-[10.5px] font-semibold ${
                questDone && impulseCount === 0
                  ? "border-profit/45 bg-profit/12 text-profit"
                  : impulseCount > 0
                    ? "border-loss/45 bg-loss/12 text-loss"
                    : "border-gold/45 bg-gold/12 text-gold"
              }`}
            >
              {questDone && impulseCount === 0
                ? "✓ LOCKED IN INK"
                : impulseCount > 0
                  ? `${impulseCount} IMPULSE TRAP(S)`
                  : "READY TO SEAL"}
            </span>
          </div>

          {/* Ruled Archival Ledger Body with Red Margin Line */}
          <div className="lp-ledger-sheet relative flex-1 px-6 py-6 pl-14 sm:pl-16">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-y-0 left-10 w-px bg-loss/30 sm:left-12"
            />

            {/* Live Process Odds Gauge */}
            <div className="mb-5 rounded-2xl border border-line-strong bg-surface p-4 shadow-[var(--shadow-rest)]">
              <div className="flex items-baseline justify-between gap-2">
                <span className="font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
                  Historical Clean-Process Odds
                </span>
                <span
                  className={`kpi text-[28px] tabular-nums ${
                    calculatedOdds >= 75
                      ? "text-profit"
                      : calculatedOdds >= 45
                        ? "text-gold"
                        : "text-loss"
                  }`}
                >
                  {calculatedOdds}%
                </span>
              </div>
              <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/[0.08]">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${
                    calculatedOdds >= 75
                      ? "bg-profit"
                      : calculatedOdds >= 45
                        ? "bg-gold-strong"
                        : "bg-loss"
                  }`}
                  style={{ width: `${calculatedOdds}%` }}
                />
              </div>
              <p className="mt-2 text-[12px] text-muted">
                {impulseCount === 0
                  ? "Optimal pre-session alignment. All 4 guardrails verified against your historical edge."
                  : `Warning: ${impulseCount} unwritten or impulsive rule(s) detected. Clean them to maximize composure.`}
              </p>
            </div>

            {/* Written Ledger Lines */}
            <div className="space-y-3.5">
              {LOADOUT_SLOTS.map((slot) => {
                const pick = selections[slot.id] ?? "discipline";
                const text =
                  pick === "discipline"
                    ? slot.discipline.ledgerLine
                    : slot.impulse.ledgerLine;
                return (
                  <div
                    key={slot.id}
                    className="rounded-xl border border-line bg-surface/90 px-3.5 py-2.5"
                  >
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
                      <span className="text-faint">{slot.label}</span>
                      <span
                        className={
                          pick === "discipline"
                            ? "font-semibold text-profit"
                            : "font-semibold text-loss"
                        }
                      >
                        {pick === "discipline" ? "● Rule Set" : "▲ Trap Active"}
                      </span>
                    </div>
                    <p
                      className={`mt-1 font-serif text-[17px] italic leading-snug ${
                        pick === "discipline" ? "text-ink" : "text-loss"
                      }`}
                    >
                      &ldquo;{text}&rdquo;
                    </p>
                  </div>
                );
              })}
            </div>

            {/* Philosophical Margin Quote */}
            <blockquote className="mt-5 border-l-2 border-gold pl-3.5">
              <p className="font-serif text-[16px] italic text-muted">
                &ldquo;Write your intention in calm so volatility cannot rewrite it in panic.&rdquo;
              </p>
            </blockquote>
          </div>

          {/* Bottom Seal Action Footer */}
          <div className="border-t border-line bg-surface p-5 sm:p-6">
            <div className="flex flex-col gap-3">
              <button
                type="button"
                onClick={handleSealPlan}
                className={`inline-flex h-12 w-full items-center justify-center gap-2 rounded-full px-6 text-[15px] font-semibold transition duration-200 active:scale-[0.98] ${
                  questDone && impulseCount === 0
                    ? "border border-profit/50 bg-profit/15 text-profit"
                    : "bg-gold-strong text-on-gold hover:bg-gold-strong-hover"
                }`}
              >
                {questDone && impulseCount === 0 ? (
                  <>
                    <CheckCircleIcon className="h-5 w-5" />
                    <span>Quest 01 Cleared · Plan Locked in Ink (+200 XP)</span>
                  </>
                ) : (
                  <>
                    <AwardIcon className="h-5 w-5" />
                    <span>Seal Pre-Bell Plan in Ink (+200 XP &amp; +$1,500)</span>
                  </>
                )}
              </button>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-[13.5px]">
                <a
                  href="#film"
                  className="group inline-flex items-center gap-1 font-medium text-gold transition-colors hover:text-ink"
                >
                  Proceed to Quest 02: 09:30 Live Tape
                  <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                </a>
                <Link
                  href="/login?mode=signup"
                  className="text-muted transition-colors hover:text-ink"
                >
                  Or open real journal →
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ========================================================================== */
/*  THE 5-GATE DAILY RITUAL CIRCUIT (#how — Interactive Gate Verifier)        */
/* ========================================================================== */

interface RitualGateSpec {
  id: string;
  num: string;
  tab: string;
  gateCode: string;
  moment: string;
  headline: string;
  italicAccent: string;
  description: string;
  quote: string;
  quoteAuthor: string;
  challengePrompt: string;
  rightOption: string;
  wrongOption: string;
  feedback: string;
  entries: { label: string; value: string; tone?: string }[];
}

const RITUAL_GATES: RitualGateSpec[] = [
  {
    id: "plan",
    num: "01",
    tab: "Plan",
    gateCode: "GATE 01 · INTENTION",
    moment: "08:45 AM · Before the Open",
    headline: "Start with a written intention,",
    italicAccent: "not an impulse.",
    description:
      "Before a single order is placed, you write down the one scenario you are waiting for, what would invalidate it, and how your head feels right now.",
    quote: "Every battle is won before it is ever fought.",
    quoteAuthor: "Sun Tzu · The Art of War",
    challengePrompt: "What belongs in Gate 01 before the bell rings?",
    rightOption: "One specific setup, exact invalidation & headspace check",
    wrongOption: "Ten random tickers and a daily dollar profit target",
    feedback: "A single falsifiable scenario keeps your mind quiet when the bell rings.",
    entries: [
      { label: "Session Thesis", value: "Wait for the overnight low to sweep and reclaim" },
      { label: "Invalidation", value: "Acceptance below the pre-market shelf" },
      { label: "Internal State", value: "Calm, rested, unhurried", tone: "text-profit" },
    ],
  },
  {
    id: "thought",
    num: "02",
    tab: "Thought",
    gateCode: "GATE 02 · PRE-COMMITMENT",
    moment: "09:15 AM · Pre-Commitment",
    headline: "Decide how you will act",
    italicAccent: "before the pressure arrives.",
    description:
      "Write your if-then commitments in plain language. Edgebook surfaces your own historical process odds and reminds you of the personal rules you asked it to guard.",
    quote: "We do not rise to the level of our expectations. We fall to the level of our training.",
    quoteAuthor: "Archilochus",
    challengePrompt: "The first 15 minutes are choppy and loud. What is your pre-commitment?",
    rightOption: "If the first 15m chop, I keep my hands off the mouse",
    wrongOption: "Force a scalp on the 1-minute chart to get green early",
    feedback: "Pre-committed If-Then rules eliminate decision fatigue in the heat of the open.",
    entries: [
      { label: "If-Then Rule", value: "If the first 15 minutes chop, I keep my hands off the mouse" },
      { label: "Guardrail", value: "Stop for the day after 2 consecutive losses", tone: "text-gold" },
      { label: "Historical Edge", value: "84% clean-process rate when rested", tone: "text-profit" },
    ],
  },
  {
    id: "restraint",
    num: "03",
    tab: "Restraint",
    gateCode: "GATE 03 · COMPOSURE",
    moment: "09:38 AM · In the Moment",
    headline: "Protect your composure",
    italicAccent: "when the room speeds up.",
    description:
      "Whether you take a clean setup or log a disciplined No-Trade Day because your condition never appeared, Edgebook honors the quality of your decision—not just the dollar outcome.",
    quote: "Patience is not passive waiting. Patience is active restraint while noise exhausts itself.",
    quoteAuthor: "Edgebook Field Manual",
    challengePrompt: "Your setup never appears all morning. How does Edgebook score the session?",
    rightOption: "Honours a disciplined No-Trade Day as a 100% clean-process win",
    wrongOption: "Penalizes your streak unless you place a trade",
    feedback: "In Edgebook, sitting on your hands when your edge is absent is a victorious session.",
    entries: [
      { label: "Checklist Gate", value: "All 4 playbook conditions verified before entry" },
      { label: "Risk Envelope", value: "Sized within your drawdown survival ceiling", tone: "text-profit" },
      { label: "Impulse Check", value: "Zero FOMO or revenge state flagged", tone: "text-gold" },
    ],
  },
  {
    id: "autopsy",
    num: "04",
    tab: "Autopsy",
    gateCode: "GATE 04 · HONEST MIRROR",
    moment: "10:20 AM · Honest Mirror",
    headline: "Name the one thing",
    italicAccent: "that helped or hurt you.",
    description:
      "A three-minute post-trade reflection asks what went well, what slipped, and what you will watch next time—turning vague regret into a specific, named lesson.",
    quote: "Mistakes are only tuition if you write down what they taught you.",
    quoteAuthor: "Edgebook Autopsy Protocol",
    challengePrompt: "You made +$600 on an impulsive FOMO entry without a plan. What is the verdict?",
    rightOption: "Flagged as a Process Break — sloppy wins are future losses",
    wrongOption: "Celebrated as a great trade because it made money",
    feedback: "Rewarding bad process because it paid out is the fastest way to destroy discipline.",
    entries: [
      { label: "Process Verdict", value: "Followed plan · Waited for confirmation", tone: "text-profit" },
      { label: "Observation", value: "Felt the urge to tighten the stop early, stayed patient" },
      { label: "Watch Next Time", value: "Keep the same composure on Friday sessions", tone: "text-gold" },
    ],
  },
  {
    id: "practise",
    num: "05",
    tab: "Practise",
    gateCode: "GATE 05 · SPACED MASTERY",
    moment: "Evening · Spaced Mastery",
    headline: "Turn repeat mistakes into",
    italicAccent: "automatic intuition.",
    description:
      "Mistakes don't sit forgotten in an old entry. Edgebook brings them back on a spaced-repetition schedule across five deliberate practice modes until the habit is retired.",
    quote: "What you practise in stillness becomes your reflex under fire.",
    quoteAuthor: "Spaced Mastery System",
    challengePrompt: "What happens after you name a mistake in your Gate 04 Autopsy?",
    rightOption: "Scheduled into your 5-Box Spaced Mastery practice feed",
    wrongOption: "Buried in an old spreadsheet row and forgotten",
    feedback: "Every named mistake becomes an interactive drill until it reaches Box 5 retirement.",
    entries: [
      { label: "Active Drill", value: "Patience & Early-Exit Recognition" },
      { label: "Mastery Box", value: "Box 4 of 5 · Due in 7 days", tone: "text-gold" },
      { label: "Weekly Ritual", value: "3-minute synthesis completed", tone: "text-profit" },
    ],
  },
];

export function DecisionRitualStage() {
  const [activeIdx, setActiveIdx] = useState(0);
  const [gateCleared, setGateCleared] = useState<Record<number, "right" | "wrong">>({});

  const stage = RITUAL_GATES[activeIdx] ?? RITUAL_GATES[0]!;
  const clearedCount = Object.values(gateCleared).filter((v) => v === "right").length;

  const answerGate = (idx: number, choice: "right" | "wrong") => {
    setGateCleared((prev) => ({ ...prev, [idx]: choice }));
    if (choice === "right") {
      awardGameAction({
        xpDelta: 30,
        composureDelta: 2,
        streakIncrement: true,
        title: `Gate 0${idx + 1} Verified`,
        subtitle: stage.feedback,
        tone: "profit",
      });
    } else {
      awardGameAction({
        composureDelta: -4,
        streakReset: true,
        title: `Gate 0${idx + 1} Slip`,
        subtitle: "Re-read the principle and switch to the disciplined protocol.",
        tone: "loss",
      });
    }
  };

  return (
    <section
      id="how"
      className="lp-wide py-16 sm:py-24"
      aria-labelledby="ritual-title"
    >
      {/* Header + 5-Gate Circuit Bar */}
      <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <Eyebrow n="02B">THE 5-GATE DAILY OPERATING CIRCUIT</Eyebrow>
          <h2
            id="ritual-title"
            className="mt-3 font-display text-[clamp(1.9rem,4vw,3.3rem)] font-semibold leading-[1.04] tracking-[-0.04em] text-ink"
          >
            Five gates that guard{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              every trading day.
            </span>
          </h2>
        </div>

        {/* 5-Gate Segmented Tab Selector */}
        <div className="flex overflow-x-auto pb-1 no-scrollbar">
          <div
            role="tablist"
            aria-label="Five stages of the Edgebook ritual"
            className="inline-grid min-w-full grid-cols-5 rounded-full border border-line-strong bg-surface p-1.5 sm:min-w-[560px]"
          >
            {RITUAL_GATES.map((s, idx) => {
              const isSelected = idx === activeIdx;
              const isDone = gateCleared[idx] === "right";
              return (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={isSelected}
                  onClick={() => setActiveIdx(idx)}
                  className={`flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-center text-[12.5px] font-medium transition duration-200 sm:px-4 sm:text-[13px] ${
                    isSelected
                      ? "border border-line-strong bg-raised text-ink shadow-[var(--shadow-rest)]"
                      : "text-muted hover:text-ink"
                  }`}
                >
                  <span
                    className={`h-2 w-2 rounded-full ${
                      isDone
                        ? "bg-profit"
                        : isSelected
                          ? "bg-gold-strong"
                          : "bg-line-strong"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="hidden font-mono text-[11px] text-gold sm:inline">
                    {s.num}
                  </span>
                  <span>{s.tab}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Circuit Progress Bar */}
      <div className="mt-4 flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.08]">
          <div
            className="h-full rounded-full bg-profit transition-all duration-300"
            style={{ width: `${Math.max(12, (clearedCount / 5) * 100)}%` }}
          />
        </div>
        <span className="font-mono text-[11px] font-semibold text-profit">
          {clearedCount}/5 Gates Verified
        </span>
      </div>

      {/* 3-Column Theme-Pure Gate Cockpit */}
      <div className="lp-game-card mt-5 grid items-stretch gap-6 p-5 sm:p-8 lg:grid-cols-12 xl:gap-8">
        {/* COL 1 (4 Cols): Gate Narrative & Quote */}
        <div className="flex flex-col justify-between lg:col-span-4">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-line-strong bg-raised px-3 py-1 font-mono text-[10.5px] uppercase tracking-[0.14em] text-gold">
              <TargetIcon className="h-3.5 w-3.5 text-profit" />
              <span>{stage.gateCode}</span>
            </div>

            <p className="mt-3 font-mono text-[11.5px] uppercase tracking-[0.12em] text-faint">
              Gate {stage.num} of 05 · {stage.moment}
            </p>

            <h3 className="mt-2 font-display text-[clamp(1.55rem,2.4vw,2.2rem)] font-semibold leading-[1.08] tracking-[-0.035em] text-ink">
              {stage.headline}{" "}
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                {stage.italicAccent}
              </span>
            </h3>

            <p className="mt-3 text-[15px] leading-relaxed text-muted">
              {stage.description}
            </p>
          </div>

          <div className="mt-6 space-y-4">
            <blockquote className="rounded-2xl border border-line bg-canvas/70 p-4">
              <p className="font-serif text-[17.5px] italic leading-snug text-ink">
                &ldquo;{stage.quote}&rdquo;
              </p>
              <footer className="mt-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-gold">
                — {stage.quoteAuthor}
              </footer>
            </blockquote>

            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={() =>
                  setActiveIdx((activeIdx - 1 + RITUAL_GATES.length) % RITUAL_GATES.length)
                }
                className="inline-flex h-9 items-center rounded-full border border-line-strong bg-raised px-4 text-[13px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
              >
                ← Prev Gate
              </button>
              <button
                type="button"
                onClick={() => setActiveIdx((activeIdx + 1) % RITUAL_GATES.length)}
                className="inline-flex h-9 items-center rounded-full border border-line-strong bg-raised px-4 text-[13px] font-medium text-ink transition hover:border-gold/60 active:scale-[0.98]"
              >
                Next Gate →
              </button>
            </div>
          </div>
        </div>

        {/* COL 2 (4 Cols): Interactive Gate Verification Mini-Challenge */}
        <div className="flex flex-col justify-between rounded-[22px] border border-line-strong bg-canvas/75 p-5 sm:p-6 lg:col-span-4">
          <div>
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em]">
              <span className="text-gold">Gate {stage.num} Verification Drill</span>
              <span
                className={
                  gateCleared[activeIdx] === "right"
                    ? "font-semibold text-profit"
                    : "text-faint"
                }
              >
                {gateCleared[activeIdx] === "right" ? "✓ +30 XP Earned" : "+30 XP"}
              </span>
            </div>

            <p className="mt-3 font-display text-[16px] font-semibold leading-snug text-ink">
              {stage.challengePrompt}
            </p>

            <div className="mt-4 space-y-2.5">
              <button
                type="button"
                onClick={() => answerGate(activeIdx, "right")}
                className={`lp-game-tile flex w-full items-start gap-3 p-3.5 text-left ${
                  gateCleared[activeIdx] === "right"
                    ? "!border-profit/60 !bg-profit/10"
                    : ""
                }`}
              >
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${
                    gateCleared[activeIdx] === "right"
                      ? "bg-profit text-canvas"
                      : "border border-line-strong bg-surface text-gold"
                  }`}
                >
                  A
                </span>
                <span className="text-[13.5px] font-medium leading-snug text-ink">
                  {stage.rightOption}
                </span>
              </button>

              <button
                type="button"
                onClick={() => answerGate(activeIdx, "wrong")}
                className={`lp-game-tile flex w-full items-start gap-3 p-3.5 text-left ${
                  gateCleared[activeIdx] === "wrong"
                    ? "!border-loss/60 !bg-loss/10"
                    : ""
                }`}
              >
                <span
                  className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full font-mono text-[11px] font-bold ${
                    gateCleared[activeIdx] === "wrong"
                      ? "bg-loss text-canvas"
                      : "border border-line-strong bg-surface text-gold"
                  }`}
                >
                  B
                </span>
                <span className="text-[13.5px] font-medium leading-snug text-ink">
                  {stage.wrongOption}
                </span>
              </button>
            </div>
          </div>

          <div className="mt-4 rounded-xl border border-line bg-surface p-3.5 text-[12.5px] leading-snug text-muted">
            {gateCleared[activeIdx] === "right" ? (
              <span className="text-profit">
                <strong className="font-semibold">Gate Unlocked:</strong> {stage.feedback}
              </span>
            ) : gateCleared[activeIdx] === "wrong" ? (
              <span className="text-loss">
                <strong className="font-semibold">Process Slip:</strong> Select Option [A] to align with the Edgebook protocol.
              </span>
            ) : (
              <span>
                Select the disciplined choice above to verify <strong className="text-ink">{stage.gateCode}</strong>.
              </span>
            )}
          </div>
        </div>

        {/* COL 3 (4 Cols): Tactile Gate Ledger Output */}
        <div className="flex flex-col justify-between rounded-[22px] border border-line bg-canvas/60 p-5 sm:p-6 lg:col-span-4">
          <div>
            <div className="mb-3 flex items-center justify-between border-b border-line pb-2.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-faint">
              <span>Gate {stage.num} Ledger Record</span>
              <span className="text-profit">● Live Entry</span>
            </div>
            <div className="space-y-2.5">
              {stage.entries.map((item) => (
                <div
                  key={item.label}
                  className="rounded-2xl border border-line bg-raised px-4 py-3 shadow-[var(--shadow-rest)]"
                >
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-faint">
                    {item.label}
                  </p>
                  <p
                    className={`mt-1 text-[14.5px] font-medium leading-snug ${
                      item.tone ?? "text-ink"
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[12px] text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ShieldIcon className="h-3.5 w-3.5 text-gold" />
              Saved to your Google Drive
            </span>
            <span className="font-mono text-[10.5px] text-gold">
              0{activeIdx + 1} / 05
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

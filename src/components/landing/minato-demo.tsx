"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AwardIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ShieldIcon,
  SparklesIcon,
} from "@/components/ui/icons";
import { Eyebrow } from "./ledger";
import { awardGameAction, useLandingGame } from "./game-state";

/* ========================================================================== */
/*  QUEST 05 — MINATO AI PATTERN INVESTIGATION & MEMORY GRAPH (#minato)       */
/*  100% Edgebook Theme Tokens & Fonts (Inter Variable, Instrument Serif,     */
/*  JetBrains Mono). Uses .minato-finding classes from globals.css.           */
/* ========================================================================== */

interface MemoryNode {
  label: string;
  date: string;
  excerpt: string;
  tag: string;
}

interface DialogueBranch {
  id: string;
  chip: string;
  userPrompt: string;
  minatoReply: string;
  findingBadge: string;
  supportingPoints: string[];
  followUpPrompt: string;
  followUpReply: string;
  guardrailRule: string;
  recommendedDrill: string;
  memoryNodes: MemoryNode[];
  quote: string;
}

const DIALOGUE_BRANCHES: DialogueBranch[] = [
  {
    id: "fridays",
    chip: "Friday Givebacks",
    userPrompt: "Why do I keep giving back my Friday gains?",
    minatoReply:
      "You tend to take a second unscheduled trade within 12 minutes of a green Friday opener. In your notes on those trades, you wrote about feeling “ahead” and wanting to “round up the week.”",
    findingBadge: "4 of 5 Friday losses followed a green opener within 12 minutes",
    supportingPoints: [
      "First Friday trade win rate: 82% (+2.1R avg)",
      "Second Friday trade win rate: 18% (−1.4R avg)",
    ],
    followUpPrompt: "Lock in the rule: what should my Friday guardrail be?",
    followUpReply:
      "Guardrail ready: On Fridays, your session ends immediately after your first clean winner—or after two total attempts.",
    guardrailRule: "Friday Rule: Hard stop after 1st clean Friday winner",
    recommendedDrill: "Time Machine · Friday Winner Stop-Rule",
    memoryNodes: [
      {
        label: "14 Oct Plan",
        date: "14 Oct · 08:48 AM",
        excerpt: "“Goal today: one clean A+ setup and done before 10:30 AM.”",
        tag: "Written Intention",
      },
      {
        label: "21 Oct Autopsy #31",
        date: "21 Oct · 10:14 AM",
        excerpt: "“Was up +$1,400, took a random mid-range long out of boredom and gave back $950.”",
        tag: "Process Break",
      },
      {
        label: "28 Oct Reflection",
        date: "28 Oct · 11:05 AM",
        excerpt: "“Did it again on Friday. Felt invincible after the first win.”",
        tag: "Repeat Habit",
      },
      {
        label: "01 Nov Lab",
        date: "01 Nov · Weekend Review",
        excerpt: "“Excluding 2nd Friday trades increases monthly net expectancy by +34%.”",
        tag: "Lab Proof",
      },
    ],
    quote: "The hardest moment to stay disciplined is right after you win.",
  },
  {
    id: "early-stop",
    chip: "Early Stop Chokes",
    userPrompt: "Why did I choke my stop to breakeven at 09:39?",
    minatoReply:
      "In 6 of your last 9 entries, you dragged your stop to breakeven within 4 minutes whenever you left dollar P&L visible. When you switch display to R-multiples, premature exits drop by 70%.",
    findingBadge: "Trigger identified: Watching live dollar P&L during 1m pullbacks",
    supportingPoints: [
      "Avg R when watching Dollars: +0.4R (choked early)",
      "Avg R when watching R-Multiples: +2.3R (held to target)",
    ],
    followUpPrompt: "How do I lock that habit out tomorrow morning?",
    followUpReply:
      "I have armed a pre-bell reminder for 09:25 AM: hide dollar P&L and only evaluate exits on a 5-minute candle close.",
    guardrailRule: "Display Rule: Hide dollar P&L · Exit only on 5m close",
    recommendedDrill: "Matrix Arena · R-Multiple Patience",
    memoryNodes: [
      {
        label: "09:05 AM Thesis",
        date: "04 Nov · Pre-Bell",
        excerpt: "“Target is 18,475 (+2.8R). Do not touch stop unless 18,406 breaks.”",
        tag: "Pre-Commitment",
      },
      {
        label: "Autopsy #42",
        date: "19 Oct · 09:44 AM",
        excerpt: "“Saw +$800 dip to +$350, panicked and moved stop to entry. Wicked out.”",
        tag: "Fear Exit",
      },
      {
        label: "Autopsy #48",
        date: "27 Oct · 09:51 AM",
        excerpt: "“Switched to R-mode today. Held through the 09:39 pullback and hit +2.8R.”",
        tag: "Clean Execution",
      },
      {
        label: "Playbook Rule #3",
        date: "Playbook · Exit Protocol",
        excerpt: "“1-minute pullbacks inside a 5-minute expansion leg are noise, not invalidation.”",
        tag: "Playbook Law",
      },
    ],
    quote: "Count in R, never in dollars, while the decision is still alive.",
  },
  {
    id: "size-up",
    chip: "Readiness to Size Up",
    userPrompt: "Am I disciplined enough to increase my risk per trade?",
    minatoReply:
      "Your clean-process rate over the last 20 sessions is 88%, and you logged two disciplined No-Trade Days during FOMC chop. Your process supports a 1.25× step-up with a hard two-loss circuit breaker.",
    findingBadge: "88% clean process across 20 sessions · 2 No-Trade Days honoured",
    supportingPoints: [
      "Drawdown envelope respected: 20 / 20 sessions",
      "Impulse FOMO entries in last 14 days: 0",
    ],
    followUpPrompt: "What automatically resets my size back to baseline?",
    followUpReply:
      "Any single unscheduled revenge entry immediately resets sizing back to 1.0× baseline until three consecutive clean autopsies are logged.",
    guardrailRule: "Sizing Protocol: 1.25× earned · Instant reset on any impulse trade",
    recommendedDrill: "Weekend Boss · Drawdown Envelope Test",
    memoryNodes: [
      {
        label: "20-Day Log",
        date: "Oct–Nov Ledger",
        excerpt: "“18 of 20 sessions graded A or A+ on process regardless of P&L outcome.”",
        tag: "Consistency",
      },
      {
        label: "2 No-Trade Days",
        date: "18 Oct & 01 Nov",
        excerpt: "“Sat on hands all morning because overnight sweep condition never triggered.”",
        tag: "Restraint Badge",
      },
      {
        label: "Challenge #04",
        date: "Trading Lab",
        excerpt: "“Passed $50k simulation with $1,840 of $2,000 drawdown buffer intact.”",
        tag: "Survival Proof",
      },
      {
        label: "Risk Envelope",
        date: "Account Settings",
        excerpt: "“Max daily risk capped at 2.0R; auto-alert triggers after 1st loss.”",
        tag: "Hard Ceiling",
      },
    ],
    quote: "Size is earned by kept rules, never by a single lucky week.",
  },
];

function Bubble({
  me,
  children,
}: {
  me?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={me ? "flex justify-end" : "flex justify-start"}>
      <div
        className={`max-w-[90%] rounded-[20px] px-4 py-2.5 text-[14px] leading-[1.45] ${
          me
            ? "rounded-br-[6px] bg-ink text-canvas"
            : "rounded-bl-[6px] border border-line bg-raised text-ink"
        }`}
      >
        {children}
      </div>
    </div>
  );
}

export function MinatoDemo() {
  const game = useLandingGame();

  const [branchIdx, setBranchIdx] = useState(0);
  const [selectedNodeIdx, setSelectedNodeIdx] = useState(1);
  const [equippedBranches, setEquippedBranches] = useState<Record<string, boolean>>({});

  const branch = DIALOGUE_BRANCHES[branchIdx] ?? DIALOGUE_BRANCHES[0]!;
  const activeNode =
    branch.memoryNodes[selectedNodeIdx] ?? branch.memoryNodes[0]!;
  const isEquipped = !!equippedBranches[branch.id];

  const handleSelectBranch = (idx: number) => {
    setBranchIdx(idx);
    setSelectedNodeIdx(1);
  };

  const handleInspectNode = (idx: number) => {
    setSelectedNodeIdx(idx);
    const node = branch.memoryNodes[idx];
    if (node) {
      awardGameAction({
        xpDelta: 15,
        title: `Memory Node Cited: ${node.label}`,
        subtitle: node.excerpt,
        tone: "gold",
      });
    }
  };

  const handleEquipGuardrail = () => {
    setEquippedBranches((prev) => ({ ...prev, [branch.id]: true }));
    awardGameAction({
      xpDelta: 60,
      composureDelta: 6,
      equityDelta: 800,
      streakIncrement: true,
      questId: "q5_minato",
      guardrail: branch.guardrailRule,
      title: "Minato Guardrail Equipped",
      subtitle: branch.guardrailRule,
      tone: "profit",
    });
  };

  const nodeCoords = [
    { x: 52, y: 34 },
    { x: 208, y: 34 },
    { x: 52, y: 122 },
    { x: 208, y: 122 },
  ];

  return (
    <section
      id="minato"
      className="lp-wide py-16 sm:py-24"
      aria-labelledby="minato-title"
    >
      <div className="mb-8 flex flex-col justify-between gap-6 border-t border-line pt-10 lg:flex-row lg:items-end">
        <div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Eyebrow n="05">QUEST 05 · MINATO AI PATTERN INVESTIGATION</Eyebrow>
            {game.questsCompleted.q5_minato && (
              <span className="inline-flex items-center gap-1 rounded-full border border-profit/40 bg-profit/12 px-2.5 py-0.5 font-mono text-[10px] font-semibold text-profit">
                <CheckCircleIcon className="h-3.5 w-3.5" />
                QUEST 05 CLEARED
              </span>
            )}
          </div>
          <h2
            id="minato-title"
            className="mt-3 font-display text-[clamp(2rem,4.4vw,3.6rem)] font-semibold leading-[1.03] tracking-[-0.042em] text-ink"
          >
            Ask the one who has{" "}
            <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
              read every entry.
            </span>
          </h2>
          <p className="mt-3 max-w-2xl text-[15.5px] leading-relaxed text-muted">
            Minato doesn&apos;t predict markets or give signals—it reads your plans, autopsies, and screenshots to uncover the hidden habits costing you R. Investigate a habit below and <strong className="font-semibold text-ink">equip Minato&apos;s guardrail</strong> (+200 XP).
          </p>
        </div>

        {/* Active Equipped Guardrail Pill */}
        <div className="panel flex items-center gap-3 px-4 py-3">
          <ShieldIcon className="h-5 w-5 shrink-0 text-gold" />
          <div>
            <p className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-faint">
              Active Equipped Guardrail
            </p>
            <p className="font-mono text-[12px] font-semibold text-ink">
              {game.guardrailEquipped}
            </p>
          </div>
        </div>
      </div>

      <div className="grid w-full items-stretch gap-6 lg:grid-cols-12 xl:gap-8">
        {/* LEFT 7 COLS: Interactive RPG Dialogue Tree Simulator */}
        <div className="lp-game-card flex flex-col justify-between overflow-hidden lg:col-span-7">
          <div>
            {/* Top Minato Header */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-canvas/70 px-5 py-4 sm:px-6">
              <div className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src="/minato-avatar.jpg"
                  alt="Minato companion avatar"
                  width={40}
                  height={40}
                  className="h-10 w-10 rounded-full border border-gold/50 object-cover"
                />
                <div>
                  <p className="font-display text-[15.5px] font-semibold leading-tight text-ink">
                    Minato · Journal-Grounded Companion
                  </p>
                  <p className="flex items-center gap-1.5 font-mono text-[11px] text-muted">
                    <span className="h-2 w-2 rounded-full bg-profit" />
                    Cross-referencing 48 logged sessions · Zero market predictions
                  </p>
                </div>
              </div>

              <span className="rounded-full border border-line-strong bg-raised px-3 py-1 font-mono text-[10px] font-semibold uppercase tracking-[0.1em] text-gold">
                Select Investigation [1–3]
              </span>
            </div>

            {/* 3 Playable Investigation Branch Tabs */}
            <div className="flex flex-wrap gap-2 border-b border-line bg-surface px-5 py-3 sm:px-6">
              {DIALOGUE_BRANCHES.map((b, idx) => {
                const active = idx === branchIdx;
                const done = !!equippedBranches[b.id];
                return (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => handleSelectBranch(idx)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 font-mono text-[11px] transition ${
                      active
                        ? "bg-gold-strong font-semibold text-on-gold shadow-[var(--shadow-rest)]"
                        : "border border-line bg-raised text-muted hover:border-line-strong hover:text-ink"
                    }`}
                  >
                    <span>
                      [{idx + 1}] {b.chip}
                    </span>
                    {done && <span>✓</span>}
                  </button>
                );
              })}
            </div>

            {/* Dialogue Stream using globals.css .minato-finding classes */}
            <div className="space-y-3.5 px-5 py-5 sm:px-6">
              <Bubble me>{branch.userPrompt}</Bubble>
              <Bubble>{branch.minatoReply}</Bubble>

              {/* Authentic .minato-finding & .minato-supporting-point from globals.css */}
              <div className="minato-finding">
                <span className="minato-finding-number">!</span>
                <div>
                  <p className="font-mono text-[12px] font-semibold text-ink">
                    {branch.findingBadge}
                  </p>
                  <div className="mt-1.5">
                    {branch.supportingPoints.map((pt) => (
                      <div key={pt} className="minato-supporting-point">
                        <span>•</span>
                        <span className="font-mono text-[11.5px]">{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <Bubble me>{branch.followUpPrompt}</Bubble>
              <Bubble>{branch.followUpReply}</Bubble>
            </div>
          </div>

          {/* Bottom Action Bar: Equip Guardrail */}
          <div className="border-t border-line bg-canvas/60 p-5 sm:px-6">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-gold">
                  Prescribed Personal Guardrail
                </p>
                <p className="mt-0.5 text-[14px] font-semibold text-ink">
                  {branch.guardrailRule}
                </p>
              </div>

              <button
                type="button"
                onClick={handleEquipGuardrail}
                className={`inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-5 text-[14px] font-semibold transition active:scale-[0.98] ${
                  isEquipped
                    ? "border border-profit/50 bg-profit/15 text-profit"
                    : "bg-gold-strong text-on-gold hover:bg-gold-strong-hover"
                }`}
              >
                {isEquipped ? (
                  <>
                    <CheckCircleIcon className="h-4 w-4" />
                    <span>Guardrail Equipped (+200 XP)</span>
                  </>
                ) : (
                  <>
                    <AwardIcon className="h-4 w-4" />
                    <span>Equip Guardrail Rule (+200 XP)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* RIGHT 5 COLS: Interactive Neural Memory Graph & Cited Entry Inspector */}
        <div className="lp-game-card flex flex-col justify-between p-5 sm:p-7 lg:col-span-5">
          <div>
            <div className="flex items-center justify-between">
              <p className="font-mono text-[10.5px] font-semibold uppercase tracking-[0.14em] text-gold">
                INTERACTIVE MEMORY GRAPH · CLICK ANY NODE
              </p>
              <span className="font-mono text-[10px] text-profit">+15 XP / Node</span>
            </div>
            <p className="mt-1 text-[13px] text-muted">
              Click any of the 4 journal nodes below to read the exact past entry Minato cross-referenced:
            </p>

            {/* Interactive SVG Memory Graph */}
            <div className="my-4 rounded-2xl border border-line bg-canvas/80 p-3.5">
              <svg
                viewBox="0 0 260 156"
                className="w-full overflow-visible"
                role="img"
                aria-label="Minato neural memory graph connecting past journal entries"
              >
                {nodeCoords.map((c, i) => {
                  const isSelected = i === selectedNodeIdx;
                  return (
                    <line
                      key={`line-${i}`}
                      x1="130"
                      y1="78"
                      x2={c.x}
                      y2={c.y}
                      stroke={
                        isSelected ? "var(--color-profit)" : "var(--color-gold)"
                      }
                      strokeWidth={isSelected ? "2.4" : "1.5"}
                      strokeDasharray={isSelected ? undefined : "3 3"}
                    />
                  );
                })}

                <circle cx="130" cy="78" r="20" fill="var(--color-gold-strong)" />
                <text
                  x="130"
                  y="81"
                  textAnchor="middle"
                  fontSize="8.5"
                  fontWeight="700"
                  fill="var(--color-on-gold)"
                  style={{ fontFamily: "var(--font-mono)" }}
                >
                  MINATO
                </text>

                {branch.memoryNodes.map((n, i) => {
                  const c = nodeCoords[i]!;
                  const isSelected = i === selectedNodeIdx;
                  return (
                    <g
                      key={n.label}
                      onClick={() => handleInspectNode(i)}
                      className="cursor-pointer"
                    >
                      {isSelected && (
                        <circle
                          cx={c.x}
                          cy={c.y}
                          r="14"
                          fill="var(--color-profit)"
                          fillOpacity="0.18"
                        />
                      )}
                      <circle
                        cx={c.x}
                        cy={c.y}
                        r="8.5"
                        fill={
                          isSelected
                            ? "var(--color-profit)"
                            : "var(--color-raised)"
                        }
                        stroke={
                          isSelected
                            ? "var(--color-profit)"
                            : "var(--color-gold)"
                        }
                        strokeWidth="2"
                      />
                      <text
                        x={c.x}
                        y={i < 2 ? c.y - 13 : c.y + 20}
                        textAnchor="middle"
                        fontSize="9.5"
                        fontWeight={isSelected ? "700" : "500"}
                        fill="var(--color-ink)"
                        style={{ fontFamily: "var(--font-mono)" }}
                      >
                        {n.label}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Cited Journal Entry Inspector Card */}
            <div className="rounded-2xl border border-line-strong bg-raised p-4 shadow-[var(--shadow-rest)]">
              <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.12em]">
                <span className="font-semibold text-gold">
                  {activeNode.label} · {activeNode.date}
                </span>
                <span className="rounded-full bg-profit/12 px-2.5 py-0.5 font-semibold text-profit">
                  {activeNode.tag}
                </span>
              </div>
              <p className="mt-2 font-serif text-[17.5px] italic leading-snug text-ink">
                {activeNode.excerpt}
              </p>
            </div>

            {/* Recommended Next Practice Drill */}
            <div className="mt-3.5 flex items-center justify-between rounded-2xl border border-profit/35 bg-profit/10 px-4 py-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-profit">
                  Auto-Queued Practice Drill
                </p>
                <p className="mt-0.5 text-[14px] font-semibold text-ink">
                  {branch.recommendedDrill}
                </p>
              </div>
              <SparklesIcon className="h-5 w-5 text-profit" />
            </div>
          </div>

          <div className="mt-5 border-t border-line pt-4">
            <blockquote className="font-serif text-[16.5px] italic leading-snug text-ink">
              &ldquo;{branch.quote}&rdquo;
            </blockquote>
            <div className="mt-3 flex items-center justify-between text-[13.5px]">
              <Link
                href="/login?mode=signup"
                className="font-medium text-muted transition-colors hover:text-ink"
              >
                Meet Minato in your journal →
              </Link>
              <a
                href="#road"
                className="group inline-flex items-center gap-1 font-medium text-gold transition-colors hover:text-ink"
              >
                Final Quest: Road &amp; Vault
                <ChevronRightIcon className="h-4 w-4 transition-transform duration-200 group-hover:translate-x-0.5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

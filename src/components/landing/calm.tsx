"use client";

import { useState } from "react";
import { CheckCircleIcon, SparklesIcon } from "@/components/ui/icons";
import { Eyebrow } from "./ledger";
import { awardGameAction } from "./game-state";

const POINTS = [
  {
    t: "The feed ends at 20 cards.",
    d: "Twenty cards at most, then a clear “you’re all caught up”. No infinite scroll, no pull to refresh.",
    quote: "“Technology should respect when your work is done.”",
  },
  {
    t: "No streaks to lose.",
    d: "Milestones are cumulative. Take a disciplined No-Trade Day or a weekend off and nothing resets.",
    quote: "“A disciplined No-Trade Day is a victory, never a broken streak.”",
  },
  {
    t: "Reminders, not locks.",
    d: "Set a daily time prompt. It nudges you to stop; it never shuts you out of your own ledger.",
    quote: "“Sovereignty means you hold the key to the study door.”",
  },
];

/**
 * EVENING SANCTUARY (#calm)
 * Interactive "Close the Ledger" switch demonstrating how Edgebook is built to be put down.
 */
export function Calm() {
  const [cardsReviewed, setCardsReviewed] = useState(19);
  const isComplete = cardsReviewed >= 20;

  const finishFinalCard = () => {
    if (isComplete) {
      setCardsReviewed(19);
      return;
    }
    setCardsReviewed(20);
    awardGameAction({
      xpDelta: 40,
      composureDelta: 5,
      title: "20 / 20 Daily Cards Complete · Ledger Closed",
      subtitle: "Evening Sanctuary reached. Step away in calm.",
      tone: "profit",
    });
  };

  return (
    <section id="calm" className="lp-wide py-16 sm:py-24">
      <div className="grid w-full items-stretch gap-8 lg:grid-cols-12 xl:gap-12">
        <div className="flex flex-col justify-between lg:col-span-5">
          <div>
            <Eyebrow n="07">EVENING SANCTUARY · CALM BY DESIGN</Eyebrow>
            <h2 className="mt-4 font-display text-[clamp(2.2rem,4.8vw,4rem)] font-semibold leading-[1.02] tracking-[-0.044em] text-ink">
              <span className="font-serif text-[1.08em] font-normal italic tracking-[-0.02em] text-gold">
                Built to be put down.
              </span>
            </h2>
            <p className="mt-4 max-w-md text-[15.5px] leading-relaxed text-muted">
              Most trading platforms are engineered like casinos to keep your eyes glued to blinking ticks. Edgebook is engineered like a library: finish your three-minute review, close the cover, and live your life.
            </p>
          </div>

          {/* Interactive 20/20 Card Completion Widget */}
          <div className="lp-game-card mt-7 p-6">
            <div className="flex items-center justify-between font-mono text-[10.5px] uppercase tracking-[0.12em]">
              <span className="text-gold">Daily Review Feed Simulator</span>
              <span className="num font-semibold text-profit">
                {cardsReviewed} / 20 Cards
              </span>
            </div>

            <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-ink/[0.08]">
              <div
                className="h-full rounded-full bg-gold-strong transition-all duration-300"
                style={{ width: `${(cardsReviewed / 20) * 100}%` }}
              />
            </div>

            <blockquote className="mt-4 font-serif text-[19px] italic leading-snug text-ink">
              {isComplete
                ? "“You’re all caught up for today. Close the notebook—nothing carries over into your evening.”"
                : "“One reflection card remaining in today’s study queue…”"}
            </blockquote>

            <button
              type="button"
              onClick={finishFinalCard}
              className={`mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-full font-mono text-[11.5px] font-semibold uppercase tracking-[0.08em] transition ${
                isComplete
                  ? "border border-profit/45 bg-profit/12 text-profit"
                  : "bg-gold-strong text-on-gold hover:bg-gold-strong-hover"
              }`}
            >
              {isComplete ? (
                <>
                  <CheckCircleIcon className="h-4 w-4" />
                  <span>20 / 20 Complete · Sanctuary Active (+40 XP)</span>
                </>
              ) : (
                <>
                  <SparklesIcon className="h-4 w-4" />
                  <span>Complete Card 20 of 20 &amp; Close Ledger (+40 XP)</span>
                </>
              )}
            </button>
          </div>
        </div>

        <ul className="divide-y divide-line border-y border-line lg:col-span-7">
          {POINTS.map((p) => (
            <li key={p.t} className="py-6 sm:py-7">
              <div className="flex flex-col justify-between gap-2 sm:flex-row sm:items-baseline">
                <p className="font-display text-[clamp(1.3rem,2.2vw,1.75rem)] font-semibold tracking-[-0.028em] text-ink">
                  {p.t}
                </p>
                <span className="font-serif text-[16px] italic text-gold">
                  {p.quote}
                </span>
              </div>
              <p className="mt-2 max-w-xl text-[15px] leading-relaxed text-muted">
                {p.d}
              </p>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

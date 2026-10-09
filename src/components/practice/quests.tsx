"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { CHEST_REWARD, type QuestState } from "@/lib/practice/quests";
import { haptic } from "@/lib/haptics";
import { CheckIcon, GiftIcon } from "./icons";
import { Eyebrow, surface } from "./ui";

const claimBtn = "inline-flex h-8 shrink-0 items-center rounded-full bg-gradient-to-b from-gold-strong to-gold-deep px-3.5 text-[12.5px] font-semibold text-on-gold shadow-[0_5px_12px_-6px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)] transition-all hover:brightness-110 active:scale-[0.96]";

/** Today's three quests. Done quests can be claimed for bonus XP; finish and claim all three for the daily chest. */
export function DailyQuests({ quests, chestClaimed, onClaim }: { quests: QuestState[]; chestClaimed: boolean; onClaim: (id: string) => void }) {
  const reduce = useReducedMotion();
  const done = quests.filter((q) => q.done).length;
  const allClaimed = quests.length > 0 && quests.every((q) => q.claimed);
  const chestReady = allClaimed && !chestClaimed;

  return (
    <section className={cn(surface.material, "rounded-[28px] p-6 sm:p-7")} aria-labelledby="quests-heading">
      <div className="flex items-baseline justify-between gap-3">
        <Eyebrow><span id="quests-heading">Daily quests</span></Eyebrow>
        <p className="num text-[12px] text-faint">{done} of {quests.length} done</p>
      </div>

      <ul className="mt-4 space-y-3.5">
        {quests.map((q) => {
          const pct = Math.min(100, Math.round((q.value / q.target) * 100));
          return (
            <li key={q.id} className="flex items-center gap-3.5">
              <span className={cn("grid h-8 w-8 shrink-0 place-items-center rounded-full transition-colors", q.done ? "bg-profit text-canvas" : "bg-ink/[0.07] text-faint")}>
                {q.done ? <motion.span initial={reduce ? false : { scale: 0.4 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 500, damping: 18 }}><CheckIcon className="h-4 w-4" /></motion.span> : <span className="num text-[11px] font-semibold">{pct}%</span>}
              </span>
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-[14.5px] font-medium tracking-[-0.01em]", q.claimed ? "text-muted line-through decoration-muted/40" : "text-ink")}>{q.title}</p>
                <div className="mt-1.5 flex items-center gap-2.5">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-label={q.title} aria-valuemin={0} aria-valuemax={q.target} aria-valuenow={Math.min(q.value, q.target)}>
                    <div className="h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${pct}%`, background: q.done ? "var(--profit)" : "var(--gold-strong)" }} />
                  </div>
                  <span className="num w-[68px] shrink-0 text-right text-[11.5px] text-faint">{Math.min(q.value, q.target)} / {q.target}</span>
                </div>
              </div>
              {q.done && !q.claimed ? (
                <button type="button" className={claimBtn} onClick={() => { haptic.success(); onClaim(q.id); }}>Claim +{q.reward}</button>
              ) : (
                <span className={cn("num w-[64px] shrink-0 text-right text-[12px]", q.claimed ? "text-profit" : "text-faint")}>{q.claimed ? "Claimed" : `+${q.reward} XP`}</span>
              )}
            </li>
          );
        })}
      </ul>

      <div className={cn("mt-5 flex items-center gap-3.5 rounded-[18px] border px-4 py-3 transition-colors", chestReady ? "border-gold-strong/60 bg-gold-strong/10" : "border-line bg-raised/60")}>
        <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-[11px]", chestReady || chestClaimed ? "text-on-gold" : "bg-ink/[0.07] text-faint")} style={chestReady || chestClaimed ? { background: "linear-gradient(150deg, var(--gold-strong), var(--gold-deep))" } : undefined}><GiftIcon className="h-[18px] w-[18px]" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[14px] font-semibold tracking-[-0.01em] text-ink">Daily chest</p>
          <p className="text-[12px] text-muted">{chestClaimed ? "Opened today — see you tomorrow." : allClaimed ? "All quests claimed. Open it!" : "Finish and claim all three quests."}</p>
        </div>
        {chestReady ? <button type="button" className={claimBtn} onClick={() => { haptic.success(); onClaim("chest"); }}>Open +{CHEST_REWARD}</button> : <span className="num text-[12px] text-faint">{chestClaimed ? "Done" : `+${CHEST_REWARD} XP`}</span>}
      </div>
    </section>
  );
}

"use client";

import { useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { haptic } from "@/lib/haptics";
import { formatDateMedium } from "@/lib/format";
import { Modal } from "@/components/ui/modal";
import { FLOW_EASE, IconCheck, PrimaryButton, SheetFrame, StepTitle } from "@/components/journal/flow-ui";
import { CHEST_REWARD, type QuestKind, type QuestState } from "@/lib/practice/quests";
import { TIER_GATE_DAYS, type AchievementGroup, type AchievementState } from "@/lib/practice/achievements";
import { ACHIEVEMENT_ICON, BoltIcon, BrainIcon, CheckIcon, CompassIcon, FlameIcon, GiftIcon, LockIcon, MedalIcon, TargetIcon } from "./icons";
import { Burst } from "./celebrate";
import { ProgressRing } from "./rings";
import { Eyebrow, surface } from "./ui";
import "./practice.css";

type P = { className?: string };
const QUEST_ICON: Record<QuestKind, (p: P) => React.JSX.Element> = { answers: CheckIcon, xp: BoltIcon, passes: MedalIcon, combo: FlameIcon, perfect: TargetIcon, accuracy: TargetIcon, ict: BrainIcon, modes: CompassIcon };

/** One entrance for everything on this shelf: rise and fade, staggered by position. */
function useRise(reduce: boolean | null) {
  return (i: number) => (reduce
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, transition: { duration: 0.2 } }
    : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.55, ease: FLOW_EASE, delay: Math.min(i * 0.07, 0.5) } });
}

/* ----------------------------- Challenges ----------------------------- */

const claimPill = "inline-flex h-9 shrink-0 items-center rounded-full bg-gradient-to-b from-gold-strong to-gold-deep px-4 text-[13.5px] font-semibold tracking-[-0.01em] text-on-gold shadow-[0_6px_14px_-6px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)] transition-all duration-200 hover:brightness-110 active:scale-[0.95]";

/** Today's three challenges. Finished ones can be claimed for bonus XP; claim all three to open the daily chest. */
export function Challenges({ quests, chestClaimed, onClaim }: { quests: QuestState[]; chestClaimed: boolean; onClaim: (id: string) => void }) {
  const reduce = useReducedMotion();
  const rise = useRise(reduce);
  const [burst, setBurst] = useState(0);
  const done = quests.filter((q) => q.done).length;
  const claimed = quests.filter((q) => q.claimed).length;
  const allClaimed = quests.length > 0 && claimed === quests.length;
  const chestReady = allClaimed && !chestClaimed;

  return (
    <section className={cn("relative overflow-hidden rounded-[28px] p-5 sm:p-7", surface.material)} aria-labelledby="pr-challenges">
      {burst > 0 && <Burst key={burst} colors={["var(--gold-strong)", "var(--gold-deep)", "var(--profit)", "var(--info)"]} count={44} />}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>Resets every day</Eyebrow>
          <h2 id="pr-challenges" className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.028em] text-ink">Today’s challenges</h2>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2" aria-label={`${done} of ${quests.length} done`}>
          <p className="text-[12.5px] font-medium tabular-nums text-muted">{done} of {quests.length} done</p>
          <div className="flex gap-1" aria-hidden>
            {quests.map((q) => <span key={q.id} className="h-1.5 w-6 rounded-full transition-colors duration-500" style={{ background: q.done ? "var(--profit)" : "color-mix(in srgb, var(--ink) 9%, transparent)" }} />)}
          </div>
        </div>
      </div>

      <ul className="pr-group mt-6 overflow-hidden rounded-[20px] border border-line bg-raised">
        {quests.map((q, i) => {
          const pct = Math.min(100, Math.round((q.value / q.target) * 100));
          const Icon = QUEST_ICON[q.kind];
          return (
            <motion.li key={q.id} {...rise(i + 1)} className="relative flex items-center gap-4 px-4 py-3.5 sm:px-5 sm:py-4">
              <ProgressRing value={pct / 100} size={48} stroke={3.5} tone={q.done ? "var(--profit)" : "var(--gold-strong)"} delay={0.15 + i * 0.1}>
                {q.done ? (
                  <motion.span initial={reduce ? false : { scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 500, damping: 20 }} className="grid h-7 w-7 place-items-center rounded-full bg-profit text-canvas"><CheckIcon className="h-4 w-4" /></motion.span>
                ) : (
                  <Icon className="h-[19px] w-[19px] text-muted" />
                )}
              </ProgressRing>
              <div className="min-w-0 flex-1">
                <p className={cn("text-[15.5px] font-medium leading-snug tracking-[-0.014em]", q.claimed ? "text-muted" : "text-ink")}>{q.title}</p>
                <p className="mt-0.5 text-[12.5px] tabular-nums text-muted">{Math.min(q.value, q.target)} of {q.target} {q.unit}</p>
              </div>
              {q.done && !q.claimed ? (
                <button type="button" className={claimPill} onClick={() => { haptic.success(); onClaim(q.id); }}>Claim +{q.reward}</button>
              ) : (
                <span className={cn("shrink-0 text-[13px] tabular-nums", q.claimed ? "font-medium text-profit" : "text-faint")}>{q.claimed ? "Claimed" : `+${q.reward} XP`}</span>
              )}
            </motion.li>
          );
        })}
      </ul>

      <motion.div {...rise(quests.length + 1)} className={cn("pr-chest-card relative mt-4 flex items-center gap-4 overflow-hidden rounded-[20px] border px-4 py-3.5 sm:px-5 sm:py-4", chestReady ? "border-gold/55 bg-gold/[0.08]" : chestClaimed ? "border-profit/35 bg-profit/[0.05]" : "border-line bg-raised")} data-ready={chestReady ? "true" : undefined}>
        <span className={cn("relative grid h-12 w-12 shrink-0 place-items-center rounded-[15px] transition-colors duration-500", chestReady || chestClaimed ? "text-on-gold" : "bg-ink/[0.06] text-faint")} style={chestReady || chestClaimed ? { background: "linear-gradient(155deg, var(--gold-strong), var(--gold-deep))", boxShadow: "0 10px 20px -10px var(--gold-strong), inset 0 1px 0 rgb(255 255 255 / .35)" } : undefined}>
          <GiftIcon className="h-6 w-6" />
          {chestReady && !reduce && <motion.span aria-hidden className="absolute inset-0 rounded-[15px] border border-gold-strong" animate={{ scale: [1, 1.4], opacity: [0.7, 0] }} transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15.5px] font-semibold tracking-[-0.014em] text-ink">Daily chest</p>
          <p className="mt-0.5 text-[12.5px] leading-snug text-muted">{chestClaimed ? "Opened today. See you tomorrow." : allClaimed ? "All claimed. Open it." : `${claimed} of ${quests.length} claimed`}</p>
        </div>
        {chestReady ? (
          <button type="button" className={claimPill} onClick={() => { haptic.success(); setBurst((n) => n + 1); onClaim("chest"); }}>Open +{CHEST_REWARD}</button>
        ) : (
          <span className={cn("shrink-0 text-[13px] tabular-nums", chestClaimed ? "font-medium text-profit" : "text-faint")}>{chestClaimed ? "Opened" : `+${CHEST_REWARD} XP`}</span>
        )}
      </motion.div>
    </section>
  );
}

/* ------------------------------ Trophies ------------------------------ */

const TIER = ["", "Bronze", "Silver", "Gold"] as const;
const GROUPS: AchievementGroup[] = ["Consistency", "Volume", "Skill", "ICT Lab"];

/** The calendar gate as a timeline: Bronze at day 7, Silver at 21, Gold at 45. The fill animates to where you are. */
function GateTimeline({ span, hasStarted }: { span: number; hasStarted: boolean }) {
  const reduce = useReducedMotion();
  const MAX = TIER_GATE_DAYS[3];
  const marks = ([1, 2, 3] as const).map((tier) => ({ tier, day: TIER_GATE_DAYS[tier] }));
  const next = marks.find((m) => span < m.day);
  const caption = !hasStarted ? "Start practising to open the first trophy tier" : next ? `${TIER[next.tier]} tier opens in ${next.day - span} ${next.day - span === 1 ? "day" : "days"}` : "Every trophy tier is open";
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[13.5px] font-medium tracking-[-0.01em] text-ink">{caption}</p>
        <p className="shrink-0 text-[12px] tabular-nums text-faint">Day {hasStarted ? span + 1 : 0}</p>
      </div>
      <div className="relative mt-4 h-1.5 rounded-full bg-ink/[0.07]" role="progressbar" aria-label="Trophy tiers unlocked by time" aria-valuemin={0} aria-valuemax={MAX} aria-valuenow={Math.min(span, MAX)}>
        <motion.div className="absolute inset-y-0 left-0 rounded-full" style={{ background: "linear-gradient(90deg, var(--gold-deep), var(--gold-strong))" }} initial={{ width: reduce ? `${(Math.min(span, MAX) / MAX) * 100}%` : 0 }} animate={{ width: `${(Math.min(span, MAX) / MAX) * 100}%` }} transition={{ duration: reduce ? 0 : 1.3, ease: FLOW_EASE, delay: 0.2 }} />
        {marks.map((m, i) => {
          const reached = span >= m.day;
          return (
            <motion.span key={m.tier} className={cn("absolute top-1/2 grid h-[18px] w-[18px] -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border-2 transition-colors duration-500", reached ? "border-gold-strong bg-gold-strong text-on-gold" : "border-line-strong bg-surface text-transparent")} style={{ left: `${(m.day / MAX) * 100}%` }} initial={reduce ? false : { scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: "spring", stiffness: 420, damping: 22, delay: 0.35 + i * 0.12 }}>
              <IconCheck className="h-2.5 w-2.5" />
            </motion.span>
          );
        })}
      </div>
      <div className="relative mt-2.5 h-9 text-[11.5px] leading-tight">
        {marks.map((m) => (
          <span key={m.tier} className={cn("absolute top-0", m.tier === 3 ? "-translate-x-full text-right" : "-translate-x-1/2 text-center", span >= m.day ? "text-ink" : "text-faint")} style={{ left: `${(m.day / MAX) * 100}%` }}>
            <span className="block font-semibold">{TIER[m.tier]}</span>
            <span className="block tabular-nums">day {m.day}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** One medal. Locked ones wear a progress ring; ones whose number is reached but whose gate is still closed say when they open. */
function Medal({ s, today, index }: { s: AchievementState; today: string; index: number }) {
  const reduce = useReducedMotion();
  const Icon = ACHIEVEMENT_ICON[s.icon];
  const fresh = s.unlocked && s.on === today;
  const pct = s.current / s.target;
  return (
    <motion.li className="pr-trophy" initial={reduce ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.96 }} animate={{ opacity: 1, y: 0, scale: 1 }} transition={{ duration: 0.6, ease: FLOW_EASE, delay: 0.25 + index * 0.08 }}>
      <span className="relative grid h-[88px] w-[88px] place-items-center">
        {!s.unlocked && <span className="absolute inset-0"><ProgressRing value={s.waiting ? 1 : pct} size={88} stroke={3.5} tone={s.waiting ? "var(--profit)" : "var(--gold-strong)"} delay={0.4 + index * 0.1} /></span>}
        <span className="pr-medal" data-tier={s.unlocked ? s.tier : undefined}>{s.unlocked ? <Icon className="h-full w-full" /> : <LockIcon className="h-full w-full" />}</span>
        {fresh && <span className="pr-new" role="img" aria-label="Unlocked today" style={{ right: 6, top: 6 }} />}
      </span>
      <p className="mt-3 w-full truncate text-[14.5px] font-semibold tracking-[-0.012em] text-ink">{s.title}</p>
      <p className={cn("mt-0.5 text-[12.5px] tabular-nums", s.waiting ? "font-medium text-profit" : "text-muted")}>
        {s.unlocked ? `${TIER[s.tier]}${s.on ? ` · ${formatDateMedium(s.on)}` : ""}` : s.waiting ? `Opens in ${s.daysLeft} ${s.daysLeft === 1 ? "day" : "days"}` : `${s.current.toLocaleString()} / ${s.target.toLocaleString()}`}
      </p>
    </motion.li>
  );
}

/**
 * The shelf: the calendar timeline, then four medals (rarest earned, then whatever is closest), then a sheet with all of them.
 */
export function TrophyCase({ states, today, span, hasStarted, limit = 4 }: { states: AchievementState[]; today: string; /** Calendar days between the first and the latest practice day. */ span: number; hasStarted: boolean; limit?: number }) {
  const [all, setAll] = useState(false);
  const earned = states.filter((s) => s.unlocked);
  const rare = earned.filter((s) => s.tier === 3).sort((a, b) => (b.on ?? "").localeCompare(a.on ?? ""));
  const recent = earned.filter((s) => s.tier !== 3).sort((a, b) => (b.on ?? "").localeCompare(a.on ?? ""));
  const near = states.filter((s) => !s.unlocked).sort((a, b) => Number(b.waiting) - Number(a.waiting) || b.current / b.target - a.current / a.target);
  const shown = [...rare.slice(0, 2), ...recent.slice(0, 1), ...near].slice(0, limit);

  return (
    <section className={cn("rounded-[28px] p-5 sm:p-7", surface.material)} aria-labelledby="pr-trophies">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>Earned over weeks</Eyebrow>
          <h2 id="pr-trophies" className="mt-1.5 text-[22px] font-semibold leading-none tracking-[-0.028em] text-ink">Trophies</h2>
        </div>
        <p className="shrink-0 text-[12.5px] font-medium tabular-nums text-muted">{earned.length} of {states.length} earned</p>
      </div>

      <div className="mt-6 rounded-[20px] border border-line bg-raised px-5 pb-1 pt-4"><GateTimeline span={span} hasStarted={hasStarted} /></div>

      <ul className="pr-trophies mt-7">
        {shown.map((s, i) => <Medal key={s.id} s={s} today={today} index={i} />)}
      </ul>

      <button type="button" onClick={() => { haptic.selection(); setAll(true); }} className="mt-7 flex h-11 w-full items-center justify-center gap-1.5 rounded-full border border-line bg-raised text-[14.5px] font-medium text-ink transition-all duration-200 hover:border-line-strong active:scale-[0.985]">
        See all trophies
        <svg viewBox="0 0 24 24" className="h-4 w-4 text-faint" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9.5 6 6 6-6 6" /></svg>
      </button>

      <AllTrophies open={all} onClose={() => setAll(false)} states={states} span={span} hasStarted={hasStarted} />
    </section>
  );
}

/* --------------------------- all trophies sheet --------------------------- */

function Row({ s, index }: { s: AchievementState; index: number }) {
  const reduce = useReducedMotion();
  const Icon = ACHIEVEMENT_ICON[s.icon];
  const pct = Math.round((s.current / s.target) * 100);
  return (
    <motion.li className="relative flex items-center gap-4 px-4 py-3.5" initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: FLOW_EASE, delay: Math.min(index * 0.04, 0.4) }}>
      <span className="pr-medal !h-12 !w-12 !rounded-[15px] !p-3" data-tier={s.unlocked ? s.tier : undefined}>{s.unlocked ? <Icon className="h-full w-full" /> : <LockIcon className="h-full w-full" />}</span>
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-[15px] font-semibold tracking-[-0.012em] text-ink">{s.title}</p>
          <span className="shrink-0 text-[11px] font-semibold uppercase tracking-[.1em] text-faint">{TIER[s.tier]}</span>
        </div>
        <p className="mt-0.5 text-[13px] leading-snug text-muted">{s.blurb}</p>
        {s.unlocked ? (
          <p className="mt-1.5 text-[12px] font-medium text-profit">{s.on ? `Earned ${formatDateMedium(s.on)}` : "Earned"}</p>
        ) : (
          <div className="mt-2.5 flex items-center gap-3">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-ink/[0.07]" role="progressbar" aria-label={s.title} aria-valuemin={0} aria-valuemax={s.target} aria-valuenow={s.current}>
              <motion.div className="h-full rounded-full" style={{ background: s.waiting ? "var(--profit)" : "var(--gold-strong)" }} initial={{ width: reduce ? `${pct}%` : 0 }} animate={{ width: `${pct}%` }} transition={{ duration: reduce ? 0 : 1, ease: FLOW_EASE, delay: 0.2 + Math.min(index * 0.04, 0.4) }} />
            </div>
            <span className={cn("shrink-0 text-[11.5px] tabular-nums", s.waiting ? "font-medium text-profit" : "text-faint")}>{s.waiting ? `Opens in ${s.daysLeft}d` : `${s.current.toLocaleString()} / ${s.target.toLocaleString()}`}</span>
          </div>
        )}
      </div>
    </motion.li>
  );
}

function AllTrophies({ open, onClose, states, span, hasStarted }: { open: boolean; onClose: () => void; states: AchievementState[]; span: number; hasStarted: boolean }) {
  const earned = states.filter((s) => s.unlocked).length;
  return (
    <Modal open={open} onClose={onClose} size="lg" label="All trophies">
      <SheetFrame onClose={onClose} hint={`${earned} of ${states.length} earned`} actions={<PrimaryButton onClick={onClose}>Done</PrimaryButton>}>
        <div className="pt-4 sm:pt-6">
          <StepTitle title="Trophies" subtitle="Built to take weeks. Each tier opens after enough days of practice, then the numbers decide." />
          <div className="mt-7 rounded-[20px] border border-line bg-raised px-5 pb-1 pt-4"><GateTimeline span={span} hasStarted={hasStarted} /></div>
          <>
            {GROUPS.map((group) => {
              const list = states.filter((s) => s.group === group);
              if (!list.length) return null;
              return (
                <section key={group} className="mt-9">
                  <div className="mb-3 flex items-baseline justify-between px-1">
                    <Eyebrow>{group}</Eyebrow>
                    <span className="text-[12px] tabular-nums text-faint">{list.filter((s) => s.unlocked).length} / {list.length}</span>
                  </div>
                  <ul className="pr-group overflow-hidden rounded-[20px] border border-line bg-raised">
                    {list.map((s, i) => <Row key={s.id} s={s} index={i} />)}
                  </ul>
                </section>
              );
            })}
          </>
        </div>
      </SheetFrame>
    </Modal>
  );
}

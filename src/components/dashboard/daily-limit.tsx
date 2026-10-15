"use client";

/**
 * DailyLimit — "how much am I willing to lose today?", set ONCE per day, from Home.
 *
 *   not locked →  an input card + round-figure chips + "Set limit"
 *   confirm  →  because it can't be changed afterwards, one calm confirmation step (no alarm styling)
 *   locked   →  the live RiskMeter, with a quiet "locked for today" line
 *
 * The plan flow no longer asks this question; it only reads the limit set here.
 */
import { useMemo, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useApp } from "@/lib/store";
import { scopeToPrimary } from "@/lib/challenges";
import { currencySymbol, formatMoney, todayKey } from "@/lib/format";
import { dayTrades, deepestLoss, limitSuggestions, type DayRisk } from "@/lib/risk";
import { RiskMeter } from "@/components/journal/risk-meter";
import { Chip, FLOW_EASE, PrimaryButton, QuietButton } from "@/components/journal/flow-ui";
import { LockIcon } from "@/components/ui/icons";
import { haptic } from "@/lib/haptics";
import { cn } from "@/lib/utils";
import type { CurrencyCode } from "@/lib/types";

/** Positive money only: digits and one decimal point, at most two decimals. */
const cleanAmount = (v: string) => { const t = v.replace(/[^\d.]/g, ""); const [a = "", ...rest] = t.split("."); return rest.length ? `${a}.${rest.join("").slice(0, 2)}` : a; };

export function DailyLimit({ risk, currency }: { risk: DayRisk | null; currency: CurrencyCode }) {
  const entries = useApp((s) => s.entries);
  const rawSettings = useApp((s) => s.settings);
  const sym = currencySymbol(currency);
  const reduce = useReducedMotion();
  // Same easing as the plan flow; with Reduce Motion the swap is a plain cross-fade.
  const swap = { initial: reduce ? { opacity: 0 } : { opacity: 0, y: 6 }, animate: { opacity: 1, y: 0 }, exit: reduce ? { opacity: 0 } : { opacity: 0, y: -6 }, transition: { duration: 0.22, ease: FLOW_EASE } };
  const today = todayKey();

  // Locked only once the limit was confirmed here. A figure carried over from an older plan is offered as the starting
  // amount but still has to be confirmed (and is then locked).
  const locked = useApp((s) => !!s.settings.dayLimits?.[today]);
  const carried = !locked && risk ? risk.limit : null;
  const [value, setValue] = useState(carried ? String(carried) : "");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const amount = value.trim() === "" ? NaN : Number(value);
  const ok = Number.isFinite(amount) && amount > 0;
  const bad = value.trim() !== "" && !ok;
  // The account is the one Home shows: the primary challenge's starting balance plus ITS trades (not the global default).
  const scoped = useMemo(() => scopeToPrimary(rawSettings, entries), [rawSettings, entries]);
  const chips = useMemo(() => limitSuggestions(scoped.entries, scoped.settings.startingEquity), [scoped]);
  const account = scoped.settings.startingEquity > 0 ? scoped.settings.startingEquity + scoped.entries.reduce((s, e) => s + e.pnl, 0) : 0;
  const downToday = useMemo(() => deepestLoss(dayTrades(today, entries)).used, [entries, today]);

  const commit = async () => {
    if (!ok || saving) return;
    setSaving(true); setError(null);
    try {
      const done = await useApp.getState().setDayLimit(today, amount);
      if (done) haptic.success(); else setError("Today's limit is already set.");
    } catch { setError("Couldn't save — try again."); }
    finally { setSaving(false); setConfirming(false); }
  };

  // Locked: the live meter. Nothing to edit — the limit stays until tomorrow.
  if (locked && risk) {
    return (
      <div className="space-y-2">
        <RiskMeter risk={risk} currency={currency} label="Today's limit" compact />
        <p className="flex items-center gap-1.5 px-1 text-[11.5px] text-faint"><LockIcon className="h-3 w-3" /> Set for today — resets tomorrow</p>
      </div>
    );
  }

  return (
    <section aria-label="Set today's loss limit" className="space-y-3">
      <div>
        <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Today&apos;s loss limit</p>
        <p className="mt-1.5 text-[13px] leading-snug text-muted">
          {carried ? "From your earlier plan today. Confirm it to lock it in." : "How much are you willing to lose today? You can set it once a day."}
        </p>
      </div>

      {/* Same card-as-input pattern as the plan flow: tap anywhere to type, the card shows focus. */}
      <div
        onClick={() => !confirming && document.getElementById("home-daylimit")?.focus()}
        className={cn(
          "rounded-[18px] border border-line bg-raised px-4 py-3 transition-[border-color,box-shadow] duration-150 focus-within:border-gold/50 focus-within:ring-4 focus-within:ring-gold/10",
          !confirming && "cursor-text",
        )}
      >
        <div className="flex items-baseline gap-1.5">
          <span className="text-[20px] text-faint">{sym}</span>
          <input
            id="home-daylimit"
            inputMode="decimal"
            enterKeyHint="done"
            autoComplete="off"
            disabled={confirming}
            value={value}
            onChange={(e) => { setValue(cleanAmount(e.target.value)); setError(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && ok) { haptic.selection(); setConfirming(true); } }}
            placeholder="0.00"
            aria-label="Daily loss limit"
            aria-invalid={bad || undefined}
            className={cn("min-w-0 flex-1 border-0 bg-transparent p-0 font-mono text-[26px] tracking-tight text-ink !shadow-none !outline-none !ring-0 placeholder:text-faint/60", bad && "text-loss")}
          />
        </div>
        <p className="mt-1 min-h-4 text-[12px] text-faint">
          {bad ? <span className="text-loss">Numbers only</span>
            : ok && account > 0 ? `${((amount / account) * 100).toFixed(2)}% of your account`
            : "The most you'll accept losing"}
        </p>
      </div>

      {downToday > 0 && (
        <p className="px-1 text-[12.5px] text-muted">
          Today is already down <span className="num font-medium text-loss">{formatMoney(downToday, currency)}</span> at its deepest point.
          {ok && amount <= downToday ? <span className="text-loss"> That is at or past this limit.</span> : null}
        </p>
      )}

      <AnimatePresence initial={false} mode="wait">
        {confirming ? (
          <motion.div key="confirm" {...swap} className="space-y-3">
            <p className="px-1 text-[13px] leading-snug text-ink">
              Lock in <span className="num font-semibold">{formatMoney(amount, currency)}</span> for today? You won&apos;t be able to change it until tomorrow.
            </p>
            <div className="flex items-center justify-end gap-2">
              <QuietButton disabled={saving} onClick={() => setConfirming(false)}>Back</QuietButton>
              <PrimaryButton loading={saving} onClick={() => void commit()}>Lock it in</PrimaryButton>
            </div>
          </motion.div>
        ) : (
          <motion.div key="edit" {...swap} className="space-y-3">
            {chips.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {chips.map((c) => (
                  <Chip key={c.note} selected={ok && amount === c.value} onClick={() => { setValue(String(c.value)); setError(null); }}>
                    {sym}{c.value.toLocaleString("en-US")} <span className="ml-1.5 text-[12.5px] font-normal opacity-70">{c.note}</span>
                  </Chip>
                ))}
              </div>
            )}
            <div className="[&>button]:w-full"><PrimaryButton disabled={!ok} onClick={() => { haptic.selection(); setConfirming(true); }}>Set limit</PrimaryButton></div>
          </motion.div>
        )}
      </AnimatePresence>
      {error && <p role="alert" className="px-1 text-[12.5px] text-loss">{error}</p>}
    </section>
  );
}

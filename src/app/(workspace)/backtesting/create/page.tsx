"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";
import {
  Collapse,
  Disclosure,
  FLOW_EASE,
  GlassIconButton,
  Hint,
  IconBack,
  Label,
  PrimaryButton,
  StepTitle,
  TextBox,
  glass,
} from "@/components/journal/flow-ui";
import { useApp } from "@/lib/store";
import { haptic } from "@/lib/haptics";
import { nyDateKey } from "@/lib/tz";
import { INSTRUMENTS } from "@/lib/backtesting/instruments";
import {
  SESSION_LIST,
  resolvePeriodUtc,
  sessionById,
  validateBacktestConfig,
  type ConfigValidationError,
} from "@/lib/backtesting/sessions";
import { type AccountType, type BacktestConfig, type DrawdownMode, type SessionId, type Timeframe } from "@/lib/backtesting/types";
import { useBacktest } from "@/lib/backtesting/store";

const FUTURES_INSTRUMENTS = INSTRUMENTS.filter((i) => i.assetClass === "futures");
const MARKETS = SESSION_LIST.filter((x) => x.id !== "custom");
const TIMEFRAME: Timeframe = "1m"; // changeable on the chart itself

/* ----------------------------- date helpers ----------------------------- */
// Calendar days are plain YYYY-MM-DD strings handled in UTC, so the user's own timezone can never shift a day.
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const MONTH_FMT = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const DAY_FMT = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });
const LONG_FMT = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const toUtc = (key: string) => new Date(`${key}T00:00:00Z`);
const WEEKDAYS = ["M", "T", "W", "T", "F", "S", "S"];

/** Most recent weekday before today (New York), the latest day we offer. */
function lastTradingDay(): string {
  const d = toUtc(nyDateKey(new Date()));
  do d.setUTCDate(d.getUTCDate() - 1);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6);
  return d.toISOString().slice(0, 10);
}

/** The first day of a range that ends on `max` and covers `n` trading days (weekends skipped). */
function tradingDaysBack(max: string, n: number): string {
  const d = toUtc(max);
  let left = n - 1;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) left--;
  }
  return d.toISOString().slice(0, 10);
}

const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={dir === "l" ? "M14.5 6 8.5 12l6 6" : "M9.5 6l6 6-6 6"} />
  </svg>
);

/** Apple-style segmented control: quiet inset track, a raised white pill that glides to the choice. */
function Seg<T extends string>({ value, options, onChange, layoutId, label }: { value: T; options: { id: T; label: string }[]; onChange: (id: T) => void; layoutId: string; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="grid h-[50px] w-full rounded-[16px] bg-ink/[0.06] p-[3px] shadow-[inset_0_1px_2px_rgb(0_0_0/0.06)]" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((o) => {
        const on = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={on}
            onClick={() => { if (!on) haptic.selection(); onChange(o.id); }}
            className={cn("relative rounded-[13px] text-[15px] tracking-[-0.01em] transition-colors duration-200", on ? "font-semibold text-ink" : "font-medium text-muted hover:text-ink")}
          >
            {on && (
              <motion.span
                layoutId={layoutId}
                transition={{ type: "spring", stiffness: 520, damping: 38 }}
                className="absolute inset-0 rounded-[13px] bg-raised shadow-[0_1px_1px_rgb(0_0_0/0.06),0_6px_14px_-6px_rgb(0_0_0/0.22)] ring-1 ring-black/[0.05] dark:ring-white/10"
              />
            )}
            <span className="relative">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Instrument pill: quiet when off, the same gold fill as the calendar when on. */
function Pill({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={() => { haptic.selection(); onClick(); }}
      className={cn(
        "inline-flex h-11 min-w-[4.25rem] items-center justify-center rounded-full px-5 text-[15px] transition-all duration-200 active:scale-[0.95]",
        on
          ? "bg-gradient-to-b from-gold-strong to-gold-deep font-semibold text-on-gold shadow-[0_8px_16px_-8px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)]"
          : "border border-line bg-raised font-medium text-muted hover:border-line-strong hover:text-ink",
      )}
    >
      {children}
    </button>
  );
}

/** Apple-style range calendar: tap a first day, tap a last day. One tap on the same day = a single day. */
function RangeCalendar({ from, to, anchored, max, onPick, jump }: { from: string; to: string; anchored: boolean; max: string; onPick: (day: string) => void; /** A new object moves the calendar to that day's month (used by the quick ranges). */ jump?: { day: string; n: number } }) {
  const seed = toUtc(from || max);
  const [view, setView] = useState({ y: seed.getUTCFullYear(), m: seed.getUTCMonth() });
  useEffect(() => {
    if (!jump) return;
    const d = toUtc(jump.day);
    setView({ y: d.getUTCFullYear(), m: d.getUTCMonth() });
  }, [jump]);
  const maxD = toUtc(max);
  const atMax = view.y === maxD.getUTCFullYear() && view.m === maxD.getUTCMonth();
  const atMin = view.y <= 2010 && view.m === 0;

  const lead = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const go = (delta: number) => setView((v) => { const d = new Date(Date.UTC(v.y, v.m + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const nav = "grid h-9 w-9 pointer-coarse:h-11 pointer-coarse:w-11 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="rounded-[22px] border border-line bg-raised px-2.5 pb-3 pt-2.5 sm:px-4">
      <div className="mb-1 flex items-center justify-between">
        <AnimatePresence mode="wait" initial={false}>
          <motion.p key={`${view.y}-${view.m}`} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className="pl-2 text-[16px] font-semibold tracking-[-0.01em] text-ink">
            {MONTH_FMT.format(new Date(Date.UTC(view.y, view.m, 1)))}
          </motion.p>
        </AnimatePresence>
        <div className="flex items-center gap-0.5">
          <button type="button" aria-label="Previous month" disabled={atMin} onClick={() => go(-1)} className={nav}><Chevron dir="l" /></button>
          <button type="button" aria-label="Next month" disabled={atMax} onClick={() => go(1)} className={nav}><Chevron dir="r" /></button>
        </div>
      </div>

      <div className="grid grid-cols-7 pb-1">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.08em] text-faint">{w}</span>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-y-1">
        {cells.map((d, i) => {
          if (d === null) return <span key={`b${i}`} />;
          const key = ymd(view.y, view.m, d);
          const dow = (lead + d - 1) % 7;
          const off = dow > 4 || key > max;
          const isStart = key === from;
          const isEnd = key === to;
          const inRange = !!from && !!to && key >= from && key <= to && from !== to;
          return (
            <div
              key={key}
              className={cn(
                "relative flex justify-center py-px",
                inRange && "bg-gold/[0.14]",
                inRange && (isStart || dow === 0) && "rounded-l-full",
                inRange && (isEnd || dow === 6) && "rounded-r-full",
              )}
            >
              <button
                type="button"
                disabled={off}
                aria-label={LONG_FMT.format(toUtc(key))}
                aria-pressed={isStart || isEnd}
                onClick={() => { haptic.selection(); onPick(key); }}
                className={cn(
                  "grid aspect-square w-full max-w-[2.75rem] place-items-center rounded-full text-[15px] tabular-nums transition-all duration-150 active:scale-[0.92]",
                  isStart || isEnd
                    ? "bg-gradient-to-b from-gold-strong to-gold-deep font-semibold text-on-gold shadow-[0_6px_14px_-6px_var(--gold-strong),inset_0_1px_0_rgb(255_255_255/0.28)]"
                    : off ? "cursor-default text-faint/40" : "text-ink hover:bg-ink/[0.06]",
                  from && to && anchored && !off && key !== from && "hover:bg-gold/10",
                )}
              >
                {d}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function CreateBacktestPage() {
  const router = useRouter();
  const settings = useApp((s) => s.settings);
  const initSession = useBacktest((s) => s.initSession);
  const saveSession = useBacktest((s) => s.saveSession);
  const sym = currencySymbol(settings.currency);
  const maxDay = useMemo(lastTradingDay, []);
  const reduce = useReducedMotion();

  const [instruments, setInstruments] = useState<string[]>(["NQ"]);
  const [sessionId, setSessionId] = useState<SessionId>("new-york");

  // Replay range: one calendar, two taps.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [anchored, setAnchored] = useState(false);
  const [jump, setJump] = useState<{ day: string; n: number } | undefined>(undefined);

  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [startingBalance, setStartingBalance] = useState(String(settings.startingEquity || 50000));
  const [maxDrawdown, setMaxDrawdown] = useState("2500");
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>("static");
  const [dailyLossLimit, setDailyLossLimit] = useState("");
  const [maxContracts, setMaxContracts] = useState("");
  const [consistencyEnabled, setConsistencyEnabled] = useState(false);
  const [consistencyPct, setConsistencyPct] = useState("30");

  const [errors, setErrors] = useState<ConfigValidationError[]>([]);
  const [creating, setCreating] = useState(false);

  const session = sessionById(sessionId);
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;
  const hasRange = !!fromDate && !!toDate;

  function toggleInstrument(symbol: string) {
    setInstruments((prev) => (prev.includes(symbol) ? prev.filter((x) => x !== symbol) : [...prev, symbol]));
  }

  function pickDay(day: string) {
    setErrors((e) => e.filter((x) => x.field !== "period"));
    if (!anchored) {
      setFromDate(day);
      setToDate(day);
      setAnchored(true);
    } else {
      const [a, b] = day < fromDate ? [day, fromDate] : [fromDate, day];
      setFromDate(a);
      setToDate(b);
      setAnchored(false);
    }
  }

  // Quick ranges: one tap instead of two taps and some month-flipping. Always end on the latest trading day.
  const presets = useMemo(() => [
    { id: "day", label: "Last day", from: maxDay },
    { id: "week", label: "Last 5 days", from: tradingDaysBack(maxDay, 5) },
    { id: "two", label: "Last 2 weeks", from: tradingDaysBack(maxDay, 10) },
  ], [maxDay]);
  function applyPreset(from: string) {
    setErrors((e) => e.filter((x) => x.field !== "period"));
    setFromDate(from);
    setToDate(maxDay);
    setAnchored(false);
    setJump((j) => ({ day: maxDay, n: (j?.n ?? 0) + 1 })); // show the month of the latest day
  }

  // The window always spans the market session's own hours; the chart's playback controls do the rest.
  const config = useMemo<Partial<BacktestConfig>>(() => {
    const tz = session.timezone;
    const period = hasRange ? resolvePeriodUtc(fromDate, session.startTime ?? "09:30", toDate, session.endTime ?? "16:00", tz) : null;
    return {
      sessionName: `${instruments.join(" · ") || "Replay"} · ${fromDate || "session"}`,
      instruments,
      instrumentSymbol: instruments[0] || "NQ",
      sessionId,
      accountType,
      startingBalance: Number(startingBalance) || 0,
      currency: settings.currency,
      propRules:
        accountType === "prop"
          ? {
              maxDrawdown: Number(maxDrawdown) || 0,
              drawdownMode,
              dailyLossLimit: dailyLossLimit ? Number(dailyLossLimit) : null,
              maxContracts: maxContracts ? Number(maxContracts) : null,
              consistencyRule: consistencyEnabled ? { enabled: true, maxDailyProfitPct: Number(consistencyPct) || 30 } : undefined,
            }
          : undefined,
      periodStartUtc: period?.startUtc,
      periodEndUtc: period?.endUtc,
      timeframe: TIMEFRAME,
    };
  }, [instruments, sessionId, session, accountType, startingBalance, settings.currency, maxDrawdown, drawdownMode, dailyLossLimit, maxContracts, consistencyEnabled, consistencyPct, fromDate, toDate, hasRange]);

  async function handleCreate() {
    const found = validateBacktestConfig(config);
    if (instruments.length === 0) found.push({ field: "instruments", message: "Select at least one instrument" });
    setErrors(found);
    if (found.length > 0) return;
    initSession(config as BacktestConfig);
    await saveSession();
    const id = useBacktest.getState().sessionId;
    router.push(`/backtesting/session?id=${id}`);
  }

  const onCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await handleCreate();
    } finally {
      setCreating(false);
    }
  };

  // ⌘↵ / Ctrl↵ starts the replay, same shortcut as Plan Trade.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void onCreate();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const firstError = errors[0]?.message ?? null;
  const rangeText = hasRange ? (fromDate === toDate ? DAY_FMT.format(toUtc(fromDate)) : `${DAY_FMT.format(toUtc(fromDate))} – ${DAY_FMT.format(toUtc(toDate))}`) : "";
  // One calm line in the footer: the error, else what to do next, else exactly what will start.
  const footerHint = firstError ?? (anchored ? "Tap the last day, or the same day again for a single day" : !hasRange ? "Pick a start and end day to begin" : `${rangeText} · ${instruments.join(", ") || "no instrument"} · ${session.label}`);
  const shortName = (n: string) => n.replace("Micro E-mini ", "Micro ").replace("E-mini ", "");
  const rise = (i: number) => (reduce ? {} : { initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: FLOW_EASE, delay: 0.05 + i * 0.07 } });

  return (
    <div className="mx-auto w-full max-w-[40rem] pb-6 lg:max-w-[62rem]">
      <div className="mb-4 flex items-center">
        <GlassIconButton label="Back to Trading Lab" onClick={() => router.push("/lab#backtesting")}>
          <IconBack />
        </GlassIconButton>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: FLOW_EASE }}
        className="rounded-[28px] border border-line bg-surface shadow-lift"
      >
        <div className="mx-auto max-w-[32rem] px-4 pb-8 pt-7 sm:px-8 sm:pb-10 sm:pt-10 lg:max-w-none lg:px-12 lg:pb-12 lg:pt-12">
          <motion.div {...rise(0)}>
            <StepTitle title="New replay" subtitle="Pick the days, then trade them bar by bar." />
          </motion.div>

          {/* Phone & tablet: one calm column. Laptop & desktop: the calendar on the left, the settings beside it, nothing to scroll past. */}
          <div className="mt-8 space-y-9 lg:mt-10 lg:grid lg:grid-cols-[minmax(0,27rem)_minmax(0,1fr)] lg:items-start lg:gap-x-14 lg:space-y-0">
          <div className="space-y-9">

          {/* When — the one thing that matters */}
          <motion.div {...rise(1)} className="space-y-3">
            <Label>When</Label>
            <div className="grid grid-cols-2 overflow-hidden rounded-[18px] border border-line bg-raised">
              {([["From", fromDate, !anchored && !hasRange], ["To", toDate, anchored]] as const).map(([label, value, active], i) => (
                <div key={label} className={cn("relative px-4 py-3 transition-colors duration-200", i === 1 && "border-l border-line", active && "bg-gold/[0.07]")}>
                  <p className={cn("text-[11px] font-semibold uppercase tracking-[0.12em]", active ? "text-gold" : "text-faint")}>{label}</p>
                  <AnimatePresence mode="wait" initial={false}>
                    <motion.p key={value || "none"} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={{ duration: 0.14 }} className={cn("mt-0.5 text-[19px] font-semibold tracking-[-0.02em] tabular-nums", value ? "text-ink" : "text-faint/60")}>
                      {value ? DAY_FMT.format(toUtc(value)) : "Select"}
                    </motion.p>
                  </AnimatePresence>
                </div>
              ))}
            </div>
            <div role="group" aria-label="Quick ranges" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden">
              {presets.map((pr) => {
                const on = fromDate === pr.from && toDate === maxDay && !anchored;
                return (
                  <button
                    key={pr.id}
                    type="button"
                    aria-pressed={on}
                    onClick={() => { haptic.selection(); applyPreset(pr.from); }}
                    className={cn("inline-flex h-8 pointer-coarse:h-10 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-medium transition-all duration-200 active:scale-[0.96]", on ? "border-gold/55 bg-gold/10 text-gold" : "border-line bg-raised text-muted hover:border-line-strong hover:text-ink")}
                  >
                    {pr.label}
                  </button>
                );
              })}
            </div>
            <RangeCalendar from={fromDate} to={toDate} anchored={anchored} max={maxDay} onPick={pickDay} jump={jump} />
            {errorFor("period") && <p role="alert" className="text-[13px] text-loss">{errorFor("period")}</p>}
          </motion.div>

          </div>

          <div className="space-y-9">
          {/* Instruments */}
          <motion.div {...rise(2)} className="space-y-3">
            <Label>Instruments</Label>
            <div className="flex flex-wrap gap-2">
              {FUTURES_INSTRUMENTS.map((inst) => (
                <Pill key={inst.symbol} on={instruments.includes(inst.symbol)} onClick={() => toggleInstrument(inst.symbol)}>
                  <span className="font-mono" title={shortName(inst.name)}>{inst.symbol}</span>
                </Pill>
              ))}
            </div>
            {errorFor("instruments") && <p role="alert" className="text-[13px] text-loss">{errorFor("instruments")}</p>}
          </motion.div>

          {/* Market */}
          <motion.div {...rise(3)} className="space-y-3">
            <Label>Market</Label>
            <Seg layoutId="seg-market" label="Market" value={sessionId} onChange={setSessionId} options={MARKETS.map((x) => ({ id: x.id, label: x.label }))} />
          </motion.div>

          {/* Account */}
          <motion.div {...rise(4)} className="space-y-3">
            <Label>Account</Label>
            <Seg layoutId="seg-account" label="Account type" value={accountType} onChange={setAccountType} options={[{ id: "personal", label: "Real" }, { id: "prop", label: "Prop" }]} />
            <div className="space-y-2 pt-1">
              <Label htmlFor="start-balance">Starting balance</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-faint">{sym}</span>
                <TextBox id="start-balance" type="number" min={0} step={100} inputMode="decimal" enterKeyHint="done" className="pl-9 text-[17px] font-medium tabular-nums" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} />
              </div>
            </div>
            {errorFor("startingBalance") && <p role="alert" className="text-[13px] text-loss">{errorFor("startingBalance")}</p>}

            <AnimatePresence initial={false}>
              {accountType === "prop" && (
                <Collapse>
                  <div className="space-y-4 pt-2">
                    <div className="grid items-start gap-3 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="max-dd">Max drawdown</Label>
                        <TextBox id="max-dd" type="number" min={0} step={50} inputMode="decimal" className="tabular-nums" value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value)} />
                        {errorFor("propRules.maxDrawdown") && <p role="alert" className="text-[13px] text-loss">{errorFor("propRules.maxDrawdown")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Type</Label>
                        <Seg layoutId="seg-dd" label="Drawdown type" value={drawdownMode} onChange={setDrawdownMode} options={[{ id: "static", label: "Static" }, { id: "trailing", label: "Trailing" }]} />
                      </div>
                    </div>
                    <Disclosure label="More rules">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-2">
                          <Label htmlFor="daily-loss">Daily loss limit</Label>
                          <TextBox id="daily-loss" type="number" min={0} step={50} inputMode="decimal" className="tabular-nums" value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value)} />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="max-contracts">Max contracts</Label>
                          <TextBox id="max-contracts" type="number" min={0} step={1} inputMode="numeric" className="tabular-nums" value={maxContracts} onChange={(e) => setMaxContracts(e.target.value)} />
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-[15px] font-medium text-ink">Consistency rule</p>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={consistencyEnabled}
                          aria-label="Consistency rule"
                          onClick={() => { haptic.selection(); setConsistencyEnabled((v) => !v); }}
                          className={cn("relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200", consistencyEnabled ? "bg-profit" : "bg-ink/[0.15]")}
                        >
                          <span className={cn("absolute top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.25)] transition-all duration-200", consistencyEnabled ? "left-[22px]" : "left-[2px]")} />
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {consistencyEnabled && (
                          <Collapse>
                            <div className="max-w-[12rem] space-y-2">
                              <Label htmlFor="consistency-pct">Max daily share (%)</Label>
                              <TextBox id="consistency-pct" type="number" min={1} max={100} step={1} inputMode="numeric" className="tabular-nums" value={consistencyPct} onChange={(e) => setConsistencyPct(e.target.value)} />
                            </div>
                          </Collapse>
                        )}
                      </AnimatePresence>
                    </Disclosure>
                  </div>
                </Collapse>
              )}
            </AnimatePresence>
          </motion.div>
          </div>
          </div>
        </div>

        <footer className={cn("sticky bottom-[var(--chrome-bottom,0px)] z-20 rounded-b-[28px] border-t border-line/60 px-4 py-3 sm:px-8 sm:py-4 lg:px-12", glass.bar)}>
          <div className="mx-auto flex max-w-[32rem] items-center justify-between gap-3 sm:gap-4 lg:max-w-none">
            <div className="min-w-0 flex-1 text-[12.5px] text-faint">
              <div className="truncate" aria-live="polite"><Hint text={footerHint} tone={firstError ? "warn" : "muted"} /></div>
            </div>
            <PrimaryButton shortcut loading={creating} disabled={!hasRange} onClick={onCreate}>
              Start replay
            </PrimaryButton>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}

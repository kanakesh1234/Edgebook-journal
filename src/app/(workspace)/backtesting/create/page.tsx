"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";
import { currencySymbol } from "@/lib/format";
import {
  Chip,
  Collapse,
  Disclosure,
  FLOW_EASE,
  GlassIconButton,
  Hint,
  IconBack,
  Label,
  PrimaryButton,
  Segmented,
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

const Chevron = ({ dir }: { dir: "l" | "r" }) => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={dir === "l" ? "M14.5 6 8.5 12l6 6" : "M9.5 6l6 6-6 6"} />
  </svg>
);

/** Apple-style range calendar: tap a first day, tap a last day. One tap on the same day = a single day. */
function RangeCalendar({ from, to, anchored, max, onPick }: { from: string; to: string; anchored: boolean; max: string; onPick: (day: string) => void }) {
  const seed = toUtc(from || max);
  const [view, setView] = useState({ y: seed.getUTCFullYear(), m: seed.getUTCMonth() });
  const maxD = toUtc(max);
  const atMax = view.y === maxD.getUTCFullYear() && view.m === maxD.getUTCMonth();
  const atMin = view.y <= 2010 && view.m === 0;

  const lead = (new Date(Date.UTC(view.y, view.m, 1)).getUTCDay() + 6) % 7; // Monday-first
  const days = new Date(Date.UTC(view.y, view.m + 1, 0)).getUTCDate();
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
  const go = (delta: number) => setView((v) => { const d = new Date(Date.UTC(v.y, v.m + delta, 1)); return { y: d.getUTCFullYear(), m: d.getUTCMonth() }; });
  const nav = "grid h-9 w-9 place-items-center rounded-full text-muted transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:pointer-events-none disabled:opacity-30";

  return (
    <div className="rounded-[22px] border border-line bg-raised px-3 pb-3 pt-2.5 sm:px-4">
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
                "relative flex justify-center",
                inRange && "bg-gold/[0.12]",
                inRange && (isStart || dow === 0) && "rounded-l-full",
                inRange && (isEnd || dow === 6 || dow === 4) && "rounded-r-full",
              )}
            >
              <button
                type="button"
                disabled={off}
                aria-label={LONG_FMT.format(toUtc(key))}
                aria-pressed={isStart || isEnd}
                onClick={() => { haptic.selection(); onPick(key); }}
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-full text-[15px] tabular-nums transition-all duration-150 active:scale-[0.92]",
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

  const [instruments, setInstruments] = useState<string[]>(["NQ"]);
  const [sessionId, setSessionId] = useState<SessionId>("new-york");

  // Replay range: one calendar, two taps.
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [anchored, setAnchored] = useState(false);

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
  const shortName = (n: string) => n.replace("Micro E-mini ", "Micro ").replace("E-mini ", "");
  const rise = (i: number) => ({ initial: { opacity: 0, y: 12 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.5, ease: FLOW_EASE, delay: 0.05 + i * 0.07 } });

  return (
    <div className="mx-auto w-full max-w-[40rem] pb-6">
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
        <div className="mx-auto max-w-[32rem] space-y-9 px-6 pb-10 pt-10 sm:px-8">
          <motion.div {...rise(0)}>
            <StepTitle title="New replay" />
          </motion.div>

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
            <RangeCalendar from={fromDate} to={toDate} anchored={anchored} max={maxDay} onPick={pickDay} />
            {errorFor("period") && <p role="alert" className="text-[13px] text-loss">{errorFor("period")}</p>}
          </motion.div>

          {/* Instruments */}
          <motion.div {...rise(2)} className="space-y-3">
            <Label>Instruments</Label>
            <div className="flex flex-wrap gap-2">
              {FUTURES_INSTRUMENTS.map((inst) => (
                <Chip key={inst.symbol} selected={instruments.includes(inst.symbol)} onClick={() => toggleInstrument(inst.symbol)}>
                  <span className="font-mono font-semibold" title={shortName(inst.name)}>{inst.symbol}</span>
                </Chip>
              ))}
            </div>
            {errorFor("instruments") && <p role="alert" className="text-[13px] text-loss">{errorFor("instruments")}</p>}
          </motion.div>

          {/* Market */}
          <motion.div {...rise(3)} className="space-y-3">
            <Label>Market</Label>
            <Segmented fullWidth layoutId="seg-market" label="Market" value={sessionId} onChange={setSessionId} options={MARKETS.map((x) => ({ id: x.id, label: x.label }))} />
          </motion.div>

          {/* Account */}
          <motion.div {...rise(4)} className="space-y-3">
            <Label>Account</Label>
            <Segmented fullWidth layoutId="seg-account" label="Account type" value={accountType} onChange={setAccountType} options={[{ id: "personal", label: "Real" }, { id: "prop", label: "Prop" }]} />
            <div className="relative pt-1">
              <span className="pointer-events-none absolute left-4 top-1/2 mt-0.5 -translate-y-1/2 text-[16px] text-faint">{sym}</span>
              <TextBox aria-label="Starting balance" type="number" min={0} step={100} inputMode="decimal" className="pl-9 text-[17px] font-medium tabular-nums" value={startingBalance} onChange={(e) => setStartingBalance(e.target.value)} />
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
                        <Segmented fullWidth layoutId="seg-dd" label="Drawdown type" value={drawdownMode} onChange={setDrawdownMode} options={[{ id: "static", label: "Static" }, { id: "trailing", label: "Trailing" }]} className="h-[50px] items-center" />
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

        <footer className={cn("sticky bottom-[var(--chrome-bottom,0px)] z-20 rounded-b-[28px] border-t border-line/60 px-5 py-3.5 sm:px-8 sm:py-4", glass.bar)}>
          <div className="mx-auto flex max-w-[32rem] items-center justify-between gap-4">
            <div className="min-w-0 flex-1 text-[12.5px] text-faint">
              <Hint text={firstError} tone="warn" />
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

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
import { INSTRUMENTS } from "@/lib/backtesting/instruments";
import {
  SESSION_LIST,
  resolvePeriodUtc,
  sessionById,
  validateBacktestConfig,
  type ConfigValidationError,
} from "@/lib/backtesting/sessions";
import { TIMEFRAMES, type AccountType, type BacktestConfig, type DrawdownMode, type SessionId, type Timeframe } from "@/lib/backtesting/types";
import { useBacktest } from "@/lib/backtesting/store";

const QUICK_WINDOWS = [
  { label: "09:30–09:45", start: "09:30", end: "09:45" },
  { label: "09:30–10:00", start: "09:30", end: "10:00" },
  { label: "09:30–11:30", start: "09:30", end: "11:30" },
  { label: "Full Session", start: "09:30", end: "16:00" },
];

const COMMON_TIMEFRAMES: Timeframe[] = ["1m", "3m", "5m", "15m", "1h"];

const FUTURES_INSTRUMENTS = INSTRUMENTS.filter(i => i.assetClass === "futures");

export default function CreateBacktestPage() {
  const router = useRouter();
  const settings = useApp((s) => s.settings);
  const initSession = useBacktest((s) => s.initSession);
  const saveSession = useBacktest((s) => s.saveSession);

  // Session name
  const [sessionName, setSessionName] = useState("");

  // Multi-instrument selection
  const [selectedInstruments, setSelectedInstruments] = useState<string[]>(["NQ", "ES"]);

  const [sessionId, setSessionId] = useState<SessionId>("new-york");
  const [customStart, setCustomStart] = useState("09:30");
  const [customEnd, setCustomEnd] = useState("09:45");

  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [startingBalance, setStartingBalance] = useState(String(settings.startingEquity || 50000));
  const [maxDrawdown, setMaxDrawdown] = useState("2500");
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>("static");
  const [dailyLossLimit, setDailyLossLimit] = useState("");
  const [maxContracts, setMaxContracts] = useState("");

  // Consistency rule
  const [consistencyEnabled, setConsistencyEnabled] = useState(false);
  const [consistencyPct, setConsistencyPct] = useState("30");

  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("09:30");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("09:45");

  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [errors, setErrors] = useState<ConfigValidationError[]>([]);

  const session = sessionById(sessionId);
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  function toggleInstrument(symbol: string) {
    setSelectedInstruments(prev =>
      prev.includes(symbol)
        ? prev.filter(s => s !== symbol)
        : [...prev, symbol],
    );
  }

  function applyQuickWindow(start: string, end: string) {
    setFromTime(start);
    setToTime(end);
    setCustomStart(start);
    setCustomEnd(end);
  }

  const config = useMemo<Partial<BacktestConfig>>(() => {
    const tz = session.timezone;
    const period = fromDate && toDate ? resolvePeriodUtc(fromDate, fromTime, toDate, toTime, tz) : null;
    return {
      sessionName: sessionName || `Backtest ${fromDate || "session"}`,
      instruments: selectedInstruments,
      instrumentSymbol: selectedInstruments[0] || "NQ",
      sessionId,
      customSession: sessionId === "custom" ? { startTime: customStart, endTime: customEnd, timezone: tz } : undefined,
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
              consistencyRule: consistencyEnabled
                ? { enabled: true, maxDailyProfitPct: Number(consistencyPct) || 30 }
                : undefined,
            }
          : undefined,
      periodStartUtc: period?.startUtc,
      periodEndUtc: period?.endUtc,
      timeframe,
    };
  }, [
    sessionName, selectedInstruments, sessionId, session.timezone, customStart, customEnd,
    accountType, startingBalance, settings.currency, maxDrawdown, drawdownMode,
    dailyLossLimit, maxContracts, consistencyEnabled, consistencyPct,
    fromDate, fromTime, toDate, toTime, timeframe,
  ]);

  async function handleCreate() {
    const found = validateBacktestConfig(config);
    if (selectedInstruments.length === 0) {
      found.push({ field: "instruments", message: "Select at least one instrument" });
    }
    setErrors(found);
    if (found.length > 0) return;

    // Initialize session in store
    initSession(config as BacktestConfig);
    // Save to IndexedDB
    await saveSession();
    // Navigate to workspace
    const id = useBacktest.getState().sessionId;
    router.push(`/backtesting/session?id=${id}`);
  }

  const [moreTimeframes, setMoreTimeframes] = useState(false);
  const [creating, setCreating] = useState(false);
  const sym = currencySymbol(settings.currency);

  const onCreate = async () => {
    if (creating) return;
    setCreating(true);
    try {
      await handleCreate();
    } finally {
      setCreating(false);
    }
  };

  // ⌘↵ / Ctrl↵ creates the session, same shortcut as Plan Trade.
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
  const summary = [selectedInstruments.join(", ") || "No instrument", session.label === "Custom Session" ? "Custom" : session.label, timeframe].join(" · ");
  const visibleTimeframes = moreTimeframes || !COMMON_TIMEFRAMES.includes(timeframe) ? TIMEFRAMES : COMMON_TIMEFRAMES;
  const shortName = (n: string) => n.replace("Micro E-mini ", "Micro ").replace("E-mini ", "");

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
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
        className="rounded-[28px] border border-line bg-surface shadow-lift"
      >
        <div className="space-y-10 px-6 pb-10 pt-9 sm:px-10">
          <div>
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">Trading Lab · Replay</p>
            <StepTitle title="New replay session" subtitle="Pick what to practise. You can change the timeframe on the chart." />
          </div>

          {/* Name */}
          <div className="space-y-2.5">
            <Label hint="optional" htmlFor="session-name">Name</Label>
            <TextBox
              id="session-name"
              placeholder="e.g. NQ morning scalp"
              value={sessionName}
              onChange={(e) => setSessionName(e.target.value)}
            />
          </div>

          {/* Instruments */}
          <div className="space-y-3">
            <Label done={selectedInstruments.length > 0}>Instruments</Label>
            <div className="flex flex-wrap gap-2">
              {FUTURES_INSTRUMENTS.map((inst) => (
                <Chip key={inst.symbol} selected={selectedInstruments.includes(inst.symbol)} onClick={() => toggleInstrument(inst.symbol)}>
                  <span className="font-mono font-semibold">{inst.symbol}</span>
                  <span className="ml-2 text-[13px] font-normal opacity-60">{shortName(inst.name)}</span>
                </Chip>
              ))}
            </div>
            {errorFor("instruments") && <p role="alert" className="text-[13px] text-loss">{errorFor("instruments")}</p>}
          </div>

          {/* Market session */}
          <div className="space-y-3">
            <Label>Market session</Label>
            <Segmented
              fullWidth
              layoutId="seg-market"
              label="Market session"
              value={sessionId}
              onChange={(id) => setSessionId(id)}
              options={SESSION_LIST.map((x) => ({ id: x.id, label: x.id === "custom" ? "Custom" : x.label }))}
            />
            <AnimatePresence initial={false} mode="wait">
              {sessionId === "custom" ? (
                <Collapse key="custom">
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <div className="space-y-2">
                      <Label htmlFor="custom-start">Start</Label>
                      <TextBox id="custom-start" type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="custom-end">End</Label>
                      <TextBox id="custom-end" type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
                    </div>
                  </div>
                </Collapse>
              ) : (
                <motion.p key="hours" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.16 }} className="text-[13px] text-faint">
                  {session.startTime}–{session.endTime} · {session.timezone}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          {/* Account */}
          <div className="space-y-3">
            <Label>Account</Label>
            <Segmented
              fullWidth
              layoutId="seg-account"
              label="Account type"
              value={accountType}
              onChange={(id) => setAccountType(id)}
              options={[
                { id: "personal", label: "Real" },
                { id: "prop", label: "Prop" },
              ]}
            />
            <div className="space-y-2.5 pt-3">
              <Label htmlFor="starting-balance">Starting balance</Label>
              <div className="relative">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[16px] text-faint">{sym}</span>
                <TextBox
                  id="starting-balance"
                  type="number"
                  min={0}
                  step={100}
                  inputMode="decimal"
                  className="pl-9 tabular-nums"
                  value={startingBalance}
                  onChange={(e) => setStartingBalance(e.target.value)}
                />
              </div>
              {errorFor("startingBalance") && <p role="alert" className="text-[13px] text-loss">{errorFor("startingBalance")}</p>}
            </div>

            <AnimatePresence initial={false}>
              {accountType === "prop" && (
                <Collapse>
                  <div className="mt-3 space-y-5 rounded-[22px] border border-line bg-ink/[0.025] p-5">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">Prop risk rules</p>
                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <Label htmlFor="max-dd">Max drawdown</Label>
                        <TextBox id="max-dd" type="number" min={0} step={50} inputMode="decimal" className="tabular-nums" value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value)} />
                        {errorFor("propRules.maxDrawdown") && <p role="alert" className="text-[13px] text-loss">{errorFor("propRules.maxDrawdown")}</p>}
                      </div>
                      <div className="space-y-2">
                        <Label>Drawdown type</Label>
                        <Segmented
                          fullWidth
                          compact
                          layoutId="seg-dd"
                          label="Drawdown type"
                          value={drawdownMode}
                          onChange={(id) => setDrawdownMode(id)}
                          options={[
                            { id: "static", label: "Static" },
                            { id: "trailing", label: "Trailing" },
                          ]}
                          className="h-[50px] items-center"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label hint="optional" htmlFor="daily-loss">Daily loss limit</Label>
                        <TextBox id="daily-loss" type="number" min={0} step={50} inputMode="decimal" className="tabular-nums" value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value)} />
                      </div>
                      <div className="space-y-2">
                        <Label hint="optional" htmlFor="max-contracts">Max contracts</Label>
                        <TextBox id="max-contracts" type="number" min={0} step={1} inputMode="numeric" className="tabular-nums" value={maxContracts} onChange={(e) => setMaxContracts(e.target.value)} />
                      </div>
                    </div>

                    <div className="space-y-3 border-t border-line pt-4">
                      <div className="flex items-center justify-between gap-4">
                        <div>
                          <p className="text-[15px] font-medium text-ink">Consistency rule</p>
                          <p className="text-[13px] text-muted">Cap how much one day can contribute to total profit.</p>
                        </div>
                        <button
                          type="button"
                          role="switch"
                          aria-checked={consistencyEnabled}
                          aria-label="Consistency rule"
                          onClick={() => setConsistencyEnabled((v) => !v)}
                          className={cn(
                            "relative h-[30px] w-[50px] shrink-0 rounded-full transition-colors duration-200",
                            consistencyEnabled ? "bg-profit" : "bg-ink/[0.15]",
                          )}
                        >
                          <span className={cn("absolute top-[2px] h-[26px] w-[26px] rounded-full bg-white shadow-[0_2px_4px_rgb(0_0_0/0.25)] transition-all duration-200", consistencyEnabled ? "left-[22px]" : "left-[2px]")} />
                        </button>
                      </div>
                      <AnimatePresence initial={false}>
                        {consistencyEnabled && (
                          <Collapse>
                            <div className="max-w-[12rem] space-y-2 pt-1">
                              <Label htmlFor="consistency-pct">Max daily share (%)</Label>
                              <TextBox id="consistency-pct" type="number" min={1} max={100} step={1} inputMode="numeric" className="tabular-nums" value={consistencyPct} onChange={(e) => setConsistencyPct(e.target.value)} />
                            </div>
                          </Collapse>
                        )}
                      </AnimatePresence>
                    </div>
                  </div>
                </Collapse>
              )}
            </AnimatePresence>
          </div>

          {/* Replay window */}
          <div className="space-y-3">
            <Label done={!!fromDate && !!toDate}>Replay window</Label>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextBox
                aria-label="From date"
                type="date"
                value={fromDate}
                onChange={(e) => {
                  const v = e.target.value;
                  setFromDate(v);
                  // Most replays are a single day: mirror the end date until the user changes it.
                  if (!toDate || toDate < v) setToDate(v);
                }}
              />
              <TextBox aria-label="To date" type="date" value={toDate} min={fromDate || undefined} onChange={(e) => setToDate(e.target.value)} />
            </div>
            <div className="flex flex-wrap gap-2 pt-1">
              {QUICK_WINDOWS.map((w) => (
                <Chip key={w.label} selected={fromTime === w.start && toTime === w.end} onClick={() => applyQuickWindow(w.start, w.end)}>
                  {w.label}
                </Chip>
              ))}
            </div>
            {errorFor("period") && <p role="alert" className="text-[13px] text-loss">{errorFor("period")}</p>}
            <Disclosure label="Fine-tune time">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label htmlFor="from-time">From</Label>
                  <TextBox id="from-time" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="to-time">To</Label>
                  <TextBox id="to-time" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
                </div>
              </div>
              <p className="text-[13px] text-faint">Times in {session.timezone} · DST handled automatically.</p>
            </Disclosure>
          </div>

          {/* Timeframe */}
          <div className="space-y-3">
            <Label>Starting timeframe</Label>
            <div className="flex flex-wrap gap-2">
              {visibleTimeframes.map((tf) => (
                <Chip key={tf} selected={timeframe === tf} onClick={() => setTimeframe(tf)}>
                  <span className="font-mono">{tf}</span>
                </Chip>
              ))}
              {visibleTimeframes === COMMON_TIMEFRAMES && <Chip selected={false} onClick={() => setMoreTimeframes(true)}>More…</Chip>}
            </div>
            {errorFor("timeframe") && <p role="alert" className="text-[13px] text-loss">{errorFor("timeframe")}</p>}
          </div>
        </div>

        {/* Glass action bar — same as Plan Trade */}
        <footer className={cn("sticky bottom-[var(--chrome-bottom,0px)] z-20 rounded-b-[28px] border-t border-line/60 px-5 py-3.5 sm:px-10 sm:py-4", glass.bar)}>
          <div className="flex items-center justify-between gap-4">
            <div className="min-w-0 flex-1 text-[12.5px] text-faint">
              <Hint text={firstError ?? summary} tone={firstError ? "warn" : "muted"} />
            </div>
            <PrimaryButton shortcut loading={creating} onClick={onCreate}>
              Create session
            </PrimaryButton>
          </div>
        </footer>
      </motion.div>
    </div>
  );
}

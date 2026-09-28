"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Field, Select, TextInput } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { CandlestickIcon } from "@/components/ui/icons";
import { cn } from "@/lib/utils";
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-3">
        <button
          onClick={() => router.push("/backtesting")}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-line bg-raised text-faint hover:text-ink transition-colors"
        >
          <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" />
          </svg>
        </button>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Create Backtest Session</h1>
          <p className="text-sm text-faint">Configure your replay session before entering the chart.</p>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6 rounded-control border border-line bg-surface p-5 sm:p-6"
      >
        {/* Session Name */}
        <Field label="Session name" htmlFor="session-name">
          <TextInput
            id="session-name"
            placeholder="e.g. NQ Morning Scalp 2026-08-28"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
          />
        </Field>

        {/* Instruments — multi-select checkboxes */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted">Instruments</p>
          {errorFor("instruments") && <p className="text-[11px] text-loss">{errorFor("instruments")}</p>}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {FUTURES_INSTRUMENTS.map((inst) => (
              <label
                key={inst.symbol}
                className={cn(
                  "flex cursor-pointer items-center gap-2.5 rounded-control border px-3 py-2.5 text-[13px] font-medium transition-colors",
                  selectedInstruments.includes(inst.symbol)
                    ? "border-gold/40 bg-gold/[0.08] text-ink"
                    : "border-line bg-raised text-faint hover:border-line-strong hover:text-muted",
                )}
              >
                <input
                  type="checkbox"
                  checked={selectedInstruments.includes(inst.symbol)}
                  onChange={() => toggleInstrument(inst.symbol)}
                  className="sr-only"
                />
                <span className={cn(
                  "grid h-4 w-4 shrink-0 place-items-center rounded border transition-colors",
                  selectedInstruments.includes(inst.symbol)
                    ? "border-gold bg-gold text-white"
                    : "border-line-strong bg-canvas",
                )}>
                  {selectedInstruments.includes(inst.symbol) && (
                    <svg className="h-3 w-3" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M2 6l3 3 5-5" />
                    </svg>
                  )}
                </span>
                <span>{inst.symbol}</span>
                <span className="ml-auto text-[10px] text-faint">{inst.name.replace('E-mini ', '').replace('Micro E-mini ', 'μ ')}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Session */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted">Session</p>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-4">
            {SESSION_LIST.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => setSessionId(s.id)}
                className={cn(
                  "rounded-control border px-3 py-2 text-[13px] font-medium transition-colors",
                  sessionId === s.id
                    ? "border-gold/40 bg-gold/[0.08] text-ink"
                    : "border-line bg-raised text-faint hover:border-line-strong hover:text-muted",
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
          {sessionId === "custom" ? (
            <div className="grid grid-cols-2 gap-3 pt-1">
              <Field label="Start (America/New_York)" htmlFor="custom-start">
                <TextInput id="custom-start" type="time" value={customStart} onChange={(e) => setCustomStart(e.target.value)} />
              </Field>
              <Field label="End (America/New_York)" htmlFor="custom-end">
                <TextInput id="custom-end" type="time" value={customEnd} onChange={(e) => setCustomEnd(e.target.value)} />
              </Field>
            </div>
          ) : (
            <p className="text-[11px] text-faint">
              {session.startTime}–{session.endTime} · {session.timezone}
            </p>
          )}
        </div>

        {/* Account type */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted">Account type</p>
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-control border border-line bg-canvas/60 p-1">
            {([
              { id: "personal", label: "Real Account" },
              { id: "prop", label: "Prop Account" },
            ] as const).map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={accountType === t.id}
                onClick={() => setAccountType(t.id)}
                className={cn(
                  "rounded-lg py-2 text-sm font-medium transition-colors",
                  accountType === t.id ? "bg-raised text-ink shadow-sm" : "text-faint hover:text-muted",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <Field label="Starting balance" error={errorFor("startingBalance")} htmlFor="starting-balance">
          <TextInput
            id="starting-balance"
            type="number"
            min={0}
            step={100}
            value={startingBalance}
            onChange={(e) => setStartingBalance(e.target.value)}
          />
        </Field>

        {accountType === "prop" && (
          <div className="space-y-4 rounded-control border border-dashed border-line-strong p-4">
            <p className="text-[11px] font-medium uppercase tracking-[0.1em] text-faint">Prop account risk rules</p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Maximum drawdown" error={errorFor("propRules.maxDrawdown")} htmlFor="max-dd">
                <TextInput id="max-dd" type="number" min={0} step={50} value={maxDrawdown} onChange={(e) => setMaxDrawdown(e.target.value)} />
              </Field>
              <Field label="Drawdown mode" htmlFor="dd-mode">
                <Select id="dd-mode" value={drawdownMode} onChange={(e) => setDrawdownMode(e.target.value as DrawdownMode)}>
                  <option value="static">Static (from starting balance)</option>
                  <option value="trailing">Dynamic (high-water mark)</option>
                </Select>
              </Field>
              <Field label="Daily loss limit" hint="optional" htmlFor="daily-loss">
                <TextInput id="daily-loss" type="number" min={0} step={50} value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value)} />
              </Field>
              <Field label="Maximum contracts" hint="optional" htmlFor="max-contracts">
                <TextInput id="max-contracts" type="number" min={0} step={1} value={maxContracts} onChange={(e) => setMaxContracts(e.target.value)} />
              </Field>
            </div>

            {/* Consistency Rule */}
            <div className="space-y-3 border-t border-line pt-4">
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consistencyEnabled}
                  onChange={(e) => setConsistencyEnabled(e.target.checked)}
                  className="rounded border-line-strong"
                />
                <span className="text-[13px] font-medium text-muted">Consistency rule</span>
              </label>
              {consistencyEnabled && (
                <Field label="Max daily profit contribution (%)" htmlFor="consistency-pct">
                  <TextInput
                    id="consistency-pct"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    value={consistencyPct}
                    onChange={(e) => setConsistencyPct(e.target.value)}
                  />
                </Field>
              )}
            </div>
          </div>
        )}

        {/* Quick session windows */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted">Quick window presets</p>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_WINDOWS.map((w) => (
              <button
                key={w.label}
                type="button"
                onClick={() => applyQuickWindow(w.start, w.end)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[12px] font-medium transition-colors",
                  fromTime === w.start && toTime === w.end
                    ? "border-gold/40 bg-gold/[0.08] text-gold"
                    : "border-line bg-raised text-faint hover:text-muted",
                )}
              >
                {w.label}
              </button>
            ))}
          </div>
        </div>

        {/* Period */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="From date" htmlFor="from-date">
            <TextInput id="from-date" type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
          </Field>
          <Field label="From time" htmlFor="from-time">
            <TextInput id="from-time" type="time" value={fromTime} onChange={(e) => setFromTime(e.target.value)} />
          </Field>
          <Field label="To date" htmlFor="to-date">
            <TextInput id="to-date" type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
          </Field>
          <Field label="To time" htmlFor="to-time">
            <TextInput id="to-time" type="time" value={toTime} onChange={(e) => setToTime(e.target.value)} />
          </Field>
        </div>
        {errorFor("period") && <p className="text-[11px] text-loss">{errorFor("period")}</p>}
        <p className="text-[11px] text-faint">
          Times in {session.timezone} · DST handled automatically.
        </p>

        {/* Timeframe */}
        <Field label="Initial timeframe" error={errorFor("timeframe")} htmlFor="timeframe">
          <Select id="timeframe" value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>{tf}</option>
            ))}
          </Select>
        </Field>

        <Button variant="gold" size="lg" className="w-full" onClick={handleCreate}>
          Create Session
        </Button>
      </motion.div>
    </div>
  );
}

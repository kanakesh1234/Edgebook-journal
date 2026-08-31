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

/**
 * Backtesting setup screen — PHASE 1.
 *
 * Collects everything the (Phase 2+) engine needs to start a session, then
 * hands the resolved config to a placeholder terminal route. No market
 * data, replay, chart, or order engine here yet — those are later phases.
 */
export default function BacktestingSetupPage() {
  const router = useRouter();
  const settings = useApp((s) => s.settings);

  const [instrumentSymbol, setInstrumentSymbol] = useState(INSTRUMENTS[0]?.symbol ?? "");
  const [sessionId, setSessionId] = useState<SessionId>("new-york");
  const [customStart, setCustomStart] = useState("09:30");
  const [customEnd, setCustomEnd] = useState("16:00");

  const [accountType, setAccountType] = useState<AccountType>("personal");
  const [startingBalance, setStartingBalance] = useState(String(settings.startingEquity || 50000));
  const [maxDrawdown, setMaxDrawdown] = useState("2500");
  const [drawdownMode, setDrawdownMode] = useState<DrawdownMode>("static");
  const [dailyLossLimit, setDailyLossLimit] = useState("");
  const [maxContracts, setMaxContracts] = useState("");

  const [fromDate, setFromDate] = useState("");
  const [fromTime, setFromTime] = useState("09:30");
  const [toDate, setToDate] = useState("");
  const [toTime, setToTime] = useState("16:00");

  const [timeframe, setTimeframe] = useState<Timeframe>("1m");
  const [errors, setErrors] = useState<ConfigValidationError[]>([]);

  const session = sessionById(sessionId);
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  const config = useMemo<Partial<BacktestConfig>>(() => {
    const tz = sessionId === "custom" ? session.timezone : session.timezone;
    const period = fromDate && toDate ? resolvePeriodUtc(fromDate, fromTime, toDate, toTime, tz) : null;
    return {
      instrumentSymbol,
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
            }
          : undefined,
      periodStartUtc: period?.startUtc,
      periodEndUtc: period?.endUtc,
      timeframe,
    };
  }, [
    instrumentSymbol, sessionId, session.timezone, customStart, customEnd,
    accountType, startingBalance, settings.currency, maxDrawdown, drawdownMode,
    dailyLossLimit, maxContracts, fromDate, fromTime, toDate, toTime, timeframe,
  ]);

  function handleStart() {
    const found = validateBacktestConfig(config);
    setErrors(found);
    if (found.length > 0) return;

    // Phase 1 stops here — no engine, no market data yet. Stash the
    // validated config and hand off to the (placeholder) terminal route,
    // which Phase 4/5 will fill in with the real chart + replay engine.
    sessionStorage.setItem("edgebook.backtesting.pendingConfig", JSON.stringify(config));
    router.push("/backtesting/session");
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <header className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-control border border-line bg-raised text-gold">
          <CandlestickIcon className="h-5 w-5" />
        </span>
        <div>
          <h1 className="font-display text-xl font-semibold text-ink">Backtesting</h1>
          <p className="text-sm text-faint">Set up a tick-accurate replay session before entering the chart.</p>
        </div>
      </header>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="space-y-6 rounded-control border border-line bg-surface p-5 sm:p-6"
      >
        {/* Instrument */}
        <Field label="Instrument" error={errorFor("instrumentSymbol")}>
          <Select value={instrumentSymbol} onChange={(e) => setInstrumentSymbol(e.target.value)}>
            {INSTRUMENTS.map((i) => (
              <option key={i.symbol} value={i.symbol}>
                {i.symbol} — {i.name}
              </option>
            ))}
          </Select>
        </Field>

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
          {errorFor("customSession") && <p className="text-[11px] text-loss">{errorFor("customSession")}</p>}
        </div>

        {/* Account type */}
        <div className="space-y-2">
          <p className="text-[13px] font-medium text-muted">Account type</p>
          <div role="tablist" className="grid grid-cols-2 gap-1 rounded-control border border-line bg-canvas/60 p-1">
            {([
              { id: "personal", label: "Personal Account" },
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
              <Field label="Daily loss limit" hint="optional" htmlFor="daily-loss">
                <TextInput id="daily-loss" type="number" min={0} step={50} value={dailyLossLimit} onChange={(e) => setDailyLossLimit(e.target.value)} />
              </Field>
              <Field label="Maximum contracts" error={errorFor("propRules.maxContracts")} hint="optional" htmlFor="max-contracts">
                <TextInput id="max-contracts" type="number" min={0} step={1} value={maxContracts} onChange={(e) => setMaxContracts(e.target.value)} />
              </Field>
              <Field label="Drawdown mode" htmlFor="dd-mode">
                <Select id="dd-mode" value={drawdownMode} onChange={(e) => setDrawdownMode(e.target.value as DrawdownMode)}>
                  <option value="static">Static (from starting balance)</option>
                  <option value="trailing">Trailing (high-water mark)</option>
                </Select>
              </Field>
            </div>
          </div>
        )}

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
          Times are entered in {session.timezone} and resolved to UTC with automatic DST handling.
        </p>

        {/* Timeframe */}
        <Field label="Initial timeframe" error={errorFor("timeframe")} htmlFor="timeframe">
          <Select id="timeframe" value={timeframe} onChange={(e) => setTimeframe(e.target.value as Timeframe)}>
            {TIMEFRAMES.map((tf) => (
              <option key={tf} value={tf}>
                {tf}
              </option>
            ))}
          </Select>
        </Field>

        <Button variant="gold" size="lg" className="w-full" onClick={handleStart}>
          Start Backtest
        </Button>
      </motion.div>
    </div>
  );
}

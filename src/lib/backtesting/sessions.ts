/* ------------------------------------------------------------------ */
/*  Session catalog + config validation — PHASE 1                      */
/*                                                                      */
/*  Session times are wall-clock hours in an IANA timezone. Converting  */
/*  those to UTC instants goes through zonedToUtc() in tz.ts, which is  */
/*  DST-aware — never a hard-coded UTC-4/UTC-5 offset.                  */
/* ------------------------------------------------------------------ */

import { zonedToUtc, TRADING_TZ } from "../tz";
import type { BacktestConfig, TradingSession, SessionId } from "./types";

export const SESSIONS: Record<Exclude<SessionId, "custom">, TradingSession> = {
  "new-york": { id: "new-york", label: "New York", timezone: TRADING_TZ, startTime: "09:30", endTime: "16:00" },
  london: { id: "london", label: "London", timezone: "Europe/London", startTime: "08:00", endTime: "16:30" },
  asia: { id: "asia", label: "Asia", timezone: "Asia/Tokyo", startTime: "09:00", endTime: "15:00" },
};

export const SESSION_LIST: TradingSession[] = [
  ...Object.values(SESSIONS),
  { id: "custom", label: "Custom Session", timezone: TRADING_TZ },
];

export function sessionById(id: SessionId): TradingSession {
  return id === "custom"
    ? { id: "custom", label: "Custom Session", timezone: TRADING_TZ }
    : SESSIONS[id];
}

/** Resolve a config's period bounds (entered in the session's timezone) to UTC instants. */
export function resolvePeriodUtc(
  fromDate: string,
  fromTime: string,
  toDate: string,
  toTime: string,
  timezone: string,
): { startUtc: string; endUtc: string } | null {
  const start = zonedToUtc(fromDate, fromTime, timezone);
  const end = zonedToUtc(toDate, toTime, timezone);
  if (!start || !end) return null;
  return { startUtc: start.toISOString(), endUtc: end.toISOString() };
}

export interface ConfigValidationError {
  field: string;
  message: string;
}

/**
 * Server- and client-shared validation. The setup screen calls this for
 * inline errors; the (Phase 2+) backtest-creation API route calls it again
 * as the authoritative check — client state is never trusted alone.
 */
export function validateBacktestConfig(config: Partial<BacktestConfig>): ConfigValidationError[] {
  const errors: ConfigValidationError[] = [];

  if (!config.instrumentSymbol) errors.push({ field: "instrumentSymbol", message: "Select an instrument." });
  if (!config.sessionId) errors.push({ field: "sessionId", message: "Select a session." });
  if (config.sessionId === "custom" && !config.customSession) {
    errors.push({ field: "customSession", message: "Set a start and end time for the custom session." });
  }
  if (!config.accountType) errors.push({ field: "accountType", message: "Select an account type." });
  if (!config.startingBalance || config.startingBalance <= 0) {
    errors.push({ field: "startingBalance", message: "Starting balance must be greater than zero." });
  }
  if (config.accountType === "prop") {
    if (!config.propRules) {
      errors.push({ field: "propRules", message: "Set the prop account risk rules." });
    } else {
      if (!config.propRules.maxDrawdown || config.propRules.maxDrawdown <= 0) {
        errors.push({ field: "propRules.maxDrawdown", message: "Maximum drawdown must be greater than zero." });
      }
      if (config.propRules.maxContracts != null && config.propRules.maxContracts <= 0) {
        errors.push({ field: "propRules.maxContracts", message: "Maximum contracts must be greater than zero." });
      }
    }
  }
  if (!config.periodStartUtc || !config.periodEndUtc) {
    errors.push({ field: "period", message: "Set a backtest start and end date/time." });
  } else if (new Date(config.periodStartUtc) >= new Date(config.periodEndUtc)) {
    errors.push({ field: "period", message: "The backtest end must be after the start." });
  }
  if (!config.timeframe) errors.push({ field: "timeframe", message: "Select a starting timeframe." });

  return errors;
}

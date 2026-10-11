/* ------------------------------------------------------------------ */
/*  Instrument catalog — PHASE 1                                       */
/*                                                                      */
/*  Static for now (contract specs don't change often). Phase 2 will   */
/*  cross-check `providerSymbol` against the live LSE catalog() call    */
/*  rather than hard-coding history spans here.                        */
/* ------------------------------------------------------------------ */

import type { InstrumentSpec } from "./types";

export const INSTRUMENTS: InstrumentSpec[] = [
  {
    symbol: "NQ",
    name: "E-mini Nasdaq-100",
    exchange: "CME",
    assetClass: "futures",
    tickSize: 0.25,
    tickValue: 5,
    pointValue: 20,
    currency: "USD",
    commissionPerContract: 2.04,
    feesPerContract: 1.18,
    timezone: "America/Chicago",
    providerSymbol: "NQ.F",
  },
  {
    symbol: "MNQ",
    name: "Micro E-mini Nasdaq-100",
    exchange: "CME",
    assetClass: "futures",
    tickSize: 0.25,
    tickValue: 0.5,
    pointValue: 2,
    currency: "USD",
    commissionPerContract: 0.74,
    feesPerContract: 0.62,
    timezone: "America/Chicago", // CME floor timezone
    // LSE has no micro contracts ("'MNQ' has no candle data"). A micro tracks the
    // full-size index 1:1, so we price from NQ.F and keep the micro's own
    // pointValue/tick value/fees for P&L. Verified against LSE /catalog.
    providerSymbol: "NQ.F",
  },
  {
    symbol: "ES",
    name: "E-mini S&P 500",
    exchange: "CME",
    assetClass: "futures",
    tickSize: 0.25,
    tickValue: 12.5,
    pointValue: 50,
    currency: "USD",
    commissionPerContract: 2.04,
    feesPerContract: 1.18,
    timezone: "America/Chicago",
    providerSymbol: "ES.F",
  },
  {
    symbol: "MES",
    name: "Micro E-mini S&P 500",
    exchange: "CME",
    assetClass: "futures",
    tickSize: 0.25,
    tickValue: 1.25,
    pointValue: 5,
    currency: "USD",
    commissionPerContract: 0.74,
    feesPerContract: 0.62,
    timezone: "America/Chicago",
    // See MNQ: priced from ES.F, P&L uses micro specs.
    providerSymbol: "ES.F",
  },
];

export function instrumentBySymbol(symbol: string): InstrumentSpec | undefined {
  return INSTRUMENTS.find((i) => i.symbol === symbol);
}

export function instrumentsBySymbols(symbols: string[]): InstrumentSpec[] {
  return symbols.map(s => INSTRUMENTS.find(i => i.symbol === s)).filter((i): i is InstrumentSpec => i != null);
}

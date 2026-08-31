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
    providerSymbol: "MNQ",
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
    providerSymbol: "MES",
  },
];

export function instrumentBySymbol(symbol: string): InstrumentSpec | undefined {
  return INSTRUMENTS.find((i) => i.symbol === symbol);
}

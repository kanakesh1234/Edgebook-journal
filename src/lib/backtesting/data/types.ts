/* ------------------------------------------------------------------ */
/*  Market data normalized types — PHASE 1                             */
/*                                                                      */
/*  Every data provider normalizes to these shapes. The backtesting    */
/*  engine and chart never see provider-specific formats.               */
/* ------------------------------------------------------------------ */

/** A single OHLCV candle in normalized format. */
export interface CandleData {
  /** UTC epoch timestamp in seconds (matches lightweight-charts UTCTimestamp). */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** A single tick in normalized format. */
export interface TickData {
  /** UTC epoch timestamp in milliseconds. */
  timestamp: number;
  price: number;
  size: number;
  volume: number;
}

/** The actual resolution of data the provider returned — never fabricated. */
export type DataResolution = 'tick' | '1s' | '5s' | '10s' | '15s' | '30s' | '1m' | '2m' | '3m' | '5m' | '10m' | '15m' | '30m' | '1h' | '2h' | '4h' | '1D';

export interface DataAvailability {
  available: boolean;
  resolution: DataResolution | null;
  /** Date range available, ISO date strings. */
  earliestDate?: string;
  latestDate?: string;
  message?: string;
}

/** Abstract data provider interface — all providers implement this. */
export interface HistoricalDataProvider {
  readonly name: string;

  /** Fetch OHLCV candles for an instrument. Returns normalized CandleData[]. */
  getCandles(
    symbol: string,
    timeframe: string,
    startUtc: string,
    endUtc: string,
  ): Promise<CandleData[]>;

  /** List available symbols from this provider. */
  getAvailableSymbols(): Promise<string[]>;

  /** Check if data is available for a symbol/date range. */
  checkAvailability(
    symbol: string,
    startUtc: string,
    endUtc: string,
  ): Promise<DataAvailability>;
}

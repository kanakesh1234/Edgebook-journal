/* ------------------------------------------------------------------ */
/*  London Strategic Edge data provider — client adapter               */
/*                                                                      */
/*  All requests go through the Next.js API route /api/market-data     */
/*  which proxies to LSE's vault API server-side. The API key never    */
/*  reaches the browser.                                                */
/* ------------------------------------------------------------------ */

import type { CandleData, CandleFetchMeta, DataAvailability, HistoricalDataProvider } from './types';

export class LseProvider implements HistoricalDataProvider {
  readonly name = 'London Strategic Edge';

  async getCandles(
    symbol: string,
    timeframe: string,
    startUtc: string,
    endUtc: string,
  ): Promise<CandleData[]> {
    return (await this.getCandlesWithMeta(symbol, timeframe, startUtc, endUtc)).candles;
  }

  /** Same as getCandles, plus what the server actually did (rows, truncation, range). */
  async getCandlesWithMeta(
    symbol: string,
    timeframe: string,
    startUtc: string,
    endUtc: string,
  ): Promise<{ candles: CandleData[]; meta: CandleFetchMeta | null }> {
    const params = new URLSearchParams({ symbol, timeframe, start: startUtc, end: endUtc });
    const res = await fetch(`/api/market-data?${params}`);
    if (!res.ok) {
      // The route returns { error, message } — show the human message, not raw JSON.
      const body = (await res.json().catch(() => null)) as { message?: string } | null;
      throw new Error(body?.message || `Data request failed (${res.status}).`);
    }
    const json = (await res.json()) as { candles: CandleData[]; meta?: CandleFetchMeta };
    return { candles: json.candles ?? [], meta: json.meta ?? null };
  }

  async getAvailableSymbols(): Promise<string[]> {
    const res = await fetch('/api/market-data/catalog');
    if (!res.ok) return [];
    const json = (await res.json()) as { symbols: string[] };
    return json.symbols;
  }

  async checkAvailability(
    symbol: string,
    startUtc: string,
    endUtc: string,
  ): Promise<DataAvailability> {
    try {
      // Try fetching a tiny slice to see if data exists
      const candles = await this.getCandles(symbol, '1m', startUtc, endUtc);
      return {
        available: candles.length > 0,
        resolution: '1m',
        message: candles.length > 0
          ? `${candles.length} candles available`
          : 'No data available for this period',
      };
    } catch {
      return {
        available: false,
        resolution: null,
        message: 'Could not verify data availability',
      };
    }
  }
}

export const lseProvider = new LseProvider();

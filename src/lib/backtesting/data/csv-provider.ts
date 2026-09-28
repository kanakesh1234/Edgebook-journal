/* ------------------------------------------------------------------ */
/*  CSV data provider — fallback for user-uploaded historical data      */
/* ------------------------------------------------------------------ */

import type { CandleData, DataAvailability, HistoricalDataProvider } from './types';

/**
 * Parses CSV text into CandleData[]. Expects columns:
 * timestamp (or date+time), open, high, low, close, volume
 *
 * Supported formats:
 * - ISO timestamps: 2026-08-28T09:30:00Z
 * - Unix epoch seconds
 * - Date + Time columns: 2026-08-28, 09:30:00
 */
export function parseCandleCsv(csvText: string): CandleData[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];

  const header = lines[0].toLowerCase().split(',').map(h => h.trim());
  const timeIdx = header.findIndex(h => ['timestamp', 'time', 'date', 'datetime'].includes(h));
  const openIdx = header.findIndex(h => h === 'open');
  const highIdx = header.findIndex(h => h === 'high');
  const lowIdx = header.findIndex(h => h === 'low');
  const closeIdx = header.findIndex(h => h === 'close');
  const volIdx = header.findIndex(h => ['volume', 'vol'].includes(h));

  if (timeIdx === -1 || openIdx === -1 || highIdx === -1 || lowIdx === -1 || closeIdx === -1) {
    throw new Error('CSV must have timestamp/date, open, high, low, close columns');
  }

  const candles: CandleData[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    if (cols.length < 5) continue;

    const rawTime = cols[timeIdx];
    let time: number;
    if (/^\d+$/.test(rawTime)) {
      // Unix epoch seconds
      time = Number(rawTime);
    } else {
      const d = new Date(rawTime);
      if (isNaN(d.getTime())) continue;
      time = Math.floor(d.getTime() / 1000);
    }

    const open = Number(cols[openIdx]);
    const high = Number(cols[highIdx]);
    const low = Number(cols[lowIdx]);
    const close = Number(cols[closeIdx]);
    const volume = volIdx !== -1 ? Number(cols[volIdx]) || 0 : 0;

    if ([open, high, low, close].some(v => isNaN(v) || v <= 0)) continue;

    candles.push({ time, open, high, low, close, volume });
  }

  // Validate ordering
  candles.sort((a, b) => a.time - b.time);

  // Remove duplicates
  const deduped: CandleData[] = [];
  for (const c of candles) {
    if (deduped.length === 0 || deduped[deduped.length - 1].time !== c.time) {
      deduped.push(c);
    }
  }

  return deduped;
}

export class CsvProvider implements HistoricalDataProvider {
  readonly name = 'CSV Import';
  private data = new Map<string, CandleData[]>();

  /** Load CSV data for a symbol. */
  loadCsv(symbol: string, csvText: string): CandleData[] {
    const candles = parseCandleCsv(csvText);
    this.data.set(symbol, candles);
    return candles;
  }

  async getCandles(
    symbol: string,
    _timeframe: string,
    startUtc: string,
    endUtc: string,
  ): Promise<CandleData[]> {
    const all = this.data.get(symbol);
    if (!all) return [];
    const startSec = Math.floor(new Date(startUtc).getTime() / 1000);
    const endSec = Math.floor(new Date(endUtc).getTime() / 1000);
    return all.filter(c => c.time >= startSec && c.time <= endSec);
  }

  async getAvailableSymbols(): Promise<string[]> {
    return Array.from(this.data.keys());
  }

  async checkAvailability(
    symbol: string,
  ): Promise<DataAvailability> {
    const all = this.data.get(symbol);
    if (!all || all.length === 0) {
      return { available: false, resolution: null, message: 'No CSV data loaded for this symbol' };
    }
    return {
      available: true,
      resolution: '1m',
      earliestDate: new Date(all[0].time * 1000).toISOString(),
      latestDate: new Date(all[all.length - 1].time * 1000).toISOString(),
    };
  }
}

/* ------------------------------------------------------------------ */
/*  Market data cache — IndexedDB-backed, date-partitioned             */
/*                                                                      */
/*  Prevents re-downloading the same historical data from LSE.         */
/*  Cache key: provider:symbol:date:resolution                         */
/*  Historical data never changes, so entries never expire.            */
/* ------------------------------------------------------------------ */

import type { CandleData } from './types';

const DB_NAME = 'edgebook-market-data';
const STORE_NAME = 'candles';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Build a cache key from provider, symbol, date, and resolution. */
export function cacheKey(
  provider: string,
  symbol: string,
  date: string,
  resolution: string,
): string {
  return `${provider}:${symbol}:${date}:${resolution}`;
}

/** Get cached candles. Returns null on miss. */
export async function getCachedCandles(key: string): Promise<CandleData[] | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

/** Store candles in cache. */
export async function setCachedCandles(key: string, candles: CandleData[]): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(candles, key);
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Cache write failure is not fatal
  }
}

/** Clear all cached market data. */
export async function clearMarketDataCache(): Promise<void> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve();
      req.onerror = () => reject(req.error);
    });
  } catch {
    // Ignore
  }
}

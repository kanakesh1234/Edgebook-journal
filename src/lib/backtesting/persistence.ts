/* ------------------------------------------------------------------ */
/*  Backtesting session persistence — separate IndexedDB store        */
/*                                                                      */
/*  Uses a dedicated database (edgebook-backtesting) so backtest      */
/*  sessions never bloat the main journal payload. Sessions can be    */
/*  large (many candles, drawings, trades) — keeping them isolated    */
/*  prevents performance issues in the journal store.                  */
/* ------------------------------------------------------------------ */

import type { BacktestSessionSummary, BacktestConfig, BacktestStatus, ChartSettings, DrawingObject } from './types';
import type { SimTrade } from './engine/order-engine';
import type { AccountState } from './engine/account-tracker';

/** Full persisted session data. */
export interface PersistedSession {
  id: string;
  config: BacktestConfig;
  status: BacktestStatus;
  clockPosition: number; // UTC epoch seconds
  activeInstrument: string;
  trades: SimTrade[];
  accountState: AccountState;
  chartSettings: ChartSettings;
  drawings: Record<string, DrawingObject[]>; // per instrument
  timeframe: string;
  playbackSpeed: number;
  createdAt: number;
  updatedAt: number;
}

const DB_NAME = 'edgebook-backtesting';
const STORE_NAME = 'sessions';
const DB_VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveBacktestSession(session: PersistedSession): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.put({ ...session, updatedAt: Date.now() });
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

export async function loadBacktestSession(id: string): Promise<PersistedSession | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.get(id);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function listBacktestSessions(): Promise<PersistedSession[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const req = store.getAll();
    req.onsuccess = () => {
      const sessions = (req.result ?? []) as PersistedSession[];
      // Sort newest first
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      resolve(sessions);
    };
    req.onerror = () => reject(req.error);
  });
}

export async function deleteBacktestSession(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    const req = store.delete(id);
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });
}

/** Convert a persisted session to a summary for the session list. */
export function sessionToSummary(session: PersistedSession): BacktestSessionSummary {
  const acc = session.accountState;
  return {
    id: session.id,
    sessionName: session.config.sessionName || 'Untitled Session',
    instruments: session.config.instruments || [session.config.instrumentSymbol],
    dateRange: {
      start: session.config.periodStartUtc,
      end: session.config.periodEndUtc,
    },
    sessionWindow: {
      startTime: session.config.customSession?.startTime || '09:30',
      endTime: session.config.customSession?.endTime || '16:00',
    },
    startingBalance: acc.startingBalance,
    endingBalance: acc.balance,
    netPnl: acc.netPnl,
    winRate: acc.winRate,
    totalTrades: acc.totalTrades,
    profitFactor: acc.profitFactor,
    maxDrawdown: acc.maxDrawdown,
    maxDailyLoss: 0, // TODO: compute from daily records
    accountType: session.config.accountType,
    status: session.status,
    timeframe: session.config.timeframe,
    lastModified: session.updatedAt,
    createdAt: session.createdAt,
  };
}

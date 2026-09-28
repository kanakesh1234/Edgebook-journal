/* ------------------------------------------------------------------ */
/*  CSV trade export — PHASE 1                                         */
/*                                                                      */
/*  Generates a detailed CSV from backtest trades, compatible with    */
/*  Tradovate-style export format and spreadsheet applications.       */
/* ------------------------------------------------------------------ */

import type { SimTrade } from './engine/order-engine';
import type { BacktestConfig } from './types';

const CSV_HEADERS = [
  'Trade ID',
  'Date',
  'Instrument',
  'Side',
  'Quantity',
  'Entry Price',
  'Exit Price',
  'Entry Time',
  'Exit Time',
  'Stop Loss',
  'Take Profit',
  'Gross P&L',
  'Commission',
  'Fees',
  'Net P&L',
  'Ticks',
  'Points',
  'Duration (s)',
  'MAE',
  'MFE',
  'Session',
  'Account Type',
];

function escCsv(v: string | number | null | undefined): string {
  if (v == null) return '';
  const s = String(v);
  return s.includes(',') || s.includes('"') || s.includes('\n')
    ? `"${s.replace(/"/g, '""')}"`
    : s;
}

function epochToIso(sec: number | null): string {
  if (!sec) return '';
  return new Date(sec * 1000).toISOString();
}

export function generateTradesCsv(
  trades: SimTrade[],
  config: BacktestConfig,
): string {
  const rows = [CSV_HEADERS.join(',')];

  for (const t of trades) {
    const dateStr = t.entryTime ? new Date(t.entryTime * 1000).toISOString().slice(0, 10) : '';
    rows.push([
      escCsv(t.id),
      escCsv(dateStr),
      escCsv(t.symbol),
      escCsv(t.side),
      escCsv(t.quantity),
      escCsv(t.entryPrice),
      escCsv(t.exitPrice),
      escCsv(epochToIso(t.entryTime)),
      escCsv(epochToIso(t.exitTime)),
      escCsv(t.stopLoss),
      escCsv(t.takeProfit),
      escCsv(t.grossPnl.toFixed(2)),
      escCsv(t.commission.toFixed(2)),
      escCsv(t.fees.toFixed(2)),
      escCsv(t.netPnl.toFixed(2)),
      escCsv(t.ticks),
      escCsv(t.points.toFixed(2)),
      escCsv(t.durationSeconds),
      escCsv(t.mae.toFixed(2)),
      escCsv(t.mfe.toFixed(2)),
      escCsv(config.sessionId),
      escCsv(config.accountType),
    ].join(','));
  }

  return rows.join('\n');
}

/** Trigger a CSV download in the browser. */
export function downloadCsv(csvContent: string, filename: string): void {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

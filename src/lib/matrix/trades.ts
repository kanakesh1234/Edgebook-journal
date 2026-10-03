import type { JournalEntry, MatrixTradeState } from "@/lib/types";
import { realizedR, tradeResult, type TradeResult } from "./progression";

export interface MatrixTradeRow { entry: JournalEntry; r: number | null; result: TradeResult; state: MatrixTradeState; }

export function matrixTradeRows(entries: JournalEntry[], states: Record<string, MatrixTradeState> = {}): MatrixTradeRow[] {
  return [...entries].map((entry) => {
    const r = realizedR(entry).r;
    return { entry, r, result: tradeResult(r), state: states[entry.id] ?? {} };
  }).sort((a, b) => b.entry.date.localeCompare(a.entry.date) || b.entry.createdAt - a.entry.createdAt);
}

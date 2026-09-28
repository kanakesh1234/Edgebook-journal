/* ------------------------------------------------------------------ */
/*  Account tracker — balance, drawdown, breach detection              */
/*                                                                      */
/*  Tracks account equity through the backtest. Supports static and   */
/*  trailing drawdown, daily loss limits, and consistency rules.       */
/*  When a breach is detected, records exact time and reason.         */
/* ------------------------------------------------------------------ */

import type { AccountType, DrawdownMode, ConsistencyRule } from '../types';
import type { SimTrade } from './order-engine';

export interface AccountState {
  startingBalance: number;
  balance: number;
  equity: number;
  openPnl: number;
  dailyPnl: number;
  netPnl: number;
  totalTrades: number;
  winCount: number;
  lossCount: number;
  winRate: number;
  profitFactor: number;
  maxDrawdown: number;
  currentDrawdown: number;
  largestWin: number;
  largestLoss: number;
  peakEquity: number;
  /** Prop account fields */
  drawdownRemaining: number | null;
  dailyLossRemaining: number | null;
  consistencyPct: number | null;
  breached: boolean;
  breachInfo: BreachInfo | null;
}

export interface BreachInfo {
  time: number;
  equity: number;
  drawdownValue: number;
  reason: string;
}

export interface AccountConfig {
  startingBalance: number;
  accountType: AccountType;
  maxDrawdown: number | null;
  drawdownMode: DrawdownMode;
  dailyLossLimit: number | null;
  consistencyRule: ConsistencyRule | null;
}

export class AccountTracker {
  private _config: AccountConfig;
  private _balance: number;
  private _peakEquity: number;
  private _openPnl = 0;
  private _trades: SimTrade[] = [];
  private _dailyPnl = 0;
  private _currentDate = '';
  private _dailyPnlByDate = new Map<string, number>();
  private _breached = false;
  private _breachInfo: BreachInfo | null = null;
  private _grossWins = 0;
  private _grossLosses = 0;
  private _largestWin = 0;
  private _largestLoss = 0;

  constructor(config: AccountConfig) {
    this._config = config;
    this._balance = config.startingBalance;
    this._peakEquity = config.startingBalance;
  }

  get state(): AccountState {
    const equity = this._balance + this._openPnl;
    const netPnl = equity - this._config.startingBalance;
    const wins = this._trades.filter(t => t.netPnl > 0).length;
    const losses = this._trades.filter(t => t.netPnl <= 0).length;
    const totalTrades = this._trades.length;
    const winRate = totalTrades > 0 ? wins / totalTrades : 0;
    const profitFactor = this._grossLosses > 0
      ? this._grossWins / this._grossLosses
      : this._grossWins > 0 ? Infinity : 0;

    // Drawdown calculation
    const maxDrawdown = this.calculateMaxDrawdown();
    const currentDrawdown = this._peakEquity - equity;

    // Prop account specifics
    let drawdownRemaining: number | null = null;
    let dailyLossRemaining: number | null = null;
    let consistencyPct: number | null = null;

    if (this._config.accountType === 'prop') {
      if (this._config.maxDrawdown) {
        drawdownRemaining = this._config.maxDrawdown - currentDrawdown;
      }
      if (this._config.dailyLossLimit) {
        dailyLossRemaining = this._config.dailyLossLimit - Math.abs(Math.min(0, this._dailyPnl));
      }
      if (this._config.consistencyRule?.enabled && netPnl > 0) {
        const dailyPnls = Array.from(this._dailyPnlByDate.values());
        const maxDailyProfit = Math.max(0, ...dailyPnls);
        consistencyPct = netPnl > 0 ? (maxDailyProfit / netPnl) * 100 : 0;
      }
    }

    return {
      startingBalance: this._config.startingBalance,
      balance: this._balance,
      equity,
      openPnl: this._openPnl,
      dailyPnl: this._dailyPnl,
      netPnl,
      totalTrades,
      winCount: wins,
      lossCount: losses,
      winRate,
      profitFactor,
      maxDrawdown,
      currentDrawdown,
      largestWin: this._largestWin,
      largestLoss: this._largestLoss,
      peakEquity: this._peakEquity,
      drawdownRemaining,
      dailyLossRemaining,
      consistencyPct,
      breached: this._breached,
      breachInfo: this._breachInfo,
    };
  }

  /** Record a closed trade. */
  recordTrade(trade: SimTrade, dateKey: string): void {
    this._trades.push(trade);
    this._balance += trade.netPnl;

    // Track daily P&L
    if (dateKey !== this._currentDate) {
      this._currentDate = dateKey;
      this._dailyPnl = 0;
    }
    this._dailyPnl += trade.netPnl;
    this._dailyPnlByDate.set(dateKey, (this._dailyPnlByDate.get(dateKey) ?? 0) + trade.netPnl);

    // Track wins/losses
    if (trade.netPnl > 0) {
      this._grossWins += trade.grossPnl;
      this._largestWin = Math.max(this._largestWin, trade.netPnl);
    } else {
      this._grossLosses += Math.abs(trade.grossPnl);
      this._largestLoss = Math.min(this._largestLoss, trade.netPnl);
    }

    // Update peak equity
    const equity = this._balance + this._openPnl;
    if (this._config.drawdownMode === 'trailing') {
      this._peakEquity = Math.max(this._peakEquity, equity);
    }

    // Check for breach
    this.checkBreach(trade.exitTime ?? trade.entryTime);
  }

  /** Update unrealized P&L from open positions. */
  setOpenPnl(pnl: number, time: number): void {
    this._openPnl = pnl;
    const equity = this._balance + pnl;
    if (this._config.drawdownMode === 'trailing') {
      this._peakEquity = Math.max(this._peakEquity, equity);
    }
    this.checkBreach(time);
  }

  private checkBreach(time: number): void {
    if (this._breached) return;
    if (this._config.accountType !== 'prop') return;

    const equity = this._balance + this._openPnl;

    // Max drawdown breach
    if (this._config.maxDrawdown) {
      const drawdown = this._config.drawdownMode === 'static'
        ? this._config.startingBalance - equity
        : this._peakEquity - equity;

      if (drawdown >= this._config.maxDrawdown) {
        this._breached = true;
        this._breachInfo = {
          time,
          equity,
          drawdownValue: drawdown,
          reason: `Maximum drawdown breached: \$${drawdown.toFixed(2)} >= \$${this._config.maxDrawdown}`,
        };
        return;
      }
    }

    // Daily loss limit breach
    if (this._config.dailyLossLimit && this._dailyPnl < 0) {
      if (Math.abs(this._dailyPnl) >= this._config.dailyLossLimit) {
        this._breached = true;
        this._breachInfo = {
          time,
          equity,
          drawdownValue: Math.abs(this._dailyPnl),
          reason: `Daily loss limit breached: \$${Math.abs(this._dailyPnl).toFixed(2)} >= \$${this._config.dailyLossLimit}`,
        };
      }
    }
  }

  private calculateMaxDrawdown(): number {
    let peak = this._config.startingBalance;
    let maxDD = 0;
    let running = this._config.startingBalance;
    for (const trade of this._trades) {
      running += trade.netPnl;
      peak = Math.max(peak, running);
      maxDD = Math.max(maxDD, peak - running);
    }
    return maxDD;
  }

  reset(): void {
    this._balance = this._config.startingBalance;
    this._peakEquity = this._config.startingBalance;
    this._openPnl = 0;
    this._trades = [];
    this._dailyPnl = 0;
    this._currentDate = '';
    this._dailyPnlByDate.clear();
    this._breached = false;
    this._breachInfo = null;
    this._grossWins = 0;
    this._grossLosses = 0;
    this._largestWin = 0;
    this._largestLoss = 0;
  }
}

/* ------------------------------------------------------------------ */
/*  Order execution engine — PHASE 1                                   */
/*                                                                      */
/*  Simulates order fills against historical candle data.               */
/*  Market orders fill IMMEDIATELY at the price you see (the current   */
/*  bar's close — the number on the Buy/Sell buttons). Limit/stop      */
/*  orders are checked against bars that are revealed afterwards.      */
/*  An order in the opposite direction of an open position closes it   */
/*  first (netting, like TradingView / futures prop accounts).         */
/*  Limit orders fill when price touches the limit level.              */
/*  Stop orders activate and fill when price reaches stop level.       */
/*                                                                      */
/*  P&L uses the correct futures contract specification from           */
/*  InstrumentSpec (tick size, tick value, point value).                */
/*  Commission and fees are applied per the instrument spec.           */
/* ------------------------------------------------------------------ */

import type { InstrumentSpec } from '../types';
import type { CandleData } from '../data/types';
import type { OrderSide, OrderType, OrderStatus } from '../types';

export interface SimOrder {
  id: string;
  symbol: string;
  side: OrderSide;
  type: OrderType;
  quantity: number;
  price: number | null; // limit/stop price, null for market
  stopLoss: number | null;
  takeProfit: number | null;
  status: OrderStatus;
  submittedAt: number; // epoch seconds
  filledAt: number | null;
  filledPrice: number | null;
  cancelledAt: number | null;
}

export interface SimTrade {
  id: string;
  orderId: string;
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  entryTime: number;
  exitPrice: number | null;
  exitTime: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  grossPnl: number;
  commission: number;
  fees: number;
  netPnl: number;
  ticks: number;
  points: number;
  durationSeconds: number | null;
  mae: number; // Maximum Adverse Excursion
  mfe: number; // Maximum Favorable Excursion
}

export interface SimPosition {
  symbol: string;
  side: OrderSide;
  quantity: number;
  entryPrice: number;
  entryTime: number;
  stopLoss: number | null;
  takeProfit: number | null;
  unrealizedPnl: number;
  mae: number;
  mfe: number;
  orderId: string;
}

let _nextId = 1;
function genId(prefix: string): string {
  return `${prefix}-${_nextId++}-${Date.now().toString(36)}`;
}

/**
 * Calculate P&L for a futures trade using the contract spec.
 * P&L = (exitPrice - entryPrice) * (pointValue / 1) * quantity * direction
 * where direction = 1 for long, -1 for short
 */
export function calculateFuturesPnl(
  entryPrice: number,
  exitPrice: number,
  quantity: number,
  side: OrderSide,
  spec: InstrumentSpec,
): { grossPnl: number; points: number; ticks: number; commission: number; fees: number; netPnl: number } {
  const direction = side === 'buy' ? 1 : -1;
  const points = (exitPrice - entryPrice) * direction;
  const ticks = Math.round(points / spec.tickSize);
  const grossPnl = points * spec.pointValue * quantity;
  const commission = spec.commissionPerContract * quantity;
  const fees = spec.feesPerContract * quantity;
  // Commission applies to both entry and exit (round turn)
  const netPnl = grossPnl - (commission + fees) * 2;
  return { grossPnl, points, ticks, commission: commission * 2, fees: fees * 2, netPnl };
}

/**
 * Order execution engine. Processes pending orders against candle data.
 */
export class OrderEngine {
  private _pendingOrders: SimOrder[] = [];
  private _filledOrders: SimOrder[] = [];
  private _openPositions: SimPosition[] = [];
  private _closedTrades: SimTrade[] = [];
  private _spec: InstrumentSpec;

  constructor(spec: InstrumentSpec) {
    this._spec = spec;
  }

  get pendingOrders(): SimOrder[] { return [...this._pendingOrders]; }
  get filledOrders(): SimOrder[] { return [...this._filledOrders]; }
  get openPositions(): SimPosition[] { return [...this._openPositions]; }
  get closedTrades(): SimTrade[] { return [...this._closedTrades]; }

  /** Submit a new order. Market orders fill on the next candle. */
  submitOrder(
    side: OrderSide,
    type: OrderType,
    quantity: number,
    currentTime: number,
    price?: number,
    stopLoss?: number,
    takeProfit?: number,
  ): SimOrder {
    const order: SimOrder = {
      id: genId('ord'),
      symbol: this._spec.symbol,
      side,
      type,
      quantity,
      price: price ?? null,
      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,
      status: 'pending',
      submittedAt: currentTime,
      filledAt: null,
      filledPrice: null,
      cancelledAt: null,
    };
    this._pendingOrders.push(order);
    return order;
  }

  /** Cancel a pending order. */
  cancelOrder(orderId: string, currentTime: number): boolean {
    const idx = this._pendingOrders.findIndex(o => o.id === orderId);
    if (idx === -1) return false;
    const order = this._pendingOrders[idx];
    order.status = 'cancelled';
    order.cancelledAt = currentTime;
    this._pendingOrders.splice(idx, 1);
    return true;
  }

  /**
   * Execute a market order RIGHT NOW at `price` (the current bar's close, i.e.
   * the price shown on the Buy/Sell buttons).
   *
   * Netting: an order against an open position first closes it (FIFO, partial
   * closes supported) and only the remainder opens a new position, so
   * Buy-then-Sell flattens instead of leaving a hedged long + short.
   * Returns the trades realised by closing opposite exposure.
   */
  executeMarket(
    side: OrderSide,
    quantity: number,
    price: number,
    time: number,
    stopLoss?: number,
    takeProfit?: number,
  ): SimTrade[] {
    const order: SimOrder = {
      id: genId('ord'),
      symbol: this._spec.symbol,
      side,
      type: 'market',
      quantity,
      price: null,
      stopLoss: stopLoss ?? null,
      takeProfit: takeProfit ?? null,
      status: 'filled',
      submittedAt: time,
      filledAt: time,
      filledPrice: price,
      cancelledAt: null,
    };
    this._filledOrders.push(order);
    return this.applyFill(order, price, time);
  }

  /** Re-mark every open position to `price` (no SL/TP checks, no fills). */
  markToMarket(price: number): void {
    for (const pos of this._openPositions) {
      const dir = pos.side === 'buy' ? 1 : -1;
      pos.unrealizedPnl = (price - pos.entryPrice) * dir * this._spec.pointValue * pos.quantity;
    }
  }

  /** Total unrealised P&L of all open positions (as of the last mark). */
  get openPnl(): number {
    return this._openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
  }

  /**
   * Apply a fill: close opposite positions first (FIFO), open a new position
   * with whatever quantity is left. Returns trades realised by the closes.
   */
  private applyFill(order: SimOrder, fillPrice: number, time: number): SimTrade[] {
    const trades: SimTrade[] = [];
    let remaining = order.quantity;

    const opposing = this._openPositions
      .filter(p => p.side !== order.side)
      .sort((a, b) => a.entryTime - b.entryTime);
    for (const pos of opposing) {
      if (remaining <= 0) break;
      const closeQty = Math.min(pos.quantity, remaining);
      const trade = this.createTrade(pos, fillPrice, time, closeQty);
      trades.push(trade);
      this._closedTrades.push(trade);
      if (closeQty >= pos.quantity) {
        this._openPositions = this._openPositions.filter(p => p !== pos);
      } else {
        pos.quantity -= closeQty;
      }
      remaining -= closeQty;
    }

    if (remaining > 0) {
      this._openPositions.push({
        symbol: order.symbol,
        side: order.side,
        quantity: remaining,
        entryPrice: fillPrice,
        entryTime: time,
        stopLoss: order.stopLoss,
        takeProfit: order.takeProfit,
        unrealizedPnl: 0,
        mae: 0,
        mfe: 0,
        orderId: order.id,
      });
    }
    return trades;
  }

  /**
   * Modify the stop loss and/or take profit of an open position (e.g. from
   * dragging its line on the chart). Pass `null` to remove a level, pass
   * `undefined` to leave it unchanged.
   */
  updatePositionRisk(
    positionOrderId: string,
    updates: { stopLoss?: number | null; takeProfit?: number | null },
  ): boolean {
    const pos = this._openPositions.find(p => p.orderId === positionOrderId);
    if (!pos) return false;
    if (updates.stopLoss !== undefined) pos.stopLoss = updates.stopLoss;
    if (updates.takeProfit !== undefined) pos.takeProfit = updates.takeProfit;
    return true;
  }

  /**
   * Modify a still-pending order — its trigger price (limit/stop) and/or
   * its attached stop loss / take profit — before it fills.
   */
  updatePendingOrder(
    orderId: string,
    updates: { price?: number; stopLoss?: number | null; takeProfit?: number | null },
  ): boolean {
    const order = this._pendingOrders.find(o => o.id === orderId);
    if (!order) return false;
    if (updates.price !== undefined) order.price = updates.price;
    if (updates.stopLoss !== undefined) order.stopLoss = updates.stopLoss;
    if (updates.takeProfit !== undefined) order.takeProfit = updates.takeProfit;
    return true;
  }

  /** Close an open position at the given price. */
  closePosition(positionOrderId: string, exitPrice: number, exitTime: number): SimTrade | null {
    const idx = this._openPositions.findIndex(p => p.orderId === positionOrderId);
    if (idx === -1) return null;
    const pos = this._openPositions[idx];
    this._openPositions.splice(idx, 1);
    const trade = this.createTrade(pos, exitPrice, exitTime);
    this._closedTrades.push(trade);
    return trade;
  }

  /**
   * Process pending orders and open positions against a new candle.
   * Call this each time the clock advances.
   * Returns newly created trades from fills + SL/TP closures.
   */
  processCandle(candle: CandleData): SimTrade[] {
    const trades: SimTrade[] = [];

    // 1. Process pending orders
    const remaining: SimOrder[] = [];
    for (const order of this._pendingOrders) {
      const fillPrice = this.checkFill(order, candle);
      if (fillPrice !== null) {
        order.status = 'filled';
        order.filledAt = candle.time;
        order.filledPrice = fillPrice;
        this._filledOrders.push(order);

        // Close opposite exposure first, then open the remainder.
        trades.push(...this.applyFill(order, fillPrice, candle.time));
      } else {
        remaining.push(order);
      }
    }
    this._pendingOrders = remaining;

    // 2. Update open positions and check SL/TP
    const slTpTrades: SimTrade[] = [];
    const closedPositions: SimPosition[] = [];
    for (const pos of this._openPositions) {
      // Update unrealized P&L
      const dir = pos.side === 'buy' ? 1 : -1;
      const unrealizedPoints = (candle.close - pos.entryPrice) * dir;
      pos.unrealizedPnl = unrealizedPoints * this._spec.pointValue * pos.quantity;

      // Update MAE/MFE
      const adversePrice = pos.side === 'buy' ? candle.low : candle.high;
      const favorablePrice = pos.side === 'buy' ? candle.high : candle.low;
      const adversePoints = (adversePrice - pos.entryPrice) * dir;
      const favorablePoints = (favorablePrice - pos.entryPrice) * dir;
      pos.mae = Math.min(pos.mae, adversePoints * this._spec.pointValue * pos.quantity);
      pos.mfe = Math.max(pos.mfe, favorablePoints * this._spec.pointValue * pos.quantity);

      // Check stop loss
      if (pos.stopLoss !== null) {
        const slHit = pos.side === 'buy'
          ? candle.low <= pos.stopLoss
          : candle.high >= pos.stopLoss;
        if (slHit) {
          const t = this.createTrade(pos, pos.stopLoss, candle.time);
          trades.push(t); slTpTrades.push(t);
          closedPositions.push(pos);
          continue;
        }
      }

      // Check take profit
      if (pos.takeProfit !== null) {
        const tpHit = pos.side === 'buy'
          ? candle.high >= pos.takeProfit
          : candle.low <= pos.takeProfit;
        if (tpHit) {
          const t = this.createTrade(pos, pos.takeProfit, candle.time);
          trades.push(t); slTpTrades.push(t);
          closedPositions.push(pos);
          continue;
        }
      }
    }

    // Remove closed positions
    this._openPositions = this._openPositions.filter(p => !closedPositions.includes(p));

    // Record SL/TP closures (netting closes were recorded in applyFill).
    this._closedTrades.push(...slTpTrades);

    return trades;
  }

  /** Determine fill price based on order type and candle data. */
  private checkFill(order: SimOrder, candle: CandleData): number | null {
    switch (order.type) {
      case 'market':
        // Market orders fill at the candle's open price
        return candle.open;

      case 'limit': {
        if (order.price === null) return null;
        // Buy limit fills if price dips to or below the limit
        if (order.side === 'buy' && candle.low <= order.price) return order.price;
        // Sell limit fills if price rises to or above the limit
        if (order.side === 'sell' && candle.high >= order.price) return order.price;
        return null;
      }

      case 'stop': {
        if (order.price === null) return null;
        // Buy stop fills if price rises to or above the stop
        if (order.side === 'buy' && candle.high >= order.price) return order.price;
        // Sell stop fills if price drops to or below the stop
        if (order.side === 'sell' && candle.low <= order.price) return order.price;
        return null;
      }

      case 'stop-limit': {
        // Simplified: treat as stop for Phase 1
        if (order.price === null) return null;
        if (order.side === 'buy' && candle.high >= order.price) return order.price;
        if (order.side === 'sell' && candle.low <= order.price) return order.price;
        return null;
      }

      default:
        return null;
    }
  }

  private createTrade(pos: SimPosition, exitPrice: number, exitTime: number, quantity: number = pos.quantity): SimTrade {
    const pnl = calculateFuturesPnl(
      pos.entryPrice, exitPrice, quantity, pos.side, this._spec,
    );
    return {
      id: genId('trd'),
      orderId: pos.orderId,
      symbol: pos.symbol,
      side: pos.side,
      quantity,
      entryPrice: pos.entryPrice,
      entryTime: pos.entryTime,
      exitPrice,
      exitTime,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      grossPnl: pnl.grossPnl,
      commission: pnl.commission,
      fees: pnl.fees,
      netPnl: pnl.netPnl,
      ticks: pnl.ticks,
      points: pnl.points,
      durationSeconds: exitTime - pos.entryTime,
      mae: pos.mae,
      mfe: pos.mfe,
    };
  }

  /** Reset all state. */
  reset(): void {
    this._pendingOrders = [];
    this._filledOrders = [];
    this._openPositions = [];
    this._closedTrades = [];
  }
}

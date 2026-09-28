/* ------------------------------------------------------------------ */
/*  Order execution engine — PHASE 1                                   */
/*                                                                      */
/*  Simulates order fills against historical candle data.               */
/*  Market orders fill at the candle's open price (next available bar). */
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

        // Open a position
        this._openPositions.push({
          symbol: order.symbol,
          side: order.side,
          quantity: order.quantity,
          entryPrice: fillPrice,
          entryTime: candle.time,
          stopLoss: order.stopLoss,
          takeProfit: order.takeProfit,
          unrealizedPnl: 0,
          mae: 0,
          mfe: 0,
          orderId: order.id,
        });
      } else {
        remaining.push(order);
      }
    }
    this._pendingOrders = remaining;

    // 2. Update open positions and check SL/TP
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
          trades.push(this.createTrade(pos, pos.stopLoss, candle.time));
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
          trades.push(this.createTrade(pos, pos.takeProfit, candle.time));
          closedPositions.push(pos);
          continue;
        }
      }
    }

    // Remove closed positions
    this._openPositions = this._openPositions.filter(p => !closedPositions.includes(p));

    // Record closed trades so `.closedTrades` reflects fills from SL/TP
    this._closedTrades.push(...trades);

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

  private createTrade(pos: SimPosition, exitPrice: number, exitTime: number): SimTrade {
    const pnl = calculateFuturesPnl(
      pos.entryPrice, exitPrice, pos.quantity, pos.side, this._spec,
    );
    return {
      id: genId('trd'),
      orderId: pos.orderId,
      symbol: pos.symbol,
      side: pos.side,
      quantity: pos.quantity,
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

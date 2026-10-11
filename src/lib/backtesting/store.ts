'use client';

/* ------------------------------------------------------------------ */
/*  Backtesting Zustand store — PHASE 1                                */
/*                                                                      */
/*  Coordinates the entire backtesting session: clock, data loading,  */
/*  order execution, account tracking, and UI state. All components   */
/*  in the backtesting workspace derive their state from this store.  */
/* ------------------------------------------------------------------ */

import { create } from 'zustand';
import type {
  BacktestConfig,
  BacktestStatus,
  Timeframe,
  ChartSettings,
  ChartType,
  DrawingObject,
  DrawingToolType,
  BacktestSessionSummary,
  PriceAlert,
} from './types';
import type { CandleData } from './data/types';
import { OrderEngine, type SimTrade, type SimOrder, type SimPosition } from './engine/order-engine';
import { AccountTracker, type AccountState, type AccountConfig } from './engine/account-tracker';
import type { OrderSide, OrderType } from './types';
import type { PlaybackSpeed } from './engine/clock';
import type { PersistedSession } from './persistence';
import { instrumentBySymbol } from './instruments';
import { utcToNyDateKey, navigateToNextSession, navigateToPreviousSession, utcToNyTimeStr } from './engine/session-manager';
import { uid } from '../utils';

/* ------------------------------------------------------------------ */
/*  Engine registry — lives outside Zustand state.                    */
/*                                                                      */
/*  OrderEngine/AccountTracker are stateful class instances, not       */
/*  plain data — they don't belong in a reactive store. The store      */
/*  keeps derived snapshots (accountState, closedTrades, ...) while    */
/*  this registry holds the actual simulation objects that produce     */
/*  those snapshots. One OrderEngine per instrument (contract specs    */
/*  differ), one shared AccountTracker for the whole session.          */
/* ------------------------------------------------------------------ */
const engineRegistry: {
  orderEngines: Record<string, OrderEngine>;
  accountTracker: AccountTracker | null;
} = {
  orderEngines: {},
  accountTracker: null,
};

function buildAccountConfig(config: BacktestConfig): AccountConfig {
  return {
    startingBalance: config.startingBalance,
    accountType: config.accountType,
    maxDrawdown: config.propRules?.maxDrawdown ?? null,
    drawdownMode: config.propRules?.drawdownMode ?? 'static',
    dailyLossLimit: config.propRules?.dailyLossLimit ?? null,
    consistencyRule: config.propRules?.consistencyRule ?? null,
  };
}

function createEnginesForInstruments(instruments: string[], config: BacktestConfig): void {
  engineRegistry.orderEngines = {};
  for (const symbol of instruments) {
    const spec = instrumentBySymbol(symbol);
    if (spec) engineRegistry.orderEngines[symbol] = new OrderEngine(spec);
  }
  engineRegistry.accountTracker = new AccountTracker(buildAccountConfig(config));
}

export interface BacktestStoreState {
  /* --- Session --- */
  sessionId: string | null;
  config: BacktestConfig | null;
  status: BacktestStatus;

  /* --- Clock --- */
  currentTime: number; // UTC epoch seconds
  playing: boolean;
  speed: PlaybackSpeed;
  clockProgress: number; // 0..1

  /* --- Data --- */
  /** Candle data per instrument, keyed by symbol. Only candles up to currentTime are "visible". */
  candleData: Record<string, CandleData[]>;
  /** All loaded candles (including future — hidden from chart). */
  allCandles: Record<string, CandleData[]>;
  /** Current data resolution (what we actually received). */
  dataResolution: string;
  dataLoading: boolean;
  dataError: string | null;
  /** Non-blocking notice (partial data, one symbol missing). */
  dataWarning: string | null;

  /* --- Instruments --- */
  instruments: string[];
  activeInstrument: string;

  /* --- Trading --- */
  pendingOrders: SimOrder[];
  openPositions: SimPosition[];
  closedTrades: SimTrade[];

  /* --- Account --- */
  accountState: AccountState | null;

  /* --- Chart --- */
  chartSettings: ChartSettings;
  timeframe: Timeframe;
  chartType: ChartType;

  /* --- Drawings --- */
  drawings: Record<string, DrawingObject[]>; // per instrument
  activeDrawingTool: ActiveTool;
  selectedDrawingId: string | null;
  drawingsLocked: boolean;
  drawingsHidden: boolean;
  magnetMode: 'off' | 'weak' | 'strong';
  stayInDrawing: boolean;
  activeEmoji: string;
  /** Last style used per tool — new drawings start with it (TradingView does the same). */
  toolStyles: Partial<Record<DrawingToolType, Partial<DrawingObject>>>;
  /** Undo/redo stacks of drawing snapshots, per instrument. */
  drawHistory: { past: Record<string, DrawingObject[][]>; future: Record<string, DrawingObject[][]> };

  /* --- Chart extras --- */
  orderQty: number;
  alerts: PriceAlert[];
  alertNotice: { id: string; text: string } | null;
  scale: { mode: 'normal' | 'log' | 'percent'; auto: boolean; invert: boolean };
  /** Bars before the replay window, shown so there is context to the left (never traded). */
  historyCandles: Record<string, CandleData[]>;
  /** Replay "Jump to" is waiting for a bar click. */
  selectingBar: boolean;
  tradePanelOpen: boolean;

  /* --- Results --- */
  showResults: boolean;

  /* --- Session list --- */
  sessions: BacktestSessionSummary[];
  sessionsLoading: boolean;

  /* --- Actions --- */
  /** Initialize a new backtest session. */
  initSession: (config: BacktestConfig) => void;
  /** Load a saved session. */
  loadSession: (sessionId: string) => Promise<void>;
  /** Save current session state. */
  saveSession: () => Promise<void>;
  /** Load session list for the landing page. */
  loadSessionList: () => Promise<void>;
  /** Delete a session. */
  deleteSession: (id: string) => Promise<void>;

  /** Set candle data for an instrument. */
  setCandleData: (symbol: string, candles: CandleData[]) => void;
  /** Update visible candles based on current time. */
  updateVisibleCandles: () => void;

  /** Switch active instrument. */
  switchInstrument: (symbol: string) => void;
  /** Switch to next instrument in list (wrap-around). */
  nextInstrument: () => void;
  /** Switch to previous instrument in list (wrap-around). */
  prevInstrument: () => void;

  /** Clock controls. */
  setPlaying: (playing: boolean) => void;
  setSpeed: (speed: PlaybackSpeed) => void;
  setCurrentTime: (time: number) => void;
  advanceClock: () => void;
  stepBack: () => void;

  /** Set timeframe (with re-aggregation from base data). */
  setTimeframe: (tf: Timeframe) => void;
  /** Change timeframe mid-session (re-fetches if needed). */
  changeTimeframe: (tf: Timeframe) => void;
  /** Set chart type. */
  setChartType: (ct: ChartType) => void;

  /** Trading. */
  addTrade: (trade: SimTrade) => void;
  setAccountState: (state: AccountState) => void;
  setPendingOrders: (orders: SimOrder[]) => void;
  setOpenPositions: (positions: SimPosition[]) => void;
  /** Submit a market/limit/stop order against the given symbol's engine (defaults to the active instrument). */
  placeOrder: (
    side: OrderSide,
    quantity: number,
    opts?: { symbol?: string; type?: OrderType; price?: number; stopLoss?: number; takeProfit?: number },
  ) => void;
  /** Flatten (close) the open position for a symbol at the current candle's close. */
  closePositionForSymbol: (symbol?: string) => void;
  /** Cancel a pending order. */
  cancelPendingOrder: (symbol: string, orderId: string) => void;
  /** Drag-to-modify an open position's stop loss / take profit. */
  updatePositionRisk: (
    symbol: string,
    positionOrderId: string,
    updates: { stopLoss?: number | null; takeProfit?: number | null },
  ) => void;
  /** Drag-to-modify a pending order's trigger price and/or SL/TP. */
  updatePendingOrder: (
    symbol: string,
    orderId: string,
    updates: { price?: number; stopLoss?: number | null; takeProfit?: number | null },
  ) => void;
  /** Re-sync store's trading/account snapshots from the engine registry. */
  syncEngineState: () => void;

  /** Drawings. */
  addDrawing: (symbol: string, drawing: DrawingObject) => void;
  removeDrawing: (symbol: string, drawingId: string) => void;
  setActiveDrawingTool: (tool: ActiveTool) => void;
  clearDrawings: (symbol: string) => void;
  selectDrawing: (id: string | null) => void;
  /** Patch a drawing. `record` pushes an undo snapshot first (false while dragging). */
  updateDrawing: (symbol: string, id: string, patch: Partial<DrawingObject>, record?: boolean) => void;
  /** Push one undo snapshot (call once at the start of a drag). */
  beginDrawingEdit: (symbol: string) => void;
  cloneDrawing: (symbol: string, id: string) => string | null;
  removeTempDrawings: (symbol: string) => void;
  undoDrawing: (symbol: string) => void;
  redoDrawing: (symbol: string) => void;
  setToolStyle: (tool: DrawingToolType, patch: Partial<DrawingObject>) => void;
  setDrawingsLocked: (v: boolean) => void;
  setDrawingsHidden: (v: boolean) => void;
  setMagnetMode: (m: 'off' | 'weak' | 'strong') => void;
  setStayInDrawing: (v: boolean) => void;
  setActiveEmoji: (e: string) => void;

  /** Chart extras. */
  setOrderQty: (q: number) => void;
  addAlert: (symbol: string, price: number, direction: 'up' | 'down') => void;
  removeAlert: (id: string) => void;
  clearAlertNotice: () => void;
  setScale: (patch: Partial<{ mode: 'normal' | 'log' | 'percent'; auto: boolean; invert: boolean }>) => void;
  setSelectingBar: (v: boolean) => void;
  setTradePanelOpen: (v: boolean) => void;
  /** Fast-forward the replay (through the order engine, bar by bar) to a bar time. Forward only. */
  advanceTo: (time: number) => void;
  /** Fetch bars before the replay window for left-hand context. Never throws. */
  loadHistory: () => Promise<void>;

  /** Session navigation. */
  navigateNextDay: () => Promise<void>;
  navigatePrevDay: () => Promise<void>;
  endSession: () => void;
  setShowResults: (show: boolean) => void;

  /** Session status. */
  setStatus: (status: BacktestStatus) => void;
  setDataLoading: (loading: boolean) => void;
  setDataError: (error: string | null) => void;
  setDataWarning: (warning: string | null) => void;

  /** Reset everything. */
  reset: () => void;
}

/** Everything the left toolbar can arm: a drawing, a cursor flavour, the eraser or box-zoom. */
export type ActiveTool = DrawingToolType | 'cursor' | 'crosshair' | 'dot' | 'pointer' | 'eraser' | 'zoom' | null;

const HISTORY_CAP = 60;

/** How far back (calendar days) the left-hand context reaches, by timeframe. */
function lookbackDays(tf: string): number {
  const m = /^(\d+)(s|m|h|d|w)$/i.exec(tf.trim());
  if (!m) return 3;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const secs = unit === 's' ? n : unit === 'm' ? n * 60 : unit === 'h' ? n * 3600 : unit === 'd' ? n * 86400 : n * 604800;
  if (secs <= 60) return 2;
  if (secs <= 300) return 3;
  if (secs <= 900) return 5;
  if (secs <= 3600) return 10;
  if (secs <= 14400) return 30;
  return 180;
}

const DEFAULT_CHART_SETTINGS: ChartSettings = {
  chartType: 'candlestick',
  colors: {
    bullBody: '#26a69a',
    bearBody: '#ef5350',
    bullWick: '#26a69a',
    bearWick: '#ef5350',
    bullBorder: '#26a69a',
    bearBorder: '#ef5350',
    background: '#131722',
    gridLines: '#1e222d',
    crosshair: '#758696',
    text: '#d1d4dc',
  },
  showGrid: true,
  showVerticalGrid: true,
  showHorizontalGrid: true,
};

const INITIAL_ACCOUNT_STATE: AccountState = {
  startingBalance: 0,
  balance: 0,
  equity: 0,
  openPnl: 0,
  dailyPnl: 0,
  netPnl: 0,
  totalTrades: 0,
  winCount: 0,
  lossCount: 0,
  winRate: 0,
  profitFactor: 0,
  maxDrawdown: 0,
  currentDrawdown: 0,
  largestWin: 0,
  largestLoss: 0,
  peakEquity: 0,
  drawdownRemaining: null,
  dailyLossRemaining: null,
  consistencyPct: null,
  breached: false,
  breachInfo: null,
};

type SetFn = (partial: Partial<BacktestStoreState> | ((s: BacktestStoreState) => Partial<BacktestStoreState>)) => void;

/** Snapshot one instrument's drawings onto its undo stack (and drop its redo stack). */
function pushDrawHistory(set: SetFn, get: () => BacktestStoreState, symbol: string) {
  const snap = get().drawings[symbol] || [];
  set(s => ({
    drawHistory: {
      past: { ...s.drawHistory.past, [symbol]: [...(s.drawHistory.past[symbol] || []), snap].slice(-HISTORY_CAP) },
      future: { ...s.drawHistory.future, [symbol]: [] },
    },
  }));
}

export const useBacktest = create<BacktestStoreState>((set, get) => ({
  // Session
  sessionId: null,
  config: null,
  status: 'ready',

  // Clock
  currentTime: 0,
  playing: false,
  speed: 1,
  clockProgress: 0,

  // Data
  candleData: {},
  allCandles: {},
  dataResolution: '1m',
  dataLoading: false,
  dataError: null,
  dataWarning: null,

  // Instruments
  instruments: [],
  activeInstrument: '',

  // Trading
  pendingOrders: [],
  openPositions: [],
  closedTrades: [],

  // Account
  accountState: null,

  // Chart
  chartSettings: DEFAULT_CHART_SETTINGS,
  timeframe: '1m',
  chartType: 'candlestick',

  // Drawings
  drawings: {},
  activeDrawingTool: 'cursor',
  selectedDrawingId: null,
  drawingsLocked: false,
  drawingsHidden: false,
  magnetMode: 'off',
  stayInDrawing: false,
  activeEmoji: '⭐',
  toolStyles: {},
  drawHistory: { past: {}, future: {} },

  // Chart extras
  orderQty: 1,
  alerts: [],
  alertNotice: null,
  scale: { mode: 'normal', auto: true, invert: false },
  historyCandles: {},
  selectingBar: false,
  tradePanelOpen: true,

  // Results
  showResults: false,

  // Sessions
  sessions: [],
  sessionsLoading: false,

  // --- Actions ---

  initSession: (config) => {
    const instruments = config.instruments?.length ? config.instruments : [config.instrumentSymbol];
    createEnginesForInstruments(instruments, config);
    set({
      sessionId: uid('bt'),
      config,
      status: 'ready',
      instruments,
      activeInstrument: instruments[0],
      timeframe: config.timeframe,
      currentTime: 0,
      playing: false,
      speed: 1,
      clockProgress: 0,
      candleData: {},
      allCandles: {},
      dataLoading: false,
      dataError: null,
      dataWarning: null,
      pendingOrders: [],
      openPositions: [],
      closedTrades: [],
      drawings: Object.fromEntries(instruments.map(s => [s, []])),
      selectedDrawingId: null,
      drawHistory: { past: {}, future: {} },
      alerts: [],
      alertNotice: null,
      historyCandles: {},
      accountState: {
        ...INITIAL_ACCOUNT_STATE,
        startingBalance: config.startingBalance,
        balance: config.startingBalance,
        equity: config.startingBalance,
        peakEquity: config.startingBalance,
      },
    });
  },

  loadSession: async (sessionId) => {
    const { loadBacktestSession } = await import('./persistence');
    const session = await loadBacktestSession(sessionId);
    if (!session) return;
    const instruments = session.config.instruments?.length
      ? session.config.instruments
      : [session.config.instrumentSymbol];
    // Rebuild engines and replay closed trades so balance/drawdown/win-rate
    // reflect history exactly (open positions/pending orders aren't
    // persisted yet, so they start flat on reopen).
    createEnginesForInstruments(instruments, session.config);
    if (engineRegistry.accountTracker) {
      for (const trade of session.trades) {
        engineRegistry.accountTracker.recordTrade(trade, utcToNyDateKey(trade.exitTime ?? trade.entryTime));
      }
    }
    set({
      sessionId: session.id,
      config: session.config,
      status: session.status,
      instruments,
      activeInstrument: session.activeInstrument || instruments[0],
      currentTime: session.clockPosition,
      closedTrades: session.trades,
      accountState: engineRegistry.accountTracker?.state ?? session.accountState,
      chartSettings: session.chartSettings || DEFAULT_CHART_SETTINGS,
      drawings: session.drawings || {},
      selectedDrawingId: null,
      drawHistory: { past: {}, future: {} },
      alerts: session.alerts || [],
      historyCandles: {},
      timeframe: (session.timeframe || session.config.timeframe) as any,
      speed: (session.playbackSpeed || 1) as PlaybackSpeed,
      playing: false,
    });
  },

  saveSession: async () => {
    const state = get();
    if (!state.sessionId || !state.config) return;
    const { saveBacktestSession } = await import('./persistence');
    const session: PersistedSession = {
      id: state.sessionId,
      config: state.config,
      status: state.status,
      clockPosition: state.currentTime,
      activeInstrument: state.activeInstrument,
      trades: state.closedTrades,
      accountState: state.accountState || INITIAL_ACCOUNT_STATE,
      chartSettings: state.chartSettings,
      drawings: state.drawings,
      alerts: state.alerts,
      timeframe: state.timeframe,
      playbackSpeed: state.speed,
      createdAt: Date.now(), // will be overwritten if already exists
      updatedAt: Date.now(),
    };
    await saveBacktestSession(session);
  },

  loadSessionList: async () => {
    set({ sessionsLoading: true });
    try {
      const { listBacktestSessions, sessionToSummary } = await import('./persistence');
      const sessions = await listBacktestSessions();
      set({ sessions: sessions.map(sessionToSummary), sessionsLoading: false });
    } catch {
      set({ sessionsLoading: false });
    }
  },

  deleteSession: async (id) => {
    const { deleteBacktestSession } = await import('./persistence');
    await deleteBacktestSession(id);
    set(s => ({ sessions: s.sessions.filter(ss => ss.id !== id) }));
  },

  setCandleData: (symbol, candles) => {
    set(s => ({
      allCandles: { ...s.allCandles, [symbol]: candles },
    }));
  },

  updateVisibleCandles: () => {
    const { allCandles, currentTime } = get();
    const visible: Record<string, CandleData[]> = {};
    for (const [sym, candles] of Object.entries(allCandles)) {
      visible[sym] = candles.filter(c => c.time <= currentTime);
    }
    set({ candleData: visible });
  },

  switchInstrument: (symbol) => {
    if (get().instruments.includes(symbol)) {
      set({ activeInstrument: symbol });
    }
  },

  nextInstrument: () => {
    const { instruments, activeInstrument } = get();
    if (instruments.length === 0) return;
    const idx = instruments.indexOf(activeInstrument);
    const next = (idx + 1) % instruments.length;
    set({ activeInstrument: instruments[next] });
  },

  prevInstrument: () => {
    const { instruments, activeInstrument } = get();
    if (instruments.length === 0) return;
    const idx = instruments.indexOf(activeInstrument);
    const prev = (idx - 1 + instruments.length) % instruments.length;
    set({ activeInstrument: instruments[prev] });
  },

  setPlaying: (playing) => set({ playing }),
  setSpeed: (speed) => set({ speed }),
  setCurrentTime: (time) => set({ currentTime: time }),

  advanceClock: () => {
    const { allCandles, activeInstrument, currentTime, instruments } = get();
    const candles = allCandles[activeInstrument] || [];
    const nextCandle = candles.find(c => c.time > currentTime);
    if (nextCandle) {
      // Process every instrument's engine against its candle at (or up to)
      // the new time — the clock is global, so all engines step together.
      let totalOpenPnl = 0;
      for (const symbol of instruments) {
        const engine = engineRegistry.orderEngines[symbol];
        if (!engine) continue;
        const symbolCandles = allCandles[symbol] || [];
        const candleAtTime = symbolCandles.find(c => c.time === nextCandle.time);
        if (candleAtTime) {
          const trades = engine.processCandle(candleAtTime);
          for (const trade of trades) {
            engineRegistry.accountTracker?.recordTrade(
              trade,
              utcToNyDateKey(trade.exitTime ?? trade.entryTime),
            );
          }
        }
        totalOpenPnl += engine.openPositions.reduce((sum, p) => sum + p.unrealizedPnl, 0);
      }
      engineRegistry.accountTracker?.setOpenPnl(totalOpenPnl, nextCandle.time);

      set({ currentTime: nextCandle.time });
      get().updateVisibleCandles();
      get().syncEngineState();

      // Price alerts: fire when this bar's range reaches the level, then pause (like TradingView).
      const pendingAlerts = get().alerts.filter((a) => !a.triggered);
      if (pendingAlerts.length) {
        let fired: PriceAlert | null = null;
        const nextAlerts = get().alerts.map((a) => {
          if (a.triggered) return a;
          const bar = (allCandles[a.symbol] || []).find((c) => c.time === nextCandle.time);
          if (!bar) return a;
          const hit = a.direction === 'up' ? bar.high >= a.price : bar.low <= a.price;
          if (!hit) return a;
          fired = fired ?? a;
          return { ...a, triggered: true, triggeredAt: nextCandle.time };
        });
        if (fired) {
          const f = fired as PriceAlert;
          set({
            alerts: nextAlerts,
            playing: false,
            alertNotice: { id: uid('alert'), text: `${f.symbol} crossed ${f.price.toFixed(2)}` },
          });
        }
      }

      const acct = engineRegistry.accountTracker?.state;
      if (acct?.breached) {
        set({ playing: false, status: 'breached' });
      }
    } else {
      set({ playing: false, status: 'completed' });
    }
  },

  stepBack: () => {
    const { allCandles, activeInstrument, currentTime } = get();
    const candles = allCandles[activeInstrument] || [];
    const prevCandles = candles.filter(c => c.time < currentTime);
    if (prevCandles.length > 0) {
      // Note: stepping back does not unwind engine fills — historical
      // order simulation is forward-only, same as a real replay tape.
      set({ currentTime: prevCandles[prevCandles.length - 1].time });
      get().updateVisibleCandles();
    }
  },

  setTimeframe: (tf) => set({ timeframe: tf }),
  setChartType: (ct) => set({ chartType: ct }),

  addTrade: (trade) => set(s => ({ closedTrades: [...s.closedTrades, trade] })),
  setAccountState: (state) => set({ accountState: state }),
  setPendingOrders: (orders) => set({ pendingOrders: orders }),
  setOpenPositions: (positions) => set({ openPositions: positions }),

  placeOrder: (side, quantity, opts) => {
    const { activeInstrument, currentTime, status } = get();
    if (status !== 'paused' && status !== 'running') return;
    const symbol = opts?.symbol ?? activeInstrument;
    const engine = engineRegistry.orderEngines[symbol];
    if (!engine || quantity <= 0) return;
    engine.submitOrder(
      side,
      opts?.type ?? 'market',
      quantity,
      currentTime,
      opts?.price,
      opts?.stopLoss,
      opts?.takeProfit,
    );
    // Market orders fill on the *next* processed candle (matches
    // real-world/TradingView replay semantics: you can't fill against
    // a bar that has already closed). Immediately try against the
    // current bar too, so a market order placed mid-bar feels responsive.
    const candle = (get().allCandles[symbol] || []).find(c => c.time === currentTime);
    if (candle) {
      const trades = engine.processCandle(candle);
      for (const trade of trades) {
        engineRegistry.accountTracker?.recordTrade(trade, utcToNyDateKey(trade.exitTime ?? trade.entryTime));
      }
    }
    get().syncEngineState();
  },

  closePositionForSymbol: (symbol) => {
    const { activeInstrument, currentTime, allCandles } = get();
    const sym = symbol ?? activeInstrument;
    const engine = engineRegistry.orderEngines[sym];
    if (!engine) return;
    const pos = engine.openPositions[0];
    if (!pos) return;
    const candle = (allCandles[sym] || []).filter(c => c.time <= currentTime).at(-1);
    const exitPrice = candle?.close ?? pos.entryPrice;
    const trade = engine.closePosition(pos.orderId, exitPrice, currentTime);
    if (trade) {
      engineRegistry.accountTracker?.recordTrade(trade, utcToNyDateKey(trade.exitTime ?? trade.entryTime));
    }
    get().syncEngineState();
  },

  cancelPendingOrder: (symbol, orderId) => {
    const engine = engineRegistry.orderEngines[symbol];
    if (!engine) return;
    engine.cancelOrder(orderId, get().currentTime);
    get().syncEngineState();
  },

  /** Drag-to-modify a position's stop loss / take profit on the chart. */
  updatePositionRisk: (symbol, positionOrderId, updates) => {
    const engine = engineRegistry.orderEngines[symbol];
    if (!engine) return;
    engine.updatePositionRisk(positionOrderId, updates);
    get().syncEngineState();
  },

  /** Drag-to-modify a pending order's trigger price and/or SL/TP. */
  updatePendingOrder: (symbol, orderId, updates) => {
    const engine = engineRegistry.orderEngines[symbol];
    if (!engine) return;
    engine.updatePendingOrder(orderId, updates);
    get().syncEngineState();
  },

  syncEngineState: () => {
    const { orderEngines, accountTracker } = engineRegistry;
    const pendingOrders = Object.values(orderEngines).flatMap(e => e.pendingOrders);
    const openPositions = Object.values(orderEngines).flatMap(e => e.openPositions);
    const closedTrades = Object.values(orderEngines)
      .flatMap(e => e.closedTrades)
      .sort((a, b) => (a.exitTime ?? 0) - (b.exitTime ?? 0));
    set({
      pendingOrders,
      openPositions,
      closedTrades,
      accountState: accountTracker ? accountTracker.state : get().accountState,
    });
  },

  addDrawing: (symbol, drawing) => {
    pushDrawHistory(set, get, symbol);
    set(s => ({
      drawings: { ...s.drawings, [symbol]: [...(s.drawings[symbol] || []), drawing] },
    }));
  },

  removeDrawing: (symbol, drawingId) => {
    pushDrawHistory(set, get, symbol);
    set(s => ({
      drawings: { ...s.drawings, [symbol]: (s.drawings[symbol] || []).filter(d => d.id !== drawingId) },
      selectedDrawingId: s.selectedDrawingId === drawingId ? null : s.selectedDrawingId,
    }));
  },

  setActiveDrawingTool: (tool) => {
    // Leaving a tool abandons any half-finished measure and clears the selection ring.
    set({ activeDrawingTool: tool, selectedDrawingId: tool && tool !== 'cursor' ? null : get().selectedDrawingId });
  },

  clearDrawings: (symbol) => {
    pushDrawHistory(set, get, symbol);
    set(s => ({ drawings: { ...s.drawings, [symbol]: [] }, selectedDrawingId: null }));
  },

  selectDrawing: (id) => set({ selectedDrawingId: id }),

  updateDrawing: (symbol, id, patch, record = true) => {
    if (record) pushDrawHistory(set, get, symbol);
    set(s => ({
      drawings: {
        ...s.drawings,
        [symbol]: (s.drawings[symbol] || []).map(d => (d.id === id ? { ...d, ...patch } : d)),
      },
    }));
  },

  beginDrawingEdit: (symbol) => pushDrawHistory(set, get, symbol),

  cloneDrawing: (symbol, id) => {
    const src = (get().drawings[symbol] || []).find(d => d.id === id);
    if (!src) return null;
    const copy: DrawingObject = {
      ...src,
      id: uid('drw'),
      locked: false,
      points: src.points.map(p => ({ time: p.time + 300, price: p.price })),
    };
    pushDrawHistory(set, get, symbol);
    set(s => ({
      drawings: { ...s.drawings, [symbol]: [...(s.drawings[symbol] || []), copy] },
      selectedDrawingId: copy.id,
    }));
    return copy.id;
  },

  removeTempDrawings: (symbol) => {
    const list = get().drawings[symbol] || [];
    if (!list.some(d => d.temp)) return;
    set(s => ({ drawings: { ...s.drawings, [symbol]: list.filter(d => !d.temp) } }));
  },

  undoDrawing: (symbol) => {
    const { drawHistory, drawings } = get();
    const past = drawHistory.past[symbol] || [];
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set(s => ({
      drawings: { ...s.drawings, [symbol]: prev },
      selectedDrawingId: null,
      drawHistory: {
        past: { ...s.drawHistory.past, [symbol]: past.slice(0, -1) },
        future: { ...s.drawHistory.future, [symbol]: [...(s.drawHistory.future[symbol] || []), drawings[symbol] || []] },
      },
    }));
  },

  redoDrawing: (symbol) => {
    const { drawHistory, drawings } = get();
    const future = drawHistory.future[symbol] || [];
    if (future.length === 0) return;
    const next = future[future.length - 1];
    set(s => ({
      drawings: { ...s.drawings, [symbol]: next },
      selectedDrawingId: null,
      drawHistory: {
        past: { ...s.drawHistory.past, [symbol]: [...(s.drawHistory.past[symbol] || []), drawings[symbol] || []] },
        future: { ...s.drawHistory.future, [symbol]: future.slice(0, -1) },
      },
    }));
  },

  setToolStyle: (tool, patch) => set(s => ({ toolStyles: { ...s.toolStyles, [tool]: { ...s.toolStyles[tool], ...patch } } })),
  setDrawingsLocked: (v) => set({ drawingsLocked: v }),
  setDrawingsHidden: (v) => set(s => ({
    drawingsHidden: v,
    selectedDrawingId: v ? null : s.selectedDrawingId,
    // Showing again also revives anything hidden one-by-one, so nothing can stay invisible forever.
    drawings: v ? s.drawings : Object.fromEntries(Object.entries(s.drawings).map(([k, list]) => [k, list.map(d => (d.hidden ? { ...d, hidden: false } : d))])),
  })),
  setMagnetMode: (m) => set({ magnetMode: m }),
  setStayInDrawing: (v) => set({ stayInDrawing: v }),
  setActiveEmoji: (e) => set({ activeEmoji: e }),

  setOrderQty: (q) => set({ orderQty: Math.max(1, Math.floor(q) || 1) }),

  addAlert: (symbol, price, direction) => set(s => ({
    alerts: [...s.alerts, { id: uid('alert'), symbol, price, direction, triggered: false }],
  })),
  removeAlert: (id) => set(s => ({ alerts: s.alerts.filter(a => a.id !== id) })),
  clearAlertNotice: () => set({ alertNotice: null }),

  setScale: (patch) => set(s => ({ scale: { ...s.scale, ...patch } })),
  setSelectingBar: (v) => set({ selectingBar: v }),
  setTradePanelOpen: (v) => set({ tradePanelOpen: v }),

  advanceTo: (time) => {
    const noticeAtStart = get().alertNotice?.id;
    let guard = 0;
    set({ playing: false });
    while (guard++ < 100000) {
      const st = get();
      if (st.currentTime >= time || st.status === 'completed' || st.status === 'breached') break;
      const before = st.currentTime;
      st.advanceClock();
      const after = get();
      if (after.currentTime === before) break;
      if (after.alertNotice?.id !== noticeAtStart) break;
    }
  },

  loadHistory: async () => {
    try {
      const { config, instruments, timeframe, allCandles } = get();
      if (!config) return;
      const { loadSymbolCandles } = await import('./data/loader');
      const days = lookbackDays(timeframe);
      for (const symbol of instruments) {
        const first = (allCandles[symbol] || [])[0]?.time;
        if (!first) continue;
        const startIso = new Date((first - days * 86400) * 1000).toISOString();
        const endIso = new Date(first * 1000).toISOString();
        const r = await loadSymbolCandles(symbol, timeframe, startIso, endIso);
        // Session may have moved on (day navigation / timeframe change) while we waited.
        if ((get().allCandles[symbol] || [])[0]?.time !== first || get().timeframe !== timeframe) continue;
        set(s => ({
          historyCandles: { ...s.historyCandles, [symbol]: r.candles.filter(c => c.time < first) },
        }));
      }
    } catch {
      /* context bars are optional — a failed fetch must never break the replay */
    }
  },

  navigateNextDay: async () => {
    const state = get();
    if (!state.config) return;
    const session = state.config.sessionId === 'custom' ? state.config.customSession : undefined;
    const startTime = session?.startTime || '09:30';
    const endTime = session?.endTime || '16:00';
    const currentDateKey = state.currentTime
      ? utcToNyDateKey(state.currentTime)
      : state.config.periodStartUtc?.slice(0, 10) || '';
    const nextSession = navigateToNextSession(currentDateKey, startTime, endTime);
    if (!nextSession) return;

    // Check if within config's end date
    const periodEndSec = state.config.periodEndUtc
      ? Math.floor(new Date(state.config.periodEndUtc).getTime() / 1000)
      : Infinity;
    if (nextSession.startUtc > periodEndSec) return;

    // Fetch data for the new day
    set({ dataLoading: true, playing: false, historyCandles: {} });
    const syms = state.instruments;
    const { loadSymbolCandles } = await import('./data/loader');
    const newStartUtc = new Date(nextSession.startUtc * 1000).toISOString();
    const newEndUtc = new Date(nextSession.endUtc * 1000).toISOString();

    const results = await Promise.all(
      syms.map((symbol) => loadSymbolCandles(symbol, state.timeframe, newStartUtc, newEndUtc)),
    );
    const failed = results.filter((r) => r.candles.length === 0);
    const firstCandles = results[0]?.candles ?? [];
    if (firstCandles.length > 0) {
      // Replace every symbol (empty ones too) so no symbol shows another day's candles.
      for (const r of results) get().setCandleData(r.symbol, r.candles);
      set({
        currentTime: firstCandles[0].time,
        dataLoading: false,
        dataError: null,
        dataWarning: failed.length ? failed.map((r) => r.error).join(' ') : (results.find((r) => r.warning)?.warning ?? null),
        status: 'paused',
      });
    } else {
      // Keep the day the user is on; explain why we didn't move (weekend, holiday, no data).
      set({ dataLoading: false, dataWarning: results[0]?.error ?? 'No data for that session.' });
    }
    get().updateVisibleCandles();
    get().saveSession();
    void get().loadHistory();
  },

  navigatePrevDay: async () => {
    const state = get();
    if (!state.config) return;
    const session = state.config.sessionId === 'custom' ? state.config.customSession : undefined;
    const startTime = session?.startTime || '09:30';
    const endTime = session?.endTime || '16:00';
    const currentDateKey = state.currentTime
      ? utcToNyDateKey(state.currentTime)
      : state.config.periodStartUtc?.slice(0, 10) || '';
    const prevSession = navigateToPreviousSession(currentDateKey, startTime, endTime);
    if (!prevSession) return;

    const periodStartSec = state.config.periodStartUtc
      ? Math.floor(new Date(state.config.periodStartUtc).getTime() / 1000)
      : 0;
    if (prevSession.endUtc < periodStartSec) return;

    set({ dataLoading: true, playing: false, historyCandles: {} });
    const syms = state.instruments;
    const { loadSymbolCandles } = await import('./data/loader');
    const newStartUtc = new Date(prevSession.startUtc * 1000).toISOString();
    const newEndUtc = new Date(prevSession.endUtc * 1000).toISOString();

    const results = await Promise.all(
      syms.map((symbol) => loadSymbolCandles(symbol, state.timeframe, newStartUtc, newEndUtc)),
    );
    const failed = results.filter((r) => r.candles.length === 0);
    const firstCandles = results[0]?.candles ?? [];
    if (firstCandles.length > 0) {
      for (const r of results) get().setCandleData(r.symbol, r.candles);
      set({
        currentTime: firstCandles[0].time,
        dataLoading: false,
        dataError: null,
        dataWarning: failed.length ? failed.map((r) => r.error).join(' ') : (results.find((r) => r.warning)?.warning ?? null),
        status: 'paused',
      });
    } else {
      set({ dataLoading: false, dataWarning: results[0]?.error ?? 'No data for that session.' });
    }
    get().updateVisibleCandles();
    get().saveSession();
    void get().loadHistory();
  },

  changeTimeframe: (tf) => {
    const state = get();
    set({ timeframe: tf });
    // If we have candle data, re-aggregate may be needed
    // For now, re-fetch is triggered by the session page effect
    // which watches config.timeframe changes. We just update the store.
    if (state.config) {
      // Trigger refetch by updating config timeframe
      set(s => ({
        config: s.config ? { ...s.config, timeframe: tf } : null,
      }));
    }
  },

  endSession: () => {
    set({ playing: false, status: 'completed', showResults: true });
    get().saveSession();
  },

  setShowResults: (show) => set({ showResults: show }),

  setStatus: (status) => set({ status }),
  setDataLoading: (loading) => set({ dataLoading: loading }),
  setDataError: (error) => set({ dataError: error }),
  setDataWarning: (warning) => set({ dataWarning: warning }),

  reset: () => {
    engineRegistry.orderEngines = {};
    engineRegistry.accountTracker = null;
    set({
      sessionId: null,
      config: null,
      status: 'ready',
      currentTime: 0,
      playing: false,
      speed: 1,
      clockProgress: 0,
      candleData: {},
      allCandles: {},
      dataResolution: '1m',
      dataLoading: false,
      dataError: null,
      dataWarning: null,
      instruments: [],
      activeInstrument: '',
      pendingOrders: [],
      openPositions: [],
      closedTrades: [],
      accountState: null,
      drawings: {},
      activeDrawingTool: 'cursor',
      selectedDrawingId: null,
      drawHistory: { past: {}, future: {} },
      alerts: [],
      alertNotice: null,
      historyCandles: {},
      selectingBar: false,
      showResults: false,
    });
  },
}));

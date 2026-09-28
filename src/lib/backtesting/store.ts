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
  activeDrawingTool: DrawingToolType | 'cursor' | 'crosshair' | null;

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
  setActiveDrawingTool: (tool: DrawingToolType | 'cursor' | 'crosshair' | null) => void;
  clearDrawings: (symbol: string) => void;

  /** Session navigation. */
  navigateNextDay: () => Promise<void>;
  navigatePrevDay: () => Promise<void>;
  endSession: () => void;
  setShowResults: (show: boolean) => void;

  /** Session status. */
  setStatus: (status: BacktestStatus) => void;
  setDataLoading: (loading: boolean) => void;
  setDataError: (error: string | null) => void;

  /** Reset everything. */
  reset: () => void;
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
  activeDrawingTool: null,

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
      pendingOrders: [],
      openPositions: [],
      closedTrades: [],
      drawings: Object.fromEntries(instruments.map(s => [s, []])),
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

  addDrawing: (symbol, drawing) => set(s => ({
    drawings: {
      ...s.drawings,
      [symbol]: [...(s.drawings[symbol] || []), drawing],
    },
  })),

  removeDrawing: (symbol, drawingId) => set(s => ({
    drawings: {
      ...s.drawings,
      [symbol]: (s.drawings[symbol] || []).filter(d => d.id !== drawingId),
    },
  })),

  setActiveDrawingTool: (tool) => set({ activeDrawingTool: tool }),

  clearDrawings: (symbol) => set(s => ({
    drawings: { ...s.drawings, [symbol]: [] },
  })),

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
    set({ dataLoading: true, playing: false });
    const syms = state.instruments;
    const { lseProvider } = await import('./data/lse-provider');
    const { cacheKey: ck, getCachedCandles, setCachedCandles } = await import('./data/cache');
    const { instrumentBySymbol: lookupSpec } = await import('./instruments');

    const newStartUtc = new Date(nextSession.startUtc * 1000).toISOString();
    const newEndUtc = new Date(nextSession.endUtc * 1000).toISOString();

    for (const symbol of syms) {
      try {
        const key = ck('lse', symbol, nextSession.dateKey, state.timeframe);
        const cached = await getCachedCandles(key);
        if (cached && cached.length > 0) {
          get().setCandleData(symbol, cached);
          continue;
        }
        const providerSymbol = lookupSpec(symbol)?.providerSymbol || symbol;
        const candles = await lseProvider.getCandles(providerSymbol, state.timeframe, newStartUtc, newEndUtc);
        get().setCandleData(symbol, candles);
        if (candles.length > 0) await setCachedCandles(key, candles);
      } catch (err) {
        set({ dataError: err instanceof Error ? err.message : 'Failed to load data' });
      }
    }

    // Set clock to start of new session
    const allCandles = get().allCandles;
    const firstSymbol = syms[0];
    const firstCandles = allCandles[firstSymbol];
    if (firstCandles && firstCandles.length > 0) {
      set({ currentTime: firstCandles[0].time, dataLoading: false, status: 'paused' });
      get().updateVisibleCandles();
    } else {
      set({ dataLoading: false });
    }
    get().saveSession();
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

    set({ dataLoading: true, playing: false });
    const syms = state.instruments;
    const { lseProvider } = await import('./data/lse-provider');
    const { cacheKey: ck, getCachedCandles, setCachedCandles } = await import('./data/cache');
    const { instrumentBySymbol: lookupSpec } = await import('./instruments');

    const newStartUtc = new Date(prevSession.startUtc * 1000).toISOString();
    const newEndUtc = new Date(prevSession.endUtc * 1000).toISOString();

    for (const symbol of syms) {
      try {
        const key = ck('lse', symbol, prevSession.dateKey, state.timeframe);
        const cached = await getCachedCandles(key);
        if (cached && cached.length > 0) {
          get().setCandleData(symbol, cached);
          continue;
        }
        const providerSymbol = lookupSpec(symbol)?.providerSymbol || symbol;
        const candles = await lseProvider.getCandles(providerSymbol, state.timeframe, newStartUtc, newEndUtc);
        get().setCandleData(symbol, candles);
        if (candles.length > 0) await setCachedCandles(key, candles);
      } catch (err) {
        set({ dataError: err instanceof Error ? err.message : 'Failed to load data' });
      }
    }

    const allCandles = get().allCandles;
    const firstSymbol = syms[0];
    const firstCandles = allCandles[firstSymbol];
    if (firstCandles && firstCandles.length > 0) {
      set({ currentTime: firstCandles[0].time, dataLoading: false, status: 'paused' });
      get().updateVisibleCandles();
    } else {
      set({ dataLoading: false });
    }
    get().saveSession();
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
      instruments: [],
      activeInstrument: '',
      pendingOrders: [],
      openPositions: [],
      closedTrades: [],
      accountState: null,
      drawings: {},
      activeDrawingTool: null,
      showResults: false,
    });
  },
}));

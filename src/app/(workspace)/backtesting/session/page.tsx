"use client";

import { useEffect, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBacktest } from "@/lib/backtesting/store";
import { lseProvider } from "@/lib/backtesting/data/lse-provider";
import { instrumentBySymbol } from "@/lib/backtesting/instruments";
import { cacheKey, getCachedCandles, setCachedCandles } from "@/lib/backtesting/data/cache";
import { CandlestickIcon } from "@/components/ui/icons";
import { Button } from "@/components/ui/button";
import BacktestChart from "@/components/backtesting/chart";
import TopToolbar from "@/components/backtesting/top-toolbar";
import LeftToolbar from "@/components/backtesting/left-toolbar";
import BottomBar from "@/components/backtesting/bottom-bar";
import TradingPanel from "@/components/backtesting/trading-panel";
import SessionResults from "@/components/backtesting/session-results";

function BacktestWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id");

  const config = useBacktest((s) => s.config);
  const status = useBacktest((s) => s.status);
  const instruments = useBacktest((s) => s.instruments);
  const activeInstrument = useBacktest((s) => s.activeInstrument);
  const candleData = useBacktest((s) => s.candleData);
  const dataLoading = useBacktest((s) => s.dataLoading);
  const dataError = useBacktest((s) => s.dataError);
  const playing = useBacktest((s) => s.playing);
  const currentTime = useBacktest((s) => s.currentTime);
  const openPositions = useBacktest((s) => s.openPositions);
  const pendingOrders = useBacktest((s) => s.pendingOrders);
  const closedTrades = useBacktest((s) => s.closedTrades);
  const drawings = useBacktest((s) => s.drawings);
  const activeDrawingTool = useBacktest((s) => s.activeDrawingTool);
  const showResults = useBacktest((s) => s.showResults);

  const loadSession = useBacktest((s) => s.loadSession);
  const setCandleData = useBacktest((s) => s.setCandleData);
  const setDataLoading = useBacktest((s) => s.setDataLoading);
  const setDataError = useBacktest((s) => s.setDataError);
  const setCurrentTime = useBacktest((s) => s.setCurrentTime);
  const setPlaying = useBacktest((s) => s.setPlaying);
  const advanceClock = useBacktest((s) => s.advanceClock);
  const updateVisibleCandles = useBacktest((s) => s.updateVisibleCandles);
  const saveSession = useBacktest((s) => s.saveSession);
  const setStatus = useBacktest((s) => s.setStatus);
  const addDrawing = useBacktest((s) => s.addDrawing);
  const stepBack = useBacktest((s) => s.stepBack);
  const updatePositionRisk = useBacktest((s) => s.updatePositionRisk);
  const updatePendingOrder = useBacktest((s) => s.updatePendingOrder);

  const playIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const speed = useBacktest((s) => s.speed);

  // Load session from IndexedDB if we have an ID
  useEffect(() => {
    if (sessionId && !config) {
      loadSession(sessionId);
    }
  }, [sessionId, config, loadSession]);

  // Also check sessionStorage for new session handoff
  useEffect(() => {
    if (!config) {
      const raw = sessionStorage.getItem("edgebook.backtesting.pendingConfig");
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          useBacktest.getState().initSession(parsed);
          sessionStorage.removeItem("edgebook.backtesting.pendingConfig");
        } catch { /* ignore */ }
      }
    }
  }, [config]);

  // Fetch candle data from LSE when config is ready
  useEffect(() => {
    if (!config) return;
    const syms = config.instruments?.length ? config.instruments : [config.instrumentSymbol];
    if (!config.periodStartUtc || !config.periodEndUtc) return;

    let cancelled = false;
    async function fetchData() {
      setDataLoading(true);
      setDataError(null);

      for (const symbol of syms) {
        try {
          // Check cache first
          const key = cacheKey("lse", symbol, config!.periodStartUtc!.slice(0, 10), config!.timeframe);
          const cached = await getCachedCandles(key);
          if (cached && cached.length > 0 && !cancelled) {
            setCandleData(symbol, cached);
            continue;
          }

          // Fetch from LSE
          const providerSymbol = instrumentBySymbol(symbol)?.providerSymbol || symbol;
          const candles = await lseProvider.getCandles(
            providerSymbol,
            config!.timeframe,
            config!.periodStartUtc!,
            config!.periodEndUtc!,
          );

          if (!cancelled) {
            setCandleData(symbol, candles);
            if (candles.length > 0) {
              await setCachedCandles(key, candles);
            }
          }
        } catch (err) {
          if (!cancelled) {
            setDataError(err instanceof Error ? err.message : "Failed to load data");
          }
        }
      }

      if (!cancelled) {
        setDataLoading(false);
        const allCandles = useBacktest.getState().allCandles;
        const firstSymbol = syms[0];
        const firstCandles = allCandles[firstSymbol];
        if (firstCandles && firstCandles.length > 0) {
          setCurrentTime(firstCandles[0].time);
          updateVisibleCandles();
          setStatus("paused");
        }
      }
    }

    fetchData();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.periodStartUtc, config?.periodEndUtc, config?.timeframe]);

  // Playback timer
  useEffect(() => {
    if (playing) {
      const intervalMs = 1000 / speed;
      playIntervalRef.current = setInterval(() => {
        advanceClock();
      }, intervalMs);
    } else {
      if (playIntervalRef.current) {
        clearInterval(playIntervalRef.current);
        playIntervalRef.current = null;
      }
    }
    return () => {
      if (playIntervalRef.current) clearInterval(playIntervalRef.current);
    };
  }, [playing, speed, advanceClock]);

  // Keyboard controls
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (e.key === "ArrowUp") {
        e.preventDefault();
        useBacktest.getState().prevInstrument();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        useBacktest.getState().nextInstrument();
      } else if (e.key === " ") {
        e.preventDefault();
        const s = useBacktest.getState();
        if (s.status !== 'completed' && s.status !== 'breached') {
          s.setPlaying(!s.playing);
        }
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        if (!useBacktest.getState().playing) {
          useBacktest.getState().advanceClock();
        }
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (!useBacktest.getState().playing) {
          useBacktest.getState().stepBack();
        }
      } else if (e.key === "Escape") {
        // Clear drawing tool
        useBacktest.getState().setActiveDrawingTool(null);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Auto-save periodically
  useEffect(() => {
    const timer = setInterval(() => {
      if (config) saveSession();
    }, 30_000);
    return () => clearInterval(timer);
  }, [config, saveSession]);

  const visibleCandles = candleData[activeInstrument] || [];
  const currentDrawings = drawings[activeInstrument] || [];

  if (!config) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#131722]">
        <div className="space-y-4 text-center">
          <CandlestickIcon className="mx-auto h-8 w-8 text-white/30" />
          <p className="text-sm text-white/50">No backtesting session configured.</p>
          <Button variant="outline" size="sm" onClick={() => router.push("/lab#backtesting")}>
            Back to sessions
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col bg-[#131722] text-white">
      {/* Top toolbar */}
      <TopToolbar
        onBack={() => {
          saveSession();
          router.push("/lab#backtesting");
        }}
      />

      {/* Main content area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left drawing toolbar */}
        <LeftToolbar />

        {/* Chart area */}
        <div className="relative flex-1">
          {dataLoading && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[#131722]/80">
              <div className="space-y-3 text-center">
                <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
                <p className="text-sm text-white/50">Loading market data from London Strategic Edge…</p>
              </div>
            </div>
          )}

          {dataError && (
            <div className="absolute inset-0 z-20 grid place-items-center bg-[#131722]/80">
              <div className="max-w-md space-y-3 text-center">
                <p className="text-sm font-semibold text-loss">Data Error</p>
                <p className="text-[13px] text-white/50">{dataError}</p>
                <p className="text-[11px] text-white/30">
                  Make sure LSE_API_KEY is configured in .env.local and the server is running.
                </p>
              </div>
            </div>
          )}

          {status === "completed" && !showResults && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-profit/30 bg-profit/10 px-4 py-2">
              <p className="text-sm font-semibold text-profit">Session Complete</p>
              <button
                onClick={() => useBacktest.getState().setShowResults(true)}
                className="rounded bg-profit/20 px-2 py-0.5 text-[11px] font-medium text-profit hover:bg-profit/30"
              >
                View Results
              </button>
            </div>
          )}

          {status === "breached" && !showResults && (
            <div className="absolute left-1/2 top-4 z-20 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-loss/30 bg-loss/10 px-4 py-2">
              <p className="text-sm font-semibold text-loss">Account Breached</p>
              <button
                onClick={() => useBacktest.getState().setShowResults(true)}
                className="rounded bg-loss/20 px-2 py-0.5 text-[11px] font-medium text-loss hover:bg-loss/30"
              >
                View Results
              </button>
            </div>
          )}

          <BacktestChart
            candles={visibleCandles}
            symbol={activeInstrument}
            openPositions={openPositions}
            pendingOrders={pendingOrders}
            closedTrades={closedTrades}
            drawings={currentDrawings}
            activeDrawingTool={activeDrawingTool}
            onDrawingAdded={(drawing) => addDrawing(activeInstrument, drawing)}
            tickSize={instrumentBySymbol(activeInstrument)?.tickSize}
            onUpdatePositionRisk={(positionOrderId, updates) =>
              updatePositionRisk(activeInstrument, positionOrderId, updates)
            }
            onUpdatePendingOrderPrice={(orderId, price) =>
              updatePendingOrder(activeInstrument, orderId, { price })
            }
          />
        </div>

        {/* Right trading panel */}
        <TradingPanel />
      </div>

      {/* Bottom status bar */}
      <BottomBar />

      {/* Session results overlay */}
      {showResults && (
        <SessionResults
          onReturnToSessions={() => {
            saveSession();
            router.push("/lab#backtesting");
          }}
        />
      )}
    </div>
  );
}

export default function BacktestSessionPage() {
  return (
    <Suspense fallback={
      <div className="grid min-h-dvh place-items-center bg-[#131722]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-gold/30 border-t-gold" />
      </div>
    }>
      <BacktestWorkspaceInner />
    </Suspense>
  );
}

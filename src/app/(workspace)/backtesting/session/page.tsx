"use client";

import { useEffect, useMemo, useRef, useState, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useBacktest } from "@/lib/backtesting/store";
import { loadSymbolCandles, resolveClock } from "@/lib/backtesting/data/loader";
import { instrumentBySymbol } from "@/lib/backtesting/instruments";
import { useTheme } from "@/lib/theme";
import BacktestChart from "@/components/backtesting/chart";
import TopToolbar from "@/components/backtesting/top-toolbar";
import LeftToolbar from "@/components/backtesting/left-toolbar";
import ReplayToolbar from "@/components/backtesting/replay-toolbar";
import RangeBar from "@/components/backtesting/range-bar";
import ReplayTradeBanner from "@/components/backtesting/replay-trade-banner";
import PaperPanel from "@/components/backtesting/paper-panel";
import OrderTicket from "@/components/backtesting/order-ticket";
import SettingsDialog from "@/components/backtesting/settings-dialog";
import SessionResults from "@/components/backtesting/session-results";
import { emitChartCommand, onChartCommand } from "@/components/backtesting/chart-bus";
import FloatingTools from "@/components/backtesting/floating-tools";
import FavoritesBar from "@/components/backtesting/favorites-bar";
import TooltipLayer from "@/components/backtesting/ej-tooltip";
import ToastHost, { toast } from "@/components/backtesting/ej-toast";
import EJMark from "@/components/backtesting/ej-mark";
import { I } from "@/components/backtesting/tv-icons";
import "@/components/backtesting/tv.css";
import "@/components/backtesting/ej.css";
import "@/components/backtesting/ej-tools.css";

const ALT_TOOLS: Record<string, "trend-line" | "horizontal-line" | "horizontal-ray" | "vertical-line" | "cross-line" | "fib-retracement"> = {
  KeyT: "trend-line", KeyH: "horizontal-line", KeyJ: "horizontal-ray", KeyV: "vertical-line", KeyC: "cross-line", KeyF: "fib-retracement",
};

function BacktestWorkspaceInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get("id");
  const { resolved: theme } = useTheme();

  const config = useBacktest((s) => s.config);
  const status = useBacktest((s) => s.status);
  const activeInstrument = useBacktest((s) => s.activeInstrument);
  const allCandles = useBacktest((s) => s.allCandles);
  const candleData = useBacktest((s) => s.candleData);
  const historyCandles = useBacktest((s) => s.historyCandles);
  const dataLoading = useBacktest((s) => s.dataLoading);
  const dataError = useBacktest((s) => s.dataError);
  const dataWarning = useBacktest((s) => s.dataWarning);
  const playing = useBacktest((s) => s.playing);
  const showResults = useBacktest((s) => s.showResults);
  const selectedDrawingId = useBacktest((s) => s.selectedDrawingId);
  const alertNotice = useBacktest((s) => s.alertNotice);

  const loadSession = useBacktest((s) => s.loadSession);
  const setCandleData = useBacktest((s) => s.setCandleData);
  const setDataLoading = useBacktest((s) => s.setDataLoading);
  const setDataError = useBacktest((s) => s.setDataError);
  const setDataWarning = useBacktest((s) => s.setDataWarning);
  const setCurrentTime = useBacktest((s) => s.setCurrentTime);
  const updateVisibleCandles = useBacktest((s) => s.updateVisibleCandles);
  const saveSession = useBacktest((s) => s.saveSession);
  const setStatus = useBacktest((s) => s.setStatus);
  const updatePositionRisk = useBacktest((s) => s.updatePositionRisk);
  const updatePendingOrder = useBacktest((s) => s.updatePendingOrder);
  const speed = useBacktest((s) => s.speed);

  const [retryNonce, setRetryNonce] = useState(0);

  // Leaving the workspace. A session opened from a JOURNAL trade ("Replay this trade") is throw-away:
  // delete it on the way out and go back to the journal. Normal backtests are saved and return to the Lab.
  const leave = async () => {
    const st = useBacktest.getState();
    if (st.config?.replayTrade) {
      const { discardReplaySession } = await import("@/lib/backtesting/persistence");
      await discardReplaySession(st.sessionId);
      router.push("/journal");
      return;
    }
    await saveSession();
    router.push("/lab#backtesting");
  };
  const [replayOpen, setReplayOpen] = useState(true);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [panelsHidden, setPanelsHidden] = useState(false);

  // TradingView "fullscreen": hide every panel, go browser-fullscreen, Esc brings them back.
  const hidePanels = () => {
    setPanelsHidden(true);
    toast({ kind: "info", text: "Panels hidden — press Esc to show them", ms: 3500 });
    void document.documentElement.requestFullscreen?.().catch(() => {});
  };
  const showPanels = () => {
    setPanelsHidden(false);
    if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
  };
  const togglePanels = () => (panelsRef.current.hidden ? showPanels() : hidePanels());
  const panelsRef = useRef({ hidden: false, toggle: () => {} });
  panelsRef.current = { hidden: panelsHidden, toggle: togglePanels };

  // Browser Esc / exiting fullscreen also restores the panels.
  useEffect(() => {
    const on = () => { if (!document.fullscreenElement) setPanelsHidden(false); };
    document.addEventListener("fullscreenchange", on);
    return () => document.removeEventListener("fullscreenchange", on);
  }, []);

  // Context menu → Settings…
  useEffect(() => onChartCommand((c) => { if (c.type === "settings") setSettingsOpen(true); }), []);

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

  // Fetch candle data from LSE when config is ready (or timeframe / retry changes)
  useEffect(() => {
    if (!config) return;
    const syms = config.instruments?.length ? config.instruments : [config.instrumentSymbol];
    if (!config.periodStartUtc || !config.periodEndUtc) return;
    const { periodStartUtc, periodEndUtc, timeframe } = config;

    let cancelled = false;
    async function fetchData() {
      setDataLoading(true);
      setDataError(null);
      setDataWarning(null);

      const results = await Promise.all(
        syms.map((sym) => loadSymbolCandles(sym, timeframe, periodStartUtc!, periodEndUtc!)),
      );
      if (cancelled) return;

      // Store every result — empty ones too, so stale candles never linger.
      for (const r of results) setCandleData(r.symbol, r.candles);
      setDataLoading(false);

      const anchor = results.find((r) => r.candles.length > 0);
      if (!anchor) {
        // Nothing loaded anywhere: say exactly why instead of showing a blank chart.
        setDataError(results[0]?.error ?? "No candles were returned for this session.");
        return;
      }

      // Non-fatal problems (one symbol empty, truncated data) → banner, chart still works.
      const notes = [
        ...results.filter((r) => r.candles.length === 0 && r.error).map((r) => r.error as string),
        ...results.filter((r) => r.warning).map((r) => r.warning as string),
      ];
      if (notes.length) setDataWarning(notes.join(" "));
      if (anchor.symbol !== syms[0]) useBacktest.getState().switchInstrument(anchor.symbol);

      // Keep the replay position on resume / timeframe change; only a fresh
      // session (or a position outside the loaded range) starts at the first candle.
      const st = useBacktest.getState();
      setCurrentTime(resolveClock(anchor.candles, st.currentTime));
      updateVisibleCandles();
      if (st.status === "ready") setStatus("paused");
      // Left-hand context bars (best effort, never blocks the replay).
      void useBacktest.getState().loadHistory();
    }

    fetchData();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config?.periodStartUtc, config?.periodEndUtc, config?.timeframe, retryNonce]);

  // Playback timer — ONE interval, owned by this effect (no shared ref), so
  // pausing / changing speed always clears exactly the interval that was started.
  useEffect(() => {
    if (!playing) return;
    const id = setInterval(() => {
      const st = useBacktest.getState();
      if (!st.playing) return;
      st.advanceClock();
    }, 1000 / speed);
    return () => clearInterval(id);
  }, [playing, speed]);

  // Keyboard: TradingView shortcuts + the app's replay keys
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      const st = useBacktest.getState();
      const canTrade = st.status === "paused" || st.status === "running";

      if (e.ctrlKey && e.altKey && e.code === "KeyH") { e.preventDefault(); st.setDrawingsHidden(!st.drawingsHidden); return; }
      if (e.altKey && !e.ctrlKey && !e.metaKey) {
        if (ALT_TOOLS[e.code]) { e.preventDefault(); st.setActiveDrawingTool(ALT_TOOLS[e.code]); return; }
        if (e.code === "KeyS") { e.preventDefault(); emitChartCommand({ type: "screenshot", mode: "download" }); return; }
        if (e.code === "KeyI") { e.preventDefault(); st.setScale({ invert: !st.scale.invert }); return; }
        if (e.code === "KeyP") { e.preventDefault(); st.setScale({ mode: st.scale.mode === "percent" ? "normal" : "percent" }); return; }
        if (e.code === "KeyL") { e.preventDefault(); st.setScale({ mode: st.scale.mode === "log" ? "normal" : "log" }); return; }
        if (e.code === "KeyR") { e.preventDefault(); emitChartCommand({ type: "reset" }); return; }
      }
      if (e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        if (e.code === "KeyB" && canTrade) { e.preventDefault(); st.placeOrder("buy", st.orderQty); return; }
        if (e.code === "KeyS" && canTrade) { e.preventDefault(); st.placeOrder("sell", st.orderQty); return; }
        if (e.code === "KeyF") { e.preventDefault(); panelsRef.current.toggle(); return; }
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "ArrowUp") { e.preventDefault(); st.prevInstrument(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); st.nextInstrument(); }
      else if (e.key === " ") {
        e.preventDefault();
        if (st.status !== "completed" && st.status !== "breached") st.setPlaying(!st.playing);
      } else if (e.key === "ArrowRight") { e.preventDefault(); if (!st.playing) st.advanceClock(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (!st.playing) st.stepBack(); }
      else if (e.key === "Escape") {
        if (panelsRef.current.hidden) { panelsRef.current.toggle(); return; }
        st.setActiveDrawingTool("cursor");
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Auto-save periodically
  useEffect(() => {
    const timer = setInterval(() => {
      if (config) saveSession();
    }, 30_000);
    return () => clearInterval(timer);
  }, [config, saveSession]);

  // Alert notice → toast (the store notice itself still clears on its own timer, as before).
  useEffect(() => {
    if (!alertNotice) return;
    toast({ kind: "warn", text: alertNotice.text, ms: 7000 });
    const id = setTimeout(() => useBacktest.getState().clearAlertNotice(), 7000);
    return () => clearTimeout(id);
  }, [alertNotice]);

  /* Chart input: context bars + replayed bars, and the time axis incl. unrevealed bars. */
  const all = allCandles[activeInstrument];
  const visible = candleData[activeInstrument];
  const history = historyCandles[activeInstrument];
  const anchorTime = all?.[0]?.time ?? 0;
  const chartCandles = useMemo(() => {
    const v = visible ?? [];
    const first = v[0]?.time ?? Infinity;
    const h = (history ?? []).filter((c) => c.time < first);
    return h.length ? h.concat(v) : v;
  }, [visible, history]);
  const allTimes = useMemo(() => {
    const a = all ?? [];
    const first = a[0]?.time ?? Infinity;
    const h = (history ?? []).filter((c) => c.time < first).map((c) => c.time);
    return h.concat(a.map((c) => c.time));
  }, [all, history]);

  if (!config) {
    return (
      <div className="tv-root" data-tv-theme={theme} style={{ placeItems: "center", display: "grid" }}>
        <TooltipLayer /><ToastHost />
        <div className="ej-state">
          <EJMark size={44} title="" />
          <h2>No session open</h2>
          <p>Pick a backtest from your sessions to start replaying.</p>
          <button type="button" className="tv-btn primary" onClick={() => router.push("/lab#backtesting")}>Back to sessions</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-root" data-tv-theme={theme}>
      {!panelsHidden && <TopToolbar
        onToggleFocus={togglePanels}
        onBack={() => { void leave(); }}
        replayOpen={replayOpen}
        onToggleReplay={() => setReplayOpen((o) => !o)}
        ticketOpen={ticketOpen}
        onToggleTicket={() => setTicketOpen((o) => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
      />}

      <div className="tv-body">
        {!panelsHidden && <LeftToolbar symbol={activeInstrument} />}

        <div className="tv-main">
          <div className="tv-stage">
            <BacktestChart
              candles={chartCandles}
              allTimes={allTimes}
              symbol={activeInstrument}
              anchorTime={anchorTime}
              tickSize={instrumentBySymbol(activeInstrument)?.tickSize}
              onUpdatePositionRisk={(id, updates) => updatePositionRisk(activeInstrument, id, updates)}
              onUpdatePendingOrderPrice={(id, price) => updatePendingOrder(activeInstrument, id, { price })}
            />

            <ReplayTradeBanner />
            {panelsHidden ? <FloatingTools onExit={showPanels} /> : <FavoritesBar />}
            {replayOpen && <ReplayToolbar shifted={!!selectedDrawingId} onClose={() => setReplayOpen(false)} />}
            {ticketOpen && <OrderTicket onClose={() => setTicketOpen(false)} />}

            {dataLoading && (
              <div className="tv-cover" role="status" aria-live="polite" aria-label="Loading market data">
                <div className="ej-skel" aria-hidden="true">
                  {Array.from({ length: 28 }, (_, i) => <i key={i} style={{ height: `${28 + ((i * 37) % 46)}%`, animationDelay: `${(i % 7) * 70}ms` }} />)}
                </div>
                <div className="ej-loading"><EJMark size={34} title="" /><b>Loading market data</b><span>Preparing your replay…</span></div>
              </div>
            )}

            {dataError && !dataLoading && (
              <div className="tv-cover">
                <div className="ej-state" role="alert">
                  <span className="ej-state-ic is-bad"><I name="alert" size={22} filled /></span>
                  <h2>No data to replay</h2>
                  <p>{dataError}</p>
                  <div className="ej-state-actions">
                    <button type="button" className="tv-btn primary" onClick={() => setRetryNonce((n) => n + 1)}>Retry</button>
                    <button type="button" className="tv-btn" onClick={() => router.push("/backtesting/create")}>Change session</button>
                  </div>
                </div>
              </div>
            )}

            {dataWarning && !dataError && (
              <div className="tv-banner is-warn" role="status">
                <I name="alert" size={16} filled />
                <span>{dataWarning}</span>
                <button type="button" onClick={() => setDataWarning(null)} aria-label="Dismiss" data-tip="Dismiss"><I name="close" size={14} /></button>
              </div>
            )}

            {(status === "completed" || status === "breached") && !showResults && (
              <div className={`tv-banner ${status === "completed" ? "ok" : "bad"}`}>
                <EJMark size={20} title="" />
                <b>{status === "completed" ? "Session complete" : "Account breached"}</b>
                <button type="button" className="tv-linkbtn" onClick={() => useBacktest.getState().setShowResults(true)}>View results</button>
              </div>
            )}
          </div>

          {!panelsHidden && <RangeBar />}
          {!panelsHidden && <PaperPanel />}
        </div>
      </div>

      <TooltipLayer />
      <ToastHost />

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

      {showResults && (
        <SessionResults onReturnToSessions={() => { void leave(); }} />
      )}
    </div>
  );
}

export default function BacktestSessionPage() {
  return (
    <Suspense fallback={<div className="tv-root" style={{ placeItems: "center", display: "grid" }}><div className="ej-loading"><EJMark size={34} title="" /><span>Loading workspace…</span></div></div>}>
      <BacktestWorkspaceInner />
    </Suspense>
  );
}

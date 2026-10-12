"use client";

import { useEffect, useMemo, useState, Suspense } from "react";
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
import { emitChartCommand } from "@/components/backtesting/chart-bus";
import "@/components/backtesting/tv.css";

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
  const [replayOpen, setReplayOpen] = useState(true);
  const [ticketOpen, setTicketOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);

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
        if (e.code === "KeyF") {
          e.preventDefault();
          if (document.fullscreenElement) void document.exitFullscreen(); else void document.documentElement.requestFullscreen?.();
          return;
        }
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "ArrowUp") { e.preventDefault(); st.prevInstrument(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); st.nextInstrument(); }
      else if (e.key === " ") {
        e.preventDefault();
        if (st.status !== "completed" && st.status !== "breached") st.setPlaying(!st.playing);
      } else if (e.key === "ArrowRight") { e.preventDefault(); if (!st.playing) st.advanceClock(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); if (!st.playing) st.stepBack(); }
      else if (e.key === "Escape") { st.setActiveDrawingTool("cursor"); }
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

  // Alert toast fades on its own.
  useEffect(() => {
    if (!alertNotice) return;
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
        <div style={{ textAlign: "center" }}>
          <p style={{ color: "var(--tv-muted)", marginBottom: 12 }}>No backtesting session configured.</p>
          <button type="button" className="tv-btn" onClick={() => router.push("/lab#backtesting")}>Back to sessions</button>
        </div>
      </div>
    );
  }

  return (
    <div className="tv-root" data-tv-theme={theme}>
      <TopToolbar
        onBack={() => { saveSession(); router.push("/lab#backtesting"); }}
        replayOpen={replayOpen}
        onToggleReplay={() => setReplayOpen((o) => !o)}
        ticketOpen={ticketOpen}
        onToggleTicket={() => setTicketOpen((o) => !o)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div className="tv-body">
        <LeftToolbar symbol={activeInstrument} />

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
            {replayOpen && <ReplayToolbar shifted={!!selectedDrawingId} onClose={() => setReplayOpen(false)} />}
            {ticketOpen && <OrderTicket onClose={() => setTicketOpen(false)} />}

            {dataLoading && (
              <div className="tv-cover">
                <div><div className="tv-spinner" /><p style={{ color: "var(--tv-muted)" }}>Loading market data…</p></div>
              </div>
            )}

            {dataError && !dataLoading && (
              <div className="tv-cover">
                <div style={{ maxWidth: 420 }}>
                  <p style={{ color: "var(--tv-down)", fontWeight: 600, marginBottom: 6 }}>No data to replay</p>
                  <p style={{ color: "var(--tv-muted)", lineHeight: 1.5, marginBottom: 14 }}>{dataError}</p>
                  <div style={{ display: "flex", gap: 8, justifyContent: "center" }}>
                    <button type="button" className="tv-btn primary" onClick={() => setRetryNonce((n) => n + 1)}>Retry</button>
                    <button type="button" className="tv-btn" onClick={() => router.push("/backtesting/create")}>Change session</button>
                  </div>
                </div>
              </div>
            )}

            {dataWarning && !dataError && (
              <div className="tv-banner">
                <span>{dataWarning}</span>
                <button type="button" onClick={() => setDataWarning(null)} aria-label="Dismiss">✕</button>
              </div>
            )}

            {(status === "completed" || status === "breached") && !showResults && (
              <div className={`tv-banner ${status === "completed" ? "ok" : "bad"}`}>
                <b>{status === "completed" ? "Session complete" : "Account breached"}</b>
                <button type="button" className="tv-linkbtn" onClick={() => useBacktest.getState().setShowResults(true)}>View results</button>
              </div>
            )}
          </div>

          <RangeBar />
          <PaperPanel />
        </div>
      </div>

      {alertNotice && (
        <div className="tv-toast" role="status">
          <b style={{ color: "#ff9800" }}>Alert</b><span>{alertNotice.text}</span>
          <button type="button" onClick={() => useBacktest.getState().clearAlertNotice()} aria-label="Dismiss">✕</button>
        </div>
      )}

      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}

      {showResults && (
        <SessionResults onReturnToSessions={() => { saveSession(); router.push("/lab#backtesting"); }} />
      )}
    </div>
  );
}

export default function BacktestSessionPage() {
  return (
    <Suspense fallback={<div className="tv-root" style={{ placeItems: "center", display: "grid" }}><div className="tv-spinner" /></div>}>
      <BacktestWorkspaceInner />
    </Suspense>
  );
}

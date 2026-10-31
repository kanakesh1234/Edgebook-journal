"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { instrumentBySymbol } from "@/lib/backtesting/instruments";
import { setThemeChoice, useTheme } from "@/lib/theme";
import { formatMoney } from "@/lib/format";
import type { ChartType, Timeframe } from "@/lib/backtesting/types";
import { emitChartCommand } from "./chart-bus";
import { fmtPrice } from "./drawings/render";
import { I } from "./tv-icons";
import { useOutside } from "./tv-ui";
import IndicatorsMenu from "./indicators-menu";
import EJMark from "./ej-mark";

const QUICK_TF: Timeframe[] = ["30s", "1m", "3m", "5m", "15m", "1h", "4h"];
const TF_GROUPS: Array<{ title: string; items: Timeframe[] }> = [
  { title: "SECONDS", items: ["1s", "5s", "10s", "15s", "30s"] },
  { title: "MINUTES", items: ["1m", "2m", "3m", "5m", "10m", "15m", "30m"] },
  { title: "HOURS", items: ["1h", "2h", "4h"] },
  { title: "DAYS", items: ["1D"] },
];
const tfName = (tf: string) => ({ "1h": "1 hour", "2h": "2 hours", "4h": "4 hours", "1D": "1 day" } as Record<string, string>)[tf]
  ?? tf.replace(/^(\d+)s$/, "$1 second").replace(/^(\d+)m$/, "$1 minute");

const CHART_TYPES: Array<{ id: ChartType; label: string; icon: string }> = [
  { id: "bar", label: "Bars", icon: "bars" },
  { id: "candlestick", label: "Candles", icon: "candles" },
  { id: "hollow-candles", label: "Hollow candles", icon: "hollow" },
  { id: "line", label: "Line", icon: "line" },
  { id: "area", label: "Area", icon: "area" },
  { id: "baseline", label: "Baseline", icon: "baseline" },
];

function Dropdown({
  button, children, align = "left", title,
}: { button: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; title?: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, open, close);
  return (
    <div className="tv-dd" ref={ref}>
      <button type="button" title={title} className={`tv-tbtn${open ? " is-on" : ""}`} onClick={() => setOpen((o) => !o)}>{button}</button>
      {open && (
        <div className="tv-menu" style={align === "right" ? { left: "auto", right: 0 } : undefined}>
          {children(close)}
        </div>
      )}
    </div>
  );
}

interface Props {
  onBack: () => void;
  replayOpen: boolean;
  onToggleReplay: () => void;
  ticketOpen: boolean;
  onToggleTicket: () => void;
  onOpenSettings: () => void;
  /** Hide / show all panels (TradingView fullscreen mode). */
  onToggleFocus: () => void;
}

export default function TopToolbar({ onBack, replayOpen, onToggleReplay, ticketOpen, onToggleTicket, onOpenSettings, onToggleFocus }: Props) {
  const config = useBacktest((s) => s.config);
  const instruments = useBacktest((s) => s.instruments);
  const active = useBacktest((s) => s.activeInstrument);
  const switchInstrument = useBacktest((s) => s.switchInstrument);
  const timeframe = useBacktest((s) => s.timeframe);
  const changeTimeframe = useBacktest((s) => s.changeTimeframe);
  const chartType = useBacktest((s) => s.chartType);
  const setChartType = useBacktest((s) => s.setChartType);
  const account = useBacktest((s) => s.accountState);
  const alerts = useBacktest((s) => s.alerts);
  const addAlert = useBacktest((s) => s.addAlert);
  const removeAlert = useBacktest((s) => s.removeAlert);
  const candleData = useBacktest((s) => s.candleData);
  const undo = useBacktest((s) => s.undoDrawing);
  const redo = useBacktest((s) => s.redoDrawing);
  const canUndo = useBacktest((s) => (s.drawHistory.past[s.activeInstrument] || []).length > 0);
  const canRedo = useBacktest((s) => (s.drawHistory.future[s.activeInstrument] || []).length > 0);
  const endSession = useBacktest((s) => s.endSession);
  const saveSession = useBacktest((s) => s.saveSession);
  const setShowResults = useBacktest((s) => s.setShowResults);
  const { resolved: theme } = useTheme();

  const lastClose = (candleData[active] || []).at(-1)?.close ?? null;
  const [alertPrice, setAlertPrice] = useState("");
  const spec = instrumentBySymbol(active);
  const myAlerts = alerts.filter((a) => a.symbol === active && !a.triggered);
  const curType = CHART_TYPES.find((c) => c.id === chartType) ?? CHART_TYPES[1];

  const handleEnd = async () => {
    endSession();
    await saveSession();
    setShowResults(true);
  };

  return (
    <div className="tv-top">
      <button type="button" className="tv-tbtn" onClick={onBack} title="Back to sessions"><I name="back" size={22} /></button>
      <EJMark size={22} />
      <i className="tv-sep" />

      {/* Symbol */}
      <Dropdown title="Symbol" button={<span className="tv-symbol">{active || "—"}</span>}>
        {(close) => (
          <>
            <div className="tv-menu-head">SESSION INSTRUMENTS</div>
            {instruments.map((sym) => {
              const sp = instrumentBySymbol(sym);
              return (
                <button key={sym} type="button" className={`tv-menu-item${sym === active ? " is-active" : ""}`} onClick={() => { switchInstrument(sym); close(); }}>
                  <span><b>{sym}</b> <span style={{ opacity: 0.6, fontWeight: 400 }}>{sp?.name}</span></span>
                  <kbd>{sp?.exchange}</kbd>
                </button>
              );
            })}
          </>
        )}
      </Dropdown>
      <i className="tv-sep" />

      {/* Timeframes */}
      {QUICK_TF.map((tf) => (
        <button key={tf} type="button" title={tfName(tf)} className={`tv-tbtn${timeframe === tf ? " tv-tf-active" : ""}`} onClick={() => changeTimeframe(tf)}>
          {tf.replace("1D", "D")}
        </button>
      ))}
      {!QUICK_TF.includes(timeframe) && (
        <button type="button" className="tv-tbtn tv-tf-active">{timeframe.replace("1D", "D")}</button>
      )}
      <Dropdown title="Time interval" button={<I name="chevronDown" size={18} />}>
        {(close) => (
          <>
            {TF_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="tv-menu-head">{g.title}</div>
                {g.items.map((tf) => (
                  <button key={tf} type="button" className={`tv-menu-item${tf === timeframe ? " is-active" : ""}`} onClick={() => { changeTimeframe(tf); close(); }}>
                    <span>{tfName(tf)}</span>
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </Dropdown>
      <i className="tv-sep" />

      {/* Chart type */}
      <Dropdown title="Candles" button={<I name={curType.icon} size={24} />}>
        {(close) => (
          <>
            {CHART_TYPES.map((c) => (
              <button key={c.id} type="button" className={`tv-menu-item${c.id === chartType ? " is-active" : ""}`} onClick={() => { setChartType(c.id); close(); }}>
                <span><I name={c.icon} size={24} />{c.label}</span>
              </button>
            ))}
          </>
        )}
      </Dropdown>
      <i className="tv-sep" />

      {/* Indicators */}
      <IndicatorsMenu />
      <i className="tv-sep" />

      {/* Alert */}
      <Dropdown title="Create alert" button={<><I name="alert" size={22} /><span>Alert{myAlerts.length ? ` ${myAlerts.length}` : ""}</span></>}>
        {(close) => (
          <div style={{ padding: "6px 14px 10px", minWidth: 270 }}>
            <div className="tv-menu-head" style={{ padding: "4px 0" }}>{active} CROSSING</div>
            <div className="tv-row" style={{ marginBottom: 10 }}>
              <input
                className="tv-pill-qty" style={{ flex: 1, height: 32, border: "1px solid var(--tv-border)", borderRadius: 4, textAlign: "left", padding: "0 8px", userSelect: "text" }}
                type="number" step={spec?.tickSize ?? 0.25} placeholder={lastClose !== null ? fmtPrice(lastClose) : "Price"}
                value={alertPrice} onChange={(e) => setAlertPrice(e.target.value)}
              />
              <button
                type="button" className="tv-btn primary" style={{ flex: "none" }}
                disabled={lastClose === null || !(parseFloat(alertPrice) > 0)}
                onClick={() => {
                  const p = parseFloat(alertPrice);
                  if (lastClose === null || !(p > 0)) return;
                  addAlert(active, p, p >= lastClose ? "up" : "down");
                  setAlertPrice(""); close();
                }}
              >
                Create
              </button>
            </div>
            {myAlerts.length === 0 ? (
              <div style={{ color: "var(--tv-muted)", fontSize: 12 }}>No active alerts. Replay pauses when one is hit.</div>
            ) : myAlerts.map((a) => (
              <div key={a.id} className="tv-setrow">
                <span>{a.direction === "up" ? "▲" : "▼"} {fmtPrice(a.price)}</span>
                <button type="button" className="tv-linkbtn" onClick={() => removeAlert(a.id)}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </Dropdown>

      {/* Replay */}
      <button type="button" className={`tv-tbtn${replayOpen ? " is-on" : ""}`} title="Bar replay controls" onClick={onToggleReplay}>
        <I name="replay" size={22} /><span>Replay</span>
      </button>
      <i className="tv-sep" />

      <button type="button" className="tv-tbtn" title="Undo (Ctrl+Z)" disabled={!canUndo} onClick={() => undo(active)}><I name="undo" size={22} /></button>
      <button type="button" className="tv-tbtn" title="Redo (Ctrl+Y)" disabled={!canRedo} onClick={() => redo(active)}><I name="redo" size={22} /></button>

      <span className="tv-grow" />

      {account && (
        <div className="tv-account">
          <div><small>Balance</small><b>{formatMoney(account.balance)}</b></div>
          <div><small>P&amp;L</small><b className={account.netPnl > 0 ? "tv-up" : account.netPnl < 0 ? "tv-down" : ""}>{account.netPnl > 0 ? "+" : ""}{formatMoney(account.netPnl)}</b></div>
          <div><small>Trades</small><b>{account.totalTrades}</b></div>
        </div>
      )}
      <i className="tv-sep" />
      <span className="tv-session-name" title={config?.sessionName}>{config?.sessionName ?? "Session"}</span>

      <button type="button" className="tv-tbtn" title="Settings" onClick={onOpenSettings}><I name="settings" size={22} /></button>
      <button type="button" className="tv-tbtn" title="Toggle light/dark" onClick={() => setThemeChoice(theme === "dark" ? "light" : "dark")}>
        <I name={theme === "dark" ? "sun" : "moon"} size={22} />
      </button>
      <button type="button" className="tv-tbtn" title="Fullscreen — hide panels (Shift+F)" onClick={onToggleFocus}><I name="fullscreen" size={22} /></button>
      <Dropdown title="Take a snapshot (Alt+S)" align="right" button={<I name="camera" size={22} />}>
        {(close) => (
          <>
            <button type="button" className="tv-menu-item" onClick={() => { emitChartCommand({ type: "screenshot", mode: "download" }); close(); }}><span>Download image</span><kbd>Alt+S</kbd></button>
            <button type="button" className="tv-menu-item" onClick={() => { emitChartCommand({ type: "screenshot", mode: "copy" }); close(); }}><span>Copy image</span></button>
          </>
        )}
      </Dropdown>
      <button type="button" className={`tv-trade-btn${ticketOpen ? " is-on" : ""}`} onClick={onToggleTicket} title="Order ticket">Trade</button>
      <button type="button" className="tv-end" onClick={handleEnd}>End Session</button>
    </div>
  );
}

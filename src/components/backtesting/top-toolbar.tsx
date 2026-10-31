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
import { focusFirstItem, onMenuKeyDown, useOutside } from "./tv-ui";
import { toast } from "./ej-toast";
import AnimatedNumber from "./ej-number";
import IndicatorsMenu from "./indicators-menu";
import EJMark from "./ej-mark";

const QUICK_TF: Timeframe[] = ["30s", "1m", "3m", "5m", "15m", "1h", "4h"];
const TF_GROUPS: Array<{ title: string; items: Timeframe[] }> = [
  { title: "Seconds", items: ["1s", "5s", "10s", "15s", "30s"] },
  { title: "Minutes", items: ["1m", "2m", "3m", "5m", "10m", "15m", "30m"] },
  { title: "Hours", items: ["1h", "2h", "4h"] },
  { title: "Days", items: ["1D"] },
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
  button, children, align = "left", title, active,
}: { button: React.ReactNode; children: (close: () => void) => React.ReactNode; align?: "left" | "right"; title: string; active?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setOpen(false), []);
  useOutside(ref, open, close);
  useEffect(() => { if (open) focusFirstItem(menuRef.current); }, [open]);
  return (
    <div className="tv-dd" ref={ref}>
      <button
        type="button" data-tip={title} aria-label={title} aria-haspopup="menu" aria-expanded={open}
        className={`tv-tbtn${open || active ? " is-on" : ""}`} onClick={() => setOpen((o) => !o)}
      >{button}</button>
      {open && (
        <div
          ref={menuRef} className="tv-menu" role="menu" aria-label={title} style={align === "right" ? { left: "auto", right: 0 } : undefined}
          onKeyDown={(e) => { onMenuKeyDown(e, menuRef.current, () => { close(); (ref.current?.querySelector("button") as HTMLElement | null)?.focus(); }); }}
        >
          {children(close)}
        </div>
      )}
    </div>
  );
}

const fmtPnl = (v: number) => `${v > 0 ? "+" : ""}${formatMoney(v)}`;

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
      <button type="button" className="tv-tbtn" onClick={onBack} data-tip="Back to sessions" aria-label="Back to sessions"><I name="back" size={20} /></button>
      <EJMark size={22} />
      <i className="tv-sep" />

      {/* Symbol */}
      <Dropdown title="Symbol" button={<span className="tv-symbol">{active || "—"}</span>}>
        {(close) => (
          <>
            <div className="tv-menu-head">Session instruments</div>
            {instruments.map((sym) => {
              const sp = instrumentBySymbol(sym);
              return (
                <button key={sym} type="button" role="menuitemradio" aria-checked={sym === active} className={`tv-menu-item${sym === active ? " is-active" : ""}`} onClick={() => { switchInstrument(sym); close(); }}>
                  <span><b>{sym}</b> <span className="ej-dim">{sp?.name}</span></span>
                  <span className="ej-trail"><kbd>{sp?.exchange}</kbd>{sym === active && <I name="check" size={16} />}</span>
                </button>
              );
            })}
          </>
        )}
      </Dropdown>
      <i className="tv-sep" />

      {/* Timeframes */}
      {QUICK_TF.map((tf) => (
        <button key={tf} type="button" data-tip={tfName(tf)} aria-label={tfName(tf)} aria-pressed={timeframe === tf} className={`tv-tbtn ej-num${timeframe === tf ? " tv-tf-active" : ""}`} onClick={() => changeTimeframe(tf)}>
          {tf.replace("1D", "D")}
        </button>
      ))}
      {!QUICK_TF.includes(timeframe) && (
        <button type="button" className="tv-tbtn ej-num tv-tf-active" aria-pressed="true" aria-label={tfName(timeframe)}>{timeframe.replace("1D", "D")}</button>
      )}
      <Dropdown title="Time interval" button={<I name="chevronDown" size={16} />}>
        {(close) => (
          <>
            {TF_GROUPS.map((g) => (
              <div key={g.title}>
                <div className="tv-menu-head">{g.title}</div>
                {g.items.map((tf) => (
                  <button key={tf} type="button" role="menuitemradio" aria-checked={tf === timeframe} className={`tv-menu-item${tf === timeframe ? " is-active" : ""}`} onClick={() => { changeTimeframe(tf); close(); }}>
                    <span>{tfName(tf)}</span>{tf === timeframe && <I name="check" size={16} />}
                  </button>
                ))}
              </div>
            ))}
          </>
        )}
      </Dropdown>
      <i className="tv-sep" />

      {/* Chart type */}
      <Dropdown title={`Chart type: ${curType.label}`} button={<I name={curType.icon} size={20} />}>
        {(close) => (
          <>
            {CHART_TYPES.map((c) => (
              <button key={c.id} type="button" role="menuitemradio" aria-checked={c.id === chartType} className={`tv-menu-item${c.id === chartType ? " is-active" : ""}`} onClick={() => { setChartType(c.id); close(); }}>
                <span><I name={c.icon} size={20} />{c.label}</span>{c.id === chartType && <I name="check" size={16} />}
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
      <Dropdown title="Create alert" active={myAlerts.length > 0} button={<><I name="alert" size={20} filled={myAlerts.length > 0} /><span className="tv-hide-sm">Alert{myAlerts.length ? ` ${myAlerts.length}` : ""}</span></>}>
        {(close) => (
          <div className="ej-alertpop">
            <div className="tv-menu-head">{active} crossing</div>
            <div className="tv-row ej-alertrow">
              <input
                className="ej-input" aria-label="Alert price" onKeyDown={(e) => e.stopPropagation()}
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
                  toast({ text: `Alert set · ${active} ${p >= lastClose ? "above" : "below"} ${fmtPrice(p)}` });
                  setAlertPrice(""); close();
                }}
              >
                Create
              </button>
            </div>
            {myAlerts.length === 0 ? (
              <div className="ej-empty-inline"><EJMark size={18} />No active alerts. Replay pauses when one is hit.</div>
            ) : myAlerts.map((a) => (
              <div key={a.id} className="tv-setrow">
                <span className="ej-num">{a.direction === "up" ? "▲" : "▼"} {fmtPrice(a.price)}</span>
                <button type="button" className="tv-linkbtn" onClick={() => { removeAlert(a.id); toast({ kind: "info", text: `Alert removed · ${fmtPrice(a.price)}`, action: { label: "Undo", run: () => addAlert(a.symbol, a.price, a.direction) } }); }}>Remove</button>
              </div>
            ))}
          </div>
        )}
      </Dropdown>

      {/* Replay */}
      <button type="button" className={`tv-tbtn${replayOpen ? " is-on" : ""}`} data-tip="Bar replay controls" aria-label="Bar replay controls" aria-pressed={replayOpen} onClick={onToggleReplay}>
        <I name="replay" size={20} filled={replayOpen} /><span className="tv-hide-sm">Replay</span>
      </button>
      <i className="tv-sep" />

      <button type="button" className="tv-tbtn" data-tip="Undo (Ctrl+Z)" aria-label="Undo" disabled={!canUndo} onClick={() => undo(active)}><I name="undo" size={20} /></button>
      <button type="button" className="tv-tbtn" data-tip="Redo (Ctrl+Y)" aria-label="Redo" disabled={!canRedo} onClick={() => redo(active)}><I name="redo" size={20} /></button>

      <span className="tv-grow" />

      {account && (
        <div className="tv-account" aria-label="Account">
          <div><small>Balance</small><b><AnimatedNumber value={account.balance} format={formatMoney} /></b></div>
          <div><small>P&amp;L</small><b className={account.netPnl > 0 ? "tv-up" : account.netPnl < 0 ? "tv-down" : ""}><AnimatedNumber value={account.netPnl} format={fmtPnl} /></b></div>
          <div><small>Trades</small><b>{account.totalTrades}</b></div>
        </div>
      )}
      <i className="tv-sep" />
      <span className="tv-session-name" data-tip={config?.sessionName ?? "Session"}>{config?.sessionName ?? "Session"}</span>

      <button type="button" className="tv-tbtn" data-tip="Settings" aria-label="Settings" onClick={onOpenSettings}><I name="settings" size={20} /></button>
      <button type="button" className="tv-tbtn" data-tip="Toggle light / dark" aria-label="Toggle light or dark theme" onClick={() => setThemeChoice(theme === "dark" ? "light" : "dark")}>
        <I name={theme === "dark" ? "sun" : "moon"} size={20} />
      </button>
      <button type="button" className="tv-tbtn" data-tip="Fullscreen — hide panels (Shift+F)" aria-label="Hide panels" onClick={onToggleFocus}><I name="fullscreen" size={20} /></button>
      <Dropdown title="Take a snapshot (Alt+S)" align="right" button={<I name="camera" size={20} />}>
        {(close) => (
          <>
            <button type="button" role="menuitem" className="tv-menu-item" onClick={() => { emitChartCommand({ type: "screenshot", mode: "download" }); toast({ text: "Chart image saved" }); close(); }}><span>Download image</span><kbd>Alt+S</kbd></button>
            <button type="button" role="menuitem" className="tv-menu-item" onClick={() => { emitChartCommand({ type: "screenshot", mode: "copy" }); toast({ text: "Chart image copied" }); close(); }}><span>Copy image</span></button>
          </>
        )}
      </Dropdown>
      <button type="button" className={`tv-trade-btn${ticketOpen ? " is-on" : ""}`} onClick={onToggleTicket} data-tip="Order ticket" aria-pressed={ticketOpen}>Trade</button>
      <button type="button" className="tv-end" onClick={handleEnd}>End Session</button>
    </div>
  );
}

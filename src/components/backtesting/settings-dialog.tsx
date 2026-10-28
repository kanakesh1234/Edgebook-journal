"use client";

import { useRef, useState } from "react";
import {
  DEFAULT_BG, candleColorsFor, paletteFor, resetAppearance, setAppearance, useChartAppearance, type ChartAppearance,
} from "@/lib/backtesting/appearance";
import { useTheme } from "@/lib/theme";
import { I } from "./tv-icons";

const TABS = [
  { id: "symbol", label: "Symbol", icon: "candles" },
  { id: "status", label: "Status line", icon: "bars" },
  { id: "scales", label: "Scales and lines", icon: "line" },
  { id: "canvas", label: "Canvas", icon: "brush" },
  { id: "trading", label: "Trading", icon: "replay" },
] as const;
type Tab = (typeof TABS)[number]["id"];

const BG_PRESETS = [
  { label: "Edgebook white", light: "#fffefb", dark: "#fffefb" },
  { label: "Paper", light: "#f7f4ee", dark: "#f7f4ee" },
  { label: "Soft grey", light: "#eceae4", dark: "#eceae4" },
  { label: "Warm dark", light: "#1c1813", dark: "#1c1813" },
  { label: "Charcoal", light: "#131722", dark: "#131722" },
];

function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return <label className="tv-set-cb"><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /><span>{label}</span></label>;
}
function Pair({ label, up, down, onUp, onDown }: { label: string; up: string; down: string; onUp: (v: string) => void; onDown: (v: string) => void }) {
  return (
    <div className="tv-setrow">
      <span>{label}</span>
      <span className="tv-set-pair">
        <input type="color" value={up} onChange={(e) => onUp(e.target.value)} title="Up" />
        <input type="color" value={down} onChange={(e) => onDown(e.target.value)} title="Down" />
      </span>
    </div>
  );
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const a = useChartAppearance();
  const { resolved } = useTheme();
  const [tab, setTab] = useState<Tab>("symbol");
  const original = useRef<ChartAppearance>(a); // Cancel restores this; changes apply live while open
  const cc = candleColorsFor(resolved, a);
  const bg = paletteFor(resolved, a).bg;
  const cancel = () => { setAppearance(original.current); onClose(); };

  return (
    <div className="tv-modal-back" onPointerDown={cancel}>
      <div className="tv-modal tv-settings" role="dialog" aria-label="Settings" onPointerDown={(e) => e.stopPropagation()}>
        <header>Settings <button type="button" className="tv-tbtn" onClick={cancel} aria-label="Close"><I name="close" size={22} /></button></header>

        <div className="tv-set-body">
          <nav className="tv-set-tabs">
            {TABS.map((t) => (
              <button key={t.id} type="button" className={`tv-set-tab${tab === t.id ? " is-on" : ""}`} onClick={() => setTab(t.id)}>
                <I name={t.icon} size={20} />{t.label}
              </button>
            ))}
          </nav>

          <div className="tv-set-pane">
            {tab === "symbol" && (
              <>
                <h5>CANDLES</h5>
                <Pair label="Body" up={cc.up} down={cc.down} onUp={(v) => setAppearance({ upColor: v })} onDown={(v) => setAppearance({ downColor: v })} />
                <Pair label="Borders" up={cc.borderUp} down={cc.borderDown} onUp={(v) => setAppearance({ borderUp: v })} onDown={(v) => setAppearance({ borderDown: v })} />
                <Pair label="Wick" up={cc.wickUp} down={cc.wickDown} onUp={(v) => setAppearance({ wickUp: v })} onDown={(v) => setAppearance({ wickDown: v })} />
                <div className="tv-setrow"><span style={{ color: "var(--tv-muted)", fontSize: 12 }}>Left swatch = up candles, right swatch = down candles. Default: green and black.</span></div>
              </>
            )}

            {tab === "status" && (
              <>
                <h5>STATUS LINE</h5>
                <Check label="Symbol, OHLC and change" value={a.showLegend} onChange={(v) => setAppearance({ showLegend: v })} />
              </>
            )}

            {tab === "scales" && (
              <>
                <h5>GRID LINES</h5>
                <Check label="Vertical grid lines" value={a.gridVertical} onChange={(v) => setAppearance({ gridVertical: v })} />
                <Check label="Horizontal grid lines" value={a.gridHorizontal} onChange={(v) => setAppearance({ gridHorizontal: v })} />
              </>
            )}

            {tab === "canvas" && (
              <>
                <h5>BACKGROUND</h5>
                <div className="tv-bg-presets">
                  <button type="button" className={`tv-bg-sw${a.background === null ? " is-on" : ""}`} title="Follow site theme (default)"
                    style={{ background: `linear-gradient(135deg, ${DEFAULT_BG.light} 50%, ${DEFAULT_BG.dark} 50%)` }} onClick={() => setAppearance({ background: null })} />
                  {BG_PRESETS.map((p) => (
                    <button key={p.label} type="button" className={`tv-bg-sw${a.background?.toLowerCase() === p.light ? " is-on" : ""}`} title={p.label}
                      style={{ background: p.light }} onClick={() => setAppearance({ background: p.light })} />
                  ))}
                  <input type="color" className="tv-bg-sw" style={{ padding: 0 }} title="Custom colour" value={/^#[0-9a-f]{6}$/i.test(bg) ? bg : "#fffefb"} onChange={(e) => setAppearance({ background: e.target.value })} />
                </div>
                <div className="tv-setrow"><span style={{ color: "var(--tv-muted)", fontSize: 12 }}>First swatch follows the site theme (light / dark). Text and grid adapt automatically.</span></div>
              </>
            )}

            {tab === "trading" && (
              <>
                <h5>ON CHART</h5>
                <Check label="Buy / Sell buttons" value={a.showTradePill} onChange={(v) => setAppearance({ showTradePill: v })} />
              </>
            )}
          </div>
        </div>

        <footer>
          <button type="button" className="tv-btn" onClick={() => { resetAppearance(); original.current = { ...original.current }; }}>Reset to defaults</button>
          <span style={{ display: "inline-flex", gap: 8 }}>
            <button type="button" className="tv-btn" onClick={cancel}>Cancel</button>
            <button type="button" className="tv-btn primary" onClick={onClose}>Ok</button>
          </span>
        </footer>
      </div>
    </div>
  );
}

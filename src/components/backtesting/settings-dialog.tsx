"use client";

import { resetAppearance, setAppearance, useChartAppearance, paletteFor } from "@/lib/backtesting/appearance";
import { useTheme } from "@/lib/theme";
import { I } from "./tv-icons";

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="tv-setrow"><span>{label}</span><input type="color" value={value} onChange={(e) => onChange(e.target.value)} /></div>
  );
}
function Check({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="tv-setrow"><span>{label}</span><input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} /></label>
  );
}

export default function SettingsDialog({ onClose }: { onClose: () => void }) {
  const a = useChartAppearance();
  const { resolved } = useTheme();
  const bg = paletteFor(resolved, a).bg;

  return (
    <div className="tv-modal-back" onPointerDown={onClose}>
      <div className="tv-modal" role="dialog" aria-label="Chart settings" onPointerDown={(e) => e.stopPropagation()}>
        <header>Chart settings <button type="button" className="tv-tbtn" onClick={onClose} aria-label="Close"><I name="close" size={20} /></button></header>

        <section>
          <h5>CANDLES</h5>
          <Color label="Body — up" value={a.upColor} onChange={(v) => setAppearance({ upColor: v })} />
          <Color label="Body — down" value={a.downColor} onChange={(v) => setAppearance({ downColor: v })} />
          <Color label="Borders — up" value={a.borderUp} onChange={(v) => setAppearance({ borderUp: v })} />
          <Color label="Borders — down" value={a.borderDown} onChange={(v) => setAppearance({ borderDown: v })} />
          <Color label="Wick — up" value={a.wickUp} onChange={(v) => setAppearance({ wickUp: v })} />
          <Color label="Wick — down" value={a.wickDown} onChange={(v) => setAppearance({ wickDown: v })} />
        </section>

        <section>
          <h5>CANVAS</h5>
          <Color label="Background" value={/^#[0-9a-f]{6}$/i.test(bg) ? bg : "#131722"} onChange={(v) => setAppearance({ background: v })} />
          <Check label="Vertical grid lines" value={a.gridVertical} onChange={(v) => setAppearance({ gridVertical: v })} />
          <Check label="Horizontal grid lines" value={a.gridHorizontal} onChange={(v) => setAppearance({ gridHorizontal: v })} />
        </section>

        <section>
          <h5>STATUS LINE</h5>
          <Check label="Symbol, OHLC and change" value={a.showLegend} onChange={(v) => setAppearance({ showLegend: v })} />
          <Check label="Buy / Sell buttons on chart" value={a.showTradePill} onChange={(v) => setAppearance({ showTradePill: v })} />
        </section>

        <footer>
          <button type="button" className="tv-btn" onClick={resetAppearance}>Reset to defaults</button>
          <button type="button" className="tv-btn primary" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}

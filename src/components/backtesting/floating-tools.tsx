"use client";

import { useBacktest, type ActiveTool } from "@/lib/backtesting/store";
import { I } from "./tv-icons";
import { useDraggable } from "./use-draggable";

const TOOLS: Array<{ tool: ActiveTool & string; icon: string; label: string }> = [
  { tool: "crosshair", icon: "cross", label: "Cross" },
  { tool: "trend-line", icon: "trendLine", label: "Trend line" },
  { tool: "horizontal-line", icon: "hLine", label: "Horizontal line" },
  { tool: "fib-retracement", icon: "fib", label: "Fib retracement" },
  { tool: "rectangle", icon: "rect", label: "Rectangle" },
  { tool: "measure", icon: "measure", label: "Measure" },
  { tool: "brush", icon: "brush", label: "Brush" },
  { tool: "text", icon: "text", label: "Text" },
];

/** TradingView's drawing bar for panels-hidden mode: all main tools, magnet, lock, hide, clear — and movable. */
export default function FloatingTools({ onExit }: { onExit: () => void }) {
  const active = useBacktest((s) => s.activeDrawingTool);
  const set = useBacktest((s) => s.setActiveDrawingTool);
  const magnet = useBacktest((s) => s.magnetMode);
  const setMagnet = useBacktest((s) => s.setMagnetMode);
  const locked = useBacktest((s) => s.drawingsLocked);
  const setLocked = useBacktest((s) => s.setDrawingsLocked);
  const hidden = useBacktest((s) => s.drawingsHidden);
  const setHidden = useBacktest((s) => s.setDrawingsHidden);
  const symbol = useBacktest((s) => s.activeInstrument);
  const clear = useBacktest((s) => s.clearDrawings);
  const count = useBacktest((s) => (s.drawings[s.activeInstrument] || []).length);
  const { ref, gripProps } = useDraggable("tools");

  const nextMagnet = magnet === "off" ? "weak" : magnet === "weak" ? "strong" : "off";

  return (
    <div ref={ref} className="tv-float-tools" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <span className="tv-grip" {...gripProps} />
      {TOOLS.map((t) => (
        <button key={t.tool} type="button" title={t.label} className={`tv-tbtn${active === t.tool || (t.tool === "crosshair" && active === "cursor") ? " is-on" : ""}`} onClick={() => set(t.tool)}>
          <I name={t.icon} size={22} />
        </button>
      ))}
      <i className="tv-sep" />
      <button type="button" title={`Magnet: ${magnet}`} className={`tv-tbtn${magnet !== "off" ? " is-on" : ""}`} onClick={() => setMagnet(nextMagnet)}><I name="magnet" size={22} /></button>
      <button type="button" title={locked ? "Unlock drawings" : "Lock drawings"} className={`tv-tbtn${locked ? " is-on" : ""}`} onClick={() => setLocked(!locked)}><I name={locked ? "lock" : "unlock"} size={22} /></button>
      <button type="button" title={hidden ? "Show drawings" : "Hide drawings"} className={`tv-tbtn${hidden ? " is-on" : ""}`} onClick={() => setHidden(!hidden)}><I name={hidden ? "eyeOff" : "eye"} size={22} /></button>
      <button type="button" title="Remove all drawings" className="tv-tbtn" disabled={count === 0 || locked} onClick={() => clear(symbol)}><I name="trash" size={22} /></button>
      <i className="tv-sep" />
      <button type="button" title="Show panels (Esc)" className="tv-tbtn" onClick={onExit}><I name="fullscreenExit" size={22} /></button>
    </div>
  );
}

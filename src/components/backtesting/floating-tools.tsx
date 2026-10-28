"use client";

import { useBacktest, type ActiveTool } from "@/lib/backtesting/store";
import { I } from "./tv-icons";

const TOOLS: Array<{ tool: ActiveTool & string; icon: string; label: string }> = [
  { tool: "crosshair", icon: "cross", label: "Cross" },
  { tool: "trend-line", icon: "trendLine", label: "Trend line" },
  { tool: "horizontal-line", icon: "hLine", label: "Horizontal line" },
  { tool: "fib-retracement", icon: "fib", label: "Fib retracement" },
  { tool: "rectangle", icon: "rect", label: "Rectangle" },
  { tool: "brush", icon: "brush", label: "Brush" },
  { tool: "text", icon: "text", label: "Text" },
];

/** TradingView's bottom drawing bar, shown while the side/top panels are hidden. */
export default function FloatingTools({ onExit }: { onExit: () => void }) {
  const active = useBacktest((s) => s.activeDrawingTool);
  const set = useBacktest((s) => s.setActiveDrawingTool);
  return (
    <div className="tv-float-tools" onPointerDown={(e) => e.stopPropagation()}>
      {TOOLS.map((t) => (
        <button key={t.tool} type="button" title={t.label} className={`tv-tbtn${active === t.tool ? " is-on" : ""}`} onClick={() => set(t.tool)}>
          <I name={t.icon} size={22} />
        </button>
      ))}
      <i className="tv-sep" />
      <button type="button" title="Show panels (Esc)" className="tv-tbtn" onClick={onExit}><I name="fullscreenExit" size={22} /></button>
    </div>
  );
}

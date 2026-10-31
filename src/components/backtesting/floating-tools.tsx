"use client";

import { useBacktest } from "@/lib/backtesting/store";
import { haptic } from "@/lib/haptics";
import { I } from "./tv-icons";
import { useDraggable } from "./use-draggable";
import { ITEM_BY_TOOL, isCursorTool } from "./tool-catalog";
import { toast } from "./ej-toast";

const TOOL_IDS = ["crosshair", "trend-line", "horizontal-line", "fib-retracement", "rectangle", "measure", "brush", "text"];

/** Panels-hidden (focus) mode: the main tools, magnet, lock, hide, clear — movable. The editable palette is the Favorites bar. */
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
  const undo = useBacktest((s) => s.undoDrawing);
  const count = useBacktest((s) => (s.drawings[s.activeInstrument] || []).length);
  const { ref, gripProps } = useDraggable("tools");

  const nextMagnet = magnet === "off" ? "weak" : magnet === "weak" ? "strong" : "off";

  return (
    <div ref={ref} className="tv-float-tools" role="toolbar" aria-label="Drawing tools" onPointerDown={(e) => e.stopPropagation()} onContextMenu={(e) => e.preventDefault()}>
      <span className="tv-grip" {...gripProps} />
      {TOOL_IDS.map((id) => {
        const it = ITEM_BY_TOOL.get(id)!;
        const on = active === it.tool || (it.tool === "crosshair" && (active === "cursor" || isCursorTool(active)));
        const label = `${it.label}${it.hint ? ` (${it.hint})` : ""}`;
        return (
          <button key={id} type="button" data-tip={label} aria-label={it.label} aria-pressed={on} className={`tv-tbtn${on ? " is-on" : ""}`} onClick={() => { haptic.selection(); set(it.tool); }}>
            <I name={it.icon} size={20} filled={on} />
          </button>
        );
      })}
      <i className="tv-sep" />
      <button type="button" data-tip={`Magnet: ${magnet}`} aria-label={`Magnet: ${magnet}`} aria-pressed={magnet !== "off"} className={`tv-tbtn${magnet !== "off" ? " is-on" : ""}`} onClick={() => { haptic.selection(); setMagnet(nextMagnet); }}><I name="magnet" size={20} filled={magnet !== "off"} /></button>
      <button type="button" data-tip={locked ? "Unlock drawings" : "Lock drawings"} aria-label="Lock drawings" aria-pressed={locked} className={`tv-tbtn${locked ? " is-on" : ""}`} onClick={() => { haptic.selection(); setLocked(!locked); }}><I name={locked ? "lock" : "unlock"} size={20} filled={locked} /></button>
      <button type="button" data-tip={hidden ? "Show drawings" : "Hide drawings"} aria-label="Hide drawings" aria-pressed={hidden} className={`tv-tbtn${hidden ? " is-on" : ""}`} onClick={() => { haptic.selection(); setHidden(!hidden); }}><I name={hidden ? "eyeOff" : "eye"} size={20} filled={hidden} /></button>
      <button
        type="button" data-tip="Remove all drawings" aria-label="Remove all drawings" className="tv-tbtn tv-danger" disabled={count === 0 || locked}
        onClick={() => { const n = count; clear(symbol); toast({ kind: "info", text: `Removed ${n} drawing${n === 1 ? "" : "s"}`, action: { label: "Undo", run: () => undo(symbol) } }); }}
      ><I name="trash" size={20} /></button>
      <i className="tv-sep" />
      <button type="button" data-tip="Show panels (Esc)" aria-label="Show panels" className="tv-tbtn" onClick={onExit}><I name="fullscreenExit" size={20} /></button>
    </div>
  );
}

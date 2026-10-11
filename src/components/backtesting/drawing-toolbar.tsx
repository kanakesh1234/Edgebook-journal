"use client";

import { useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { SWATCHES, TOOLS } from "@/lib/backtesting/drawings/tools";
import type { DrawingLineStyle } from "@/lib/backtesting/types";
import { I } from "./tv-icons";

/** Floating properties bar shown when a drawing is selected (colour, width, style, lock, clone, delete). */
export default function DrawingToolbar({ symbol }: { symbol: string }) {
  const selectedId = useBacktest((s) => s.selectedDrawingId);
  const drawings = useBacktest((s) => s.drawings[symbol]);
  const updateDrawing = useBacktest((s) => s.updateDrawing);
  const removeDrawing = useBacktest((s) => s.removeDrawing);
  const cloneDrawing = useBacktest((s) => s.cloneDrawing);
  const setToolStyle = useBacktest((s) => s.setToolStyle);
  const globalLock = useBacktest((s) => s.drawingsLocked);
  const [open, setOpen] = useState<null | "color" | "width" | "style">(null);

  const d = (drawings || []).find((x) => x.id === selectedId);
  if (!d) return null;
  const def = TOOLS[d.type];
  const locked = !!d.locked || globalLock;

  const patch = (p: Parameters<typeof updateDrawing>[2]) => {
    updateDrawing(symbol, d.id, p, true);
    setToolStyle(d.type, p);
    setOpen(null);
  };
  const hasStroke = d.type !== "emoji";
  const hasFill = def.fillOpacity !== undefined;
  const isText = d.type === "text";

  return (
    <div className="tv-dtb" onPointerDown={(e) => e.stopPropagation()}>
      <span className="tv-dtb-name">{def.label}</span>
      <i className="tv-dtb-sep" />

      <div className="tv-dtb-group">
        <button type="button" className="tv-tbtn" title="Color" disabled={locked} onClick={() => setOpen(open === "color" ? null : "color")}>
          <span className="tv-swatch" style={{ background: d.color }} />
        </button>
        {open === "color" && (
          <div className="tv-menu tv-pop tv-swatches">
            {SWATCHES.map((c) => (
              <button key={c} type="button" className="tv-swatch-btn" style={{ background: c }} onClick={() => patch({ color: c })} aria-label={c} />
            ))}
            <input type="color" className="tv-color-input" value={/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#2962ff"} onChange={(e) => patch({ color: e.target.value })} />
            {hasFill && (
              <label className="tv-opacity">
                Fill
                <input type="range" min={0} max={0.6} step={0.05} value={d.fillOpacity ?? def.fillOpacity ?? 0.15} onChange={(e) => patch({ fillOpacity: Number(e.target.value) })} />
              </label>
            )}
          </div>
        )}
      </div>

      {hasStroke && !isText && (
        <>
          <div className="tv-dtb-group">
            <button type="button" className="tv-tbtn tv-tbtn-wide" title="Line width" disabled={locked} onClick={() => setOpen(open === "width" ? null : "width")}>
              <span className="tv-width-preview" style={{ height: Math.min(6, d.lineWidth) }} />
              <span className="tv-tbtn-num">{d.lineWidth}px</span>
            </button>
            {open === "width" && (
              <div className="tv-menu tv-pop">
                {[1, 2, 3, 4].map((w) => (
                  <button key={w} type="button" className="tv-menu-item" onClick={() => patch({ lineWidth: w })}>
                    <span className="tv-width-preview" style={{ height: w, width: 48 }} /><span>{w}px</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="tv-dtb-group">
            <button type="button" className="tv-tbtn" title="Line style" disabled={locked} onClick={() => setOpen(open === "style" ? null : "style")}>
              <I name="lineStyle" />
            </button>
            {open === "style" && (
              <div className="tv-menu tv-pop">
                {(["solid", "dashed", "dotted"] as DrawingLineStyle[]).map((s) => (
                  <button key={s} type="button" className="tv-menu-item" onClick={() => patch({ lineStyle: s })}>
                    <span className="tv-style-preview" style={{ borderTopStyle: s }} /><span style={{ textTransform: "capitalize" }}>{s}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {isText && (
        <div className="tv-dtb-group">
          <button type="button" className="tv-tbtn" title="Smaller text" disabled={locked} onClick={() => patch({ fontSize: Math.max(9, (d.fontSize ?? 14) - 2) })}>A−</button>
          <button type="button" className="tv-tbtn" title="Larger text" disabled={locked} onClick={() => patch({ fontSize: Math.min(48, (d.fontSize ?? 14) + 2) })}>A+</button>
        </div>
      )}

      <i className="tv-dtb-sep" />
      <button type="button" className="tv-tbtn" title="Clone" onClick={() => cloneDrawing(symbol, d.id)}><I name="clone" /></button>
      <button type="button" className={`tv-tbtn${d.locked ? " is-on" : ""}`} title={d.locked ? "Unlock" : "Lock"} onClick={() => updateDrawing(symbol, d.id, { locked: !d.locked })}>
        <I name={d.locked ? "lock" : "unlock"} />
      </button>
      <button type="button" className="tv-tbtn" title="Hide" onClick={() => updateDrawing(symbol, d.id, { hidden: true })}><I name="eyeOff" /></button>
      <button type="button" className="tv-tbtn tv-danger" title="Remove (Del)" disabled={locked} onClick={() => removeDrawing(symbol, d.id)}><I name="trash" /></button>
    </div>
  );
}

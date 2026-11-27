"use client";

import { useState } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { SWATCHES, TOOLS } from "@/lib/backtesting/drawings/tools";
import type { DrawingLineStyle } from "@/lib/backtesting/types";
import { I } from "./tv-icons";
import { toast } from "./ej-toast";
import MobileSheet, { useMobileUI } from "./mobile-sheet";

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
  const mobile = useMobileUI();

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
    <div className="tv-dtb" role="toolbar" aria-label={`${def.label} properties`} onPointerDown={(e) => e.stopPropagation()} onKeyDown={(e) => { if (e.key === "Escape" && open) { e.stopPropagation(); setOpen(null); } }}>
      <span className="tv-dtb-name">{def.label}</span>
      <i className="tv-dtb-sep" />

      <div className="tv-dtb-group">
        <button type="button" className="tv-tbtn" data-tip="Color" aria-label="Color" aria-haspopup="menu" aria-expanded={open === "color"} disabled={locked} onClick={() => setOpen(open === "color" ? null : "color")}>
          <span className="tv-swatch" style={{ background: d.color }} />
        </button>
        {!mobile && open === "color" && (
          <div className="tv-menu tv-pop tv-swatches" role="menu" aria-label="Color">
            {SWATCHES.map((c) => (
              <button key={c} type="button" role="menuitemradio" aria-checked={d.color.toLowerCase() === c.toLowerCase()} className={`tv-swatch-btn${d.color.toLowerCase() === c.toLowerCase() ? " is-on" : ""}`} style={{ background: c }} onClick={() => patch({ color: c })} aria-label={c} />
            ))}
            <input type="color" className="tv-color-input" aria-label="Custom color" value={/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#2962ff"} onChange={(e) => patch({ color: e.target.value })} />
            {hasFill && (
              <label className="tv-opacity">
                Fill
                <input type="range" aria-label="Fill opacity" min={0} max={0.6} step={0.05} value={d.fillOpacity ?? def.fillOpacity ?? 0.15} onChange={(e) => patch({ fillOpacity: Number(e.target.value) })} />
              </label>
            )}
          </div>
        )}
      </div>

      {hasStroke && !isText && (
        <>
          <div className="tv-dtb-group">
            <button type="button" className="tv-tbtn tv-tbtn-wide" data-tip="Line width" aria-label={`Line width ${d.lineWidth}px`} aria-haspopup="menu" aria-expanded={open === "width"} disabled={locked} onClick={() => setOpen(open === "width" ? null : "width")}>
              <span className="tv-width-preview" style={{ height: Math.min(6, d.lineWidth) }} />
              <span className="tv-tbtn-num ej-num">{d.lineWidth}px</span>
            </button>
            {!mobile && open === "width" && (
              <div className="tv-menu tv-pop" role="menu" aria-label="Line width">
                {[1, 2, 3, 4].map((w) => (
                  <button key={w} type="button" role="menuitemradio" aria-checked={d.lineWidth === w} className={`tv-menu-item${d.lineWidth === w ? " is-active" : ""}`} onClick={() => patch({ lineWidth: w })}>
                    <span><span className="tv-width-preview" style={{ height: w, width: 48 }} /><span className="ej-num">{w}px</span></span>{d.lineWidth === w && <I name="check" size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="tv-dtb-group">
            <button type="button" className="tv-tbtn" data-tip="Line style" aria-label="Line style" aria-haspopup="menu" aria-expanded={open === "style"} disabled={locked} onClick={() => setOpen(open === "style" ? null : "style")}>
              <I name="lineStyle" size={20} />
            </button>
            {!mobile && open === "style" && (
              <div className="tv-menu tv-pop" role="menu" aria-label="Line style">
                {(["solid", "dashed", "dotted"] as DrawingLineStyle[]).map((s) => (
                  <button key={s} type="button" role="menuitemradio" aria-checked={(d.lineStyle ?? "solid") === s} className={`tv-menu-item${(d.lineStyle ?? "solid") === s ? " is-active" : ""}`} onClick={() => patch({ lineStyle: s })}>
                    <span><span className="tv-style-preview" style={{ borderTopStyle: s }} /><span style={{ textTransform: "capitalize" }}>{s}</span></span>{(d.lineStyle ?? "solid") === s && <I name="check" size={16} />}
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}

      {mobile && (
        <MobileSheet
          open={open !== null}
          onClose={() => setOpen(null)}
          title={open === "color" ? "Color & fill" : open === "width" ? "Line width" : open === "style" ? "Line style" : undefined}
        >
          {open === "color" && (
            <div style={{ padding: "8px 16px 20px", display: "grid", gap: 14 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10 }}>
                {SWATCHES.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    className={`tv-swatch-btn${d.color.toLowerCase() === c.toLowerCase() ? " is-on" : ""}`}
                    style={{ background: c, width: "100%", height: 42 }}
                    onClick={() => patch({ color: c })}
                  />
                ))}
              </div>
              <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: 14 }}>
                <span>Custom color</span>
                <input type="color" className="tv-color-input" style={{ width: 64, height: 38 }} aria-label="Custom color" value={/^#[0-9a-f]{6}$/i.test(d.color) ? d.color : "#2962ff"} onChange={(e) => patch({ color: e.target.value })} />
              </label>
              {hasFill && (
                <label className="tv-opacity" style={{ display: "grid", gap: 6, fontSize: 14 }}>
                  <span>Fill opacity ({Math.round((d.fillOpacity ?? def.fillOpacity ?? 0.15) * 100)}%)</span>
                  <input type="range" aria-label="Fill opacity" min={0} max={0.6} step={0.05} value={d.fillOpacity ?? def.fillOpacity ?? 0.15} onChange={(e) => patch({ fillOpacity: Number(e.target.value) })} />
                </label>
              )}
            </div>
          )}
          {open === "width" && (
            <div role="menu">
              {[1, 2, 3, 4].map((w) => (
                <button key={w} type="button" role="menuitemradio" aria-checked={d.lineWidth === w} className={`ej-sheet-row${d.lineWidth === w ? " is-on" : ""}`} onClick={() => patch({ lineWidth: w })}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flex: 1 }}><span className="tv-width-preview" style={{ height: w, width: 64, background: "currentColor", display: "inline-block" }} /><span className="ej-num">{w}px</span></span>
                  {d.lineWidth === w && <I name="check" size={16} />}
                </button>
              ))}
            </div>
          )}
          {open === "style" && (
            <div role="menu">
              {(["solid", "dashed", "dotted"] as DrawingLineStyle[]).map((s) => (
                <button key={s} type="button" role="menuitemradio" aria-checked={(d.lineStyle ?? "solid") === s} className={`ej-sheet-row${(d.lineStyle ?? "solid") === s ? " is-on" : ""}`} onClick={() => patch({ lineStyle: s })}>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 12, flex: 1 }}><span className="tv-style-preview" style={{ borderTopStyle: s, borderTopColor: "currentColor", width: 64, display: "inline-block" }} /><span style={{ textTransform: "capitalize" }}>{s}</span></span>
                  {(d.lineStyle ?? "solid") === s && <I name="check" size={16} />}
                </button>
              ))}
            </div>
          )}
        </MobileSheet>
      )}

      {isText && (
        <div className="tv-dtb-group">
          <button type="button" className="tv-tbtn" data-tip="Smaller text" aria-label="Smaller text" disabled={locked} onClick={() => patch({ fontSize: Math.max(9, (d.fontSize ?? 14) - 2) })}>A−</button>
          <button type="button" className="tv-tbtn" data-tip="Larger text" aria-label="Larger text" disabled={locked} onClick={() => patch({ fontSize: Math.min(48, (d.fontSize ?? 14) + 2) })}>A+</button>
        </div>
      )}

      <i className="tv-dtb-sep" />
      <button type="button" className="tv-tbtn" data-tip="Clone" aria-label="Clone" onClick={() => { cloneDrawing(symbol, d.id); toast({ text: `${def.label} cloned` }); }}><I name="clone" size={20} /></button>
      <button type="button" className={`tv-tbtn${d.locked ? " is-on" : ""}`} data-tip={d.locked ? "Unlock" : "Lock"} aria-label={d.locked ? "Unlock" : "Lock"} aria-pressed={!!d.locked} onClick={() => updateDrawing(symbol, d.id, { locked: !d.locked })}>
        <I name={d.locked ? "lock" : "unlock"} size={20} filled={!!d.locked} />
      </button>
      <button type="button" className="tv-tbtn" data-tip="Hide" aria-label="Hide" onClick={() => { updateDrawing(symbol, d.id, { hidden: true }); toast({ kind: "info", text: `${def.label} hidden`, action: { label: "Show", run: () => updateDrawing(symbol, d.id, { hidden: false }) } }); }}><I name="eyeOff" size={20} /></button>
      <button type="button" className="tv-tbtn tv-danger" data-tip="Remove (Del)" aria-label="Remove" disabled={locked} onClick={() => { removeDrawing(symbol, d.id); toast({ kind: "info", text: `${def.label} removed`, action: { label: "Undo", run: () => useBacktest.getState().undoDrawing(symbol) } }); }}><I name="trash" size={20} /></button>
    </div>
  );
}

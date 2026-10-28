"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useIndicators } from "@/lib/backtesting/indicator-store";
import { CATALOG, KINDS, label } from "@/lib/backtesting/indicators";
import { I } from "./tv-icons";
import { useOutside } from "./tv-ui";

/** TradingView-style "Indicators" button + searchable panel (add, edit length/colour, hide, remove). */
export default function IndicatorsMenu() {
  const open = useIndicators((s) => s.panelOpen);
  const setPanel = useIndicators((s) => s.setPanel);
  const list = useIndicators((s) => s.list);
  const hydrate = useIndicators((s) => s.hydrate);
  const add = useIndicators((s) => s.add);
  const remove = useIndicators((s) => s.remove);
  const update = useIndicators((s) => s.update);
  const clear = useIndicators((s) => s.clear);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => { hydrate(); }, [hydrate]);
  useOutside(ref, open, () => setPanel(false));
  useEffect(() => { if (open) searchRef.current?.focus(); else setQ(""); }, [open]);

  // "/" opens the indicator search (like TradingView), unless typing somewhere.
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey) return;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
      e.preventDefault();
      setPanel(true);
    };
    window.addEventListener("keydown", on);
    return () => window.removeEventListener("keydown", on);
  }, [setPanel]);

  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    return KINDS.filter((k) => !t || `${CATALOG[k].name} ${k} ${CATALOG[k].desc}`.toLowerCase().includes(t));
  }, [q]);

  return (
    <div className="tv-dd" ref={ref}>
      <button type="button" title="Indicators (/)" className={`tv-tbtn${open || list.length ? " is-on" : ""}`} onClick={() => setPanel(!open)}>
        <I name="indicators" size={22} /><span className="tv-hide-sm">Indicators{list.length ? ` ${list.length}` : ""}</span>
      </button>
      {open && (
        <div className="tv-menu tv-ind-panel">
          <input ref={searchRef} className="tv-ind-search" placeholder="Search indicators…" value={q} onChange={(e) => setQ(e.target.value)} />

          {list.length > 0 && !q && (
            <>
              <div className="tv-menu-head">ON CHART <button type="button" className="tv-linkbtn" onClick={clear}>Remove all</button></div>
              {list.map((i) => (
                <div key={i.id} className="tv-ind-edit">
                  <span className="tv-ind-edit-name">{label({ kind: i.kind, params: [] })}</span>
                  {CATALOG[i.kind].paramLabels.map((pl, k) => (
                    <label key={pl} title={pl}>
                      <small>{pl}</small>
                      <input type="number" min={1} step={k === 1 && i.kind === "bb" ? 0.5 : 1} value={i.params[k] ?? ""}
                        onChange={(e) => { const v = parseFloat(e.target.value); const next = [...i.params]; next[k] = Number.isFinite(v) && v > 0 ? v : CATALOG[i.kind].defaults[k]; update(i.id, { params: next }); }} />
                    </label>
                  ))}
                  {!CATALOG[i.kind].pane && i.kind !== "volume" && <input type="color" value={i.color} onChange={(e) => update(i.id, { color: e.target.value })} title="Colour" />}
                  <button type="button" className="tv-linkbtn" onClick={() => update(i.id, { visible: !i.visible })}>{i.visible ? "Hide" : "Show"}</button>
                  <button type="button" className="tv-linkbtn" onClick={() => remove(i.id)}>✕</button>
                </div>
              ))}
              <div className="tv-menu-sep" />
            </>
          )}

          <div className="tv-menu-head">{q ? "RESULTS" : "ADD INDICATOR"}</div>
          {matches.length === 0 && <div style={{ padding: "8px 14px", color: "var(--tv-muted)", fontSize: 12 }}>No indicators match “{q}”.</div>}
          {matches.map((k) => (
            <button key={k} type="button" className="tv-menu-item" onClick={() => add(k)}>
              <span><b>{CATALOG[k].name}</b></span>
              <kbd>{CATALOG[k].pane ? "pane" : "overlay"}</kbd>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

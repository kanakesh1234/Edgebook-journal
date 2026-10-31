"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import type { PlaybackSpeed } from "@/lib/backtesting/engine/clock";
import { I } from "./tv-icons";
import { focusFirstItem, onMenuKeyDown, useOutside } from "./tv-ui";
import { useDraggable } from "./use-draggable";
import { setFormationMode, useFormationMode, type FormationMode } from "@/lib/backtesting/playback-fx";

const FORMATION: Array<{ id: FormationMode; label: string; hint: string }> = [
  { id: "natural", label: "Natural", hint: "wicks + pauses" },
  { id: "smooth", label: "Smooth", hint: "even" },
  { id: "off", label: "Instant", hint: "no animation" },
];

const SPEEDS: PlaybackSpeed[] = [0.25, 0.5, 1, 2, 5, 10];

/** Floating bar-replay controls — same six controls TradingView has. */
export default function ReplayToolbar({ shifted, onClose }: { shifted: boolean; onClose: () => void }) {
  const playing = useBacktest((s) => s.playing);
  const speed = useBacktest((s) => s.speed);
  const status = useBacktest((s) => s.status);
  const selecting = useBacktest((s) => s.selectingBar);
  const setPlaying = useBacktest((s) => s.setPlaying);
  const setSpeed = useBacktest((s) => s.setSpeed);
  const advanceClock = useBacktest((s) => s.advanceClock);
  const stepBack = useBacktest((s) => s.stepBack);
  const setSelecting = useBacktest((s) => s.setSelectingBar);
  const nextDay = useBacktest((s) => s.navigateNextDay);
  const prevDay = useBacktest((s) => s.navigatePrevDay);
  const dataLoading = useBacktest((s) => s.dataLoading);

  const formation = useFormationMode();
  const [speedOpen, setSpeedOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { if (speedOpen) focusFirstItem(menuRef.current); }, [speedOpen]);
  const closeSpeed = useCallback(() => setSpeedOpen(false), []);
  useOutside(ref, speedOpen, closeSpeed);

  const { ref: barRef, gripProps } = useDraggable("replay");
  const finished = status === "completed" || status === "breached";

  return (
    <div ref={barRef} role="toolbar" aria-label="Replay controls" className={`tv-replay${shifted ? " is-shifted" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
      <span className="tv-grip" {...gripProps} />
      <button type="button" className={`tv-tbtn${selecting ? " is-on" : ""}`} data-tip="Jump to bar — forward only" aria-label="Jump to bar" aria-pressed={selecting} disabled={finished || playing} onClick={() => setSelecting(!selecting)}>
        <I name="jump" size={20} /><span className="tv-hide-sm">Jump to</span>
      </button>
      <i className="tv-sep" />
      <button type="button" className="tv-tbtn" data-tip="Previous day" aria-label="Previous day" disabled={dataLoading} onClick={() => void prevDay()}><I name="chevronLeft" size={18} /><span>Day</span></button>
      <button type="button" className="tv-tbtn" data-tip="Step back (←)" aria-label="Step back" disabled={playing} onClick={stepBack}><I name="stepBack" size={20} /></button>
      <button
        type="button" className={`tv-tbtn tv-play${playing ? " is-playing" : ""}`} data-tip={playing ? "Pause (Space)" : "Play (Space)"} aria-label={playing ? "Pause" : "Play"} disabled={finished}
        onClick={() => setPlaying(!playing)}
      >
        <I name={playing ? "pause" : "play"} size={20} />
      </button>
      <button type="button" className="tv-tbtn" data-tip="Step forward (→)" aria-label="Step forward" disabled={playing || finished} onClick={advanceClock}><I name="stepFwd" size={20} /></button>
      <button type="button" className="tv-tbtn" data-tip="Next day" aria-label="Next day" disabled={dataLoading} onClick={() => void nextDay()}><span>Day</span><I name="chevronRight" size={18} /></button>
      <i className="tv-sep" />
      <div className="tv-dd" ref={ref}>
        <button type="button" className="tv-tbtn tv-speed" data-tip="Replay speed" aria-label={`Replay speed ${speed}x`} aria-haspopup="menu" aria-expanded={speedOpen} onClick={() => setSpeedOpen((o) => !o)}>{speed}x</button>
        {speedOpen && (
          <div ref={menuRef} className="tv-menu" role="menu" aria-label="Replay speed" style={{ top: "calc(100% + 6px)", minWidth: 220 }} onKeyDown={(e) => onMenuKeyDown(e, menuRef.current, () => setSpeedOpen(false))}>
            <div className="tv-menu-head">Update interval</div>
            {SPEEDS.map((s) => (
              <button key={s} type="button" role="menuitemradio" aria-checked={s === speed} className={`tv-menu-item${s === speed ? " is-active" : ""}`} onClick={() => { setSpeed(s); setSpeedOpen(false); }}>
                <span className="ej-num">{s}x</span><span className="ej-trail">{s === 1 && <kbd>1 bar/s</kbd>}{s === speed && <I name="check" size={16} />}</span>
              </button>
            ))}
            <div className="tv-menu-sep" />
            <div className="tv-menu-head">Candle formation</div>
            {FORMATION.map((f) => (
              <button key={f.id} type="button" role="menuitemradio" aria-checked={f.id === formation} className={`tv-menu-item${f.id === formation ? " is-active" : ""}`} onClick={() => setFormationMode(f.id)}>
                <span>{f.label}</span><span className="ej-trail"><kbd>{f.hint}</kbd>{f.id === formation && <I name="check" size={16} />}</span>
              </button>
            ))}
          </div>
        )}
      </div>
      <i className="tv-sep" />
      <button type="button" className="tv-tbtn" data-tip="Hide replay controls" aria-label="Hide replay controls" onClick={onClose}><I name="close" size={16} /></button>
    </div>
  );
}

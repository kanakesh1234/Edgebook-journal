"use client";

import { useState, useRef, useCallback } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import type { PlaybackSpeed } from "@/lib/backtesting/engine/clock";
import { I } from "./tv-icons";
import { useOutside } from "./tv-ui";

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

  const [speedOpen, setSpeedOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const closeSpeed = useCallback(() => setSpeedOpen(false), []);
  useOutside(ref, speedOpen, closeSpeed);

  const finished = status === "completed" || status === "breached";

  return (
    <div className={`tv-replay${shifted ? " is-shifted" : ""}`} onPointerDown={(e) => e.stopPropagation()}>
      <button type="button" className={`tv-tbtn${selecting ? " is-on" : ""}`} title="Jump to bar (forward only)" disabled={finished || playing} onClick={() => setSelecting(!selecting)}>
        <I name="jump" size={20} /><span>Jump to</span>
      </button>
      <i className="tv-sep" />
      <button type="button" className="tv-tbtn" title="Previous day" disabled={dataLoading} onClick={() => void prevDay()}><I name="chevronLeft" size={20} /><span>Day</span></button>
      <button type="button" className="tv-tbtn" title="Step back (←)" disabled={playing} onClick={stepBack}><I name="stepBack" size={20} /></button>
      <button
        type="button" className="tv-tbtn tv-play" title={playing ? "Pause (Space)" : "Play (Space)"} disabled={finished}
        onClick={() => setPlaying(!playing)}
      >
        <I name={playing ? "pause" : "play"} size={22} />
      </button>
      <button type="button" className="tv-tbtn" title="Step forward (→)" disabled={playing || finished} onClick={advanceClock}><I name="stepFwd" size={20} /></button>
      <button type="button" className="tv-tbtn" title="Next day" disabled={dataLoading} onClick={() => void nextDay()}><span>Day</span><I name="chevronRight" size={20} /></button>
      <i className="tv-sep" />
      <div className="tv-dd" ref={ref}>
        <button type="button" className="tv-tbtn tv-speed" title="Replay speed" onClick={() => setSpeedOpen((o) => !o)}>{speed}x</button>
        {speedOpen && (
          <div className="tv-menu" style={{ top: "calc(100% + 6px)", minWidth: 120 }}>
            <div className="tv-menu-head">UPDATE INTERVAL</div>
            {SPEEDS.map((s) => (
              <button key={s} type="button" className={`tv-menu-item${s === speed ? " is-active" : ""}`} onClick={() => { setSpeed(s); setSpeedOpen(false); }}>
                <span>{s}x</span>{s === 1 && <kbd>1 bar/s</kbd>}
              </button>
            ))}
          </div>
        )}
      </div>
      <i className="tv-sep" />
      <button type="button" className="tv-tbtn" title="Hide replay controls" onClick={onClose}><I name="close" size={18} /></button>
    </div>
  );
}

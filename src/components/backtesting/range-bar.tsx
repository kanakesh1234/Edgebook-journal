"use client";

import { useRef, useState, useCallback } from "react";
import { useBacktest } from "@/lib/backtesting/store";
import { emitChartCommand } from "./chart-bus";
import { I } from "./tv-icons";
import { nyOffsetLabel, useOutside } from "./tv-ui";

const DAY = 86400;
const RANGES: Array<{ label: string; seconds: number | "all" | "ytd"; title: string }> = [
  { label: "1D", seconds: DAY, title: "1 day" },
  { label: "5D", seconds: 5 * DAY, title: "5 days" },
  { label: "1M", seconds: 30 * DAY, title: "1 month" },
  { label: "3M", seconds: 90 * DAY, title: "3 months" },
  { label: "6M", seconds: 180 * DAY, title: "6 months" },
  { label: "YTD", seconds: "ytd", title: "Year to date" },
  { label: "1Y", seconds: 365 * DAY, title: "1 year" },
  { label: "All", seconds: "all", title: "All available data" },
];

const nyTime = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const nyDate = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", month: "short", day: "numeric", year: "numeric" });

/** Bottom strip: visible-range shortcuts, go-to-date, replay clock and %/log/auto scale toggles. */
export default function RangeBar() {
  const currentTime = useBacktest((s) => s.currentTime);
  const status = useBacktest((s) => s.status);
  const playing = useBacktest((s) => s.playing);
  const scale = useBacktest((s) => s.scale);
  const setScale = useBacktest((s) => s.setScale);

  const [goOpen, setGoOpen] = useState(false);
  const [goVal, setGoVal] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setGoOpen(false), []);
  useOutside(ref, goOpen, close);

  const d = new Date(currentTime * 1000);
  const statusCls = status === "completed" ? "done" : status === "breached" ? "bad" : playing ? "live" : "paused";
  const statusTxt = status === "completed" ? "Completed" : status === "breached" ? "Breached" : playing ? "Replaying" : "Paused";

  const goto = () => {
    // datetime-local is entered as New York wall-clock time.
    if (!goVal) return;
    const [date, time = "00:00"] = goVal.split("T");
    const guess = Date.parse(`${date}T${time}:00Z`);
    if (Number.isNaN(guess)) return;
    const off = Number(/-(\d)$/.exec(nyOffsetLabel(guess / 1000))?.[1] ?? 5);
    emitChartCommand({ type: "goto", time: guess / 1000 + off * 3600 });
    setGoOpen(false);
  };

  return (
    <div className="tv-range">
      {RANGES.map((r) => (
        <button key={r.label} type="button" className="tv-tbtn ej-num" data-tip={r.title} aria-label={r.title} onClick={() => emitChartCommand({ type: "range", seconds: r.seconds })}>{r.label}</button>
      ))}
      <i className="tv-sep" />
      <div className="tv-dd" ref={ref}>
        <button type="button" className={`tv-tbtn${goOpen ? " is-on" : ""}`} data-tip="Go to date" aria-label="Go to date" aria-expanded={goOpen} onClick={() => setGoOpen((o) => !o)}><I name="calendar" size={18} /></button>
        {goOpen && (
          <div className="tv-menu tv-goto" role="dialog" aria-label="Go to date" style={{ top: "auto" }} onKeyDown={(e) => e.stopPropagation()}>
            <div className="tv-menu-head">Go to · New York time</div>
            <input type="datetime-local" value={goVal} onChange={(e) => setGoVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goto()} />
            <button type="button" className="tv-btn primary" style={{ marginTop: 8, width: "100%" }} onClick={goto}>Go to</button>
          </div>
        )}
      </div>
      <button type="button" className="tv-tbtn" data-tip="Scroll to the replay position (Alt+R)" aria-label="Reset view" onClick={() => emitChartCommand({ type: "reset" })}>Reset view</button>

      <span className="tv-grow" />
      <span className={`tv-status ${statusCls}`}>{statusTxt}</span>
      <span className="tv-clock ej-num">
        {currentTime > 0
          ? <>{nyDate.format(d)} <b>{nyTime.format(d)}</b> <em>{nyOffsetLabel(currentTime)}</em></>
          : <b>—</b>}
      </span>
      <i className="tv-sep" />
      <button type="button" className={`tv-tbtn${scale.mode === "percent" ? " is-on" : ""}`} data-tip="Percentage scale (Alt+P)" aria-label="Percentage scale" aria-pressed={scale.mode === "percent"} onClick={() => setScale({ mode: scale.mode === "percent" ? "normal" : "percent" })}>%</button>
      <button type="button" className={`tv-tbtn${scale.mode === "log" ? " is-on" : ""}`} data-tip="Logarithmic scale (Alt+L)" aria-label="Logarithmic scale" aria-pressed={scale.mode === "log"} onClick={() => setScale({ mode: scale.mode === "log" ? "normal" : "log" })}>log</button>
      <button type="button" className={`tv-tbtn${scale.auto ? " is-on" : ""}`} data-tip="Auto-fit price scale" aria-label="Auto-fit price scale" aria-pressed={scale.auto} onClick={() => setScale({ auto: !scale.auto })}>auto</button>
    </div>
  );
}

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
  const statusTxt = status === "completed" ? "COMPLETED" : status === "breached" ? "BREACHED" : playing ? "REPLAYING" : "PAUSED";

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
        <button key={r.label} type="button" className="tv-tbtn" title={r.title} onClick={() => emitChartCommand({ type: "range", seconds: r.seconds })}>{r.label}</button>
      ))}
      <i className="tv-sep" />
      <div className="tv-dd" ref={ref}>
        <button type="button" className={`tv-tbtn${goOpen ? " is-on" : ""}`} title="Go to…" onClick={() => setGoOpen((o) => !o)}><I name="calendar" size={20} /></button>
        {goOpen && (
          <div className="tv-menu tv-goto" style={{ top: "auto" }}>
            <div className="tv-menu-head" style={{ padding: "0 0 6px" }}>GO TO (NEW YORK TIME)</div>
            <input type="datetime-local" value={goVal} onChange={(e) => setGoVal(e.target.value)} onKeyDown={(e) => e.key === "Enter" && goto()} />
            <button type="button" className="tv-btn primary" style={{ marginTop: 8, width: "100%" }} onClick={goto}>Go to</button>
          </div>
        )}
      </div>
      <button type="button" className="tv-tbtn" title="Scroll to the replay position" onClick={() => emitChartCommand({ type: "reset" })}>Reset view</button>

      <span className="tv-grow" />
      <span className={`tv-status ${statusCls}`}>{statusTxt}</span>
      <span className="tv-clock">
        {nyDate.format(d)} <b>{nyTime.format(d)}</b> <em>{nyOffsetLabel(currentTime)}</em>
      </span>
      <i className="tv-sep" />
      <button type="button" className={`tv-tbtn${scale.mode === "percent" ? " is-on" : ""}`} title="Percentage scale (Alt+P)" onClick={() => setScale({ mode: scale.mode === "percent" ? "normal" : "percent" })}>%</button>
      <button type="button" className={`tv-tbtn${scale.mode === "log" ? " is-on" : ""}`} title="Logarithmic scale (Alt+L)" onClick={() => setScale({ mode: scale.mode === "log" ? "normal" : "log" })}>log</button>
      <button type="button" className={`tv-tbtn${scale.auto ? " is-on" : ""}`} title="Auto-fit price scale" onClick={() => setScale({ auto: !scale.auto })}>auto</button>
    </div>
  );
}

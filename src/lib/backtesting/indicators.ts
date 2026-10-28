/* ------------------------------------------------------------------ */
/*  Indicators — pure math, no chart/UI imports.                        */
/*  Every function takes the candles the chart currently shows, so in   */
/*  replay an indicator can never see a bar that hasn't been revealed.  */
/* ------------------------------------------------------------------ */

import type { CandleData } from "./data/types";

export type IndicatorKind = "sma" | "ema" | "wma" | "vwap" | "bb" | "volume" | "rsi" | "macd" | "atr" | "stoch";

export interface IndicatorInst {
  id: string;
  kind: IndicatorKind;
  params: number[];
  color: string;
  visible: boolean;
}

export interface IndicatorDef {
  name: string;
  desc: string;
  /** Own pane under the price chart (true) or drawn over the candles (false). */
  pane: boolean;
  paramLabels: string[];
  defaults: number[];
}

export const CATALOG: Record<IndicatorKind, IndicatorDef> = {
  sma: { name: "Moving Average (SMA)", desc: "Simple moving average of close", pane: false, paramLabels: ["Length"], defaults: [20] },
  ema: { name: "Moving Average Exponential (EMA)", desc: "Exponential moving average of close", pane: false, paramLabels: ["Length"], defaults: [21] },
  wma: { name: "Weighted Moving Average (WMA)", desc: "Linearly weighted moving average", pane: false, paramLabels: ["Length"], defaults: [20] },
  vwap: { name: "VWAP", desc: "Volume-weighted average price, resets each futures session (6 PM ET)", pane: false, paramLabels: [], defaults: [] },
  bb: { name: "Bollinger Bands", desc: "SMA ± standard deviations", pane: false, paramLabels: ["Length", "Mult"], defaults: [20, 2] },
  volume: { name: "Volume", desc: "Traded volume per bar", pane: false, paramLabels: [], defaults: [] },
  rsi: { name: "Relative Strength Index (RSI)", desc: "Wilder momentum oscillator, 0–100", pane: true, paramLabels: ["Length"], defaults: [14] },
  macd: { name: "MACD", desc: "Moving average convergence divergence", pane: true, paramLabels: ["Fast", "Slow", "Signal"], defaults: [12, 26, 9] },
  atr: { name: "Average True Range (ATR)", desc: "Wilder average of true range", pane: true, paramLabels: ["Length"], defaults: [14] },
  stoch: { name: "Stochastic", desc: "%K / %D oscillator", pane: true, paramLabels: ["%K", "Smooth", "%D"], defaults: [14, 3, 3] },
};

export const KINDS = Object.keys(CATALOG) as IndicatorKind[];
export const PALETTE = ["#2962ff", "#ff9800", "#e91e63", "#26a69a", "#9c27b0", "#fbc02d", "#00bcd4", "#8bc34a"];

export type Series = (number | null)[];
export interface Line {
  key: string;
  values: Series;
  type: "line" | "hist";
  /** Fixed colour; otherwise the instance colour. For hist, `colors` can colour each bar. */
  color?: string;
  colors?: string[];
  width?: number;
  dashed?: boolean;
}

const len = (p: number | undefined, d: number) => Math.max(1, Math.floor(Number.isFinite(p as number) ? (p as number) : d));

/* ----------------------------- primitives ----------------------------- */

export function sma(src: Series, n: number): Series {
  const out: Series = new Array(src.length).fill(null);
  let sum = 0, cnt = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v === null) { sum = 0; cnt = 0; continue; }
    sum += v; cnt++;
    if (cnt > n) { sum -= src[i - n] as number; cnt--; }
    if (cnt === n) out[i] = sum / n;
  }
  return out;
}

export function ema(src: Series, n: number): Series {
  const out: Series = new Array(src.length).fill(null);
  const k = 2 / (n + 1);
  let prev: number | null = null, seed = 0, cnt = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v === null) continue;
    if (prev === null) {
      seed += v; cnt++;
      if (cnt === n) { prev = seed / n; out[i] = prev; }
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  return out;
}

/** Wilder smoothing (RMA). */
function rma(src: Series, n: number): Series {
  const out: Series = new Array(src.length).fill(null);
  let prev: number | null = null, seed = 0, cnt = 0;
  for (let i = 0; i < src.length; i++) {
    const v = src[i];
    if (v === null) continue;
    if (prev === null) {
      seed += v; cnt++;
      if (cnt === n) { prev = seed / n; out[i] = prev; }
    } else {
      prev = (prev * (n - 1) + v) / n;
      out[i] = prev;
    }
  }
  return out;
}

function wma(src: Series, n: number): Series {
  const out: Series = new Array(src.length).fill(null);
  const denom = (n * (n + 1)) / 2;
  for (let i = n - 1; i < src.length; i++) {
    let acc = 0, ok = true;
    for (let j = 0; j < n; j++) {
      const v = src[i - j];
      if (v === null) { ok = false; break; }
      acc += v * (n - j);
    }
    if (ok) out[i] = acc / denom;
  }
  return out;
}

const closes = (c: CandleData[]): Series => c.map((x) => x.close);

/* ----------------------------- VWAP session ----------------------------- */

const nyDay = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" });
const sessionCache = new Map<number, string>();
/** CME futures day rolls at 18:00 ET: shift forward 6h and take the New York date. */
function sessionKey(t: number): string {
  const bucket = Math.floor(t / 900);
  let k = sessionCache.get(bucket);
  if (!k) {
    k = nyDay.format(new Date((bucket * 900 + 6 * 3600) * 1000));
    if (sessionCache.size > 5000) sessionCache.clear();
    sessionCache.set(bucket, k);
  }
  return k;
}

function vwap(c: CandleData[]): Series {
  const out: Series = new Array(c.length).fill(null);
  let key = "", pv = 0, vol = 0, tpSum = 0, n = 0;
  for (let i = 0; i < c.length; i++) {
    const k = sessionKey(c[i].time);
    if (k !== key) { key = k; pv = 0; vol = 0; tpSum = 0; n = 0; }
    const tp = (c[i].high + c[i].low + c[i].close) / 3;
    pv += tp * c[i].volume; vol += c[i].volume; tpSum += tp; n++;
    out[i] = vol > 0 ? pv / vol : tpSum / n; // no volume in feed → plain typical-price average
  }
  return out;
}

/* ------------------------------ compute ------------------------------ */

export function compute(kind: IndicatorKind, params: number[], c: CandleData[]): Line[] {
  const d = CATALOG[kind].defaults;
  const p = (i: number) => len(params[i], d[i] ?? 14);
  switch (kind) {
    case "sma": return [{ key: "sma", values: sma(closes(c), p(0)), type: "line" }];
    case "ema": return [{ key: "ema", values: ema(closes(c), p(0)), type: "line" }];
    case "wma": return [{ key: "wma", values: wma(closes(c), p(0)), type: "line" }];
    case "vwap": return [{ key: "vwap", values: vwap(c), type: "line" }];
    case "volume":
      return [{
        key: "volume", type: "hist",
        values: c.map((x) => x.volume),
        colors: c.map((x) => (x.close >= x.open ? "rgba(38,166,154,0.5)" : "rgba(239,83,80,0.5)")),
      }];
    case "bb": {
      const n = p(0), mult = Number.isFinite(params[1]) && params[1] > 0 ? params[1] : 2;
      const src = closes(c), mid = sma(src, n);
      const up: Series = [], lo: Series = [];
      for (let i = 0; i < src.length; i++) {
        const m = mid[i];
        if (m === null) { up.push(null); lo.push(null); continue; }
        let v = 0;
        for (let j = i - n + 1; j <= i; j++) v += (src[j] as number - m) ** 2;
        const sd = Math.sqrt(v / n);
        up.push(m + mult * sd); lo.push(m - mult * sd);
      }
      return [
        { key: "upper", values: up, type: "line", width: 1 },
        { key: "basis", values: mid, type: "line", width: 1, color: "#ff9800" },
        { key: "lower", values: lo, type: "line", width: 1 },
      ];
    }
    case "rsi": {
      const n = p(0), src = closes(c);
      const gain: Series = [null], loss: Series = [null];
      for (let i = 1; i < src.length; i++) {
        const ch = (src[i] as number) - (src[i - 1] as number);
        gain.push(Math.max(ch, 0)); loss.push(Math.max(-ch, 0));
      }
      const ag = rma(gain, n), al = rma(loss, n);
      const out: Series = ag.map((g, i) => (g === null || al[i] === null ? null : al[i] === 0 ? 100 : 100 - 100 / (1 + g / (al[i] as number))));
      return [{ key: "rsi", values: out, type: "line" }];
    }
    case "atr": {
      const tr: Series = c.map((x, i) => (i === 0 ? x.high - x.low : Math.max(x.high - x.low, Math.abs(x.high - c[i - 1].close), Math.abs(x.low - c[i - 1].close))));
      return [{ key: "atr", values: rma(tr, p(0)), type: "line" }];
    }
    case "macd": {
      const fast = p(0), slow = p(1), sig = p(2), src = closes(c);
      const ef = ema(src, fast), es = ema(src, slow);
      const macd: Series = ef.map((v, i) => (v === null || es[i] === null ? null : v - (es[i] as number)));
      const signal = ema(macd, sig);
      const hist: Series = macd.map((v, i) => (v === null || signal[i] === null ? null : v - (signal[i] as number)));
      return [
        { key: "hist", values: hist, type: "hist", colors: hist.map((v) => ((v ?? 0) >= 0 ? "rgba(38,166,154,0.6)" : "rgba(239,83,80,0.6)")) },
        { key: "macd", values: macd, type: "line", color: "#2962ff" },
        { key: "signal", values: signal, type: "line", color: "#ff9800" },
      ];
    }
    case "stoch": {
      const kLen = p(0), smooth = p(1), dLen = p(2);
      const raw: Series = c.map((x, i) => {
        if (i < kLen - 1) return null;
        let hh = -Infinity, ll = Infinity;
        for (let j = i - kLen + 1; j <= i; j++) { hh = Math.max(hh, c[j].high); ll = Math.min(ll, c[j].low); }
        return hh === ll ? 50 : ((x.close - ll) / (hh - ll)) * 100;
      });
      const k = sma(raw, smooth);
      return [
        { key: "k", values: k, type: "line", color: "#2962ff" },
        { key: "d", values: sma(k, dLen), type: "line", color: "#ff9800" },
      ];
    }
  }
}

/** "SMA 20", "MACD 12 26 9" */
export function label(inst: Pick<IndicatorInst, "kind" | "params">): string {
  const base = { sma: "SMA", ema: "EMA", wma: "WMA", vwap: "VWAP", bb: "BB", volume: "Volume", rsi: "RSI", macd: "MACD", atr: "ATR", stoch: "Stoch" }[inst.kind];
  const ps = CATALOG[inst.kind].paramLabels.length ? ` ${inst.params.join(" ")}` : "";
  return base + ps;
}

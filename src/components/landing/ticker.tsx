"use client";

const ITEMS = [
  ["ES", "+1.24%", 1],
  ["NQ", "−0.42%", -1],
  ["BTCUSD", "+2.81%", 1],
  ["EURUSD", "+0.18%", 1],
  ["GBPJPY", "−0.31%", -1],
  ["XAUUSD", "+0.94%", 1],
  ["CL", "−1.37%", -1],
  ["AAPL", "+0.62%", 1],
  ["NVDA", "+3.41%", 1],
  ["TSLA", "−2.05%", -1],
] as const;

export function Ticker() {
  const row = [...ITEMS, ...ITEMS];
  return (
    <div className="relative border-y border-line bg-surface/60 py-3" aria-hidden>
      <div className="ticker-mask overflow-hidden">
        <div className="ticker-track flex w-max items-center gap-10 pr-10">
          {row.map(([sym, chg, dir], i) => (
            <span key={i} className="flex items-center gap-2 whitespace-nowrap">
              <span className="font-mono text-xs font-semibold tracking-wide text-muted">{sym}</span>
              <span
                className={`font-mono text-xs tabular ${dir > 0 ? "text-profit" : "text-loss"}`}
              >
                {chg}
              </span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

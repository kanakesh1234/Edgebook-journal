"use client";

import {
  Area,
  AreaChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { CurrencyCode, EquityPoint } from "@/lib/types";
import { formatDateMedium, formatMoney, formatSignedMoney } from "@/lib/format";

function EquityTooltip({
  active,
  payload,
  currency,
  startingEquity,
}: TooltipProps<number, string> & { currency?: CurrencyCode; startingEquity?: number }) {
  const p = payload?.[0]?.payload as EquityPoint | undefined;
  if (!active || !p) return null;
  const delta = p.equity - (startingEquity ?? 0);
  return (
    <div className="rounded-xl border border-line-strong bg-overlay/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="text-[11px] font-medium text-muted">{formatDateMedium(p.date)}</p>
      <p className="mt-0.5 font-mono text-sm font-semibold tabular text-ink">
        {formatMoney(p.equity, currency)}
      </p>
      <p className={`font-mono text-[11px] tabular ${delta >= 0 ? "text-profit" : "text-loss"}`}>
        {formatSignedMoney(delta, currency)} overall
      </p>
    </div>
  );
}

export function EquityCurve({
  data,
  currency,
  startingEquity,
  targetEquity,
  height = 300,
}: {
  data: EquityPoint[];
  currency: CurrencyCode;
  startingEquity: number;
  targetEquity: number;
  height?: number;
}) {
  const values = [startingEquity, targetEquity, ...data.map((d) => d.equity)];
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const pad = (maxY - minY) * 0.12 || Math.max(500, maxY * 0.05);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 12, right: 8, bottom: 4, left: 0 }}>
        <defs>
          <linearGradient id="equity-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#35e0a1" stopOpacity={0.25} />
            <stop offset="100%" stopColor="#35e0a1" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="equity-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#35e0a1" />
            <stop offset="100%" stopColor="#ecc063" />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDateMedium(d).slice(4)}
          tick={{ fill: "#5c6b85", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "#1a2333" }}
          tickLine={false}
          minTickGap={48}
        />
        <YAxis
          domain={[minY - pad, maxY + pad]}
          tickFormatter={(v: number) => formatMoney(v, currency, { compact: true })}
          tick={{ fill: "#5c6b85", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={58}
        />

        <ReferenceLine
          y={startingEquity}
          stroke="#2a3750"
          strokeDasharray="4 6"
          label={{
            value: "START",
            position: "insideBottomLeft",
            fill: "#5c6b85",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
          }}
        />
        <ReferenceLine
          y={targetEquity}
          stroke="#ecc063"
          strokeDasharray="6 7"
          strokeOpacity={0.75}
          label={{
            value: `TARGET ${formatMoney(targetEquity, currency, { compact: true })}`,
            position: "insideTopLeft",
            fill: "#ecc063",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
          }}
        />

        <Tooltip
          content={<EquityTooltip currency={currency} startingEquity={startingEquity} />}
          cursor={{ stroke: "#2a3750", strokeDasharray: "3 4" }}
        />

        <Area
          type="monotone"
          dataKey="equity"
          stroke="url(#equity-line)"
          strokeWidth={2.4}
          fill="url(#equity-fill)"
          animationDuration={1100}
          animationEasing="ease-out"
          activeDot={{ r: 4, fill: "#ecc063", stroke: "#05070b", strokeWidth: 2 }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

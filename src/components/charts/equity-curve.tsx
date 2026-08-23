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
      <p className="num mt-0.5 text-sm text-ink">
        {formatMoney(p.equity, currency)}
      </p>
      <p className={`text-[11px] font-medium tabular ${delta >= 0 ? "text-profit" : "text-loss"}`}>
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
            <stop offset="0%" stopColor="var(--color-profit)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--color-profit)" stopOpacity={0} />
          </linearGradient>
          <linearGradient id="equity-line" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="var(--color-profit)" />
            <stop offset="100%" stopColor="var(--color-gold-strong)" />
          </linearGradient>
        </defs>

        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => formatDateMedium(d).slice(4)}
          tick={{ fill: "var(--color-faint)", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--color-line)" }}
          tickLine={false}
          minTickGap={48}
        />
        <YAxis
          domain={[minY - pad, maxY + pad]}
          tickFormatter={(v: number) => formatMoney(Math.round(v), currency, { compact: true, decimals: 0 })}
          tick={{ fill: "var(--color-faint)", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={56}
        />

        <ReferenceLine
          y={startingEquity}
          stroke="var(--color-line-strong)"
          strokeDasharray="4 6"
          label={{
            value: "START",
            position: "insideBottomLeft",
            fill: "var(--color-faint)",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
          }}
        />
        <ReferenceLine
          y={targetEquity}
          stroke="var(--color-gold)"
          strokeDasharray="6 7"
          strokeOpacity={0.75}
          label={{
            value: `TARGET ${formatMoney(targetEquity, currency, { compact: true })}`,
            position: "insideTopLeft",
            fill: "var(--color-gold)",
            fontSize: 9,
            fontFamily: "var(--font-mono)",
          }}
        />

        <Tooltip
          content={<EquityTooltip currency={currency} startingEquity={startingEquity} />}
          cursor={{ stroke: "var(--color-line-strong)", strokeDasharray: "3 4" }}
        />

        <Area
          type="monotone"
          dataKey="equity"
          stroke="url(#equity-line)"
          strokeWidth={2.4}
          fill="url(#equity-fill)"
          animationDuration={1100}
          animationEasing="ease-out"
          activeDot={{ r: 4, fill: "var(--color-gold-strong)", stroke: "var(--color-canvas)", strokeWidth: 2 }}
          dot={false}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  Bar,
  BarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipProps,
} from "recharts";
import type { DayResult } from "@/lib/types";
import type { CurrencyCode } from "@/lib/types";
import { formatDateMedium, formatSignedMoney } from "@/lib/format";

function BarsTooltip({ active, payload, currency }: TooltipProps<number, string> & { currency?: CurrencyCode }) {
  const d = payload?.[0]?.payload as DayResult | undefined;
  if (!active || !d) return null;
  return (
    <div className="rounded-xl border border-line-strong bg-overlay/95 px-3 py-2 shadow-xl backdrop-blur">
      <p className="text-[11px] font-medium text-muted">{formatDateMedium(d.date)}</p>
      <p className={`num mt-0.5 text-sm ${d.pnl > 0 ? "text-profit" : d.pnl < 0 ? "text-loss" : "text-muted"}`}>
        {formatSignedMoney(d.pnl, currency)}
      </p>
      <p className="text-[11px] tabular text-faint">
        {d.trades} {d.trades === 1 ? "trade" : "trades"}
      </p>
    </div>
  );
}

export function DailyBars({ data, currency, height = 240 }: { data: DayResult[]; currency: CurrencyCode; height?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} margin={{ top: 8, right: 4, bottom: 0, left: 4 }} barCategoryGap="22%">
        <XAxis
          dataKey="date"
          tickFormatter={(d: string) => d.slice(8)}
          tick={{ fill: "var(--color-faint)", fontSize: 9, fontFamily: "var(--font-mono)" }}
          axisLine={{ stroke: "var(--color-line)" }}
          tickLine={false}
          minTickGap={26}
        />
        <YAxis
          tickFormatter={(v: number) => formatSignedMoney(v, currency, { compact: true }).replace("+", "")}
          tick={{ fill: "var(--color-faint)", fontSize: 10, fontFamily: "var(--font-mono)" }}
          axisLine={false}
          tickLine={false}
          width={52}
        />
        <Tooltip content={<BarsTooltip currency={currency} />} cursor={{ fill: "color-mix(in srgb, var(--color-muted) 8%, transparent)" }} />
        <Bar dataKey="pnl" radius={[3, 3, 0, 0]} animationDuration={900} animationEasing="ease-out">
          {data.map((d) => (
            <Cell
              key={d.date}
              fill={d.pnl > 0 ? "var(--color-profit)" : d.pnl < 0 ? "var(--color-loss)" : "var(--color-line-strong)"}
              fillOpacity={0.82}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

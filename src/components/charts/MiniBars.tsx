"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "./chart-theme";

/**
 * Seven-day column strip under each summary tile. The final column carries the
 * full-strength colour; the rest are muted so the latest day reads first.
 */
export function MiniBars({
  data,
  color,
  label,
  format,
}: {
  data: { day: number; value: number }[];
  color: string;
  label: string;
  format?: (n: number) => string;
}) {
  const last = data.length - 1;

  return (
    <ResponsiveContainer width="100%" height={150}>
      <BarChart data={data} margin={{ top: 6, right: 4, bottom: 0, left: -24 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          dy={6}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          labelFormatter={(v) => `Day ${v}`}
          formatter={(value) => [format ? format(Number(value)) : Number(value), label]}
        />
        <Bar dataKey="value" radius={[4, 4, 0, 0]} isAnimationActive animationDuration={900}>
          {data.map((_, i) => (
            <Cell key={i} fill={color} fillOpacity={i === last ? 1 : 0.45} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "./chart-theme";
import { formatBDT, formatBDTCompact } from "@/lib/format/money";

export function TrendArea({
  data,
}: {
  data: { month: string; thisYear: number; lastYear: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={264}>
      <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -6 }}>
        <defs>
          <linearGradient id="g-this" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.38} />
            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="g-last" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="var(--chart-2)" stopOpacity={0.28} />
            <stop offset="100%" stopColor="var(--chart-2)" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          dy={6}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={56}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          tickFormatter={(v) => formatBDTCompact(Number(v)).replace("৳ ", "")}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ stroke: "var(--border)", strokeWidth: 1 }}
          formatter={(value, name) => [
            formatBDT(Number(value)),
            name === "thisYear" ? "This year" : "Last year",
          ]}
        />
        <Area
          type="monotone"
          dataKey="lastYear"
          stroke="var(--chart-2)"
          strokeWidth={2}
          fill="url(#g-last)"
          isAnimationActive
          animationDuration={900}
        />
        <Area
          type="monotone"
          dataKey="thisYear"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          fill="url(#g-this)"
          isAnimationActive
          animationDuration={1100}
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

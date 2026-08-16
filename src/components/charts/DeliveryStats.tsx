"use client";

import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "./chart-theme";

export function DeliveryStats({
  data,
}: {
  data: { day: string; ordered: number; delivered: number }[];
}) {
  return (
    <ResponsiveContainer width="100%" height={300}>
      <ComposedChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: -20 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 11 }}
          dy={8}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          width={44}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
        />
        <Tooltip
          contentStyle={tooltipStyle}
          itemStyle={tooltipItemStyle}
          labelStyle={tooltipLabelStyle}
          cursor={{ fill: "var(--muted)", opacity: 0.5 }}
          formatter={(value, name) => [
            Number(value),
            name === "ordered" ? "Ordered" : "Delivered",
          ]}
        />
        <Bar
          dataKey="ordered"
          fill="var(--chart-3)"
          barSize={18}
          radius={[4, 4, 0, 0]}
          isAnimationActive
          animationDuration={900}
        />
        <Line
          type="linear"
          dataKey="delivered"
          stroke="var(--chart-1)"
          strokeWidth={2.5}
          dot={{ r: 4, fill: "var(--card)", stroke: "var(--chart-1)", strokeWidth: 2.5 }}
          activeDot={{ r: 5 }}
          isAnimationActive
          animationDuration={1100}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

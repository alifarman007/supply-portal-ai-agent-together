"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "./chart-theme";

const GAP = 3;

/**
 * Order sits on the baseline, Delivery floats above it with a gap. Recharts
 * draws a floating segment when the datum is a [start, end] tuple, which is
 * what lets the two capsules share a column without stacking flush.
 */
export function PerformanceBars({
  data,
}: {
  data: { month: string; order: number; delivery: number }[];
}) {
  const rows = data.map((d) => ({
    month: d.month,
    order: [0, d.order] as [number, number],
    delivery: [d.order + GAP, d.order + GAP + d.delivery] as [number, number],
    _order: d.order,
    _delivery: d.delivery,
  }));

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={rows} margin={{ top: 10, right: 8, bottom: 0, left: -14 }} barGap={10}>
        <CartesianGrid stroke="var(--border)" vertical={false} />
        <XAxis
          dataKey="month"
          tickLine={false}
          axisLine={false}
          tick={{ fill: "var(--muted-foreground)", fontSize: 12 }}
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
          formatter={(_value, name, entry) => {
            const p = entry?.payload as { _order: number; _delivery: number } | undefined;
            return name === "order"
              ? [p?._order ?? 0, "Order"]
              : [p?._delivery ?? 0, "Delivery"];
          }}
        />
        <Bar
          dataKey="order"
          fill="var(--chart-1)"
          barSize={12}
          radius={999}
          isAnimationActive
          animationDuration={900}
        />
        <Bar
          dataKey="delivery"
          fill="var(--chart-2)"
          barSize={12}
          radius={999}
          isAnimationActive
          animationDuration={1100}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

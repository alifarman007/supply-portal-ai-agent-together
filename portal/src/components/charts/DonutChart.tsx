"use client";

import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { tooltipStyle, tooltipItemStyle, tooltipLabelStyle } from "./chart-theme";
import { formatBDT, formatBDTCompact } from "@/lib/format/money";

const CHART_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

export function DonutChart({
  data,
  centerLabel,
}: {
  data: { name: string; value: number; color?: string }[];
  centerLabel?: string;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);

  return (
    <div>
      <div className="relative">
        <ResponsiveContainer width="100%" height={196}>
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={88}
              paddingAngle={2}
              stroke="none"
              startAngle={90}
              endAngle={-270}
              isAnimationActive
              animationDuration={900}
            >
              {data.map((d, i) => (
                <Cell
                  key={d.name}
                  fill={d.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              itemStyle={tooltipItemStyle}
              labelStyle={tooltipLabelStyle}
              formatter={(value, name) => [formatBDT(Number(value)), name]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] tracking-wide text-muted-foreground uppercase">
            {centerLabel ?? "Total"}
          </span>
          <span className="tnum text-lg font-bold text-foreground">
            {formatBDTCompact(total)}
          </span>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-5 gap-y-1.5">
        {data.map((d, i) => {
          const pct = total ? Math.round((d.value / total) * 100) : 0;
          return (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span
                className="size-2.5 rounded-full"
                style={{ background: d.color ?? CHART_COLORS[i % CHART_COLORS.length] }}
              />
              <span className="font-medium text-foreground">{d.name}</span>
              <span className="tnum text-muted-foreground">{pct}%</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

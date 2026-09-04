"use client";

import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { AnimatedNumber } from "./AnimatedNumber";
import { Skeleton } from "@/components/ui/skeleton";

export function KpiTile({
  icon: Icon,
  label,
  value,
  format,
  loading,
  accent,
  warn,
  delta,
  footer,
  className,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  format: (n: number) => string;
  loading?: boolean;
  accent?: boolean;
  warn?: boolean;
  delta?: number;
  footer?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("glass flex h-full flex-col p-6", className)}>
      <div className="flex items-start justify-between">
        {/* Solid colour chip rather than a tint — the saturated square against
            white is the signature of the new brand sheet. */}
        <span
          className={cn(
            "grid size-11 place-items-center rounded-xl text-white",
            warn ? "bg-warn" : accent ? "bg-primary" : "bg-chart-4",
          )}
        >
          <Icon className="size-5" strokeWidth={2} />
        </span>
        {typeof delta === "number" && !loading && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-semibold",
              delta >= 0 ? "bg-ok/10 text-ok" : "bg-danger/10 text-danger",
            )}
          >
            {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)}%
          </span>
        )}
      </div>
      <div className="mt-5 text-sm font-medium text-muted-foreground">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-9 w-28 rounded-md" />
      ) : (
        <AnimatedNumber
          value={value}
          format={format}
          className="tnum mt-1 font-heading text-[28px] leading-tight font-bold text-foreground"
        />
      )}
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </div>
  );
}

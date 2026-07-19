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
    <div className={cn("glass flex h-full flex-col p-5", className)}>
      <div className="flex items-start justify-between">
        <span
          className={cn(
            "grid size-10 place-items-center rounded-xl ring-1 ring-inset",
            warn
              ? "bg-warn/10 text-warn ring-warn/30"
              : accent
                ? "bg-primary/10 text-primary ring-primary/25 dark:text-brand-cream dark:ring-brand-cream/30"
                : "bg-muted text-muted-foreground ring-transparent",
          )}
        >
          <Icon className="size-5" strokeWidth={1.75} />
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
      <div className="mt-4 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {label}
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-8 w-28 rounded-md" />
      ) : (
        <AnimatedNumber
          value={value}
          format={format}
          className="tnum mt-1 font-heading text-2xl font-bold text-foreground"
        />
      )}
      {footer && <div className="mt-auto pt-3">{footer}</div>}
    </div>
  );
}

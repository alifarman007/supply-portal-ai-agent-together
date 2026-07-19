"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useLabels } from "@/lib/i18n/labels";

export function Logo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const { t } = useLabels();
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className="size-10 shrink-0" />
      {!collapsed && (
        <div className="leading-none">
          <div className="font-heading text-[16px] font-bold tracking-tight text-foreground">
            <span>Kazi </span>
            <span className="text-brand-red">Farms</span>
          </div>
          <div className="mt-0.5 text-[9.5px] font-semibold tracking-[0.16em] text-muted-foreground uppercase">
            {t("brand_descriptor")}
          </div>
        </div>
      )}
    </div>
  );
}

export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn("relative inline-block shrink-0", className)}
      role="img"
      aria-label="Kazi Farms Group"
    >
      <Image
        src="/brand/kazifarms-mark.png"
        alt=""
        fill
        sizes="200px"
        className="object-contain"
        priority
      />
    </span>
  );
}

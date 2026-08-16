"use client";

import Image from "next/image";
import { cn } from "@/lib/utils";
import { useLabels } from "@/lib/i18n/labels";
import { KaziFarmsLogo, KaziFarmsMarkBlock } from "./KaziFarmsLogo";

export function Logo({
  collapsed = false,
  className,
}: {
  collapsed?: boolean;
  className?: string;
}) {
  const { t } = useLabels();

  if (collapsed) {
    return <KaziFarmsMarkBlock className={cn("w-11 shrink-0", className)} />;
  }

  return (
    <div className={cn("leading-none", className)}>
      <KaziFarmsLogo className="w-[150px]" />
      <div className="mt-1.5 text-[9.5px] font-bold tracking-[0.16em] text-primary uppercase">
        {t("brand_descriptor")}
      </div>
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

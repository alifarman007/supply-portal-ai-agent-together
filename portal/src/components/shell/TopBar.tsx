"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { NotificationBell } from "./NotificationBell";
import { useLabels } from "@/lib/i18n/labels";

export function TopBar() {
  const { t } = useLabels();

  // Opaque and unblurred: a backdrop-filter on a sticky bar re-samples the
  // scrolling content every frame, which makes the icons sitting on it wobble.
  return (
    <header className="sticky top-0 z-30 bg-background">
      <div className="flex h-[76px] items-center gap-2 px-4 sm:px-6">
        <div className="flex items-center gap-2 lg:hidden">
          <MobileNav />
          <Logo collapsed />
        </div>

        {/* Borderless on the canvas — the field only materialises on focus. */}
        <div className="relative hidden max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-[18px] -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            className="h-10 rounded-full border-transparent bg-transparent pl-10 shadow-none transition-colors focus-visible:border-border focus-visible:bg-card"
          />
        </div>
        <div className="flex-1 md:hidden" />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2.5">
          <ThemeToggle />
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

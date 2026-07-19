"use client";

import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Logo } from "./Logo";
import { MobileNav } from "./MobileNav";
import { LangToggle } from "./LangToggle";
import { ThemeToggle } from "./ThemeToggle";
import { UserMenu } from "./UserMenu";
import { NotificationBell } from "./NotificationBell";
import { useLabels } from "@/lib/i18n/labels";

export function TopBar() {
  const { t } = useLabels();

  return (
    <header className="sticky top-0 z-30 px-3 pt-3">
      <div className="glass flex h-16 items-center gap-2 px-3 sm:px-4">
        <div className="flex items-center gap-2 lg:hidden">
          <MobileNav />
          <Logo collapsed />
        </div>

        <div className="relative hidden max-w-md flex-1 md:block">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("search")}
            className="h-9 rounded-full border-border bg-muted/40 pl-9"
          />
        </div>
        <div className="flex-1 md:hidden" />

        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <div className="hidden sm:block">
            <LangToggle />
          </div>
          <ThemeToggle />
          <NotificationBell />
          <div className="mx-0.5 hidden h-6 w-px bg-border sm:block" />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}

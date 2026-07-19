"use client";

import { useState } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { SidebarNav } from "./SidebarNav";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

export function Sidebar({ initialCollapsed }: { initialCollapsed: boolean }) {
  const [collapsed, setCollapsed] = useState(initialCollapsed);

  const toggle = () => {
    setCollapsed((prev) => {
      const next = !prev;
      document.cookie = `sfms-sidebar=${next ? "1" : "0"}; path=/; max-age=31536000; SameSite=Lax`;
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 p-3 transition-[width] duration-300 ease-out lg:block",
        collapsed ? "w-[84px]" : "w-[264px]",
      )}
    >
      <div className="glass flex h-full flex-col overflow-hidden">
        <div
          className={cn(
            "flex h-16 items-center px-4",
            collapsed && "justify-center px-0",
          )}
        >
          <Logo collapsed={collapsed} />
        </div>
        <div className="mx-3 h-px bg-border" />
        <ScrollArea className="flex-1 py-4">
          <SidebarNav collapsed={collapsed} />
        </ScrollArea>
        <div className="mx-3 h-px bg-border" />
        <div
          className={cn(
            "flex items-center p-3",
            collapsed ? "justify-center" : "justify-end",
          )}
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={toggle}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="rounded-lg text-muted-foreground hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeft className="size-[18px]" />
            ) : (
              <PanelLeftClose className="size-[18px]" />
            )}
          </Button>
        </div>
      </div>
    </aside>
  );
}

"use client";

import { useSyncExternalStore } from "react";
import { PanelLeft, PanelLeftClose } from "lucide-react";
import { cn } from "@/lib/utils";
import { Logo } from "./Logo";
import { SidebarNav } from "./SidebarNav";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";

const STORAGE_KEY = "kazifarms-sidebar-collapsed";
const listeners = new Set<() => void>();

function getSnapshot() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function getServerSnapshot() {
  return false;
}

function subscribe(callback: () => void) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}

function setCollapsedStored(next: boolean) {
  try {
    localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
  } catch {}
  listeners.forEach((notify) => notify());
}

export function Sidebar() {
  // Sourced from localStorage rather than a cookie so the /app layout stays
  // free of request-time APIs and can be statically prefetched.
  const collapsed = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggle = () => setCollapsedStored(!collapsed);

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 transition-[width] duration-300 ease-out lg:block",
        collapsed ? "w-[92px]" : "w-[280px]",
      )}
    >
      {/* No card wrapper — the rail sits directly on the canvas so the active
          pill can run flush to the viewport edge. */}
      <div className="flex h-full flex-col overflow-hidden">
        <div
          className={cn(
            "flex h-[76px] shrink-0 items-center pr-4 pl-5",
            // pr-6/pl-0 mirrors the nav's inset so the mark centres on the
            // same column as the icons in the active pill.
            collapsed && "justify-center pr-6 pl-0",
          )}
        >
          <Logo collapsed={collapsed} />
        </div>
        {/* min-h-0 is load-bearing: a flex child defaults to min-height:auto,
            so without it this grows to fit the nav instead of scrolling, and
            pushes the collapse button off the bottom of the screen. */}
        <ScrollArea className="min-h-0 flex-1 py-5">
          <SidebarNav collapsed={collapsed} />
        </ScrollArea>
        <div
          className={cn(
            "flex shrink-0 items-center",
            collapsed
              ? "justify-center py-4 pr-6 pl-0"
              : "justify-end p-4",
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

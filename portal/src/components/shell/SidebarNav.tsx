"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { NAV_GROUPS } from "./nav-items";
import { useLabels } from "@/lib/i18n/labels";
import { useAuth } from "@/store/auth";
import { hasPermission } from "@/lib/rbac";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export function SidebarNav({
  collapsed = false,
  onNavigate,
}: {
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const { t } = useLabels();
  const activeRole = useAuth((s) => s.activeRole);

  const isActive = (href: string) =>
    href === "/app" ? pathname === "/app" : pathname.startsWith(href);

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter(
      (item) => !item.permission || hasPermission(activeRole, item.permission),
    ),
  })).filter((group) => group.items.length > 0);

  // Left edge stays flush in both states so the active pill keeps its shape
  // when collapsing; only the right inset changes.
  return (
    <nav className={cn("flex flex-col gap-6", collapsed ? "pr-6" : "pr-4")}>
      {visibleGroups.map((group) => (
        <div key={group.label} className="flex flex-col gap-1">
          {!collapsed && (
            <div className="rule-label pb-2 pl-5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/70">
              {t(group.label)}
            </div>
          )}
          {group.items.map((item) => {
            const active = isActive(item.href);
            const Icon = item.icon;
            const link = (
              <Link
                href={item.href}
                onClick={onNavigate}
                aria-current={active ? "page" : undefined}
                className={cn(
                  // Flush to the rail's left edge with a rounded right cap, so
                  // the active state reads as a tab pulled out of the canvas.
                  "group relative flex items-center gap-3.5 py-3 text-[15px] font-medium transition-colors",
                  collapsed
                    ? "justify-center rounded-r-full px-0"
                    : "rounded-r-full pr-4 pl-5",
                  active
                    ? "bg-sidebar-primary text-sidebar-primary-foreground"
                    : "text-foreground/75 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="size-[20px] shrink-0" strokeWidth={1.75} />
                {!collapsed && <span className="truncate">{t(item.label)}</span>}
              </Link>
            );

            return collapsed ? (
              <Tooltip key={item.href}>
                <TooltipTrigger asChild>{link}</TooltipTrigger>
                <TooltipContent side="right">{t(item.label)}</TooltipContent>
              </Tooltip>
            ) : (
              <div key={item.href}>{link}</div>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

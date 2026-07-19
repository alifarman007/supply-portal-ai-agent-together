"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Bell,
  BellOff,
  ArrowRight,
  CircleCheck,
  Info,
  ShieldAlert,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications } from "@/lib/query/hooks";
import { relativeTime } from "@/lib/format/date";
import { cn } from "@/lib/utils";
import type { SupplierNotification } from "@/lib/mock/types";

type NType = SupplierNotification["type"];

const META: Record<NType, { icon: LucideIcon; ring: string; text: string }> = {
  po_issued: { icon: Info, ring: "bg-info/10", text: "text-info" },
  invoice_approved: { icon: CircleCheck, ring: "bg-ok/10", text: "text-ok" },
  invoice_rejected: { icon: ShieldAlert, ring: "bg-danger/10", text: "text-danger" },
  payment_received: { icon: CircleCheck, ring: "bg-ok/10", text: "text-ok" },
  document_expiring: { icon: TriangleAlert, ring: "bg-warn/10", text: "text-warn" },
  po_acknowledged: { icon: CircleCheck, ring: "bg-ok/10", text: "text-ok" },
  grn_confirmed: { icon: CircleCheck, ring: "bg-ok/10", text: "text-ok" },
  tender_published: { icon: Info, ring: "bg-info/10", text: "text-info" },
  bid_clarification_requested: { icon: TriangleAlert, ring: "bg-warn/10", text: "text-warn" },
  bid_shortlisted: { icon: CircleCheck, ring: "bg-ok/10", text: "text-ok" },
  bid_awarded: { icon: CircleCheck, ring: "bg-ok/10", text: "text-ok" },
  bid_not_awarded: { icon: ShieldAlert, ring: "bg-danger/10", text: "text-danger" },
};

export function NotificationBell() {
  const { data } = useNotifications();
  const [open, setOpen] = useState(false);
  const items = data ?? [];
  const unread = items.filter((n) => !n.read).length;
  const preview = items.slice(0, 5);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative grid size-9 place-items-center rounded-xl text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
          aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ""}`}
        >
          <Bell className="size-[18px]" strokeWidth={1.75} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex size-4 items-center justify-center">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-danger/60" />
              <span className="relative flex size-4 items-center justify-center rounded-full bg-danger text-[10px] font-bold leading-none text-white ring-2 ring-background">
                {unread > 9 ? "9+" : unread}
              </span>
            </span>
          )}
        </button>
      </PopoverTrigger>

      <PopoverContent align="end" sideOffset={10} className="w-[360px] overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <span className="font-heading text-sm font-semibold text-foreground">
            Notifications
          </span>
          {unread > 0 && (
            <span className="rounded-full bg-danger/10 px-2 py-0.5 text-xs font-semibold text-danger">
              {unread} unread
            </span>
          )}
        </div>

        <ul className="max-h-[22rem] divide-y divide-border/60 overflow-y-auto">
          {preview.length === 0 ? (
            <li className="flex h-32 flex-col items-center justify-center gap-2 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
                <BellOff className="size-5" strokeWidth={1.75} />
              </span>
              <span className="text-sm text-muted-foreground">You&apos;re all caught up</span>
            </li>
          ) : (
            preview.map((n) => {
              const m = META[n.type] ?? META.po_issued;
              const Icon = m.icon;
              return (
                <li key={n.id}>
                  <Link
                    href="/app/notifications"
                    onClick={() => setOpen(false)}
                    className={cn(
                      "flex items-start gap-3 px-4 py-3 transition-colors hover:bg-muted/40",
                      !n.read && "bg-primary/[0.04]",
                    )}
                  >
                    <span
                      className={cn(
                        "mt-0.5 grid size-8 shrink-0 place-items-center rounded-xl",
                        m.ring,
                        m.text,
                      )}
                    >
                      <Icon className="size-4" strokeWidth={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">
                          {n.type.replace(/_/g, " ")}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          · {relativeTime(n.timestamp)}
                        </span>
                      </div>
                      <div
                        className={cn(
                          "mt-0.5 truncate text-xs",
                          n.read ? "font-medium text-foreground" : "font-semibold text-foreground",
                        )}
                      >
                        {n.title}
                      </div>
                      <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                        {n.body}
                      </div>
                    </div>
                    {!n.read && (
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary dark:bg-brand-cream" />
                    )}
                  </Link>
                </li>
              );
            })
          )}
        </ul>

        <div className="border-t border-border p-1.5">
          <Link
            href="/app/notifications"
            onClick={() => setOpen(false)}
            className="group inline-flex w-full items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-semibold text-primary transition-colors hover:bg-primary/5 dark:text-brand-cream"
          >
            View all notifications
            <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}

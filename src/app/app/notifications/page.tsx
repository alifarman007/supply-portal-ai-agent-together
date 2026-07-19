"use client";

import {
  CircleCheck,
  Info,
  ShieldAlert,
  TriangleAlert,
  CheckCheck,
  type LucideIcon,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useNotifications, useMarkNotificationRead, useMarkAllNotificationsRead } from "@/lib/query/hooks";
import { relativeTime, formatDate } from "@/lib/format/date";
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

function groupByDate(notifications: SupplierNotification[]) {
  const groups: Record<string, SupplierNotification[]> = {};
  for (const n of notifications) {
    const key = formatDate(n.timestamp);
    if (!groups[key]) groups[key] = [];
    groups[key].push(n);
  }
  return groups;
}

export default function NotificationsPage() {
  const { data: notifications, isLoading } = useNotifications();
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const unread = notifications?.filter((n) => !n.read).length ?? 0;
  const groups = groupByDate(notifications ?? []);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Notifications"
        subtitle={`${unread} unread notification${unread !== 1 ? "s" : ""}`}
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              className="gap-2"
              onClick={() => markAll.mutate()}
              disabled={markAll.isPending}
            >
              <CheckCheck className="size-4" /> Mark all read
            </Button>
          )
        }
      />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>
      ) : notifications?.length === 0 ? (
        <div className="glass flex flex-col items-center justify-center py-24 text-center">
          <CheckCheck className="size-10 text-ok mb-3" />
          <p className="font-semibold text-foreground">You&apos;re all caught up!</p>
          <p className="mt-1 text-sm text-muted-foreground">No notifications to show.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groups).map(([date, items]) => (
            <div key={date}>
              <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">{date}</h3>
              <div className="space-y-2">
                {items.map((n) => {
                  const m = META[n.type] ?? META.po_issued;
                  const Icon = m.icon;
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => !n.read && markRead.mutate(n.id)}
                      className={cn(
                        "glass w-full text-left transition-all hover:shadow-md",
                        !n.read && "ring-1 ring-primary/20 dark:ring-brand-cream/20",
                      )}
                    >
                      <div className="flex items-start gap-3 p-4">
                        <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", m.ring, m.text)}>
                          <Icon className="size-4" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn("text-sm font-semibold text-foreground", !n.read && "font-bold")}>
                              {n.title}
                            </span>
                            {!n.read && (
                              <span className="size-1.5 shrink-0 rounded-full bg-primary dark:bg-brand-cream" />
                            )}
                          </div>
                          <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
                        </div>
                        <span className="shrink-0 text-xs text-muted-foreground">{relativeTime(n.timestamp)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Filter, Plus } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useChallans } from "@/lib/query/hooks";
import { formatDate } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";
import type { DeliveryStatus } from "@/lib/mock/types";

const DELIVERY_STATUSES: { value: DeliveryStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "scheduled", label: "Scheduled" },
  { value: "in_transit", label: "In Transit" },
  { value: "delivered", label: "Delivered" },
  { value: "grn_confirmed", label: "GRN Confirmed" },
];

export default function DeliveriesPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DeliveryStatus | "all">("all");
  const canManageDeliveries = usePermission("manage_deliveries");

  const { data: challans, isLoading } = useChallans({ status, search });

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Deliveries"
        subtitle="Manage delivery challans and track shipment status"
        actions={
          canManageDeliveries && (
            <Button asChild className="gap-2 bg-brand-red text-white hover:bg-brand-red-600">
              <Link href="/app/deliveries/new">
                <Plus className="size-4" /> Create Challan
              </Link>
            </Button>
          )
        }
      />

      <div className="glass p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by challan # or PO…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={status} onValueChange={(v) => setStatus(v as DeliveryStatus | "all")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {DELIVERY_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Challan #</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">PO Ref</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Created</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Delivery Date</th>
                <th className="hidden px-4 py-3 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Items</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">GRN #</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-5 w-full rounded" />
                    </td>
                  </tr>
                ))
              ) : challans?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No delivery challans found.
                  </td>
                </tr>
              ) : (
                challans?.map((c) => (
                  <tr key={c.id} className="transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3 font-semibold text-foreground">{c.challanNumber}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{c.poNumber}</td>
                    <td className="tnum px-4 py-3 text-muted-foreground">{formatDate(c.createdAt)}</td>
                    <td className="tnum hidden px-4 py-3 text-muted-foreground md:table-cell">{formatDate(c.scheduledDeliveryDate)}</td>
                    <td className="hidden px-4 py-3 text-center text-muted-foreground sm:table-cell">{c.items.length}</td>
                    <td className="px-4 py-3"><StatusPill status={c.status} /></td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground lg:table-cell">
                      {c.grnNumber ?? "—"}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

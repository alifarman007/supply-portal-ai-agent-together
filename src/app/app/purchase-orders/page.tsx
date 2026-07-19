"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Filter } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePurchaseOrders } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import type { POStatus } from "@/lib/mock/types";

const PO_STATUSES: { value: POStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "issued", label: "Issued" },
  { value: "acknowledged", label: "Acknowledged" },
  { value: "partially_fulfilled", label: "Partially Fulfilled" },
  { value: "fulfilled", label: "Fulfilled" },
  { value: "cancelled", label: "Cancelled" },
];

export default function PurchaseOrdersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<POStatus | "all">("all");

  const { data: pos, isLoading } = usePurchaseOrders({ status, search });

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Purchase Orders"
        subtitle="View and acknowledge purchase orders from Kazi Farms Group"
      />

      {/* Filters */}
      <div className="glass p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by PO number or department…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={status} onValueChange={(v) => setStatus(v as POStatus | "all")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PO_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO Number</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issue Date</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Buyer Dept</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Items</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total (BDT)</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Delivery Due</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
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
              ) : pos?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No purchase orders found.
                  </td>
                </tr>
              ) : (
                pos?.map((po) => (
                  <tr
                    key={po.id}
                    className="cursor-pointer transition-colors hover:bg-muted/30"
                  >
                    <td className="px-4 py-3">
                      <Link href={`/app/purchase-orders/${po.id}`} className="font-semibold text-foreground hover:text-primary dark:hover:text-brand-cream">
                        {po.poNumber}
                      </Link>
                    </td>
                    <td className="tnum px-4 py-3 text-muted-foreground">{formatDate(po.issuedDate)}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{po.buyerDepartment}</td>
                    <td className="hidden px-4 py-3 text-center text-muted-foreground sm:table-cell">{po.items.length}</td>
                    <td className="tnum px-4 py-3 text-right font-semibold text-foreground">{formatBDT(po.grandTotal)}</td>
                    <td className="tnum hidden px-4 py-3 text-muted-foreground lg:table-cell">{formatDate(po.requiredDeliveryDate)}</td>
                    <td className="px-4 py-3">
                      <StatusPill status={po.status} />
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

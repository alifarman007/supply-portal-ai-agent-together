"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { ReportTable, type ReportColumn } from "@/components/common/ReportTable";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { usePurchaseOrders, useInvoices } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import type { Invoice, PurchaseOrder } from "@/lib/mock/types";

type PendingFilter = "all" | "pending" | "billed";

const FILTERS: { value: PendingFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "pending", label: "Pending bill" },
  { value: "billed", label: "Already billed" },
];

/** An invoice only counts as billed once it has actually been submitted. */
const BILLED = ["submitted", "under_review", "approved", "paid"];

interface BillableRow {
  po: PurchaseOrder;
  pending: boolean;
  pendingAmount: number;
}

export default function BillSubmissionPage() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<PendingFilter>("all");

  const { data: pos, isLoading } = usePurchaseOrders({ search });
  const { data: invoices } = useInvoices({});

  const rows: BillableRow[] = useMemo(() => {
    const billedPoIds = new Set(
      (invoices ?? []).filter((i: Invoice) => BILLED.includes(i.status)).map((i) => i.poId),
    );

    return (pos ?? [])
      // A draft order hasn't been issued and a cancelled one never will be, so
      // neither can be billed against.
      .filter((po) => po.status !== "draft" && po.status !== "cancelled")
      .map((po) => {
        const pending = !billedPoIds.has(po.id);
        return { po, pending, pendingAmount: pending ? po.grandTotal : 0 };
      })
      .filter((r) => filter === "all" || (filter === "pending" ? r.pending : !r.pending));
  }, [pos, invoices, filter]);

  const columns: ReportColumn<BillableRow>[] = [
    {
      key: "po",
      header: "PO",
      render: (r) => (
        <Link
          href={`/app/purchase-orders/${r.po.id}`}
          className="font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
        >
          {r.po.poNumber}
        </Link>
      ),
    },
    {
      key: "issued",
      header: "Issue Date",
      render: (r) => (
        <span className="tnum whitespace-nowrap">{formatDate(r.po.issuedDate)}</span>
      ),
    },
    {
      key: "value",
      header: "Total Purchase Value",
      cellClassName: "w-full min-w-[160px]",
      render: (r) => (
        <span className="tnum font-semibold whitespace-nowrap">
          {formatBDT(r.po.grandTotal)}
        </span>
      ),
    },
    {
      key: "pending",
      header: "Pending Bill",
      render: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            r.pending ? "bg-warn text-white" : "bg-muted-foreground text-white"
          }`}
        >
          {r.pending ? "Yes" : "No"}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Amount",
      render: (r) => (
        <span
          className={`tnum whitespace-nowrap ${
            r.pendingAmount > 0 ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {formatBDT(r.pendingAmount)}
        </span>
      ),
    },
    {
      key: "action",
      header: "Action",
      render: (r) => (
        <Button asChild size="sm" className="whitespace-nowrap">
          <Link href={`/app/bills/${r.po.id}`}>Submit Bill</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title="Bill Submission"
        subtitle="Submit bills against your delivered purchase orders"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by PO number…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl bg-card pl-10"
          />
        </div>
        <Select value={filter} onValueChange={(v) => setFilter(v as PendingFilter)}>
          <SelectTrigger className="h-11 rounded-xl bg-card sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {FILTERS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.po.id}
        loading={isLoading}
        stickyFirstColumn
        emptyLabel="No purchase orders available to bill against."
      />
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { ReportTable, type ReportColumn } from "@/components/common/ReportTable";
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
import { vdsAmount, tdsAmount } from "@/lib/format/tax";
import type { Invoice, POStatus, PurchaseOrder } from "@/lib/mock/types";

const PO_STATUSES: { value: POStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "issued", label: "Issued" },
  { value: "acknowledged", label: "Waiting for Delivery" },
  { value: "partially_fulfilled", label: "Partially Delivered" },
  { value: "fulfilled", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
];

/** The order's progress as the supplier experiences it. */
const ORDER_STATUS: Record<POStatus, string> = {
  draft: "draft",
  issued: "issued",
  acknowledged: "waiting_for_delivery",
  partially_fulfilled: "partially_delivered",
  fulfilled: "delivered",
  cancelled: "cancelled",
};

/** An invoice only counts as billed once it has actually been submitted. */
const BILLED = ["submitted", "under_review", "approved", "paid"];

interface OrderRow {
  po: PurchaseOrder;
  bills: Invoice[];
  billedAmount: number;
  paidAmount: number;
  dueAmount: number;
}

/** Plain number — these columns are dense enough without a symbol on each. */
const amount = (n: number) => formatBDT(n, { symbol: false });

export default function OrderInformationPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<POStatus | "all">("all");

  const { data: pos, isLoading } = usePurchaseOrders({ status, search });
  const { data: invoices } = useInvoices({});

  const rows: OrderRow[] = useMemo(() => {
    const byPo = new Map<string, Invoice[]>();
    for (const inv of invoices ?? []) {
      if (!BILLED.includes(inv.status)) continue;
      byPo.set(inv.poId, [...(byPo.get(inv.poId) ?? []), inv]);
    }

    return (pos ?? []).map((po) => {
      const bills = byPo.get(po.id) ?? [];
      const billedAmount = bills.reduce((s, i) => s + i.totalAmount, 0);
      const paidAmount = bills
        .filter((i) => i.status === "paid")
        .reduce((s, i) => s + i.totalAmount, 0);
      return {
        po,
        bills,
        billedAmount,
        paidAmount,
        // What is still owed on the order as a whole — an order with nothing
        // billed yet still has its full value outstanding.
        dueAmount: Math.max(0, po.grandTotal - paidAmount),
      };
    });
  }, [pos, invoices]);

  const columns: ReportColumn<OrderRow>[] = [
    {
      key: "po",
      header: "PO Number",
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
      key: "items",
      header: "Item Number",
      render: (r) => <span className="tnum">{r.po.items.length}</span>,
    },
    {
      key: "vds",
      header: "VDS Amount",
      render: (r) => (
        <span className="tnum whitespace-nowrap">
          {amount(vdsAmount(r.po.subtotal))}
        </span>
      ),
    },
    {
      key: "tds",
      header: "TDS Amount",
      render: (r) => (
        <span className="tnum whitespace-nowrap">
          {amount(tdsAmount(r.po.subtotal))}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total",
      render: (r) => (
        <span className="tnum font-semibold whitespace-nowrap">{amount(r.po.grandTotal)}</span>
      ),
    },
    {
      key: "delivery",
      header: "Expected Delivery Date",
      render: (r) => (
        <span className="tnum whitespace-nowrap">{formatDate(r.po.requiredDeliveryDate)}</span>
      ),
    },
    {
      key: "status",
      header: "Order Status",
      render: (r) => <StatusPill status={ORDER_STATUS[r.po.status]} variant="solid" />,
    },
    {
      key: "billed",
      header: "Bill Submitted Amount",
      render: (r) => <span className="tnum whitespace-nowrap">{amount(r.billedAmount)}</span>,
    },
    {
      key: "bills",
      header: "Bill Details",
      render: (r) =>
        r.bills.length === 0 ? (
          <span aria-label="No bill submitted" className="text-primary">
            —
          </span>
        ) : (
          <div className="flex flex-col gap-0.5">
            {r.bills.map((inv) => (
              <Link
                key={inv.id}
                href={`/app/invoices/${inv.id}`}
                className="font-medium whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
              >
                {inv.invoiceNumber}
              </Link>
            ))}
          </div>
        ),
    },
    {
      key: "paid",
      header: "Paid Amount",
      render: (r) => (
        // Green reads as "money received" — nothing received isn't good news.
        <span
          className={`tnum whitespace-nowrap ${
            r.paidAmount > 0 ? "text-ok" : "text-muted-foreground"
          }`}
        >
          {amount(r.paidAmount)}
        </span>
      ),
    },
    {
      key: "due",
      header: "Payment Due Amount",
      render: (r) => (
        <span
          className={`tnum font-semibold whitespace-nowrap ${
            r.dueAmount > 0 ? "text-foreground" : "text-muted-foreground"
          }`}
        >
          {amount(r.dueAmount)}
        </span>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title="Order Information"
        subtitle="View and acknowledge purchase orders from Kazi Farms Group"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by PO number or department…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl bg-card pl-10"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as POStatus | "all")}>
          <SelectTrigger className="h-11 rounded-xl bg-card sm:w-52">
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

      <ReportTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.po.id}
        loading={isLoading}
        stickyFirstColumn
        emptyLabel="No orders match your search."
      />
    </div>
  );
}

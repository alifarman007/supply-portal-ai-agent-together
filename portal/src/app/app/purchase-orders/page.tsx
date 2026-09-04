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
import { useLabels, type LabelKey } from "@/lib/i18n/labels";
import type { Invoice, POStatus, PurchaseOrder } from "@/lib/mock/types";

const PO_STATUSES: { value: POStatus | "all"; labelKey: LabelKey }[] = [
  { value: "all", labelKey: "all_statuses" },
  { value: "issued", labelKey: "issued" },
  { value: "acknowledged", labelKey: "waiting_for_delivery" },
  { value: "partially_fulfilled", labelKey: "partially_delivered" },
  { value: "fulfilled", labelKey: "delivered" },
  { value: "cancelled", labelKey: "cancelled" },
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
  const { t } = useLabels();
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
      // Prefer amounts the source already computed (real PO data carries
      // these); fall back to joining against the invoice list for mock data.
      const billedAmount = po.billedAmount ?? bills.reduce((s, i) => s + i.totalAmount, 0);
      const paidAmount =
        po.paidAmount ?? bills.filter((i) => i.status === "paid").reduce((s, i) => s + i.totalAmount, 0);
      return {
        po,
        bills,
        billedAmount,
        paidAmount,
        // What is still owed on the order as a whole — an order with nothing
        // billed yet still has its full value outstanding.
        dueAmount: po.dueAmount ?? Math.max(0, po.grandTotal - paidAmount),
      };
    });
  }, [pos, invoices]);

  const columns: ReportColumn<OrderRow>[] = [
    {
      key: "po",
      header: t("col_po_number"),
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
      header: t("col_issue_date"),
      render: (r) => (
        <span className="tnum whitespace-nowrap">{formatDate(r.po.issuedDate)}</span>
      ),
    },
    {
      key: "items",
      header: t("col_item_number"),
      render: (r) => <span className="tnum">{r.po.itemCount ?? r.po.items.length}</span>,
    },
    {
      key: "vds",
      header: t("col_vds_amount"),
      render: (r) => (
        <span className="tnum whitespace-nowrap">
          {amount(r.po.vdsAmount ?? vdsAmount(r.po.subtotal))}
        </span>
      ),
    },
    {
      key: "tds",
      header: t("col_tds_amount"),
      render: (r) => (
        <span className="tnum whitespace-nowrap">
          {amount(r.po.tdsAmount ?? tdsAmount(r.po.subtotal))}
        </span>
      ),
    },
    {
      key: "total",
      header: t("col_total"),
      render: (r) => (
        <span className="tnum font-semibold whitespace-nowrap">{amount(r.po.grandTotal)}</span>
      ),
    },
    {
      key: "delivery",
      header: t("col_expected_delivery"),
      render: (r) => (
        <span className="tnum whitespace-nowrap">{formatDate(r.po.requiredDeliveryDate)}</span>
      ),
    },
    {
      key: "status",
      header: t("col_order_status"),
      render: (r) => <StatusPill status={ORDER_STATUS[r.po.status]} variant="solid" />,
    },
    {
      key: "billed",
      header: t("col_bill_submitted_amount"),
      render: (r) => <span className="tnum whitespace-nowrap">{amount(r.billedAmount)}</span>,
    },
    {
      key: "bills",
      header: t("col_bill_details"),
      render: (r) =>
        r.bills.length === 0 ? (
          <span aria-label={t("no_bill_submitted")} className="text-primary">
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
      header: t("col_paid_amount"),
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
      header: t("col_due_amount"),
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
        title={t("nav_purchase_orders")}
        subtitle={t("po_subtitle")}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("po_search_ph")}
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
                {t(s.labelKey)}
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
        emptyLabel={t("po_empty")}
      />
    </div>
  );
}

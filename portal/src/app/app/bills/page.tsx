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
import { useLabels, type LabelKey } from "@/lib/i18n/labels";
import type { Invoice, PurchaseOrder } from "@/lib/mock/types";

type PendingFilter = "all" | "pending" | "billed";

const FILTERS: { value: PendingFilter; labelKey: LabelKey }[] = [
  { value: "all", labelKey: "all_statuses" },
  { value: "pending", labelKey: "pending_bill_filter" },
  { value: "billed", labelKey: "already_billed_filter" },
];

/** An invoice only counts as billed once it has actually been submitted. */
const BILLED = ["submitted", "under_review", "approved", "paid"];

interface BillableRow {
  po: PurchaseOrder;
  pending: boolean;
  pendingAmount: number;
}

export default function BillSubmissionPage() {
  const { t } = useLabels();
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
      header: t("col_po"),
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
      key: "value",
      header: t("col_total_purchase_value"),
      cellClassName: "w-full min-w-[160px]",
      render: (r) => (
        <span className="tnum font-semibold whitespace-nowrap">
          {formatBDT(r.po.grandTotal)}
        </span>
      ),
    },
    {
      key: "pending",
      header: t("col_pending_bill"),
      render: (r) => (
        <span
          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${
            r.pending ? "bg-warn text-white" : "bg-muted-foreground text-white"
          }`}
        >
          {r.pending ? t("yes") : t("no")}
        </span>
      ),
    },
    {
      key: "amount",
      header: t("col_amount"),
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
      header: t("col_action"),
      render: (r) => (
        <Button asChild size="sm" className="whitespace-nowrap">
          <Link href={`/app/bills/${r.po.id}`}>{t("submit_bill_btn")}</Link>
        </Button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title={t("nav_bill_submission")}
        subtitle={t("bill_subtitle")}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("bill_search_ph")}
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
                {t(f.labelKey)}
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
        emptyLabel={t("bill_empty")}
      />
    </div>
  );
}

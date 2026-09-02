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
import { useInvoices } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";
import { useLabels, type LabelKey } from "@/lib/i18n/labels";
import type { InvoiceStatus } from "@/lib/mock/types";

const INVOICE_STATUSES: { value: InvoiceStatus | "all"; labelKey: LabelKey }[] = [
  { value: "all", labelKey: "all_statuses" },
  { value: "draft", labelKey: "draft" },
  { value: "submitted", labelKey: "submitted" },
  { value: "under_review", labelKey: "under_review" },
  { value: "approved", labelKey: "approved" },
  { value: "paid", labelKey: "paid" },
  { value: "rejected", labelKey: "rejected" },
];

export default function InvoicesPage() {
  const { t } = useLabels();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<InvoiceStatus | "all">("all");
  const canManageInvoices = usePermission("manage_invoices");

  const { data: invoices, isLoading } = useInvoices({ status, search });

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title={t("nav_invoices")}
        subtitle={t("inv_subtitle")}
        actions={
          canManageInvoices && (
            <Button asChild className="gap-2 bg-brand-red text-white hover:bg-brand-red-600">
              <Link href="/app/invoices/new">
                <Plus className="size-4" /> {t("create_invoice")}
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
              placeholder={t("inv_search_ph")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={status} onValueChange={(v) => setStatus(v as InvoiceStatus | "all")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INVOICE_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{t(s.labelKey)}</SelectItem>
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_invoice_number")}</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">{t("col_po_ref")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("date_word")}</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">{t("col_due_date")}</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_total_bdt")}</th>
                <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">{t("col_vat")}</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_status")}</th>
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
              ) : invoices?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    {t("no_invoices_found")}
                  </td>
                </tr>
              ) : (
                invoices?.map((inv) => (
                  <tr key={inv.id} className="cursor-pointer transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/app/invoices/${inv.id}`} className="font-semibold text-foreground hover:text-primary dark:hover:text-brand-cream">
                        {inv.invoiceNumber}
                      </Link>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{inv.poNumber}</td>
                    <td className="tnum px-4 py-3 text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                    <td className="tnum hidden px-4 py-3 text-muted-foreground md:table-cell">{formatDate(inv.dueDate)}</td>
                    <td className="tnum px-4 py-3 text-right font-semibold text-foreground">{formatBDT(inv.totalAmount)}</td>
                    <td className="tnum hidden px-4 py-3 text-right text-muted-foreground lg:table-cell">{formatBDT(inv.vatAmount)}</td>
                    <td className="px-4 py-3"><StatusPill status={inv.status} /></td>
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

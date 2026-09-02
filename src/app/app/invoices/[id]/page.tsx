"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { useInvoice } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { useLabels, type LabelKey } from "@/lib/i18n/labels";

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useLabels();
  const { data: inv, isLoading } = useInvoice(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1680px] space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!inv) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">{t("inv_not_found")}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="size-4" /> {t("go_back")}
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {inv.invoiceNumber}
            <StatusPill status={inv.status} />
          </span>
        }
        subtitle={`${t("col_po_ref")}: ${inv.poNumber} · ${t("date_word")}: ${formatDate(inv.invoiceDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> {t("back")}
            </Button>
            <Button variant="outline" onClick={() => toast.info(t("toast_pdf_soon"))}>
              <Download className="size-4" /> {t("download_pdf")}
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title={t("invoice_details")}>
          <dl className="space-y-3 text-sm">
            {(
              [
                ["lbl_po_reference", inv.poNumber],
                ["lbl_invoice_date", formatDate(inv.invoiceDate)],
                ["lbl_due_date", formatDate(inv.dueDate)],
                inv.submittedAt ? ["lbl_submitted", formatDateTime(inv.submittedAt)] : null,
                inv.approvedBy ? ["lbl_approved_by", inv.approvedBy] : null,
                inv.approvedAt ? ["lbl_approved_at", formatDateTime(inv.approvedAt)] : null,
                inv.paidAt ? ["lbl_paid_at", formatDateTime(inv.paidAt)] : null,
                inv.paymentRef ? ["lbl_payment_ref", inv.paymentRef] : null,
                inv.rejectionReason ? ["lbl_rejection_reason", inv.rejectionReason] : null,
              ] satisfies (readonly [LabelKey, string] | null)[]
            )
              .filter((row) => row !== null)
              .map(([labelKey, value]) => (
                <div key={labelKey} className="flex gap-2">
                  <dt className="w-32 shrink-0 text-muted-foreground">{t(labelKey)}</dt>
                  <dd className={`font-medium ${labelKey === "lbl_rejection_reason" ? "text-danger" : "text-foreground"}`}>{value}</dd>
                </div>
              ))}
          </dl>
        </Widget>

        <Widget title={t("tax_breakdown")}>
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("lbl_subtotal")}</dt>
              <dd className="tnum font-semibold text-foreground">{formatBDT(inv.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("lbl_vat_15")}</dt>
              <dd className="tnum text-foreground">{formatBDT(inv.vatAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">{t("lbl_ait_3")}</dt>
              <dd className="tnum text-danger">-{formatBDT(inv.aitAmount)}</dd>
            </div>
            {inv.tdsAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("lbl_tds")}</dt>
                <dd className="tnum text-danger">-{formatBDT(inv.tdsAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-3 text-base">
              <dt className="font-bold text-foreground">{t("lbl_net_payable")}</dt>
              <dd className="tnum font-bold text-foreground">{formatBDT(inv.totalAmount)}</dd>
            </div>
          </dl>
        </Widget>
      </div>

      {/* Line Items */}
      <Widget title={`${t("line_items_lbl")} (${inv.items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_hash")}</th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_description")}</th>
                <th className="py-2 pr-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_unit")}</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_qty")}</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_unit_price")}</th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">{t("col_total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {inv.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-2.5 pr-4 text-muted-foreground">{idx + 1}</td>
                  <td className="py-2.5 pr-4 font-medium text-foreground">{item.description}</td>
                  <td className="py-2.5 pr-4 text-center text-muted-foreground">{item.unit}</td>
                  <td className="tnum py-2.5 pr-4 text-right text-foreground">{item.quantity.toLocaleString("en-IN")}</td>
                  <td className="tnum py-2.5 pr-4 text-right text-muted-foreground">{formatBDT(item.unitPrice)}</td>
                  <td className="tnum py-2.5 text-right font-semibold text-foreground">{formatBDT(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>

      {/* Timeline */}
      {inv.timeline.length > 0 && (
        <Widget title={t("approval_timeline")}>
          <ol className="relative border-l border-border pl-6 space-y-4">
            {inv.timeline.map((event, idx) => (
              <li key={idx} className="relative">
                <span className="absolute -left-[21px] top-0.5 flex size-3.5 items-center justify-center rounded-full bg-brand-red ring-2 ring-background" />
                <div className="flex items-center gap-2">
                  <StatusPill status={event.status} />
                  <span className="tnum text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                </div>
                {event.actor && (
                  <p className="mt-1 text-xs text-muted-foreground">{t("by_prefix")} {event.actor}</p>
                )}
                {event.note && (
                  <p className="mt-0.5 text-xs text-foreground">{event.note}</p>
                )}
              </li>
            ))}
          </ol>
        </Widget>
      )}
    </div>
  );
}

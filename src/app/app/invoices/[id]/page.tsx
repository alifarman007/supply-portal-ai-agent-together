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

export default function InvoiceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
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
        <p className="text-lg font-semibold text-foreground">Invoice not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="size-4" /> Go back
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
        subtitle={`PO: ${inv.poNumber} · Date: ${formatDate(inv.invoiceDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button variant="outline" onClick={() => toast.info("PDF download coming soon.")}>
              <Download className="size-4" /> Download PDF
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Invoice Details">
          <dl className="space-y-3 text-sm">
            {[
              ["PO Reference", inv.poNumber],
              ["Invoice Date", formatDate(inv.invoiceDate)],
              ["Due Date", formatDate(inv.dueDate)],
              inv.submittedAt ? ["Submitted", formatDateTime(inv.submittedAt)] : null,
              inv.approvedBy ? ["Approved By", inv.approvedBy] : null,
              inv.approvedAt ? ["Approved At", formatDateTime(inv.approvedAt)] : null,
              inv.paidAt ? ["Paid At", formatDateTime(inv.paidAt)] : null,
              inv.paymentRef ? ["Payment Ref", inv.paymentRef] : null,
              inv.rejectionReason ? ["Rejection Reason", inv.rejectionReason] : null,
            ]
              .filter((row): row is string[] => row !== null)
              .map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-32 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className={`font-medium ${label === "Rejection Reason" ? "text-danger" : "text-foreground"}`}>{value}</dd>
                </div>
              ))}
          </dl>
        </Widget>

        <Widget title="Tax Breakdown">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tnum font-semibold text-foreground">{formatBDT(inv.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT (15%)</dt>
              <dd className="tnum text-foreground">{formatBDT(inv.vatAmount)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">AIT (3%)</dt>
              <dd className="tnum text-danger">-{formatBDT(inv.aitAmount)}</dd>
            </div>
            {inv.tdsAmount > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">TDS</dt>
                <dd className="tnum text-danger">-{formatBDT(inv.tdsAmount)}</dd>
              </div>
            )}
            <div className="flex justify-between border-t border-border pt-3 text-base">
              <dt className="font-bold text-foreground">Net Payable</dt>
              <dd className="tnum font-bold text-foreground">{formatBDT(inv.totalAmount)}</dd>
            </div>
          </dl>
        </Widget>
      </div>

      {/* Line Items */}
      <Widget title={`Line Items (${inv.items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                <th className="py-2 pr-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
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
        <Widget title="Approval Timeline">
          <ol className="relative border-l border-border pl-6 space-y-4">
            {inv.timeline.map((event, idx) => (
              <li key={idx} className="relative">
                <span className="absolute -left-[21px] top-0.5 flex size-3.5 items-center justify-center rounded-full bg-brand-red ring-2 ring-background" />
                <div className="flex items-center gap-2">
                  <StatusPill status={event.status} />
                  <span className="tnum text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                </div>
                {event.actor && (
                  <p className="mt-1 text-xs text-muted-foreground">by {event.actor}</p>
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

"use client";

import { use } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { usePurchaseOrder, useAcknowledgePO } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";

export default function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const acknowledge = useAcknowledgePO();
  const canAcknowledge = usePermission("acknowledge_po");

  const onAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync(id);
      toast.success("PO acknowledged", { description: `${po?.poNumber} has been acknowledged.` });
    } catch {
      toast.error("Failed to acknowledge PO");
    }
  };

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

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">Purchase order not found</p>
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
            {po.poNumber}
            <StatusPill status={po.status} />
          </span>
        }
        subtitle={`Issued: ${formatDate(po.issuedDate)} · Due: ${formatDate(po.requiredDeliveryDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {po.status === "issued" && canAcknowledge && (
              <Button
                onClick={onAcknowledge}
                disabled={acknowledge.isPending}
                className="gap-2 bg-brand-red text-white hover:bg-brand-red-600"
              >
                {acknowledge.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle className="size-4" />
                )}
                Acknowledge PO
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-4 lg:grid-cols-2">
        {/* PO Metadata */}
        <Widget title="Order Details">
          <dl className="space-y-3 text-sm">
            {[
              ["Buyer Department", po.buyerDepartment],
              ["Contact Person", po.buyerContactName],
              ["Contact Email", po.buyerContactEmail],
              ["Delivery Address", po.deliveryAddress],
              ["Issue Date", formatDate(po.issuedDate)],
              ["Required Delivery", formatDate(po.requiredDeliveryDate)],
              po.acknowledgedAt ? ["Acknowledged At", formatDateTime(po.acknowledgedAt)] : null,
            ]
              .filter((row): row is string[] => row !== null)
              .map(([label, value]) => (
                <div key={label} className="flex gap-2">
                  <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
                  <dd className="font-medium text-foreground">{value}</dd>
                </div>
              ))}
          </dl>
        </Widget>

        {/* Financials */}
        <Widget title="Financial Summary">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tnum font-semibold text-foreground">{formatBDT(po.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT (15%)</dt>
              <dd className="tnum text-foreground">{formatBDT(po.vatAmount)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base">
              <dt className="font-bold text-foreground">Grand Total</dt>
              <dd className="tnum font-bold text-foreground">{formatBDT(po.grandTotal)}</dd>
            </div>
          </dl>
          {po.notes && (
            <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold">Notes: </span>{po.notes}
            </div>
          )}
        </Widget>
      </div>

      {/* Line Items */}
      <Widget title={`Line Items (${po.items.length})`}>
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
              {po.items.map((item, idx) => (
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
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={5} className="py-2.5 pr-4 text-right text-sm font-semibold text-muted-foreground">Subtotal</td>
                <td className="tnum py-2.5 text-right font-bold text-foreground">{formatBDT(po.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Widget>

      {/* Terms */}
      {po.termsAndConditions && (
        <Widget title="Terms & Conditions">
          <p className="text-sm leading-relaxed text-muted-foreground">{po.termsAndConditions}</p>
        </Widget>
      )}
    </div>
  );
}

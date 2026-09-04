"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Field, ValueChip } from "@/components/common/DetailField";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  usePurchaseOrder,
  useAcknowledgePO,
  useInvoices,
  usePayments,
  useSupplierProfile,
} from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { vdsAmount, tdsAmount, VDS_RATE, TDS_RATE } from "@/lib/format/tax";
import { usePermission } from "@/lib/rbac";
import { useLabels } from "@/lib/i18n/labels";
import type { Invoice, Payment, POStatus } from "@/lib/mock/types";

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

interface BillRow {
  invoice: Invoice;
  payments: Payment[];
  paidAmount: number;
  status: string;
}

export default function PODetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useLabels();
  const { data: po, isLoading } = usePurchaseOrder(id);
  const { data: invoices } = useInvoices({});
  const { data: payments } = usePayments({});
  const { data: profile } = useSupplierProfile();
  const acknowledge = useAcknowledgePO();
  const canAcknowledge = usePermission("acknowledge_po");

  const bills: BillRow[] = useMemo(() => {
    if (!po) return [];
    return (invoices ?? [])
      .filter((inv) => inv.poId === po.id && BILLED.includes(inv.status))
      .map((invoice) => {
        const matched = (payments ?? []).filter((p) => p.invoiceId === invoice.id);
        return {
          invoice,
          payments: matched,
          paidAmount: matched.reduce((s, p) => s + p.netAmountPaid, 0),
          // The invoice's own status is authoritative for settlement. A
          // payment's grossAmount is the invoice subtotal, not its total —
          // VAT and AIT are withheld at source — so comparing the two would
          // mark every fully settled invoice as partially paid.
          status:
            invoice.status === "paid"
              ? "paid"
              : matched.length > 0
                ? "partially_paid"
                : "unpaid",
        };
      });
  }, [po, invoices, payments]);

  const onAcknowledge = async () => {
    try {
      await acknowledge.mutateAsync(id);
      toast.success(t("toast_order_acknowledged"), {
        description: `${po?.poNumber} ${t("toast_order_acknowledged_desc")}`,
      });
    } catch {
      toast.error(t("toast_ack_failed"));
    }
  };

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1680px] space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">{t("po_not_found")}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="size-4" /> {t("go_back")}
        </Button>
      </div>
    );
  }

  const vds = po.vdsAmount ?? vdsAmount(po.subtotal);
  const tds = po.tdsAmount ?? tdsAmount(po.subtotal);
  const terms = po.termsAndConditions.split("\n").filter(Boolean);

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {po.poNumber}
            <StatusPill status={ORDER_STATUS[po.status]} variant="solid" />
          </span>
        }
        subtitle={`${t("issued_colon")}: ${formatDate(po.issuedDate)}  ·  ${t("delivery_due_colon")}: ${formatDate(po.requiredDeliveryDate)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> {t("back_to_orders")}
            </Button>
            {po.status === "issued" && canAcknowledge && (
              <Button onClick={onAcknowledge} disabled={acknowledge.isPending} className="gap-2">
                {acknowledge.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <CheckCircle className="size-4" />
                )}
                {t("acknowledge_order")}
              </Button>
            )}
          </div>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Widget title={t("order_details")} className="lg:col-span-2">
          <dl className="grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label={t("lbl_cost_center")} value={po.buyerDepartment} />
            <Field label={t("lbl_bin_number")} value={profile?.binNumber ?? "—"} />
            <Field label={t("lbl_contact_person")} value={po.buyerContactName} />
            <Field label={t("lbl_contact_email")} value={po.buyerContactEmail} />
            <Field label={t("lbl_delivery_address")} value={po.deliveryAddress} />
            <Field label={t("col_issue_date")} value={formatDate(po.issuedDate)} />
            <Field label={t("lbl_required_delivery")} value={formatDate(po.requiredDeliveryDate)} />
            {po.acknowledgedAt && (
              <Field label={t("lbl_acknowledged_at")} value={formatDateTime(po.acknowledgedAt)} />
            )}
          </dl>
          {po.notes && (
            <div className="mt-5 rounded-lg bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{t("notes_colon")}: </span>
              {po.notes}
            </div>
          )}
        </Widget>

        <Widget title={t("financial_summary")}>
          <dl className="space-y-3 text-sm">
            <Line label={t("lbl_subtotal")} value={formatBDT(po.subtotal)} />
            <Line label={t("lbl_vat_15")} value={formatBDT(po.vatAmount)} />
            <Line
              label={t("lbl_grand_total")}
              value={formatBDT(po.grandTotal)}
              className="border-t border-border pt-3 font-bold text-foreground"
            />

            {/* Withheld by the buyer at settlement, so they reduce the payout
                rather than adding to the order value. */}
            <div className="pt-2 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
              {t("deducted_at_source")}
            </div>
            <Line
              label={`${t("col_vds_amount")} (${VDS_RATE * 100}%)`}
              value={`− ${formatBDT(vds)}`}
              valueClassName="text-warn"
            />
            <Line
              label={`${t("col_tds_amount")} (${TDS_RATE * 100}%)`}
              value={`− ${formatBDT(tds)}`}
              valueClassName="text-warn"
            />
            <Line
              label={t("lbl_net_payable")}
              value={formatBDT(po.grandTotal - vds - tds)}
              className="border-t border-border pt-3 font-bold text-foreground"
              valueClassName="text-ok"
            />
          </dl>
        </Widget>
      </div>

      {/* Body bleeds to the card edges so the header band spans the full width. */}
      <Widget
        title={`${t("line_items_lbl")} (${po.items.length})`}
        className="overflow-hidden"
        bodyClassName="-mx-6 -mb-6"
      >
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color-mix(in_oklab,var(--brand-yellow)_22%,transparent)] text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/70 uppercase">
                <th scope="col" className="py-3.5 pr-4 pl-6 text-left">{t("col_hash")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_item_name")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_item_code")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_vds")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_tds")}</th>
                <th scope="col" className="w-full min-w-[15rem] py-3.5 pr-4 text-left">{t("col_description")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_unit")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_qty")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_unit_price")}</th>
                <th scope="col" className="py-3.5 pr-6 text-right">{t("col_total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {po.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-4 pr-4 pl-6 align-middle text-muted-foreground">{idx + 1}</td>
                  <td className="py-4 pr-4 align-middle font-medium whitespace-nowrap text-foreground">
                    {item.itemName ?? item.description}
                  </td>
                  <td className="tnum py-4 pr-4 align-middle whitespace-nowrap text-muted-foreground">
                    {item.itemCode ?? "—"}
                  </td>
                  <td className="tnum py-4 pr-4 align-middle whitespace-nowrap text-warn">
                    {formatBDT(item.vdsAmount ?? vdsAmount(item.totalPrice))}
                  </td>
                  <td className="tnum py-4 pr-4 align-middle whitespace-nowrap text-warn">
                    {formatBDT(item.tdsAmount ?? tdsAmount(item.totalPrice))}
                  </td>
                  <td className="py-4 pr-4 align-middle text-muted-foreground">
                    {item.specification ?? item.description}
                  </td>
                  <td className="py-4 pr-4 align-middle whitespace-nowrap text-muted-foreground">
                    {item.unit}
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <ValueChip>{item.quantity.toLocaleString("en-IN")}</ValueChip>
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <ValueChip>{formatBDT(item.unitPrice, { decimals: 2 })}</ValueChip>
                  </td>
                  <td className="tnum py-4 pr-6 text-right align-middle font-semibold whitespace-nowrap text-foreground">
                    {formatBDT(item.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-6 border-t border-border px-6 py-4">
          <span className="text-sm font-medium text-muted-foreground">{t("lbl_subtotal")}</span>
          <span className="tnum font-heading text-lg font-bold text-foreground">
            {formatBDT(po.subtotal)}
          </span>
        </div>
      </Widget>

      <Widget
        title={`${t("submitted_bill_details")} (${bills.length})`}
        className="overflow-hidden"
        bodyClassName="-mx-6 -mb-6"
      >
        {bills.length === 0 ? (
          <p className="px-6 pb-6 text-sm text-muted-foreground">
            {t("no_bill_yet")}
          </p>
        ) : (
          <div className="table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[color-mix(in_oklab,var(--brand-yellow)_22%,transparent)] text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/70 uppercase">
                  <th scope="col" className="py-3.5 pr-4 pl-6 text-left">{t("col_bill_invoice_number")}</th>
                  <th scope="col" className="py-3.5 pr-4 text-left">{t("date_word")}</th>
                  <th scope="col" className="py-3.5 pr-4 text-left">{t("col_is_vat_challan")}</th>
                  <th scope="col" className="py-3.5 pr-4 text-left">{t("col_bill_invoice_amount")}</th>
                  <th scope="col" className="py-3.5 pr-4 text-left">{t("col_payment_status")}</th>
                  <th scope="col" className="w-full min-w-[14rem] py-3.5 pr-6 text-left">{t("col_other_information")}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {bills.map((bill) => (
                  <tr key={bill.invoice.id} className="align-top">
                    <td className="py-4 pr-4 pl-6">
                      <Link
                        href={`/app/invoices/${bill.invoice.id}`}
                        className="font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
                      >
                        {bill.invoice.invoiceNumber}
                      </Link>
                    </td>
                    <td className="tnum py-4 pr-4 whitespace-nowrap text-muted-foreground">
                      {formatDate(bill.invoice.invoiceDate)}
                    </td>
                    <td className="py-4 pr-4">
                      {/* A Mushak 6.3 challan is one that charges VAT. */}
                      <VatChallanMark charged={bill.invoice.vatAmount > 0} />
                    </td>
                    <td className="tnum py-4 pr-4 font-semibold whitespace-nowrap text-foreground">
                      {formatBDT(bill.invoice.totalAmount)}
                    </td>
                    <td className="py-4 pr-4">
                      <StatusPill status={bill.status} variant="solid" />
                    </td>
                    <td className="py-4 pr-6 text-xs leading-relaxed text-muted-foreground">
                      {bill.payments.length === 0 ? (
                        <span>{t("awaiting_payment_advice")}</span>
                      ) : (
                        bill.payments.map((p) => (
                          <div key={p.id} className="not-first:mt-2">
                            <div>{t("bank_name_colon")}: {p.bankName}</div>
                            <div>{t("transfer_ref_colon")}: {p.bankTransferRef}</div>
                            <div>{t("date_word")}: {formatDate(p.paymentDate)}</div>
                            <div>{t("amount_colon")}: {formatBDT(p.netAmountPaid)}</div>
                          </div>
                        ))
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Widget>

      {terms.length > 0 && (
        <Widget title={t("terms_conditions")}>
          <ol className="space-y-3 text-sm">
            {terms.map((line, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum shrink-0 font-semibold text-primary">{i + 1}.</span>
                {/* The stored terms are already numbered, so strip the prefix
                    rather than render "1. 1. Payment terms…". */}
                <span className="text-muted-foreground">{line.replace(/^\d+\.\s*/, "")}</span>
              </li>
            ))}
          </ol>
        </Widget>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  className = "",
  valueClassName = "",
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tnum whitespace-nowrap ${valueClassName}`}>{value}</dd>
    </div>
  );
}

/** Checkbox-style read-only mark, matching the design's tick column. */
function VatChallanMark({ charged }: { charged: boolean }) {
  const { t } = useLabels();
  return (
    <span
      role="img"
      aria-label={charged ? t("vat_challan_label") : t("not_vat_challan_label")}
      className={`flex size-5 items-center justify-center rounded border ${
        charged ? "border-primary bg-primary text-white" : "border-input"
      }`}
    >
      {charged && <Check className="size-3.5" strokeWidth={3} />}
    </span>
  );
}

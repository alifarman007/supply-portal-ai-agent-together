"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, Paperclip, Banknote } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { ReportTable, type ReportColumn } from "@/components/common/ReportTable";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePayments, useInvoices, usePurchaseOrders } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import { useLabels } from "@/lib/i18n/labels";
import type { Invoice, PurchaseOrder } from "@/lib/mock/types";
import { supplierProfile } from "@/lib/mock/db";
import { RecordPaymentDialog } from "@/components/payments/RecordPaymentDialog";

/**
 * Whether to show the "Record payment" action.
 *
 * Cosmetic only, exactly like NEXT_PUBLIC_BILLCHECK_INTERNAL beside it: the real
 * control is server-side in /api/idempiere/payment, which 404s unless
 * BILLCHECK_INTERNAL is set. Hiding a button is not access control — this portal
 * has no authentication and its roles are picked from a menu.
 */
const SHOW_RECORD_PAYMENT = process.env.NEXT_PUBLIC_BILLCHECK_INTERNAL === "true";

/** A bill only counts as billed once it has actually been submitted. */
const BILLED = ["submitted", "under_review", "approved", "paid"];

/**
 * Seed data has no real VAT challan flag on most bills, so this fills in a
 * stable, deterministic mix (~60% checked) from the bill id — random-looking
 * but consistent across re-renders, unlike Math.random().
 */
function hashToBool(id: string): boolean {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) | 0;
  return Math.abs(hash) % 10 < 6;
}

interface BilledPoRow {
  po: PurchaseOrder;
  bills: Invoice[];
  totalAmount: number;
  submittedDate: string;
  vatChallanSubmitted: boolean;
}

export default function PaymentsPage() {
  const { t } = useLabels();
  const [search, setSearch] = useState("");
  const [recordingPayment, setRecordingPayment] = useState(false);
  const { data: payments, isLoading: paymentsLoading } = usePayments({});
  const { data: invoices, isLoading: invoicesLoading } = useInvoices({});
  const { data: pos, isLoading: posLoading } = usePurchaseOrders({});

  const isLoading = paymentsLoading || invoicesLoading || posLoading;

  const totalReceived = payments?.reduce((s, p) => s + p.netAmountPaid, 0) ?? 0;
  const totalDeductions = payments?.reduce((s, p) => s + p.vatDeductedAtSource + p.aitDeduction + p.tdsDeduction, 0) ?? 0;
  const totalGross = payments?.reduce((s, p) => s + p.grossAmount, 0) ?? 0;

  const rows: BilledPoRow[] = useMemo(() => {
    const poById = new Map((pos ?? []).map((po) => [po.id, po]));
    const billsByPo = new Map<string, Invoice[]>();
    for (const inv of invoices ?? []) {
      if (!BILLED.includes(inv.status)) continue;
      const list = billsByPo.get(inv.poId) ?? [];
      list.push(inv);
      billsByPo.set(inv.poId, list);
    }

    return Array.from(billsByPo.entries())
      .map(([poId, bills]) => {
        const po = poById.get(poId);
        if (!po) return null;
        const sorted = [...bills].sort(
          (a, b) => new Date(b.submittedAt ?? b.invoiceDate).getTime() - new Date(a.submittedAt ?? a.invoiceDate).getTime(),
        );
        return {
          po,
          bills: sorted,
          totalAmount: bills.reduce((s, b) => s + b.totalAmount, 0),
          submittedDate: sorted[0].submittedAt ?? sorted[0].invoiceDate,
          vatChallanSubmitted: sorted.some(
            (b) =>
              (b.timeline[0]?.note ?? "").toLowerCase().includes("confirmed as submitted") ||
              hashToBool(b.id),
          ),
        };
      })
      .filter((r): r is BilledPoRow => r !== null)
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.po.poNumber.toLowerCase().includes(q) ||
          r.bills.some((b) => b.invoiceNumber.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => new Date(b.submittedDate).getTime() - new Date(a.submittedDate).getTime());
  }, [pos, invoices, search]);

  const columns: ReportColumn<BilledPoRow>[] = [
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
      key: "poDate",
      header: t("col_po_date"),
      render: (r) => <span className="tnum whitespace-nowrap">{formatDate(r.po.issuedDate)}</span>,
    },
    {
      key: "poAmount",
      header: t("col_po_amount"),
      render: (r) => <span className="tnum whitespace-nowrap">{formatBDT(r.po.grandTotal)}</span>,
    },
    {
      key: "bill",
      header: t("col_bill_number"),
      cellClassName: "min-w-[160px]",
      render: (r) => (
        <div className="flex flex-col gap-1">
          {r.bills.map((b) => (
            <Link
              key={b.id}
              href={`/app/bills/${r.po.id}`}
              className="font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
            >
              {b.invoiceNumber.replace(/^INV/, "BILL")}
            </Link>
          ))}
        </div>
      ),
    },
    {
      key: "submitted",
      header: t("col_submitted_date"),
      render: (r) => <span className="tnum whitespace-nowrap">{formatDate(r.submittedDate)}</span>,
    },
    {
      key: "vatChallan",
      header: t("col_vat_challan"),
      render: (r) => <Checkbox checked={r.vatChallanSubmitted} disabled />,
    },
    {
      key: "totalAmount",
      header: t("col_total_amount"),
      render: (r) => <span className="tnum font-semibold whitespace-nowrap">{formatBDT(r.totalAmount)}</span>,
    },
    {
      key: "attachment",
      header: t("col_attachment"),
      render: () => (
        <button
          type="button"
          onClick={() => toast.info(t("toast_attachment_soon"))}
          className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
        >
          <Paperclip className="size-3.5" /> {t("view_file_btn")}
        </button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title={t("payment_history_title")}
        subtitle={t("payment_subtitle")}
        actions={
          <div className="flex items-center gap-2">
            {SHOW_RECORD_PAYMENT && (
              <Button onClick={() => setRecordingPayment(true)}>
                <Banknote className="size-4" /> {t("pay_record_action")}
              </Button>
            )}
            <Button variant="outline" onClick={() => toast.info(t("toast_csv_soon"))}>
              <Download className="size-4" /> {t("export_btn")}
            </Button>
          </div>
        }
      />

      <RecordPaymentDialog
        open={recordingPayment}
        onOpenChange={setRecordingPayment}
        defaults={{
          // The supplier's own bank, from the profile rather than from a payment
          // record — those store the account number MASKED ("****4521"), and a
          // mask must never reach the ERP.
          bankName: supplierProfile.bankName,
          bankAcctNo: supplierProfile.accountNumber,
        }}
      />

      {/* Summary Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {(
          [
            { labelKey: "total_gross", value: totalGross, color: "text-foreground" },
            { labelKey: "total_deductions", value: totalDeductions, color: "text-danger" },
            { labelKey: "net_received", value: totalReceived, color: "text-ok" },
          ] as const
        ).map(({ labelKey, value, color }) => (
          <div key={labelKey} className="glass p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t(labelKey)}</div>
            <div className={`tnum mt-1 text-xl font-bold ${color}`}>
              {paymentsLoading ? "—" : formatBDT(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="glass p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("payment_search_ph")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <ReportTable
        columns={columns}
        rows={rows}
        getRowKey={(r) => r.po.id}
        loading={isLoading}
        emptyLabel={t("payment_empty")}
      />
    </div>
  );
}

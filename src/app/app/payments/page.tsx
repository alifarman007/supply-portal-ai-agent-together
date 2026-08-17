"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search, Download, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { ReportTable, type ReportColumn } from "@/components/common/ReportTable";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePayments, useInvoices, usePurchaseOrders } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import type { Invoice, PurchaseOrder } from "@/lib/mock/types";

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
  const [search, setSearch] = useState("");
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
      key: "poDate",
      header: "PO Date",
      render: (r) => <span className="tnum whitespace-nowrap">{formatDate(r.po.issuedDate)}</span>,
    },
    {
      key: "poAmount",
      header: "PO Amount",
      render: (r) => <span className="tnum whitespace-nowrap">{formatBDT(r.po.grandTotal)}</span>,
    },
    {
      key: "bill",
      header: "Bill Number",
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
      header: "Submitted Date",
      render: (r) => <span className="tnum whitespace-nowrap">{formatDate(r.submittedDate)}</span>,
    },
    {
      key: "vatChallan",
      header: "VAT Challan",
      render: (r) => <Checkbox checked={r.vatChallanSubmitted} disabled />,
    },
    {
      key: "totalAmount",
      header: "Total Amount",
      render: (r) => <span className="tnum font-semibold whitespace-nowrap">{formatBDT(r.totalAmount)}</span>,
    },
    {
      key: "attachment",
      header: "Attachment",
      render: () => (
        <button
          type="button"
          onClick={() => toast.info("Attachment preview coming soon.")}
          className="inline-flex items-center gap-1.5 font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
        >
          <Paperclip className="size-3.5" /> View File
        </button>
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Payment History"
        subtitle="Track all payments received from Kazi Farms Group"
        actions={
          <Button variant="outline" onClick={() => toast.info("CSV export coming soon.")}>
            <Download className="size-4" /> Export
          </Button>
        }
      />

      {/* Summary Bar */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[
          { label: "Total Gross", value: totalGross, color: "text-foreground" },
          { label: "Total Deductions", value: totalDeductions, color: "text-danger" },
          { label: "Net Received", value: totalReceived, color: "text-ok" },
        ].map(({ label, value, color }) => (
          <div key={label} className="glass p-4">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
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
            placeholder="Search by PO or bill number…"
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
        emptyLabel="No billed purchase orders found."
      />
    </div>
  );
}

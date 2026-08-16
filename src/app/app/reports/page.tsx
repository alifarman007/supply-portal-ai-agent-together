"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { StatusPill } from "@/components/common/StatusPill";
import {
  ReportTable,
  downloadReportCsv,
  type ReportColumn,
} from "@/components/common/ReportTable";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useInvoices, usePayments, usePurchaseOrders } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import type { Invoice, Payment, PurchaseOrder } from "@/lib/mock/types";

/** Reports are cut against period end rather than "now" so totals stay stable. */
const PERIOD_END = new Date("2026-06-30");

type ReceivableRow = Invoice & { displayStatus: string };

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("receivables");
  const { data: invoices } = useInvoices({});
  const { data: payments } = usePayments({});
  const { data: pos } = usePurchaseOrders({});

  const receivables: ReceivableRow[] = useMemo(
    () =>
      (invoices ?? [])
        // Only invoices actually awaiting settlement. Drafts aren't billed yet
        // and rejected ones need resubmission, so neither is a receivable —
        // same set the dashboard's Due Payment total is built from.
        .filter((inv) => ["submitted", "under_review", "approved"].includes(inv.status))
        .map((inv) => ({
          ...inv,
          // Past due outranks the workflow status — that's what the report is for.
          displayStatus:
            new Date(inv.dueDate) < PERIOD_END ? "overdue" : inv.status,
        })),
    [invoices],
  );

  const totals = useMemo(
    () =>
      (payments ?? []).reduce(
        (acc, p) => ({
          gross: acc.gross + p.grossAmount,
          vat: acc.vat + p.vatDeductedAtSource,
          ait: acc.ait + p.aitDeduction,
          tds: acc.tds + p.tdsDeduction,
          net: acc.net + p.netAmountPaid,
        }),
        { gross: 0, vat: 0, ait: 0, tds: 0, net: 0 },
      ),
    [payments],
  );

  const outstandingTotal = receivables.reduce((s, r) => s + r.totalAmount, 0);

  const receivableCols: ReportColumn<ReceivableRow>[] = [
    {
      key: "invoice",
      header: "Invoice #",
      render: (r) => (
        <Link
          href={`/app/invoices/${r.id}`}
          className="font-semibold text-primary underline underline-offset-4 hover:opacity-80"
        >
          {r.invoiceNumber}
        </Link>
      ),
      csv: (r) => r.invoiceNumber,
    },
    {
      key: "date",
      header: "Date",
      render: (r) => <span className="tnum">{formatDate(r.invoiceDate)}</span>,
      csv: (r) => r.invoiceDate.slice(0, 10),
    },
    {
      key: "po",
      header: "PO Ref",
      render: (r) => <span className="text-muted-foreground">{r.poNumber}</span>,
      csv: (r) => r.poNumber,
    },
    {
      key: "amount",
      header: "Amount (BDT)",
      render: (r) => <span className="tnum font-semibold">{formatBDT(r.totalAmount)}</span>,
      csv: (r) => r.totalAmount,
    },
    {
      key: "status",
      header: "Status",
      render: (r) => <StatusPill status={r.displayStatus} variant="solid" />,
      csv: (r) => r.displayStatus,
    },
  ];

  const paymentCols: ReportColumn<Payment>[] = [
    {
      key: "date",
      header: "Date",
      render: (p) => <span className="tnum">{formatDate(p.paymentDate)}</span>,
      csv: (p) => p.paymentDate.slice(0, 10),
    },
    {
      key: "invoice",
      header: "Invoice Ref",
      render: (p) => <span className="font-semibold">{p.invoiceNumber}</span>,
      csv: (p) => p.invoiceNumber,
    },
    {
      key: "gross",
      header: "Gross (BDT)",
      align: "right",
      render: (p) => <span className="tnum">{formatBDT(p.grossAmount)}</span>,
      csv: (p) => p.grossAmount,
    },
    {
      key: "vat",
      header: "VAT",
      align: "right",
      render: (p) => <span className="tnum text-danger">-{formatBDT(p.vatDeductedAtSource)}</span>,
      csv: (p) => p.vatDeductedAtSource,
    },
    {
      key: "ait",
      header: "AIT",
      align: "right",
      render: (p) => <span className="tnum text-danger">-{formatBDT(p.aitDeduction)}</span>,
      csv: (p) => p.aitDeduction,
    },
    {
      key: "net",
      header: "Net Paid",
      align: "right",
      render: (p) => <span className="tnum font-bold text-ok">{formatBDT(p.netAmountPaid)}</span>,
      csv: (p) => p.netAmountPaid,
    },
  ];

  const poCols: ReportColumn<PurchaseOrder>[] = [
    {
      key: "po",
      header: "PO Number",
      render: (po) => (
        <Link
          href={`/app/purchase-orders/${po.id}`}
          className="font-semibold text-primary underline underline-offset-4 hover:opacity-80"
        >
          {po.poNumber}
        </Link>
      ),
      csv: (po) => po.poNumber,
    },
    {
      key: "dept",
      header: "Buyer Dept",
      render: (po) => <span className="text-muted-foreground">{po.buyerDepartment}</span>,
      csv: (po) => po.buyerDepartment,
    },
    {
      key: "issued",
      header: "Issue Date",
      render: (po) => <span className="tnum">{formatDate(po.issuedDate)}</span>,
      csv: (po) => po.issuedDate.slice(0, 10),
    },
    {
      key: "value",
      header: "Value (BDT)",
      align: "right",
      render: (po) => <span className="tnum font-semibold">{formatBDT(po.grandTotal)}</span>,
      csv: (po) => po.grandTotal,
    },
    {
      key: "status",
      header: "Status",
      render: (po) => <StatusPill status={po.status} variant="solid" />,
      csv: (po) => po.status,
    },
  ];

  const exportActive = () => {
    if (activeTab === "receivables") {
      downloadReportCsv("outstanding-receivables.csv", receivableCols, receivables);
    } else if (activeTab === "vat") {
      downloadReportCsv("vat-tax-summary.csv", paymentCols, payments ?? []);
    } else {
      downloadReportCsv("po-fulfillment.csv", poCols, pos ?? []);
    }
    toast.success("Report exported.");
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Financial reports and analytics for your supplier account"
        actions={
          <Button variant="outline" className="gap-2" onClick={exportActive}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="h-12 w-full rounded-full bg-muted p-1.5">
          <TabsTrigger value="receivables" className="rounded-full">
            Outstanding Receivables
          </TabsTrigger>
          <TabsTrigger value="vat" className="rounded-full">
            VAT &amp; TAX Summary
          </TabsTrigger>
          <TabsTrigger value="fulfillment" className="rounded-full">
            PO Fulfillment
          </TabsTrigger>
        </TabsList>

        {/* Outstanding receivables */}
        <TabsContent value="receivables" className="mt-5 space-y-3">
          <SectionTitle
            title="Outstanding & Overdue Invoices"
            meta={`${receivables.length} invoice${receivables.length === 1 ? "" : "s"} · ${formatBDT(outstandingTotal)} outstanding`}
          />
          <ReportTable
            columns={receivableCols}
            rows={receivables}
            getRowKey={(r) => r.id}
            emptyLabel="No outstanding invoices — everything is settled."
          />
        </TabsContent>

        {/* VAT & TAX summary */}
        <TabsContent value="vat" className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TotalCard label="Total Gross Invoiced" value={totals.gross} />
            <TotalCard label="VAT Deducted at Source" value={totals.vat} tone="text-danger" />
            <TotalCard label="AIT Deducted" value={totals.ait} tone="text-danger" />
            <TotalCard label="Net Amount Received" value={totals.net} tone="text-ok" />
          </div>

          <SectionTitle
            title="Payment & Deduction Detail"
            meta={`${(payments ?? []).length} payment${(payments ?? []).length === 1 ? "" : "s"}`}
          />
          <ReportTable
            columns={paymentCols}
            rows={payments ?? []}
            getRowKey={(p) => p.id}
            emptyLabel="No payments received yet."
          />

          <Widget title="VAT Notes">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• Standard VAT rate: <strong className="text-foreground">15%</strong> (per NBR Bangladesh)</p>
              <p>• AIT (Advance Income Tax): <strong className="text-foreground">3%</strong> deducted at source</p>
              <p>• All payments are subject to TDS per NBR schedule</p>
              <p>• Supplier TIN: <strong className="text-foreground">123456789012</strong></p>
              <p>• BIN (VAT Reg.): <strong className="text-foreground">000123456-0301</strong></p>
            </div>
          </Widget>
        </TabsContent>

        {/* PO fulfilment */}
        <TabsContent value="fulfillment" className="mt-5 space-y-3">
          <SectionTitle
            title="Purchase Order Fulfillment Status"
            meta={`${(pos ?? []).length} purchase order${(pos ?? []).length === 1 ? "" : "s"}`}
          />
          <ReportTable
            columns={poCols}
            rows={pos ?? []}
            getRowKey={(po) => po.id}
            emptyLabel="No purchase orders yet."
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SectionTitle({ title, meta }: { title: string; meta?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-heading text-[17px] font-bold text-foreground">{title}</h2>
      {meta && <span className="text-sm text-muted-foreground">{meta}</span>}
    </div>
  );
}

function TotalCard({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div className="glass p-5">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className={`tnum font-heading mt-2 text-2xl font-bold ${tone}`}>
        {formatBDT(value)}
      </div>
    </div>
  );
}

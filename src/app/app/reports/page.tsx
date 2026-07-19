"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { StatusPill } from "@/components/common/StatusPill";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { useInvoices, usePayments, usePurchaseOrders } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState("receivables");
  const { data: invoices } = useInvoices({});
  const { data: payments } = usePayments({});
  const { data: pos } = usePurchaseOrders({});

  const overdueInvoices = invoices?.filter(
    (inv) => inv.status !== "paid" && new Date(inv.dueDate) < new Date("2026-06-30"),
  ) ?? [];

  const vatSummary = payments?.reduce(
    (acc, p) => ({
      grossTotal: acc.grossTotal + p.grossAmount,
      vatTotal: acc.vatTotal + p.vatDeductedAtSource,
      aitTotal: acc.aitTotal + p.aitDeduction,
      netTotal: acc.netTotal + p.netAmountPaid,
    }),
    { grossTotal: 0, vatTotal: 0, aitTotal: 0, netTotal: 0 },
  ) ?? { grossTotal: 0, vatTotal: 0, aitTotal: 0, netTotal: 0 };

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="Reports"
        subtitle="Financial reports and analytics for your supplier account"
        actions={
          <Button variant="outline" className="gap-2" onClick={() => toast.info("CSV export coming soon.")}>
            <Download className="size-4" /> Export CSV
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="glass">
          <TabsTrigger value="receivables">Outstanding Receivables</TabsTrigger>
          <TabsTrigger value="payments">Payment History</TabsTrigger>
          <TabsTrigger value="vat">VAT Summary</TabsTrigger>
          <TabsTrigger value="fulfillment">PO Fulfillment</TabsTrigger>
        </TabsList>

        {/* Outstanding Receivables */}
        <TabsContent value="receivables" className="mt-4">
          <Widget title="Outstanding & Overdue Invoices">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice #</th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO Ref</th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Due Date</th>
                    <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Amount</th>
                    <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {overdueInvoices.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-muted-foreground">No outstanding invoices</td>
                    </tr>
                  ) : (
                    overdueInvoices.map((inv) => (
                      <tr key={inv.id}>
                        <td className="py-2.5 pr-4 font-semibold text-foreground">{inv.invoiceNumber}</td>
                        <td className="py-2.5 pr-4 text-muted-foreground">{inv.poNumber}</td>
                        <td className="tnum py-2.5 pr-4 text-danger">{formatDate(inv.dueDate)}</td>
                        <td className="tnum py-2.5 pr-4 text-right font-semibold text-foreground">{formatBDT(inv.totalAmount)}</td>
                        <td className="py-2.5"><StatusPill status={inv.status} /></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Widget>
        </TabsContent>

        {/* Payment History */}
        <TabsContent value="payments" className="mt-4">
          <Widget title="All Payments Received">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice Ref</th>
                    <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gross</th>
                    <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deductions</th>
                    <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {payments?.map((p) => (
                    <tr key={p.id}>
                      <td className="tnum py-2.5 pr-4 text-muted-foreground">{formatDate(p.paymentDate)}</td>
                      <td className="py-2.5 pr-4 text-foreground">{p.invoiceNumber}</td>
                      <td className="tnum py-2.5 pr-4 text-right text-foreground">{formatBDT(p.grossAmount)}</td>
                      <td className="tnum py-2.5 pr-4 text-right text-danger">
                        -{formatBDT(p.vatDeductedAtSource + p.aitDeduction + p.tdsDeduction)}
                      </td>
                      <td className="tnum py-2.5 text-right font-bold text-ok">{formatBDT(p.netAmountPaid)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td colSpan={2} className="py-3 pr-4 font-bold text-foreground">Total</td>
                    <td className="tnum py-3 pr-4 text-right font-bold text-foreground">{formatBDT(vatSummary.grossTotal)}</td>
                    <td className="tnum py-3 pr-4 text-right font-bold text-danger">-{formatBDT(vatSummary.vatTotal + vatSummary.aitTotal)}</td>
                    <td className="tnum py-3 text-right font-bold text-ok">{formatBDT(vatSummary.netTotal)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Widget>
        </TabsContent>

        {/* VAT Summary */}
        <TabsContent value="vat" className="mt-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {[
              { label: "Total Gross Invoiced", value: vatSummary.grossTotal, color: "text-foreground" },
              { label: "VAT Deducted at Source", value: vatSummary.vatTotal, color: "text-danger" },
              { label: "AIT Deducted", value: vatSummary.aitTotal, color: "text-danger" },
              { label: "Net Amount Received", value: vatSummary.netTotal, color: "text-ok" },
            ].map(({ label, value, color }) => (
              <div key={label} className="glass p-5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
                <div className={`tnum mt-2 text-2xl font-bold ${color}`}>{formatBDT(value)}</div>
              </div>
            ))}
          </div>
          <Widget title="VAT Notes" className="mt-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>• Standard VAT rate: <strong className="text-foreground">15%</strong> (per NBR Bangladesh)</p>
              <p>• AIT (Advance Income Tax): <strong className="text-foreground">3%</strong> deducted at source</p>
              <p>• All payments are subject to TDS per NBR schedule</p>
              <p>• Supplier TIN: <strong className="text-foreground">123456789012</strong></p>
              <p>• BIN (VAT Reg.): <strong className="text-foreground">000123456-0301</strong></p>
            </div>
          </Widget>
        </TabsContent>

        {/* PO Fulfillment */}
        <TabsContent value="fulfillment" className="mt-4">
          <Widget title="Purchase Order Fulfillment Status">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">PO Number</th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Buyer Dept</th>
                    <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Issue Date</th>
                    <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Value</th>
                    <th className="py-2 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {pos?.map((po) => (
                    <tr key={po.id}>
                      <td className="py-2.5 pr-4 font-semibold text-foreground">{po.poNumber}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{po.buyerDepartment}</td>
                      <td className="tnum py-2.5 pr-4 text-muted-foreground">{formatDate(po.issuedDate)}</td>
                      <td className="tnum py-2.5 pr-4 text-right font-semibold text-foreground">{formatBDT(po.grandTotal)}</td>
                      <td className="py-2.5"><StatusPill status={po.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Widget>
        </TabsContent>
      </Tabs>
    </div>
  );
}

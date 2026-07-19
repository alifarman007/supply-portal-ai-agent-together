"use client";

import { useState } from "react";
import { Search, Download } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { usePayments } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";

export default function PaymentsPage() {
  const [search, setSearch] = useState("");
  const { data: payments, isLoading } = usePayments({});

  const filtered = payments?.filter((p) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return p.invoiceNumber.toLowerCase().includes(q) || p.bankTransferRef.toLowerCase().includes(q);
  });

  const totalReceived = payments?.reduce((s, p) => s + p.netAmountPaid, 0) ?? 0;
  const totalDeductions = payments?.reduce((s, p) => s + p.vatDeductedAtSource + p.aitDeduction + p.tdsDeduction, 0) ?? 0;
  const totalGross = payments?.reduce((s, p) => s + p.grossAmount, 0) ?? 0;

  return (
    <div className="mx-auto max-w-7xl space-y-6">
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
              {isLoading ? "—" : formatBDT(value)}
            </div>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="glass p-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by invoice # or bank ref…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Date</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Invoice Ref</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">PO Ref</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Gross</th>
                <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">VAT Deducted</th>
                <th className="hidden px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">AIT</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Net Paid</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground xl:table-cell">Bank Ref</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={8} className="px-4 py-3">
                      <Skeleton className="h-5 w-full rounded" />
                    </td>
                  </tr>
                ))
              ) : filtered?.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No payments found.
                  </td>
                </tr>
              ) : (
                filtered?.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-muted/30">
                    <td className="tnum px-4 py-3 text-muted-foreground">{formatDate(p.paymentDate)}</td>
                    <td className="px-4 py-3 font-medium text-foreground">{p.invoiceNumber}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{p.poNumber}</td>
                    <td className="tnum px-4 py-3 text-right text-foreground">{formatBDT(p.grossAmount)}</td>
                    <td className="tnum hidden px-4 py-3 text-right text-danger md:table-cell">-{formatBDT(p.vatDeductedAtSource)}</td>
                    <td className="tnum hidden px-4 py-3 text-right text-danger lg:table-cell">-{formatBDT(p.aitDeduction)}</td>
                    <td className="tnum px-4 py-3 text-right font-bold text-ok">{formatBDT(p.netAmountPaid)}</td>
                    <td className="hidden px-4 py-3 font-mono text-xs text-muted-foreground xl:table-cell">{p.bankTransferRef}</td>
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

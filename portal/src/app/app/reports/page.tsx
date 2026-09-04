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
import {
  useInvoices,
  usePurchaseOrders,
  useChallans,
  useKpiSummary,
} from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, DEMO_NOW } from "@/lib/format/date";
import { useLabels } from "@/lib/i18n/labels";
import type { Invoice, PurchaseOrder } from "@/lib/mock/types";

/** Reports are cut against period end rather than "now" so totals stay stable. */
const PERIOD_END = DEMO_NOW;

/** Statuses that represent a billed invoice — drafts and rejections aren't. */
const BILLED = ["submitted", "under_review", "approved", "paid"];

type ReceivableRow = Invoice & { displayStatus: string };

interface VatRow {
  key: string;
  month: string;
  invoiced: number;
  vatCollected: number;
  aitDeducted: number;
  net: number;
}

interface FulfilmentRow {
  po: PurchaseOrder;
  itemsOrdered: number;
  itemsDelivered: number;
  fulfilmentPct: number;
  status: string;
}

export default function ReportsPage() {
  const { t, lang } = useLabels();
  const [activeTab, setActiveTab] = useState("receivables");
  const { data: invoices } = useInvoices({});
  const { data: pos } = usePurchaseOrders({});
  const { data: challans } = useChallans({});
  const { data: kpi } = useKpiSummary();

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
          displayStatus: new Date(inv.dueDate) < PERIOD_END ? "overdue" : inv.status,
        })),
    [invoices],
  );

  const vatRows: VatRow[] = useMemo(() => {
    const byMonth = new Map<string, VatRow>();
    for (const inv of invoices ?? []) {
      if (!BILLED.includes(inv.status)) continue;
      const d = new Date(inv.invoiceDate);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const row =
        byMonth.get(key) ??
        {
          key,
          month: d.toLocaleDateString("en-GB", { month: "long", year: "numeric" }),
          invoiced: 0,
          vatCollected: 0,
          aitDeducted: 0,
          net: 0,
        };
      row.invoiced += inv.totalAmount;
      row.vatCollected += inv.vatAmount;
      row.aitDeducted += inv.aitAmount;
      row.net = row.vatCollected - row.aitDeducted;
      byMonth.set(key, row);
    }
    return [...byMonth.values()].sort((a, b) => a.key.localeCompare(b.key));
  }, [invoices]);

  const vatTotals = vatRows.reduce(
    (acc, r) => ({
      collected: acc.collected + r.vatCollected,
      deducted: acc.deducted + r.aitDeducted,
      net: acc.net + r.net,
    }),
    { collected: 0, deducted: 0, net: 0 },
  );

  const fulfilment: FulfilmentRow[] = useMemo(() => {
    // Goods in transit are not fulfilled, so only confirmed arrivals count
    // towards the delivered quantity.
    const deliveredQty = new Map<string, number>();
    const inFlight = new Set<string>();
    for (const c of challans ?? []) {
      if (c.status === "delivered" || c.status === "grn_confirmed") {
        for (const item of c.items) {
          deliveredQty.set(
            item.poLineItemId,
            (deliveredQty.get(item.poLineItemId) ?? 0) + item.quantity,
          );
        }
      } else {
        inFlight.add(c.poId);
      }
    }

    return (pos ?? []).map((po) => {
      const orderedQty = po.items.reduce((s, i) => s + i.quantity, 0);
      const doneQty = po.items.reduce(
        (s, i) => s + Math.min(deliveredQty.get(i.id) ?? 0, i.quantity),
        0,
      );
      const itemsDelivered = po.items.filter(
        (i) => (deliveredQty.get(i.id) ?? 0) >= i.quantity,
      ).length;
      const fulfilmentPct = orderedQty === 0 ? 0 : Math.round((doneQty / orderedQty) * 100);

      // Order matters: a cancelled or completed PO says so regardless of what
      // is on the road, and an in-flight shipment outranks a partial count.
      const status =
        po.status === "cancelled"
          ? "cancelled"
          : fulfilmentPct >= 100
            ? "fulfilled"
            : inFlight.has(po.id)
              ? "in_transit"
              : fulfilmentPct > 0
                ? "partial"
                : "pending";

      return { po, itemsOrdered: po.items.length, itemsDelivered, fulfilmentPct, status };
    });
  }, [pos, challans]);

  const onTimeRate = useMemo(() => {
    const perf = kpi?.deliveryPerformance ?? [];
    const onTime = perf.reduce((s, m) => s + m.onTime, 0);
    const late = perf.reduce((s, m) => s + m.late, 0);
    return onTime + late === 0 ? 0 : Math.round((onTime / (onTime + late)) * 100);
  }, [kpi]);

  const avgFulfilment =
    fulfilment.length === 0
      ? 0
      : Math.round(
          fulfilment.reduce((s, r) => s + r.fulfilmentPct, 0) / fulfilment.length,
        );

  const outstandingTotal = receivables.reduce((s, r) => s + r.totalAmount, 0);

  const receivableCols: ReportColumn<ReceivableRow>[] = [
    {
      key: "invoice",
      header: t("col_invoice_number"),
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
      header: t("date_word"),
      render: (r) => <span className="tnum">{formatDate(r.invoiceDate)}</span>,
      csv: (r) => r.invoiceDate.slice(0, 10),
    },
    {
      key: "po",
      header: t("col_po_ref"),
      render: (r) => <span className="text-muted-foreground">{r.poNumber}</span>,
      csv: (r) => r.poNumber,
    },
    {
      key: "amount",
      header: t("col_amount_bdt"),
      render: (r) => <span className="tnum font-semibold">{formatBDT(r.totalAmount)}</span>,
      csv: (r) => r.totalAmount,
    },
    {
      key: "status",
      header: t("col_status"),
      render: (r) => <StatusPill status={r.displayStatus} variant="solid" />,
      csv: (r) => r.displayStatus,
    },
  ];

  const vatCols: ReportColumn<VatRow>[] = [
    {
      key: "month",
      header: t("col_month"),
      cellClassName: "w-full min-w-[140px]",
      render: (r) => <span className="font-medium text-foreground">{r.month}</span>,
      csv: (r) => r.month,
    },
    {
      key: "invoiced",
      header: t("col_invoiced_bdt"),
      render: (r) => <span className="tnum whitespace-nowrap">{formatBDT(r.invoiced)}</span>,
      csv: (r) => r.invoiced,
    },
    {
      key: "vat",
      header: t("col_vat_collected_15"),
      render: (r) => <span className="tnum whitespace-nowrap">{formatBDT(r.vatCollected)}</span>,
      csv: (r) => r.vatCollected,
    },
    {
      key: "ait",
      header: t("col_ait_deducted_3"),
      render: (r) => (
        <span className="tnum whitespace-nowrap text-danger">
          {formatBDT(r.aitDeducted)}
        </span>
      ),
      csv: (r) => r.aitDeducted,
    },
    {
      key: "net",
      header: t("col_net_after_deduction"),
      render: (r) => (
        <span className="tnum font-semibold whitespace-nowrap text-ok">{formatBDT(r.net)}</span>
      ),
      csv: (r) => r.net,
    },
  ];

  const fulfilmentCols: ReportColumn<FulfilmentRow>[] = [
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
      csv: (r) => r.po.poNumber,
    },
    {
      key: "dept",
      header: t("col_buyer_dept"),
      cellClassName: "w-full min-w-[160px]",
      render: (r) => (
        <span className="text-muted-foreground">{r.po.buyerDepartment}</span>
      ),
      csv: (r) => r.po.buyerDepartment,
    },
    {
      key: "ordered",
      header: t("col_items_ordered"),
      render: (r) => <span className="tnum">{r.itemsOrdered}</span>,
      csv: (r) => r.itemsOrdered,
    },
    {
      key: "delivered",
      header: t("col_items_delivered"),
      render: (r) => <span className="tnum">{r.itemsDelivered}</span>,
      csv: (r) => r.itemsDelivered,
    },
    {
      key: "pct",
      header: t("col_fulfillment_pct"),
      render: (r) => <span className="tnum">{r.fulfilmentPct}%</span>,
      csv: (r) => `${r.fulfilmentPct}%`,
    },
    {
      key: "status",
      header: t("col_status"),
      render: (r) => <StatusPill status={r.status} variant="solid" />,
      csv: (r) => r.status,
    },
  ];

  const exportActive = () => {
    if (activeTab === "receivables") {
      downloadReportCsv("outstanding-receivables.csv", receivableCols, receivables);
    } else if (activeTab === "vat") {
      downloadReportCsv("vat-tax-summary.csv", vatCols, vatRows);
    } else {
      downloadReportCsv("po-fulfillment.csv", fulfilmentCols, fulfilment);
    }
    toast.success(t("toast_report_exported"));
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title={t("nav_reports")}
        subtitle={t("reports_subtitle")}
        actions={
          <Button variant="outline" className="gap-2" onClick={exportActive}>
            <Download className="size-4" /> {t("export_csv_btn")}
          </Button>
        }
      />

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        {/* Three long labels do not fit a phone, and the pills refuse to wrap —
            so the strip scrolls sideways rather than bleeding off both edges. */}
        <div className="tab-scroll -mx-4 px-4 sm:mx-0 sm:px-0">
          <TabsList className="h-12 w-full min-w-max rounded-full bg-muted p-1.5">
            <TabsTrigger value="receivables" className="rounded-full">
              {t("tab_receivables")}
            </TabsTrigger>
            <TabsTrigger value="vat" className="rounded-full">
              {t("tab_vat")}
            </TabsTrigger>
            <TabsTrigger value="fulfillment" className="rounded-full">
              {t("tab_fulfillment")}
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Outstanding receivables */}
        <TabsContent value="receivables" className="mt-5 space-y-3">
          <SectionTitle
            title={t("outstanding_overdue_title")}
            meta={`${receivables.length} ${receivables.length === 1 ? t("invoice_word") : t("invoices_word")} · ${formatBDT(outstandingTotal)} ${t("outstanding_word")}`}
          />
          <ReportTable
            columns={receivableCols}
            rows={receivables}
            getRowKey={(r) => r.id}
            emptyLabel={t("receivables_empty")}
          />
        </TabsContent>

        {/* VAT & TAX summary */}
        <TabsContent value="vat" className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t("total_vat_collected")} value={formatBDT(vatTotals.collected)} />
            <StatCard
              label={t("total_ait_deducted")}
              value={formatBDT(vatTotals.deducted)}
              tone="text-danger"
            />
            <StatCard
              label={t("net_after_deduction_ytd")}
              value={formatBDT(vatTotals.net)}
              tone="text-ok"
            />
          </div>

          <ReportTable
            columns={vatCols}
            rows={vatRows}
            getRowKey={(r) => r.key}
            emptyLabel={t("vat_empty")}
          />

          <Widget title={t("vat_notes_title")}>
            <div className="space-y-2 text-sm text-muted-foreground">
              {lang === "bn" ? (
                <>
                  <p>
                    • আদর্শ ভ্যাট হার: <strong className="text-foreground">১৫%</strong> (এনবিআর
                    বাংলাদেশ অনুযায়ী)
                  </p>
                  <p>
                    • এআইটি (অগ্রিম আয়কর): <strong className="text-foreground">৩%</strong>{" "}
                    উৎসে কর্তনকৃত
                  </p>
                  <p>• সকল পেমেন্ট এনবিআর সময়সূচী অনুযায়ী টিডিএস সাপেক্ষে</p>
                  <p>
                    • সরবরাহকারীর টিআইএন: <strong className="text-foreground">123456789012</strong>
                  </p>
                  <p>
                    • বিআইএন (ভ্যাট নিবন্ধন): <strong className="text-foreground">000123456-0301</strong>
                  </p>
                </>
              ) : (
                <>
                  <p>
                    • Standard VAT rate: <strong className="text-foreground">15%</strong> (per NBR
                    Bangladesh)
                  </p>
                  <p>
                    • AIT (Advance Income Tax): <strong className="text-foreground">3%</strong>{" "}
                    deducted at source
                  </p>
                  <p>• All payments are subject to TDS per NBR schedule</p>
                  <p>
                    • Supplier TIN: <strong className="text-foreground">123456789012</strong>
                  </p>
                  <p>
                    • BIN (VAT Reg.): <strong className="text-foreground">000123456-0301</strong>
                  </p>
                </>
              )}
            </div>
          </Widget>
        </TabsContent>

        {/* PO fulfilment */}
        <TabsContent value="fulfillment" className="mt-5 space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <StatCard label={t("total_purchase_orders")} value={String(fulfilment.length)} />
            <StatCard
              label={t("on_time_delivery_rate")}
              value={`${onTimeRate}%`}
              tone="text-ok"
            />
            <StatCard
              label={t("avg_fulfillment_rate")}
              value={`${avgFulfilment}%`}
              tone="text-warn"
            />
          </div>

          <ReportTable
            columns={fulfilmentCols}
            rows={fulfilment}
            getRowKey={(r) => r.po.id}
            emptyLabel={t("fulfillment_empty")}
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

function StatCard({
  label,
  value,
  tone = "text-foreground",
}: {
  label: string;
  value: string;
  tone?: string;
}) {
  return (
    <div className="glass p-5">
      <div className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </div>
      <div className={`tnum font-heading mt-2 text-2xl font-bold ${tone}`}>{value}</div>
    </div>
  );
}

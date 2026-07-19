"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ClipboardList,
  FileText,
  Banknote,
  TriangleAlert,
  ArrowRight,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { KpiTile } from "@/components/charts/KpiTile";
import { TrendArea } from "@/components/charts/TrendArea";
import { DonutChart } from "@/components/charts/DonutChart";
import { Sparkline } from "@/components/charts/Sparkline";
import { StatusPill } from "@/components/common/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
import { useKpiSummary, usePurchaseOrders, useInvoices, useTenders } from "@/lib/query/hooks";
import { useAuth } from "@/store/auth";
import { useLabels } from "@/lib/i18n/labels";
import { formatBDT, formatBDTCompact, formatNumber } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
};
const item = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: "easeOut" as const } },
};

export default function DashboardPage() {
  const { data, isLoading } = useKpiSummary();
  const { data: recentPOs } = usePurchaseOrders();
  const { data: recentInvoices } = useInvoices();
  const { data: openTenders } = useTenders({ status: "published" });
  const user = useAuth((s) => s.user);
  const { t, lang } = useLabels();
  const reduce = useReducedMotion();

  const money = (n: number) => formatBDT(n, { lang });
  const num = (n: number) => formatNumber(n, lang);
  const loading = isLoading || !data;

  const ytdDelta = data && data.totalReceivedLastMonth > 0
    ? Math.round(((data.totalReceivedMTD - data.totalReceivedLastMonth) / data.totalReceivedLastMonth) * 100)
    : 0;

  const trendData = data?.monthlyPaymentTrend.map((d) => ({
    month: d.month,
    thisYear: d.paid,
    lastYear: d.lastYear,
  })) ?? [];

  const donutData = data?.invoiceStatusBreakdown.map((d) => ({
    name: d.label,
    value: d.count,
    color: d.color,
  })) ?? [];

  const latestPOs = (recentPOs ?? []).slice(0, 5);
  const latestInvoices = (recentInvoices ?? []).slice(0, 5);
  const latestTenders = (openTenders ?? []).slice(0, 5);

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title={
          <span>
            {t("greeting")},{" "}
            <span className="text-primary dark:text-brand-cream">
              {user?.name?.split(" ")[0] ?? "there"}
            </span>
          </span>
        }
        subtitle={t("dash_subtitle")}
      />

      <motion.div
        variants={container}
        initial={reduce ? false : "hidden"}
        animate="show"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-12"
      >
        {/* KPI — Active POs */}
        <motion.div variants={item} className="xl:col-span-3">
          <KpiTile
            icon={ClipboardList}
            label="Active Purchase Orders"
            value={data?.activePOs ?? 0}
            format={num}
            loading={loading}
            accent
            footer={
              loading ? (
                <Skeleton className="h-11 w-full rounded-md" />
              ) : (
                <Sparkline
                  data={trendData.map((d) => d.thisYear)}
                  color="var(--chart-1)"
                />
              )
            }
          />
        </motion.div>

        {/* KPI — Pending Invoices */}
        <motion.div variants={item} className="xl:col-span-3">
          <KpiTile
            icon={FileText}
            label="Pending Invoices"
            value={data?.pendingInvoices ?? 0}
            format={num}
            loading={loading}
            footer={
              <span className="text-xs text-muted-foreground">
                {loading ? "—" : `${data.overdueInvoices} overdue`}
              </span>
            }
          />
        </motion.div>

        {/* KPI — Total Received YTD */}
        <motion.div variants={item} className="xl:col-span-3">
          <KpiTile
            icon={Banknote}
            label="Total Received (YTD)"
            value={data?.totalReceivedYTD ?? 0}
            format={money}
            loading={loading}
            accent
            delta={ytdDelta}
            footer={
              <span className="text-xs text-muted-foreground">
                {loading ? "—" : `MTD: ${money(data.totalReceivedMTD)}`}
              </span>
            }
          />
        </motion.div>

        {/* KPI — Overdue Invoices */}
        <motion.div variants={item} className="xl:col-span-3">
          <KpiTile
            icon={TriangleAlert}
            label="Overdue Invoices"
            value={data?.overdueInvoices ?? 0}
            format={num}
            loading={loading}
            warn={!!data?.overdueInvoices}
            footer={
              <span className="text-xs text-muted-foreground">
                Requires immediate action
              </span>
            }
          />
        </motion.div>

        {/* Payment Trend */}
        <motion.div variants={item} className="sm:col-span-2 xl:col-span-8">
          <Widget
            title="Payment Trend"
            action={
              <div className="flex items-center gap-4 text-xs">
                <Legend color="var(--chart-1)" label="This year" />
                <Legend color="var(--chart-2)" label="Last year" />
              </div>
            }
          >
            {loading ? (
              <Skeleton className="h-[264px] w-full rounded-lg" />
            ) : (
              <TrendArea data={trendData} />
            )}
          </Widget>
        </motion.div>

        {/* Invoice Status Donut */}
        <motion.div variants={item} className="sm:col-span-2 xl:col-span-4">
          <Widget title="Invoice Status Mix">
            {loading ? (
              <Skeleton className="mx-auto h-[196px] w-[196px] rounded-full" />
            ) : (
              <DonutChart data={donutData} centerLabel="Invoices" />
            )}
          </Widget>
        </motion.div>

        {/* Open Tenders */}
        <motion.div variants={item} className="sm:col-span-2 xl:col-span-4">
          <Widget
            title="Open Tenders"
            action={
              <Link
                href="/app/tenders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline dark:text-brand-cream"
              >
                {t("view_all")} <ArrowRight className="size-3" />
              </Link>
            }
          >
            {!openTenders ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : latestTenders.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">No open tenders right now.</p>
            ) : (
              <div className="space-y-2">
                {latestTenders.map((t) => (
                  <Link
                    key={t.id}
                    href={`/app/tenders/${t.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{t.tenderNumber}</div>
                      <div className="truncate text-xs text-muted-foreground">{t.title}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-xs font-semibold text-foreground">{formatDate(t.submissionDeadline)}</div>
                      <StatusPill status={t.status} className="mt-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Widget>
        </motion.div>

        {/* Recent POs */}
        <motion.div variants={item} className="sm:col-span-2 xl:col-span-4">
          <Widget
            title="Recent Purchase Orders"
            action={
              <Link
                href="/app/purchase-orders"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline dark:text-brand-cream"
              >
                {t("view_all")} <ArrowRight className="size-3" />
              </Link>
            }
          >
            {!recentPOs ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {latestPOs.map((po) => (
                  <Link
                    key={po.id}
                    href={`/app/purchase-orders/${po.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{po.poNumber}</div>
                      <div className="text-xs text-muted-foreground">{po.buyerDepartment}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-xs font-semibold text-foreground">{money(po.grandTotal)}</div>
                      <StatusPill status={po.status} className="mt-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Widget>
        </motion.div>

        {/* Recent Invoices */}
        <motion.div variants={item} className="sm:col-span-2 xl:col-span-4">
          <Widget
            title="Recent Invoices"
            action={
              <Link
                href="/app/invoices"
                className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline dark:text-brand-cream"
              >
                {t("view_all")} <ArrowRight className="size-3" />
              </Link>
            }
          >
            {!recentInvoices ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-lg" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {latestInvoices.map((inv) => (
                  <Link
                    key={inv.id}
                    href={`/app/invoices/${inv.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-foreground">{inv.invoiceNumber}</div>
                      <div className="text-xs text-muted-foreground">{inv.poNumber} · {formatDate(inv.invoiceDate)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="tnum text-xs font-semibold text-foreground">{money(inv.totalAmount)}</div>
                      <StatusPill status={inv.status} className="mt-0.5" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Widget>
        </motion.div>

        {/* Recent Activity */}
        {data?.recentActivity && data.recentActivity.length > 0 && (
          <motion.div variants={item} className="sm:col-span-2 xl:col-span-12">
            <Widget title="Recent Activity">
              <div className="divide-y divide-border/60">
                {data.recentActivity.slice(0, 5).map((a) => (
                  <div key={a.id} className="flex items-center gap-3 py-2.5">
                    <span className="size-1.5 shrink-0 rounded-full bg-brand-cream" />
                    <span className="flex-1 text-sm text-foreground">{a.description}</span>
                    <span className="tnum text-xs text-muted-foreground">
                      {formatDate(a.timestamp)}
                    </span>
                  </div>
                ))}
              </div>
            </Widget>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-muted-foreground">
      <span className="size-2.5 rounded-full" style={{ background: color }} />
      {label}
    </span>
  );
}

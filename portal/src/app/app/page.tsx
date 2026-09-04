"use client";

import { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  ArrowRight,
  Banknote,
  Gavel,
  Receipt,
  ShoppingCart,
  Truck,
  TrendingUp,
  type LucideIcon,
} from "lucide-react";
import { Widget } from "@/components/common/Widget";
import { PeriodPill } from "@/components/common/PeriodPill";
import { StatusPill } from "@/components/common/StatusPill";
import { PerformanceBars } from "@/components/charts/PerformanceBars";
import { DeliveryStats } from "@/components/charts/DeliveryStats";
import { MiniBars } from "@/components/charts/MiniBars";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useKpiSummary, usePurchaseOrders, useInvoices, useTenders } from "@/lib/query/hooks";
import { useAuth } from "@/store/auth";
import { useLabels } from "@/lib/i18n/labels";
import { formatBDT, formatNumber } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
] as const;
const YEARS = ["2026", "2025", "2024"] as const;

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

  const [perfYear, setPerfYear] = useState<string>(YEARS[0]);
  const [deliveryMonth, setDeliveryMonth] = useState<string>(MONTHS[0]);
  const [orderMonth, setOrderMonth] = useState<string>(MONTHS[0]);
  const [deliveryTileMonth, setDeliveryTileMonth] = useState<string>(MONTHS[0]);
  const [paymentMonth, setPaymentMonth] = useState<string>(MONTHS[0]);

  const money = (n: number) => formatBDT(n, { lang });
  const num = (n: number) => formatNumber(n, lang);
  const loading = isLoading || !data;

  const latestPOs = (recentPOs ?? []).slice(0, 5);
  // "Pending" means raised and awaiting settlement — drafts aren't billed yet
  // and paid ones are done, so neither belongs in this list.
  const latestInvoices = (recentInvoices ?? [])
    .filter((i) => ["submitted", "under_review", "approved"].includes(i.status))
    .slice(0, 5);
  const latestTenders = (openTenders ?? []).slice(0, 5);

  const weekly = data?.weeklyBreakdown ?? [];

  return (
    <div className="mx-auto max-w-[1680px]">
      <motion.div
        variants={container}
        initial={reduce ? false : "hidden"}
        animate="show"
        className="grid grid-cols-1 gap-4 lg:grid-cols-3"
      >
        {/* Welcome */}
        <motion.div variants={item}>
          <Widget className="justify-center">
            <div className="text-[15px] font-semibold text-foreground">
              {t("greeting")}
            </div>
            <div className="font-heading mt-1 text-[26px] leading-tight font-bold text-brand-sky">
              {user?.name ?? "there"}
            </div>
            {loading ? (
              <Skeleton className="mt-4 h-9 w-40 rounded-md" />
            ) : (
              <div className="tnum font-heading mt-4 text-[32px] leading-none font-bold text-primary">
                {money(data.totalReceivedYTD)}
              </div>
            )}
            <p className="mt-3 text-sm text-muted-foreground">
              Keep up the great work! 💪
            </p>
          </Widget>
        </motion.div>

        {/* Transactions */}
        <motion.div variants={item} className="lg:col-span-2">
          <Widget title="Transactions">
            <p className="-mt-3 mb-6 text-sm text-muted-foreground">
              {loading ? "—" : `Total ${data.growthPct}% Growth 😎 this month`}
            </p>
            <div className="grid grid-cols-1 gap-x-4 gap-y-6 sm:grid-cols-2 xl:grid-cols-4">
              <StatItem
                icon={Gavel}
                tone="bg-primary"
                label="Open Bid"
                value={loading ? "—" : num(data.openBids)}
              />
              <StatItem
                icon={ShoppingCart}
                tone="bg-chart-2"
                label="Active Purchase Order"
                value={loading ? "—" : num(data.activePOs)}
              />
              <StatItem
                icon={Receipt}
                tone="bg-chart-3"
                label="Due Invoice"
                value={loading ? "—" : num(data.pendingInvoices)}
              />
              <StatItem
                icon={Banknote}
                tone="bg-chart-4"
                label="Due Payment"
                value={loading ? "—" : money(data.duePaymentAmount)}
              />
            </div>
          </Widget>
        </motion.div>

        {/* Performance */}
        <motion.div variants={item} className="lg:col-span-1 xl:col-span-1">
          <Widget
            title="Performance"
            action={<PeriodPill value={perfYear} options={YEARS} onChange={setPerfYear} />}
          >
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <>
                <PerformanceBars data={data.monthlyOrderDelivery} />
                <div className="mt-3 flex items-center justify-center gap-5 text-xs">
                  <Legend color="var(--chart-1)" label="Order" />
                  <Legend color="var(--chart-2)" label="Delivery" />
                </div>
              </>
            )}
          </Widget>
        </motion.div>

        {/* Delivery statistics */}
        <motion.div variants={item} className="lg:col-span-2">
          <Widget
            title="Delivery Statistics"
            action={
              <PeriodPill value={deliveryMonth} options={MONTHS} onChange={setDeliveryMonth} />
            }
          >
            {loading ? (
              <Skeleton className="h-[300px] w-full rounded-lg" />
            ) : (
              <>
                <p className="-mt-3 text-sm text-muted-foreground">
                  Total number of deliveries this month: {num(data.deliveriesThisMonth)}
                </p>
                <div className="mt-3 mb-1 flex items-center gap-5 text-xs">
                  <Legend color="var(--chart-3)" label="Ordered" />
                  <Legend color="var(--chart-1)" label="Delivered" />
                </div>
                <DeliveryStats data={data.dailyDeliveryStats} />
                <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="grid size-6 place-items-center rounded-md bg-chart-2/15 text-chart-2">
                    <TrendingUp className="size-3.5" />
                  </span>
                  {data.deliveryChangePct}% increase in deliveries this month
                </div>
              </>
            )}
          </Widget>
        </motion.div>

        {/* Three summary tiles */}
        <motion.div variants={item}>
          <SummaryTile
            icon={ShoppingCart}
            tint="bg-chart-4/15 text-chart-4"
            color="var(--chart-4)"
            label="Total Order"
            value={loading ? "—" : num(data.monthTotals.orders)}
            series={weekly.map((d) => ({ day: d.day, value: d.orders }))}
            month={orderMonth}
            onMonthChange={setOrderMonth}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={item}>
          <SummaryTile
            icon={Truck}
            tint="bg-chart-2/15 text-chart-2"
            color="var(--chart-2)"
            label="Total Delivery"
            value={loading ? "—" : num(data.monthTotals.deliveries)}
            series={weekly.map((d) => ({ day: d.day, value: d.deliveries }))}
            month={deliveryTileMonth}
            onMonthChange={setDeliveryTileMonth}
            loading={loading}
          />
        </motion.div>
        <motion.div variants={item}>
          <SummaryTile
            icon={Banknote}
            tint="bg-chart-5/15 text-chart-5"
            color="var(--chart-5)"
            label="Total Payment"
            value={loading ? "—" : money(data.monthTotals.payments)}
            series={weekly.map((d) => ({ day: d.day, value: d.payments }))}
            month={paymentMonth}
            onMonthChange={setPaymentMonth}
            loading={loading}
            format={money}
          />
        </motion.div>

        {/* Open tenders */}
        <motion.div variants={item}>
          <Widget title="Open Tender" action={<ViewAll href="/app/tenders" label={t("view_all")} />}>
            <ListBody
              loading={!openTenders}
              empty={latestTenders.length === 0}
              emptyLabel="No open tenders right now."
            >
              {latestTenders.map((tender) => (
                <Row
                  key={tender.id}
                  href={`/app/tenders/${tender.id}`}
                  title={tender.tenderNumber}
                  subtitle={tender.title}
                  meta={formatDate(tender.submissionDeadline)}
                  status={tender.status}
                />
              ))}
            </ListBody>
          </Widget>
        </motion.div>

        {/* Open purchase orders */}
        <motion.div variants={item}>
          <Widget
            title="Open Purchase Order"
            action={<ViewAll href="/app/purchase-orders" label={t("view_all")} />}
          >
            <ListBody loading={!recentPOs} empty={latestPOs.length === 0} emptyLabel="No purchase orders yet.">
              {latestPOs.map((po) => (
                <Row
                  key={po.id}
                  href={`/app/purchase-orders/${po.id}`}
                  title={po.poNumber}
                  subtitle={po.buyerDepartment}
                  meta={money(po.grandTotal)}
                  status={po.status}
                />
              ))}
            </ListBody>
          </Widget>
        </motion.div>

        {/* Pending bills */}
        <motion.div variants={item}>
          <Widget title="Pending Bill" action={<ViewAll href="/app/invoices" label={t("view_all")} />}>
            <ListBody loading={!recentInvoices} empty={latestInvoices.length === 0} emptyLabel="No bills yet.">
              {latestInvoices.map((inv) => (
                <Row
                  key={inv.id}
                  href={`/app/invoices/${inv.id}`}
                  title={inv.invoiceNumber}
                  subtitle={inv.poNumber}
                  meta={money(inv.totalAmount)}
                  status={inv.status}
                />
              ))}
            </ListBody>
          </Widget>
        </motion.div>
      </motion.div>
    </div>
  );
}

function StatItem({
  icon: Icon,
  tone,
  label,
  value,
}: {
  icon: LucideIcon;
  tone: string;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("grid size-11 shrink-0 place-items-center rounded-xl text-white", tone)}>
        <Icon className="size-5" strokeWidth={2} />
      </span>
      <div className="min-w-0">
        <div className="truncate text-sm text-muted-foreground">{label}</div>
        {/* No truncation here — a clipped currency figure reads as wrong data. */}
        <div className="tnum font-heading text-lg font-bold text-foreground">
          {value}
        </div>
      </div>
    </div>
  );
}

function SummaryTile({
  icon: Icon,
  tint,
  color,
  label,
  value,
  series,
  month,
  onMonthChange,
  loading,
  format,
}: {
  icon: LucideIcon;
  tint: string;
  color: string;
  label: string;
  value: string;
  series: { day: number; value: number }[];
  month: string;
  onMonthChange: (v: string) => void;
  loading?: boolean;
  format?: (n: number) => string;
}) {
  return (
    <Widget>
      <div className="flex items-start justify-between">
        <span className={cn("grid size-11 place-items-center rounded-xl", tint)}>
          <Icon className="size-5" strokeWidth={2} />
        </span>
        <PeriodPill value={month} options={MONTHS} onChange={onMonthChange} />
      </div>
      {loading ? (
        <Skeleton className="mt-5 h-8 w-28 rounded-md" />
      ) : (
        <div className="tnum font-heading mt-5 text-[28px] leading-tight font-bold text-foreground">
          {value}
        </div>
      )}
      <div className="mt-1 text-sm text-muted-foreground">{label}</div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-[150px] w-full rounded-lg" />
        ) : (
          <MiniBars data={series} color={color} label={label} format={format} />
        )}
      </div>
    </Widget>
  );
}

function ListBody({
  loading,
  empty,
  emptyLabel,
  children,
}: {
  loading: boolean;
  empty: boolean;
  emptyLabel: string;
  children: React.ReactNode;
}) {
  if (loading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (empty) {
    return <p className="py-6 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }
  return <div className="space-y-2.5">{children}</div>;
}

function Row({
  href,
  title,
  subtitle,
  meta,
  status,
}: {
  href: string;
  title: string;
  subtitle: string;
  meta: string;
  status: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-3 rounded-xl border border-border px-3.5 py-3 transition-colors hover:bg-muted/50"
    >
      <div className="min-w-0">
        <div className="truncate text-sm font-semibold text-foreground">{title}</div>
        <div className="truncate text-xs text-muted-foreground">{subtitle}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <div className="tnum text-xs font-semibold text-foreground">{meta}</div>
        <StatusPill status={status} />
      </div>
    </Link>
  );
}

function ViewAll({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
    >
      {label} <ArrowRight className="size-3.5" />
    </Link>
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

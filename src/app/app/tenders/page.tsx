"use client";

import { useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { ReportTable, type ReportColumn } from "@/components/common/ReportTable";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTenders, useBids } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import { useLabels, type LabelKey } from "@/lib/i18n/labels";
import type { Tender, Bid, TenderStatus } from "@/lib/mock/types";

const TENDER_STATUSES: { value: TenderStatus | "all"; labelKey: LabelKey }[] = [
  { value: "all", labelKey: "all_statuses" },
  { value: "published", labelKey: "published" },
  { value: "evaluation", labelKey: "evaluation" },
  { value: "negotiation", labelKey: "negotiation" },
  { value: "awarded", labelKey: "awarded" },
  { value: "closed", labelKey: "closed" },
  { value: "cancelled", labelKey: "cancelled" },
];

/** Short forms for the "Your bid" column — the full labels are too wide here. */
const BID_LABEL_KEYS: Record<string, LabelKey> = {
  draft: "draft",
  submitted: "submitted",
  under_evaluation: "under_evaluation",
  clarification_requested: "clarify_req",
  shortlisted: "shortlisted",
  awarded: "awarded",
  not_awarded: "not_awarded",
  rejected: "rejected",
  cancelled: "withdrawn",
};

export default function TendersPage() {
  const { t } = useLabels();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TenderStatus | "all">("all");

  const { data: tenders, isLoading } = useTenders({ status, search });
  const { data: bids } = useBids();
  const bidByTender = new Map<string, Bid>((bids ?? []).map((b) => [b.tenderId, b]));

  const bidLabel = (tender: Tender) => {
    const bid = bidByTender.get(tender.id);
    if (!bid) return t("not_submitted");
    return t(BID_LABEL_KEYS[bid.status] ?? (bid.status as LabelKey));
  };

  const columns: ReportColumn<Tender>[] = [
    {
      key: "tender",
      header: t("col_tender_number"),
      render: (tender) => (
        <Link
          href={`/app/tenders/${tender.id}`}
          className="font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
        >
          {tender.tenderNumber}
        </Link>
      ),
    },
    {
      key: "deadline",
      header: t("col_deadline"),
      render: (tender) => (
        <span className="tnum whitespace-nowrap">{formatDate(tender.submissionDeadline)}</span>
      ),
    },
    {
      key: "title",
      header: t("col_title"),
      // Takes the slack left by the fixed-width columns so titles stay readable.
      cellClassName: "w-full min-w-[180px] whitespace-normal",
      render: (tender) => <span className="line-clamp-2 text-foreground sm:line-clamp-1">{tender.title}</span>,
    },
    {
      key: "category",
      header: t("col_category"),
      // Secondary detail — dropped first so Status never scrolls out of view.
      cellClassName: "hidden 2xl:table-cell",
      render: (tender) => (
        <span className="whitespace-nowrap text-muted-foreground">{tender.category}</span>
      ),
    },
    {
      key: "value",
      header: t("col_value_bdt"),
      render: (tender) => (
        <span className="tnum font-semibold whitespace-nowrap">
          {formatBDT(tender.estimatedValue)}
        </span>
      ),
    },
    {
      key: "bid",
      header: t("col_your_bid"),
      render: (tender) => (
        <span className="whitespace-nowrap text-muted-foreground">{bidLabel(tender)}</span>
      ),
    },
    {
      key: "status",
      header: t("col_status"),
      render: (tender) => <StatusPill status={tender.status} variant="solid" />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title={t("nav_tenders")}
        subtitle={t("tender_subtitle")}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("tender_search_ph")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl bg-card pl-10"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as TenderStatus | "all")}>
          <SelectTrigger className="h-11 rounded-xl bg-card sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {TENDER_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {t(s.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportTable
        columns={columns}
        rows={tenders ?? []}
        getRowKey={(t) => t.id}
        loading={isLoading}
        emptyLabel={t("tender_empty")}
      />
    </div>
  );
}

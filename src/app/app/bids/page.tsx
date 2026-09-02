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
import { useBids } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import { useLabels, type LabelKey } from "@/lib/i18n/labels";
import type { Bid, BidStatus } from "@/lib/mock/types";

const BID_STATUSES: { value: BidStatus | "all"; labelKey: LabelKey }[] = [
  { value: "all", labelKey: "all_statuses" },
  { value: "submitted", labelKey: "submitted" },
  { value: "under_evaluation", labelKey: "under_evaluation" },
  { value: "clarification_requested", labelKey: "clarification_requested" },
  { value: "shortlisted", labelKey: "shortlisted" },
  { value: "awarded", labelKey: "awarded" },
  { value: "not_awarded", labelKey: "not_awarded" },
  { value: "rejected", labelKey: "rejected" },
];

/** The full wording overflows the pill in this table's Status column. */
const SHORT_LABEL_KEYS: Partial<Record<BidStatus, LabelKey>> = {
  clarification_requested: "clarify_req",
};

export default function BidsPage() {
  const { t } = useLabels();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BidStatus | "all">("all");

  const { data: bids, isLoading } = useBids({ status, search });

  const columns: ReportColumn<Bid>[] = [
    {
      key: "bid",
      header: t("col_bid_number"),
      render: (b) => (
        <Link
          href={`/app/bids/${b.id}`}
          className="font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
        >
          {b.bidNumber}
        </Link>
      ),
    },
    {
      key: "tender",
      header: t("col_tender"),
      // Takes the slack left by the fixed-width columns so titles stay readable.
      cellClassName: "w-full min-w-[180px] whitespace-normal",
      render: (b) => (
        <Link
          href={`/app/tenders/${b.tenderId}`}
          className="line-clamp-2 text-foreground hover:text-primary sm:line-clamp-1"
          title={`${b.tenderNumber} — ${b.tenderTitle}`}
        >
          {b.tenderTitle}
        </Link>
      ),
    },
    {
      key: "submitted",
      header: t("lbl_submitted"),
      render: (b) => (
        <span className="tnum whitespace-nowrap">{formatDate(b.submittedAt)}</span>
      ),
    },
    {
      key: "amount",
      header: t("col_amount_bdt"),
      render: (b) => (
        <span className="tnum font-semibold whitespace-nowrap">
          {formatBDT(b.totalBidAmount)}
        </span>
      ),
    },
    {
      key: "status",
      header: t("col_status"),
      render: (b) => {
        const shortKey = SHORT_LABEL_KEYS[b.status];
        return (
          <StatusPill status={b.status} variant="solid" label={shortKey ? t(shortKey) : undefined} />
        );
      },
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title={t("nav_bids")}
        subtitle={t("bid_subtitle")}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={t("bid_search_ph")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-11 rounded-xl bg-card pl-10"
          />
        </div>
        <Select value={status} onValueChange={(v) => setStatus(v as BidStatus | "all")}>
          <SelectTrigger className="h-11 rounded-xl bg-card sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {BID_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {t(s.labelKey)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <ReportTable
        columns={columns}
        rows={bids ?? []}
        getRowKey={(b) => b.id}
        loading={isLoading}
        emptyLabel={t("bid_empty")}
      />
    </div>
  );
}

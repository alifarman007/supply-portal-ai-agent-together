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
import type { Tender, Bid, TenderStatus } from "@/lib/mock/types";

const TENDER_STATUSES: { value: TenderStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "evaluation", label: "Under Evaluation" },
  { value: "negotiation", label: "Negotiation" },
  { value: "awarded", label: "Awarded" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

/** Short forms for the "Your bid" column — the full labels are too wide here. */
const BID_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  under_evaluation: "Under Evaluation",
  clarification_requested: "Clarify Req.",
  shortlisted: "Shortlisted",
  awarded: "Awarded",
  not_awarded: "Not Awarded",
  rejected: "Rejected",
  cancelled: "Withdrawn",
};

export default function TendersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TenderStatus | "all">("all");

  const { data: tenders, isLoading } = useTenders({ status, search });
  const { data: bids } = useBids();
  const bidByTender = new Map<string, Bid>((bids ?? []).map((b) => [b.tenderId, b]));

  const bidLabel = (tender: Tender) => {
    const bid = bidByTender.get(tender.id);
    if (!bid) return "Not submitted";
    return BID_LABELS[bid.status] ?? bid.status;
  };

  const columns: ReportColumn<Tender>[] = [
    {
      key: "tender",
      header: "Tender #",
      render: (t) => (
        <Link
          href={`/app/tenders/${t.id}`}
          className="font-semibold whitespace-nowrap text-primary underline underline-offset-4 hover:opacity-80"
        >
          {t.tenderNumber}
        </Link>
      ),
    },
    {
      key: "deadline",
      header: "Deadline",
      render: (t) => (
        <span className="tnum whitespace-nowrap">{formatDate(t.submissionDeadline)}</span>
      ),
    },
    {
      key: "title",
      header: "Title",
      // Takes the slack left by the fixed-width columns so titles stay readable.
      cellClassName: "w-full min-w-[180px] whitespace-normal",
      render: (t) => <span className="line-clamp-2 text-foreground sm:line-clamp-1">{t.title}</span>,
    },
    {
      key: "category",
      header: "Category",
      // Secondary detail — dropped first so Status never scrolls out of view.
      cellClassName: "hidden 2xl:table-cell",
      render: (t) => (
        <span className="whitespace-nowrap text-muted-foreground">{t.category}</span>
      ),
    },
    {
      key: "value",
      header: "Value (BDT)",
      render: (t) => (
        <span className="tnum font-semibold whitespace-nowrap">
          {formatBDT(t.estimatedValue)}
        </span>
      ),
    },
    {
      key: "bid",
      header: "Your Bid",
      render: (t) => (
        <span className="whitespace-nowrap text-muted-foreground">{bidLabel(t)}</span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (t) => <StatusPill status={t.status} variant="solid" />,
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title="Tenders / RFQs"
        subtitle="Browse published tenders, check eligibility and track your bid status"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by tender #, title or category…"
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
                {s.label}
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
        emptyLabel="No tenders match your search."
      />
    </div>
  );
}

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
import type { Bid, BidStatus } from "@/lib/mock/types";

const BID_STATUSES: { value: BidStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "submitted", label: "Submitted" },
  { value: "under_evaluation", label: "Under Evaluation" },
  { value: "clarification_requested", label: "Clarification Requested" },
  { value: "shortlisted", label: "Shortlisted" },
  { value: "awarded", label: "Awarded" },
  { value: "not_awarded", label: "Not Awarded" },
  { value: "rejected", label: "Rejected" },
];

/** The full wording overflows the pill in this table's Status column. */
const SHORT_LABELS: Partial<Record<BidStatus, string>> = {
  clarification_requested: "Clarify Req.",
};

export default function BidsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BidStatus | "all">("all");

  const { data: bids, isLoading } = useBids({ status, search });

  const columns: ReportColumn<Bid>[] = [
    {
      key: "bid",
      header: "Bid #",
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
      header: "Tender",
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
      header: "Submitted",
      render: (b) => (
        <span className="tnum whitespace-nowrap">{formatDate(b.submittedAt)}</span>
      ),
    },
    {
      key: "amount",
      header: "Amount (BDT)",
      render: (b) => (
        <span className="tnum font-semibold whitespace-nowrap">
          {formatBDT(b.totalBidAmount)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (b) => (
        <StatusPill status={b.status} variant="solid" label={SHORT_LABELS[b.status]} />
      ),
    },
  ];

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title="My Bids"
        subtitle="Track the status of bids you've submitted against published tenders"
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by bid # or tender…"
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
                {s.label}
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
        emptyLabel="No bids match your search."
      />
    </div>
  );
}

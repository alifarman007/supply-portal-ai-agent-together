"use client";

import { useState } from "react";
import Link from "next/link";
import { Search, Filter } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Skeleton } from "@/components/ui/skeleton";
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
import type { BidStatus } from "@/lib/mock/types";

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

export default function BidsPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<BidStatus | "all">("all");

  const { data: bids, isLoading } = useBids({ status, search });

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <PageHeader
        title="My Bids"
        subtitle="Track the status of bids you've submitted against published tenders"
      />

      <div className="glass p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by bid # or tender…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={status} onValueChange={(v) => setStatus(v as BidStatus | "all")}>
              <SelectTrigger className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {BID_STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bid #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tender</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Submitted</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bid Amount (BDT)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={5} className="px-4 py-3">
                      <Skeleton className="h-5 w-full rounded" />
                    </td>
                  </tr>
                ))
              ) : bids?.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No bids submitted yet.
                  </td>
                </tr>
              ) : (
                bids?.map((bid) => (
                  <tr key={bid.id} className="cursor-pointer transition-colors hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link href={`/app/bids/${bid.id}`} className="font-semibold text-foreground hover:text-primary dark:hover:text-brand-cream">
                        {bid.bidNumber}
                      </Link>
                    </td>
                    <td className="max-w-xs px-4 py-3 text-foreground">
                      <div className="line-clamp-1">{bid.tenderTitle}</div>
                      <div className="text-xs text-muted-foreground">{bid.tenderNumber}</div>
                    </td>
                    <td className="tnum hidden px-4 py-3 text-muted-foreground sm:table-cell">{formatDate(bid.submittedAt)}</td>
                    <td className="tnum px-4 py-3 text-right font-semibold text-foreground">{formatBDT(bid.totalBidAmount)}</td>
                    <td className="px-4 py-3"><StatusPill status={bid.status} /></td>
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

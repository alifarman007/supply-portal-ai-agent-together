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
import { useTenders, useBids } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import type { TenderStatus } from "@/lib/mock/types";

const TENDER_STATUSES: { value: TenderStatus | "all"; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "published", label: "Published" },
  { value: "evaluation", label: "Under Evaluation" },
  { value: "negotiation", label: "Negotiation" },
  { value: "awarded", label: "Awarded" },
  { value: "closed", label: "Closed" },
  { value: "cancelled", label: "Cancelled" },
];

export default function TendersPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<TenderStatus | "all">("all");

  const { data: tenders, isLoading } = useTenders({ status, search });
  const { data: bids } = useBids();
  const bidByTender = new Map((bids ?? []).map((b) => [b.tenderId, b]));

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Tenders / RFQs"
        subtitle="Browse published tenders, check eligibility and track your bid status"
      />

      <div className="glass p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by tender #, title or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <div className="flex items-center gap-2">
            <Filter className="size-4 text-muted-foreground" />
            <Select value={status} onValueChange={(v) => setStatus(v as TenderStatus | "all")}>
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TENDER_STATUSES.map((s) => (
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
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tender #</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Title</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground md:table-cell">Category</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:table-cell">Submission Deadline</th>
                <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Est. Value (BDT)</th>
                <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Status</th>
                <th className="hidden px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground lg:table-cell">Your Bid</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {isLoading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    <td colSpan={7} className="px-4 py-3">
                      <Skeleton className="h-5 w-full rounded" />
                    </td>
                  </tr>
                ))
              ) : tenders?.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-muted-foreground">
                    No tenders found.
                  </td>
                </tr>
              ) : (
                tenders?.map((t) => {
                  const bid = bidByTender.get(t.id);
                  return (
                    <tr key={t.id} className="cursor-pointer transition-colors hover:bg-muted/30">
                      <td className="px-4 py-3">
                        <Link href={`/app/tenders/${t.id}`} className="font-semibold text-foreground hover:text-primary dark:hover:text-brand-cream">
                          {t.tenderNumber}
                        </Link>
                      </td>
                      <td className="max-w-xs px-4 py-3 text-foreground">
                        <span className="line-clamp-1">{t.title}</span>
                      </td>
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{t.category}</td>
                      <td className="tnum hidden px-4 py-3 text-muted-foreground sm:table-cell">{formatDate(t.submissionDeadline)}</td>
                      <td className="tnum px-4 py-3 text-right font-semibold text-foreground">{formatBDT(t.estimatedValue)}</td>
                      <td className="px-4 py-3"><StatusPill status={t.status} /></td>
                      <td className="hidden px-4 py-3 lg:table-cell">
                        {bid ? <StatusPill status={bid.status} /> : <span className="text-xs text-muted-foreground">Not submitted</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

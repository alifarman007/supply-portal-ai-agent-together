"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, Inbox } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { formatBDT } from "@/lib/format/money";
import { moneyToNumber } from "@/lib/billcheck/mappers";
import type { QueueRow } from "@/lib/billcheck/types";
import { RECOMMENDATION_TEXT, RECOMMENDATION_TONE } from "./recommendation";

/**
 * Bills waiting for the accounts team.
 *
 * INTERNAL. English only, deliberately — the suppliers' screens stay bilingual, but this
 * is for the accounts team and the CFO, and inventing Bangla for withholding-tax
 * terminology is a good way to be confidently wrong in a second language.
 *
 * Read-only. Approving a bill writes a payment instruction, and the portal has no real
 * authentication, so decisions stay on the agent's own review screen. Each row links
 * there.
 */
export default function BillCheckQueuePage() {
  const { data, isLoading, error } = useQuery<QueueRow[]>({
    queryKey: ["billcheck", "queue"],
    queryFn: async () => {
      const res = await fetch("/api/billcheck/queue");
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Could not load the queue.");
      }
      return res.json();
    },
    retry: false,
  });

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title="Bill Checking"
        subtitle="Bills checked against the purchase order, goods receipt and NBR tax rules"
      />

      {isLoading && (
        <div className="space-y-3">
          <Skeleton className="h-12 rounded-xl" />
          <Skeleton className="h-32 rounded-xl" />
        </div>
      )}

      {error && (
        <Widget title="Bill checking is unavailable">
          <div className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p>{(error as Error).message}</p>
              {/* Never render an empty table here. "Nothing to approve" and "the checker
                  is down" look identical, and only one of them is safe to act on. */}
              <p className="mt-1 opacity-80">
                This is not an empty queue — the queue could not be read at all.
              </p>
            </div>
          </div>
        </Widget>
      )}

      {data && data.length === 0 && (
        <Widget title="Queue">
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Inbox className="size-4" /> No bills are waiting for approval.
          </p>
        </Widget>
      )}

      {data && data.length > 0 && (
        <Widget title={`Awaiting approval (${data.length})`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">Bill</th>
                  <th className="px-3 py-2 text-left font-medium">Order</th>
                  <th className="px-3 py-2 text-left font-medium">Supplier invoice</th>
                  <th className="px-3 py-2 text-left font-medium">Result</th>
                  <th className="px-3 py-2 text-right font-medium">Claimed</th>
                  <th className="px-3 py-2 text-right font-medium">Net payable</th>
                </tr>
              </thead>
              <tbody>
                {data.map((row) => (
                  <tr key={row.bill_id} className="border-t border-border hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <Link
                        href={`/app/billcheck/${encodeURIComponent(row.bill_id)}`}
                        className="font-medium text-primary hover:underline"
                      >
                        {row.bill_id}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{row.po_id}</td>
                    <td className="px-3 py-2 text-muted-foreground">
                      {row.supplier_invoice_no}
                    </td>
                    <td className="px-3 py-2">
                      {row.recommendation ? (
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${RECOMMENDATION_TONE[row.recommendation]}`}
                        >
                          {RECOMMENDATION_TEXT[row.recommendation]}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="tnum px-3 py-2 text-right text-muted-foreground">
                      {formatBDT(moneyToNumber(row.claimed_total_tk))}
                    </td>
                    <td className="tnum px-3 py-2 text-right font-medium text-foreground">
                      {row.net_payable_tk === null
                        ? "—"
                        : formatBDT(moneyToNumber(row.net_payable_tk))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Widget>
      )}
    </div>
  );
}

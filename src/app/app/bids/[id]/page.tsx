"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trophy, ShieldX, Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBid, useRespondToBidClarification } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDateTime } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";

export default function BidDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: bid, isLoading } = useBid(id);
  const canRespond = usePermission("submit_bids");
  const respond = useRespondToBidClarification();
  const [response, setResponse] = useState("");

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[1680px] space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">Bid not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="size-4" /> Go back
        </Button>
      </div>
    );
  }

  const openClarification = bid.clarifications.find((c) => !c.response);

  const onRespond = async () => {
    if (!openClarification) return;
    if (!response.trim()) {
      toast.error("Please enter your response");
      return;
    }
    try {
      await respond.mutateAsync({ bidId: bid.id, clarificationId: openClarification.id, response: response.trim() });
      toast.success("Response submitted", { description: "Your bid has been returned for evaluation." });
      setResponse("");
    } catch {
      toast.error("Failed to submit response");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {bid.bidNumber}
            <StatusPill status={bid.status} />
          </span>
        }
        subtitle={`${bid.tenderNumber} — ${bid.tenderTitle}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            <Button asChild variant="outline">
              <Link href={`/app/tenders/${bid.tenderId}`}>View Tender</Link>
            </Button>
          </div>
        }
      />

      {bid.status === "awarded" && (
        <div className="glass flex items-center gap-3 border-ok/30 bg-ok/10 p-4 text-sm text-ok">
          <Trophy className="size-5 shrink-0" />
          <div>
            <strong>Congratulations — this bid was awarded!</strong> A Purchase Order will follow via the Procurement team.
          </div>
        </div>
      )}

      {bid.status === "not_awarded" && (
        <div className="glass flex items-center gap-3 border-border p-4 text-sm text-muted-foreground">
          <ShieldX className="size-5 shrink-0" />
          <div>This bid was not awarded. See evaluation feedback below.</div>
        </div>
      )}

      {(bid.technicalScore !== undefined || bid.evaluationRemarks) && (
        <Widget title="Evaluation Feedback">
          {(bid.technicalScore !== undefined || bid.financialScore !== undefined) && (
            <div className="mb-3 flex gap-6 text-sm">
              {bid.technicalScore !== undefined && (
                <div>
                  <div className="text-xs text-muted-foreground">Technical Score</div>
                  <div className="tnum text-lg font-bold text-foreground">{bid.technicalScore}/100</div>
                </div>
              )}
              {bid.financialScore !== undefined && (
                <div>
                  <div className="text-xs text-muted-foreground">Financial Score</div>
                  <div className="tnum text-lg font-bold text-foreground">{bid.financialScore}/100</div>
                </div>
              )}
            </div>
          )}
          {bid.evaluationRemarks && (
            <p className="text-sm leading-relaxed text-muted-foreground">{bid.evaluationRemarks}</p>
          )}
        </Widget>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Bid Details">
          <dl className="space-y-3 text-sm">
            {[
              ["Tender Reference", bid.tenderNumber],
              ["Submitted", formatDateTime(bid.submittedAt)],
              ["Bid Validity", `${bid.bidValidityDays} days`],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-36 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
          {bid.technicalNotes && (
            <div className="mt-4 rounded-lg bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Technical Notes: </span>{bid.technicalNotes}
            </div>
          )}
        </Widget>

        <Widget title="Financial Summary">
          <dl className="space-y-3 text-sm">
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tnum font-semibold text-foreground">{formatBDT(bid.subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-muted-foreground">VAT (15%)</dt>
              <dd className="tnum text-foreground">{formatBDT(bid.vatAmount)}</dd>
            </div>
            <div className="flex justify-between border-t border-border pt-2 text-base">
              <dt className="font-bold text-foreground">Total Bid Amount</dt>
              <dd className="tnum font-bold text-foreground">{formatBDT(bid.totalBidAmount)}</dd>
            </div>
          </dl>
        </Widget>
      </div>

      {/* Proposal Items */}
      <Widget title={`Technical & Financial Proposal (${bid.items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Specification Offered</th>
                <th className="py-2 pr-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
                <th className="py-2 pr-4 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit Price</th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {bid.items.map((item) => (
                <tr key={item.id}>
                  <td className="py-2.5 pr-4 font-medium text-foreground">{item.description}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{item.specificationOffered}</td>
                  <td className="py-2.5 pr-4 text-center text-muted-foreground">{item.unit}</td>
                  <td className="tnum py-2.5 pr-4 text-right text-foreground">{item.quantity.toLocaleString("en-IN")}</td>
                  <td className="tnum py-2.5 pr-4 text-right text-muted-foreground">{formatBDT(item.unitPrice)}</td>
                  <td className="tnum py-2.5 text-right font-semibold text-foreground">{formatBDT(item.totalPrice)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-border">
                <td colSpan={5} className="py-2.5 pr-4 text-right text-sm font-semibold text-muted-foreground">Subtotal</td>
                <td className="tnum py-2.5 text-right font-bold text-foreground">{formatBDT(bid.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Widget>

      {/* Negotiation / Clarification */}
      {bid.clarifications.length > 0 && (
        <Widget title="Negotiation & Clarification">
          <div className="space-y-4">
            {bid.clarifications.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-3">
                <div className="text-sm font-medium text-foreground">Buyer: {c.question}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.askedBy} · {formatDateTime(c.askedAt)}</div>
                {c.response ? (
                  <div className="mt-3 rounded-lg bg-muted/40 p-2.5">
                    <div className="text-sm text-foreground">You: {c.response}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{c.respondedAt && formatDateTime(c.respondedAt)}</div>
                  </div>
                ) : (
                  canRespond && (
                    <div className="mt-3 space-y-2">
                      <Textarea
                        placeholder="Type your response to the buyer's question…"
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        rows={3}
                      />
                      <div className="flex justify-end">
                        <Button size="sm" onClick={onRespond} disabled={respond.isPending} className="gap-2 bg-brand-red text-white hover:bg-brand-red-600">
                          {respond.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                          Send Response
                        </Button>
                      </div>
                    </div>
                  )
                )}
              </div>
            ))}
          </div>
        </Widget>
      )}

      {/* Timeline */}
      {bid.timeline.length > 0 && (
        <Widget title="Bid Status Timeline">
          <ol className="relative space-y-4 border-l border-border pl-6">
            {bid.timeline.map((event, idx) => (
              <li key={idx} className="relative">
                <span className="absolute -left-[21px] top-0.5 flex size-3.5 items-center justify-center rounded-full bg-brand-red ring-2 ring-background" />
                <div className="flex items-center gap-2">
                  <StatusPill status={event.status} />
                  <span className="tnum text-xs text-muted-foreground">{formatDateTime(event.timestamp)}</span>
                </div>
                {event.actor && <p className="mt-1 text-xs text-muted-foreground">by {event.actor}</p>}
                {event.note && <p className="mt-0.5 text-xs text-foreground">{event.note}</p>}
              </li>
            ))}
          </ol>
        </Widget>
      )}
    </div>
  );
}

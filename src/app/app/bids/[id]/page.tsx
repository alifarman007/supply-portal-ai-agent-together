"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Trophy, ShieldX, Send, Loader2, FileText } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Field, ValueChip } from "@/components/common/DetailField";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useBid, useRespondToBidClarification } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, formatDateTime, daysUntil } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";
import type { Bid } from "@/lib/mock/types";

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
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
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
      await respond.mutateAsync({
        bidId: bid.id,
        clarificationId: openClarification.id,
        response: response.trim(),
      });
      toast.success("Response submitted", {
        description: "Your bid has been returned for evaluation.",
      });
      setResponse("");
    } catch {
      toast.error("Failed to submit response");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {bid.bidNumber}
            <StatusPill status={bid.status} variant="solid" />
          </span>
        }
        subtitle={`Submitted: ${formatDate(bid.submittedAt)}  ·  Tender: ${bid.tenderNumber}  ·  Validity: ${bid.bidValidityDays} days`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> Back to Bids
            </Button>
            <Button asChild className="gap-2">
              <Link href={`/app/tenders/${bid.tenderId}`}>
                <FileText className="size-4" /> View Tender
              </Link>
            </Button>
          </div>
        }
      />

      {bid.status === "awarded" && (
        <div className="glass flex items-center gap-3 border-ok/30 bg-ok/10 p-4 text-sm text-ok">
          <Trophy className="size-5 shrink-0" />
          <div>
            <strong>Congratulations — this bid was awarded!</strong> A Purchase Order will
            follow via the Procurement team.
          </div>
        </div>
      )}

      {bid.status === "not_awarded" && (
        <div className="glass flex items-center gap-3 border-border p-4 text-sm text-muted-foreground">
          <ShieldX className="size-5 shrink-0" />
          <div>This bid was not awarded. See the evaluation result below.</div>
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Widget title="Bid Details" className="lg:col-span-2">
          <Link
            href={`/app/tenders/${bid.tenderId}`}
            className="font-heading text-base font-bold text-foreground hover:text-primary"
          >
            {bid.tenderTitle}
          </Link>
          {bid.technicalNotes && (
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              {bid.technicalNotes}
            </p>
          )}

          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label="Tender Reference" value={bid.tenderNumber} />
            <Field label="Bid Number" value={bid.bidNumber} />
            <Field label="Submitted" value={formatDateTime(bid.submittedAt)} />
            <Field label="Bid Validity" value={`${bid.bidValidityDays} days`} />
            <Field label="Line Items" value={String(bid.items.length)} />
            <Field label="Total Bid Amount" value={formatBDT(bid.totalBidAmount)} />
          </dl>
        </Widget>

        <EvaluationCard bid={bid} />
      </div>

      {/* Body bleeds to the card edges so the header band spans the full width. */}
      <Widget
        title={`Technical & Financial Proposal (${bid.items.length})`}
        className="overflow-hidden"
        bodyClassName="-mx-6 -mb-6"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color-mix(in_oklab,var(--brand-yellow)_22%,transparent)] text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/70 uppercase">
                <th scope="col" className="py-3.5 pr-4 pl-6 text-left">#</th>
                <th scope="col" className="w-full min-w-[15rem] py-3.5 pr-4 text-left">Description</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Unit</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Qty</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Unit Price</th>
                <th scope="col" className="py-3.5 pr-6 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {bid.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-4 pr-4 pl-6 align-middle text-muted-foreground">
                    {idx + 1}
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <span className="font-medium text-foreground">{item.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.specificationOffered}
                    </span>
                  </td>
                  <td className="py-4 pr-4 align-middle whitespace-nowrap text-muted-foreground">
                    {item.unit}
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <ValueChip>{item.quantity.toLocaleString("en-IN")}</ValueChip>
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <ValueChip>{formatBDT(item.unitPrice, { decimals: 2 })}</ValueChip>
                  </td>
                  <td className="tnum py-4 pr-6 text-right align-middle font-semibold whitespace-nowrap text-foreground">
                    {formatBDT(item.totalPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="space-y-2.5 border-t border-border px-6 py-4 text-sm">
          <div className="flex items-center justify-end gap-6">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tnum w-40 text-right font-medium text-foreground">
              {formatBDT(bid.subtotal)}
            </dd>
          </div>
          <div className="flex items-center justify-end gap-6">
            <dt className="text-muted-foreground">VAT (15%)</dt>
            <dd className="tnum w-40 text-right font-medium text-foreground">
              {formatBDT(bid.vatAmount)}
            </dd>
          </div>
          <div className="flex items-center justify-end gap-6 border-t border-border pt-2.5">
            <dt className="font-medium text-muted-foreground">Total Bid Amount</dt>
            <dd className="tnum font-heading w-40 text-right text-lg font-bold text-foreground">
              {formatBDT(bid.totalBidAmount)}
            </dd>
          </div>
        </dl>
      </Widget>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Widget title="Negotiation & Clarification">
          {bid.clarifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              The buyer has not raised any clarification on this bid.
            </p>
          ) : (
            <div className="space-y-4">
              {bid.clarifications.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3">
                  <div className="text-sm font-medium text-foreground">Buyer: {c.question}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.askedBy} · {formatDateTime(c.askedAt)}
                  </div>
                  {c.response ? (
                    <div className="mt-3 rounded-lg bg-muted/40 p-2.5">
                      <div className="text-sm text-foreground">You: {c.response}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.respondedAt && formatDateTime(c.respondedAt)}
                      </div>
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
                          <Button
                            size="sm"
                            onClick={onRespond}
                            disabled={respond.isPending}
                            className="gap-2"
                          >
                            {respond.isPending ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <Send className="size-3.5" />
                            )}
                            Send Response
                          </Button>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ))}
            </div>
          )}
        </Widget>

        <Widget title="Bid Status Timeline">
          {bid.timeline.length === 0 ? (
            <p className="text-sm text-muted-foreground">No activity recorded yet.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-border pl-6">
              {bid.timeline.map((event, idx) => (
                <li key={idx} className="relative">
                  <span className="absolute top-0.5 -left-[27px] flex size-3.5 items-center justify-center rounded-full bg-primary ring-2 ring-card" />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill status={event.status} />
                    <span className="tnum text-xs text-muted-foreground">
                      {formatDateTime(event.timestamp)}
                    </span>
                  </div>
                  {event.actor && (
                    <p className="mt-1 text-xs text-muted-foreground">by {event.actor}</p>
                  )}
                  {event.note && <p className="mt-0.5 text-xs text-foreground">{event.note}</p>}
                </li>
              ))}
            </ol>
          )}
        </Widget>
      </div>
    </div>
  );
}

/** Right-hand rail mirroring the tender page's "Your Bid Status" card. */
function EvaluationCard({ bid }: { bid: Bid }) {
  const hasScores = bid.technicalScore !== undefined || bid.financialScore !== undefined;
  // submittedAt is in the past, so daysUntil is negative — flip it.
  const daysSince = Math.max(0, -daysUntil(bid.submittedAt));
  const decided = ["awarded", "not_awarded", "rejected"].includes(bid.status);

  const note =
    bid.status === "clarification_requested"
      ? "The buyer is waiting on your response before evaluation can resume."
      : bid.status === "awarded"
        ? "This bid won. A Purchase Order will follow from Procurement."
        : bid.status === "not_awarded"
          ? "The tender was awarded to another supplier."
          : bid.status === "rejected"
            ? "This bid was rejected and will not proceed to evaluation."
            : "Your bid is with the evaluation committee. You'll be notified of any change.";

  return (
    <Widget title="Evaluation Status">
      <StatusPill status={bid.status} variant="solid" />

      {hasScores ? (
        <div className="mt-5 grid grid-cols-2 gap-4">
          <Field
            label="Technical Score"
            value={
              bid.technicalScore !== undefined ? `${bid.technicalScore}/100` : "Not scored"
            }
          />
          <Field
            label="Financial Score"
            value={
              bid.financialScore !== undefined ? `${bid.financialScore}/100` : "Not scored"
            }
          />
        </div>
      ) : (
        <div className="mt-5">
          <div className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {decided
              ? "Decided"
              : bid.status === "clarification_requested"
                ? "Awaiting your response"
                : "In evaluation"}
          </div>
          <div className="font-heading mt-1 text-lg font-bold text-foreground">
            {daysSince} day{daysSince === 1 ? "" : "s"} since submission
          </div>
        </div>
      )}

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{note}</p>

      {bid.evaluationRemarks && (
        <div className="mt-4 rounded-lg bg-muted/40 p-3 text-sm text-muted-foreground">
          <span className="font-semibold text-foreground">Remarks: </span>
          {bid.evaluationRemarks}
        </div>
      )}
    </Widget>
  );
}

"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, CheckCircle2, XCircle, Send, Loader2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTender, useBidForTender, useDocuments, useAskTenderQuestion } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, formatDateTime } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";
import type { DocumentType } from "@/lib/mock/types";

const DOC_LABELS: Record<DocumentType, string> = {
  trade_license: "Trade License",
  tin_certificate: "TIN Certificate",
  vat_registration: "VAT Registration (BIN)",
  bank_solvency: "Bank Solvency Certificate",
  iso_certification: "ISO Certification",
};

export default function TenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { data: tender, isLoading } = useTender(id);
  const { data: existingBid } = useBidForTender(id);
  const { data: documents } = useDocuments();
  const canSubmitBids = usePermission("submit_bids");
  const askQuestion = useAskTenderQuestion();
  const [question, setQuestion] = useState("");

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

  if (!tender) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">Tender not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="size-4" /> Go back
        </Button>
      </div>
    );
  }

  const docByType = new Map((documents ?? []).map((d) => [d.type, d]));
  const isDocAcceptable = (type: DocumentType) => {
    const status = docByType.get(type)?.status;
    return status === "valid" || status === "expiring_soon";
  };
  const missingDocs = tender.requiredDocuments.filter((type) => !isDocAcceptable(type));
  const isPrequalified = missingDocs.length === 0;
  const canBid = canSubmitBids && tender.status === "published" && !existingBid;

  const onAskQuestion = async () => {
    if (!question.trim()) {
      toast.error("Please enter your question");
      return;
    }
    try {
      await askQuestion.mutateAsync({ tenderId: tender.id, question: question.trim() });
      toast.success("Question submitted", { description: "The buyer will respond via this thread." });
      setQuestion("");
    } catch {
      toast.error("Failed to submit question");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            {tender.tenderNumber}
            <StatusPill status={tender.status} />
          </span>
        }
        subtitle={`${tender.category} · Published: ${formatDate(tender.publishedDate)} · Deadline: ${formatDate(tender.submissionDeadline)}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> Back
            </Button>
            {existingBid ? (
              <Button asChild className="gap-2 bg-brand-red text-white hover:bg-brand-red-600">
                <Link href={`/app/bids/${existingBid.id}`}>
                  <FileSignature className="size-4" /> View My Bid
                </Link>
              </Button>
            ) : (
              canBid && (
                isPrequalified ? (
                  <Button asChild className="gap-2 bg-brand-red text-white hover:bg-brand-red-600">
                    <Link href={`/app/tenders/${tender.id}/bid`}>
                      <Send className="size-4" /> Submit Bid
                    </Link>
                  </Button>
                ) : (
                  <Button disabled title="Complete prequalification before bidding" className="gap-2">
                    <Send className="size-4" /> Submit Bid
                  </Button>
                )
              )
            )}
          </div>
        }
      />

      <h1 className="-mt-4 text-lg font-semibold text-foreground">{tender.title}</h1>
      <p className="text-sm leading-relaxed text-muted-foreground">{tender.description}</p>

      {tender.status === "cancelled" && tender.cancelReason && (
        <div className="glass border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <strong>Tender cancelled: </strong>{tender.cancelReason}
        </div>
      )}

      {tender.status === "awarded" && tender.awardedSupplierName && (
        <div className={`glass p-4 text-sm ${tender.awardedSupplierName === "Dhaka Packaging Industries Ltd." ? "border-ok/30 bg-ok/10 text-ok" : "border-border text-muted-foreground"}`}>
          <strong>Awarded to: </strong>{tender.awardedSupplierName}
          {tender.awardedAt && <> on {formatDate(tender.awardedAt)}</>}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Widget title="Tender Details">
          <dl className="space-y-3 text-sm">
            {[
              ["Buyer Department", tender.buyerDepartment],
              ["Contact Person", tender.buyerContactName],
              ["Contact Email", tender.buyerContactEmail],
              ["Estimated Value", formatBDT(tender.estimatedValue)],
              ["Published Date", formatDate(tender.publishedDate)],
              ["Submission Deadline", formatDate(tender.submissionDeadline)],
              ["Bid Opening Date", formatDate(tender.bidOpeningDate)],
            ].map(([label, value]) => (
              <div key={label} className="flex gap-2">
                <dt className="w-40 shrink-0 text-muted-foreground">{label}</dt>
                <dd className="font-medium text-foreground">{value}</dd>
              </div>
            ))}
          </dl>
        </Widget>

        <Widget title="Prequalification Checklist">
          <div className={`mb-3 rounded-lg px-3 py-2 text-xs font-semibold ${isPrequalified ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"}`}>
            {isPrequalified ? "You are prequalified to bid on this tender." : "Action required: one or more required documents are missing or invalid."}
          </div>
          <ul className="space-y-2 text-sm">
            {tender.requiredDocuments.map((type) => {
              const doc = docByType.get(type);
              const ok = isDocAcceptable(type);
              return (
                <li key={type} className="flex items-center gap-2">
                  {ok ? (
                    <CheckCircle2 className="size-4 shrink-0 text-ok" />
                  ) : (
                    <XCircle className="size-4 shrink-0 text-danger" />
                  )}
                  <span className="flex-1 text-foreground">{DOC_LABELS[type]}</span>
                  {doc ? <StatusPill status={doc.status} /> : <span className="text-xs text-muted-foreground">Not uploaded</span>}
                </li>
              );
            })}
          </ul>
          {!isPrequalified && (
            <p className="mt-3 text-xs text-muted-foreground">
              Update your documents in{" "}
              <Link href="/app/documents" className="font-semibold text-primary hover:underline dark:text-brand-cream">
                Compliance Documents
              </Link>{" "}
              before submitting a bid.
            </p>
          )}
        </Widget>
      </div>

      <Widget title="Eligibility Criteria">
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          {tender.eligibilityCriteria.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ul>
      </Widget>

      <Widget title={`Requirement Line Items (${tender.items.length})`}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">#</th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</th>
                <th className="py-2 pr-4 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">Specification</th>
                <th className="py-2 pr-4 text-center text-xs font-semibold uppercase tracking-wide text-muted-foreground">Unit</th>
                <th className="py-2 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {tender.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-2.5 pr-4 text-muted-foreground">{idx + 1}</td>
                  <td className="py-2.5 pr-4 font-medium text-foreground">{item.description}</td>
                  <td className="py-2.5 pr-4 text-muted-foreground">{item.specification}</td>
                  <td className="py-2.5 pr-4 text-center text-muted-foreground">{item.unit}</td>
                  <td className="tnum py-2.5 text-right text-foreground">{item.quantity.toLocaleString("en-IN")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>

      <Widget title="Clarifications & Communication">
        {tender.clarifications.length === 0 ? (
          <p className="text-sm text-muted-foreground">No questions have been asked about this tender yet.</p>
        ) : (
          <div className="space-y-4">
            {tender.clarifications.map((c) => (
              <div key={c.id} className="rounded-xl border border-border p-3">
                <div className="text-sm font-medium text-foreground">Q: {c.question}</div>
                <div className="mt-1 text-xs text-muted-foreground">{c.askedBy} · {formatDateTime(c.askedAt)}</div>
                {c.response ? (
                  <div className="mt-3 rounded-lg bg-muted/40 p-2.5">
                    <div className="text-sm text-foreground">A: {c.response}</div>
                    <div className="mt-1 text-xs text-muted-foreground">{c.respondedBy} · {c.respondedAt && formatDateTime(c.respondedAt)}</div>
                  </div>
                ) : (
                  <div className="mt-2 text-xs text-warn">Awaiting response from buyer</div>
                )}
              </div>
            ))}
          </div>
        )}

        {tender.status === "published" && (
          <div className="mt-4 space-y-2 border-t border-border pt-4">
            <Textarea
              placeholder="Ask a question about this tender…"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              rows={2}
            />
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="outline"
                onClick={onAskQuestion}
                disabled={askQuestion.isPending}
                className="gap-2"
              >
                {askQuestion.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
                Ask Question
              </Button>
            </div>
          </div>
        )}
      </Widget>
    </div>
  );
}

"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RequirePermission } from "@/components/common/RequirePermission";
import { useTender, useBidForTender, useSubmitBid } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate } from "@/lib/format/date";
import { VAT_RATE, calcVAT } from "@/lib/format/tax";
import type { Tender } from "@/lib/mock/types";

interface BidItemDraft {
  tenderLineItemId: string;
  description: string;
  unit: string;
  quantity: number;
  specificationOffered: string;
  unitPrice: number;
}

export default function SubmitBidPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="submit_bids" redirectTo={`/app/tenders/${id}`}>
      <SubmitBidLoader tenderId={id} />
    </RequirePermission>
  );
}

function SubmitBidLoader({ tenderId }: { tenderId: string }) {
  const router = useRouter();
  const { data: tender, isLoading } = useTender(tenderId);
  const { data: existingBid } = useBidForTender(tenderId);

  if (isLoading || !tender) {
    return (
      <div className="mx-auto max-w-[1680px] space-y-6">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (existingBid || tender.status !== "published") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">
          {existingBid ? "You have already submitted a bid for this tender." : "This tender is no longer open for bidding."}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => router.push(`/app/tenders/${tenderId}`)}>
          <ArrowLeft className="size-4" /> Back to Tender
        </Button>
      </div>
    );
  }

  return <SubmitBidForm tender={tender} />;
}

function SubmitBidForm({ tender }: { tender: Tender }) {
  const router = useRouter();
  const submitBid = useSubmitBid();

  const [technicalNotes, setTechnicalNotes] = useState("");
  const [bidValidityDays, setBidValidityDays] = useState(90);
  const [items, setItems] = useState<BidItemDraft[]>(() =>
    tender.items.map((i) => ({
      tenderLineItemId: i.id,
      description: i.description,
      unit: i.unit,
      quantity: i.quantity,
      specificationOffered: i.specification,
      unitPrice: 0,
    })),
  );

  const updateItem = (idx: number, field: keyof BidItemDraft, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === idx ? { ...item, [field]: value } : item)));
  };

  const subtotal = items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
  const vatAmount = calcVAT(subtotal);
  const totalBidAmount = subtotal + vatAmount;

  const onSubmit = async () => {
    if (items.some((i) => !i.specificationOffered || i.unitPrice <= 0)) {
      toast.error("Please provide a specification and unit price for every item");
      return;
    }
    try {
      const bid = await submitBid.mutateAsync({
        tenderId: tender.id,
        tenderNumber: tender.tenderNumber,
        tenderTitle: tender.title,
        technicalNotes,
        bidValidityDays,
        items,
      });
      toast.success("Bid submitted", { description: `${bid.bidNumber} has been submitted for evaluation.` });
      router.push(`/app/bids/${bid.id}`);
    } catch {
      toast.error("Failed to submit bid");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-6">
      <PageHeader
        title="Submit Bid"
        subtitle={`${tender.tenderNumber} — ${tender.title}`}
        actions={
          <Button variant="outline" onClick={() => router.back()}>
            <ArrowLeft className="size-4" /> Back
          </Button>
        }
      />

      <div className="glass p-4 text-xs text-muted-foreground">
        Submission deadline: <strong className="text-foreground">{formatDate(tender.submissionDeadline)}</strong>
        {" · "}Bid opening: <strong className="text-foreground">{formatDate(tender.bidOpeningDate)}</strong>
      </div>

      {/* Technical Proposal */}
      <Widget title="Technical Proposal">
        <div className="space-y-3">
          <div className="hidden grid-cols-[1fr_1fr_90px] gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Required Specification</span>
            <span>Specification Offered</span>
            <span className="text-right">Qty</span>
          </div>
          {items.map((item, idx) => (
            <div key={item.tenderLineItemId} className="space-y-1.5 rounded-xl border border-border p-3">
              <div className="text-sm font-medium text-foreground">{item.description}</div>
              <div className="grid gap-2 sm:grid-cols-[1fr_90px]">
                <Textarea
                  placeholder="Describe the specification you are offering…"
                  value={item.specificationOffered}
                  onChange={(e) => updateItem(idx, "specificationOffered", e.target.value)}
                  rows={2}
                />
                <div className="space-y-1">
                  <Label className="text-xs text-muted-foreground">Qty ({item.unit})</Label>
                  <Input value={item.quantity} disabled className="text-right tnum" />
                </div>
              </div>
            </div>
          ))}
          <div className="space-y-1.5">
            <Label>Additional Technical Notes</Label>
            <Textarea
              placeholder="Delivery capability, lead time, quality assurance, warranty, etc…"
              value={technicalNotes}
              onChange={(e) => setTechnicalNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
      </Widget>

      {/* Financial Proposal */}
      <Widget title="Financial Proposal">
        <div className="space-y-3">
          <div className="hidden grid-cols-[1fr_80px_100px_120px] gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground sm:grid">
            <span>Description</span>
            <span className="text-center">Unit</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Unit Price</span>
          </div>
          {items.map((item, idx) => (
            <div key={item.tenderLineItemId} className="grid gap-2 sm:grid-cols-[1fr_80px_100px_120px]">
              <Input value={item.description} disabled />
              <Input value={item.unit} disabled className="text-center" />
              <Input value={item.quantity} disabled className="text-right tnum" />
              <Input
                type="number"
                placeholder="Unit price"
                value={item.unitPrice || ""}
                min={0}
                onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))}
                className="text-right"
              />
            </div>
          ))}
          <div className="max-w-xs space-y-1.5">
            <Label>Bid Validity (days)</Label>
            <Input
              type="number"
              min={1}
              value={bidValidityDays}
              onChange={(e) => setBidValidityDays(Number(e.target.value))}
            />
          </div>
        </div>
      </Widget>

      {/* Summary */}
      <Widget title="Bid Summary">
        <dl className="space-y-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tnum font-semibold text-foreground">{formatBDT(subtotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">VAT ({(VAT_RATE * 100).toFixed(0)}%)</dt>
            <dd className="tnum text-foreground">+{formatBDT(vatAmount)}</dd>
          </div>
          <div className="flex justify-between border-t border-border pt-3 text-base">
            <dt className="font-bold text-foreground">Total Bid Amount</dt>
            <dd className="tnum font-bold text-foreground">{formatBDT(totalBidAmount)}</dd>
          </div>
        </dl>

        <Button
          className="mt-4 w-full gap-2 bg-brand-red text-white hover:bg-brand-red-600"
          disabled={submitBid.isPending}
          onClick={onSubmit}
        >
          {submitBid.isPending ? (
            <><Loader2 className="size-4 animate-spin" /> Submitting…</>
          ) : (
            "Submit Bid"
          )}
        </Button>
      </Widget>
    </div>
  );
}

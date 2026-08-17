"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Field, ValueChip } from "@/components/common/DetailField";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { RequirePermission } from "@/components/common/RequirePermission";
import { useTender, useBidForTender, useSubmitBid } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, daysUntil } from "@/lib/format/date";
import { VAT_RATE, calcVAT } from "@/lib/format/tax";
import type { Tender } from "@/lib/mock/types";

/** Header band shared with the tender and purchase order detail tables. */
const BAND =
  "bg-[color-mix(in_oklab,var(--brand-yellow)_22%,transparent)] text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/70 uppercase";

interface BidItemDraft {
  tenderLineItemId: string;
  description: string;
  unit: string;
  quantity: number;
  estimatedUnitPrice: number;
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
      <div className="mx-auto max-w-[1680px] space-y-5">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-xl lg:col-span-2" />
          <Skeleton className="h-56 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (existingBid || tender.status !== "published") {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">
          {existingBid
            ? "You have already submitted a bid for this tender."
            : "This tender is no longer open for bidding."}
        </p>
        <Button
          variant="outline"
          className="mt-4"
          onClick={() => router.push(`/app/tenders/${tenderId}`)}
        >
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
      estimatedUnitPrice: i.estimatedUnitPrice,
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
  const estimatedTotal = tender.items.reduce(
    (s, i) => s + i.quantity * i.estimatedUnitPrice,
    0,
  );
  const daysLeft = daysUntil(tender.submissionDeadline);

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
      toast.success("Bid submitted", {
        description: `${bid.bidNumber} has been submitted for evaluation.`,
      });
      router.push(`/app/bids/${bid.id}`);
    } catch {
      toast.error("Failed to submit bid");
    }
  };

  return (
    <div className="mx-auto max-w-[1680px] space-y-5">
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {tender.tenderNumber}
            <StatusPill status={tender.status} variant="solid" />
          </span>
        }
        subtitle={`Submitting a bid  ·  Deadline: ${formatDate(tender.submissionDeadline)}  ·  Bid Opening: ${formatDate(tender.bidOpeningDate)}`}
        actions={
          <Button variant="outline" onClick={() => router.push(`/app/tenders/${tender.id}`)}>
            <ArrowLeft className="size-4" /> Back to Tender
          </Button>
        }
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Widget title="Tender Details" className="lg:col-span-2">
          <p className="font-heading text-base font-bold text-foreground">{tender.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {tender.description}
          </p>

          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label="Buyer Department" value={tender.buyerDepartment} />
            <Field label="Category" value={tender.category} />
            <Field label="Submission Deadline" value={formatDate(tender.submissionDeadline)} />
            <Field label="Bid Opening Date" value={formatDate(tender.bidOpeningDate)} />
            <Field label="Estimated Value" value={formatBDT(estimatedTotal)} />
            <Field label="Line Items" value={`${tender.items.length}`} />
          </dl>
        </Widget>

        <Widget title="Your Bid Summary">
          <div className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            Time Remaining
          </div>
          <div className="font-heading mt-1 text-lg font-bold text-foreground">
            {daysLeft <= 0
              ? "Submission closed"
              : `${daysLeft} day${daysLeft === 1 ? "" : "s"} left`}
          </div>

          <dl className="mt-5 space-y-3 border-t border-border pt-4 text-sm">
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tnum font-semibold whitespace-nowrap text-foreground">
                {formatBDT(subtotal)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-4">
              <dt className="text-muted-foreground">VAT ({(VAT_RATE * 100).toFixed(0)}%)</dt>
              <dd className="tnum whitespace-nowrap text-foreground">+{formatBDT(vatAmount)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-4 border-t border-border pt-3">
              <dt className="font-semibold text-foreground">Total Bid Amount</dt>
              <dd className="tnum font-heading text-lg font-bold whitespace-nowrap text-foreground">
                {formatBDT(totalBidAmount)}
              </dd>
            </div>
          </dl>

          <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
            Quote against every line before submitting. Your bid cannot be edited once it goes
            in for evaluation.
          </p>
        </Widget>
      </div>

      {/* Body bleeds to the card edges so the header band spans the full width. */}
      <Widget
        title={`Technical Proposal (${items.length})`}
        className="overflow-hidden"
        bodyClassName="-mx-6 -mb-6"
      >
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className={BAND}>
                <th scope="col" className="py-3.5 pr-4 pl-6 text-left">#</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Description</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Required Specification</th>
                <th scope="col" className="w-full min-w-[18rem] py-3.5 pr-4 text-left">Specification Offered</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Unit</th>
                <th scope="col" className="py-3.5 pr-6 text-left">Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, idx) => (
                <tr key={item.tenderLineItemId}>
                  <td className="py-4 pr-4 pl-6 align-top text-muted-foreground">{idx + 1}</td>
                  <td className="py-4 pr-4 align-top font-medium text-foreground">
                    {item.description}
                  </td>
                  <td className="py-4 pr-4 align-top text-muted-foreground">
                    {tender.items[idx].specification}
                  </td>
                  <td className="py-4 pr-4 align-top">
                    <Textarea
                      aria-label={`Specification offered for ${item.description}`}
                      placeholder="Describe the specification you are offering…"
                      value={item.specificationOffered}
                      onChange={(e) => updateItem(idx, "specificationOffered", e.target.value)}
                      rows={2}
                      className="min-w-[18rem] rounded-lg"
                    />
                  </td>
                  <td className="py-4 pr-4 align-top whitespace-nowrap text-muted-foreground">
                    {item.unit}
                  </td>
                  <td className="py-4 pr-6 align-top">
                    <ValueChip>{item.quantity.toLocaleString("en-IN")}</ValueChip>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Widget>

      <Widget
        title={`Financial Proposal (${items.length})`}
        className="overflow-hidden"
        bodyClassName="-mx-6 -mb-6"
      >
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className={BAND}>
                <th scope="col" className="py-3.5 pr-4 pl-6 text-left">#</th>
                <th scope="col" className="w-full min-w-[15rem] py-3.5 pr-4 text-left">Description</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Unit</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Qty</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Est. Unit Price</th>
                <th scope="col" className="py-3.5 pr-4 text-left">Your Unit Price</th>
                <th scope="col" className="py-3.5 pr-6 text-right">Line Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {items.map((item, idx) => (
                <tr key={item.tenderLineItemId}>
                  <td className="py-4 pr-4 pl-6 align-middle text-muted-foreground">{idx + 1}</td>
                  <td className="py-4 pr-4 align-middle font-medium text-foreground">
                    {item.description}
                  </td>
                  <td className="py-4 pr-4 align-middle whitespace-nowrap text-muted-foreground">
                    {item.unit}
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <ValueChip>{item.quantity.toLocaleString("en-IN")}</ValueChip>
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <ValueChip>{formatBDT(item.estimatedUnitPrice, { decimals: 2 })}</ValueChip>
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <Input
                      type="number"
                      min={0}
                      aria-label={`Your unit price for ${item.description}`}
                      placeholder="0.00"
                      value={item.unitPrice || ""}
                      onChange={(e) => updateItem(idx, "unitPrice", Number(e.target.value))}
                      className="tnum h-10 w-32 rounded-lg text-right"
                    />
                  </td>
                  <td className="tnum py-4 pr-6 text-right align-middle font-semibold whitespace-nowrap text-foreground">
                    {item.unitPrice > 0 ? (
                      formatBDT(item.quantity * item.unitPrice)
                    ) : (
                      <span className="font-normal text-muted-foreground">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <dl className="space-y-2.5 border-t border-border px-6 py-4 text-sm">
          <div className="flex items-baseline justify-end gap-6">
            <dt className="text-muted-foreground">Subtotal</dt>
            <dd className="tnum w-40 text-right font-semibold text-foreground">
              {formatBDT(subtotal)}
            </dd>
          </div>
          <div className="flex items-baseline justify-end gap-6">
            <dt className="text-muted-foreground">VAT ({(VAT_RATE * 100).toFixed(0)}%)</dt>
            <dd className="tnum w-40 text-right text-foreground">+{formatBDT(vatAmount)}</dd>
          </div>
          <div className="flex items-baseline justify-end gap-6 border-t border-border pt-2.5">
            <dt className="font-medium text-foreground">Total Bid Amount</dt>
            <dd className="tnum font-heading w-40 text-right text-lg font-bold text-foreground">
              {formatBDT(totalBidAmount)}
            </dd>
          </div>
        </dl>
      </Widget>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Widget title="Additional Technical Notes">
          <Textarea
            aria-label="Additional technical notes"
            placeholder="Delivery capability, lead time, quality assurance, warranty, etc…"
            value={technicalNotes}
            onChange={(e) => setTechnicalNotes(e.target.value)}
            rows={5}
            className="rounded-lg"
          />
        </Widget>

        <Widget title="Bid Validity">
          <div className="max-w-xs space-y-2">
            <Label
              htmlFor="bid-validity"
              className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
            >
              Validity Period (days)
            </Label>
            <Input
              id="bid-validity"
              type="number"
              min={1}
              value={bidValidityDays}
              onChange={(e) => setBidValidityDays(Number(e.target.value))}
              className="tnum h-11 rounded-xl"
            />
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted-foreground">
            How long your quoted prices stay firm after the submission deadline. Most Kazi Farms
            tenders expect at least 90 days.
          </p>
        </Widget>
      </div>

      <div className="flex items-center justify-end gap-3">
        <Button variant="outline" onClick={() => router.push(`/app/tenders/${tender.id}`)}>
          Cancel
        </Button>
        <Button onClick={onSubmit} disabled={submitBid.isPending} className="gap-2">
          {submitBid.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <Send className="size-4" />
          )}
          Submit Bid
        </Button>
      </div>
    </div>
  );
}

"use client";

import { use, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Info, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { RequirePermission } from "@/components/common/RequirePermission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { usePurchaseOrder, useCreateInvoice } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, DEMO_NOW } from "@/lib/format/date";
import { VAT_RATE, AIT_RATE, calcVAT, calcAIT } from "@/lib/format/tax";
import type { PurchaseOrder } from "@/lib/mock/types";

/** Bills fall due 30 days after submission, per the standard PO terms. */
const PAYMENT_TERM_DAYS = 30;

export default function SubmitBillPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <RequirePermission permission="manage_invoices" redirectTo="/app/bills">
      <SubmitBillLoader id={id} />
    </RequirePermission>
  );
}

function SubmitBillLoader({ id }: { id: string }) {
  const router = useRouter();
  const { data: po, isLoading } = usePurchaseOrder(id);

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl space-y-5">
        <Skeleton className="h-10 w-64 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (!po) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">Purchase order not found</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/app/bills")}>
          <ArrowLeft className="size-4" /> Back to Bill Submission
        </Button>
      </div>
    );
  }

  return <SubmitBillForm po={po} />;
}

function SubmitBillForm({ po }: { po: PurchaseOrder }) {
  const router = useRouter();
  const createInvoice = useCreateInvoice();

  const [amount, setAmount] = useState<number>(po.grandTotal);
  const [vatChallanSubmitted, setVatChallanSubmitted] = useState(false);
  const [attachment, setAttachment] = useState<File | null>(null);

  const dueDate = new Date(DEMO_NOW);
  dueDate.setDate(dueDate.getDate() + PAYMENT_TERM_DAYS);

  // The amount entered is the order value being billed — subtotal plus VAT,
  // the same convention the purchase order's grand total uses. Everything
  // below is derived from it so the supplier sees the deductions up front.
  const subtotal = Math.round(amount / (1 + VAT_RATE));
  const vat = calcVAT(subtotal);
  const ait = calcAIT(subtotal);
  const netPayable = subtotal + vat - ait;

  const onSubmit = async () => {
    if (amount <= 0) {
      toast.error("Enter the amount you are billing.");
      return;
    }
    if (amount > po.grandTotal) {
      toast.error("Bill amount cannot exceed the order value.", {
        description: `This order is worth ${formatBDT(po.grandTotal)}.`,
      });
      return;
    }

    try {
      const invoice = await createInvoice.mutateAsync({
        poId: po.id,
        poNumber: po.poNumber,
        items: [
          {
            description: `Bill against ${po.poNumber}`,
            unit: "lot",
            quantity: 1,
            unitPrice: subtotal,
          },
        ],
        remarks: vatChallanSubmitted
          ? "VAT challan (Mushak 6.3) confirmed as submitted."
          : "Submitted without VAT challan confirmation.",
      });
      toast.success("Bill submitted", {
        description: `${invoice.invoiceNumber} has been sent for review.`,
      });
      router.push("/app/bills");
    } catch {
      toast.error("Failed to submit bill");
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title="Submit Bill"
        subtitle={`For ${po.poNumber}  ·  ${po.buyerDepartment}`}
        actions={
          <Button variant="outline" onClick={() => router.push("/app/bills")}>
            <ArrowLeft className="size-4" /> Back to Bill Submission
          </Button>
        }
      />

      <Widget title="Bill Details">
        <div className="grid gap-5 sm:grid-cols-2">
          <ReadOnlyField label="Submitted Date" value={formatDate(DEMO_NOW)} />
          <ReadOnlyField label="Bill Number" value="Assigned on submission" />
        </div>

        <div className="mt-5">
          <FieldLabel>VAT Challan Submitted</FieldLabel>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
            <Checkbox
              checked={vatChallanSubmitted}
              onCheckedChange={(v) => setVatChallanSubmitted(v === true)}
            />
            I confirm the VAT challan (Mushak 6.3) has been submitted
          </label>
        </div>

        <div className="mt-5">
          <FieldLabel htmlFor="bill-amount">Total Amount (BDT)</FieldLabel>
          <Input
            id="bill-amount"
            type="number"
            min={0}
            max={po.grandTotal}
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="h-11 rounded-xl"
          />
          <p className="mt-2 text-xs text-muted-foreground">
            Order value {formatBDT(po.grandTotal)}. Bill for less to invoice a partial
            delivery.
          </p>
        </div>

        {/* Deductions surprise suppliers otherwise — the amount billed is not
            the amount received. */}
        <dl className="mt-5 space-y-2 rounded-xl bg-muted/40 p-4 text-sm">
          <Line label="Subtotal" value={formatBDT(subtotal)} />
          <Line label={`VAT (${VAT_RATE * 100}%)`} value={formatBDT(vat)} />
          <Line
            label={`AIT deducted (${AIT_RATE * 100}%)`}
            value={`− ${formatBDT(ait)}`}
            valueClassName="text-warn"
          />
          <Line
            label="Net payable to you"
            value={formatBDT(netPayable)}
            className="border-t border-border pt-2 font-semibold text-foreground"
            valueClassName="text-ok"
          />
        </dl>

        <div className="mt-5">
          <FieldLabel htmlFor="bill-attachment">Invoice Attachment (PDF, JPG)</FieldLabel>
          <div className="flex items-center gap-3 rounded-xl border border-input px-3 py-2">
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {attachment ? attachment.name : "No file chosen"}
            </span>
            <Button asChild variant="outline" size="sm">
              <label htmlFor="bill-attachment" className="cursor-pointer">
                Browse
                <input
                  id="bill-attachment"
                  type="file"
                  accept=".pdf,.jpg,.jpeg"
                  className="sr-only"
                  onChange={(e) => setAttachment(e.target.files?.[0] ?? null)}
                />
              </label>
            </Button>
          </div>
        </div>

        <div className="mt-5 flex items-start gap-2.5 rounded-xl bg-info/10 p-3.5 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" />
          <span>
            Expected payment date: within {PAYMENT_TERM_DAYS} days of bill submission —
            approx. {formatDate(dueDate)}
          </span>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <Button variant="outline" onClick={() => router.push("/app/bills")}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={createInvoice.isPending} className="gap-2">
            {createInvoice.isPending && <Loader2 className="size-4 animate-spin" />}
            Submit Bill
          </Button>
        </div>
      </Widget>
    </div>
  );
}

function FieldLabel({
  children,
  htmlFor,
}: {
  children: React.ReactNode;
  htmlFor?: string;
}) {
  return (
    <Label
      htmlFor={htmlFor}
      className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase"
    >
      {children}
    </Label>
  );
}

function ReadOnlyField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <div className="flex h-11 items-center rounded-xl border border-input bg-muted/50 px-3 text-sm text-muted-foreground">
        {value}
      </div>
    </div>
  );
}

function Line({
  label,
  value,
  className = "",
  valueClassName = "",
}: {
  label: string;
  value: string;
  className?: string;
  valueClassName?: string;
}) {
  return (
    <div className={`flex items-baseline justify-between gap-4 ${className}`}>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`tnum whitespace-nowrap ${valueClassName}`}>{value}</dd>
    </div>
  );
}

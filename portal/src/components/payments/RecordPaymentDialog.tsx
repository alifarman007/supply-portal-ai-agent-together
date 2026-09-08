"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLabels } from "@/lib/i18n/labels";
import { createSupplierPayment } from "@/lib/idempiere/api";
import { erpToday } from "@/lib/idempiere/mappers";
import { TENDER_TYPES } from "@/lib/idempiere/types";

/**
 * Record a payment to a supplier in the ERP — API §5.
 *
 * This is a treasury action living on a supplier-facing page, which is only
 * tolerable because the route behind it 404s unless BILLCHECK_INTERNAL is set
 * server-side. The `NEXT_PUBLIC_` flag that decides whether this button renders
 * is cosmetic: it hides a signpost, it is not the control. That distinction is
 * the same one the internal bill-checking screens already make.
 */

/**
 * Payment records in the mock data carry a MASKED account number ("****4521")
 * while the supplier profile holds the real one. Posting a mask to the ERP would
 * create a payment against an account that does not exist, so a masked value is
 * refused rather than sent. `bankAcctNo` is optional in the API, so omitting it
 * is a legitimate outcome — silently transmitting asterisks is not.
 */
export function isMaskedAccountNumber(value: string): boolean {
  return /[*x]{2,}/i.test(value.trim());
}

export interface RecordPaymentDefaults {
  invoiceNumber?: string;
  bankName?: string;
  bankAcctNo?: string;
  netAmountPaid?: number;
  bpCode?: string;
}

export function RecordPaymentDialog({
  open,
  onOpenChange,
  defaults = {},
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaults?: RecordPaymentDefaults;
}) {
  const { t } = useLabels();

  const [invoiceNumber, setInvoiceNumber] = useState(defaults.invoiceNumber ?? "");
  const [paymentDate, setPaymentDate] = useState(() => erpToday());
  const [bankName, setBankName] = useState(defaults.bankName ?? "");
  const [bankAcctNo, setBankAcctNo] = useState(() =>
    defaults.bankAcctNo && !isMaskedAccountNumber(defaults.bankAcctNo) ? defaults.bankAcctNo : "",
  );
  const [netAmountPaid, setNetAmountPaid] = useState(
    defaults.netAmountPaid ? String(defaults.netAmountPaid) : "",
  );
  // Every seeded payment is a BEFTN bank transfer, so ACH is the honest default.
  // The API's own default is "X" (Cash), which would misdescribe all of them.
  const [tenderType, setTenderType] = useState<string>("A");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const amount = Number(netAmountPaid);
  const canSubmit =
    !submitting && bankName.trim().length > 0 && Number.isFinite(amount) && amount > 0;

  const onSubmit = async () => {
    if (bankAcctNo && isMaskedAccountNumber(bankAcctNo)) {
      toast.error(t("toast_pay_failed"));
      return;
    }

    setSubmitting(true);
    try {
      const result = await createSupplierPayment({
        // The API's example id is literally "pay-001", which is also the shape
        // of this app's own payment ids — so the caller's reference is what it
        // wants, not an ERP-internal key.
        id: `pay-${paymentDate}-${Math.abs(hashCode(invoiceNumber || bankName))}`,
        paymentDate,
        bankName: bankName.trim(),
        netAmountPaid: amount,
        ...(invoiceNumber.trim() ? { invoiceNumber: invoiceNumber.trim() } : {}),
        ...(bankAcctNo.trim() ? { bankAcctNo: bankAcctNo.trim() } : {}),
        ...(defaults.bpCode ? { bpCode: defaults.bpCode } : {}),
        TenderType: tenderType,
        ...(description.trim() ? { Description: description.trim() } : {}),
      });
      toast.success(`${t("toast_pay_recorded")} · ${result.supplierPaymentDocNo}`);
      onOpenChange(false);
    } catch (err) {
      // The ERP's own message ("error 'netAmountPaid' must be greater than
      // zero") is more useful than a generic failure, and it is the only place
      // the real reason exists.
      toast.error(err instanceof Error ? err.message : t("toast_pay_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("pay_dialog_title")}</DialogTitle>
          <DialogDescription>{t("pay_dialog_intro")}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="pay-invoice" label={t("pay_invoice_no")}>
            <Input
              id="pay-invoice"
              value={invoiceNumber}
              onChange={(e) => setInvoiceNumber(e.target.value)}
              placeholder="INV-2026-0009"
            />
          </Field>

          <Field id="pay-date" label={t("pay_date")}>
            <Input
              id="pay-date"
              type="date"
              value={paymentDate}
              onChange={(e) => setPaymentDate(e.target.value)}
            />
          </Field>

          <Field id="pay-bank" label={t("pay_bank_name")}>
            <Input
              id="pay-bank"
              value={bankName}
              onChange={(e) => setBankName(e.target.value)}
              placeholder="Standard Chartered Bank"
            />
          </Field>

          <Field id="pay-acct" label={t("pay_bank_acct")}>
            <Input
              id="pay-acct"
              value={bankAcctNo}
              onChange={(e) => setBankAcctNo(e.target.value)}
              placeholder="01700254201"
            />
          </Field>

          <Field id="pay-amount" label={t("pay_net_amount")}>
            <Input
              id="pay-amount"
              type="number"
              min={0}
              step="0.01"
              value={netAmountPaid}
              onChange={(e) => setNetAmountPaid(e.target.value)}
            />
          </Field>

          <Field id="pay-tender" label={t("pay_tender_type")}>
            <Select value={tenderType} onValueChange={setTenderType}>
              <SelectTrigger id="pay-tender">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TENDER_TYPES).map(([code, name]) => (
                  <SelectItem key={code} value={code}>
                    {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <div className="sm:col-span-2">
            <Field id="pay-desc" label={t("pay_description")}>
              <Input
                id="pay-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t("pay_cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={!canSubmit}>
            {submitting && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {submitting ? t("pay_recording") : t("pay_submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

/** Small stable hash, so a resubmitted form reuses its payment reference. */
function hashCode(value: string): number {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return hash;
}

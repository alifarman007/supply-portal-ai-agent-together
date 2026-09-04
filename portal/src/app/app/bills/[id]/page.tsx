"use client";

import { use, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, CheckCircle2, Info, Loader2, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { RequirePermission } from "@/components/common/RequirePermission";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { usePurchaseOrder } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, DEMO_NOW } from "@/lib/format/date";
import { VAT_RATE } from "@/lib/format/tax";
import { useLabels, type LabelKey } from "@/lib/i18n/labels";
import type { PurchaseOrder } from "@/lib/mock/types";
import {
  billIdFor,
  draftLinesFromPo,
  draftLinesTotal,
  lineAmount,
  moneyToNumber,
  toAgentBill,
  type DraftBillLine,
} from "@/lib/billcheck/mappers";
import type { AgentCheckResult, Recommendation } from "@/lib/billcheck/types";
import { CheckProgress, type CheckOutcome } from "@/components/billcheck/CheckProgress";

/** Bills fall due 30 days after submission, per the standard PO terms. */
const PAYMENT_TERM_DAYS = 30;

/**
 * The supplier this portal is logged in as. The portal has no real authentication yet
 * (see the repo root CLAUDE.md), so there is one demo supplier, and it matches the one
 * seeded into the agent by scripts/generate_portal_demo_seed.py.
 */
const SUPPLIER_ID = "SP-2024-001";

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
  const { t } = useLabels();
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
        <p className="text-lg font-semibold text-foreground">{t("po_not_found")}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.push("/app/bills")}>
          <ArrowLeft className="size-4" /> {t("back_to_bill_submission")}
        </Button>
      </div>
    );
  }

  return <SubmitBillForm po={po} />;
}

const RECOMMENDATION_LABEL: Record<Recommendation, LabelKey> = {
  CLEAR: "check_rec_clear",
  CLEAR_WITH_ADJUSTMENTS: "check_rec_adjusted",
  REVIEW_REQUIRED: "check_rec_review",
  BLOCKED: "check_rec_blocked",
};

const RECOMMENDATION_TONE: Record<Recommendation, string> = {
  CLEAR: "bg-ok/10 text-ok",
  CLEAR_WITH_ADJUSTMENTS: "bg-warn/10 text-warn",
  REVIEW_REQUIRED: "bg-warn/10 text-warn",
  BLOCKED: "bg-destructive/10 text-destructive",
};

function SubmitBillForm({ po }: { po: PurchaseOrder }) {
  const router = useRouter();
  const { t } = useLabels();

  // The checker cannot three-way-match a lump sum against a purchase order and a goods
  // receipt, and it cannot pick a tax rate without knowing what was bought. So the bill
  // is built from real lines rather than the single "Bill against PO-..." placeholder
  // line this form used to fabricate.
  const [lines, setLines] = useState<DraftBillLine[]>(() => draftLinesFromPo(po));
  const [vatChallanSubmitted, setVatChallanSubmitted] = useState(true);
  const [attachment, setAttachment] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<AgentCheckResult | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  // The progress screen owns the moment between pressing the button and having an
  // answer. `outcome` stays null until the answer lands, which is what makes the last
  // row wait rather than tick early.
  const [checking, setChecking] = useState(false);
  const [outcome, setOutcome] = useState<CheckOutcome | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  // Bumped per submission so the progress screen remounts fresh instead of being
  // reset from inside an effect.
  const [runKey, setRunKey] = useState(0);

  const dueDate = new Date(DEMO_NOW);
  dueDate.setDate(dueDate.getDate() + PAYMENT_TERM_DAYS);

  // Purchase-order prices are ex-VAT (every mock order has subtotal + vatAmount ===
  // grandTotal), which is exactly the base the checker expects. There is deliberately no
  // division by 1.15 on this screen any more: that conversion belonged to the old single
  // VAT-inclusive amount field, and getting it wrong overstated the bill by 15% with no
  // error raised. See vatInclusiveToExVat in lib/billcheck/mappers.ts.
  const exVatTotal = useMemo(() => draftLinesTotal(lines), [lines]);
  const previewVat = exVatTotal * VAT_RATE;

  const setQuantity = (lineNo: number, quantity: number) =>
    setLines((current) =>
      current.map((line) =>
        line.lineNo === lineNo ? { ...line, quantity: Math.max(0, quantity) } : line,
      ),
    );

  const onSubmit = async () => {
    const billable = lines.filter((line) => line.quantity > 0);
    if (billable.length === 0) {
      toast.error(t("toast_enter_amount"));
      return;
    }

    setSubmitting(true);
    setFailure(null);
    setResult(null);
    setOutcome(null);
    setProgressError(null);
    setChecking(true);
    setRunKey((n) => n + 1);

    const payload = toAgentBill({
      billId: billIdFor(po, 1),
      supplierId: SUPPLIER_ID,
      po,
      supplierInvoiceNo: `INV-${po.poNumber}`,
      // The REAL date, not DEMO_NOW. The checker applies the tax rules in force on the
      // invoice date, and DEMO_NOW is 30 June 2026 — the last day of FY2025-26, a year
      // we hold no rule tables for. Beyond that technicality it is simply true: the bill
      // is being submitted now, whatever date the rest of the demo data pretends it is.
      invoiceDate: new Date().toISOString().slice(0, 10),
      mushakNo: vatChallanSubmitted ? `M63-${po.poNumber}` : null,
      lines: billable,
    });

    try {
      const response = await fetch("/api/billcheck/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await response.json();

      if (!response.ok) {
        // Deliberately NO fallback to the flat rates in lib/format/tax.ts. A confident
        // wrong number about a supplier's payment is worse than an honest failure.
        const message = body?.error?.message ?? t("toast_bill_failed");
        setFailure(message);
        setProgressError(message);
        toast.error(t("check_unavailable_title"));
        return;
      }

      setResult(body as AgentCheckResult);
      setOutcome({
        recommendation: body.recommendation,
        net_payable_tk: body.net_payable_tk,
        detail: body.detail ?? null,
        elapsedMs: body.elapsedMs,
      });
      toast.success(t("toast_bill_submitted"));
    } catch (err) {
      console.error("[billcheck] submit failed", err);
      setFailure(t("toast_bill_failed"));
      setProgressError(t("toast_bill_failed"));
      toast.error(t("toast_bill_failed"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <PageHeader
        title={t("submit_bill_title")}
        subtitle={`${t("submit_bill_subtitle_for")} ${po.poNumber}  ·  ${po.buyerDepartment}`}
        actions={
          <Button variant="outline" onClick={() => router.push("/app/bills")}>
            <ArrowLeft className="size-4" /> {t("back_to_bill_submission")}
          </Button>
        }
      />

      <Widget title={t("bill_details_title")}>
        <div className="grid gap-5 sm:grid-cols-2">
          <ReadOnlyField label={t("lbl_submitted_date")} value={formatDate(DEMO_NOW)} />
          <ReadOnlyField label={t("lbl_bill_number")} value={t("assigned_on_submission")} />
        </div>

        <div className="mt-5">
          <FieldLabel>{t("vat_challan_submitted_lbl")}</FieldLabel>
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-foreground">
            <Checkbox
              checked={vatChallanSubmitted}
              onCheckedChange={(v) => setVatChallanSubmitted(v === true)}
            />
            {t("vat_challan_confirm")}
          </label>
        </div>

        <div className="mt-6">
          <FieldLabel>{t("bill_lines_title")}</FieldLabel>
          <p className="mb-2.5 text-xs text-muted-foreground">{t("bill_lines_hint")}</p>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full min-w-[38rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t("col_description")}</th>
                  <th className="px-3 py-2 text-left font-medium">{t("col_unit")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("col_qty")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("col_unit_price")}</th>
                  <th className="px-3 py-2 text-right font-medium">{t("col_amount")}</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.lineNo} className="border-t border-border">
                    <td className="px-3 py-2 text-foreground">{line.description}</td>
                    <td className="px-3 py-2 text-muted-foreground">{line.unit}</td>
                    <td className="px-3 py-2 text-right">
                      <Input
                        type="number"
                        min={0}
                        value={line.quantity}
                        onChange={(e) => setQuantity(line.lineNo, Number(e.target.value))}
                        className="ml-auto h-9 w-24 rounded-lg text-right"
                        aria-label={`${t("col_qty")} — ${line.description}`}
                      />
                    </td>
                    <td className="tnum px-3 py-2 text-right text-muted-foreground">
                      {formatBDT(line.unitPrice)}
                    </td>
                    <td className="tnum px-3 py-2 text-right font-medium text-foreground">
                      {formatBDT(lineAmount(line))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-border bg-muted/30">
                  <td colSpan={4} className="px-3 py-2 text-right font-semibold">
                    {t("bill_total_ex_vat")}
                  </td>
                  <td className="tnum px-3 py-2 text-right font-semibold text-foreground">
                    {formatBDT(exVatTotal)}
                  </td>
                </tr>
                <tr className="border-t border-border">
                  <td colSpan={4} className="px-3 py-2 text-right text-muted-foreground">
                    {t("col_vat")} ({VAT_RATE * 100}%)
                  </td>
                  <td className="tnum px-3 py-2 text-right text-muted-foreground">
                    {formatBDT(previewVat)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        <div className="mt-5">
          <FieldLabel htmlFor="bill-attachment">{t("invoice_attachment_lbl")}</FieldLabel>
          <div className="flex items-center gap-3 rounded-xl border border-input px-3 py-2">
            <Paperclip className="size-4 shrink-0 text-muted-foreground" />
            <span className="min-w-0 flex-1 truncate text-sm text-muted-foreground">
              {attachment ? attachment.name : t("no_file_chosen")}
            </span>
            <Button asChild variant="outline" size="sm">
              <label htmlFor="bill-attachment" className="cursor-pointer">
                {t("browse_btn")}
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
            {t("expected_payment_date")} {PAYMENT_TERM_DAYS} {t("days_of_bill_submission")}{" "}
            {formatDate(dueDate)}
          </span>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Button variant="outline" onClick={() => router.push("/app/bills")}>
            {t("cancel")}
          </Button>
          <Button onClick={onSubmit} disabled={submitting} className="gap-2">
            {submitting && <Loader2 className="size-4 animate-spin" />}
            {t("submit_and_check_btn")}
          </Button>
          {submitting && (
            <span className="text-xs text-muted-foreground">{t("checking_in_progress")}</span>
          )}
        </div>
      </Widget>

      {failure && (
        <Widget title={t("check_unavailable_title")}>
          <div className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <div>
              <p>{failure}</p>
              <p className="mt-1 opacity-80">{t("check_nothing_saved")}</p>
            </div>
          </div>
        </Widget>
      )}

      {result && <CheckResult result={result} />}

      <CheckProgress
        key={runKey}
        open={checking}
        poNumber={po.poNumber}
        outcome={outcome}
        failure={progressError}
        onClose={() => setChecking(false)}
      />
    </div>
  );
}

/**
 * What the checker concluded.
 *
 * Every figure here comes from the agent, computed in Decimal against cited FY2026-27
 * rules. Nothing on this panel is recalculated in JavaScript — the numbers are rendered
 * exactly as the agent produced them.
 */
function CheckResult({ result }: { result: AgentCheckResult }) {
  const { t } = useLabels();
  const net = moneyToNumber(result.net_payable_tk);
  const findings = result.exceptions ?? [];

  return (
    <Widget title={t("check_result_title")}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className={`rounded-full px-3 py-1 text-sm font-semibold ${RECOMMENDATION_TONE[result.recommendation]}`}
        >
          {t(RECOMMENDATION_LABEL[result.recommendation])}
        </span>
        {result.net_payable_tk !== null && (
          <span className="text-sm text-muted-foreground">
            {t("check_net_payable")}:{" "}
            <span className="tnum font-semibold text-foreground">{formatBDT(net)}</span>
          </span>
        )}
      </div>

      <div className="mt-4">
        <p className="mb-2 text-sm font-medium text-foreground">{t("check_findings")}</p>
        {findings.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-ok">
            <CheckCircle2 className="size-4" /> {t("check_no_findings")}
          </p>
        ) : (
          <ul className="space-y-2">
            {findings.map((finding, index) => (
              <li
                key={`${finding.code}-${index}`}
                className="rounded-xl border border-border px-3 py-2 text-sm"
              >
                <span
                  className={`mr-2 rounded-full px-2 py-0.5 text-xs font-semibold ${
                    finding.severity === "BLOCKER"
                      ? "bg-destructive/10 text-destructive"
                      : finding.severity === "REVIEW"
                        ? "bg-warn/10 text-warn"
                        : "bg-info/10 text-info"
                  }`}
                >
                  {finding.severity}
                </span>
                <span className="text-foreground">{finding.message}</span>
                {finding.rule_id && (
                  <span className="ml-2 text-xs text-muted-foreground">({finding.rule_id})</span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-warn/10 p-3.5 text-xs text-warn">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        {t("check_rates_note")}
      </p>
      <p className="mt-2 text-xs text-muted-foreground">{t("check_awaiting_cfo")}</p>
    </Widget>
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

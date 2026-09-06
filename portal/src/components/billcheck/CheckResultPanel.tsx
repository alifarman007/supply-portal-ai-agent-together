"use client";

import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Widget } from "@/components/common/Widget";
import { formatBDT } from "@/lib/format/money";
import { moneyToNumber } from "@/lib/billcheck/mappers";
import { resolveSteps } from "@/lib/billcheck/steps";
import type { AppliedRate, ReviewDetail } from "@/lib/billcheck/types";
import { StepRow } from "./StepRow";

/**
 * The result, kept on the page after the progress screen closes.
 *
 * The checklist stays because it scrolls past quickly while checking, and "what was
 * verified" is worth more than a single badge saying it passed.
 *
 * EVERY FIGURE HERE COMES FROM THE AGENT. Nothing is recomputed in JavaScript — not even
 * the totals. The agent works in Decimal paisa and returns its own ordered ledger of how
 * it reached the net payable (`breakdown.netting_order`), so that is rendered verbatim.
 * A total assembled here out of doubles could disagree with the one the CFO approves, and
 * a supplier has no way to tell which is right.
 */

interface Props {
  detail: ReviewDetail;
  poNumber: string;
  elapsedMs?: number;
}

const RECOMMENDATION_TEXT: Record<string, string> = {
  CLEAR: "Cleared",
  CLEAR_WITH_ADJUSTMENTS: "Cleared with adjustments",
  REVIEW_REQUIRED: "Sent for review",
  BLOCKED: "Blocked",
};

const RECOMMENDATION_TONE: Record<string, string> = {
  CLEAR: "bg-ok/10 text-ok",
  CLEAR_WITH_ADJUSTMENTS: "bg-warn/10 text-warn",
  REVIEW_REQUIRED: "bg-warn/10 text-warn",
  BLOCKED: "bg-destructive/10 text-destructive",
};

export function CheckResultPanel({ detail, poNumber, elapsedMs }: Props) {
  const steps = resolveSteps(detail, poNumber);
  const rates = detail.rates_applied ?? [];
  const unverified = rates.filter((rate) => rate.unverified).length;

  return (
    <>
      <Widget title="Checking result">
        <div className="flex flex-wrap items-center gap-3">
          {detail.recommendation && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${RECOMMENDATION_TONE[detail.recommendation]}`}
            >
              {RECOMMENDATION_TEXT[detail.recommendation]}
            </span>
          )}
          {elapsedMs !== undefined && (
            <span className="text-xs text-muted-foreground">
              Checked in {(elapsedMs / 1000).toFixed(2)}s
            </span>
          )}
        </div>

        <p className="mt-4 mb-1 text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          What was checked
        </p>
        <ol className="divide-y divide-border/60">
          {steps.map((step, index) => (
            <StepRow key={step.key} step={step} index={index} state={step.state} compact />
          ))}
        </ol>
      </Widget>

      <MoneyPanel detail={detail} />

      {detail.exceptions.length > 0 && (
        <Widget title={`Findings (${detail.exceptions.length})`}>
          <ul className="space-y-2.5">
            {detail.exceptions.map((exception, index) => (
              <li
                key={`${exception.code}-${index}`}
                className="rounded-xl border border-border p-3.5"
              >
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                      exception.severity === "BLOCKER"
                        ? "bg-destructive/10 text-destructive"
                        : exception.severity === "REVIEW"
                          ? "bg-warn/10 text-warn"
                          : "bg-info/10 text-info"
                    }`}
                  >
                    {exception.severity}
                  </span>
                  {exception.line_no != null && (
                    <span className="text-xs text-muted-foreground">
                      line {exception.line_no}
                    </span>
                  )}
                </div>
                <p className="mt-2 text-sm text-foreground">{exception.message}</p>
              </li>
            ))}
          </ul>
        </Widget>
      )}

      {rates.length > 0 && <RatesPanel rates={rates} unverified={unverified} />}
    </>
  );
}

/**
 * The invoice, and then the payment. They are not the same number and conflating them is
 * how a supplier gets surprised.
 *
 * The invoice is what is billed: the supply value plus VAT. Withholding is not part of
 * it — the buyer deducts that at payment time and pays it to the NBR on the supplier's
 * behalf, which is a different transaction evidenced by a different document.
 */
function MoneyPanel({ detail }: { detail: ReviewDetail }) {
  const ledger = detail.breakdown?.netting_order ?? [];
  const rates = detail.rates_applied ?? [];

  if (!ledger.length || detail.net_payable_tk === null) {
    return null;
  }

  // The agent's ledger, split at the point where billing stops and withholding starts.
  // Everything positive builds the invoice; everything negative is deducted from it.
  const invoiceRows = ledger.filter((row) => moneyToNumber(row.amount) >= 0);
  const deductionRows = ledger.filter((row) => moneyToNumber(row.amount) < 0);
  const invoiceTotal = invoiceRows.reduce((sum, row) => sum + moneyToNumber(row.amount), 0);

  // A VDS rule that resolved to "no deduction" never reaches the ledger, because it
  // subtracts nothing. It is worth saying out loud even so: it is only nil BECAUSE a
  // Mushak 6.3 was provided, and that is the supplier's doing.
  const nilVds = rates.find(
    (rate) => rate.tax === "VDS" && moneyToNumber(rate.amount) === 0,
  );

  const tdsRate = rates.find((rate) => rate.tax === "TDS");

  return (
    <Widget title="Your money">
      <table className="w-full text-sm">
        <tbody>
          {invoiceRows.map((row, index) => (
            <tr key={index} className="border-b border-border/50">
              <td className="py-2 text-muted-foreground">{row.label}</td>
              <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                {row.rule_id ?? ""}
              </td>
              <td className="tnum py-2 text-right text-foreground">
                {formatBDT(moneyToNumber(row.amount))}
              </td>
            </tr>
          ))}
          <tr className="border-b-2 border-border">
            <td className="py-2 font-semibold text-foreground" colSpan={2}>
              Invoice total
            </td>
            <td className="tnum py-2 text-right font-semibold text-foreground">
              {formatBDT(invoiceTotal)}
            </td>
          </tr>

          {nilVds && (
            <tr className="border-b border-border/50">
              <td className="py-2 text-muted-foreground">
                VDS withheld
                <span className="ml-1.5 text-xs">
                  — not deductible, you provided a Mushak 6.3
                </span>
              </td>
              <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                {nilVds.rule_id}
              </td>
              <td className="tnum py-2 text-right text-muted-foreground">
                {formatBDT(0)}
              </td>
            </tr>
          )}

          {deductionRows.map((row, index) => (
            <tr key={index} className="border-b border-border/50">
              <td className="py-2 text-muted-foreground">{row.label}</td>
              <td className="py-2 text-right font-mono text-xs text-muted-foreground">
                {row.rule_id ?? ""}
              </td>
              <td className="tnum py-2 text-right text-warn">
                {formatBDT(moneyToNumber(row.amount))}
              </td>
            </tr>
          ))}

          <tr>
            <td className="pt-3 text-base font-semibold text-foreground" colSpan={2}>
              You will receive
            </td>
            <td className="tnum pt-3 text-right text-base font-semibold text-ok">
              {formatBDT(moneyToNumber(detail.net_payable_tk))}
            </td>
          </tr>
        </tbody>
      </table>

      {tdsRate && (
        <p className="mt-4 flex items-start gap-2.5 rounded-xl bg-info/10 p-3.5 text-xs text-info">
          <Info className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <strong>The TDS is not a cost to you.</strong> Kazi Farms pays it to the NBR
            against your income tax and issues you a withholding certificate, which you
            claim when you file. It does not appear on your Mushak 6.3 invoice — that shows
            the supply value and VAT only. It is deducted at payment.
          </span>
        </p>
      )}
    </Widget>
  );
}

/** The rate behind every figure above, with the gazette page it came from. */
function RatesPanel({ rates, unverified }: { rates: AppliedRate[]; unverified: number }) {
  return (
    <Widget title="Rates applied to this bill">
      {unverified > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-warn/10 p-3.5 text-xs text-warn">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
          <p>
            {unverified} of {rates.length} rates have not yet been confirmed by an
            accountant. Each was read from the official NBR gazette, but the figures are
            still being verified.
          </p>
        </div>
      )}
      <div className="space-y-2">
        {rates.map((rate, index) => (
          <div
            key={`${rate.rule_id}-${index}`}
            className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-xl border border-border px-3.5 py-2.5"
          >
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold">
              {rate.tax}
            </span>
            <span className="text-sm font-semibold text-foreground">{rate.rate}</span>
            <span className="text-xs text-muted-foreground">on {rate.applies_to}</span>
            <code className="text-xs text-muted-foreground">{rate.rule_id}</code>
            <span className="tnum ml-auto text-sm text-foreground">
              {formatBDT(moneyToNumber(rate.amount))}
            </span>
            {rate.unverified && (
              <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold text-warn">
                NOT CONFIRMED
              </span>
            )}
          </div>
        ))}
      </div>
    </Widget>
  );
}

/** Shown when a run produced nothing to flag. */
export function NoFindings() {
  return (
    <p className="flex items-center gap-2 text-sm text-ok">
      <CheckCircle2 className="size-4" /> Nothing was flagged on this bill.
    </p>
  );
}

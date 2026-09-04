"use client";

import { use, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/common/PageHeader";
import { Widget } from "@/components/common/Widget";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { formatBDT } from "@/lib/format/money";
import { moneyToNumber } from "@/lib/billcheck/mappers";
import type { AppliedRate, ReviewDetail } from "@/lib/billcheck/types";
import { RECOMMENDATION_TEXT, RECOMMENDATION_TONE, SEVERITY_TONE } from "../recommendation";

/**
 * One checked bill, in full.
 *
 * INTERNAL and READ-ONLY. Approving writes a payment instruction, an outbox record and a
 * treasury webhook, and the portal has no real authentication — so the decision stays on
 * the agent's own review screen, which is already race-proof and CSRF-guarded. This page
 * links out to it.
 *
 * Three tabs rather than seven. What a reviewer needs first is: what did it conclude,
 * which rates did it apply and can I verify them, and what did it flag. Netting and audit
 * detail belong on the agent's page until somebody asks for them here.
 */
export default function BillCheckDetailPage({
  params,
}: {
  params: Promise<{ billId: string }>;
}) {
  const { billId } = use(params);
  const [tab, setTab] = useState("summary");

  const { data, isLoading, error } = useQuery<ReviewDetail>({
    queryKey: ["billcheck", "bill", billId],
    queryFn: async () => {
      const res = await fetch(`/api/billcheck/bill/${encodeURIComponent(billId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? "Could not load this bill.");
      }
      return res.json();
    },
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <Skeleton className="h-10 w-72 rounded-lg" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="mx-auto max-w-6xl space-y-5">
        <PageHeader title={billId} subtitle="Bill checking" />
        <Widget title="Could not load this bill">
          <div className="flex items-start gap-2.5 rounded-xl bg-destructive/10 p-3.5 text-sm text-destructive">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" />
            <p>{(error as Error)?.message ?? "Unknown error."}</p>
          </div>
          <Button variant="outline" className="mt-4" asChild>
            <Link href="/app/billcheck">
              <ArrowLeft className="size-4" /> Back to the queue
            </Link>
          </Button>
        </Widget>
      </div>
    );
  }

  const unverifiedCount = data.rates_applied.filter((rate) => rate.unverified).length;

  return (
    <div className="mx-auto max-w-6xl space-y-5">
      <PageHeader
        title={data.bill.id}
        subtitle={`${data.bill.supplier_name ?? data.bill.supplier_id} · ${data.bill.po_id} · invoice ${data.bill.supplier_invoice_no}`}
        actions={
          <Button variant="outline" asChild>
            <Link href="/app/billcheck">
              <ArrowLeft className="size-4" /> Queue
            </Link>
          </Button>
        }
      />

      <Widget title="Result">
        <div className="flex flex-wrap items-center gap-4">
          {data.recommendation && (
            <span
              className={`rounded-full px-3 py-1 text-sm font-semibold ${RECOMMENDATION_TONE[data.recommendation]}`}
            >
              {RECOMMENDATION_TEXT[data.recommendation]}
            </span>
          )}
          <Figure label="Claimed" value={data.gross_claimed_tk} />
          <Figure label="Approved base" value={data.approved_base_tk} />
          <Figure label="Net payable" value={data.net_payable_tk} strong />
        </div>

        {data.decidable && (
          <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl bg-info/10 p-3.5 text-sm text-info">
            <span>
              Approving this bill creates a payment instruction, so decisions are taken on
              the checking service itself.
            </span>
            <Button size="sm" variant="outline" asChild>
              <a href={data.review_url} target="_blank" rel="noreferrer">
                Open to approve <ExternalLink className="size-3.5" />
              </a>
            </Button>
          </div>
        )}
      </Widget>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-11 rounded-full bg-muted p-1.5">
          <TabsTrigger value="summary" className="rounded-full">
            Summary
          </TabsTrigger>
          <TabsTrigger value="taxes" className="rounded-full">
            Tax rates{unverifiedCount > 0 ? ` (${unverifiedCount} unconfirmed)` : ""}
          </TabsTrigger>
          <TabsTrigger value="exceptions" className="rounded-full">
            Findings{data.exceptions.length > 0 ? ` (${data.exceptions.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4">
          <SummaryTab detail={data} />
        </TabsContent>
        <TabsContent value="taxes" className="mt-4">
          <TaxesTab rates={data.rates_applied} />
        </TabsContent>
        <TabsContent value="exceptions" className="mt-4">
          <ExceptionsTab detail={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Figure({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string | null;
  strong?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p
        className={`tnum ${strong ? "text-lg font-semibold text-foreground" : "text-sm text-foreground"}`}
      >
        {value === null ? "—" : formatBDT(moneyToNumber(value))}
      </p>
    </div>
  );
}

/**
 * What was billed against what was approved, line by line, plus the checker's narrative.
 *
 * The breakdown table is shown ABOVE the narrative on purpose. Supplier-controlled line
 * descriptions reach the language model that writes that prose, and while no model output
 * can change a computed amount, a hostile description could still colour the wording. The
 * deterministic figures must always be visible beside it.
 */
function SummaryTab({ detail }: { detail: ReviewDetail }) {
  const lines = detail.breakdown?.lines ?? [];
  const adjustments = [
    ...(detail.breakdown?.price_adjustments ?? []),
    ...(detail.breakdown?.qty_adjustments ?? []),
  ];

  return (
    <div className="space-y-5">
      <Widget title="Lines: billed against approved">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[46rem] text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left font-medium">#</th>
                <th className="px-3 py-2 text-left font-medium">Product</th>
                <th className="px-3 py-2 text-right font-medium">Billed qty</th>
                <th className="px-3 py-2 text-right font-medium">Approved qty</th>
                <th className="px-3 py-2 text-right font-medium">Billed</th>
                <th className="px-3 py-2 text-right font-medium">Approved</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((line) => {
                const cut = line.billed_amount !== line.approved_amount;
                return (
                  <tr key={line.bill_line_no} className="border-t border-border">
                    <td className="px-3 py-2 text-muted-foreground">{line.bill_line_no}</td>
                    <td className="px-3 py-2 text-foreground">{line.product_code ?? "—"}</td>
                    <td className="tnum px-3 py-2 text-right text-muted-foreground">
                      {line.billed_qty}
                    </td>
                    <td
                      className={`tnum px-3 py-2 text-right ${cut ? "font-semibold text-warn" : "text-muted-foreground"}`}
                    >
                      {line.approved_qty}
                    </td>
                    <td className="tnum px-3 py-2 text-right text-muted-foreground">
                      {formatBDT(moneyToNumber(line.billed_amount))}
                    </td>
                    <td
                      className={`tnum px-3 py-2 text-right font-medium ${cut ? "text-warn" : "text-foreground"}`}
                    >
                      {formatBDT(moneyToNumber(line.approved_amount))}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {adjustments.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-semibold text-muted-foreground uppercase">
              Adjustments
            </p>
            <ul className="space-y-1.5 text-sm">
              {adjustments.map((adjustment, index) => (
                <li key={index} className="flex items-baseline justify-between gap-4">
                  <span className="text-muted-foreground">
                    Line {adjustment.line_no}{" "}
                    <code className="text-xs">{adjustment.rule_id}</code>
                  </span>
                  <span className="tnum text-warn">
                    {formatBDT(moneyToNumber(adjustment.amount))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Widget>

      {detail.report_md && (
        <Widget title="Checker's report">
          <pre className="overflow-x-auto text-xs leading-relaxed whitespace-pre-wrap text-foreground">
            {detail.report_md}
          </pre>
        </Widget>
      )}

      {detail.run && (
        <Widget title="Run">
          <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-2">
            <Meta label="Run id" value={detail.run.run_id} />
            <Meta label="Rules version" value={detail.run.rules_version ?? "—"} />
            <Meta label="Started" value={new Date(detail.run.started_at).toLocaleString()} />
            <Meta
              label="AI nodes"
              value={detail.run.llm_provider ? `${detail.run.llm_provider} / ${detail.run.llm_model}` : "not used"}
            />
          </dl>
        </Widget>
      )}
    </div>
  );
}

/**
 * Every rate the run applied, with the gazette page behind it.
 *
 * This exists so an accountant can verify a rate against a real bill rather than in the
 * abstract. The FY2026-27 tables were read from the official PDFs and independently
 * re-read, but nobody has signed them off, so each unconfirmed rate says so plainly.
 */
function TaxesTab({ rates }: { rates: AppliedRate[] }) {
  const unverified = rates.filter((rate) => rate.unverified).length;

  if (rates.length === 0) {
    return (
      <Widget title="Tax rates applied">
        <p className="py-4 text-sm text-muted-foreground">
          No tax was applied to this bill.
        </p>
      </Widget>
    );
  }

  return (
    <Widget title="Tax rates applied — for accountant verification">
      {unverified > 0 && (
        <div className="mb-4 flex items-start gap-2.5 rounded-xl bg-warn/10 p-3.5 text-sm text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <strong>
              {unverified} of {rates.length} rates on this bill have not been confirmed by an
              accountant.
            </strong>{" "}
            Each was read from the official NBR gazette and independently re-read, but
            nobody has signed it off. Check the rate against the cited page below.
          </p>
        </div>
      )}

      <div className="space-y-3">
        {rates.map((rate, index) => (
          <div key={`${rate.rule_id}-${index}`} className="rounded-xl border border-border p-3.5">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold">
                {rate.tax}
              </span>
              <code className="text-xs text-muted-foreground">{rate.rule_id}</code>
              <span className="text-sm font-semibold text-foreground">{rate.rate}</span>
              <span className="text-xs text-muted-foreground">on {rate.applies_to}</span>
              <span className="tnum ml-auto text-sm">
                <span className="text-muted-foreground">
                  {formatBDT(moneyToNumber(rate.base))} →{" "}
                </span>
                <span className="font-semibold text-foreground">
                  {formatBDT(moneyToNumber(rate.amount))}
                </span>
              </span>
              {rate.unverified && (
                <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[11px] font-bold text-warn">
                  NOT CONFIRMED
                </span>
              )}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              <span className="font-medium">Source:</span> {rate.source_doc}
            </p>
          </div>
        ))}
      </div>
    </Widget>
  );
}

function ExceptionsTab({ detail }: { detail: ReviewDetail }) {
  if (detail.exceptions.length === 0) {
    return (
      <Widget title="Findings">
        <p className="flex items-center gap-2 py-4 text-sm text-ok">
          <CheckCircle2 className="size-4" /> Nothing was flagged on this bill.
        </p>
      </Widget>
    );
  }

  return (
    <Widget title={`Findings (${detail.exceptions.length})`}>
      <ul className="space-y-2.5">
        {detail.exceptions.map((exception, index) => (
          <li
            key={`${exception.code}-${index}`}
            className="rounded-xl border border-border p-3.5"
          >
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span
                className={`rounded-full px-2 py-0.5 text-xs font-bold ${SEVERITY_TONE[exception.severity]}`}
              >
                {exception.severity}
              </span>
              <code className="text-xs text-muted-foreground">{exception.code}</code>
              {exception.line_no != null && (
                <span className="text-xs text-muted-foreground">line {exception.line_no}</span>
              )}
              {exception.rule_id && (
                <span className="ml-auto text-xs text-muted-foreground">
                  {exception.rule_id}
                </span>
              )}
            </div>
            <p className="mt-2 text-sm text-foreground">{exception.message}</p>
          </li>
        ))}
      </ul>
    </Widget>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="truncate text-foreground">{value}</dd>
    </div>
  );
}

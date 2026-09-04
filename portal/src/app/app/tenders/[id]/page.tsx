"use client";

import { use, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, XCircle, Send, Loader2, FileSignature } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/common/PageHeader";
import { StatusPill } from "@/components/common/StatusPill";
import { Widget } from "@/components/common/Widget";
import { Field, ValueChip } from "@/components/common/DetailField";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useTender, useBidForTender, useDocuments, useAskTenderQuestion } from "@/lib/query/hooks";
import { formatBDT } from "@/lib/format/money";
import { formatDate, formatDateTime, daysUntil } from "@/lib/format/date";
import { usePermission } from "@/lib/rbac";
import { useLabels, DOC_TYPE_LABEL_KEYS } from "@/lib/i18n/labels";
import type { DocumentType, Tender } from "@/lib/mock/types";

export default function TenderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();
  const { t } = useLabels();
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
        <div className="grid gap-4 lg:grid-cols-3">
          <Skeleton className="h-64 rounded-xl lg:col-span-2" />
          <Skeleton className="h-64 rounded-xl" />
        </div>
        <Skeleton className="h-72 rounded-xl" />
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <p className="text-lg font-semibold text-foreground">{t("tender_not_found")}</p>
        <Button variant="outline" className="mt-4" onClick={() => router.back()}>
          <ArrowLeft className="size-4" /> {t("go_back")}
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
  const estimatedTotal = tender.items.reduce(
    (sum, i) => sum + i.quantity * i.estimatedUnitPrice,
    0,
  );

  const onAskQuestion = async () => {
    if (!question.trim()) {
      toast.error(t("toast_enter_question"));
      return;
    }
    try {
      await askQuestion.mutateAsync({ tenderId: tender.id, question: question.trim() });
      toast.success(t("toast_question_submitted"), { description: t("toast_question_desc") });
      setQuestion("");
    } catch {
      toast.error(t("toast_question_failed"));
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
        subtitle={`${t("published_colon")}: ${formatDate(tender.publishedDate)}  ·  ${t("submission_deadline_colon")}: ${formatDate(tender.submissionDeadline)}  ·  ${t("category_colon")}: ${tender.category}`}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.back()}>
              <ArrowLeft className="size-4" /> {t("back_to_tenders")}
            </Button>
            {existingBid ? (
              <Button asChild className="gap-2">
                <Link href={`/app/bids/${existingBid.id}`}>
                  <FileSignature className="size-4" /> {t("view_my_bid")}
                </Link>
              </Button>
            ) : (
              canBid &&
              (isPrequalified ? (
                <Button asChild className="gap-2">
                  <Link href={`/app/tenders/${tender.id}/bid`}>
                    <Send className="size-4" /> {t("submit_bid_btn")}
                  </Link>
                </Button>
              ) : (
                <Button disabled title={t("prequalify_first")} className="gap-2">
                  <Send className="size-4" /> {t("submit_bid_btn")}
                </Button>
              ))
            )}
          </div>
        }
      />

      {tender.status === "cancelled" && tender.cancelReason && (
        <div className="glass border-danger/30 bg-danger/10 p-4 text-sm text-danger">
          <strong>{t("tender_cancelled_prefix")}: </strong>
          {tender.cancelReason}
        </div>
      )}

      {tender.status === "awarded" && tender.awardedSupplierName && (
        <div
          className={`glass p-4 text-sm ${
            tender.awardedSupplierName === "Dhaka Packaging Industries Ltd."
              ? "border-ok/30 bg-ok/10 text-ok"
              : "border-border text-muted-foreground"
          }`}
        >
          <strong>{t("awarded_to_prefix")}: </strong>
          {tender.awardedSupplierName}
          {tender.awardedAt && <> ({formatDate(tender.awardedAt)})</>}
        </div>
      )}

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <Widget title={t("tender_details_title")} className="lg:col-span-2">
          <p className="font-heading text-base font-bold text-foreground">{tender.title}</p>
          <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
            {tender.description}
          </p>

          <dl className="mt-5 grid gap-x-8 gap-y-4 sm:grid-cols-2">
            <Field label={t("lbl_buyer_department")} value={tender.buyerDepartment} />
            <Field label={t("col_category")} value={tender.category} />
            <Field label={t("lbl_contact_person")} value={tender.buyerContactName} />
            <Field label={t("lbl_contact_email")} value={tender.buyerContactEmail} />
            <Field label={t("lbl_published_date")} value={formatDate(tender.publishedDate)} />
            <Field label={t("lbl_submission_deadline")} value={formatDate(tender.submissionDeadline)} />
            <Field label={t("lbl_bid_opening_date")} value={formatDate(tender.bidOpeningDate)} />
            <Field label={t("lbl_estimated_value")} value={formatBDT(tender.estimatedValue)} />
          </dl>
        </Widget>

        <BidStatusCard tender={tender} bidId={existingBid?.id} bidStatus={existingBid?.status} />
      </div>

      {/* Body bleeds to the card edges so the header band spans the full width. */}
      <Widget
        title={`${t("scope_of_supply")} (${tender.items.length})`}
        className="overflow-hidden"
        bodyClassName="-mx-6 -mb-6"
      >
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[color-mix(in_oklab,var(--brand-yellow)_22%,transparent)] text-xs font-semibold tracking-[0.08em] whitespace-nowrap text-foreground/70 uppercase">
                <th scope="col" className="py-3.5 pr-4 pl-6 text-left">{t("col_hash")}</th>
                <th scope="col" className="w-full min-w-[15rem] py-3.5 pr-4 text-left">{t("col_description")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_unit")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_qty")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_unit_price")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_vds_compliance")}</th>
                <th scope="col" className="py-3.5 pr-4 text-left">{t("col_tds_compliance")}</th>
                <th scope="col" className="py-3.5 pr-6 text-right">{t("col_est_total")}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {tender.items.map((item, idx) => (
                <tr key={item.id}>
                  <td className="py-4 pr-4 pl-6 align-middle text-muted-foreground">{idx + 1}</td>
                  <td className="py-4 pr-4 align-middle">
                    <span className="font-medium text-foreground">{item.description}</span>
                    <span className="block text-xs text-muted-foreground">
                      {item.specification}
                    </span>
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
                    <ValueChip>{item.vdsApplicable ? t("yes") : t("no")}</ValueChip>
                  </td>
                  <td className="py-4 pr-4 align-middle">
                    <ValueChip>{item.tdsApplicable ? t("yes") : t("no")}</ValueChip>
                  </td>
                  <td className="tnum py-4 pr-6 text-right align-middle font-semibold whitespace-nowrap text-foreground">
                    {formatBDT(item.quantity * item.estimatedUnitPrice)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-end gap-6 border-t border-border px-6 py-4">
          <span className="text-sm font-medium text-muted-foreground">{t("estimated_total_lbl")}</span>
          <span className="tnum font-heading text-lg font-bold text-foreground">
            {formatBDT(estimatedTotal)}
          </span>
        </div>
      </Widget>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Widget title={t("eligibility_requirements")}>
          <ul className="space-y-3 text-sm">
            {tender.eligibilityCriteria.map((c, i) => (
              <li key={i} className="flex gap-3">
                <Check className="mt-0.5 size-4 shrink-0 text-ok" />
                <span className="text-foreground">{c}</span>
              </li>
            ))}
          </ul>
        </Widget>

        <Widget title={t("terms_conditions")}>
          <ol className="space-y-3 text-sm">
            {tender.termsAndConditions.map((term, i) => (
              <li key={i} className="flex gap-3">
                <span className="tnum shrink-0 font-semibold text-primary">{i + 1}.</span>
                <span className="text-muted-foreground">{term}</span>
              </li>
            ))}
          </ol>
        </Widget>
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Widget title={t("prequalification_checklist")}>
          <div
            className={`mb-4 rounded-lg px-3 py-2 text-xs font-semibold ${
              isPrequalified ? "bg-ok/10 text-ok" : "bg-warn/10 text-warn"
            }`}
          >
            {isPrequalified ? t("prequalified_msg") : t("not_prequalified_msg")}
          </div>
          <ul className="space-y-2.5 text-sm">
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
                  <span className="flex-1 text-foreground">{t(DOC_TYPE_LABEL_KEYS[type])}</span>
                  {doc ? (
                    <StatusPill status={doc.status} />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("not_uploaded")}</span>
                  )}
                </li>
              );
            })}
          </ul>
          {!isPrequalified && (
            <p className="mt-4 text-xs text-muted-foreground">
              {t("update_docs_prefix")}{" "}
              <Link
                href="/app/documents"
                className="font-semibold text-primary hover:underline dark:text-brand-cream"
              >
                {t("nav_documents")}
              </Link>{" "}
              {t("update_docs_suffix")}
            </p>
          )}
        </Widget>

        <Widget title={t("clarifications_title")}>
          {tender.clarifications.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("no_questions_yet")}
            </p>
          ) : (
            <div className="space-y-4">
              {tender.clarifications.map((c) => (
                <div key={c.id} className="rounded-xl border border-border p-3">
                  <div className="text-sm font-medium text-foreground">{t("q_prefix")}: {c.question}</div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {c.askedBy} · {formatDateTime(c.askedAt)}
                  </div>
                  {c.response ? (
                    <div className="mt-3 rounded-lg bg-muted/40 p-2.5">
                      <div className="text-sm text-foreground">{t("a_prefix")}: {c.response}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {c.respondedBy} · {c.respondedAt && formatDateTime(c.respondedAt)}
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 text-xs text-warn">{t("awaiting_buyer_response")}</div>
                  )}
                </div>
              ))}
            </div>
          )}

          {tender.status === "published" && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <Textarea
                placeholder={t("ask_question_ph")}
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
                  {askQuestion.isPending ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Send className="size-3.5" />
                  )}
                  {t("ask_question_btn")}
                </Button>
              </div>
            </div>
          )}
        </Widget>
      </div>
    </div>
  );
}

function BidStatusCard({
  tender,
  bidId,
  bidStatus,
}: {
  tender: Tender;
  bidId?: string;
  bidStatus?: string;
}) {
  const { t } = useLabels();
  const daysLeft = daysUntil(tender.submissionDeadline);
  const closed = tender.status !== "published" || daysLeft <= 0;

  return (
    <Widget title={t("your_bid_status")}>
      {bidStatus ? (
        <StatusPill status={bidStatus} variant="solid" />
      ) : (
        <span className="inline-flex items-center rounded-full bg-muted-foreground px-3 py-1 text-xs font-semibold text-white">
          {t("not_submitted")}
        </span>
      )}

      <div className="mt-5">
        <div className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {t("time_remaining")}
        </div>
        <div className="font-heading mt-1 text-lg font-bold text-foreground">
          {closed
            ? t("submission_closed")
            : `${daysLeft} ${daysLeft === 1 ? t("day_word") : t("days_word")} ${t("days_left_suffix")}`}
        </div>
      </div>

      <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
        {bidId ? (
          <>
            {t("bid_received_msg")}{" "}
            <Link
              href={`/app/bids/${bidId}`}
              className="font-semibold text-primary hover:underline"
            >
              {t("view_your_bid")}
            </Link>{" "}
            {t("to_track_progress")}
          </>
        ) : closed ? (
          t("tender_closed_msg")
        ) : (
          t("submit_before_deadline_msg")
        )}
      </p>
    </Widget>
  );
}

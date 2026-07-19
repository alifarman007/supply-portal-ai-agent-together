import { cn } from "@/lib/utils";
import type { POStatus, InvoiceStatus, DeliveryStatus, DocumentStatus, TenderStatus, BidStatus } from "@/lib/mock/types";

type AnyStatus = POStatus | InvoiceStatus | DeliveryStatus | DocumentStatus | TenderStatus | BidStatus | string;

interface StatusMeta {
  label: string;
  color: "ok" | "warn" | "danger" | "info" | "neutral";
}

const STATUS_MAP: Record<string, StatusMeta> = {
  // PO
  draft: { label: "Draft", color: "neutral" },
  issued: { label: "Issued", color: "info" },
  acknowledged: { label: "Acknowledged", color: "ok" },
  partially_fulfilled: { label: "Partial", color: "warn" },
  fulfilled: { label: "Fulfilled", color: "ok" },
  cancelled: { label: "Cancelled", color: "danger" },
  // Invoice
  submitted: { label: "Submitted", color: "info" },
  under_review: { label: "Under Review", color: "warn" },
  approved: { label: "Approved", color: "ok" },
  paid: { label: "Paid", color: "ok" },
  rejected: { label: "Rejected", color: "danger" },
  // Delivery
  scheduled: { label: "Scheduled", color: "info" },
  in_transit: { label: "In Transit", color: "warn" },
  delivered: { label: "Delivered", color: "ok" },
  grn_confirmed: { label: "GRN Confirmed", color: "ok" },
  // Document
  valid: { label: "Verified", color: "ok" },
  expiring_soon: { label: "Expiring Soon", color: "warn" },
  expired: { label: "Expired", color: "danger" },
  pending_verification: { label: "Pending", color: "neutral" },
  // Tender
  published: { label: "Published", color: "info" },
  evaluation: { label: "Under Evaluation", color: "warn" },
  negotiation: { label: "Negotiation", color: "warn" },
  awarded: { label: "Awarded", color: "ok" },
  closed: { label: "Closed", color: "neutral" },
  // Bid (draft/submitted/cancelled share keys with PO/Invoice above)
  under_evaluation: { label: "Under Evaluation", color: "warn" },
  clarification_requested: { label: "Clarification Requested", color: "warn" },
  shortlisted: { label: "Shortlisted", color: "info" },
  not_awarded: { label: "Not Awarded", color: "neutral" },
};

const COLORS = {
  ok: "text-ok bg-[color-mix(in_oklab,var(--ok)_15%,transparent)]",
  warn: "text-warn bg-[color-mix(in_oklab,var(--warn)_16%,transparent)]",
  danger: "text-danger bg-[color-mix(in_oklab,var(--danger)_15%,transparent)]",
  info: "text-info bg-[color-mix(in_oklab,var(--info)_15%,transparent)]",
  neutral: "text-muted-foreground bg-muted",
};

const DOTS = {
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
  info: "bg-info",
  neutral: "bg-muted-foreground",
};

export function StatusPill({
  status,
  className,
}: {
  status: AnyStatus;
  className?: string;
}) {
  const meta = STATUS_MAP[status] ?? { label: status, color: "neutral" as const };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold",
        COLORS[meta.color],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", DOTS[meta.color])} />
      {meta.label}
    </span>
  );
}

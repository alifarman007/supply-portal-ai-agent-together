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
  // Derived in reports rather than stored: an unpaid invoice past its due date.
  overdue: { label: "Overdue", color: "danger" },
  // Derived in the PO fulfilment report: acknowledged but nothing shipped yet.
  pending: { label: "Pending", color: "neutral" },
  partial: { label: "Partial", color: "warn" },
  // Order Information reads PO progress from the supplier's side, so an
  // acknowledged order is one the buyer is waiting on.
  waiting_for_delivery: { label: "Waiting for Delivery", color: "warn" },
  partially_delivered: { label: "Partially Delivered", color: "warn" },
  // Settlement state of a submitted bill, derived from payments against it.
  partially_paid: { label: "Partially Paid", color: "warn" },
  unpaid: { label: "Unpaid", color: "neutral" },
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

/** Filled treatment used in report tables, where rows need a stronger signal. */
const SOLID = {
  ok: "bg-ok text-white",
  warn: "bg-warn text-white",
  danger: "bg-danger text-white",
  info: "bg-info text-white",
  neutral: "bg-muted-foreground text-white",
};

export function StatusPill({
  status,
  variant = "soft",
  label,
  className,
}: {
  status: AnyStatus;
  variant?: "soft" | "solid";
  /** Overrides the mapped label — for tables too narrow for the full wording. */
  label?: string;
  className?: string;
}) {
  const mapped = STATUS_MAP[status] ?? { label: status, color: "neutral" as const };
  const meta = label ? { ...mapped, label } : mapped;
  const solid = variant === "solid";

  return (
    <span
      className={cn(
        // A pill that wraps mid-label reads as two statuses — never let it.
        "inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap",
        solid ? "px-3 py-1" : "px-2.5 py-0.5",
        solid ? SOLID[meta.color] : COLORS[meta.color],
        className,
      )}
    >
      {!solid && <span className={cn("size-1.5 rounded-full", DOTS[meta.color])} />}
      {meta.label}
    </span>
  );
}

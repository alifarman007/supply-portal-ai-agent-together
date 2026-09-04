import { cn } from "@/lib/utils";
import { useLabels, type LabelKey } from "@/lib/i18n/labels";
import type { POStatus, InvoiceStatus, DeliveryStatus, DocumentStatus, TenderStatus, BidStatus } from "@/lib/mock/types";

type AnyStatus = POStatus | InvoiceStatus | DeliveryStatus | DocumentStatus | TenderStatus | BidStatus | string;

type Color = "ok" | "warn" | "danger" | "info" | "neutral";

// Label text lives in the shared i18n dictionary (keyed by the same status
// string) so every pill in the app translates from one place.
const STATUS_COLOR: Record<string, Color> = {
  // PO
  draft: "neutral",
  issued: "info",
  acknowledged: "ok",
  partially_fulfilled: "warn",
  fulfilled: "ok",
  cancelled: "danger",
  // Invoice
  submitted: "info",
  under_review: "warn",
  approved: "ok",
  paid: "ok",
  rejected: "danger",
  // Delivery
  scheduled: "info",
  in_transit: "warn",
  delivered: "ok",
  grn_confirmed: "ok",
  // Document
  valid: "ok",
  expiring_soon: "warn",
  expired: "danger",
  pending_verification: "neutral",
  // Tender
  published: "info",
  evaluation: "warn",
  negotiation: "warn",
  awarded: "ok",
  closed: "neutral",
  // Bid (draft/submitted/cancelled share keys with PO/Invoice above)
  under_evaluation: "warn",
  clarification_requested: "warn",
  shortlisted: "info",
  not_awarded: "neutral",
  // Derived in reports rather than stored: an unpaid invoice past its due date.
  overdue: "danger",
  // Derived in the PO fulfilment report: acknowledged but nothing shipped yet.
  pending: "neutral",
  partial: "warn",
  // Order Information reads PO progress from the supplier's side, so an
  // acknowledged order is one the buyer is waiting on.
  waiting_for_delivery: "warn",
  partially_delivered: "warn",
  // Settlement state of a submitted bill, derived from payments against it.
  partially_paid: "warn",
  unpaid: "neutral",
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
  const { t } = useLabels();
  const color = STATUS_COLOR[status] ?? "neutral";
  const text = label ?? t(status as LabelKey);
  const solid = variant === "solid";

  return (
    <span
      className={cn(
        // A pill that wraps mid-label reads as two statuses — never let it.
        "inline-flex items-center gap-1.5 rounded-full text-xs font-semibold whitespace-nowrap",
        solid ? "px-3 py-1" : "px-2.5 py-0.5",
        solid ? SOLID[color] : COLORS[color],
        className,
      )}
    >
      {!solid && <span className={cn("size-1.5 rounded-full", DOTS[color])} />}
      {text}
    </span>
  );
}

import type { POLineItem, POStatus, PurchaseOrder } from "@/lib/mock/types";
import type { RawPODetailResponse, RawPOLineItem, RawPOListItem } from "./types";

/**
 * The API sends a free-text `orderStatus` ("Complete", "Waiting for
 * Delivery", …) rather than the frontend's closed POStatus enum. This maps
 * the values seen in docs/SupplierPortal.pdf plus the other labels the
 * order-list UI already renders (see PO_STATUSES in
 * src/app/app/purchase-orders/page.tsx). Unrecognised values fall back to
 * "issued" so an unmapped status doesn't crash the UI.
 */
const ORDER_STATUS_MAP: Record<string, POStatus> = {
  draft: "draft",
  issued: "issued",
  open: "issued",
  "waiting for delivery": "acknowledged",
  acknowledged: "acknowledged",
  "partially delivered": "partially_fulfilled",
  "partially fulfilled": "partially_fulfilled",
  complete: "fulfilled",
  completed: "fulfilled",
  delivered: "fulfilled",
  closed: "fulfilled",
  cancelled: "cancelled",
  canceled: "cancelled",
  voided: "cancelled",
};

function mapOrderStatus(raw: string): POStatus {
  const status = ORDER_STATUS_MAP[raw.trim().toLowerCase()];
  if (!status) {
    console.warn(`[idempiere] unmapped orderStatus "${raw}", defaulting to "issued"`);
    return "issued";
  }
  return status;
}

function toIsoDate(dateOnly: string): string {
  // "2026-04-11" -> midnight UTC, per the ISO-8601 convention the frontend uses.
  return `${dateOnly}T00:00:00.000Z`;
}

export function mapPOListItem(raw: RawPOListItem): PurchaseOrder {
  return {
    id: raw.poNumber,
    poNumber: raw.poNumber,
    issuedDate: toIsoDate(raw.issueDate),
    requiredDeliveryDate: toIsoDate(raw.expectedDeliveryDate),
    buyerDepartment: raw.costCenter || "—",
    buyerContactName: raw.contactName,
    buyerContactEmail: raw.contactEmail,
    items: [],
    itemCount: raw.itemNumber,
    // The list endpoint doesn't return line items, so the VAT-exclusive
    // subtotal can't be derived (it requires per-line vatRate) — only the
    // detail endpoint's linesData gives us that. Unused by the order list UI.
    subtotal: raw.grandTotal,
    vatAmount: 0,
    grandTotal: raw.grandTotal,
    vdsAmount: raw.vdsAmount,
    tdsAmount: raw.tdsAmount,
    billedAmount: raw.billSubmittedAmount,
    paidAmount: raw.paidAmount,
    dueAmount: raw.paymentDueAmount,
    status: mapOrderStatus(raw.orderStatus),
    termsAndConditions: raw.termsAndConditions,
    deliveryAddress: raw.deliveryAddress,
  };
}

function mapLineItem(raw: RawPOLineItem): POLineItem {
  // `total` is VAT-inclusive; back out the pre-VAT amount from the line's
  // own vatRate so the line's contribution to the PO subtotal is accurate.
  const vatRate = Number(raw.vatRate) / 100;
  const preVat = raw.total / (1 + vatRate);
  return {
    id: `${raw.productId}-${raw.line}`,
    description: raw.description,
    unit: raw.unit,
    quantity: raw.quantity,
    unitPrice: raw.unitPrice,
    totalPrice: Math.round(preVat),
    itemName: raw.itemName,
    itemCode: raw.itemCode,
    vdsAmount: raw.vdsAmount ?? undefined,
    tdsAmount: raw.tdsAmount,
  };
}

export function mapPODetail(raw: RawPODetailResponse): PurchaseOrder {
  const items = raw.linesData.map(mapLineItem);
  const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
  return {
    id: raw.poNumber,
    poNumber: raw.poNumber,
    issuedDate: toIsoDate(raw.issueDate),
    requiredDeliveryDate: toIsoDate(raw.expectedDeliveryDate),
    buyerDepartment: raw.costCenter || "—",
    buyerContactName: raw.contactName,
    buyerContactEmail: raw.contactEmail,
    items,
    itemCount: raw.totalLines,
    subtotal,
    vatAmount: Math.round(raw.grandTotal - subtotal),
    grandTotal: raw.grandTotal,
    vdsAmount: raw.vdsAmount,
    tdsAmount: raw.tdsAmount,
    billedAmount: raw.billSubmittedAmount,
    paidAmount: raw.paidAmount,
    dueAmount: raw.paymentDueAmount,
    status: mapOrderStatus(raw.orderStatus),
    termsAndConditions: raw.termsAndConditions,
    deliveryAddress: raw.deliveryAddress,
  };
}

// ---------------------------------------------------------------------------
// Write endpoints
// ---------------------------------------------------------------------------

/** §4.4 / §5.5. The ERP accepts `yyyy-MM-dd` and nothing else. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Validate a date the way the ERP does, before spending a round trip on it.
 *
 * The regex alone would pass "2026-13-45", so the value is also re-formatted
 * through Date and compared: that rejects impossible days and month rollovers
 * ("2026-02-30" becomes "2026-03-02" and therefore fails the equality check).
 */
export function isErpDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/** Today in the ERP's format, in local time — not UTC, which rolls over early in Dhaka. */
export function erpToday(now: Date = new Date()): string {
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

/**
 * Money for the ERP.
 *
 * Everything the portal holds is a JavaScript number, and the ERP's two write
 * endpoints take a JSON number rather than the string the agent insists on. So
 * this is the one boundary where money legitimately crosses as a number, and
 * the only protection available is to round to the paisa and refuse anything
 * that is not a finite, positive amount — which is also exactly what the ERP
 * itself rejects ("must be greater than zero").
 */
export function toErpAmount(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError(`refusing to send a non-finite amount to the ERP: ${value}`);
  }
  return roundHalfUp(value);
}

/**
 * ROUND_HALF_UP to two decimals — the repo's rule for money, applied to the
 * DECIMAL representation rather than to the binary double.
 *
 * Neither obvious approach does this. `Math.round(v * 100) / 100` multiplies
 * first, and that multiplication moves the value: 8.165 * 100 is
 * 816.4999999999999, which rounds down to 8.16 where half-up gives 8.17.
 * `Number(v.toFixed(2))` is worse again — it rounds the exact binary value, so
 * 2.675, 1.115, 0.615 and 1.045 all round DOWN.
 *
 * `Number.prototype.toString()` gives the shortest decimal string that round-
 * trips to the same double, i.e. the number as it was written. Rounding that
 * string is what makes "half" mean half. The residual limit is unavoidable in a
 * float: 1.005 is stored as 1.00499999999999989, so its shortest form is
 * "1.005" and this rounds it up correctly — but a value that arrives already
 * mangled cannot be recovered by any rounding rule. The agent avoids the whole
 * problem with Decimal; here the ERP's contract takes a JSON number, so this is
 * the boundary where the portal does the best a double allows.
 */
export function roundHalfUp(value: number): number {
  const text = value.toString();
  // Exponential form ("1e-7", "1.2e+21") has no plain fraction to inspect;
  // such magnitudes are far outside any bill amount, so defer to the platform.
  if (text.includes("e") || text.includes("E")) return Number(value.toFixed(2));

  const point = text.indexOf(".");
  if (point < 0 || text.length - point - 1 <= 2) return value;

  const truncated = Number(text.slice(0, point + 3));
  const nextDigit = Number(text[point + 3]);
  if (Number.isNaN(nextDigit) || nextDigit < 5) return truncated;

  // Carry is handled by toFixed on the sum: 1.999 -> 1.99 + 0.01 -> "2.00".
  const step = value < 0 ? -0.01 : 0.01;
  return Number((truncated + step).toFixed(2));
}

/**
 * Server-side attachment validation.
 *
 * `src/lib/idempiere/attachment.ts` already checks size and sniffs the real file
 * type, but it is a `"use client"` module: it runs in the browser and can be
 * bypassed by anyone posting to the route directly. This repo's own doctrine is
 * that hiding a control in the UI is not a control, so the same rules are
 * enforced here, where they cannot be skipped.
 *
 * The decoded size is computed from the base64 length rather than by decoding —
 * a multi-megabyte Buffer allocation is exactly what the limit exists to avoid.
 */
export const MAX_ATTACHMENT_DECODED_BYTES = 5 * 1024 * 1024;

const DATA_URI = /^data:([a-z]+\/[a-z0-9.+-]+);base64,([\s\S]+)$/i;
const BASE64_ONLY = /^[A-Za-z0-9+/\r\n]+={0,2}$/;

export type AttachmentProblem =
  | "empty"
  | "not_base64"
  | "too_large"
  | "unsupported_type"
  | "escaped_data_uri";

/** Returns null when the attachment is acceptable, or the reason it is not. */
export function validateErpAttachment(attachment: string): AttachmentProblem | null {
  const value = attachment.trim();
  if (!value) return "empty";

  // §4.6.5 is explicit that there must be no backslash before the colon. Catch
  // it by name rather than letting it fall through as "not base64", because the
  // fix is entirely different.
  if (/^data[\\]+:/i.test(value)) return "escaped_data_uri";

  const match = DATA_URI.exec(value);
  const payload = (match ? match[2] : value).replace(/\s/g, "");
  if (!payload) return "empty";
  if (!BASE64_ONLY.test(payload)) return "not_base64";
  if (payload.length % 4 !== 0) return "not_base64";

  // §4.6.4's table. A bare-base64 attachment declares no type, which the spec
  // permits — the ERP sniffs it — so only a stated one is checked.
  if (match) {
    const mime = match[1].toLowerCase();
    const allowed = ["image/png", "image/jpeg", "image/gif", "application/pdf"];
    if (!allowed.includes(mime)) return "unsupported_type";
  }

  const padding = payload.endsWith("==") ? 2 : payload.endsWith("=") ? 1 : 0;
  const decodedBytes = (payload.length / 4) * 3 - padding;
  if (decodedBytes > MAX_ATTACHMENT_DECODED_BYTES) return "too_large";

  return null;
}

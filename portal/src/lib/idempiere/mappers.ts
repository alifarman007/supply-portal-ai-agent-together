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

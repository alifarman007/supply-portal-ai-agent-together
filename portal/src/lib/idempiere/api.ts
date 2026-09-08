import type { POFilters, PurchaseOrder } from "@/lib/mock/types";

/**
 * Client-side data access for Purchase Orders backed by the real iDempiere
 * API (proxied through /api/idempiere/* route handlers — see
 * src/lib/idempiere/client.ts for why the upstream call can't happen
 * directly from the browser). Same signatures as src/lib/mock/api.ts so
 * src/lib/query/hooks.ts can swap between the two.
 */

export async function listPurchaseOrders(filters: POFilters = {}): Promise<PurchaseOrder[]> {
  const res = await fetch("/api/idempiere/purchase-orders");
  if (!res.ok) throw new Error(`Failed to load purchase orders (${res.status})`);
  let list: PurchaseOrder[] = await res.json();

  if (filters.status && filters.status !== "all") {
    list = list.filter((p) => p.status === filters.status);
  }
  if (filters.search) {
    const q = filters.search.toLowerCase();
    list = list.filter(
      (p) => p.poNumber.toLowerCase().includes(q) || p.buyerDepartment.toLowerCase().includes(q),
    );
  }
  return list.sort((a, b) => new Date(b.issuedDate).getTime() - new Date(a.issuedDate).getTime());
}

export async function getPurchaseOrder(id: string): Promise<PurchaseOrder | undefined> {
  // `id` is the PO number (e.g. "ESY - AZ01POD26000062"), which contains
  // spaces. Depending on how the route got here it may already be
  // percent-encoded from the URL — decode first so it's never encoded twice.
  const poNumber = decodeURIComponent(id);
  const res = await fetch(`/api/idempiere/purchase-orders/${encodeURIComponent(poNumber)}`);
  if (res.status === 404) return undefined;
  if (!res.ok) throw new Error(`Failed to load purchase order (${res.status})`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Write endpoints
//
// Both go through the portal's own route handlers, never straight to the ERP:
// the browser has no token, the ERP host is on an internal network, and its
// certificate is self-signed. Same reasoning as the read endpoints above.
// ---------------------------------------------------------------------------

export interface BillSubmissionResult {
  /** A STRING at this boundary, per API-CONTRACT.md, even though the ERP's column is numeric. */
  billCheckingId: string;
  poDocNo: string;
  amount: number;
  message: string;
}

export interface SupplierPaymentResult {
  supplierPaymentDocNo: string;
  paymentId: string;
  invoiceId: string;
  invoiceNumber: string;
  netAmountPaid: number;
  message: string;
}

/** The `{ error: { code, message } }` body every portal route handler returns. */
export class ErpRequestError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ErpRequestError";
  }
}

async function postToErp<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => null);
  if (!res.ok) {
    const error = (payload as { error?: { code?: string; message?: string } } | null)?.error;
    throw new ErpRequestError(
      error?.message ?? `The request failed (${res.status}).`,
      error?.code ?? "ERP_FAILED",
      res.status,
    );
  }
  return payload as T;
}

/** API §4 — submit a bill against a purchase order. */
export function submitBillToErp(body: {
  poDocNo: string;
  billSubmitDate: string;
  billAmount: number;
  billNo?: string;
  vatChallanSubmitted?: boolean;
  remarks?: string;
  attachment?: string;
}): Promise<BillSubmissionResult> {
  return postToErp<BillSubmissionResult>("/api/idempiere/bill-submission", body);
}

/** API §5 — record a payment to a supplier. Gated by BILLCHECK_INTERNAL server-side. */
export function createSupplierPayment(body: {
  id: string;
  paymentDate: string;
  bankName: string;
  netAmountPaid: number;
  invoiceNumber?: string;
  bpCode?: string;
  bankAcctNo?: string;
  TenderType?: string;
  Description?: string;
}): Promise<SupplierPaymentResult> {
  return postToErp<SupplierPaymentResult>("/api/idempiere/payment", body);
}

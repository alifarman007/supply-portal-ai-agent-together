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

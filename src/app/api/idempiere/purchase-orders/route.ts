import { NextResponse } from "next/server";
import { idempiereFetch } from "@/lib/idempiere/client";
import { mapPOListItem } from "@/lib/idempiere/mappers";
import type { RawPOListResponse } from "@/lib/idempiere/types";
import { listPurchaseOrders as listMockPurchaseOrders } from "@/lib/mock/api";

export async function GET() {
  const supplierCode = process.env.IDEMPIERE_SUPPLIER_CODE;

  // The iDempiere host is an internal-network-only IP — unreachable from
  // deployments like Vercel. Fall back to the mock data layer rather than
  // erroring the whole screen out when it can't be reached or isn't configured.
  if (!supplierCode) {
    return NextResponse.json(await listMockPurchaseOrders());
  }

  try {
    const res = await idempiereFetch(`/supplier/purchase-orders/${encodeURIComponent(supplierCode)}`);
    if (!res.ok) {
      console.error(`[idempiere] purchase-orders list returned ${res.status}, falling back to mock data`);
      return NextResponse.json(await listMockPurchaseOrders());
    }
    const data: RawPOListResponse = await res.json();
    return NextResponse.json(data.purchaseOrders.map(mapPOListItem));
  } catch (err) {
    console.error("[idempiere] purchase-orders list unreachable, falling back to mock data", err);
    return NextResponse.json(await listMockPurchaseOrders());
  }
}

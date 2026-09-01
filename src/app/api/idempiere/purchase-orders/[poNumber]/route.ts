import { NextResponse } from "next/server";
import { idempiereFetch } from "@/lib/idempiere/client";
import { mapPODetail } from "@/lib/idempiere/mappers";
import type { RawPODetailResponse } from "@/lib/idempiere/types";
import { getPurchaseOrder as getMockPurchaseOrder } from "@/lib/mock/api";

async function mockFallback(poNumber: string) {
  const po = await getMockPurchaseOrder(poNumber);
  if (!po) {
    return NextResponse.json(
      { error: { code: "PO_NOT_FOUND", message: "Purchase order not found" } },
      { status: 404 },
    );
  }
  return NextResponse.json(po);
}

export async function GET(
  _req: Request,
  context: { params: Promise<{ poNumber: string }> },
) {
  const { poNumber } = await context.params;

  // See src/app/api/idempiere/purchase-orders/route.ts for why this falls
  // back to mock data — the backend host isn't reachable from every deployment.
  if (!process.env.IDEMPIERE_SUPPLIER_CODE) {
    return mockFallback(poNumber);
  }

  try {
    const res = await idempiereFetch(`/supplier/purchase-order/${encodeURIComponent(poNumber)}`);
    if (res.status === 404) {
      return NextResponse.json(
        { error: { code: "PO_NOT_FOUND", message: "Purchase order not found" } },
        { status: 404 },
      );
    }
    if (!res.ok) {
      console.error(`[idempiere] purchase-order detail returned ${res.status}, falling back to mock data`);
      return mockFallback(poNumber);
    }
    const data: RawPODetailResponse = await res.json();
    return NextResponse.json(mapPODetail(data));
  } catch (err) {
    console.error("[idempiere] purchase-order detail unreachable, falling back to mock data", err);
    return mockFallback(poNumber);
  }
}

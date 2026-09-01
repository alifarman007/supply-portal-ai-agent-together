import { NextResponse } from "next/server";
import { idempiereFetch } from "@/lib/idempiere/client";
import { mapPOListItem } from "@/lib/idempiere/mappers";
import type { RawPOListResponse } from "@/lib/idempiere/types";

export async function GET() {
  const supplierCode = process.env.IDEMPIERE_SUPPLIER_CODE;
  if (!supplierCode) {
    return NextResponse.json(
      { error: { code: "SUPPLIER_CODE_MISSING", message: "No supplier code configured" } },
      { status: 500 },
    );
  }

  const res = await idempiereFetch(`/supplier/purchase-orders/${encodeURIComponent(supplierCode)}`);
  if (!res.ok) {
    return NextResponse.json(
      { error: { code: "UPSTREAM_ERROR", message: `iDempiere returned ${res.status}` } },
      { status: res.status },
    );
  }

  const data: RawPOListResponse = await res.json();
  return NextResponse.json(data.purchaseOrders.map(mapPOListItem));
}

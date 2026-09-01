import { NextResponse } from "next/server";
import { idempiereFetch } from "@/lib/idempiere/client";
import { mapPODetail } from "@/lib/idempiere/mappers";
import type { RawPODetailResponse } from "@/lib/idempiere/types";

export async function GET(
  _req: Request,
  context: { params: Promise<{ poNumber: string }> },
) {
  const { poNumber } = await context.params;

  const res = await idempiereFetch(`/supplier/purchase-order/${encodeURIComponent(poNumber)}`);
  if (res.status === 404) {
    return NextResponse.json(
      { error: { code: "PO_NOT_FOUND", message: "Purchase order not found" } },
      { status: 404 },
    );
  }
  if (!res.ok) {
    return NextResponse.json(
      { error: { code: "UPSTREAM_ERROR", message: `iDempiere returned ${res.status}` } },
      { status: res.status },
    );
  }

  const data: RawPODetailResponse = await res.json();
  return NextResponse.json(mapPODetail(data));
}

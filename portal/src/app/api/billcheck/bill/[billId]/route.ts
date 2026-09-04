import { NextResponse } from "next/server";
import {
  BillCheckRejectedError,
  BillCheckUnavailableError,
  internalSectionEnabled,
  isConfigured,
  reviewDetail,
} from "@/lib/billcheck/client";

/** Everything the checker concluded about one bill. Read-only — see the queue route. */
export async function GET(
  _req: Request,
  context: { params: Promise<{ billId: string }> },
) {
  const { billId } = await context.params;

  if (!internalSectionEnabled()) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  }
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "BILLCHECK_NOT_CONFIGURED",
          message: "Set BILLCHECK_BASE_URL in portal/.env.local and start the agent.",
        },
      },
      { status: 503 },
    );
  }

  try {
    return NextResponse.json(await reviewDetail(billId));
  } catch (err) {
    if (err instanceof BillCheckRejectedError && err.status === 404) {
      return NextResponse.json(
        { error: { code: "BILL_NOT_FOUND", message: `No bill ${billId}.` } },
        { status: 404 },
      );
    }
    console.error("[billcheck] detail unavailable", err);
    const unavailable = err instanceof BillCheckUnavailableError;
    return NextResponse.json(
      {
        error: {
          code: unavailable ? "BILLCHECK_UNAVAILABLE" : "BILLCHECK_FAILED",
          message: unavailable
            ? "The bill checking agent is not responding."
            : "This bill could not be loaded.",
        },
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}

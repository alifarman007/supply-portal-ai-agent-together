import { NextResponse } from "next/server";
import {
  BillCheckUnavailableError,
  internalSectionEnabled,
  isConfigured,
  reviewQueue,
} from "@/lib/billcheck/client";

/**
 * Bills waiting for the accounts team.
 *
 * Read-only, but still gated: this lists other people's bills and their amounts, and the
 * portal has no authentication to put in front of it. Off unless BILLCHECK_INTERNAL is
 * explicitly set — a hidden sidebar link is not a control.
 */
export async function GET() {
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
    return NextResponse.json(await reviewQueue());
  } catch (err) {
    // No mock fallback: an empty-looking queue would read as "nothing to approve", which
    // is a different and more dangerous statement than "the checker is down".
    console.error("[billcheck] queue unavailable", err);
    const unavailable = err instanceof BillCheckUnavailableError;
    return NextResponse.json(
      {
        error: {
          code: unavailable ? "BILLCHECK_UNAVAILABLE" : "BILLCHECK_FAILED",
          message: unavailable
            ? "The bill checking agent is not responding, so the queue cannot be shown."
            : "The queue could not be loaded.",
        },
      },
      { status: unavailable ? 503 : 500 },
    );
  }
}

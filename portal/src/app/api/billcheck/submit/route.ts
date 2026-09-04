import { NextResponse } from "next/server";
import {
  BillCheckRejectedError,
  BillCheckUnavailableError,
  checkBill,
  createBill,
  isConfigured,
  reviewDetail,
} from "@/lib/billcheck/client";
import type { AgentBillIn } from "@/lib/billcheck/types";

/**
 * Submit a bill to the checking agent and return the result.
 *
 * NO MOCK FALLBACK HERE, AND THAT IS THE POINT.
 *
 * The iDempiere route handlers next door fall back to mock data whenever the backend is
 * unreachable, and that is right for them: they are read-only, and showing a demo
 * purchase order beats showing an error page. This handler is different in kind. It
 * submits a bill and reports what will be deducted from a supplier's payment.
 *
 * Falling back here would mean answering with figures from `src/lib/format/tax.ts` —
 * a flat 3% and 7.5% — which is precisely the calculation this whole integration exists
 * to replace. The supplier would see a confident number that no rule supports, and would
 * have no way to tell it apart from a real one. A visible failure is far better than a
 * plausible wrong answer about money.
 *
 * So: if the agent is not configured or not reachable, this says so.
 */

export async function POST(request: Request) {
  if (!isConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "BILLCHECK_NOT_CONFIGURED",
          message:
            "Bill checking is not configured. Set BILLCHECK_BASE_URL in portal/.env.local " +
            "and start the agent with `cd agent && python -m uv run python -m app.cli serve`.",
        },
      },
      { status: 503 },
    );
  }

  let bill: AgentBillIn;
  try {
    bill = (await request.json()) as AgentBillIn;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } },
      { status: 400 },
    );
  }

  if (!bill?.id || !bill.po_id || !Array.isArray(bill.lines) || bill.lines.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: "INCOMPLETE_BILL",
          message: "A bill needs an id, a purchase order and at least one line.",
        },
      },
      { status: 400 },
    );
  }

  try {
    // Two steps against the agent: create, then check. The check is deterministic and
    // takes roughly 90 ms, so doing it inline keeps the whole thing one request with no
    // polling, no job queue and no background worker.
    let created = true;
    try {
      await createBill(bill);
    } catch (err) {
      if (err instanceof BillCheckRejectedError && err.status === 409) {
        // Already submitted. Re-checking is safe and is what the supplier wants to see.
        created = false;
      } else {
        throw err;
      }
    }

    const startedAt = Date.now();
    const result = await checkBill(bill.id, false);
    const elapsedMs = Date.now() - startedAt;

    // Fetch the full breakdown too. The check response carries only a recommendation, a
    // net payable and the exceptions; the progress screen shows what each step actually
    // found — which quantities were cut, which VAT rate applied, which TDS serial the
    // product falls under — and those live in the review payload. Both calls are
    // deterministic and fast, so this stays one request from the browser's point of view.
    let detail = null;
    try {
      detail = await reviewDetail(bill.id);
    } catch (err) {
      // A missing breakdown degrades the progress detail, not the result. The
      // recommendation and the net payable above are already authoritative.
      console.error("[billcheck] could not load the breakdown for the progress view", err);
    }

    return NextResponse.json({ ...result, bill_id: bill.id, created, detail, elapsedMs });
  } catch (err) {
    if (err instanceof BillCheckRejectedError) {
      // The agent's own validation refused it — a total that does not match the lines, an
      // unknown purchase order, sub-paisa money. That reason belongs in front of the
      // supplier verbatim; it is far more useful than "submission failed".
      const status = err.status === 422 || err.status === 400 ? 422 : err.status;
      return NextResponse.json(
        { error: { code: "BILL_REJECTED", message: err.detail } },
        { status },
      );
    }
    if (err instanceof BillCheckUnavailableError) {
      console.error("[billcheck] agent unreachable", err.cause ?? err);
      return NextResponse.json(
        {
          error: {
            code: "BILLCHECK_UNAVAILABLE",
            message:
              "The bill checking agent is not responding, so this bill was not submitted. " +
              "Nothing has been saved. Start the agent and try again.",
          },
        },
        { status: 503 },
      );
    }
    console.error("[billcheck] unexpected failure", err);
    return NextResponse.json(
      { error: { code: "BILLCHECK_FAILED", message: "The bill could not be checked." } },
      { status: 500 },
    );
  }
}

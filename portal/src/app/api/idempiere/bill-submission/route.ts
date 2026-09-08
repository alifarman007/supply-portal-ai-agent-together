import { NextResponse } from "next/server";
import {
  ErpRejectedError,
  ErpUnavailableError,
  erpPostJson,
  erpWritesEnabled,
  isErpConfigured,
} from "@/lib/idempiere/client";
import {
  MAX_ATTACHMENT_DECODED_BYTES,
  isErpDate,
  toErpAmount,
  validateErpAttachment,
} from "@/lib/idempiere/mappers";
import type { RawBillSubmissionRequest, RawBillSubmissionSuccess } from "@/lib/idempiere/types";

/**
 * Submit a supplier bill to the ERP — API §4, POST /supplier/bill-submission/add.
 *
 * NO MOCK FALLBACK, for the same reason the agent's submit route has none: this
 * creates a Bill Checking record against a real purchase order. Answering with a
 * cheerful success for a record that does not exist is the one outcome a
 * supplier cannot recover from, because they have no way to tell it apart from
 * a real one.
 *
 * But note the difference from the agent's route, which can truthfully say
 * "Nothing has been saved": that call is to a local service, and a failure there
 * means the request never landed. This one crosses a network to a remote ERP. A
 * timeout or a dropped connection says nothing about whether the ERP committed —
 * it may well have created the record and failed to tell us. So the unavailable
 * branch reports UNCERTAINTY and warns about duplicates, rather than issuing a
 * reassurance it cannot support. §4 documents no idempotency key, so a blind
 * retry is exactly how a bill gets lodged twice.
 *
 * Two separate switches guard it. `IDEMPIERE_BASE_URL` says the ERP is
 * configured at all; `IDEMPIERE_WRITES_ENABLED` says this deployment may create
 * records in it. Filling in the first to read live purchase orders is not
 * consent to the second, and the ERP in the specification is a shared UAT box.
 */

export async function POST(request: Request) {
  if (!isErpConfigured()) {
    return NextResponse.json(
      {
        error: {
          code: "ERP_NOT_CONFIGURED",
          message:
            "The ERP is not configured. Set IDEMPIERE_BASE_URL and the credentials in " +
            "portal/.env.local.",
        },
      },
      { status: 503 },
    );
  }

  if (!erpWritesEnabled()) {
    return NextResponse.json(
      {
        error: {
          code: "ERP_WRITES_DISABLED",
          message:
            "ERP writes are turned off on this deployment, so the bill was not submitted. " +
            "Set IDEMPIERE_WRITES_ENABLED=true in portal/.env.local to enable them.",
        },
      },
      { status: 503 },
    );
  }

  let body: Partial<RawBillSubmissionRequest>;
  try {
    body = (await request.json()) as Partial<RawBillSubmissionRequest>;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } },
      { status: 400 },
    );
  }

  // Validate what the ERP validates, before spending a round trip and before
  // creating anything. Its own messages are quoted in §4.9; matching them here
  // means the supplier sees the same wording whichever side caught the problem.
  const poDocNo = body.poDocNo?.trim();
  if (!poDocNo) {
    return NextResponse.json(
      { error: { code: "MISSING_PO_DOC_NO", message: "error 'poDocNo' is missing" } },
      { status: 400 },
    );
  }

  const billSubmitDate = body.billSubmitDate?.trim();
  if (!billSubmitDate) {
    return NextResponse.json(
      { error: { code: "MISSING_BILL_DATE", message: "error 'billSubmitDate' is missing" } },
      { status: 400 },
    );
  }
  if (!isErpDate(billSubmitDate)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_BILL_DATE",
          message: "error 'billSubmitDate' format should be 'yyyy-MM-dd'",
        },
      },
      { status: 400 },
    );
  }

  if (body.billAmount === undefined || body.billAmount === null) {
    return NextResponse.json(
      { error: { code: "MISSING_BILL_AMOUNT", message: "error 'billAmount' is missing" } },
      { status: 400 },
    );
  }
  const billAmount = Number(body.billAmount);
  if (!Number.isFinite(billAmount) || billAmount <= 0) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_BILL_AMOUNT",
          message: "error 'billAmount' must be greater than zero",
        },
      },
      { status: 400 },
    );
  }

  // The browser already checked this, and that check is a convenience, not a
  // control — anyone can post here directly. Re-checked server-side so an
  // oversized or bogus blob never reaches the ERP.
  if (body.attachment) {
    const problem = validateErpAttachment(body.attachment);
    if (problem) {
      const message =
        problem === "empty"
          ? "Attachment is empty"
          : problem === "too_large"
            ? `Attachment exceeds the ${MAX_ATTACHMENT_DECODED_BYTES / (1024 * 1024)} MB limit.`
            : problem === "unsupported_type"
              ? "Unsupported or invalid attachment file type."
              : problem === "escaped_data_uri"
                ? "Invalid attachment. There should be no backslash before ':' in the data URI."
                : "Invalid attachment. Attachment must be Base64 encoded.";
      return NextResponse.json(
        { error: { code: "INVALID_ATTACHMENT", message } },
        { status: 400 },
      );
    }
  }

  const payload: RawBillSubmissionRequest = {
    poDocNo,
    billSubmitDate,
    billAmount: toErpAmount(billAmount),
    ...(body.billNo?.trim() ? { billNo: body.billNo.trim() } : {}),
    ...(body.vatChallanSubmitted === undefined
      ? {}
      : { vatChallanSubmitted: Boolean(body.vatChallanSubmitted) }),
    ...(body.remarks?.trim() ? { remarks: body.remarks.trim() } : {}),
    ...(body.attachment ? { attachment: body.attachment } : {}),
  };

  try {
    const result = await erpPostJson<RawBillSubmissionSuccess>(
      "/supplier/bill-submission/add",
      payload,
    );
    return NextResponse.json({
      // As a STRING. API-CONTRACT.md: ids cross this boundary as strings even
      // when iDempiere's own column is numeric, because mixed types break React
      // keys and URL routing downstream.
      billCheckingId: String(result.billCheckingId),
      poDocNo: result.poId,
      amount: result.amount,
      message: result.message,
    });
  } catch (err) {
    if (err instanceof ErpRejectedError) {
      // The ERP's own words — "error: Purchase Order X not found", "Attachment
      // MIME type does not match actual file type", and so on. Far more useful
      // in front of a supplier than a generic failure, and it is the only place
      // the real reason exists.
      return NextResponse.json(
        { error: { code: "ERP_REJECTED", message: err.message } },
        { status: 422 },
      );
    }
    if (err instanceof ErpUnavailableError) {
      // Log the cause, never the payload: `attachment` is megabytes of base64
      // and would flood the log on every failure.
      console.error("[idempiere] bill submission unreachable", err.cause ?? err);
      return NextResponse.json(
        {
          error: {
            code: "ERP_UNAVAILABLE",
            message:
              "The ERP did not answer, so it is not confirmed whether this bill " +
              "reached it. The check result above still stands. Please verify in " +
              "the ERP before submitting it again, to avoid a duplicate.",
          },
        },
        { status: 503 },
      );
    }
    console.error("[idempiere] bill submission failed unexpectedly", err);
    return NextResponse.json(
      { error: { code: "ERP_FAILED", message: "The bill could not be submitted to the ERP." } },
      { status: 500 },
    );
  }
}

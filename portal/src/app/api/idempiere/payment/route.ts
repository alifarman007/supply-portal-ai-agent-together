import { NextResponse } from "next/server";
import { internalSectionEnabled } from "@/lib/billcheck/client";
import {
  ErpRejectedError,
  ErpUnavailableError,
  erpPostJson,
  erpWritesEnabled,
  isErpConfigured,
} from "@/lib/idempiere/client";
import { isErpDate, toErpAmount } from "@/lib/idempiere/mappers";
import { TENDER_TYPES } from "@/lib/idempiere/types";
import type {
  RawSupplierPaymentRequest,
  RawSupplierPaymentSuccess,
  TenderType,
} from "@/lib/idempiere/types";

/**
 * Record a payment to a supplier — API §5, POST /supplier/payment/add.
 *
 * THREE gates, and the first one is not about the ERP at all.
 *
 * This endpoint creates a payment *to* a supplier. That is a treasury action:
 * the party being paid is not the party who decides to pay. Every role in this
 * portal is a supplier role, self-selected from a menu, in an app with no
 * authentication — so there is no identity here that could be allowed to do it.
 * Until there is, the action lives behind `BILLCHECK_INTERNAL`, the same
 * server-side gate that hides the internal bill-checking queue, and returns 404
 * rather than 403 so an ungated deployment does not even admit it exists.
 *
 * `IDEMPIERE_WRITES_ENABLED` and `IDEMPIERE_BASE_URL` then apply as they do to
 * every other ERP write. No mock fallback: a payment that was not recorded must
 * never look like one that was.
 */

export async function POST(request: Request) {
  if (!internalSectionEnabled()) {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found." } },
      { status: 404 },
    );
  }

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
            "ERP writes are turned off on this deployment, so no payment was recorded. " +
            "Set IDEMPIERE_WRITES_ENABLED=true in portal/.env.local to enable them.",
        },
      },
      { status: 503 },
    );
  }

  let body: Partial<RawSupplierPaymentRequest>;
  try {
    body = (await request.json()) as Partial<RawSupplierPaymentRequest>;
  } catch {
    return NextResponse.json(
      { error: { code: "INVALID_JSON", message: "Request body is not valid JSON." } },
      { status: 400 },
    );
  }

  const id = body.id?.trim();
  if (!id) {
    return NextResponse.json(
      { error: { code: "MISSING_PAYMENT_ID", message: "error 'id' is missing" } },
      { status: 400 },
    );
  }

  const paymentDate = body.paymentDate?.trim();
  if (!paymentDate) {
    return NextResponse.json(
      { error: { code: "MISSING_PAYMENT_DATE", message: "error 'paymentDate' is missing" } },
      { status: 400 },
    );
  }
  if (!isErpDate(paymentDate)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_PAYMENT_DATE",
          message: "error 'paymentDate' format should be 'yyyy-MM-dd'",
        },
      },
      { status: 400 },
    );
  }

  const bankName = body.bankName?.trim();
  if (!bankName) {
    return NextResponse.json(
      { error: { code: "MISSING_BANK_NAME", message: "error 'bankName' is missing" } },
      { status: 400 },
    );
  }

  if (body.netAmountPaid === undefined || body.netAmountPaid === null) {
    return NextResponse.json(
      { error: { code: "MISSING_NET_AMOUNT", message: "error 'netAmountPaid' is missing" } },
      { status: 400 },
    );
  }
  const netAmountPaid = Number(body.netAmountPaid);
  if (!Number.isFinite(netAmountPaid) || netAmountPaid <= 0) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_NET_AMOUNT",
          message: "error 'netAmountPaid' must be greater than zero",
        },
      },
      { status: 400 },
    );
  }

  // §5.4. An unrecognised code is refused here rather than passed on, because
  // the ERP's documented behaviour for a missing TenderType is to default to
  // "X" (Cash) — so a typo would silently record a cash payment instead of the
  // bank transfer that was intended.
  const tenderType = body.TenderType?.trim().toUpperCase();
  if (tenderType && !(tenderType in TENDER_TYPES)) {
    return NextResponse.json(
      {
        error: {
          code: "INVALID_TENDER_TYPE",
          message: `error 'TenderType' must be one of ${Object.keys(TENDER_TYPES).join(", ")}`,
        },
      },
      { status: 400 },
    );
  }

  const payload: RawSupplierPaymentRequest = {
    id,
    paymentDate,
    bankName,
    netAmountPaid: toErpAmount(netAmountPaid),
    ...(body.invoiceNumber?.trim() ? { invoiceNumber: body.invoiceNumber.trim() } : {}),
    ...(body.bpCode?.trim() ? { bpCode: body.bpCode.trim() } : {}),
    ...(body.bankAcctNo?.trim() ? { bankAcctNo: body.bankAcctNo.trim() } : {}),
    ...(tenderType ? { TenderType: tenderType as TenderType } : {}),
    ...(body.Description?.trim() ? { Description: body.Description.trim() } : {}),
  };

  try {
    const result = await erpPostJson<RawSupplierPaymentSuccess>("/supplier/payment/add", payload);
    return NextResponse.json({
      supplierPaymentDocNo: result.supplierPaymentDocNo,
      paymentId: result.paymentId,
      invoiceId: String(result.invoiceId),
      invoiceNumber: result.invoiceNumber,
      netAmountPaid: result.netAmountPaid,
      message: result.message,
    });
  } catch (err) {
    if (err instanceof ErpRejectedError) {
      return NextResponse.json(
        { error: { code: "ERP_REJECTED", message: err.message } },
        { status: 422 },
      );
    }
    if (err instanceof ErpUnavailableError) {
      // Never log the payload: it carries a bank account number.
      console.error("[idempiere] supplier payment unreachable", err.cause ?? err);
      return NextResponse.json(
        {
          error: {
            code: "ERP_UNAVAILABLE",
            message:
              "The ERP did not answer, so it is not confirmed whether this payment " +
              "was created. Check the ERP before recording it again.",
          },
        },
        { status: 503 },
      );
    }
    console.error("[idempiere] supplier payment failed unexpectedly", err);
    return NextResponse.json(
      { error: { code: "ERP_FAILED", message: "The payment could not be recorded in the ERP." } },
      { status: 500 },
    );
  }
}

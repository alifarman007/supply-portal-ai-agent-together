/**
 * Raw shapes returned by the iDempiere Supplier Purchase Order API, as
 * documented in docs/SupplierPortal.pdf. These are intentionally left
 * close to the wire format (decimals as numbers, iDempiere doc statuses,
 * free-text order statuses) — src/lib/idempiere/mappers.ts converts them
 * into the frontend's `PurchaseOrder` shape.
 *
 * The two WRITE endpoints (bill submission and supplier payment) are specified
 * in Supplier_Portal_api_adding.pdf. That document is gitignored: it ships
 * working UAT credentials and live JWTs. The shapes it defines live here.
 */

export interface RawTokenResponse {
  userId: number;
  language: string;
  menuTreeId: number;
  token: string;
  refresh_token: string;
}

export interface RawPOListItem {
  poId: number;
  poNumber: string;
  description: string;
  issueDate: string;
  expectedDeliveryDate: string;
  orderStatus: string;
  costCenter: string;
  contactName: string;
  contactEmail: string;
  deliveryAddress: string;
  termsAndConditions: string;
  itemNumber: number;
  netPayable: number;
  grandTotal: number;
  vdsAmount: number;
  tdsAmount: number;
  billDetails: string;
  billSubmittedAmount: number;
  paymentDueAmount: number;
  paidAmount: number;
  binNumber: string;
  currencySymbol: string;
  currencyISOCode: string;
}

export interface RawPOListResponse {
  supplierName: string;
  supplierCode: string;
  totalRecords: number;
  purchaseOrders: RawPOListItem[];
  status: string;
}

export interface RawPOLineItem {
  line: number;
  productId: number;
  itemCode: string;
  itemName: string;
  description: string;
  unit: string;
  quantity: number;
  quantityDelivered: number;
  quantityInvoiced: number;
  unitPrice: number;
  total: number;
  vatRate: string;
  vdsAmount: number | null;
  vdsIncluding: boolean;
  vdsExcluding: boolean;
  vdsExempted: boolean;
  tdsAmount: number;
  tdsIncluding: boolean;
  tdsExcluding: boolean;
  tdsExempted: boolean;
  supplementaryDuty: number;
  supplementaryDutyAmount: number;
}

export interface RawPODetailResponse {
  poId: number;
  poNumber: string;
  description: string;
  docStatus: string;
  orderStatus: string;
  costCenter: string;
  contactName: string;
  contactEmail: string;
  deliveryAddress: string;
  termsAndConditions: string;
  issueDate: string;
  expectedDeliveryDate: string;
  itemNumber: number;
  totalLines: number;
  orderedQty: number;
  deliveredQty: number;
  netPayable: number;
  grandTotal: number;
  vdsAmount: number;
  tdsAmount: number;
  billDetails: string;
  billSubmittedAmount: number;
  paymentDueAmount: number;
  paidAmount: number;
  binNumber: string;
  currencyISOCode: string;
  linesData: RawPOLineItem[];
}

// ---------------------------------------------------------------------------
// Write endpoints
//
// Both share one envelope: `status` is "success" or "error", and `message`
// carries the human-readable reason. The specification documents NO HTTP status
// codes for either endpoint — only this JSON body — so a failure may well
// arrive as HTTP 200 with `status: "error"`. Never treat `res.ok` alone as
// success; always read `status`.
// ---------------------------------------------------------------------------

export interface RawErpErrorResponse {
  status: "error";
  message: string;
}

/** POST /supplier/bill-submission/add — §4 of the API specification. */
export interface RawBillSubmissionRequest {
  /** Required. Must match an existing PO: IsSOTrx='N', IsActive='Y', docStatus CO or CL. */
  poDocNo: string;
  /** Required. Strictly `yyyy-MM-dd`; `02-09-2026` and `2026/09/02` are both rejected. */
  billSubmitDate: string;
  billNo?: string;
  vatChallanSubmitted?: boolean;
  /** Required, must be greater than zero. */
  billAmount: number;
  remarks?: string;
  /** `data:<MIME>;base64,<DATA>`, or raw base64. See ATTACHMENT_MIME_TYPES. */
  attachment?: string;
}

export interface RawBillSubmissionSuccess {
  status: "success";
  message: string;
  /** Id of the Bill Checking record the ERP created. */
  billCheckingId: number;
  /** Echoed back as the PO document number, despite the name. */
  poId: string;
  amount: number;
}

export type RawBillSubmissionResponse = RawBillSubmissionSuccess | RawErpErrorResponse;

/**
 * POST /supplier/payment/add — §5 of the API specification.
 *
 * `TenderType` and `Description` are capitalised on the wire while every other
 * field is camelCase. That is what the ERP expects; it is not a typo here.
 */
export interface RawSupplierPaymentRequest {
  /** Required. Caller-chosen unique reference for this payment. */
  id: string;
  invoiceNumber?: string;
  /** Required. Strictly `yyyy-MM-dd`. */
  paymentDate: string;
  /** Supplier / business partner code. */
  bpCode?: string;
  /** Required. */
  bankName: string;
  bankAcctNo?: string;
  /** Required, must be greater than zero. */
  netAmountPaid: number;
  TenderType?: TenderType;
  Description?: string;
}

export interface RawSupplierPaymentSuccess {
  status: "success";
  message: string;
  supplierPaymentDocNo: string;
  /** Echo of the `id` sent in the request. */
  paymentId: string;
  invoiceId: number;
  invoiceNumber: string;
  netAmountPaid: number;
}

export type RawSupplierPaymentResponse = RawSupplierPaymentSuccess | RawErpErrorResponse;

/** §5.4. The ERP defaults to "X" (Cash) when TenderType is omitted. */
export const TENDER_TYPES = {
  A: "Direct Deposit (ACH)",
  C: "Credit Card",
  D: "Direct Debit",
  K: "Check",
  T: "Account",
  X: "Cash",
} as const;

export type TenderType = keyof typeof TENDER_TYPES;

/**
 * §4.6.4. The ERP decodes the attachment and checks the real file type against
 * the MIME type the data URI declares, so a mislabelled file is rejected with
 * "Attachment MIME type does not match actual file type".
 */
export const ATTACHMENT_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "application/pdf",
] as const;

export type AttachmentMimeType = (typeof ATTACHMENT_MIME_TYPES)[number];

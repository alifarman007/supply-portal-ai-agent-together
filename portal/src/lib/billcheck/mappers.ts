import type { PurchaseOrder, POLineItem, InvoiceStatus } from "@/lib/mock/types";
import type { AgentBillIn, AgentBillLine, AgentBillStatus, MoneyString } from "./types";

/**
 * Translation between the portal's shapes and the agent's.
 *
 * Everything money-related lives here rather than being inlined at a call site, because
 * two of these conversions are silently wrong if you get them slightly off and neither
 * raises an error when you do.
 */

/** VAT rate used only to convert between VAT-inclusive and ex-VAT figures. */
const VAT_DIVISOR = 1.15;

/** Taka are quoted to two decimal places; the agent rejects anything finer than a paisa. */
export function toMoneyString(value: number): MoneyString {
  if (!Number.isFinite(value)) {
    throw new RangeError(`refusing to send a non-finite amount to the agent: ${value}`);
  }
  return value.toFixed(2);
}

/** Parse an agent money string for DISPLAY only. Never send the result back. */
export function moneyToNumber(value: MoneyString | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * THE VAT TRAP.
 *
 * The bill form asks the supplier for one VAT-INCLUSIVE amount, because that is the
 * figure printed on the purchase order's grand total. The agent's policy is
 * `po_prices_include_vat: false`, so it treats every line amount as the EX-VAT base and
 * adds VAT to it.
 *
 * Send the form's number straight through and every downstream figure — VAT, VDS, TDS,
 * net payable — comes out about 15% too high, and nothing raises an exception, because
 * the arithmetic is perfectly consistent with the wrong input. On PO-2026-0001 that is
 * 336,950 sent where 293,000 was meant: an overstatement of 43,950 taka.
 *
 * This is not a guess about which convention is right. Kazi Farms' own withholding
 * workbook computes invoice 5,750,000 minus VAT 750,000 to reach a purchase price of
 * 5,000,000, and withholds against that ex-VAT figure. The agent reproduces those numbers
 * exactly in `agent/tests/golden/test_company_worked_example.py`, which fails if anyone
 * flips the base.
 */
export function vatInclusiveToExVat(vatInclusive: number): number {
  return vatInclusive / VAT_DIVISOR;
}

export function exVatToVatInclusive(exVat: number): number {
  return exVat * VAT_DIVISOR;
}

/**
 * PO status → whether the portal should offer to bill it.
 *
 * The two systems use the word "status" for different axes: the portal's describes
 * DELIVERY progress (issued → acknowledged → partially_fulfilled → fulfilled) and the
 * agent's describes BILLING progress (open → partially_billed → closed). They are not the
 * same ladder, and the tempting mapping of `fulfilled` onto `closed` is exactly wrong —
 * `fulfilled` means the goods arrived, which is when a bill SHOULD be accepted, whereas
 * the agent refuses to check anything that is not `open` or `partially_billed`.
 */
export function isBillable(po: Pick<PurchaseOrder, "status">): boolean {
  return po.status !== "draft" && po.status !== "cancelled";
}

/** The agent's bill status → the portal's invoice status, for display in existing tables. */
export function toInvoiceStatus(status: AgentBillStatus): InvoiceStatus {
  switch (status) {
    case "RECEIVED":
    case "ASSIGNED":
      return "submitted";
    case "CHECKING":
    case "PENDING_CFO":
      return "under_review";
    case "APPROVED":
    case "PAYMENT_INSTRUCTED":
      return "approved";
    case "PAID":
      return "paid";
    case "REJECTED":
      return "rejected";
    case "RETURNED":
      // The portal has no "sent back for correction" state. `draft` is the closest
      // honest fit: the supplier has to act before anything moves on.
      return "draft";
  }
}

/**
 * Turn a purchase order's lines into editable bill lines.
 *
 * The agent needs lines — it cannot three-way-match a single lump sum against a purchase
 * order and a goods receipt, and it cannot pick a tax rate without knowing what was
 * bought. The portal's form historically sent one fabricated line reading "Bill against
 * PO-...", which carries none of that.
 *
 * PO prices are already ex-VAT (the mock data has `subtotal + vatAmount === grandTotal`
 * for every order), so these amounts need no conversion.
 */
export interface DraftBillLine {
  lineNo: number;
  description: string;
  productCode: string;
  unit: string;
  /** Editable by the supplier: they may be billing for a partial delivery. */
  quantity: number;
  unitPrice: number;
}

export function draftLinesFromPo(po: PurchaseOrder): DraftBillLine[] {
  return po.items.map((item: POLineItem, index) => ({
    lineNo: index + 1,
    description: item.description,
    productCode: item.id,
    unit: item.unit,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
  }));
}

export function lineAmount(line: DraftBillLine): number {
  return line.quantity * line.unitPrice;
}

export function draftLinesTotal(lines: DraftBillLine[]): number {
  return lines.reduce((sum, line) => sum + lineAmount(line), 0);
}

/**
 * Build the agent's `POST /bills` payload.
 *
 * `claimed_total_tk` is computed from the line amounts rather than taken from the form,
 * because the agent requires the two to agree to the paisa and rejects the bill with a
 * 422 if they do not. Deriving it here means they cannot drift.
 */
export function toAgentBill(args: {
  billId: string;
  supplierId: string;
  po: PurchaseOrder;
  supplierInvoiceNo: string;
  invoiceDate: string;
  mushakNo?: string | null;
  lines: DraftBillLine[];
}): AgentBillIn {
  const lines: AgentBillLine[] = args.lines.map((line) => ({
    line_no: line.lineNo,
    description: line.description,
    product_code: line.productCode || null,
    qty: String(line.quantity),
    unit_price_tk: toMoneyString(line.unitPrice),
    amount_tk: toMoneyString(lineAmount(line)),
  }));

  const claimed = lines.reduce((sum, line) => sum + Number(line.amount_tk), 0);

  return {
    id: args.billId,
    supplier_id: args.supplierId,
    po_id: args.po.id,
    supplier_invoice_no: args.supplierInvoiceNo,
    invoice_date: args.invoiceDate,
    mushak_6_3_no: args.mushakNo || null,
    claimed_total_tk: toMoneyString(claimed),
    lines,
  };
}

/**
 * A bill reference for a purchase order.
 *
 * Kept deterministic on purpose. The agent treats a repeated id as a duplicate and
 * refuses it with a 409, so re-submitting the same purchase order does not quietly create
 * a second bill — the supplier is told instead.
 */
export function billIdFor(po: PurchaseOrder, sequence: number): string {
  return `BILL-${po.poNumber}-${String(sequence).padStart(2, "0")}`;
}

/**
 * The invoice total: supply value plus VAT, before any withholding.
 *
 * Derived from the agent's own `netting_order` by summing every positive row —
 * the approved base and each VAT line — and ignoring the negative ones, which
 * are the VDS and TDS the buyer withholds at payment time. On PO-2026-0001 that
 * is 293,000 + 33,750 + 10,200 = 336,950, against a net payable of 328,160.
 *
 * It matters that this reads the agent's ledger rather than multiplying by 1.15.
 * The portal does not know the VAT rate — the schedule has 15/10/7.5/5/exempt
 * bands keyed to each line's category — and asserting one is the exact bug that
 * `test_the_bill_form_asserts_no_tax_rate_of_its_own` exists to prevent. Here
 * the figure is the checker's, and the portal only adds it up.
 *
 * Returns null when the check produced no ledger at all, which is what a BLOCKED
 * bill looks like: `_finalize_blocked` short-circuits before computing anything.
 */
export function invoiceTotalFromCheck(detail: {
  breakdown?: { netting_order?: { amount: MoneyString }[] } | null;
  net_payable_tk?: MoneyString | null;
} | null | undefined): number | null {
  const ledger = detail?.breakdown?.netting_order;
  if (!ledger?.length || detail?.net_payable_tk === null) return null;

  const total = ledger
    .map((row) => moneyToNumber(row.amount))
    .filter((amount) => amount >= 0)
    .reduce((sum, amount) => sum + amount, 0);

  return total > 0 ? total : null;
}

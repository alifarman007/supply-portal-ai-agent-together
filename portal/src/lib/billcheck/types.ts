/**
 * Wire types for the bill checking agent (the Python service in `agent/`).
 *
 * MONEY AND QUANTITIES ARE STRINGS, NOT NUMBERS, AND THAT IS DELIBERATE.
 *
 * The agent holds money as a Python `Decimal` stored as integer paisa, and passing it a
 * float raises `TypeError` outright. A JavaScript `number` is an IEEE-754 double, which
 * cannot represent 0.1 exactly — so parsing money into a `number` and sending it back is
 * a lossy round trip on a value that is somebody's payment. Quantities are covered by the
 * same rule: the agent stores them as exact Decimals too, so a fractional quantity like
 * 2.5 kg has to survive the trip intact.
 *
 * The rule: money and quantities cross this boundary as strings. Parse to `number` only
 * at the point of display, and never send a parsed value back.
 */

/** A decimal amount in taka, as a string: "328160.00". Never a JS number. */
export type MoneyString = string;

/** An exact quantity, as a string: "5000" or "2.5". Never a JS number. */
export type QuantityString = string;

export type Recommendation =
  | "CLEAR"
  | "CLEAR_WITH_ADJUSTMENTS"
  | "REVIEW_REQUIRED"
  | "BLOCKED";

export type ExceptionSeverity = "BLOCKER" | "REVIEW" | "INFO";

/** The agent's bill status. Distinct from the portal's InvoiceStatus — see mappers.ts. */
export type AgentBillStatus =
  | "RECEIVED"
  | "ASSIGNED"
  | "CHECKING"
  | "PENDING_CFO"
  | "APPROVED"
  | "RETURNED"
  | "REJECTED"
  | "PAYMENT_INSTRUCTED"
  | "PAID";

export interface AgentException {
  code: string;
  severity: ExceptionSeverity;
  message: string;
  rule_id?: string | null;
  line_no?: number | null;
}

/** One line of a bill, as the agent's `BillIn` schema expects it. */
export interface AgentBillLine {
  line_no: number;
  description: string;
  product_code?: string | null;
  qty: QuantityString;
  unit_price_tk: MoneyString;
  amount_tk: MoneyString;
}

/**
 * The payload for `POST /bills`.
 *
 * `claimed_total_tk` must equal the sum of the line amounts EXACTLY, to the paisa — the
 * agent validates this and rejects a mismatch with a 422. It is also an EX-VAT figure:
 * the agent adds VAT to what it is given. See `toAgentBill` in mappers.ts.
 */
export interface AgentBillIn {
  id: string;
  supplier_id: string;
  po_id: string;
  supplier_invoice_no: string;
  invoice_date: string; // YYYY-MM-DD
  mushak_6_3_no?: string | null;
  claimed_total_tk: MoneyString;
  lines: AgentBillLine[];
}

/** Response from `POST /bills/{id}/check`. */
export interface AgentCheckResult {
  run_id: string;
  recommendation: Recommendation;
  /** null when the check was BLOCKED — nothing is computed past a blocker. */
  net_payable_tk: MoneyString | null;
  exceptions: AgentException[];
}

/** Response from `GET /bills/{id}`. */
export interface AgentBillStatusResponse {
  id: string;
  status: AgentBillStatus;
  supplier_id: string;
  po_id: string;
  supplier_invoice_no: string;
  claimed_total_tk: MoneyString;
  latest_run: {
    run_id: string;
    status: string;
    started_at: string;
    rules_version: string;
    llm_provider: string | null;
    recommendation: Recommendation | null;
    net_payable_tk: MoneyString | null;
  } | null;
}

/** The portal's own error envelope, matching the iDempiere route handlers. */
export interface ApiErrorBody {
  error: { code: string; message: string };
}

// --- The internal review view -------------------------------------------------------
// Shapes returned by the agent's `GET /review?format=json` and
// `GET /review/{billId}?format=json`. Field names mirror the agent exactly, so the two
// can be compared side by side when something disagrees.

export interface QueueRow {
  bill_id: string;
  supplier_id: string;
  po_id: string;
  supplier_invoice_no: string;
  invoice_date: string | null;
  status: AgentBillStatus;
  claimed_total_tk: MoneyString;
  recommendation: Recommendation | null;
  net_payable_tk: MoneyString | null;
}

/** One rate the run actually applied, with the gazette citation behind it. */
export interface AppliedRate {
  tax: "VAT" | "VDS" | "TDS" | string;
  rule_id: string;
  rate: string;
  applies_to: string;
  base: MoneyString;
  amount: MoneyString;
  source_doc: string;
  /** True while the citation is still marked DRAFT / PLACEHOLDER / UNVERIFIED. */
  unverified: boolean;
}

export interface BreakdownLine {
  bill_line_no: number;
  po_line_no: number | null;
  product_code: string | null;
  billed_qty: QuantityString;
  approved_qty: QuantityString;
  billed_unit_price: MoneyString;
  approved_unit_price: MoneyString;
  billed_amount: MoneyString;
  approved_amount: MoneyString;
}

export interface Adjustment {
  line_no: number;
  amount: MoneyString;
  rule_id: string;
}

export interface Breakdown {
  gross_claimed: MoneyString;
  approved_base: MoneyString;
  price_adjustments: Adjustment[];
  qty_adjustments: Adjustment[];
  lines: BreakdownLine[];
  vat?: unknown;
  vds_deducted?: MoneyString;
  tds_deducted?: MoneyString;
  vds_services?: unknown;
  advance_adjusted?: MoneyString;
  retention_held?: MoneyString;
  other_deductions?: unknown;
}

export interface ReviewDetail {
  bill: {
    id: string;
    status: AgentBillStatus;
    supplier_id: string;
    supplier_name: string | null;
    po_id: string;
    supplier_invoice_no: string;
    invoice_date: string | null;
    mushak_6_3_no: string | null;
    claimed_total_tk: MoneyString;
  };
  run: {
    run_id: string;
    status: string;
    started_at: string;
    finished_at: string | null;
    rules_version: string | null;
    llm_provider: string | null;
    llm_model: string | null;
  } | null;
  recommendation: Recommendation | null;
  net_payable_tk: MoneyString | null;
  gross_claimed_tk: MoneyString | null;
  approved_base_tk: MoneyString | null;
  breakdown: Breakdown;
  exceptions: AgentException[];
  rates_applied: AppliedRate[];
  report_md: string | null;
  approvals: {
    decided_at: string;
    decision: string;
    decided_by: string;
    final_tk: MoneyString | null;
    comment: string | null;
  }[];
  /** Whether a decision can still be made. Decisions are taken on the agent's own UI. */
  decidable: boolean;
  /** Where to go to approve or reject — the agent's review page. */
  review_url: string;
}

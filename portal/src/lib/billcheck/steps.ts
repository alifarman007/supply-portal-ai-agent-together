import type { AgentException, AppliedRate, ReviewDetail } from "./types";

/**
 * The checks the agent actually performs, in the order it performs them.
 *
 * These are not invented stages. Each one maps to a real step in
 * `agent/app/agent/pipeline.py` and owns the real exception codes that step can raise
 * (the full severity table is `agent/app/rules/policies.yaml`). A step's tick, its colour
 * and its one-line summary are all derived from what the run actually found — nothing
 * here is decorative.
 *
 * ON TIMING, because it matters: the deterministic check completes in roughly 90 ms. The
 * progress screen paces the REVEAL of these results so a person can read them; it does
 * not simulate work that is not happening, and the true elapsed time is shown at the end.
 * When the AI nodes are switched on the wait is genuinely 15-45 seconds, and the last step
 * holds until the answer arrives.
 */

export type StepState =
  | "pending"
  | "running"
  | "ok"
  | "warn"
  | "blocked"
  /**
   * The run stopped before this step. A blocker short-circuits the pipeline
   * (`_finalize_blocked` in pipeline.py skips all computation and leaves the payable
   * null), so the steps after it never executed and must not be shown with a green tick
   * claiming they passed.
   */
  | "skipped";

export interface CheckStep {
  key: string;
  /** What this step verifies, in the supplier's terms. */
  title: string;
  /** Which exception codes belong to this step. */
  codes: string[];
}

export const CHECK_STEPS: CheckStep[] = [
  {
    key: "supplier",
    title: "Supplier record",
    codes: ["supplier_not_found", "supplier_on_hold", "supplier_blacklisted"],
  },
  {
    key: "po",
    title: "Purchase order and line matching",
    codes: [
      "po_not_found",
      "po_not_open",
      "invalid_bill",
      "line_amount_mismatch",
      "unmapped_line",
      "mapping_low_confidence",
      "ambiguous_mapping",
      "proposal_mapping_suspect",
    ],
  },
  {
    key: "grn",
    title: "Goods receipt — quantities and prices",
    codes: ["missing_grn", "qty_over_grn", "price_over_po", "price_under_po"],
  },
  {
    key: "duplicate",
    title: "Duplicate bill check",
    codes: ["duplicate_exact", "duplicate_fuzzy"],
  },
  {
    key: "classification",
    title: "Tax rules for these products",
    codes: [
      "unclassified_item",
      "vds_service_code_unknown",
      "vds_service_rate_ambiguous",
      "mushak_bin_invalid",
      "mushak_no_format_invalid",
      "mushak_fiscal_year_mismatch",
      "mushak_purchaser_mismatch",
      "mushak_supplier_mismatch",
      "mushak_line_uncoded",
      "mushak_no_lines",
      "mushak_total_mismatch",
      // Node B proposing a tax category is part of classifying the product, and the
      // proposal is always re-validated against the rule tables before it is used.
      "tax_category_proposed",
    ],
  },
  {
    key: "vat",
    title: "VAT",
    codes: ["mushak_vat_arithmetic", "mushak_sd_arithmetic", "mushak_line_arithmetic"],
  },
  {
    key: "withholding",
    title: "Withholding — VDS and TDS",
    codes: [
      "vds_rule_unsupported_action",
      "vds_service_rule5_not_checked",
      "tds_higher_of_commission_unresolved",
      // Whether a Mushak 6.3 exists is precisely what decides if VDS is deducted on
      // goods, so it belongs on this row rather than with the invoice checks.
      "missing_mushak_6_3",
    ],
  },
  {
    key: "netting",
    title: "Advances, netting and the final amount",
    codes: [
      "advance_partially_offset",
      "advance_not_fully_offset",
      "ledger_payment_not_applied",
      "ledger_entry_not_applied",
      // Run-level caveats rather than netting problems, carried here so they cannot
      // go unseen: the AI nodes are optional and degrade to deterministic behaviour,
      // and the numeric guard replaces an AI narrative that invented a number with the
      // deterministic template. Both qualify the final answer, so they sit beside it.
      "llm_node_failed",
      "report_numeric_guard_failed",
    ],
  },
];

export interface ResolvedStep {
  key: string;
  title: string;
  state: StepState;
  /** One line saying what this step actually found, with real figures. */
  detail: string;
  /** Findings belonging to this step, so the row can list them. */
  findings: AgentException[];
}

function severityToState(findings: AgentException[]): StepState {
  if (findings.some((f) => f.severity === "BLOCKER")) return "blocked";
  if (findings.some((f) => f.severity === "REVIEW")) return "warn";
  return "ok";
}

const money = (value: string | null | undefined) => {
  if (!value) return "—";
  const parsed = Number(value);
  return Number.isFinite(parsed)
    ? parsed.toLocaleString("en-BD", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : value;
};

function ratesFor(rates: AppliedRate[], tax: string) {
  return rates.filter((rate) => rate.tax === tax);
}

function sumAmounts(rates: AppliedRate[]): string {
  const total = rates.reduce((sum, rate) => sum + (Number(rate.amount) || 0), 0);
  return total.toLocaleString("en-BD", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/**
 * Turn one finished run into the eight rows the progress screen shows.
 *
 * Every summary line is built from the run's own output. Where a step found nothing it
 * says what it confirmed rather than just "OK", because "no goods receipt problem" and
 * "120 of 200 units were actually received" are different amounts of information.
 *
 * Two rules keep this honest. A step that failed shows its own findings and NO cheerful
 * summary. And every step after a blocker is marked skipped, because the pipeline stops
 * there — ticking them would claim results the system never computed.
 */
export function resolveSteps(
  detail: ReviewDetail | null,
  /** Human-facing order number, e.g. "PO-2026-0015". The agent stores an internal id. */
  poNumber?: string,
): ResolvedStep[] {
  if (!detail) {
    return CHECK_STEPS.map((step) => ({
      ...step,
      state: "pending" as StepState,
      detail: "",
      findings: [],
    }));
  }

  const lines = detail.breakdown?.lines ?? [];
  const rates = detail.rates_applied ?? [];
  const blocked = detail.recommendation === "BLOCKED";

  // First pass: what did each step find?
  const resolved = CHECK_STEPS.map((step) => {
    const findings = detail.exceptions.filter((e) => step.codes.includes(e.code));
    return { step, findings, state: severityToState(findings) };
  });

  // A blocker stops the pipeline. Everything after the step that raised it never ran, so
  // it is marked skipped rather than passed - a tick there would be a claim the system
  // never actually made.
  const blockedAt = resolved.findIndex((r) => r.state === "blocked");

  return resolved.map(({ step, findings, state }, index) => {
    if (blockedAt !== -1 && index > blockedAt) {
      return {
        ...step,
        state: "skipped" as StepState,
        detail: "Not reached — the check stopped at the problem above",
        findings: [],
      };
    }

    // Where a step failed, its own findings say why. A cheerful summary beside a red
    // cross is worse than no summary: on a bill with no goods receipt the old code
    // printed "every billed quantity is covered by the goods receipt" next to the
    // blocker saying no goods receipt exists.
    if (state === "blocked") {
      return { ...step, state, detail: "", findings };
    }

    const summary = summarise(step.key, {
      detail,
      lines,
      rates,
      blocked,
      state,
      poNumber,
    });
    return { ...step, state, detail: summary, findings };
  });
}

interface SummaryContext {
  detail: ReviewDetail;
  lines: ReviewDetail["breakdown"]["lines"];
  rates: AppliedRate[];
  blocked: boolean;
  state: StepState;
  poNumber?: string;
}

function summarise(key: string, ctx: SummaryContext): string {
  const { detail, lines, rates, blocked, state, poNumber } = ctx;
  const order = poNumber ?? detail.bill.po_id;

  switch (key) {
    case "supplier":
      return `${detail.bill.supplier_name ?? detail.bill.supplier_id} — active`;

    case "po": {
      // A blocked run short-circuits before line computations exist, so there is no line
      // count to report and claiming "0 of 0 matched" would read as a failure.
      if (!lines.length) return `${order} — accepted for billing`;
      const matched = lines.filter((line) => line.po_line_no !== null).length;
      return `${order} — ${matched} of ${lines.length} line${lines.length === 1 ? "" : "s"} matched to the order`;
    }

    case "grn": {
      // A blocked step never reaches here (resolveSteps returns early), so a summary is
      // safe: on a REVIEW the findings say what was wrong and this says what was done
      // about it, which are different and both worth showing.
      const cut = lines.filter((line) => line.billed_qty !== line.approved_qty);
      return cut.length
        ? `${cut.length} line${cut.length === 1 ? "" : "s"} reduced to the quantity actually received`
        : "Every billed quantity is covered by the goods receipt";
    }

    case "duplicate":
      return state === "ok" ? "No earlier bill matches this invoice" : "A similar bill was found";

    case "classification": {
      if (blocked) return "";
      const ruleIds = new Set(rates.filter((r) => r.tax === "TDS").map((r) => r.rule_id));
      return ruleIds.size ? `Classified under ${[...ruleIds].join(", ")}` : "";
    }

    case "vat": {
      const vat = ratesFor(rates, "VAT");
      if (!vat.length) return blocked ? "" : "No VAT applied";
      return `${vat[0].rate} on ${vat.length} line${vat.length === 1 ? "" : "s"} — ${sumAmounts(vat)} Tk`;
    }

    case "withholding": {
      const vds = ratesFor(rates, "VDS");
      const tds = ratesFor(rates, "TDS");
      const parts: string[] = [];
      if (vds.length) {
        const nil = vds.every((rate) => Number(rate.amount) === 0);
        parts.push(nil ? "VDS not deductible" : `VDS ${sumAmounts(vds)} Tk`);
      }
      if (tds.length) parts.push(`TDS ${tds[0].rate} — ${sumAmounts(tds)} Tk`);
      if (parts.length) return parts.join(" · ");
      return blocked ? "" : "No withholding applied";
    }

    case "netting":
      return detail.net_payable_tk === null
        ? "Not computed"
        : `Net payable ${money(detail.net_payable_tk)} Tk`;

    default:
      return "";
  }
}

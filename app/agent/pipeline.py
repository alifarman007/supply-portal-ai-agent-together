"""Bill checking pipeline — PLAN.md §6 steps 1–8, orchestrated deterministically.

Phase 2 shape: every money-touching step is a pure engine call. The LLM node
call sites exist as injectable data (`mapping_proposals` stands in for Node A;
tests mock it) and the report is the deterministic template (§6.8 fallback).
Phase 3 wires the live LLM nodes + numeric guard on top without changing any
computation here.
"""

from __future__ import annotations

import subprocess
import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime
from decimal import Decimal
from pathlib import Path

from sqlalchemy.orm import Session

from app.adapters.erp import ErpGateway, MockErpGateway
from app.agent.guard import find_violations
from app.agent.nodes import propose_line_mappings, propose_tax_categories, write_report
from app.engines.duplicates import BillSummary, check_duplicates
from app.engines.matching import (
    BillLineData,
    LineComputation,
    MappingProposal,
    PoLineData,
    match_lines,
    three_way_line,
)
from app.engines.money import from_paisa, quantize_taka, to_paisa
from app.engines.netting import LedgerAmount, NettingResult, build_netting
from app.engines.policy import CheckException, apply_severities, recommend
from app.engines.tax_tds import compute_tds
from app.engines.tax_vat import compute_vat
from app.engines.tax_vds import evaluate_vds
from app.llm.base import LLMClient, LLMError
from app.models import (
    Bill,
    BillStatus,
    CheckingResult,
    CheckingRun,
    LedgerType,
    PoStatus,
    Recommendation,
    RunStatus,
    SupplierStatus,
)
from app.rules.loader import RuleSet, ruleset_for_date

REPO_ROOT = Path(__file__).resolve().parents[2]

# Only these statuses count as "previously billed" for cumulative qty checks —
# a pending/duplicate submission must not eat the GRN allowance (recorded
# assumption; see CLAUDE.md).
PRIOR_BILLED_STATUSES = {BillStatus.APPROVED, BillStatus.PAYMENT_INSTRUCTED}

BILLABLE_PO_STATUSES = {PoStatus.OPEN, PoStatus.PARTIALLY_BILLED}

# §2.7 no-double-payment: a decided/paid bill can never be re-checked (which
# would reset it to PENDING_CFO and open a second approval). RETURNED bills
# ARE re-checkable (resubmission flow); RECEIVED is not (checking starts after
# assignment, §1).
CHECKABLE_STATUSES = {
    BillStatus.ASSIGNED,
    BillStatus.CHECKING,
    BillStatus.CHECKED,
    BillStatus.PENDING_CFO,
    BillStatus.RETURNED,
}


class BillNotCheckableError(ValueError):
    """The bill's status forbids (re-)checking."""


@dataclass
class PipelineOutcome:
    run_id: str
    bill_id: str
    recommendation: Recommendation
    gross_claimed: Decimal
    approved_base: Decimal | None
    net_payable: Decimal | None
    exceptions: list[CheckException]
    breakdown: dict
    report_md: str
    netting: NettingResult | None = None
    computations: list[LineComputation] = field(default_factory=list)


def _git_sha() -> str | None:
    try:
        return subprocess.check_output(
            ["git", "rev-parse", "--short", "HEAD"],
            cwd=REPO_ROOT,
            text=True,
            stderr=subprocess.DEVNULL,
        ).strip()
    except (OSError, subprocess.CalledProcessError):
        return None


def _money(value: Decimal | None) -> str | None:
    return None if value is None else str(quantize_taka(value))


def check_bill(
    session: Session,
    bill_id: str,
    *,
    gateway: ErpGateway | None = None,
    ruleset: RuleSet | None = None,
    mapping_proposals: dict[int, MappingProposal] | None = None,
    llm: LLMClient | None = None,
) -> PipelineOutcome:
    """Run the checking pipeline on one bill.

    `llm=None` (default) is fully deterministic: unmapped lines and unknown
    categories become REVIEW exceptions, the report is the template.
    With an `llm`, Nodes A/B/C run at their §3 call sites; every proposal is
    re-validated deterministically and a node failure degrades to the
    deterministic behavior with an INFO flag — never a guess.
    """
    gateway = gateway or MockErpGateway(session)

    bill = gateway.get_bill(bill_id)
    if bill is None:
        raise ValueError(f"bill {bill_id!r} not found")
    if bill.status not in CHECKABLE_STATUSES:
        raise BillNotCheckableError(
            f"bill {bill.id} is {bill.status.value} — re-checking a decided or paid "
            "bill is not allowed (no-double-payment, PLAN.md §2.7)"
        )

    ruleset = ruleset or ruleset_for_date(bill.invoice_date)
    run = CheckingRun(
        run_id=uuid.uuid4().hex,
        bill_id=bill.id,
        started_at=datetime.now(UTC).replace(tzinfo=None),
        git_sha=_git_sha(),
        rules_version=ruleset.version_hash,
        llm_provider=llm.provider if llm is not None else None,
        llm_model=llm.model if llm is not None else None,
        status=RunStatus.RUNNING,
    )
    session.add(run)
    bill.status = BillStatus.CHECKING
    session.flush()

    exceptions: list[CheckException] = []
    gross_claimed = from_paisa(bill.claimed_total_paisa)

    # ---- Steps 1–2: fetch context, validate & dedupe -----------------------
    supplier = gateway.get_supplier(bill.supplier_id)
    po = gateway.get_po(bill.po_id)

    if supplier is None:
        exceptions.append(
            CheckException("supplier_not_found", f"Supplier {bill.supplier_id!r} not found")
        )
    elif supplier.status == SupplierStatus.HOLD:
        exceptions.append(
            CheckException(
                "supplier_on_hold", f"Supplier {supplier.id} is on hold — no computation"
            )
        )
    elif supplier.status == SupplierStatus.BLACKLISTED:
        exceptions.append(
            CheckException(
                "supplier_blacklisted", f"Supplier {supplier.id} is blacklisted — no computation"
            )
        )

    if po is None:
        exceptions.append(CheckException("po_not_found", f"PO {bill.po_id!r} not found"))
    elif po.status not in BILLABLE_PO_STATUSES:
        exceptions.append(
            CheckException("po_not_open", f"PO {po.id} status is {po.status.value}, not billable")
        )

    if not bill.lines:
        exceptions.append(CheckException("invalid_bill", "Bill has no lines"))
    for line in bill.lines:
        line_amount = quantize_taka(line.qty * from_paisa(line.unit_price_paisa))
        if line_amount != from_paisa(line.amount_paisa):
            exceptions.append(
                CheckException(
                    "line_amount_mismatch",
                    f"Line {line.line_no}: qty x unit price = {line_amount} Tk but line "
                    f"amount is {from_paisa(line.amount_paisa)} Tk",
                    line_no=line.line_no,
                )
            )

    prior_bills = gateway.get_prior_bills(bill.supplier_id, exclude_bill_id=bill.id)
    exceptions.extend(
        check_duplicates(
            _summary(bill),
            [_summary(other) for other in prior_bills],
            fuzzy_amount_pct=ruleset.policies.duplicate_fuzzy.amount_pct,
            fuzzy_days_window=ruleset.policies.duplicate_fuzzy.days_window,
        )
    )

    # Missing GRN entirely => BLOCKER, nothing verifiable (§6.4, S4)
    grns = gateway.get_grns_for_po(bill.po_id) if po is not None else []
    if po is not None and not grns:
        exceptions.append(
            CheckException(
                "missing_grn", f"No GRN exists for PO {po.id}; receipt cannot be verified"
            )
        )

    apply_severities(exceptions, ruleset.policies.exception_severities)
    if recommend(exceptions, has_adjustments=False) == Recommendation.BLOCKED:
        return _finalize_blocked(session, run, bill, gross_claimed, exceptions, ruleset)

    # ---- Step 3: line matching (Node A proposals arrive as data) -----------
    bill_lines = [
        BillLineData(
            line_no=line.line_no,
            description=line.description,
            product_code=line.product_code,
            qty=line.qty,
            unit_price_tk=from_paisa(line.unit_price_paisa),
            amount_tk=from_paisa(line.amount_paisa),
        )
        for line in bill.lines
    ]
    po_lines = [
        PoLineData(
            line_no=line.line_no,
            product_code=line.product_code,
            qty=line.qty,
            unit_price_tk=from_paisa(line.unit_price_paisa),
            vat_category_id=line.vat_category_id,
            tds_category_id=line.tds_category_id,
            description=line.description,
            uom=line.uom,
        )
        for line in po.lines
    ]
    # Node A: only for lines the deterministic matcher cannot place, and only
    # when no proposals were injected (tests inject mocks; replay re-serves
    # the recorded response). Proposals are re-validated inside match_lines.
    if mapping_proposals is None and llm is not None:
        po_code_to_line = {line.product_code: line.line_no for line in po_lines}
        unmapped = [
            line
            for line in bill_lines
            if not line.product_code or line.product_code not in po_code_to_line
        ]
        # PO lines a coded bill line will claim deterministically are not
        # offered to Node A at all (match_lines rejects such proposals anyway).
        claimed_line_nos = {
            po_code_to_line[line.product_code]
            for line in bill_lines
            if line.product_code and line.product_code in po_code_to_line
        }
        candidates = [line for line in po_lines if line.line_no not in claimed_line_nos]
        if unmapped and candidates:
            try:
                mapping_proposals = propose_line_mappings(
                    llm, unmapped, candidates, run_id=run.run_id
                )
            except LLMError as err:
                exceptions.append(
                    CheckException(
                        "llm_node_failed",
                        f"Node A (line mapper) failed: {err}; unmapped lines go to review",
                    )
                )

    match_outcome = match_lines(
        bill_lines,
        po_lines,
        proposals=mapping_proposals,
        min_confidence=ruleset.policies.mapping_confidence_min,
    )
    exceptions.extend(match_outcome.exceptions)

    # ---- Step 4: 3-way match per matched line ------------------------------
    accepted_by_po_line: dict[int, Decimal] = {}
    for grn in grns:
        for grn_line in grn.lines:
            accepted_by_po_line[grn_line.po_line_no] = (
                accepted_by_po_line.get(grn_line.po_line_no, Decimal(0)) + grn_line.qty_accepted
            )
    prior_billed = _prior_billed_qty(prior_bills, po)

    computations: list[LineComputation] = []
    for match in match_outcome.matches:
        available = accepted_by_po_line.get(match.po_line.line_no, Decimal(0)) - prior_billed.get(
            match.po_line.line_no, Decimal(0)
        )
        computation, line_exceptions = three_way_line(
            match.bill_line,
            match.po_line,
            accepted_qty_available=available,
            price_tolerance_tk=ruleset.policies.price_tolerance_tk,
        )
        computations.append(computation)
        exceptions.extend(line_exceptions)
        # §6.3 plausibility escalation: on an LLM-proposed mapping, any price/qty
        # discrepancy is primary evidence the MAPPING may be wrong — force human
        # review even where a code-matched line would only be adjusted (S2).
        if match.method == "proposal" and any(
            exc.code in {"price_over_po", "price_under_po", "qty_over_grn"}
            for exc in line_exceptions
        ):
            exceptions.append(
                CheckException(
                    "proposal_mapping_suspect",
                    f"Line {match.bill_line.line_no}: LLM-proposed mapping to PO line "
                    f"{match.po_line.line_no} (confidence {match.confidence:.2f}) produced "
                    "price/qty adjustments — the mapping itself needs review",
                    line_no=match.bill_line.line_no,
                )
            )

    approved_base = quantize_taka(
        sum((c.approved_amount for c in computations), Decimal(0))
    )

    # Node B: repair unknown tax categories with proposals that MUST resolve
    # to an existing rule-table id; anything unresolved stays an
    # unclassified_item exception from the tax engines below.
    if llm is not None:
        unknown_lines = []
        for computation in computations:
            missing_vat = computation.vat_category_id not in ruleset.vat_rates
            missing_tds = computation.tds_category_id not in ruleset.tds_rules
            if missing_vat or missing_tds:
                unknown_lines.append(
                    {
                        "line_no": computation.bill_line_no,
                        "description": computation.description,
                        "missing": "both"
                        if missing_vat and missing_tds
                        else ("vat" if missing_vat else "tds"),
                    }
                )
        if unknown_lines:
            try:
                category_proposals = propose_tax_categories(
                    llm, unknown_lines, ruleset, run_id=run.run_id
                )
                min_confidence = ruleset.policies.mapping_confidence_min
                for computation in computations:
                    proposal = category_proposals.get(computation.bill_line_no)
                    if proposal is None or proposal.confidence < min_confidence:
                        continue
                    applied = []
                    if (
                        computation.vat_category_id not in ruleset.vat_rates
                        and proposal.vat_category_id in ruleset.vat_rates
                    ):
                        computation.vat_category_id = proposal.vat_category_id
                        applied.append(f"vat={proposal.vat_category_id}")
                    if (
                        computation.tds_category_id not in ruleset.tds_rules
                        and proposal.tds_category_id in ruleset.tds_rules
                    ):
                        computation.tds_category_id = proposal.tds_category_id
                        applied.append(f"tds={proposal.tds_category_id}")
                    if applied:
                        exceptions.append(
                            CheckException(
                                "tax_category_proposed",
                                f"Line {computation.bill_line_no}: tax category proposed "
                                f"by Node B ({', '.join(applied)}, confidence "
                                f"{proposal.confidence:.2f})",
                                line_no=computation.bill_line_no,
                            )
                        )
            except LLMError as err:
                exceptions.append(
                    CheckException(
                        "llm_node_failed",
                        f"Node B (tax classifier) failed: {err}; "
                        "unknown categories go to review",
                    )
                )

    # ---- Step 5: tax engines on FY tables ----------------------------------
    vat_lines, vat_exceptions = compute_vat(computations, ruleset)
    exceptions.extend(vat_exceptions)

    vds, vds_exceptions = evaluate_vds(
        approved_base, ruleset, mushak_6_3_present=bill.mushak_6_3_no is not None
    )
    exceptions.extend(vds_exceptions)

    tds_deductions, tds_exceptions = compute_tds(
        computations,
        vat_lines,
        ruleset,
        has_return_proof=bool(supplier.has_return_submission_proof),
    )
    exceptions.extend(tds_exceptions)

    # ---- Step 6: deductions & netting --------------------------------------
    ledger = gateway.get_ledger_entries(bill.supplier_id)

    def relevant(entry) -> bool:
        """Entries belonging to another bill, or tied to another PO, are none
        of this bill's business."""
        if entry.bill_id is not None and entry.bill_id != bill.id:
            return False
        return entry.po_id is None or entry.po_id == bill.po_id

    # §6.6 "open advances on this PO/supplier PER POLICY" — the scope is a
    # documented policy choice, not an implementation detail.
    po_only = ruleset.policies.advance_scope == "po_only"
    consumed: set[int] = set()

    def take(entry) -> LedgerAmount:
        consumed.add(entry.id)
        return LedgerAmount(from_paisa(entry.amount_paisa), entry.ref)

    advances = [
        take(entry)
        for entry in ledger
        if entry.entry_type == LedgerType.ADVANCE
        and relevant(entry)
        and not (po_only and entry.po_id != bill.po_id)
    ]
    penalties = [
        take(entry)
        for entry in ledger
        if entry.entry_type == LedgerType.PENALTY and relevant(entry)
    ]
    prior_payments = [
        take(entry)
        for entry in ledger
        if entry.entry_type == LedgerType.PAYMENT and entry.bill_id == bill.id
    ]

    # Money on the ledger must never vanish silently: anything in scope for this
    # bill that the netting did not consume (an unlinked prior payment, a
    # retention or adjustment entry, a general advance held back by policy) is
    # surfaced for the CFO rather than quietly ignored.
    for entry in ledger:
        if not relevant(entry) or entry.id in consumed:
            continue
        is_payment = entry.entry_type == LedgerType.PAYMENT
        exceptions.append(
            CheckException(
                # an unlinked PAYMENT may already have settled part of this
                # bill (double-pay risk) and is escalated; anything else is
                # disclosed for completeness
                "ledger_payment_not_applied" if is_payment else "ledger_entry_not_applied",
                f"Ledger entry {entry.ref} ({entry.entry_type.value}, "
                f"{from_paisa(entry.amount_paisa)} Tk) is in scope for this bill but "
                "was not applied to the computation — confirm it is not payable here",
                ref=entry.ref,
            )
        )
    netting = build_netting(
        approved_base=approved_base,
        vat_lines=vat_lines,
        vds=vds,
        tds_deductions=tds_deductions,
        advances=advances,
        retention_pct=ruleset.policies.retention_pct,
        penalties=penalties,
        prior_payments=prior_payments,
        advance_max_offset_pct=ruleset.policies.advance_max_offset_pct,
    )
    exceptions.extend(netting.exceptions)

    # ---- Steps 7–8: recommendation + report --------------------------------
    apply_severities(exceptions, ruleset.policies.exception_severities)
    has_adjustments = any(
        c.price_adjustment != 0 or c.qty_adjustment != 0 for c in computations
    )
    recommendation = recommend(exceptions, has_adjustments)

    breakdown = _breakdown(gross_claimed, computations, vat_lines, vds, tds_deductions, netting)

    # Node C: LLM report behind the numeric guard (§6.8) — one repair attempt,
    # then fall back to the deterministic template. The rejected drafts remain
    # in the audit log (every prompt+response is persisted there).
    report_md = _render_report(bill.id, recommendation, netting, exceptions, ruleset)
    if llm is not None:
        exception_dicts = [exc.as_dict() for exc in exceptions]
        # Guard allowlist: computed breakdown + STRUCTURED exception fields +
        # the bill id. Free-text exception messages are excluded — they quote
        # supplier-controlled descriptions, which must never whitelist numbers.
        guard_sources = (
            breakdown,
            [
                {k: d.get(k) for k in ("code", "severity", "rule_id", "line_no", "ref")}
                for d in exception_dicts
            ],
            bill.id,
        )
        try:
            draft = write_report(
                llm, bill.id, recommendation.value, breakdown, exception_dicts,
                run_id=run.run_id,
            )
            violations = find_violations(draft, *guard_sources)
            if violations:
                draft = write_report(
                    llm, bill.id, recommendation.value, breakdown, exception_dicts,
                    run_id=run.run_id, violations=violations,
                )
                violations = find_violations(draft, *guard_sources)
            if violations:
                exceptions.append(
                    CheckException(
                        "report_numeric_guard_failed",
                        "Node C report rejected twice by the numeric guard "
                        f"(unknown numbers: {violations}); deterministic template used",
                    )
                )
            else:
                report_md = draft
        except LLMError as err:
            exceptions.append(
                CheckException(
                    "llm_node_failed",
                    f"Node C (report writer) failed: {err}; deterministic template used",
                )
            )
        # INFO-only codes by policy: cannot change the recommendation above.
        apply_severities(exceptions, ruleset.policies.exception_severities)

    result = CheckingResult(
        run_id=run.run_id,
        gross_claimed_paisa=to_paisa(gross_claimed),
        approved_base_paisa=to_paisa(approved_base),
        net_payable_paisa=to_paisa(netting.net_payable),
        breakdown=breakdown,
        exceptions=[exc.as_dict() for exc in exceptions],
        recommendation=recommendation,
        report_md=report_md,
    )
    session.add(result)
    run.status = RunStatus.COMPLETED
    run.finished_at = datetime.now(UTC).replace(tzinfo=None)
    bill.status = BillStatus.PENDING_CFO
    session.commit()

    return PipelineOutcome(
        run_id=run.run_id,
        bill_id=bill.id,
        recommendation=recommendation,
        gross_claimed=gross_claimed,
        approved_base=approved_base,
        net_payable=netting.net_payable,
        exceptions=exceptions,
        breakdown=breakdown,
        report_md=report_md,
        netting=netting,
        computations=computations,
    )


# ---- helpers ---------------------------------------------------------------


def _summary(bill: Bill) -> BillSummary:
    return BillSummary(
        bill_id=bill.id,
        supplier_invoice_no=bill.supplier_invoice_no,
        invoice_date=bill.invoice_date,
        claimed_total_tk=from_paisa(bill.claimed_total_paisa),
        product_codes=frozenset(
            line.product_code.lower() for line in bill.lines if line.product_code
        ),
    )


def _prior_billed_qty(prior_bills: list[Bill], po) -> dict[int, Decimal]:
    code_to_line_no = {line.product_code: line.line_no for line in po.lines}
    billed: dict[int, Decimal] = {}
    for other in prior_bills:
        if other.po_id != po.id or other.status not in PRIOR_BILLED_STATUSES:
            continue
        for line in other.lines:
            po_line_no = code_to_line_no.get(line.product_code or "")
            if po_line_no is not None:
                billed[po_line_no] = billed.get(po_line_no, Decimal(0)) + line.qty
    return billed


def _breakdown(gross_claimed, computations, vat_lines, vds, tds_deductions, netting) -> dict:
    return {
        "gross_claimed": _money(gross_claimed),
        "price_adjustments": [
            {
                "line_no": c.bill_line_no,
                "amount": _money(c.price_adjustment),
                "rule_id": "policy.price_over_po"
                if c.price_adjustment < 0
                else "policy.price_under_po",
            }
            for c in computations
            if c.price_adjustment != 0
        ],
        "qty_adjustments": [
            {
                "line_no": c.bill_line_no,
                "amount": _money(c.qty_adjustment),
                "rule_id": "policy.qty_over_grn",
            }
            for c in computations
            if c.qty_adjustment != 0
        ],
        "approved_base": _money(netting.approved_base),
        "lines": [
            {
                "bill_line_no": c.bill_line_no,
                "po_line_no": c.po_line_no,
                "product_code": c.product_code,
                "billed_qty": str(c.billed_qty),
                "approved_qty": str(c.approved_qty),
                "billed_unit_price": _money(c.billed_unit_price),
                "approved_unit_price": _money(c.approved_unit_price),
                "billed_amount": _money(c.billed_amount),
                "approved_amount": _money(c.approved_amount),
            }
            for c in computations
        ],
        "vat": [
            {
                "line_no": v.line_no,
                "category_id": v.category_id,
                "rate": str(v.rate),
                "base": _money(v.base),
                "amount": _money(v.amount),
                "source_doc": v.source_doc,
            }
            for v in vat_lines
        ],
        "vds_deducted": (
            []
            if vds is None
            else [
                {
                    "rule_id": vds.rule_id,
                    "action": vds.action,
                    "rate": str(vds.rate) if vds.rate is not None else None,
                    "base": _money(vds.base),
                    "amount": _money(vds.amount),
                    "source_doc": vds.source_doc,
                }
            ]
        ),
        "tds_deducted": [
            {
                "category_id": t.category_id,
                "law": t.law,
                "base_definition": t.base_definition,
                "base": _money(t.base),
                "rate": str(t.slab_rate),
                "uplift": str(t.uplift),
                "uplift_applied": t.uplift_applied,
                "amount": _money(t.amount),
                "source_doc": t.source_doc,
                "line_nos": t.line_nos,
            }
            for t in tds_deductions
        ],
        "advance_adjusted": _money(netting.advance_adjusted),
        "retention_held": _money(netting.retention_held),
        "other_deductions": _money(netting.other_deductions),
        "prior_payments_offset": _money(netting.prior_payments_offset),
        "net_payable": _money(netting.net_payable),
        "netting_order": [
            {
                "label": line.label,
                "amount": _money(line.amount),
                "rule_id": line.rule_id,
                "ref": line.ref,
            }
            for line in netting.lines
        ],
    }


def _render_report(
    bill_id: str,
    recommendation: Recommendation,
    netting: NettingResult | None,
    exceptions: list[CheckException],
    ruleset: RuleSet,
) -> str:
    """Deterministic template report (§6.8 fallback; LLM Node C in Phase 3).
    Every number comes from the computed result."""
    lines = [
        f"# Bill checking report — {bill_id}",
        "",
        f"**Recommendation: {recommendation.value}**",
        "",
    ]
    if netting is not None:
        lines += ["| Item | Amount (Tk) | Rule / Ref |", "|---|---:|---|"]
        for nl in netting.lines:
            lines.append(f"| {nl.label} | {nl.amount} | {nl.rule_id or nl.ref or ''} |")
        lines += [f"| **NET PAYABLE** | **{netting.net_payable}** | |", ""]
    if exceptions:
        lines.append("## Exceptions")
        for exc in exceptions:
            rule = f" [{exc.rule_id}]" if exc.rule_id else ""
            ref = f" (ref {exc.ref})" if exc.ref else ""
            lines.append(f"- **{exc.severity.value}** `{exc.code}`{rule}: {exc.message}{ref}")
        lines.append("")
    lines.append(
        f"_Rules: {ruleset.fiscal_year} (version {ruleset.version_hash[:12]}); "
        "all amounts computed deterministically._"
    )
    return "\n".join(lines)


def _finalize_blocked(
    session: Session,
    run: CheckingRun,
    bill: Bill,
    gross_claimed: Decimal,
    exceptions: list[CheckException],
    ruleset: RuleSet,
) -> PipelineOutcome:
    """BLOCKER before/without computation (S4, S5, S9): no payable computed."""
    recommendation = Recommendation.BLOCKED
    breakdown = {
        "gross_claimed": _money(gross_claimed),
        "note": "Computation skipped: blocking exception(s) present.",
        "net_payable": None,
    }
    report_md = _render_report(bill.id, recommendation, None, exceptions, ruleset)
    result = CheckingResult(
        run_id=run.run_id,
        gross_claimed_paisa=to_paisa(gross_claimed),
        approved_base_paisa=None,
        net_payable_paisa=None,
        breakdown=breakdown,
        exceptions=[exc.as_dict() for exc in exceptions],
        recommendation=recommendation,
        report_md=report_md,
    )
    session.add(result)
    run.status = RunStatus.COMPLETED
    run.finished_at = datetime.now(UTC).replace(tzinfo=None)
    bill.status = BillStatus.PENDING_CFO
    session.commit()
    return PipelineOutcome(
        run_id=run.run_id,
        bill_id=bill.id,
        recommendation=recommendation,
        gross_claimed=gross_claimed,
        approved_base=None,
        net_payable=None,
        exceptions=exceptions,
        breakdown=breakdown,
        report_md=report_md,
    )

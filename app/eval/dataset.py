"""Phase 6 evaluation dataset (PLAN.md §12).

A set of synthetic bills, each carrying INDEPENDENTLY DERIVED ground truth:
the expected recommendation, net payable, and which exception codes must (and
must not) fire. Expectations were reasoned out from the documented rules, not
read off this implementation — so a disagreement is a real finding either way.

All cases are materialized into ONE database, exactly like production, so that
cross-bill behavior (duplicate detection especially) is exercised honestly.
"""

from __future__ import annotations

import datetime as dt
import json
from decimal import Decimal
from pathlib import Path

from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.engines.money import quantize_taka, to_paisa
from app.models import (
    Bill,
    BillLine,
    BillStatus,
    Grn,
    GrnLine,
    LedgerEntry,
    LedgerType,
    PoLine,
    PurchaseOrder,
    Supplier,
)

EVAL_PATH = Path(__file__).resolve().parents[2] / "seeds" / "eval_cases.json"


class EvalSupplier(BaseModel):
    id: str
    name: str
    has_return_submission_proof: bool = True
    status: str = "active"


class EvalPoLine(BaseModel):
    line_no: int
    product_code: str
    description: str
    uom: str = "pcs"
    qty: Decimal
    unit_price_tk: Decimal
    vat_category_id: str
    tds_category_id: str


class EvalPo(BaseModel):
    id: str
    order_date: dt.date
    status: str = "open"
    lines: list[EvalPoLine]


class EvalGrnLine(BaseModel):
    po_line_no: int
    qty_received: Decimal
    qty_accepted: Decimal
    qty_rejected: Decimal = Decimal(0)


class EvalGrn(BaseModel):
    id: str
    grn_date: dt.date
    lines: list[EvalGrnLine]


class EvalBillLine(BaseModel):
    line_no: int
    description: str
    product_code: str | None = None
    qty: Decimal
    unit_price_tk: Decimal
    amount_tk: Decimal


class EvalBill(BaseModel):
    id: str
    supplier_invoice_no: str
    invoice_date: dt.date
    mushak_6_3_no: str | None = None
    claimed_total_tk: Decimal
    lines: list[EvalBillLine]


class EvalLedgerEntry(BaseModel):
    entry_type: LedgerType
    amount_tk: Decimal
    entry_date: dt.date
    ref: str
    scope: str = "this_po"


class Expectations(BaseModel):
    recommendation: str
    net_payable_tk: Decimal | None = None
    approved_base_tk: Decimal | None = None
    must_raise_codes: list[str] = Field(default_factory=list)
    must_not_raise_codes: list[str] = Field(default_factory=list)
    arithmetic: str = ""
    node_a_ground_truth: dict[str, int] = Field(default_factory=dict)
    node_a_difficulty: str = "none"


class EvalCase(BaseModel):
    case_id: str
    title: str
    purpose: str = ""
    supplier: EvalSupplier
    po: EvalPo
    grns: list[EvalGrn] = Field(default_factory=list)
    bill: EvalBill
    ledger_entries: list[EvalLedgerEntry] = Field(default_factory=list)
    expectations: Expectations
    # True when a second, independent author recomputed this case's expected
    # arithmetic from the rules and agreed. Unverified ground truth is still
    # useful, but a disagreement against it is weaker evidence of a defect.
    ground_truth_verified: bool = False
    verification_note: str = ""

    @property
    def needs_mapping(self) -> bool:
        return any(line.product_code is None for line in self.bill.lines)


def load_cases(path: Path | None = None) -> list[EvalCase]:
    raw = json.loads((path or EVAL_PATH).read_text(encoding="utf-8"))
    cases = raw["cases"] if isinstance(raw, dict) else raw
    return [EvalCase.model_validate(c) for c in cases]


def materialize(session: Session, cases: list[EvalCase]) -> None:
    """Insert every case's entities into one DB. Suppliers and POs may be
    shared between cases (the duplicate-detection cases rely on that), so
    inserts are idempotent on primary key.
    """
    seen_suppliers: set[str] = set()
    seen_pos: set[str] = set()
    seen_grns: set[str] = set()

    for case in cases:
        s = case.supplier
        if s.id not in seen_suppliers and session.get(Supplier, s.id) is None:
            session.add(
                Supplier(
                    id=s.id,
                    name=s.name,
                    has_return_submission_proof=s.has_return_submission_proof,
                    status=s.status,
                    bank_account_name=s.name,
                    bank_account_no=f"ACC-{s.id}",
                    bank_name="Eval Bank",
                    bank_branch="Eval Branch",
                )
            )
            seen_suppliers.add(s.id)

        if case.po.id not in seen_pos and session.get(PurchaseOrder, case.po.id) is None:
            po = PurchaseOrder(
                id=case.po.id,
                supplier_id=s.id,
                order_date=case.po.order_date,
                status=case.po.status,
            )
            po.lines = [
                PoLine(
                    line_no=line.line_no,
                    product_code=line.product_code,
                    description=line.description,
                    uom=line.uom,
                    qty=line.qty,
                    unit_price_paisa=to_paisa(line.unit_price_tk),
                    vat_category_id=line.vat_category_id,
                    tds_category_id=line.tds_category_id,
                )
                for line in case.po.lines
            ]
            session.add(po)
            seen_pos.add(case.po.id)

        for grn in case.grns:
            if grn.id in seen_grns or session.get(Grn, grn.id) is not None:
                continue
            record = Grn(id=grn.id, po_id=case.po.id, grn_date=grn.grn_date)
            record.lines = [GrnLine(**line.model_dump()) for line in grn.lines]
            session.add(record)
            seen_grns.add(grn.id)

        bill = Bill(
            id=case.bill.id,
            supplier_id=s.id,
            po_id=case.po.id,
            supplier_invoice_no=case.bill.supplier_invoice_no,
            invoice_date=case.bill.invoice_date,
            mushak_6_3_no=case.bill.mushak_6_3_no,
            claimed_total_paisa=to_paisa(case.bill.claimed_total_tk),
            # checking starts post-assignment (§1), same as the seed loader
            status=BillStatus.ASSIGNED,
            scenario_tag=case.case_id,
        )
        bill.lines = [
            BillLine(
                line_no=line.line_no,
                description=line.description,
                product_code=line.product_code,
                qty=line.qty,
                unit_price_paisa=to_paisa(line.unit_price_tk),
                amount_paisa=to_paisa(line.amount_tk),
            )
            for line in case.bill.lines
        ]
        session.add(bill)

        for entry in case.ledger_entries:
            session.add(
                LedgerEntry(
                    supplier_id=s.id,
                    po_id=case.po.id if entry.scope in ("this_po", "this_bill") else None,
                    bill_id=case.bill.id if entry.scope == "this_bill" else None,
                    entry_type=entry.entry_type,
                    amount_paisa=to_paisa(entry.amount_tk),
                    entry_date=entry.entry_date,
                    ref=entry.ref,
                )
            )

    session.commit()


def validate_internal_consistency(cases: list[EvalCase]) -> list[str]:
    """Fixture self-check: claimed total == sum of lines, amount == qty x price.
    A broken fixture would produce a meaningless eval result."""
    problems: list[str] = []
    seen_ids: set[str] = set()
    for case in cases:
        if case.bill.id in seen_ids:
            problems.append(f"{case.case_id}: duplicate bill id {case.bill.id}")
        seen_ids.add(case.bill.id)

        line_sum = sum((line.amount_tk for line in case.bill.lines), Decimal(0))
        if line_sum != case.bill.claimed_total_tk:
            problems.append(
                f"{case.case_id}: claimed {case.bill.claimed_total_tk} != line sum {line_sum}"
            )
        for line in case.bill.lines:
            # Compare the ROUNDED product, exactly as the pipeline's
            # line_amount_mismatch check does — a line like 8.5 x 490.22 is
            # legitimately billed at the half-up rounded figure.
            product = quantize_taka(line.qty * line.unit_price_tk)
            if product != line.amount_tk:
                problems.append(
                    f"{case.case_id} line {line.line_no}: qty x price = {product} "
                    f"!= amount {line.amount_tk}"
                )
        # Unit prices are stored as integer paisa, and the API rejects sub-paisa
        # amounts — a fixture with a 3-decimal price could never exist in the
        # real system, so it would produce a meaningless eval result.
        for label, price in [
            (f"PO line {line.line_no}", line.unit_price_tk) for line in case.po.lines
        ] + [(f"bill line {line.line_no}", line.unit_price_tk) for line in case.bill.lines]:
            if price.is_finite() and -price.as_tuple().exponent > 2:
                problems.append(
                    f"{case.case_id} {label}: unit price {price} has sub-paisa precision; "
                    "prices are stored as integer paisa (max 2 decimals)"
                )

        po_line_nos = {line.line_no for line in case.po.lines}
        free_text_lines = {
            line.line_no for line in case.bill.lines if line.product_code is None
        }
        mapped = {int(k) for k in case.expectations.node_a_ground_truth}
        for target in case.expectations.node_a_ground_truth.values():
            if target not in po_line_nos:
                problems.append(
                    f"{case.case_id}: ground-truth maps to PO line {target} which does not exist"
                )
        # Every free-text line needs ground truth, or the case silently measures
        # an unmapped_line instead of the mapping it meant to test.
        if free_text_lines - mapped:
            problems.append(
                f"{case.case_id}: bill line(s) {sorted(free_text_lines - mapped)} have no "
                "product_code and no node_a_ground_truth entry"
            )
    return problems

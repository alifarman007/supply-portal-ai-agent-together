"""Line matching + 3-way match (PLAN.md §6.3–§6.4). Pure Decimal, no LLM.

LLM Node A only ever *proposes* mappings for lines without product codes;
those proposals arrive here as plain data and are deterministically
re-validated (existence, one-to-one, confidence threshold). Low confidence
means a REVIEW exception and the line is excluded — never a guess.

Adjustment identity (exact, no rounding drift):
    billed_amount + price_adjustment + qty_adjustment == approved_amount
with price_adjustment = (approved_unit - billed_unit) * approved_qty
and  qty_adjustment   = (approved_qty - billed_qty) * billed_unit.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.engines.money import quantize_taka
from app.engines.policy import CheckException


@dataclass(frozen=True)
class PoLineData:
    line_no: int
    product_code: str
    qty: Decimal
    unit_price_tk: Decimal
    vat_category_id: str
    tds_category_id: str
    description: str = ""
    uom: str = "pcs"
    # Rule 3(1) VDS service code (S001.10 etc). Set on SERVICE lines only;
    # empty for goods, which follow the Mushak 6.3 rule instead.
    service_code: str = ""


@dataclass(frozen=True)
class BillLineData:
    line_no: int
    description: str
    product_code: str | None
    qty: Decimal
    unit_price_tk: Decimal
    amount_tk: Decimal


@dataclass(frozen=True)
class MappingProposal:
    """A Node A proposal (or a mocked one in tests)."""

    po_line_no: int
    confidence: float


@dataclass
class LineMatch:
    bill_line: BillLineData
    po_line: PoLineData
    method: str  # "product_code" | "proposal"
    confidence: float


@dataclass
class MatchOutcome:
    matches: list[LineMatch]
    exceptions: list[CheckException]


def match_lines(
    bill_lines: list[BillLineData],
    po_lines: list[PoLineData],
    proposals: dict[int, MappingProposal] | None = None,
    min_confidence: float = 0.75,
) -> MatchOutcome:
    """Two passes: deterministic product_code matches claim their PO lines
    FIRST; Node A proposals may only fill PO lines no code match claimed.
    An LLM proposal can therefore never displace a deterministic match,
    regardless of bill-line ordering."""
    proposals = proposals or {}
    po_by_code = {line.product_code: line for line in po_lines}
    po_by_no = {line.line_no: line for line in po_lines}
    used_po_lines: set[int] = set()
    matched: dict[int, LineMatch] = {}  # bill_line_no -> match
    exceptions: list[CheckException] = []
    pending: list[BillLineData] = []

    for bill_line in bill_lines:
        po_line = po_by_code.get(bill_line.product_code) if bill_line.product_code else None
        if po_line is None:
            pending.append(bill_line)
            continue
        if po_line.line_no in used_po_lines:
            exceptions.append(
                CheckException(
                    code="ambiguous_mapping",
                    message=(
                        f"Line {bill_line.line_no} maps to PO line {po_line.line_no}, "
                        "already claimed by another bill line (one-to-one violated)"
                    ),
                    line_no=bill_line.line_no,
                )
            )
            continue
        used_po_lines.add(po_line.line_no)
        matched[bill_line.line_no] = LineMatch(bill_line, po_line, "product_code", 1.0)

    for bill_line in pending:
        if bill_line.line_no not in proposals:
            exceptions.append(
                CheckException(
                    code="unmapped_line",
                    message=(
                        f"Line {bill_line.line_no} ('{bill_line.description}') has no product "
                        "code and no mapping proposal; excluded from computation"
                    ),
                    line_no=bill_line.line_no,
                )
            )
            continue
        proposal = proposals[bill_line.line_no]
        candidate = po_by_no.get(proposal.po_line_no)
        if candidate is None:
            exceptions.append(
                CheckException(
                    code="unmapped_line",
                    message=(
                        f"Line {bill_line.line_no}: proposed PO line "
                        f"{proposal.po_line_no} does not exist"
                    ),
                    line_no=bill_line.line_no,
                )
            )
            continue
        if candidate.line_no in used_po_lines:
            exceptions.append(
                CheckException(
                    code="ambiguous_mapping",
                    message=(
                        f"Line {bill_line.line_no}: proposed PO line {candidate.line_no} is "
                        "already claimed (deterministic matches win); proposal rejected"
                    ),
                    line_no=bill_line.line_no,
                )
            )
            continue
        if proposal.confidence < min_confidence:
            exceptions.append(
                CheckException(
                    code="mapping_low_confidence",
                    message=(
                        f"Line {bill_line.line_no} ('{bill_line.description}'): mapping "
                        f"confidence {proposal.confidence:.2f} < {min_confidence:.2f}; "
                        "excluded from computation"
                    ),
                    line_no=bill_line.line_no,
                )
            )
            continue
        used_po_lines.add(candidate.line_no)
        matched[bill_line.line_no] = LineMatch(
            bill_line, candidate, "proposal", proposal.confidence
        )

    # preserve bill-line order in the output regardless of pass structure
    matches = [matched[b.line_no] for b in bill_lines if b.line_no in matched]
    return MatchOutcome(matches, exceptions)


@dataclass
class LineComputation:
    bill_line_no: int
    po_line_no: int
    product_code: str
    description: str
    billed_qty: Decimal
    approved_qty: Decimal
    billed_unit_price: Decimal
    approved_unit_price: Decimal
    billed_amount: Decimal
    approved_amount: Decimal
    price_adjustment: Decimal  # <= 0
    qty_adjustment: Decimal  # <= 0
    vat_category_id: str
    tds_category_id: str
    service_code: str = ""


def three_way_line(
    bill_line: BillLineData,
    po_line: PoLineData,
    accepted_qty_available: Decimal,
    price_tolerance_tk: Decimal,
) -> tuple[LineComputation, list[CheckException]]:
    """One matched line against PO price and GRN-accepted quantity.

    accepted_qty_available = cumulative GRN accepted qty for the PO line,
    minus qty already billed on previously approved bills.
    """
    exceptions: list[CheckException] = []

    billed_qty = bill_line.qty
    billed_unit = bill_line.unit_price_tk
    billed_amount = quantize_taka(billed_qty * billed_unit)

    # Price check (PLAN.md §6.4)
    if billed_unit - po_line.unit_price_tk > price_tolerance_tk:
        approved_unit = po_line.unit_price_tk
        exceptions.append(
            CheckException(
                code="price_over_po",
                message=(
                    f"Line {bill_line.line_no} ({po_line.product_code}): billed unit price "
                    f"{billed_unit} Tk exceeds PO price {po_line.unit_price_tk} Tk "
                    f"(tolerance {price_tolerance_tk} Tk); paying PO price"
                ),
                rule_id="policy.price_over_po",
                line_no=bill_line.line_no,
            )
        )
    elif billed_unit < po_line.unit_price_tk:
        approved_unit = billed_unit  # under-billing: pay billed price
        exceptions.append(
            CheckException(
                code="price_under_po",
                message=(
                    f"Line {bill_line.line_no} ({po_line.product_code}): billed unit price "
                    f"{billed_unit} Tk below PO price {po_line.unit_price_tk} Tk; "
                    "paying billed price"
                ),
                rule_id="policy.price_under_po",
                line_no=bill_line.line_no,
            )
        )
    else:
        approved_unit = billed_unit

    # Qty check: only GRN-supported (and PO-covered) quantity is payable
    allowed_qty = min(po_line.qty, accepted_qty_available)
    if allowed_qty < 0:
        allowed_qty = Decimal(0)
    if billed_qty > allowed_qty:
        approved_qty = allowed_qty
        exceptions.append(
            CheckException(
                code="qty_over_grn",
                message=(
                    f"Line {bill_line.line_no} ({po_line.product_code}): billed qty "
                    f"{billed_qty} exceeds supported qty {allowed_qty} "
                    f"(PO {po_line.qty}, GRN-accepted available {accepted_qty_available}); "
                    "paying supported qty only"
                ),
                rule_id="policy.qty_over_grn",
                line_no=bill_line.line_no,
            )
        )
    else:
        approved_qty = billed_qty

    price_adjustment = quantize_taka((approved_unit - billed_unit) * approved_qty)
    qty_adjustment = quantize_taka((approved_qty - billed_qty) * billed_unit)
    # Derived from the identity so reconciliation holds exactly even when
    # fractional quantities make the individually-quantized terms differ by
    # a paisa from quantize(approved_qty * approved_unit).
    approved_amount = billed_amount + price_adjustment + qty_adjustment

    computation = LineComputation(
        bill_line_no=bill_line.line_no,
        po_line_no=po_line.line_no,
        product_code=po_line.product_code,
        description=bill_line.description,
        billed_qty=billed_qty,
        approved_qty=approved_qty,
        billed_unit_price=billed_unit,
        approved_unit_price=approved_unit,
        billed_amount=billed_amount,
        approved_amount=approved_amount,
        price_adjustment=price_adjustment,
        qty_adjustment=qty_adjustment,
        vat_category_id=po_line.vat_category_id,
        tds_category_id=po_line.tds_category_id,
        service_code=po_line.service_code,
    )
    return computation, exceptions

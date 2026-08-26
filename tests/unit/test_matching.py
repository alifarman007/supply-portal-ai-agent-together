"""Line matching + 3-way match: code matching, Node-A proposal re-validation,
price/qty adjustments and the exact reconciliation identity."""

from decimal import Decimal

from app.engines.matching import (
    BillLineData,
    MappingProposal,
    PoLineData,
    match_lines,
    three_way_line,
)

TOL0 = Decimal("0")


def po_line(no=1, code="PRO-X", qty="10", price="100.00"):
    return PoLineData(
        line_no=no,
        product_code=code,
        qty=Decimal(qty),
        unit_price_tk=Decimal(price),
        vat_category_id="vat.standard_15",
        tds_category_id="tds.supply_of_goods.s89",
    )


def bill_line(no=1, code="PRO-X", qty="10", price="100.00", desc="Pro X"):
    q, p = Decimal(qty), Decimal(price)
    return BillLineData(
        line_no=no,
        description=desc,
        product_code=code,
        qty=q,
        unit_price_tk=p,
        amount_tk=q * p,
    )


# ---- match_lines -----------------------------------------------------------


def test_match_by_product_code():
    outcome = match_lines([bill_line()], [po_line()])
    assert len(outcome.matches) == 1
    assert outcome.matches[0].method == "product_code"
    assert not outcome.exceptions


def test_unmapped_line_without_code_or_proposal():
    outcome = match_lines([bill_line(code=None)], [po_line()])
    assert not outcome.matches
    assert [e.code for e in outcome.exceptions] == ["unmapped_line"]


def test_proposal_accepted_at_threshold():
    outcome = match_lines(
        [bill_line(code=None)],
        [po_line()],
        proposals={1: MappingProposal(po_line_no=1, confidence=0.9)},
        min_confidence=0.75,
    )
    assert len(outcome.matches) == 1
    assert outcome.matches[0].method == "proposal"


def test_low_confidence_proposal_is_review_and_excluded():
    outcome = match_lines(
        [bill_line(code=None)],
        [po_line()],
        proposals={1: MappingProposal(po_line_no=1, confidence=0.4)},
        min_confidence=0.75,
    )
    assert not outcome.matches
    assert [e.code for e in outcome.exceptions] == ["mapping_low_confidence"]


def test_proposal_to_missing_po_line_rejected():
    outcome = match_lines(
        [bill_line(code=None)],
        [po_line()],
        proposals={1: MappingProposal(po_line_no=99, confidence=0.99)},
    )
    assert not outcome.matches
    assert [e.code for e in outcome.exceptions] == ["unmapped_line"]


def test_one_to_one_mapping_enforced():
    outcome = match_lines(
        [bill_line(no=1), bill_line(no=2)],  # both map to PO line 1 via same code
        [po_line()],
    )
    assert len(outcome.matches) == 1
    assert [e.code for e in outcome.exceptions] == ["ambiguous_mapping"]


def test_proposal_can_never_displace_a_code_match():
    """Deterministic product_code matches claim PO lines FIRST: an earlier
    free-text line with a (mis)proposal onto a code-matched PO line loses,
    regardless of bill-line ordering."""
    outcome = match_lines(
        [
            bill_line(no=1, code=None, desc="free text"),  # proposal -> PO line 1
            bill_line(no=2, code="PRO-X"),  # deterministic match -> PO line 1
        ],
        [po_line(no=1, code="PRO-X")],
        proposals={1: MappingProposal(po_line_no=1, confidence=0.95)},
    )
    assert len(outcome.matches) == 1
    kept = outcome.matches[0]
    assert kept.bill_line.line_no == 2
    assert kept.method == "product_code"
    assert [e.code for e in outcome.exceptions] == ["ambiguous_mapping"]
    assert outcome.exceptions[0].line_no == 1  # the PROPOSAL is the one rejected


# ---- three_way_line --------------------------------------------------------


def test_s2_overbilling_cut():
    comp, excs = three_way_line(
        bill_line(no=2, code="PRO-Y", qty="5", price="120.00"),
        po_line(no=2, code="PRO-Y", qty="5", price="100.00"),
        accepted_qty_available=Decimal(5),
        price_tolerance_tk=TOL0,
    )
    assert comp.price_adjustment == Decimal("-100.00")
    assert comp.approved_amount == Decimal("500.00")
    assert [e.code for e in excs] == ["price_over_po"]
    assert excs[0].rule_id == "policy.price_over_po"


def test_qty_over_grn_pays_supported_only():
    comp, excs = three_way_line(
        bill_line(qty="12"),
        po_line(qty="12"),
        accepted_qty_available=Decimal(10),
        price_tolerance_tk=TOL0,
    )
    assert comp.approved_qty == Decimal(10)
    assert comp.qty_adjustment == Decimal("-200.00")
    assert comp.approved_amount == Decimal("1000.00")
    assert [e.code for e in excs] == ["qty_over_grn"]
    assert excs[0].rule_id == "policy.qty_over_grn"


def test_underbilling_pays_billed_price_info_only():
    comp, excs = three_way_line(
        bill_line(price="99.50"),
        po_line(),
        accepted_qty_available=Decimal(10),
        price_tolerance_tk=TOL0,
    )
    assert comp.approved_unit_price == Decimal("99.50")
    assert comp.approved_amount == Decimal("995.00")
    assert [e.code for e in excs] == ["price_under_po"]


def test_price_within_tolerance_not_adjusted():
    comp, excs = three_way_line(
        bill_line(price="101.00"),
        po_line(),
        accepted_qty_available=Decimal(10),
        price_tolerance_tk=Decimal("1.00"),
    )
    assert comp.price_adjustment == Decimal("0.00")
    assert not excs


def test_combined_price_and_qty_adjustments_reconcile():
    comp, _ = three_way_line(
        bill_line(qty="12", price="120.00"),
        po_line(qty="12"),
        accepted_qty_available=Decimal(10),
        price_tolerance_tk=TOL0,
    )
    assert comp.billed_amount == Decimal("1440.00")
    assert comp.price_adjustment == Decimal("-200.00")
    assert comp.qty_adjustment == Decimal("-240.00")
    assert comp.approved_amount == Decimal("1000.00")
    assert (
        comp.billed_amount + comp.price_adjustment + comp.qty_adjustment == comp.approved_amount
    )


def test_negative_available_qty_clamps_to_zero():
    comp, excs = three_way_line(
        bill_line(),
        po_line(),
        accepted_qty_available=Decimal(-3),
        price_tolerance_tk=TOL0,
    )
    assert comp.approved_qty == Decimal(0)
    assert comp.approved_amount == Decimal("0.00")
    assert [e.code for e in excs] == ["qty_over_grn"]

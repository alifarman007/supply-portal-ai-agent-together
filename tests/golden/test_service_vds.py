"""VDS on SERVICES — Rule 3(1) of the VAT Deduction at Source Rules 2025.

This closes the under-deduction hole the owner confirmed was real: they DO
receive service bills. Rule 3(1)'s chapeau requires deduction at the tabled
rate "whether or not a Mushak 6.3 exists" — the OPPOSITE of the goods rule.
Before this, a service bill with a valid VAT invoice was deducted NOTHING.

The bill modelled here mirrors the owner's real BRAC Learning Centre invoice:
a hotel room (S001.10) and a restaurant meal (S001.20), with a valid Mushak.
"""

import datetime as dt
from decimal import Decimal

import pytest

from app.agent.pipeline import check_bill
from app.engines.money import to_paisa
from app.models import (
    Bill,
    BillLine,
    BillStatus,
    Grn,
    GrnLine,
    PoLine,
    PurchaseOrder,
    Recommendation,
    Supplier,
    init_db,
    make_engine,
    make_session_factory,
)
from app.rules.loader import load_ruleset


def build(session, *, service_code: str, amount: str, bill_id: str, mushak: str | None):
    """One-line service bill at the given code and amount."""
    suffix = bill_id.split("-")[-1]
    session.add(
        Supplier(
            id=f"SUP-{suffix}", name="Service Supplier Ltd.",
            has_return_submission_proof=True, status="active",
        )
    )
    po = PurchaseOrder(
        id=f"PO-{suffix}", supplier_id=f"SUP-{suffix}",
        order_date=dt.date(2026, 8, 1), status="open",
    )
    po.lines = [
        PoLine(
            line_no=1, product_code="SVC-1", description="service",
            uom="Each", qty=Decimal("1"), unit_price_paisa=to_paisa(amount),
            vat_category_id="vat.standard_15",
            tds_category_id="tds.services.s90",
            service_code=service_code,
        )
    ]
    session.add(po)
    grn = Grn(id=f"GRN-{suffix}", po_id=f"PO-{suffix}", grn_date=dt.date(2026, 8, 5))
    grn.lines = [
        GrnLine(po_line_no=1, qty_received=Decimal("1"),
                qty_accepted=Decimal("1"), qty_rejected=Decimal("0"))
    ]
    session.add(grn)
    bill = Bill(
        id=bill_id, supplier_id=f"SUP-{suffix}", po_id=f"PO-{suffix}",
        supplier_invoice_no=f"INV-{suffix}", invoice_date=dt.date(2026, 8, 10),
        mushak_6_3_no=mushak, claimed_total_paisa=to_paisa(amount),
        status=BillStatus.ASSIGNED,
    )
    bill.lines = [
        BillLine(line_no=1, description="service", product_code="SVC-1",
                 qty=Decimal("1"), unit_price_paisa=to_paisa(amount),
                 amount_paisa=to_paisa(amount))
    ]
    session.add(bill)
    session.commit()
    return bill_id


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        yield sess


def codes(outcome):
    return {e.code for e in outcome.exceptions}


def vds_lines(outcome):
    return outcome.breakdown.get("vds_services") or []


# ---- the core fix: a Mushak does NOT stop the deduction on a service ------


def test_listed_service_is_deducted_even_with_a_valid_mushak(session):
    """S001.20 restaurant, 5%. The bill HAS a Mushak 6.3 — under the goods rule
    that would mean no deduction at all. Rule 3(1) says deduct anyway."""
    build(session, service_code="S001.20", amount="400.00",
          bill_id="BILL-SVC1", mushak="M63-OK-1")

    outcome = check_bill(session, "BILL-SVC1")

    detail = vds_lines(outcome)
    assert len(detail) == 1
    assert detail[0]["service_code"] == "S001.20"
    assert detail[0]["rate"] == "0.05"
    assert detail[0]["amount"] == "20.00"          # 5% of 400 — matches the real invoice
    assert outcome.breakdown["vds_deducted"][0]["amount"] == "20.00"


def test_goods_with_a_mushak_still_get_no_deduction(session):
    """The goods rule is untouched: a valid Mushak means no VDS."""
    build(session, service_code="", amount="1000.00",
          bill_id="BILL-GOODS1", mushak="M63-OK-2")

    outcome = check_bill(session, "BILL-GOODS1")
    assert vds_lines(outcome) == []
    assert outcome.breakdown["vds_deducted"][0]["amount"] == "0.00"


def test_service_deduction_reduces_the_net_payable(session):
    """The money must actually move: base 400 + VAT 60 - VDS 20 - TDS 40."""
    build(session, service_code="S001.20", amount="400.00",
          bill_id="BILL-SVC2", mushak="M63-OK-3")

    outcome = check_bill(session, "BILL-SVC2")
    assert outcome.approved_base == Decimal("400.00")
    assert outcome.net_payable == Decimal("400.00")


# ---- refusing to guess ----------------------------------------------------


def test_ambiguous_code_computes_nothing_and_asks_a_human(session):
    """S001.10 is 15% for an AC hotel and 10% for a non-AC hotel, under the
    SAME code. Picking one silently is a 5-point error on every hotel bill."""
    build(session, service_code="S001.10", amount="5000.00",
          bill_id="BILL-SVC3", mushak="M63-OK-4")

    outcome = check_bill(session, "BILL-SVC3")

    assert "vds_service_rate_ambiguous" in codes(outcome)
    assert vds_lines(outcome) == [], "no VDS may be computed for an ambiguous code"
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED

    message = next(
        e.message for e in outcome.exceptions if e.code == "vds_service_rate_ambiguous"
    )
    assert "0.15" in message and "0.10" in message, "both candidates must be offered"


def test_unknown_service_code_is_flagged(session):
    build(session, service_code="S999.99", amount="1000.00",
          bill_id="BILL-SVC4", mushak="M63-OK-5")

    outcome = check_bill(session, "BILL-SVC4")
    assert "vds_service_code_unknown" in codes(outcome)
    assert vds_lines(outcome) == []
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED


# ---- disclosure -----------------------------------------------------------


def test_rule5_exemptions_are_disclosed_as_unchecked(session):
    """Rule 5 can switch a row off entirely (attested Mushak, zero-rated
    supplies, startups...). This system does not evaluate it, so an applied
    rate says so rather than pretending completeness."""
    build(session, service_code="S001.20", amount="400.00",
          bill_id="BILL-SVC5", mushak="M63-OK-6")

    outcome = check_bill(session, "BILL-SVC5")
    assert "vds_service_rule5_not_checked" in codes(outcome)
    # INFO only — it must not by itself push the bill to review
    assert outcome.recommendation == Recommendation.CLEAR


def test_service_detail_is_explainable_in_the_breakdown(session):
    """The CFO must see WHICH code drove the deduction, not just a total."""
    build(session, service_code="S032.00", amount="10000.00",
          bill_id="BILL-SVC6", mushak="M63-OK-7")

    detail = vds_lines(check_bill(session, "BILL-SVC6"))[0]
    assert detail["service_code"] == "S032.00"
    assert detail["rate"] == "0.15"
    assert detail["amount"] == "1500.00"
    assert "onsultancy" in detail["description_en"]
    assert detail["base"] == "10000.00"


# ---- the table itself -----------------------------------------------------


def test_table_matches_the_owners_real_invoice():
    """The one external anchor we have: the BRAC invoice shows S001.10 = 15%
    (it is an AC hotel row) and S001.20 = 5%."""
    rules = load_ruleset("fy2026_27")
    assert Decimal("0.15") in rules.vds_service_codes["S001.10"].distinct_rates
    assert rules.vds_service_codes["S001.20"].rate == Decimal("0.05")


def test_known_ambiguous_codes_are_exactly_the_expected_three():
    """A code gaining or losing a sub-row silently would change deductions."""
    rules = load_ruleset("fy2026_27")
    ambiguous = {
        code for code, entry in rules.vds_service_codes.items() if entry.is_ambiguous
    }
    assert ambiguous == {"S001.10", "S010.20", "S048.00"}


def test_no_service_rate_exceeds_the_standard_vat_rate():
    """A VDS rate above 15% would mean withholding more VAT than was charged —
    a sanity bound on the whole extracted table."""
    rules = load_ruleset("fy2026_27")
    for code, entry in rules.vds_service_codes.items():
        for variant in entry.variants:
            assert variant.rate <= Decimal("0.15"), f"{code} has rate {variant.rate}"

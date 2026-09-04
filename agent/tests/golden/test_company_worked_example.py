"""Validation against the company's OWN withholding working.

Source: `application_example/Application of withholding tax and VAt-19.10.2021.xls`
(Kazi Farms Group, "Finance Act 2021", covering 01 Jul 2021 - 30 Jun 2022).

That workbook settles the two questions PLAN.md §15 left open, and it does so
with worked arithmetic rather than opinion:

  Cement sheet (A), purchase up to Tk 50 lac
    Invoice value          5,750,000   (1.15)
    Less: VAT                750,000   (0.15)
    Purchase price         5,000,000   (1.00)
    Less: Withholding Tax    150,000   (0.03)   <- 3% of the EX-VAT price
    Payable to supplier    5,600,000   (1.12)

  1. The PO/purchase price is VAT-EXCLUSIVE and VAT is added to reach the
     invoice  ->  po_prices_include_vat: false
  2. Withholding tax is computed on the VAT-EXCLUSIVE purchase price, NOT on
     the VAT-inclusive invoice  ->  tds base: excl_vat
  3. With a VAT challan for GOODS no VDS is withheld - the VAT is paid to the
     supplier ("If Kazi Farms borne the TDS and not VAT")  ->  our
     vds.standard_goods no_deduction rule.

CAVEAT kept deliberately in view: the workbook is FY2021-22 under the OLD
Income Tax Ordinance 1984 (it cites ss. 52 / 52AA / 52U). The current law is the
Income Tax Act 2023, whose s.140(5) is silent on VAT. This test therefore pins
the company's METHOD, not the 2026 rates - which is exactly what was uncertain.
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

# The workbook's own figures, straight from the Cement sheet.
PURCHASE_PRICE = Decimal("5000000.00")   # ex-VAT, as negotiated on the PO
EXPECTED_VAT = Decimal("750000.00")      # 15%
EXPECTED_TDS = Decimal("150000.00")      # 3% of the EX-VAT price
EXPECTED_PAYABLE = Decimal("5600000.00")  # invoice 5,750,000 - TDS 150,000


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        sess.add(
            Supplier(
                id="SUP-KF-CEM",
                name="Cement Supplier Ltd.",
                has_return_submission_proof=True,
                status="active",
            )
        )
        po = PurchaseOrder(
            id="PO-KF-CEM", supplier_id="SUP-KF-CEM",
            order_date=dt.date(2026, 8, 1), status="open",
        )
        po.lines = [
            PoLine(
                line_no=1, product_code="CEMENT", description="Cement",
                uom="tonne", qty=Decimal("1000"),
                unit_price_paisa=to_paisa(PURCHASE_PRICE / Decimal("1000")),
                vat_category_id="vat.standard_15",
                tds_category_id="tds.supply_of_goods.s89",
            )
        ]
        sess.add(po)
        grn = Grn(id="GRN-KF-CEM", po_id="PO-KF-CEM", grn_date=dt.date(2026, 8, 5))
        grn.lines = [
            GrnLine(
                po_line_no=1, qty_received=Decimal("1000"),
                qty_accepted=Decimal("1000"), qty_rejected=Decimal("0"),
            )
        ]
        sess.add(grn)
        bill = Bill(
            id="BILL-KF-CEM", supplier_id="SUP-KF-CEM", po_id="PO-KF-CEM",
            supplier_invoice_no="KF-CEM-001", invoice_date=dt.date(2026, 8, 10),
            mushak_6_3_no="M63-KF-CEM-001",   # VAT challan provided
            claimed_total_paisa=to_paisa(PURCHASE_PRICE),
            status=BillStatus.ASSIGNED,
        )
        bill.lines = [
            BillLine(
                line_no=1, description="Cement", product_code="CEMENT",
                qty=Decimal("1000"),
                unit_price_paisa=to_paisa(PURCHASE_PRICE / Decimal("1000")),
                amount_paisa=to_paisa(PURCHASE_PRICE),
            )
        ]
        sess.add(bill)
        sess.commit()
        yield sess


@pytest.fixture()
def rules_at_3pct():
    """The workbook applies 3% to this purchase. Rates changed under the 2023
    Act; the METHOD is what this test validates, so the rate is set to the
    workbook's to make the arithmetic directly comparable."""
    rules = load_ruleset("fy2026_27").model_copy(deep=True)
    rules.tds_rules["tds.supply_of_goods.s89"].slabs[0].rate = Decimal("0.03")
    return rules


def test_reproduces_the_company_cement_working(session, rules_at_3pct):
    outcome = check_bill(session, "BILL-KF-CEM", ruleset=rules_at_3pct)

    assert outcome.approved_base == PURCHASE_PRICE
    vat_total = sum(Decimal(v["amount"]) for v in outcome.breakdown["vat"])
    assert vat_total == EXPECTED_VAT, "VAT must be 15% ADDED to the ex-VAT PO price"

    tds = outcome.breakdown["tds_deducted"][0]
    assert Decimal(tds["base"]) == PURCHASE_PRICE, (
        "withholding tax base must be the VAT-EXCLUSIVE purchase price, not the "
        "VAT-inclusive invoice value"
    )
    assert Decimal(tds["amount"]) == EXPECTED_TDS
    assert tds["base_definition"] == "excl_vat"

    # goods + VAT challan -> no VDS, the VAT is paid over to the supplier
    assert outcome.breakdown["vds_deducted"][0]["amount"] == "0.00"

    assert outcome.net_payable == EXPECTED_PAYABLE
    assert outcome.recommendation == Recommendation.CLEAR


def test_vat_inclusive_base_would_overstate_the_deduction(session, rules_at_3pct):
    """Guard the choice: had we taken the base VAT-INCLUSIVE, the deduction
    would be 172,500 instead of 150,000 - a 15% overstatement against the
    company's own working. This test fails if someone flips the base."""
    incl = rules_at_3pct.model_copy(deep=True)
    incl.tds_rules["tds.supply_of_goods.s89"].base = "incl_vat"

    outcome = check_bill(session, "BILL-KF-CEM", ruleset=incl)
    tds = outcome.breakdown["tds_deducted"][0]
    assert Decimal(tds["base"]) == PURCHASE_PRICE + EXPECTED_VAT
    assert Decimal(tds["amount"]) == Decimal("172500.00")
    assert Decimal(tds["amount"]) != EXPECTED_TDS

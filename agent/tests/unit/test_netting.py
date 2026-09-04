"""Netting engine: fixed §6.6 order, advance capping, reconciliation."""

from decimal import Decimal

from app.engines.netting import LedgerAmount, build_netting
from app.engines.tax_tds import TdsDeduction
from app.engines.tax_vat import VatLine
from app.engines.tax_vds import VdsDeduction


def vat(line_no, amount, rate="0.15"):
    value = Decimal(amount)
    return VatLine(
        line_no=line_no,
        category_id="vat.standard_15",
        rate=Decimal(rate),
        base=value / Decimal(rate),
        amount=value,
        source_doc="PLACEHOLDER — test",
    )


def tds(amount, uplift_applied=False):
    return TdsDeduction(
        category_id="tds.supply_of_goods.s89",
        law="Income Tax Act 2023, s.89",
        source_doc="PLACEHOLDER — test",
        base_definition="excl_vat",
        base=Decimal("1000.00"),
        slab_rate=Decimal("0.05"),
        uplift=Decimal("1.5") if uplift_applied else Decimal(1),
        uplift_applied=uplift_applied,
        amount=Decimal(amount),
        line_nos=[1],
    )


def test_s6_whiteboard_netting():
    result = build_netting(
        approved_base=Decimal("1100.00"),
        vat_lines=[vat(1, "150.00"), vat(2, "10.00", rate="0.10")],
        vds=None,
        tds_deductions=[tds("55.00")],
        advances=[LedgerAmount(Decimal("500.00"), "ADV-S6-001")],
        retention_pct=Decimal("0"),
        penalties=[],
        prior_payments=[],
    )
    assert result.advance_adjusted == Decimal("500.00")
    assert result.net_payable == Decimal("705.00")  # 1100 + 160 - 55 - 500
    assert result.approved_base - result.advance_adjusted == Decimal("600.00")
    advance_lines = [line for line in result.lines if line.ref == "ADV-S6-001"]
    assert len(advance_lines) == 1
    assert advance_lines[0].amount == Decimal("-500.00")


def test_lines_always_reconcile_to_net():
    result = build_netting(
        approved_base=Decimal("1234.56"),
        vat_lines=[vat(1, "185.18")],
        vds=VdsDeduction(
            rule_id="vds.x",
            source_doc="PLACEHOLDER — test",
            action="deduct",
            rate=Decimal("0.075"),
            base=Decimal("1234.56"),
            amount=Decimal("92.59"),
        ),
        tds_deductions=[tds("61.73")],
        advances=[LedgerAmount(Decimal("100.00"), "ADV-1")],
        retention_pct=Decimal("0.05"),
        penalties=[LedgerAmount(Decimal("10.00"), "PEN-1")],
        prior_payments=[LedgerAmount(Decimal("50.00"), "PAY-1")],
    )
    assert sum((line.amount for line in result.lines), Decimal(0)) == result.net_payable
    assert result.retention_held == Decimal("61.73")  # 5% of 1234.56 rounded


def test_advance_capped_at_payable():
    result = build_netting(
        approved_base=Decimal("100.00"),
        vat_lines=[],
        vds=None,
        tds_deductions=[],
        advances=[LedgerAmount(Decimal("500.00"), "ADV-BIG")],
        retention_pct=Decimal("0"),
        penalties=[],
        prior_payments=[],
    )
    assert result.advance_adjusted == Decimal("100.00")
    assert result.net_payable == Decimal("0.00")
    assert [e.code for e in result.exceptions] == ["advance_partially_offset"]


def test_second_advance_after_exhaustion_stays_open():
    result = build_netting(
        approved_base=Decimal("100.00"),
        vat_lines=[],
        vds=None,
        tds_deductions=[],
        advances=[
            LedgerAmount(Decimal("100.00"), "ADV-1"),
            LedgerAmount(Decimal("40.00"), "ADV-2"),
        ],
        retention_pct=Decimal("0"),
        penalties=[],
        prior_payments=[],
    )
    assert result.advance_adjusted == Decimal("100.00")
    assert result.net_payable == Decimal("0.00")
    codes = [e.code for e in result.exceptions]
    assert "advance_not_fully_offset" in codes


def test_netting_order_is_fixed():
    result = build_netting(
        approved_base=Decimal("1000.00"),
        vat_lines=[vat(1, "150.00")],
        vds=VdsDeduction(
            rule_id="vds.x",
            source_doc="PLACEHOLDER — test",
            action="deduct",
            rate=Decimal("0.075"),
            base=Decimal("1000.00"),
            amount=Decimal("75.00"),
        ),
        tds_deductions=[tds("50.00")],
        advances=[LedgerAmount(Decimal("100.00"), "ADV-1")],
        retention_pct=Decimal("0.05"),
        penalties=[LedgerAmount(Decimal("20.00"), "PEN-1")],
        prior_payments=[LedgerAmount(Decimal("30.00"), "PAY-1")],
    )
    labels = [line.label for line in result.lines]
    assert labels[0].startswith("Approved base")
    assert labels[1].startswith("VAT")
    assert labels[2].startswith("VDS")
    assert labels[3].startswith("TDS")
    assert labels[4].startswith("Advance")
    assert labels[5].startswith("Retention")
    assert labels[6].startswith("Penalty")
    assert labels[7].startswith("Prior payment")
    # 1000 + 150 - 75 - 50 - 100 - 50 - 20 - 30
    assert result.net_payable == Decimal("825.00")

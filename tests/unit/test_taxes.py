"""Tax engines on the PLACEHOLDER FY tables: VAT (mixed categories, inclusive
base), TDS (flat, slab boundaries, uplift, incl_vat base), VDS (Mushak 6.3)."""

from decimal import Decimal

import pytest

from app.engines.matching import LineComputation
from app.engines.tax_tds import compute_tds
from app.engines.tax_vat import compute_vat
from app.engines.tax_vds import evaluate_vds
from app.rules.loader import load_ruleset


@pytest.fixture(scope="module")
def rules():
    return load_ruleset("fy2026_27")


def comp(line_no=1, amount="1000.00", vat="vat.standard_15", tds="tds.supply_of_goods.s89"):
    value = Decimal(amount)
    return LineComputation(
        bill_line_no=line_no,
        po_line_no=line_no,
        product_code=f"P{line_no}",
        description=f"line {line_no}",
        billed_qty=Decimal(1),
        approved_qty=Decimal(1),
        billed_unit_price=value,
        approved_unit_price=value,
        billed_amount=value,
        approved_amount=value,
        price_adjustment=Decimal("0.00"),
        qty_adjustment=Decimal("0.00"),
        vat_category_id=vat,
        tds_category_id=tds,
    )


# ---- VAT -------------------------------------------------------------------


def test_vat_mixed_categories_s8_numbers(rules):
    lines = [
        comp(1, "1000.00", vat="vat.standard_15"),
        comp(2, "500.00", vat="vat.reduced_10"),
        comp(3, "200.00", vat="vat.standard_15"),
    ]
    vat_lines, excs = compute_vat(lines, rules)
    assert not excs
    assert [v.amount for v in vat_lines] == [
        Decimal("150.00"),
        Decimal("50.00"),
        Decimal("30.00"),
    ]
    assert all(v.source_doc.startswith("PLACEHOLDER") for v in vat_lines)


def test_vat_unknown_category_flags_unclassified(rules):
    vat_lines, excs = compute_vat([comp(vat="vat.nonexistent")], rules)
    assert not vat_lines
    assert [e.code for e in excs] == ["unclassified_item"]


def test_vat_inclusive_base_derivation(rules):
    inclusive = rules.model_copy(deep=True)
    inclusive.policies.po_prices_include_vat = True
    vat_lines, _ = compute_vat([comp(amount="115.00")], inclusive)
    assert vat_lines[0].base == Decimal("100.00")
    assert vat_lines[0].amount == Decimal("15.00")


# ---- TDS -------------------------------------------------------------------


def test_tds_flat_five_percent(rules):
    deductions, excs = compute_tds([comp(amount="1500.00")], [], rules, has_return_proof=True)
    assert not excs
    assert deductions[0].amount == Decimal("75.00")
    assert deductions[0].uplift_applied is False
    assert deductions[0].law == "Income Tax Act 2023, s.89"


def test_tds_uplift_without_return_proof(rules):
    deductions, _ = compute_tds([comp(amount="1000.00")], [], rules, has_return_proof=False)
    assert deductions[0].uplift == Decimal("1.5")
    assert deductions[0].uplift_applied is True
    assert deductions[0].amount == Decimal("75.00")  # 1000 * 0.05 * 1.5


def test_tds_slab_boundary_exact_edge(rules):
    on_edge, _ = compute_tds(
        [comp(amount="5000000.00", tds="tds.services.s90")], [], rules, has_return_proof=True
    )
    assert on_edge[0].slab_rate == Decimal("0.03")
    assert on_edge[0].amount == Decimal("150000.00")

    over_edge, _ = compute_tds(
        [comp(amount="5000001.00", tds="tds.services.s90")], [], rules, has_return_proof=True
    )
    assert over_edge[0].slab_rate == Decimal("0.05")
    assert over_edge[0].amount == Decimal("250000.05")


def test_tds_aggregates_lines_per_category(rules):
    deductions, _ = compute_tds(
        [comp(1, "1000.00"), comp(2, "500.00")], [], rules, has_return_proof=True
    )
    assert len(deductions) == 1
    assert deductions[0].base == Decimal("1500.00")
    assert deductions[0].line_nos == [1, 2]


def test_tds_incl_vat_base(rules):
    incl = rules.model_copy(deep=True)
    incl.tds_rules["tds.supply_of_goods.s89"].base = "incl_vat"
    lines = [comp(amount="1000.00")]
    vat_lines, _ = compute_vat(lines, incl)
    deductions, _ = compute_tds(lines, vat_lines, incl, has_return_proof=True)
    assert deductions[0].base == Decimal("1150.00")
    assert deductions[0].amount == Decimal("57.50")


def test_tds_unknown_category_flags_unclassified(rules):
    deductions, excs = compute_tds(
        [comp(tds="tds.nonexistent")], [], rules, has_return_proof=True
    )
    assert not deductions
    assert [e.code for e in excs] == ["unclassified_item"]


# ---- VDS -------------------------------------------------------------------


def test_vds_with_mushak_no_deduction(rules):
    vds, excs = evaluate_vds(Decimal("1000.00"), rules, mushak_6_3_present=True)
    assert vds is not None
    assert vds.action == "no_deduction"
    assert vds.amount == Decimal("0.00")
    assert not excs


def test_vds_missing_mushak_deducts_and_flags(rules):
    vds, excs = evaluate_vds(Decimal("1000.00"), rules, mushak_6_3_present=False)
    assert vds is not None
    assert vds.action == "deduct"
    assert vds.amount == Decimal("75.00")  # 7.5% placeholder
    assert [e.code for e in excs] == ["missing_mushak_6_3"]
    assert excs[0].rule_id == "vds.standard_goods.missing_mushak"

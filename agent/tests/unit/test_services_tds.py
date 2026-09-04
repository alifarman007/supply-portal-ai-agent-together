"""TDS on SERVICES — Rule 4(1) under Income Tax Act 2023 s.90.

Services differ from goods in three ways that change the money, and each is
pinned here. Before this table existed the engine applied a placeholder 3%/5%
band that appears nowhere in law, so a service bill computed a confidently
wrong deduction.
"""

from decimal import Decimal

import pytest

from app.engines.matching import LineComputation
from app.engines.tax_tds import compute_tds
from app.rules.loader import load_ruleset


@pytest.fixture(scope="module")
def rules():
    return load_ruleset("fy2026_27")


def svc(amount: str, category: str) -> LineComputation:
    value = Decimal(amount)
    return LineComputation(
        bill_line_no=1, po_line_no=1, product_code="SVC", description="service",
        billed_qty=Decimal(1), approved_qty=Decimal(1),
        billed_unit_price=value, approved_unit_price=value,
        billed_amount=value, approved_amount=value,
        price_adjustment=Decimal("0.00"), qty_adjustment=Decimal("0.00"),
        vat_category_id="vat.standard_15", tds_category_id=category,
    )


# ---- serials 1-3: the payee's legal form changes the rate ------------------


@pytest.mark.parametrize(
    ("serial", "company_rate", "person_rate"),
    [
        ("tds.services.s90.serial_01", "0.075", "0.15"),  # adviser/consultancy
        ("tds.services.s90.serial_02", "0.075", "0.15"),  # professional
        ("tds.services.s90.serial_03", "0.10", "0.15"),   # technical
    ],
)
def test_natural_person_is_rated_differently(rules, serial, company_rate, person_rate):
    line = [svc("100000.00", serial)]

    company, _ = compute_tds(line, [], rules, has_return_proof=True)
    assert company[0].slab_rate == Decimal(company_rate)
    assert company[0].amount == Decimal("100000.00") * Decimal(company_rate)

    person, _ = compute_tds(
        line, [], rules, has_return_proof=True, is_natural_person=True
    )
    assert person[0].slab_rate == Decimal(person_rate)
    assert person[0].amount == Decimal("100000.00") * Decimal(person_rate)
    assert person[0].amount > company[0].amount


def test_natural_person_flag_is_ignored_where_no_alternate_rate_exists(rules):
    """Serial 5 (catering etc.) has one rate regardless of the payee's form."""
    line = [svc("100000.00", "tds.services.s90.serial_05")]
    company, _ = compute_tds(line, [], rules, has_return_proof=True)
    person, _ = compute_tds(line, [], rules, has_return_proof=True, is_natural_person=True)
    assert company[0].amount == person[0].amount == Decimal("2000.00")


def test_goods_are_unaffected_by_the_natural_person_flag(rules):
    line = [svc("100000.00", "tds.supply_of_goods.s89")]
    a, _ = compute_tds(line, [], rules, has_return_proof=True)
    b, _ = compute_tds(line, [], rules, has_return_proof=True, is_natural_person=True)
    assert a[0].amount == b[0].amount == Decimal("5000.00")


# ---- serials 4/12/13/18: higher-of commission vs total bill ----------------


@pytest.mark.parametrize(
    ("serial", "total_bill_rate"),
    [
        ("tds.services.s90.serial_04", "0.01"),
        ("tds.services.s90.serial_12", "0.01"),
        ("tds.services.s90.serial_13", "0.05"),
        ("tds.services.s90.serial_18", "0.01"),
    ],
)
def test_higher_of_serials_compute_but_demand_review(rules, serial, total_bill_rate):
    """We cannot see a commission split, so the total-bill figure is computed
    (a number the CFO can act on) AND flagged — never silently taken as final,
    because the true deduction could be the larger commission-based one."""
    deductions, exceptions = compute_tds(
        [svc("1000000.00", serial)], [], rules, has_return_proof=True
    )
    assert deductions[0].amount == Decimal("1000000.00") * Decimal(total_bill_rate)
    assert deductions[0].higher_of_unresolved is True

    codes = [e.code for e in exceptions]
    assert codes == ["tds_higher_of_commission_unresolved"]
    assert exceptions[0].rule_id == serial
    assert "commission" in exceptions[0].message


def test_serials_without_the_proviso_are_not_flagged(rules):
    for serial in ("tds.services.s90.serial_05", "tds.services.s90.serial_16",
                   "tds.services.s90"):
        deductions, exceptions = compute_tds(
            [svc("100000.00", serial)], [], rules, has_return_proof=True
        )
        assert deductions[0].higher_of_unresolved is False
        assert exceptions == []


# ---- the residual ---------------------------------------------------------


def test_services_residual_is_ten_percent(rules):
    """Serial 19 catches anything unlisted. The id `tds.services.s90` is kept
    so existing PO lines keep resolving."""
    deductions, _ = compute_tds(
        [svc("100000.00", "tds.services.s90")], [], rules, has_return_proof=True
    )
    assert deductions[0].slab_rate == Decimal("0.10")
    assert deductions[0].amount == Decimal("10000.00")


def test_uplift_still_applies_to_services(rules):
    """No proof of return submission uplifts the service rate too."""
    deductions, _ = compute_tds(
        [svc("100000.00", "tds.services.s90.serial_16")], [], rules, has_return_proof=False
    )
    assert deductions[0].uplift_applied is True
    assert deductions[0].amount == Decimal("7500.00")  # 100000 x 0.05 x 1.5


def test_no_service_rate_is_the_old_placeholder(rules):
    """The 3%/5% amount band the engine used to apply appears nowhere in the
    2026 Rules. Guard against it creeping back."""
    for rule_id, rule in rules.tds_rules.items():
        if "services" not in rule_id:
            continue
        assert len(rule.slabs) == 1, f"{rule_id} has amount bands; Rule 4(1) has none"
        assert rule.slabs[0].max is None

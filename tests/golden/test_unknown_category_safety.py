"""Mixed-supplier safety: when a bill line's goods have no tax rate in the FY
tables, the agent must NEVER silently guess or silently skip the tax. It must
surface the line to a human.

This is the property that matters when suppliers sell varied items and the rule
tables only cover part of the catalogue.
"""

from decimal import Decimal

import pytest

from app.agent.pipeline import check_bill
from app.models import Recommendation, init_db, make_engine, make_session_factory
from app.rules.loader import load_ruleset
from app.seeding import seed


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        seed(sess)
        yield sess


def test_unknown_vat_category_forces_review_and_charges_no_vat(session):
    """S1 line 2 is vat.reduced_10. Remove that rate from the tables — as if the
    supplier sold something we have not classified yet."""
    rules = load_ruleset("fy2026_27").model_copy(deep=True)
    del rules.vat_rates["vat.reduced_10"]

    outcome = check_bill(session, "BILL-S1", ruleset=rules)

    codes = {exc.code for exc in outcome.exceptions}
    assert "unclassified_item" in codes
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED

    # the unclassified line is still PAID (goods were received) but carries NO
    # invented VAT — 1500 base + 150 VAT on line 1 only - 75 TDS
    assert outcome.approved_base == Decimal("1500.00")
    assert outcome.net_payable == Decimal("1575.00")
    vat_lines = outcome.breakdown["vat"]
    assert [v["line_no"] for v in vat_lines] == [1]  # line 2 got no VAT at all


def test_unknown_tds_category_forces_review_and_withholds_nothing(session):
    rules = load_ruleset("fy2026_27").model_copy(deep=True)
    del rules.tds_rules["tds.supply_of_goods.s89"]

    outcome = check_bill(session, "BILL-S1", ruleset=rules)

    codes = {exc.code for exc in outcome.exceptions}
    assert "unclassified_item" in codes
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED
    assert outcome.breakdown["tds_deducted"] == []  # nothing invented
    assert outcome.net_payable == Decimal("1700.00")  # 1500 + 200 VAT, no TDS


def test_exception_names_the_offending_line_and_category(session):
    """The CFO must be able to see WHICH line and WHICH category is unknown,
    otherwise the review is guesswork."""
    rules = load_ruleset("fy2026_27").model_copy(deep=True)
    del rules.vat_rates["vat.reduced_10"]

    outcome = check_bill(session, "BILL-S1", ruleset=rules)
    unclassified = [e for e in outcome.exceptions if e.code == "unclassified_item"]
    assert len(unclassified) == 1
    assert unclassified[0].line_no == 2
    assert "vat.reduced_10" in unclassified[0].message
    assert "fy2026_27" in unclassified[0].message


def test_residual_rate_covers_ordinary_goods(session):
    """The real Rule 3(1) table ends in a residual serial for anything not
    listed; our goods rule plays that role, so an ordinary unlisted item still
    computes rather than blocking."""
    outcome = check_bill(session, "BILL-S1")
    assert outcome.recommendation == Recommendation.CLEAR
    assert outcome.breakdown["tds_deducted"][0]["rate"] == "0.05"

"""Golden scenarios S1-S12 end-to-end through the checking pipeline
(PLAN.md §10) — LLM Node A mocked as mapping-proposal data where needed (S10).

Expected numbers derive from the PLACEHOLDER FY2026-27 tables:
VAT 15%/10%, TDS goods flat 5% (x1.5 uplift without return proof),
VDS no-deduction with Mushak 6.3 / 7.5% without it.
"""

from decimal import Decimal

import pytest

from app.agent.pipeline import check_bill
from app.engines.matching import MappingProposal
from app.models import (
    Bill,
    BillStatus,
    CheckingResult,
    CheckingRun,
    Recommendation,
    RunStatus,
    init_db,
    make_engine,
    make_session_factory,
)
from app.seeding import seed


@pytest.fixture(scope="module")
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        seed(sess)
        yield sess


def bill_for(session, tag):
    return (
        session.query(Bill).filter(Bill.scenario_tag == tag).order_by(Bill.id).first()
    )


def codes(outcome):
    return {exc.code for exc in outcome.exceptions}


def test_s1_perfect_match_clear(session):
    outcome = check_bill(session, "BILL-S1")
    assert outcome.recommendation == Recommendation.CLEAR
    assert outcome.approved_base == Decimal("1500.00")
    assert outcome.breakdown["price_adjustments"] == []
    assert outcome.breakdown["qty_adjustments"] == []
    # per-line VAT breakdown: 15% on 1000, 10% on 500
    assert [(v["rate"], v["amount"]) for v in outcome.breakdown["vat"]] == [
        ("0.15", "150.00"),
        ("0.10", "50.00"),
    ]
    assert outcome.breakdown["tds_deducted"][0]["amount"] == "75.00"
    assert outcome.net_payable == Decimal("1625.00")  # 1500 + 200 - 75


def test_s1_run_persisted_and_reproducible_metadata(session):
    outcome = check_bill(session, "BILL-S1")
    run = session.get(CheckingRun, outcome.run_id)
    assert run.status == RunStatus.COMPLETED
    assert len(run.rules_version) == 64
    result = session.query(CheckingResult).filter_by(run_id=run.run_id).one()
    assert result.net_payable_paisa == 162500
    assert result.gross_claimed_paisa == 150000
    assert bill_for(session, "S1").status == BillStatus.PENDING_CFO


def test_s1_recheck_is_idempotent_new_run(session):
    first = check_bill(session, "BILL-S1")
    second = check_bill(session, "BILL-S1")
    assert first.run_id != second.run_id
    assert first.net_payable == second.net_payable
    runs = session.query(CheckingRun).filter_by(bill_id="BILL-S1").count()
    assert runs >= 2


def test_s2_whiteboard_overbilling_cut(session):
    outcome = check_bill(session, "BILL-S2")
    assert outcome.recommendation == Recommendation.CLEAR_WITH_ADJUSTMENTS
    assert outcome.gross_claimed == Decimal("1600.00")
    assert outcome.approved_base == Decimal("1500.00")
    adjustments = outcome.breakdown["price_adjustments"]
    assert adjustments == [
        {"line_no": 2, "amount": "-100.00", "rule_id": "policy.price_over_po"}
    ]
    assert "price_over_po" in codes(outcome)
    assert outcome.net_payable == Decimal("1625.00")


def test_s3_qty_over_grn_review(session):
    outcome = check_bill(session, "BILL-S3")
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED
    assert "qty_over_grn" in codes(outcome)
    assert outcome.breakdown["qty_adjustments"][0]["amount"] == "-200.00"
    assert outcome.approved_base == Decimal("1000.00")
    assert outcome.net_payable == Decimal("1100.00")  # 1000 + 150 - 50


def test_s4_missing_grn_blocked_no_payable(session):
    outcome = check_bill(session, "BILL-S4")
    assert outcome.recommendation == Recommendation.BLOCKED
    assert "missing_grn" in codes(outcome)
    assert outcome.net_payable is None
    assert outcome.approved_base is None
    result = (
        session.query(CheckingResult)
        .join(CheckingRun, CheckingRun.run_id == CheckingResult.run_id)
        .filter(CheckingRun.bill_id == "BILL-S4")
        .first()
    )
    assert result.net_payable_paisa is None


def test_s5_exact_duplicate_blocked(session):
    outcome = check_bill(session, "BILL-S5B")
    assert outcome.recommendation == Recommendation.BLOCKED
    assert "duplicate_exact" in codes(outcome)
    assert outcome.net_payable is None


def test_s6_whiteboard_netting(session):
    outcome = check_bill(session, "BILL-S6")
    assert outcome.recommendation == Recommendation.CLEAR
    assert outcome.approved_base == Decimal("1100.00")
    assert outcome.breakdown["advance_adjusted"] == "500.00"
    advance_lines = [
        line for line in outcome.breakdown["netting_order"] if line["ref"] == "ADV-S6-001"
    ]
    assert advance_lines == [
        {"label": "Advance adjustment", "amount": "-500.00", "rule_id": None, "ref": "ADV-S6-001"}
    ]
    # whiteboard idea: 1100 - 500 = 600 before taxes
    assert outcome.approved_base - Decimal(outcome.breakdown["advance_adjusted"]) == Decimal(
        "600.00"
    )
    assert outcome.net_payable == Decimal("705.00")  # 1100 + 160 - 55 - 500


def test_s7_tds_uplift_with_citation(session):
    outcome = check_bill(session, "BILL-S7")
    tds = outcome.breakdown["tds_deducted"][0]
    assert tds["uplift_applied"] is True
    assert tds["uplift"] == "1.5"
    assert tds["amount"] == "75.00"  # 1000 * 0.05 * 1.5
    assert tds["law"] == "Income Tax Act 2023, s.89"
    assert outcome.net_payable == Decimal("1075.00")  # 1000 + 150 - 75


def test_s8_mixed_vat_reconciles(session):
    outcome = check_bill(session, "BILL-S8")
    assert outcome.recommendation == Recommendation.CLEAR
    vat_amounts = [Decimal(v["amount"]) for v in outcome.breakdown["vat"]]
    assert vat_amounts == [Decimal("150.00"), Decimal("50.00"), Decimal("30.00")]
    netting_sum = sum(
        (Decimal(line["amount"]) for line in outcome.breakdown["netting_order"]), Decimal(0)
    )
    assert netting_sum == outcome.net_payable == Decimal("1845.00")  # 1700 + 230 - 85


def test_s9_supplier_hold_blocked_before_computation(session):
    outcome = check_bill(session, "BILL-S9")
    assert outcome.recommendation == Recommendation.BLOCKED
    assert "supplier_on_hold" in codes(outcome)
    assert outcome.approved_base is None
    assert outcome.net_payable is None


def test_s10_node_a_proposals_mocked_high_confidence(session):
    outcome = check_bill(
        session,
        "BILL-S10",
        mapping_proposals={
            1: MappingProposal(po_line_no=1, confidence=0.95),
            2: MappingProposal(po_line_no=2, confidence=0.90),
        },
    )
    assert outcome.recommendation == Recommendation.CLEAR
    assert outcome.approved_base == Decimal("2800.00")
    assert outcome.net_payable == Decimal("3080.00")  # 2800 + 420 - 140


def test_s10_low_confidence_variant_review_and_excluded(session):
    outcome = check_bill(
        session,
        "BILL-S10",
        mapping_proposals={
            1: MappingProposal(po_line_no=1, confidence=0.40),
            2: MappingProposal(po_line_no=2, confidence=0.90),
        },
    )
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED
    assert "mapping_low_confidence" in codes(outcome)
    assert outcome.approved_base == Decimal("800.00")  # line 1 excluded


def test_s11_fuzzy_duplicate_review(session):
    outcome = check_bill(session, "BILL-S11B")
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED
    assert "duplicate_fuzzy" in codes(outcome)
    assert outcome.net_payable is not None  # computed, not blocked


def test_s12_missing_mushak_flagged_and_vds_withheld(session):
    outcome = check_bill(session, "BILL-S12")
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED
    assert "missing_mushak_6_3" in codes(outcome)
    vds = outcome.breakdown["vds_deducted"][0]
    assert vds["amount"] == "75.00"  # 7.5% of 1000 placeholder
    assert vds["rule_id"] == "vds.standard_goods.missing_mushak"
    assert outcome.net_payable == Decimal("1025.00")  # 1000 + 150 - 75 - 50


def test_reports_contain_only_computed_numbers(session):
    outcome = check_bill(session, "BILL-S1")
    assert "NET PAYABLE" in outcome.report_md
    assert "1625.00" in outcome.report_md
    assert outcome.recommendation.value in outcome.report_md

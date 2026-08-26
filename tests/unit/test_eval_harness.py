"""The evaluation harness must be trustworthy before its numbers mean anything.

These tests prove it FAILS when the system is wrong (a harness that always
passes measures nothing) and that its fixture self-checks catch broken cases.
"""

from decimal import Decimal

import pytest

from app.eval.dataset import EvalCase, materialize, validate_internal_consistency
from app.eval.runner import EvalReport, MappingOutcome, run_case
from app.eval.tuning import SweepPoint
from app.models import init_db, make_engine, make_session_factory


def make_case(**overrides) -> EvalCase:
    """A minimal CLEAR case: 1 line, 10 x 100 Tk, VAT 15%, TDS 5%.
    base 1000 + VAT 150 - TDS 50 = 1100.00"""
    data = {
        "case_id": "X01",
        "title": "probe",
        "purpose": "harness self-test",
        "supplier": {
            "id": "SUP-X01",
            "name": "Probe Ltd",
            "has_return_submission_proof": True,
            "status": "active",
        },
        "po": {
            "id": "PO-X01",
            "order_date": "2026-08-01",
            "status": "open",
            "lines": [
                {
                    "line_no": 1,
                    "product_code": "PX",
                    "description": "widget",
                    "uom": "pcs",
                    "qty": "10",
                    "unit_price_tk": "100.00",
                    "vat_category_id": "vat.standard_15",
                    "tds_category_id": "tds.supply_of_goods.s89",
                }
            ],
        },
        "grns": [
            {
                "id": "GRN-X01",
                "grn_date": "2026-08-05",
                "lines": [
                    {
                        "po_line_no": 1,
                        "qty_received": "10",
                        "qty_accepted": "10",
                        "qty_rejected": "0",
                    }
                ],
            }
        ],
        "bill": {
            "id": "BILL-X01",
            "supplier_invoice_no": "INV-X01",
            "invoice_date": "2026-08-10",
            "mushak_6_3_no": "M-X01",
            "claimed_total_tk": "1000.00",
            "lines": [
                {
                    "line_no": 1,
                    "description": "widget",
                    "product_code": "PX",
                    "qty": "10",
                    "unit_price_tk": "100.00",
                    "amount_tk": "1000.00",
                }
            ],
        },
        "ledger_entries": [],
        "expectations": {
            "recommendation": "CLEAR",
            "net_payable_tk": "1100.00",
            "approved_base_tk": "1000.00",
            "must_raise_codes": [],
            "must_not_raise_codes": [],
            "arithmetic": "1000 + 150 VAT - 50 TDS = 1100",
            "node_a_ground_truth": {},
            "node_a_difficulty": "none",
        },
    }
    for key, value in overrides.items():
        data["expectations"][key] = value
    return EvalCase.model_validate(data)


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        yield sess


def run(session, case, audit_dir):
    from app.audit.store import AuditStore

    materialize(session, [case])
    return run_case(session, case, audit=AuditStore(audit_dir))


# ---- the harness must PASS a correct case --------------------------------


def test_correct_expectations_pass(session, tmp_path):
    result = run(session, make_case(), tmp_path)
    assert result.passed, result.failures
    assert result.actual_net == Decimal("1100.00")


def test_deterministic_run_reports_no_llm_cost(session, tmp_path):
    """With nodes off there are no calls — and no stale audit record from an
    earlier run may be attributed to this one."""
    from app.audit.store import AuditStore

    store = AuditStore(tmp_path)
    # a leftover record from a previous eval of the SAME case
    store.record_llm_call(
        provider="gemini", model="m", url="u",
        request_payload={}, response_payload={}, status="ok",
        latency_ms=1.0, attempt=1,
        usage={"promptTokenCount": 500, "candidatesTokenCount": 100},
        context={"run_id": "eval-X01-nodeA", "node": "A", "prompt_version": "v1"},
    )
    result = run(session, make_case(), tmp_path)
    assert result.cost.llm_calls == 0
    assert result.cost.input_tokens == 0


# ---- ...and FAIL a wrong one, or it measures nothing ----------------------


def test_wrong_recommendation_is_caught(session, tmp_path):
    result = run(session, make_case(recommendation="BLOCKED"), tmp_path)
    assert not result.passed
    assert any("recommendation" in f for f in result.failures)


def test_wrong_net_payable_is_caught(session, tmp_path):
    result = run(session, make_case(net_payable_tk="9999.00"), tmp_path)
    assert not result.passed
    assert any("net payable" in f for f in result.failures)


def test_wrong_approved_base_is_caught(session, tmp_path):
    result = run(session, make_case(approved_base_tk="1.00"), tmp_path)
    assert not result.passed
    assert any("approved base" in f for f in result.failures)


def test_missing_required_exception_is_caught(session, tmp_path):
    result = run(session, make_case(must_raise_codes=["qty_over_grn"]), tmp_path)
    assert not result.passed
    assert any("missing exception" in f for f in result.failures)


def test_forbidden_exception_is_caught(session, tmp_path):
    """The negative assertion must bite when the code actually fires."""
    case = make_case(
        recommendation="REVIEW_REQUIRED", must_not_raise_codes=["missing_mushak_6_3"]
    )
    case.bill.mushak_6_3_no = None  # now missing_mushak_6_3 WILL fire
    result = run(session, case, tmp_path)
    assert not result.passed
    assert any("unexpected exception" in f for f in result.failures)


def test_expected_null_net_is_enforced(session, tmp_path):
    result = run(session, make_case(net_payable_tk=None), tmp_path)
    assert not result.passed
    assert any("expected none" in f for f in result.failures)


# ---- fixture self-checks --------------------------------------------------


def test_inconsistent_claimed_total_is_rejected():
    case = make_case()
    case.bill.claimed_total_tk = Decimal("999.00")
    problems = validate_internal_consistency([case])
    assert any("claimed" in p for p in problems)


def test_line_amount_mismatch_is_rejected():
    case = make_case()
    case.bill.lines[0].amount_tk = Decimal("123.00")
    problems = validate_internal_consistency([case])
    assert any("qty x price" in p for p in problems)


def test_duplicate_bill_ids_are_rejected():
    problems = validate_internal_consistency([make_case(), make_case()])
    assert any("duplicate bill id" in p for p in problems)


def test_ground_truth_pointing_at_missing_po_line_is_rejected():
    case = make_case()
    case.expectations.node_a_ground_truth = {"1": 99}
    problems = validate_internal_consistency([case])
    assert any("does not exist" in p for p in problems)


def test_consistent_case_has_no_problems():
    assert validate_internal_consistency([make_case()]) == []


# ---- metric arithmetic ----------------------------------------------------


def test_mapping_outcome_scores_only_exact_matches():
    outcome = MappingOutcome(
        difficulty="medium",
        expected={1: 2, 2: 3, 3: 1},
        actual={1: 2, 2: 9, 3: 1},  # line 2 mapped wrongly
        confidences={1: 0.9, 2: 0.8, 3: 0.95},
    )
    assert outcome.total == 3
    assert outcome.measured == 3
    assert outcome.correct == 2


def test_failed_call_is_not_counted_as_a_wrong_answer():
    """A quota or transport failure must not be reported as model inaccuracy —
    they are different problems with different fixes."""
    outcome = MappingOutcome(
        difficulty="hard",
        expected={1: 1, 2: 2},
        actual={},
        confidences={},
        error="HTTP 429: quota exceeded",
    )
    assert outcome.total == 2
    assert outcome.measured == 0, "an errored call answered nothing"
    assert outcome.correct == 0


def test_confidence_calibration_buckets():
    from app.eval.runner import CaseResult

    report = EvalReport(results=[], mode="test")

    good = CaseResult(
        case_id="A", bill_id="b", title="t",
        expected_recommendation="CLEAR", actual_recommendation="CLEAR",
        expected_net=None, actual_net=None, expected_base=None, actual_base=None,
        raised_codes=[],
        mapping=MappingOutcome(
            difficulty="easy",
            expected={1: 1, 2: 2},
            actual={1: 1, 2: 5},
            confidences={1: 0.95, 2: 0.80},
        ),
    )
    report.results.append(good)
    buckets = report.confidence_calibration()
    assert buckets[">=0.90"] == {"correct": 1, "wrong": 0}
    assert buckets["0.75-0.89"] == {"correct": 0, "wrong": 1}


def test_sweep_point_precision_recall_f1():
    point = SweepPoint(
        amount_pct=Decimal("0.01"),
        days_window=7,
        true_positives=3,
        false_positives=1,
        false_negatives=1,
        true_negatives=5,
    )
    assert point.precision == 0.75
    assert point.recall == 0.75
    assert point.f1 == 0.75


def test_sweep_point_handles_no_flags():
    point = SweepPoint(amount_pct=Decimal("0.01"), days_window=7)
    assert point.precision is None
    assert point.recall is None
    assert point.f1 is None

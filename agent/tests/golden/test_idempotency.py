"""Phase 6 idempotency (PLAN.md §12, §2.7).

Re-running work must never change money or corrupt state. These tests pin the
properties an accounts system is judged on: the same bill checked twice gives
the same answer, a re-check never resurrects a decided bill, and the audit trail
only ever grows.
"""

import json
from decimal import Decimal

import pytest

from app.agent.pipeline import BillNotCheckableError, check_bill
from app.audit.store import AuditStore
from app.models import (
    Bill,
    BillStatus,
    CheckingResult,
    CheckingRun,
    init_db,
    make_engine,
    make_session_factory,
)
from app.seeding import seed


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        seed(sess)
        yield sess


@pytest.mark.parametrize(
    "bill_id", ["BILL-S1", "BILL-S2", "BILL-S3", "BILL-S6", "BILL-S8", "BILL-S12"]
)
def test_repeated_checks_produce_identical_money(session, bill_id):
    """Three runs, three run_ids, one answer."""
    outcomes = [check_bill(session, bill_id) for _ in range(3)]

    run_ids = {o.run_id for o in outcomes}
    assert len(run_ids) == 3, "each check must be its own auditable run"

    first = outcomes[0]
    for other in outcomes[1:]:
        assert other.net_payable == first.net_payable
        assert other.approved_base == first.approved_base
        assert other.recommendation == first.recommendation
        assert json.dumps(other.breakdown, sort_keys=True) == json.dumps(
            first.breakdown, sort_keys=True
        )
        assert sorted(e.code for e in other.exceptions) == sorted(
            e.code for e in first.exceptions
        )


def test_blocked_bill_stays_blocked_on_recheck(session):
    first = check_bill(session, "BILL-S4")  # missing GRN
    second = check_bill(session, "BILL-S4")
    assert first.recommendation == second.recommendation
    assert first.net_payable is second.net_payable is None


def test_recheck_does_not_disturb_other_bills(session):
    baseline = check_bill(session, "BILL-S6").net_payable
    for _ in range(3):
        check_bill(session, "BILL-S1")
        check_bill(session, "BILL-S2")
    assert check_bill(session, "BILL-S6").net_payable == baseline


def test_each_run_persists_exactly_one_result(session):
    for _ in range(3):
        check_bill(session, "BILL-S1")
    runs = session.query(CheckingRun).filter_by(bill_id="BILL-S1").all()
    assert len(runs) == 3
    for run in runs:
        assert session.query(CheckingResult).filter_by(run_id=run.run_id).count() == 1


def test_decided_bill_cannot_be_rechecked(session):
    """§2.7: the gate that stops a paid bill re-entering the CFO queue."""
    check_bill(session, "BILL-S1")
    bill = session.get(Bill, "BILL-S1")
    bill.status = BillStatus.PAYMENT_INSTRUCTED
    session.commit()

    with pytest.raises(BillNotCheckableError):
        check_bill(session, "BILL-S1")
    assert session.get(Bill, "BILL-S1").status == BillStatus.PAYMENT_INSTRUCTED


def test_returned_bill_can_be_rechecked_with_same_result(session):
    """A returned bill is resubmittable — and must compute the same way."""
    first = check_bill(session, "BILL-S3")
    bill = session.get(Bill, "BILL-S3")
    bill.status = BillStatus.RETURNED
    session.commit()

    second = check_bill(session, "BILL-S3")
    assert second.net_payable == first.net_payable
    assert second.recommendation == first.recommendation


def test_audit_log_is_append_only(tmp_path):
    """Existing records are never rewritten — the §13 immutability property."""
    store = AuditStore(tmp_path)
    store.record("test_event", {"seq": 1})
    audit_file = next(iter(tmp_path.glob("audit-*.jsonl")))
    after_first = audit_file.read_text(encoding="utf-8")

    store.record("test_event", {"seq": 2})
    after_second = audit_file.read_text(encoding="utf-8")

    assert after_second.startswith(after_first), "earlier records were modified"
    assert len(after_second.splitlines()) == 2

    ids = [json.loads(line)["event_id"] for line in after_second.splitlines()]
    assert len(set(ids)) == 2, "event ids must be unique"


def test_seeding_twice_leaves_one_copy(session):
    before = session.query(Bill).count()
    seed(session)
    seed(session)
    assert session.query(Bill).count() == before


def test_eval_materialize_is_idempotent():
    """The eval harness shares suppliers/POs across cases, so re-materializing
    must not duplicate them."""
    from app.eval.dataset import EvalCase, materialize

    case = EvalCase.model_validate(
        {
            "case_id": "T01",
            "title": "idempotency probe",
            "supplier": {
                "id": "SUP-T01",
                "name": "Probe Supplier",
                "has_return_submission_proof": True,
                "status": "active",
            },
            "po": {
                "id": "PO-T01",
                "order_date": "2026-08-01",
                "status": "open",
                "lines": [
                    {
                        "line_no": 1,
                        "product_code": "P1",
                        "description": "thing",
                        "uom": "pcs",
                        "qty": "1",
                        "unit_price_tk": "100.00",
                        "vat_category_id": "vat.standard_15",
                        "tds_category_id": "tds.supply_of_goods.s89",
                    }
                ],
            },
            "grns": [
                {
                    "id": "GRN-T01",
                    "grn_date": "2026-08-05",
                    "lines": [
                        {
                            "po_line_no": 1,
                            "qty_received": "1",
                            "qty_accepted": "1",
                            "qty_rejected": "0",
                        }
                    ],
                }
            ],
            "bill": {
                "id": "BILL-T01",
                "supplier_invoice_no": "INV-T01",
                "invoice_date": "2026-08-10",
                "mushak_6_3_no": "M-T01",
                "claimed_total_tk": "100.00",
                "lines": [
                    {
                        "line_no": 1,
                        "description": "thing",
                        "product_code": "P1",
                        "qty": "1",
                        "unit_price_tk": "100.00",
                        "amount_tk": "100.00",
                    }
                ],
            },
            "ledger_entries": [],
            "expectations": {
                "recommendation": "CLEAR",
                "net_payable_tk": "110.00",
                "approved_base_tk": "100.00",
                "must_raise_codes": [],
                "arithmetic": "100 + 15 VAT - 5 TDS = 110",
                "node_a_difficulty": "none",
            },
        }
    )

    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        materialize(sess, [case])
        from app.models import PurchaseOrder, Supplier

        assert sess.query(Supplier).count() == 1
        assert sess.query(PurchaseOrder).count() == 1

        outcome = check_bill(sess, "BILL-T01")
        assert outcome.net_payable == Decimal("110.00")

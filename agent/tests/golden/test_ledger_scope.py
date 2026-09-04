"""Ledger scope and disclosure (PLAN.md §6.6).

Two properties, both found during the Phase 6 evaluation:

1. WHICH advances may be recovered from a bill is a documented policy choice
   (`advance_scope`), not an accident of implementation.
2. Money on the ledger must never vanish silently — an entry that is in scope
   for this bill but that the netting did not consume is always surfaced.
"""

import datetime as dt
from decimal import Decimal

import pytest

from app.agent.pipeline import check_bill
from app.engines.money import to_paisa
from app.models import (
    LedgerEntry,
    LedgerType,
    Recommendation,
    init_db,
    make_engine,
    make_session_factory,
)
from app.rules.loader import load_ruleset
from app.seeding import seed


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        seed(sess)
        yield sess


def add_entry(session, entry_type, amount, *, po_id=None, bill_id=None, ref="LEDG-1"):
    session.add(
        LedgerEntry(
            supplier_id="SUP-S1",
            po_id=po_id,
            bill_id=bill_id,
            entry_type=entry_type,
            amount_paisa=to_paisa(amount),
            entry_date=dt.date(2026, 8, 1),
            ref=ref,
        )
    )
    session.commit()


def codes(outcome):
    return {exc.code for exc in outcome.exceptions}


BASELINE_NET = Decimal("1625.00")  # BILL-S1 with no ledger activity


def test_baseline_has_no_ledger_flags(session):
    outcome = check_bill(session, "BILL-S1")
    assert outcome.net_payable == BASELINE_NET
    assert "ledger_entry_not_applied" not in codes(outcome)


# ---- advance_scope policy -------------------------------------------------


def test_untied_advance_is_not_recovered_under_po_only(session):
    """Default policy: a general supplier advance is left alone — but disclosed."""
    add_entry(session, LedgerType.ADVANCE, "300.00", po_id=None, ref="ADV-GENERAL")

    outcome = check_bill(session, "BILL-S1")
    assert outcome.net_payable == BASELINE_NET, "untied advance must not be recovered"
    assert "ledger_entry_not_applied" in codes(outcome)
    flagged = [e for e in outcome.exceptions if e.code == "ledger_entry_not_applied"]
    assert flagged[0].ref == "ADV-GENERAL"
    assert "300.00" in flagged[0].message
    # INFO only: the computation is complete, so this alone cannot escalate
    assert outcome.recommendation == Recommendation.CLEAR


def test_untied_advance_is_recovered_under_po_and_supplier(session):
    add_entry(session, LedgerType.ADVANCE, "300.00", po_id=None, ref="ADV-GENERAL")
    rules = load_ruleset("fy2026_27").model_copy(deep=True)
    rules.policies.advance_scope = "po_and_supplier"

    outcome = check_bill(session, "BILL-S1", ruleset=rules)
    assert outcome.net_payable == BASELINE_NET - Decimal("300.00")
    assert "ledger_entry_not_applied" not in codes(outcome)


def test_advance_on_this_po_is_always_recovered(session):
    add_entry(session, LedgerType.ADVANCE, "200.00", po_id="PO-S1", ref="ADV-THISPO")
    outcome = check_bill(session, "BILL-S1")
    assert outcome.net_payable == BASELINE_NET - Decimal("200.00")
    assert "ledger_entry_not_applied" not in codes(outcome)


def test_advance_on_another_po_is_ignored_and_not_flagged(session):
    """Another PO's advance is none of this bill's business — neither recovered
    nor noise in the CFO's exception list."""
    add_entry(session, LedgerType.ADVANCE, "500.00", po_id="PO-S2", ref="ADV-OTHERPO")
    outcome = check_bill(session, "BILL-S1")
    assert outcome.net_payable == BASELINE_NET
    assert "ledger_entry_not_applied" not in codes(outcome)


# ---- disclosure of unconsumed entries -------------------------------------


def test_unlinked_payment_escalates_to_review(session):
    """A payment on the PO with no bill link may already have settled part of
    what we are about to pay — that is a double-payment risk, so REVIEW."""
    add_entry(session, LedgerType.PAYMENT, "400.00", po_id="PO-S1", ref="PAY-UNLINKED")

    outcome = check_bill(session, "BILL-S1")
    assert "ledger_payment_not_applied" in codes(outcome)
    assert outcome.recommendation == Recommendation.REVIEW_REQUIRED
    assert outcome.net_payable == BASELINE_NET  # not netted, only flagged


def test_payment_linked_to_this_bill_is_netted(session):
    add_entry(
        session, LedgerType.PAYMENT, "400.00", po_id="PO-S1", bill_id="BILL-S1",
        ref="PAY-THISBILL",
    )
    outcome = check_bill(session, "BILL-S1")
    assert outcome.net_payable == BASELINE_NET - Decimal("400.00")
    assert "ledger_payment_not_applied" not in codes(outcome)


def test_payment_for_another_bill_is_ignored_and_not_flagged(session):
    add_entry(
        session, LedgerType.PAYMENT, "400.00", po_id="PO-S1", bill_id="BILL-S2",
        ref="PAY-OTHERBILL",
    )
    outcome = check_bill(session, "BILL-S1")
    assert outcome.net_payable == BASELINE_NET
    assert "ledger_payment_not_applied" not in codes(outcome)


@pytest.mark.parametrize(
    "entry_type", [LedgerType.RETENTION_HELD, LedgerType.ADJUSTMENT]
)
def test_entry_types_the_engine_does_not_handle_are_still_disclosed(session, entry_type):
    """These types have no netting rule yet. Before this check they vanished
    without trace, which is the worst possible behavior for a ledger."""
    add_entry(session, entry_type, "150.00", po_id="PO-S1", ref=f"REF-{entry_type.value}")

    outcome = check_bill(session, "BILL-S1")
    assert "ledger_entry_not_applied" in codes(outcome)
    assert outcome.net_payable == BASELINE_NET


def test_penalty_is_deducted_not_flagged(session):
    add_entry(session, LedgerType.PENALTY, "100.00", po_id="PO-S1", ref="PEN-1")
    outcome = check_bill(session, "BILL-S1")
    assert outcome.net_payable == BASELINE_NET - Decimal("100.00")
    assert "ledger_entry_not_applied" not in codes(outcome)


def test_multiple_unconsumed_entries_are_each_named(session):
    add_entry(session, LedgerType.ADJUSTMENT, "50.00", po_id="PO-S1", ref="ADJ-1")
    add_entry(session, LedgerType.RETENTION_HELD, "75.00", po_id=None, ref="RET-1")

    outcome = check_bill(session, "BILL-S1")
    refs = {
        e.ref for e in outcome.exceptions if e.code == "ledger_entry_not_applied"
    }
    assert refs == {"ADJ-1", "RET-1"}

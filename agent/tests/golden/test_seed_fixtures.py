"""Golden fixtures S1-S12 (PLAN.md §10): shape, priority-scenario numbers,
and MockErpGateway behavior against the seeded DB."""

from decimal import Decimal

import pytest

from app.adapters.erp import MockErpGateway
from app.models import (
    Bill,
    SupplierStatus,
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


@pytest.fixture()
def erp(session) -> MockErpGateway:
    return MockErpGateway(session)


def bills_for(session, tag: str) -> list[Bill]:
    return session.query(Bill).filter(Bill.scenario_tag == tag).order_by(Bill.id).all()


def test_all_twelve_scenarios_seeded(session):
    tags = {b.scenario_tag for b in session.query(Bill).all()}
    assert tags == {f"S{i}" for i in range(1, 13)}
    # S5 (exact duplicate) and S11 (fuzzy duplicate) each need a pair of bills
    assert session.query(Bill).count() == 14


def test_reseeding_is_idempotent(session):
    before = session.query(Bill).count()
    seed(session)
    assert session.query(Bill).count() == before


def test_s1_perfect_match(session, erp):
    bill = bills_for(session, "S1")[0]
    po = erp.get_po(bill.po_id)
    assert bill.claimed_total_paisa == 150000  # 1,500.00 Tk
    for bill_line, po_line in zip(bill.lines, po.lines, strict=True):
        assert bill_line.qty == po_line.qty
        assert bill_line.unit_price_paisa == po_line.unit_price_paisa
    assert {line.vat_category_id for line in po.lines} == {"vat.standard_15", "vat.reduced_10"}


def test_s2_whiteboard_overbilling_cut_is_100_tk(session, erp):
    """PRIORITY: Y billed 600 for 5 qty (120/unit) vs PO 100/unit -> 100 Tk cut."""
    bill = bills_for(session, "S2")[0]
    po = erp.get_po(bill.po_id)
    line_y = bill.lines[1]
    po_y = po.lines[1]

    assert line_y.qty == Decimal("5")
    assert line_y.unit_price_paisa == 12000  # 120.00 Tk billed
    assert po_y.unit_price_paisa == 10000  # 100.00 Tk on PO
    assert line_y.amount_paisa == 60000  # 600.00 Tk claimed

    over_billing_paisa = (line_y.unit_price_paisa - po_y.unit_price_paisa) * int(line_y.qty)
    assert over_billing_paisa == 10000  # the 100 Tk the engine must cut
    assert bill.claimed_total_paisa == 160000


def test_s3_billed_qty_exceeds_grn_accepted(session, erp):
    bill = bills_for(session, "S3")[0]
    grns = erp.get_grns_for_po(bill.po_id)
    accepted = sum((line.qty_accepted for grn in grns for line in grn.lines), Decimal(0))
    assert bill.lines[0].qty == Decimal("12")
    assert accepted == Decimal("10")


def test_s4_no_grn_exists(session, erp):
    bill = bills_for(session, "S4")[0]
    assert erp.get_grns_for_po(bill.po_id) == []


def test_s5_exact_duplicate_pair(session):
    pair = bills_for(session, "S5")
    assert len(pair) == 2
    assert pair[0].supplier_id == pair[1].supplier_id
    assert pair[0].supplier_invoice_no == pair[1].supplier_invoice_no == "INV-DUP-001"


def test_s6_whiteboard_netting_advance_500(session, erp):
    """PRIORITY: approved 1,100 with open advance 500 -> net 600 before taxes."""
    bill = bills_for(session, "S6")[0]
    assert bill.claimed_total_paisa == 110000  # 1,100.00 Tk

    advances = [
        entry
        for entry in erp.get_ledger_entries(bill.supplier_id, po_id=bill.po_id)
        if entry.entry_type.value == "advance"
    ]
    assert len(advances) == 1
    assert advances[0].amount_paisa == 50000  # 500.00 Tk
    assert advances[0].ref == "ADV-S6-001"
    assert bill.claimed_total_paisa - advances[0].amount_paisa == 60000  # 600.00 Tk


def test_s7_supplier_lacks_return_proof(session, erp):
    bill = bills_for(session, "S7")[0]
    supplier = erp.get_supplier(bill.supplier_id)
    assert supplier.has_return_submission_proof is False


def test_s8_mixed_vat_categories(session, erp):
    bill = bills_for(session, "S8")[0]
    po = erp.get_po(bill.po_id)
    categories = [line.vat_category_id for line in po.lines]
    assert "vat.standard_15" in categories and "vat.reduced_10" in categories
    assert sum(line.amount_paisa for line in bill.lines) == bill.claimed_total_paisa == 170000


def test_s9_supplier_on_hold(session, erp):
    bill = bills_for(session, "S9")[0]
    assert erp.get_supplier(bill.supplier_id).status == SupplierStatus.HOLD


def test_s10_free_text_lines_without_product_code(session):
    bill = bills_for(session, "S10")[0]
    assert all(line.product_code is None for line in bill.lines)
    assert all(line.description for line in bill.lines)


def test_s11_fuzzy_duplicate_within_1pct_and_7_days(session):
    a, b = bills_for(session, "S11")
    assert a.supplier_invoice_no != b.supplier_invoice_no
    diff = abs(a.claimed_total_paisa - b.claimed_total_paisa)
    assert Decimal(diff) / Decimal(a.claimed_total_paisa) <= Decimal("0.01")
    assert abs((b.invoice_date - a.invoice_date).days) <= 7


def test_s12_missing_mushak(session):
    bill = bills_for(session, "S12")[0]
    assert bill.mushak_6_3_no is None


def test_gateway_prior_bills_excludes_current(session, erp):
    pair = bills_for(session, "S5")
    prior = erp.get_prior_bills(pair[0].supplier_id, exclude_bill_id=pair[0].id)
    assert [b.id for b in prior] == [pair[1].id]


def test_bill_totals_reconcile_with_lines(session):
    for bill in session.query(Bill).all():
        assert sum(line.amount_paisa for line in bill.lines) == bill.claimed_total_paisa

"""The contract between the supplier portal and this agent.

These tests exist because the two halves live in different languages and the ways they
can disagree are silent. Nothing here needs the portal to be running: the payloads are
exactly what `portal/src/lib/billcheck/mappers.ts` produces, written out by hand so that
a change on either side breaks a test rather than a supplier's payment.

The three things being pinned:

  1. The portal's payload shape is accepted as-is.
  2. The VAT-inclusive to ex-VAT conversion reproduces a figure we can check against the
     purchase order's own subtotal. Get this wrong and every bill is 15% too high with no
     exception raised anywhere.
  3. The purchase-order status mapping keeps bills checkable. The portal's "fulfilled"
     means the goods arrived, which is when a bill SHOULD be accepted; mapping it to the
     agent's "closed" would block every real bill with `po_not_open`.
"""

from __future__ import annotations

import json
from decimal import Decimal
from pathlib import Path

import pytest
from pydantic import ValidationError

from app.agent.pipeline import check_bill
from app.models import Bill, init_db, make_engine, make_session_factory
from app.models.bill import BillIn
from app.seeding import PORTAL_SEEDS_PATH, bill_from_in, seed

PORTAL_VAT_DIVISOR = Decimal("1.15")

# PO-2026-0001 as the portal shows it: two lines, ex-VAT subtotal 293,000, VAT 43,950,
# grand total 336,950. The form offers the grand total, because that is the figure
# printed on the order.
PORTAL_GRAND_TOTAL = Decimal("336950")
PO_EX_VAT_SUBTOTAL = Decimal("293000")


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as s:
        seed(s)
        if PORTAL_SEEDS_PATH.exists():
            seed(s, PORTAL_SEEDS_PATH, wipe=False)
        yield s


def portal_payload(**overrides) -> dict:
    """Exactly what `toAgentBill` in the portal emits: money and quantities as strings."""
    payload = {
        "id": "BILL-PORTAL-CONTRACT",
        "supplier_id": "SP-2024-001",
        "po_id": "po-001",
        "supplier_invoice_no": "INV-PO-2026-0001",
        "invoice_date": "2026-09-04",
        "mushak_6_3_no": "M63-PO-2026-0001",
        "claimed_total_tk": "293000.00",
        "lines": [
            {
                "line_no": 1,
                "description": "Corrugated Carton Box (30x20x15 cm)",
                "product_code": "poi-001-1",
                "qty": "5000",
                "unit_price_tk": "45.00",
                "amount_tk": "225000.00",
            },
            {
                "line_no": 2,
                "description": "Stretch Wrap Film (500mm x 300m roll)",
                "product_code": "poi-001-2",
                "qty": "100",
                "unit_price_tk": "680.00",
                "amount_tk": "68000.00",
            },
        ],
    }
    payload.update(overrides)
    return payload


# --- 1. the payload shape ------------------------------------------------------------


def test_the_portals_payload_is_accepted_as_is():
    bill = BillIn.model_validate(portal_payload())
    assert bill.claimed_total_tk == Decimal("293000.00")
    assert [line.qty for line in bill.lines] == [Decimal("5000"), Decimal("100")]


def test_money_sent_as_a_json_number_is_refused():
    """The portal must send money as strings.

    A JSON number reaches Python as a float, and a float is exactly what the money engine
    refuses. If this ever starts passing, the portal has begun sending floats and paisa
    are being silently lost somewhere.
    """
    payload = portal_payload()
    payload["lines"][0]["amount_tk"] = 225000.005  # type: ignore[index]
    with pytest.raises(ValidationError):
        BillIn.model_validate(payload)


def test_a_total_that_disagrees_with_the_lines_is_refused():
    """`toAgentBill` derives the total from the lines precisely so this cannot happen."""
    with pytest.raises(ValidationError):
        BillIn.model_validate(portal_payload(claimed_total_tk="336950.00"))


# --- 2. the VAT conversion -----------------------------------------------------------


def test_vat_inclusive_to_ex_vat_matches_the_purchase_order():
    """The conversion the portal applies, checked against the order's own subtotal.

    This mirrors `vatInclusiveToExVat` in portal/src/lib/billcheck/mappers.ts.
    """
    ex_vat = PORTAL_GRAND_TOTAL / PORTAL_VAT_DIVISOR
    assert ex_vat == PO_EX_VAT_SUBTOTAL


def test_sending_the_vat_inclusive_figure_would_overstate_the_bill():
    """Quantifies what the conversion prevents, so the cost of dropping it is on record."""
    overstatement = PORTAL_GRAND_TOTAL - (PORTAL_GRAND_TOTAL / PORTAL_VAT_DIVISOR)
    assert overstatement == Decimal("43950")


# --- 3. the round trip ---------------------------------------------------------------


@pytest.mark.skipif(not PORTAL_SEEDS_PATH.exists(), reason="portal demo seed not generated")
def test_a_portal_bill_checks_without_blocking(session):
    """The exit criterion for the data spine, as a test.

    A bill against a purchase order whose goods arrived must produce a real recommendation
    and a real net payable — not a blocker.
    """
    session.add(bill_from_in(BillIn.model_validate(portal_payload())))
    session.commit()

    outcome = check_bill(session, "BILL-PORTAL-CONTRACT")

    assert outcome.recommendation.value != "BLOCKED"
    assert outcome.net_payable is not None
    # 293,000 + 15% VAT = 336,950, less 3% TDS on the ex-VAT base (serial 17, packing
    # materials) = 8,790. VDS is nil because a Mushak 6.3 is present.
    assert outcome.net_payable == Decimal("328160.00")


@pytest.mark.skipif(not PORTAL_SEEDS_PATH.exists(), reason="portal demo seed not generated")
def test_billing_more_than_was_delivered_is_caught(session):
    """PO-2026-0015 is only 60% delivered. Billing it in full must not sail through."""
    payload = portal_payload(
        id="BILL-PORTAL-OVERBILL",
        po_id="po-003",
        supplier_invoice_no="INV-PO-2026-0015",
        claimed_total_tk="250000.00",
        lines=[
            {"line_no": 1, "description": "Bubble Wrap Roll", "product_code": "poi-003-1",
             "qty": "200", "unit_price_tk": "950.00", "amount_tk": "190000.00"},
            {"line_no": 2, "description": "Foam Corner Protector Set",
             "product_code": "poi-003-2", "qty": "1000", "unit_price_tk": "60.00",
             "amount_tk": "60000.00"},
        ],
    )
    session.add(bill_from_in(BillIn.model_validate(payload)))
    session.commit()

    outcome = check_bill(session, "BILL-PORTAL-OVERBILL")

    codes = {exc.code for exc in outcome.exceptions}
    assert "qty_over_grn" in codes, f"over-billing went unnoticed; got {codes}"
    assert outcome.recommendation.value in {"REVIEW_REQUIRED", "CLEAR_WITH_ADJUSTMENTS"}


@pytest.mark.skipif(not PORTAL_SEEDS_PATH.exists(), reason="portal demo seed not generated")
def test_billing_goods_that_never_arrived_is_blocked(session):
    """PO-2026-0041 is only issued — nothing has been received against it."""
    payload = portal_payload(
        id="BILL-PORTAL-NOGRN",
        po_id="po-008",
        supplier_invoice_no="INV-PO-2026-0041",
        claimed_total_tk="450000.00",
        lines=[
            {"line_no": 1, "description": "Corrugated Carton Box",
             "product_code": "poi-008-1", "qty": "10000", "unit_price_tk": "45.00",
             "amount_tk": "450000.00"},
        ],
    )
    session.add(bill_from_in(BillIn.model_validate(payload)))
    session.commit()

    outcome = check_bill(session, "BILL-PORTAL-NOGRN")

    assert outcome.recommendation.value == "BLOCKED"
    assert "missing_grn" in {exc.code for exc in outcome.exceptions}
    assert outcome.net_payable is None


# --- 4. the seed itself --------------------------------------------------------------


@pytest.mark.skipif(not PORTAL_SEEDS_PATH.exists(), reason="portal demo seed not generated")
def test_the_generated_seed_holds_no_scientific_notation():
    """`Decimal.normalize()` renders 5000 as "5E+3". Readable seeds matter."""
    raw = json.loads(Path(PORTAL_SEEDS_PATH).read_text(encoding="utf-8"))
    quantities = [
        line["qty"] for po in raw["purchase_orders"] for line in po["lines"]
    ] + [
        line["qty_received"] for grn in raw["grns"] for line in grn["lines"]
    ]
    offenders = [q for q in quantities if "e" in q.lower()]
    assert not offenders, f"scientific notation in the seed: {offenders}"


@pytest.mark.skipif(not PORTAL_SEEDS_PATH.exists(), reason="portal demo seed not generated")
def test_no_portal_purchase_order_is_seeded_closed(session):
    """The status-mapping trap, pinned.

    The portal's status describes delivery and the agent's describes billing. Mapping the
    portal's "fulfilled" onto "closed" would make every real bill fail as `po_not_open`.
    """
    raw = json.loads(Path(PORTAL_SEEDS_PATH).read_text(encoding="utf-8"))
    statuses = {po["status"] for po in raw["purchase_orders"]}
    assert "closed" not in statuses
    assert "open" in statuses


@pytest.mark.skipif(not PORTAL_SEEDS_PATH.exists(), reason="portal demo seed not generated")
def test_every_portal_po_line_carries_a_tax_classification():
    """An unclassified line charges NO tax and only raises a REVIEW — easy to miss."""
    raw = json.loads(Path(PORTAL_SEEDS_PATH).read_text(encoding="utf-8"))
    for po in raw["purchase_orders"]:
        for line in po["lines"]:
            where = f"{po['id']} line {line['line_no']}"
            assert line.get("vat_category_id"), f"{where}: no VAT category"
            assert line.get("tds_category_id"), f"{where}: no TDS category"


def test_the_golden_fixtures_are_untouched_by_the_portal_seed(session):
    """The portal universe is additive; it must not displace the S1-S12 fixtures."""
    assert session.get(Bill, "BILL-S1") is not None
    assert session.get(Bill, "BILL-S2") is not None

"""The CFO review page must show which tax rates were applied, with the
citation each came from and whether an accountant has confirmed it.

This is how the rate tables get verified: against a REAL bill, in context,
rather than against an abstract list.
"""

import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.models import init_db, make_engine, make_session_factory
from app.seeding import seed


@pytest.fixture()
def client(tmp_path):
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as session:
        seed(session)
    return TestClient(create_app(engine, outbox_dir=tmp_path / "outbox", webhook_url=""))


def test_applied_rates_are_listed_with_citations(client):
    client.post("/bills/BILL-S1/check")
    page = client.get("/review/BILL-S1").text

    assert "Tax rates applied" in page
    # the rates this bill actually used
    assert "15%" in page and "10%" in page and "5%" in page
    # the rule ids behind them
    assert "vat.standard_15" in page
    assert "vat.reduced_10" in page
    assert "tds.supply_of_goods.s89" in page
    # and the citation, so the accountant can find the gazette page
    assert "S.R.O. 273" in page
    assert "AWAITING ACCOUNTANT SIGN-OFF" in page


def test_unverified_rates_are_called_out(client):
    client.post("/bills/BILL-S1/check")
    page = client.get("/review/BILL-S1").text
    assert "NOT CONFIRMED" in page
    assert "have not been confirmed by an accountant" in page


def test_uplift_is_shown_on_the_rate(client):
    """S7's supplier has no return-submission proof, so the rate carries a
    x1.5 uplift — the accountant should see why the deduction is larger."""
    client.post("/bills/BILL-S7/check")
    page = client.get("/review/BILL-S7").text
    assert "no return proof" in page
    assert "x1.5" in page


def test_vds_appears_when_withheld(client):
    """S12 has no Mushak 6.3, so VDS is withheld — its rule and citation must
    be visible too."""
    client.post("/bills/BILL-S12/check")
    page = client.get("/review/BILL-S12").text
    assert "VDS" in page
    assert "vds.standard_goods.missing_mushak" in page


def test_blocked_bill_shows_no_rate_panel(client):
    """S4 is BLOCKED with nothing computed, so there are no applied rates to
    show and the panel must not appear empty or misleading."""
    client.post("/bills/BILL-S4/check")
    page = client.get("/review/BILL-S4").text
    assert "Tax rates applied" not in page

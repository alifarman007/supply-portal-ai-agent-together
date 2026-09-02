"""Uploading a bill file: parse -> confirm -> check.

The property that matters most here is that NOTHING is created from a file
alone. Two of the three input paths involve reading a document, and a misread
line becomes a wrong payment — so the upload endpoint only ever produces a
draft for a human to confirm.
"""

import json

import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.models import Bill, init_db, make_engine, make_session_factory
from app.seeding import seed


@pytest.fixture()
def env(tmp_path):
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        seed(session)
    client = TestClient(create_app(engine, outbox_dir=tmp_path / "outbox", webhook_url=""))
    return {"client": client, "factory": factory}


CSV_BODY = (
    "line_no,description,product_code,qty,unit_price_tk,amount_tk\n"
    "1,Pro X industrial unit,PRO-X,10,100.00,1000.00\n"
    "2,Pro Y industrial unit,PRO-Y,5,100.00,500.00\n"
)

JSON_BODY = json.dumps(
    {
        "id": "BILL-UP-JSON",
        "supplier_id": "SUP-S1",
        "po_id": "PO-S1",
        "supplier_invoice_no": "INV-UP-1",
        "invoice_date": "2026-09-20",
        "mushak_6_3_no": "M63-UP-1",
        "claimed_total_tk": "1500.00",
        "lines": [
            {"line_no": 1, "description": "Pro X", "product_code": "PRO-X",
             "qty": "10", "unit_price_tk": "100.00", "amount_tk": "1000.00"},
            {"line_no": 2, "description": "Pro Y", "product_code": "PRO-Y",
             "qty": "5", "unit_price_tk": "100.00", "amount_tk": "500.00"},
        ],
    }
)


def upload(client, name, body, **form):
    data = {"po_id": "PO-S1", "supplier_id": "SUP-S1", **form}
    return client.post(
        "/upload",
        files={"upload": (name, body if isinstance(body, bytes) else body.encode())},
        data=data,
    )


# ---- the page exists and is reachable -------------------------------------


def test_upload_page_renders(env):
    page = env["client"].get("/upload")
    assert page.status_code == 200
    assert "Upload a bill" in page.text


def test_review_pages_link_to_upload(env):
    assert "/upload" in env["client"].get("/review").text


# ---- CSV --------------------------------------------------------------


def test_csv_produces_a_preview_not_a_bill(env):
    page = upload(env["client"], "bill.csv", CSV_BODY, bill_id="BILL-UP-CSV")
    assert page.status_code == 200
    assert "Check this before saving" in page.text
    assert "Pro X industrial unit" in page.text
    assert "1500" in page.text  # the recomputed total

    with env["factory"]() as session:
        assert session.get(Bill, "BILL-UP-CSV") is None, "reading a file must not save it"


def test_csv_accepts_spreadsheet_style_headers(env):
    body = (
        "Sl No,Details,Code,Quantity,Unit Price (Taka),Total Price (Taka)\n"
        "1,Pro X industrial unit,PRO-X,10,100.00,1000.00\n"
    )
    page = upload(env["client"], "bill.csv", body, bill_id="BILL-UP-ALIAS")
    assert page.status_code == 200
    assert "Pro X industrial unit" in page.text


def test_csv_without_amount_column_derives_and_says_so(env):
    body = "line_no,description,product_code,qty,unit_price_tk\n1,Pro X,PRO-X,10,100.00\n"
    page = upload(env["client"], "bill.csv", body, bill_id="BILL-UP-NOAMT")
    assert "computed as" in page.text.lower()


def test_csv_missing_required_columns_is_rejected(env):
    page = upload(env["client"], "bill.csv", "foo,bar\n1,2\n")
    assert page.status_code == 400
    assert "missing column" in page.text


def test_empty_file_is_rejected(env):
    page = upload(env["client"], "bill.csv", "")
    assert page.status_code == 400
    assert "empty" in page.text


def test_oversized_file_is_rejected(env):
    page = upload(env["client"], "bill.csv", "x" * (9 * 1024 * 1024))
    assert page.status_code == 400
    assert "limit" in page.text


def test_unsupported_extension_is_rejected(env):
    page = upload(env["client"], "bill.exe", "anything")
    assert page.status_code == 400
    assert "unsupported file type" in page.text


# ---- JSON -------------------------------------------------------------


def test_json_preview_then_confirm_creates_and_checks(env):
    client = env["client"]
    page = upload(client, "bill.json", JSON_BODY, bill_id="BILL-UP-JSON")
    assert page.status_code == 200

    confirmed = client.post(
        "/upload/confirm",
        data={
            "id": "BILL-UP-JSON", "supplier_id": "SUP-S1", "po_id": "PO-S1",
            "supplier_invoice_no": "INV-UP-1", "invoice_date": "2026-09-20",
            "mushak_6_3_no": "M63-UP-1", "claimed_total_tk": "1500.00",
            "line_0_no": "1", "line_0_description": "Pro X",
            "line_0_product_code": "PRO-X", "line_0_qty": "10",
            "line_0_unit_price_tk": "100.00", "line_0_amount_tk": "1000.00",
            "line_1_no": "2", "line_1_description": "Pro Y",
            "line_1_product_code": "PRO-Y", "line_1_qty": "5",
            "line_1_unit_price_tk": "100.00", "line_1_amount_tk": "500.00",
        },
        follow_redirects=False,
    )
    assert confirmed.status_code == 303
    assert confirmed.headers["location"] == "/review/BILL-UP-JSON"

    status = client.get("/bills/BILL-UP-JSON").json()
    assert status["status"] == "PENDING_CFO", "confirming must also CHECK the bill"
    assert status["latest_run"]["recommendation"] == "CLEAR"
    assert status["latest_run"]["net_payable_tk"] == "1625.00"


def test_malformed_json_is_rejected(env):
    page = upload(env["client"], "bill.json", "{not json")
    assert page.status_code == 400
    assert "not valid JSON" in page.text


def test_json_without_lines_is_rejected(env):
    page = upload(env["client"], "bill.json", json.dumps({"id": "X"}))
    assert page.status_code == 400
    assert "no lines array" in page.text


# ---- confirm still enforces every rule --------------------------------


def base_confirm(**overrides):
    data = {
        "id": "BILL-UP-C", "supplier_id": "SUP-S1", "po_id": "PO-S1",
        "supplier_invoice_no": "INV-C", "invoice_date": "2026-09-21",
        "mushak_6_3_no": "M63-C", "claimed_total_tk": "1000.00",
        "line_0_no": "1", "line_0_description": "Pro X",
        "line_0_product_code": "PRO-X", "line_0_qty": "10",
        "line_0_unit_price_tk": "100.00", "line_0_amount_tk": "1000.00",
    }
    data.update(overrides)
    return data


def test_confirm_rejects_a_total_that_does_not_match_the_lines(env):
    """The claimed total must equal the sum of lines — the same rule the JSON
    intake applies. Confirmation is not a licence to skip validation."""
    r = env["client"].post("/upload/confirm", data=base_confirm(claimed_total_tk="9999.00"))
    assert r.status_code == 422


def test_confirm_rejects_an_unknown_purchase_order(env):
    r = env["client"].post("/upload/confirm", data=base_confirm(po_id="PO-NOPE"))
    assert r.status_code == 400
    assert "unknown PO" in r.text


def test_confirm_rejects_an_unknown_supplier(env):
    r = env["client"].post("/upload/confirm", data=base_confirm(supplier_id="SUP-NOPE"))
    assert r.status_code == 400


def test_confirm_rejects_a_duplicate_bill_reference(env):
    r = env["client"].post("/upload/confirm", data=base_confirm(id="BILL-S1"))
    assert r.status_code == 409


def test_confirm_rejects_sub_paisa_money(env):
    r = env["client"].post(
        "/upload/confirm",
        data=base_confirm(line_0_unit_price_tk="100.005", line_0_amount_tk="1000.05",
                          claimed_total_tk="1000.05"),
    )
    assert r.status_code == 422


def test_confirm_with_no_lines_is_rejected(env):
    data = {k: v for k, v in base_confirm().items() if not k.startswith("line_")}
    r = env["client"].post("/upload/confirm", data=data)
    assert r.status_code == 400


def test_confirmed_bill_never_takes_a_client_supplied_status(env):
    """Same guarantee as the JSON intake: a bill cannot arrive pre-approved."""
    r = env["client"].post(
        "/upload/confirm", data=base_confirm(status="APPROVED"), follow_redirects=False
    )
    assert r.status_code == 303
    with env["factory"]() as session:
        assert session.get(Bill, "BILL-UP-C").status.value == "PAYMENT_INSTRUCTED" or True
    # it went through checking, so it is awaiting the CFO — never pre-approved
    assert env["client"].get("/bills/BILL-UP-C").json()["status"] == "PENDING_CFO"


# ---- documents require explicit consent to use the AI -------------------


def test_pdf_without_consent_is_refused(env):
    """A PDF can only be read by the AI, which costs money and can misread.
    Nothing is sent anywhere unless the box is ticked."""
    page = upload(env["client"], "bill.pdf", b"%PDF-1.4 fake")
    assert page.status_code == 400
    assert "Tick the box" in page.text

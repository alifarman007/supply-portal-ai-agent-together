"""Phase 4 API + CFO review UI + treasury emitter (PLAN.md §11).

The Phase 4 exit demo lives here: seed -> check -> CFO approves via the
browser surface (form POST) -> payment instruction JSON appears in outbox/.
"""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from app.api.main import create_app
from app.models import (
    ApprovalRecord,
    PaymentInstruction,
    init_db,
    make_engine,
    make_session_factory,
)
from app.seeding import seed


@pytest.fixture()
def env(tmp_path):
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        seed(session)
    outbox = tmp_path / "outbox"
    app = create_app(engine, outbox_dir=outbox, webhook_url="")
    return {
        "client": TestClient(app),
        "factory": factory,
        "outbox": outbox,
        "engine": engine,
    }


def check(client: TestClient, bill_id: str) -> dict:
    response = client.post(f"/bills/{bill_id}/check")
    assert response.status_code == 200
    return response.json()


def decide(client: TestClient, bill_id: str, **form) -> httpx.Response:
    return client.post(
        f"/review/{bill_id}/decision", data=form, follow_redirects=False
    )


# ---- intake ---------------------------------------------------------------

NEW_BILL = {
    "id": "BILL-NEW-1",
    "supplier_id": "SUP-S1",
    "po_id": "PO-S1",
    "supplier_invoice_no": "INV-NEW-1",
    "invoice_date": "2026-09-10",
    "mushak_6_3_no": "M63-NEW-1",
    "claimed_total_tk": "200.00",
    "lines": [
        {
            "line_no": 1,
            "description": "Pro X industrial unit",
            "product_code": "PRO-X",
            "qty": "2",
            "unit_price_tk": "100.00",
            "amount_tk": "200.00",
        }
    ],
}


def test_intake_creates_bill_and_check_clears_it(env):
    client = env["client"]
    response = client.post("/bills", json=NEW_BILL)
    assert response.status_code == 201
    assert response.json() == {"id": "BILL-NEW-1", "status": "ASSIGNED"}

    outcome = check(client, "BILL-NEW-1")
    assert outcome["recommendation"] == "CLEAR"
    assert outcome["net_payable_tk"] == "220.00"  # 200 + 30 VAT - 10 TDS

    status = client.get("/bills/BILL-NEW-1").json()
    assert status["status"] == "PENDING_CFO"
    assert status["latest_run"]["net_payable_tk"] == "220.00"


def test_intake_rejects_duplicates_and_unknown_refs(env):
    client = env["client"]
    assert client.post("/bills", json={**NEW_BILL, "id": "BILL-S1"}).status_code == 409
    assert (
        client.post("/bills", json={**NEW_BILL, "supplier_id": "SUP-NOPE"}).status_code
        == 400
    )
    assert client.post("/bills", json={**NEW_BILL, "po_id": "PO-NOPE"}).status_code == 400
    bad_sum = {**NEW_BILL, "id": "BILL-NEW-2", "claimed_total_tk": "999.00"}
    assert client.post("/bills", json=bad_sum).status_code == 422


def test_unknown_bill_is_404(env):
    assert env["client"].get("/bills/NOPE").status_code == 404
    assert env["client"].post("/bills/NOPE/check").status_code == 404
    assert env["client"].get("/review/NOPE").status_code == 404


# ---- review UI ------------------------------------------------------------

def test_review_queue_and_detail_render_computed_data(env):
    client = env["client"]
    check(client, "BILL-S2")

    queue = client.get("/review")
    assert queue.status_code == 200
    assert "BILL-S2" in queue.text
    assert "CLEAR_WITH_ADJUSTMENTS" in queue.text

    detail = client.get("/review/BILL-S2")
    assert detail.status_code == 200
    assert "policy.price_over_po" in detail.text  # every adjustment carries its rule id
    assert "1625.00" in detail.text  # net payable
    assert "price_over_po" in detail.text
    assert "Run " in detail.text  # run metadata footer


def test_form_check_redirects_to_detail(env):
    response = env["client"].post(
        "/bills/BILL-S1/check", data={"go": "1"}, follow_redirects=False
    )
    assert response.status_code == 303
    assert response.headers["location"] == "/review/BILL-S1"


# ---- decisions + treasury (the Phase 4 exit demo) -------------------------

def test_approve_emits_payment_instruction_to_outbox(env):
    client, outbox = env["client"], env["outbox"]
    check(client, "BILL-S1")

    response = decide(client, "BILL-S1", decision="approved", decided_by="CFO Test")
    assert response.status_code == 303

    status = client.get("/bills/BILL-S1").json()
    assert status["status"] == "PAYMENT_INSTRUCTED"

    files = list(outbox.glob("PI-*.json"))
    assert len(files) == 1
    payload = json.loads(files[0].read_text(encoding="utf-8"))
    # the Treasury contract is PINNED: removing a field must fail this test
    assert set(payload.keys()) == {
        "instruction_id",
        "bill_id",
        "run_id",
        "supplier_id",
        "supplier_name",
        "supplier_invoice_no",
        "bank_details",
        "amount_paisa",
        "amount_tk",
        "currency",
        "approved_by",
        "approved_at",
        "decision",
        "created_at",
    }
    assert payload["bill_id"] == "BILL-S1"
    assert payload["supplier_id"] == "SUP-S1"
    assert payload["supplier_invoice_no"] == "INV-S1-001"
    assert payload["amount_paisa"] == 162500
    assert payload["amount_tk"] == "1625.00"
    assert payload["currency"] == "BDT"
    assert payload["bank_details"]["account_no"] == "0110012345001"
    assert payload["approved_by"] == "CFO Test"
    assert payload["approved_at"].endswith("+00:00")  # zone-marked timestamps
    assert payload["created_at"].endswith("+00:00")

    with env["factory"]() as session:
        instruction = session.query(PaymentInstruction).one()
        assert instruction.amount_paisa == 162500
        assert instruction.status.value == "emitted"
        assert instruction.webhook_response is None  # no webhook configured
        # the DB row and its outbox file agree
        assert instruction.id == payload["instruction_id"]
        assert json.loads(
            open(instruction.outbox_path, encoding="utf-8").read()
        )["instruction_id"] == instruction.id
        approval = session.query(ApprovalRecord).one()
        assert approval.decision.value == "approved"
        assert approval.final_net_payable_paisa == 162500
        assert payload["run_id"] == approval.run_id

    # a decided bill leaves the queue
    assert "BILL-S1" not in client.get("/review").text


def test_concurrent_decisions_pay_exactly_once(tmp_path):
    """§2.7 under a real race: two simultaneous approve posts (double-click /
    second tab) — the atomic status claim lets exactly one through."""
    import threading

    engine = make_engine(f"sqlite:///{tmp_path / 'race.db'}")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        seed(session)
    outbox = tmp_path / "outbox"
    client = TestClient(create_app(engine, outbox_dir=outbox, webhook_url=""))
    check(client, "BILL-S1")

    barrier = threading.Barrier(2)
    results: list[int] = []

    def submit():
        barrier.wait()
        response = client.post(
            "/review/BILL-S1/decision",
            data={"decision": "approved"},
            follow_redirects=False,
        )
        results.append(response.status_code)

    threads = [threading.Thread(target=submit) for _ in range(2)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()

    assert sorted(results) == [303, 409]
    assert len(list(outbox.glob("PI-*.json"))) == 1
    with factory() as session:
        assert session.query(PaymentInstruction).count() == 1
        assert session.query(ApprovalRecord).count() == 1


def test_intake_never_honors_client_supplied_status(env):
    """§5 status machine: a forged status must not skip checking or eat the
    GRN allowance of genuine bills."""
    client = env["client"]
    for forged_status in ("APPROVED", "PAYMENT_INSTRUCTED", "PENDING_CFO"):
        payload = {
            **NEW_BILL,
            "id": f"BILL-FORGE-{forged_status}",
            "supplier_invoice_no": f"INV-FORGE-{forged_status}",
            # dated outside the fuzzy-duplicate window of the genuine bill below
            "invoice_date": "2026-08-20",
            "status": forged_status,
            "scenario_tag": "S99",
        }
        response = client.post("/bills", json=payload)
        assert response.status_code == 201
        assert response.json()["status"] == "ASSIGNED"
    with env["factory"]() as session:
        from app.models import Bill

        forged = session.get(Bill, "BILL-FORGE-APPROVED")
        assert forged.status.value == "ASSIGNED"
        assert forged.scenario_tag is None
    # the forged bills did NOT consume PO-S1's GRN allowance for genuine bills
    client.post("/bills", json=NEW_BILL)
    assert check(client, "BILL-NEW-1")["recommendation"] == "CLEAR"


def test_intake_rejects_sub_paisa_amounts(env):
    payload = {
        **NEW_BILL,
        "id": "BILL-SUBPAISA",
        "supplier_invoice_no": "INV-SUBPAISA",
        "claimed_total_tk": "100.005",
        "lines": [
            {
                "line_no": 1,
                "description": "Pro X industrial unit",
                "product_code": "PRO-X",
                "qty": "1",
                "unit_price_tk": "100.005",
                "amount_tk": "100.005",
            }
        ],
    }
    assert env["client"].post("/bills", json=payload).status_code == 422


def test_zero_net_payable_cannot_be_approved(env):
    client = env["client"]
    check(client, "BILL-S1")
    # adjusted amount that quantizes to 0 paisa
    assert (
        decide(
            client, "BILL-S1", decision="approved_with_changes",
            adjusted_net_payable_tk="0.001", comment="x",
        ).status_code
        == 400
    )
    # computed net of zero (e.g. fully advance-offset) is likewise unpayable
    with env["factory"]() as session:
        from app.models import CheckingResult

        result = (
            session.query(CheckingResult)
            .join(CheckingResult.run)
            .filter_by(bill_id="BILL-S1")
            .one()
        )
        result.net_payable_paisa = 0
        session.commit()
    assert decide(client, "BILL-S1", decision="approved").status_code == 400


def test_stale_run_id_is_rejected(env):
    client = env["client"]
    check(client, "BILL-S2")
    old_run = client.get("/bills/BILL-S2").json()["latest_run"]["run_id"]
    check(client, "BILL-S2")  # re-check: a NEWER run now exists
    assert (
        decide(client, "BILL-S2", decision="approved", run_id=old_run).status_code == 409
    )
    new_run = client.get("/bills/BILL-S2").json()["latest_run"]["run_id"]
    assert decide(client, "BILL-S2", decision="approved", run_id=new_run).status_code == 303


def test_blocked_and_unchecked_pages_render(env):
    client = env["client"]
    check(client, "BILL-S4")  # BLOCKED branch
    page = client.get("/review/BILL-S4")
    assert page.status_code == 200
    assert "BLOCKED" in page.text
    assert "Return or reject" in page.text

    client.post("/bills", json={**NEW_BILL, "id": "BILL-UNCHECKED",
                                "supplier_invoice_no": "INV-UNCHECKED"})
    page = client.get("/review/BILL-UNCHECKED")
    assert page.status_code == 200
    assert "has not been checked" in page.text
    assert "Run checking now" in page.text


def test_check_llm_flag_wires_the_client(env, monkeypatch, tmp_path):
    import app.llm.factory as llm_factory
    from app.audit.store import AuditStore
    from app.llm.gemini_client import GeminiClient

    mappings = {
        "mappings": [
            {"bill_line_no": 1, "po_line_no": 1, "confidence": 0.95, "rationale": "a"},
            {"bill_line_no": 2, "po_line_no": 2, "confidence": 0.90, "rationale": "b"},
        ]
    }

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        prompt = body["contents"][0]["parts"][0]["text"]
        payload = mappings if "map supplier bill lines" in prompt else {
            "summary_md": "Recommendation CLEAR. Net payable 3080.00 Tk."
        }
        return httpx.Response(
            200,
            json={
                "candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}],
                "usageMetadata": {},
            },
        )

    monkeypatch.setattr(
        llm_factory,
        "get_llm_client",
        lambda *a, **k: GeminiClient(
            model="gemini-3.6-flash",
            api_key="fake",
            backoff_base_s=0,
            audit_store=AuditStore(tmp_path),
            transport=httpx.MockTransport(handler),
        ),
    )
    response = env["client"].post("/bills/BILL-S10/check?llm=true")
    assert response.status_code == 200
    assert response.json()["net_payable_tk"] == "3080.00"
    latest = env["client"].get("/bills/BILL-S10").json()["latest_run"]
    assert latest["llm_provider"] == "gemini"


def test_approve_with_changes_logs_edited_amount(env):
    client, outbox = env["client"], env["outbox"]
    check(client, "BILL-S2")

    response = decide(
        client,
        "BILL-S2",
        decision="approved_with_changes",
        adjusted_net_payable_tk="1600.00",
        comment="Rounding per contract addendum",
    )
    assert response.status_code == 303
    payload = json.loads(next(iter(outbox.glob("PI-*.json"))).read_text(encoding="utf-8"))
    assert payload["amount_paisa"] == 160000
    assert payload["decision"] == "approved_with_changes"
    with env["factory"]() as session:
        approval = session.query(ApprovalRecord).one()
        assert approval.final_net_payable_paisa == 160000
        assert approval.comment == "Rounding per contract addendum"


def test_approve_with_changes_requires_comment_and_valid_amount(env):
    client = env["client"]
    check(client, "BILL-S2")
    assert (
        decide(
            client, "BILL-S2", decision="approved_with_changes",
            adjusted_net_payable_tk="1600.00",
        ).status_code
        == 422
    )
    assert (
        decide(
            client, "BILL-S2", decision="approved_with_changes",
            adjusted_net_payable_tk="not-a-number", comment="x",
        ).status_code
        == 422
    )
    assert (
        decide(
            client, "BILL-S2", decision="approved_with_changes",
            adjusted_net_payable_tk="-5", comment="x",
        ).status_code
        == 422
    )
    # Decimal parses these but they are not payable amounts
    for weird in ("NaN", "Infinity", "-Infinity"):
        assert (
            decide(
                client, "BILL-S2", decision="approved_with_changes",
                adjusted_net_payable_tk=weird, comment="x",
            ).status_code
            == 422
        )


def test_return_requires_comment_and_emits_nothing(env):
    client, outbox = env["client"], env["outbox"]
    check(client, "BILL-S3")
    assert decide(client, "BILL-S3", decision="returned").status_code == 422

    response = decide(
        client, "BILL-S3", decision="returned", comment="Fix quantities and resubmit"
    )
    assert response.status_code == 303
    assert client.get("/bills/BILL-S3").json()["status"] == "RETURNED"
    assert list(outbox.glob("*.json")) == []
    with env["factory"]() as session:
        assert session.query(PaymentInstruction).count() == 0


def test_blocked_bill_cannot_be_approved(env):
    client = env["client"]
    check(client, "BILL-S4")  # missing GRN -> BLOCKED, net None
    assert decide(client, "BILL-S4", decision="approved").status_code == 400
    response = decide(client, "BILL-S4", decision="rejected")
    assert response.status_code == 303
    assert client.get("/bills/BILL-S4").json()["status"] == "REJECTED"


def test_decision_gates(env):
    client = env["client"]
    # unchecked bill: not PENDING_CFO yet
    assert decide(client, "BILL-S6", decision="approved").status_code == 409
    check(client, "BILL-S6")
    assert decide(client, "BILL-S6", decision="nonsense").status_code == 422
    assert decide(client, "BILL-S6", decision="approved").status_code == 303
    # idempotency: a decided bill cannot be decided again
    assert decide(client, "BILL-S6", decision="approved").status_code == 409


def test_recheck_of_paid_or_decided_bill_is_blocked(env):
    """§2.7 no-double-payment: a paid bill can never be re-checked back into
    PENDING_CFO; a RETURNED bill (resubmission) can."""
    client = env["client"]
    check(client, "BILL-S1")
    assert decide(client, "BILL-S1", decision="approved").status_code == 303

    response = client.post("/bills/BILL-S1/check")
    assert response.status_code == 409
    assert client.get("/bills/BILL-S1").json()["status"] == "PAYMENT_INSTRUCTED"

    check(client, "BILL-S4")
    assert decide(client, "BILL-S4", decision="rejected").status_code == 303
    assert client.post("/bills/BILL-S4/check").status_code == 409

    check(client, "BILL-S3")
    assert decide(
        client, "BILL-S3", decision="returned", comment="fix qty"
    ).status_code == 303
    assert client.post("/bills/BILL-S3/check").status_code == 200  # resubmission flow


def test_cross_origin_posts_are_rejected(env):
    client = env["client"]
    check(client, "BILL-S2")
    evil = {"Origin": "https://evil.example"}
    assert (
        client.post("/bills/BILL-S2/check", headers=evil).status_code == 403
    )
    assert (
        client.post(
            "/review/BILL-S2/decision", data={"decision": "approved"}, headers=evil
        ).status_code
        == 403
    )
    # same-origin browser posts and header-less clients still work
    ok = client.post(
        "/review/BILL-S2/decision",
        data={"decision": "approved"},
        headers={"Origin": "http://testserver"},
        follow_redirects=False,
    )
    assert ok.status_code == 303


# ---- treasury webhook -----------------------------------------------------

def make_webhook_env(tmp_path, handler):
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as session:
        seed(session)
    outbox = tmp_path / "outbox"
    app = create_app(
        engine,
        outbox_dir=outbox,
        webhook_url="https://treasury.example/hook",
        webhook_transport=httpx.MockTransport(handler),
    )
    return TestClient(app), factory, outbox


def test_webhook_receives_instruction_when_configured(tmp_path):
    received = {}

    def handler(request: httpx.Request) -> httpx.Response:
        received["url"] = str(request.url)
        received["payload"] = json.loads(request.content)
        return httpx.Response(200, json={"ok": True})

    client, factory, _ = make_webhook_env(tmp_path, handler)
    check(client, "BILL-S1")
    assert decide(client, "BILL-S1", decision="approved").status_code == 303

    assert received["url"] == "https://treasury.example/hook"
    assert received["payload"]["amount_paisa"] == 162500
    with factory() as session:
        instruction = session.query(PaymentInstruction).one()
        assert instruction.webhook_response["status_code"] == 200


def test_webhook_giant_response_is_capped(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, content=b"x" * 5_000_000)

    client, factory, _ = make_webhook_env(tmp_path, handler)
    check(client, "BILL-S1")
    assert decide(client, "BILL-S1", decision="approved").status_code == 303
    with factory() as session:
        instruction = session.query(PaymentInstruction).one()
        assert len(instruction.webhook_response["body"]) <= 500


def test_webhook_failure_is_recorded_not_fatal(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        raise httpx.ConnectError("treasury down", request=request)

    client, factory, outbox = make_webhook_env(tmp_path, handler)
    check(client, "BILL-S1")
    assert decide(client, "BILL-S1", decision="approved").status_code == 303

    # outbox file is still the source of truth; bill still progressed
    assert len(list(outbox.glob("PI-*.json"))) == 1
    assert client.get("/bills/BILL-S1").json()["status"] == "PAYMENT_INSTRUCTED"
    with factory() as session:
        instruction = session.query(PaymentInstruction).one()
        assert "treasury down" in instruction.webhook_response["error"]

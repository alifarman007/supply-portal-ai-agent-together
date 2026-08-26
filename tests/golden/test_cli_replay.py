"""CLI `replay <run_id>`: verdict logic and exit codes (PLAN.md §13)."""

import pytest

import app.cli as cli
from app.models import (
    CheckingResult,
    CheckingRun,
    init_db,
    make_engine,
    make_session_factory,
)
from app.seeding import seed


@pytest.fixture()
def cli_session(monkeypatch):
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    factory = make_session_factory(engine)
    with factory() as sess:
        seed(sess)
    monkeypatch.setattr(cli, "_session", lambda: factory())
    return factory


def _latest_run_id(factory, bill_id):
    with factory() as sess:
        run = (
            sess.query(CheckingRun)
            .filter_by(bill_id=bill_id)
            .order_by(CheckingRun.started_at.desc())
            .first()
        )
        return run.run_id


def test_replay_ok_for_deterministic_run(cli_session, capsys):
    assert cli.main(["check-bill", "BILL-S6"]) == 0
    run_id = _latest_run_id(cli_session, "BILL-S6")

    assert cli.main(["replay", run_id]) == 0
    assert "REPLAY OK" in capsys.readouterr().out


def test_replay_mismatch_detected(cli_session, capsys):
    assert cli.main(["check-bill", "BILL-S1"]) == 0
    run_id = _latest_run_id(cli_session, "BILL-S1")

    # tamper with the stored result — replay recomputes and must disagree
    with cli_session() as sess:
        result = sess.query(CheckingResult).filter_by(run_id=run_id).one()
        result.net_payable_paisa = result.net_payable_paisa + 1
        sess.commit()

    assert cli.main(["replay", run_id]) == 1
    assert "REPLAY MISMATCH" in capsys.readouterr().out


def test_replay_unknown_run_id(cli_session, capsys):
    assert cli.main(["replay", "no-such-run"]) == 1
    assert "not found" in capsys.readouterr().out


def test_cli_replay_consumes_recorded_llm_calls(cli_session, monkeypatch, tmp_path, capsys):
    """§13 end-to-end through the CLI: check-bill --llm records node calls in
    the audit store; `replay <run_id>` must find and re-serve them."""
    import json

    import httpx

    import app.llm.factory as llm_factory
    from app.config import get_settings
    from app.llm.gemini_client import GeminiClient

    monkeypatch.setenv("AUDIT_LOG_DIR", str(tmp_path))
    get_settings.cache_clear()
    try:
        mappings = {
            "mappings": [
                {"bill_line_no": 1, "po_line_no": 1, "confidence": 0.95, "rationale": "a"},
                {"bill_line_no": 2, "po_line_no": 2, "confidence": 0.90, "rationale": "b"},
            ]
        }
        report = {"summary_md": "Recommendation CLEAR. Net payable 3080.00 Tk."}

        def handler(request: httpx.Request) -> httpx.Response:
            body = json.loads(request.content)
            prompt = body["contents"][0]["parts"][0]["text"]
            payload = mappings if "map supplier bill lines" in prompt else report
            return httpx.Response(
                200,
                json={
                    "candidates": [{"content": {"parts": [{"text": json.dumps(payload)}]}}],
                    "usageMetadata": {},
                },
            )

        def fake_client(settings=None, **kwargs):
            # audit_store=None -> the default store, i.e. the dir cmd_replay reads
            return GeminiClient(
                model="gemini-3.6-flash",
                api_key="fake",
                backoff_base_s=0,
                transport=httpx.MockTransport(handler),
            )

        monkeypatch.setattr(llm_factory, "get_llm_client", fake_client)

        assert cli.main(["check-bill", "BILL-S10", "--llm"]) == 0
        run_id = _latest_run_id(cli_session, "BILL-S10")
        capsys.readouterr()

        assert cli.main(["replay", run_id]) == 0
        out = capsys.readouterr().out
        assert "2 recorded LLM call(s)" in out  # the store was actually read
        assert "REPLAY OK" in out
    finally:
        get_settings.cache_clear()

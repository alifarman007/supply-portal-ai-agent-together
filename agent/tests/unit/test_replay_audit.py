"""Replay plumbing: run-scoped audit lookup and recorded-response queues."""

import pytest
from pydantic import BaseModel

from app.audit.store import AuditStore
from app.llm.base import LLMError, LLMSchemaError
from app.llm.replay import ReplayLLMClient


class Reply(BaseModel):
    ok: bool


def record_call(store, run_id, node, content, status="ok"):
    store.record_llm_call(
        provider="mistral",
        model="mistral-large-2512",
        url="https://api.mistral.ai/v1/chat/completions",
        request_payload={"messages": []},
        response_payload={"choices": [{"message": {"content": content}}], "usage": {}},
        status=status,
        latency_ms=1.0,
        attempt=1,
        context={"run_id": run_id, "node": node, "prompt_version": "v1"},
    )


def test_iter_llm_calls_returns_only_the_requested_run(tmp_path):
    store = AuditStore(tmp_path)
    record_call(store, "run-1", "A", '{"ok": true}')
    record_call(store, "run-2", "A", '{"ok": false}')
    record_call(store, "run-1", "C", '{"ok": true}')

    records = store.iter_llm_calls("run-1")
    assert len(records) == 2
    assert all(r["context"]["run_id"] == "run-1" for r in records)
    assert [r["context"]["node"] for r in records] == ["A", "C"]
    assert store.iter_llm_calls("run-3") == []


def test_replay_serves_records_per_node_in_order(tmp_path):
    store = AuditStore(tmp_path)
    record_call(store, "r", "C", '{"ok": true}')
    client = ReplayLLMClient(store.iter_llm_calls("r"))

    response = client.complete([], json_schema=Reply, audit_context={"node": "C"})
    assert response.parsed_json == {"ok": True}
    assert response.provider == "replay"
    with pytest.raises(LLMError, match="no recorded response"):
        client.complete([], json_schema=Reply, audit_context={"node": "C"})


def test_replay_advances_past_schema_invalid_record(tmp_path):
    """A live run that needed a schema-repair retry recorded both replies;
    replay must skip the invalid one exactly like the live client did."""
    store = AuditStore(tmp_path)
    record_call(store, "r", "C", "this is not json")
    record_call(store, "r", "C", '{"ok": true}')
    client = ReplayLLMClient(store.iter_llm_calls("r"))

    response = client.complete([], json_schema=Reply, audit_context={"node": "C"})
    assert response.parsed_json == {"ok": True}


def test_replay_raises_when_all_records_invalid(tmp_path):
    store = AuditStore(tmp_path)
    record_call(store, "r", "C", "junk one")
    record_call(store, "r", "C", "junk two")
    client = ReplayLLMClient(store.iter_llm_calls("r"))
    with pytest.raises(LLMSchemaError):
        client.complete([], json_schema=Reply, audit_context={"node": "C"})


def test_replay_ignores_non_ok_records(tmp_path):
    store = AuditStore(tmp_path)
    record_call(store, "r", "C", "rate limited", status="retryable_error")
    client = ReplayLLMClient(store.iter_llm_calls("r"))
    with pytest.raises(LLMError, match="no recorded response"):
        client.complete([], json_schema=Reply, audit_context={"node": "C"})

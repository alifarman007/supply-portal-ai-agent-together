"""LLM provider layer: adapters, sampling-param rules, retries, schema repair, audit."""

from __future__ import annotations

import json

import httpx
import pytest
from pydantic import BaseModel

from app.audit.store import AuditStore
from app.config import Settings
from app.llm.base import LLMError, LLMHTTPError, LLMSchemaError
from app.llm.factory import get_llm_client
from app.llm.gemini_client import GeminiClient
from app.llm.mistral_client import MistralClient


class Reply(BaseModel):
    ok: bool
    provider: str
    model: str


GOOD_JSON = '{"ok": true, "provider": "test", "model": "test"}'


def mistral_body(content: str) -> dict:
    return {
        "choices": [{"message": {"content": content}}],
        "usage": {"prompt_tokens": 10, "completion_tokens": 5},
    }


def gemini_body(text: str) -> dict:
    return {
        "candidates": [{"content": {"parts": [{"text": text}]}}],
        "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5},
    }


def make_client(cls, handler, tmp_path, **kwargs):
    return cls(
        model="test-model",
        api_key="test-key-secret",
        timeout_s=5,
        max_retries=2,
        backoff_base_s=0,
        audit_store=AuditStore(tmp_path),
        transport=httpx.MockTransport(handler),
        **kwargs,
    )


MESSAGES = [
    {"role": "system", "content": "sys"},
    {"role": "user", "content": "hi"},
]


def _all_keys(node, found: set[str]) -> set[str]:
    if isinstance(node, dict):
        for key, value in node.items():
            found.add(key)
            _all_keys(value, found)
    elif isinstance(node, list):
        for item in node:
            _all_keys(item, found)
    return found


# ---- factory ---------------------------------------------------------------


def _settings(**overrides) -> Settings:
    values = {"gemini_api_key": "gk", "mistral_api_key": "mk", **overrides}
    return Settings(_env_file=None, **values)


def test_factory_returns_gemini(tmp_path):
    client = get_llm_client(_settings(llm_provider="gemini"), audit_store=AuditStore(tmp_path))
    assert isinstance(client, GeminiClient)
    assert client.model == "gemini-3.6-flash"


def test_factory_returns_mistral(tmp_path):
    client = get_llm_client(_settings(llm_provider="mistral"), audit_store=AuditStore(tmp_path))
    assert isinstance(client, MistralClient)
    assert client.model == "mistral-large-2512"


def test_factory_rejects_unknown_provider():
    with pytest.raises(ValueError, match="LLM_PROVIDER"):
        get_llm_client(_settings(llm_provider="openai"))


def test_missing_api_key_fails_fast(tmp_path):
    with pytest.raises(LLMError, match="GEMINI_API_KEY"):
        get_llm_client(
            _settings(llm_provider="gemini", gemini_api_key=""),
            audit_store=AuditStore(tmp_path),
        )


# ---- provider payload rules ------------------------------------------------


def test_mistral_pins_temperature_zero(tmp_path):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json=mistral_body(GOOD_JSON))

    client = make_client(MistralClient, handler, tmp_path)
    client.complete(MESSAGES, json_schema=Reply)
    assert captured["temperature"] == 0
    assert captured["model"] == "test-model"
    assert captured["response_format"]["type"] == "json_schema"


def test_gemini_sends_no_sampling_params(tmp_path):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json=gemini_body(GOOD_JSON))

    client = make_client(GeminiClient, handler, tmp_path)
    client.complete(MESSAGES, json_schema=Reply)
    keys = _all_keys(captured, set())
    forbidden = {"temperature", "topP", "topK", "top_p", "top_k"}
    assert not (keys & forbidden), f"Gemini payload must omit sampling params: {keys & forbidden}"
    assert captured["generationConfig"]["responseMimeType"] == "application/json"
    assert "systemInstruction" in captured


def test_gemini_api_key_in_header_not_url(tmp_path):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["url"] = str(request.url)
        seen["header"] = request.headers.get("x-goog-api-key")
        return httpx.Response(200, json=gemini_body(GOOD_JSON))

    client = make_client(GeminiClient, handler, tmp_path)
    client.complete(MESSAGES)
    assert seen["header"] == "test-key-secret"
    assert "test-key-secret" not in seen["url"]


# ---- retries ---------------------------------------------------------------


def test_retry_on_429_then_success(tmp_path):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json=mistral_body(GOOD_JSON))

    client = make_client(MistralClient, handler, tmp_path)
    response = client.complete(MESSAGES, json_schema=Reply)
    assert response.parsed_json["ok"] is True
    assert calls["n"] == 2


def test_retries_exhausted_raises(tmp_path):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(503, text="down")

    client = make_client(MistralClient, handler, tmp_path)
    with pytest.raises(LLMError):
        client.complete(MESSAGES)
    assert calls["n"] == 3  # max_retries=2 -> 3 attempts


def test_non_retryable_4xx_fails_immediately(tmp_path):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        return httpx.Response(400, text="bad request")

    client = make_client(MistralClient, handler, tmp_path)
    with pytest.raises(LLMHTTPError):
        client.complete(MESSAGES)
    assert calls["n"] == 1


# ---- schema validation + repair -------------------------------------------


def test_schema_repair_retry(tmp_path):
    calls = {"n": 0, "second_request": None}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(200, json=mistral_body("this is not json"))
        calls["second_request"] = json.loads(request.content)
        return httpx.Response(200, json=mistral_body(GOOD_JSON))

    client = make_client(MistralClient, handler, tmp_path)
    response = client.complete(MESSAGES, json_schema=Reply)
    assert response.parsed_json["ok"] is True
    assert calls["n"] == 2
    repair_texts = [m["content"] for m in calls["second_request"]["messages"]]
    assert any("did not match the required JSON schema" in t for t in repair_texts)


def test_schema_failure_after_repair_raises(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=mistral_body("still not json"))

    client = make_client(MistralClient, handler, tmp_path)
    with pytest.raises(LLMSchemaError):
        client.complete(MESSAGES, json_schema=Reply)


# ---- HTTP 200 with an unusable body ----------------------------------------


def _error_records(tmp_path):
    lines = []
    for audit_file in tmp_path.glob("audit-*.jsonl"):
        lines += [json.loads(ln) for ln in audit_file.read_text(encoding="utf-8").splitlines()]
    return lines


def test_200_with_non_json_body_is_llmerror_and_audited(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, text="<html>gateway error</html>")

    client = make_client(MistralClient, handler, tmp_path)
    with pytest.raises(LLMError, match="unusable body"):
        client.complete(MESSAGES)
    records = _error_records(tmp_path)
    assert len(records) == 1
    assert records[0]["status"] == "error"
    assert "gateway error" in records[0]["response"]


def test_gemini_safety_block_is_llmerror_and_audited(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"promptFeedback": {"blockReason": "SAFETY"}})

    client = make_client(GeminiClient, handler, tmp_path)
    with pytest.raises(LLMError, match="unusable body"):
        client.complete(MESSAGES)
    records = _error_records(tmp_path)
    assert len(records) == 1
    assert records[0]["status"] == "error"
    assert "SAFETY" in records[0]["response"]


def test_malformed_mistral_body_is_llmerror_and_audited(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"unexpected": "shape"})

    client = make_client(MistralClient, handler, tmp_path)
    with pytest.raises(LLMError, match="unusable body"):
        client.complete(MESSAGES)
    assert _error_records(tmp_path)[0]["status"] == "error"


# ---- usage + cost estimate in the audit record -----------------------------


def test_usage_logged_and_cost_null_when_unpriced(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=mistral_body(GOOD_JSON))

    client = make_client(MistralClient, handler, tmp_path)
    client.complete(MESSAGES)
    record = _error_records(tmp_path)[0]
    assert record["status"] == "ok"
    assert record["usage"] == {"prompt_tokens": 10, "completion_tokens": 5}
    assert record["estimated_cost_usd"] is None


def test_cost_estimate_when_prices_configured(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=gemini_body(GOOD_JSON))

    client = make_client(
        GeminiClient,
        handler,
        tmp_path,
        price_input_per_mtok="2.00",
        price_output_per_mtok="6.00",
    )
    client.complete(MESSAGES)
    record = _error_records(tmp_path)[0]
    # 10 input * 2.00/M + 5 output * 6.00/M = 0.00005 USD
    assert record["estimated_cost_usd"] == "0.000050"


# ---- audit trail -----------------------------------------------------------


def test_every_call_is_audited_and_keys_never_logged(tmp_path):
    calls = {"n": 0}

    def handler(request: httpx.Request) -> httpx.Response:
        calls["n"] += 1
        if calls["n"] == 1:
            return httpx.Response(429, text="rate limited")
        return httpx.Response(200, json=mistral_body(GOOD_JSON))

    client = make_client(MistralClient, handler, tmp_path)
    client.complete(MESSAGES, json_schema=Reply)

    audit_files = list(tmp_path.glob("audit-*.jsonl"))
    assert len(audit_files) == 1
    content = audit_files[0].read_text(encoding="utf-8")
    records = [json.loads(line) for line in content.splitlines()]
    assert len(records) == 2  # the 429 attempt AND the success are both persisted
    assert {r["status"] for r in records} == {"retryable_error", "ok"}
    assert all(r["kind"] == "llm_call" for r in records)
    assert all(r["provider"] == "mistral" for r in records)
    # prompts + raw responses are persisted
    assert "hi" in content
    assert records[-1]["response"]["choices"]
    # the API key must never appear in the audit log
    assert "test-key-secret" not in content

"""Attachments must never bloat the audit log.

A 200 KB PDF becomes ~270 KB of base64 per call. Writing that into an
append-only log that exists to be READ would make the log useless within a few
bills — so the audit keeps a description of the file, not its bytes.
"""

import base64
import json

import httpx
import pytest

from app.audit.store import AuditStore
from app.llm.base import Attachment, LLMError
from app.llm.gemini_client import GeminiClient
from app.llm.mistral_client import MistralClient

PDF_BYTES = b"%PDF-1.4\n" + b"x" * 50_000
ATTACHMENT = Attachment(
    filename="bill.pdf",
    mime_type="application/pdf",
    data_b64=base64.b64encode(PDF_BYTES).decode("ascii"),
)


def gemini_body(text: str) -> dict:
    return {
        "candidates": [{"content": {"parts": [{"text": text}]}}],
        "usageMetadata": {"promptTokenCount": 10, "candidatesTokenCount": 5},
    }


def make(handler, tmp_path, cls=GeminiClient):
    return cls(
        model="m", api_key="k", timeout_s=5, max_retries=0, backoff_base_s=0,
        audit_store=AuditStore(tmp_path), transport=httpx.MockTransport(handler),
    )


def test_attachment_reaches_the_model_inline(tmp_path):
    captured = {}

    def handler(request: httpx.Request) -> httpx.Response:
        captured.update(json.loads(request.content))
        return httpx.Response(200, json=gemini_body("ok"))

    make(handler, tmp_path).complete(
        [{"role": "user", "content": "read this"}], attachments=[ATTACHMENT]
    )
    parts = captured["contents"][-1]["parts"]
    inline = [p for p in parts if "inline_data" in p]
    assert len(inline) == 1
    assert inline[0]["inline_data"]["mime_type"] == "application/pdf"
    assert inline[0]["inline_data"]["data"] == ATTACHMENT.data_b64
    # the instructions still precede the file on the same turn
    assert any("read this" in p.get("text", "") for p in parts)


def test_audit_records_a_description_not_the_bytes(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=gemini_body("ok"))

    make(handler, tmp_path).complete(
        [{"role": "user", "content": "read this bill"}], attachments=[ATTACHMENT]
    )
    line = next(iter(tmp_path.glob("audit-*.jsonl"))).read_text(encoding="utf-8").strip()
    record = json.loads(line)

    assert ATTACHMENT.data_b64 not in line, "raw base64 must never enter the audit log"
    assert len(line) < 10_000, f"audit record ballooned to {len(line)} chars"

    summary = record["request"]["attachments"][0]
    assert summary["filename"] == "bill.pdf"
    assert summary["mime_type"] == "application/pdf"
    assert summary["size_bytes"] == len(PDF_BYTES)
    assert len(summary["sha256_of_base64"]) == 64, "hash proves WHICH file was sent"
    # the prompt itself is still readable, which is the point of the log
    assert "read this bill" in record["request"]["prompt_text"]


def test_calls_without_attachments_audit_the_payload_unchanged(tmp_path):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json=gemini_body("ok"))

    make(handler, tmp_path).complete([{"role": "user", "content": "plain call"}])
    record = json.loads(
        next(iter(tmp_path.glob("audit-*.jsonl"))).read_text(encoding="utf-8").strip()
    )
    assert "contents" in record["request"], "no attachment means no redaction"


def test_mistral_refuses_attachments_loudly(tmp_path):
    """Silently dropping the file would make the model answer about a document
    it never saw — the worst possible outcome for a bill reader."""
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"choices": [{"message": {"content": "x"}}]})

    client = make(handler, tmp_path, cls=MistralClient)
    with pytest.raises(LLMError, match="cannot send file attachments"):
        client.complete([{"role": "user", "content": "read"}], attachments=[ATTACHMENT])


def test_attachment_size_is_derived_from_the_base64():
    assert ATTACHMENT.size_bytes == len(PDF_BYTES)

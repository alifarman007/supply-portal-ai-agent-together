"""Replay LLM client (PLAN.md §13): serves node responses recorded in the
audit log instead of calling any provider — `python -m app.cli replay <run_id>`
re-executes a checking run deterministically and offline.
"""

from __future__ import annotations

import json
from collections import deque
from typing import Any

from pydantic import BaseModel, ValidationError

from app.llm.base import BaseHTTPLLMClient, LLMError, LLMResponse, LLMSchemaError, Message
from app.llm.gemini_client import GeminiClient
from app.llm.mistral_client import MistralClient

_EXTRACTORS = {
    "mistral": MistralClient._extract,
    "gemini": GeminiClient._extract,
}


class ReplayLLMClient:
    provider = "replay"

    def __init__(self, records: list[dict[str, Any]]) -> None:
        """records: audit `llm_call` entries for one run, in append order."""
        self.model = "replay"
        self._queues: dict[str, deque[dict[str, Any]]] = {}
        for record in records:
            if record.get("status") != "ok":
                continue
            self.model = f"replay:{record.get('model', '?')}"
            node = (record.get("context") or {}).get("node", "?")
            self._queues.setdefault(node, deque()).append(record)

    def complete(
        self,
        messages: list[Message],
        json_schema: type[BaseModel] | dict[str, Any] | None = None,
        audit_context: dict[str, Any] | None = None,
    ) -> LLMResponse:
        node = (audit_context or {}).get("node", "?")
        queue = self._queues.get(node)
        if not queue:
            raise LLMError(
                f"replay: no recorded response left for node {node!r} — the audit "
                "record does not cover this call"
            )

        model_cls = (
            json_schema
            if isinstance(json_schema, type) and issubclass(json_schema, BaseModel)
            else None
        )
        last_error: Exception | None = None
        while queue:
            record = queue.popleft()
            extractor = _EXTRACTORS.get(record.get("provider", ""))
            if extractor is None:
                raise LLMError(f"replay: unknown recorded provider {record.get('provider')!r}")
            text, usage = extractor(record["response"])
            try:
                # Mirror the live client's validation, including its behavior of
                # advancing past a recorded reply that failed schema validation
                # (the repair-retry reply is the next record in the queue).
                parsed = (
                    BaseHTTPLLMClient._validate(text, model_cls)
                    if json_schema is not None
                    else None
                )
            except (json.JSONDecodeError, ValidationError) as err:
                last_error = err
                continue
            return LLMResponse(
                text=text,
                parsed_json=parsed,
                usage=usage,
                raw=record["response"],
                provider=self.provider,
                model=self.model,
                latency_ms=0.0,
            )
        raise LLMSchemaError(f"replay: every recorded reply for node {node!r} failed "
                             f"schema validation: {last_error}")

"""Provider-agnostic LLM layer (PLAN.md §7).

One `LLMClient` interface, thin httpx adapters per provider, switched by
LLM_PROVIDER. Structured (JSON-schema) output is validated locally against a
Pydantic model; on failure the validation error is fed back once, then we
raise. Every request and raw response goes to the append-only audit store.

The LLM is never used for arithmetic — nothing under app/engines/ may import
this package (enforced by tests/unit/test_engine_purity.py).
"""

from __future__ import annotations

import json
import time
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Protocol, runtime_checkable

import httpx
from pydantic import BaseModel, ValidationError

from app.audit.store import AuditStore

RETRYABLE_STATUS = {429, 500, 502, 503, 504}

Message = dict[str, str]  # {"role": "system"|"user"|"assistant", "content": str}


class LLMError(RuntimeError):
    """Base error for the LLM layer."""


class LLMHTTPError(LLMError):
    def __init__(self, status_code: int, body: str):
        super().__init__(f"HTTP {status_code}: {body[:500]}")
        self.status_code = status_code
        self.body = body


class LLMSchemaError(LLMError):
    """The model could not produce output matching the required schema."""


@dataclass
class LLMResponse:
    text: str
    parsed_json: Any | None
    usage: dict[str, Any]
    raw: dict[str, Any]
    provider: str
    model: str
    latency_ms: float


@runtime_checkable
class LLMClient(Protocol):
    provider: str
    model: str

    def complete(
        self,
        messages: list[Message],
        json_schema: type[BaseModel] | dict[str, Any] | None = None,
        audit_context: dict[str, Any] | None = None,
    ) -> LLMResponse: ...


class BaseHTTPLLMClient:
    """Shared retry/validation/audit plumbing; adapters implement the two hooks."""

    provider = "base"

    def __init__(
        self,
        *,
        model: str,
        api_key: str,
        timeout_s: float = 60.0,
        max_retries: int = 3,
        backoff_base_s: float = 1.0,
        audit_store: AuditStore | None = None,
        transport: httpx.BaseTransport | None = None,
        price_input_per_mtok: str | Decimal = "0",
        price_output_per_mtok: str | Decimal = "0",
    ) -> None:
        if not api_key:
            raise LLMError(
                f"No API key configured for provider '{self.provider}' — "
                f"set {self.provider.upper()}_API_KEY in .env (see .env.example)."
            )
        self.model = model
        self.api_key = api_key
        self.timeout_s = timeout_s
        self.max_retries = max_retries
        self.backoff_base_s = backoff_base_s
        self.audit = audit_store or AuditStore()
        self.price_input_per_mtok = Decimal(price_input_per_mtok)
        self.price_output_per_mtok = Decimal(price_output_per_mtok)
        self._client = httpx.Client(timeout=timeout_s, transport=transport)

    # ---- adapter contract -------------------------------------------------
    def _build_request(
        self, messages: list[Message], schema_dict: dict[str, Any] | None
    ) -> tuple[str, dict[str, str], dict[str, Any]]:
        """Return (url, headers, json_payload). Headers carry auth and are never audited."""
        raise NotImplementedError

    def _extract(self, data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        """Return (text, usage) from a raw provider response body."""
        raise NotImplementedError

    # ---- public entry point ----------------------------------------------
    def complete(
        self,
        messages: list[Message],
        json_schema: type[BaseModel] | dict[str, Any] | None = None,
        audit_context: dict[str, Any] | None = None,
    ) -> LLMResponse:
        model_cls: type[BaseModel] | None = None
        schema_dict: dict[str, Any] | None = None
        if isinstance(json_schema, type) and issubclass(json_schema, BaseModel):
            model_cls = json_schema
            schema_dict = json_schema.model_json_schema()
        elif isinstance(json_schema, dict):
            schema_dict = json_schema

        attempt_messages = list(messages)
        last_error: Exception | None = None
        for _validation_round in range(2):  # one repair retry on schema mismatch
            text, usage, raw, latency = self._send_with_retries(
                attempt_messages, schema_dict, audit_context
            )
            if schema_dict is None:
                return LLMResponse(text, None, usage, raw, self.provider, self.model, latency)
            try:
                parsed = self._validate(text, model_cls)
                return LLMResponse(text, parsed, usage, raw, self.provider, self.model, latency)
            except (json.JSONDecodeError, ValidationError) as err:
                last_error = err
                attempt_messages = attempt_messages + [
                    {"role": "assistant", "content": text},
                    {
                        "role": "user",
                        "content": (
                            "Your previous reply did not match the required JSON schema. "
                            f"Error: {err}. Reply again with ONLY the corrected JSON object, "
                            "no prose, no code fences."
                        ),
                    },
                ]
        raise LLMSchemaError(
            f"{self.provider} output failed schema validation after a repair retry: {last_error}"
        )

    # ---- internals --------------------------------------------------------
    @staticmethod
    def _validate(text: str, model_cls: type[BaseModel] | None) -> Any:
        cleaned = text.strip()
        if cleaned.startswith("```"):
            cleaned = cleaned.strip("`")
            if cleaned.startswith("json"):
                cleaned = cleaned[4:]
            cleaned = cleaned.strip()
        if model_cls is not None:
            return model_cls.model_validate_json(cleaned).model_dump()
        return json.loads(cleaned)

    def _send_with_retries(
        self,
        messages: list[Message],
        schema_dict: dict[str, Any] | None,
        audit_context: dict[str, Any] | None = None,
    ) -> tuple[str, dict[str, Any], dict[str, Any], float]:
        url, headers, payload = self._build_request(messages, schema_dict)
        attempts = self.max_retries + 1
        error: Exception | None = None
        for attempt in range(1, attempts + 1):
            start = time.perf_counter()
            try:
                resp = self._client.post(url, headers=headers, json=payload)
                latency = (time.perf_counter() - start) * 1000
                if resp.status_code in RETRYABLE_STATUS:
                    error = LLMHTTPError(resp.status_code, resp.text)
                elif resp.status_code >= 400:
                    self._audit(url, payload, resp.text, "error", latency, attempt,
                                f"HTTP {resp.status_code}", context=audit_context)
                    raise LLMHTTPError(resp.status_code, resp.text)
                else:
                    try:
                        data = resp.json()
                        text, usage = self._extract(data)
                    except (ValueError, KeyError, IndexError, TypeError, LLMError) as exc:
                        # HTTP 200 with an unusable body (proxy error page, safety
                        # block, malformed response): audit the raw body, fail loud.
                        self._audit(url, payload, resp.text, "error", latency, attempt,
                                    str(exc), context=audit_context)
                        raise LLMError(
                            f"{self.provider} returned HTTP 200 with an unusable body: {exc}"
                        ) from exc
                    self._audit(url, payload, data, "ok", latency, attempt, None,
                                usage=usage, context=audit_context)
                    return text, usage, data, latency
            except (httpx.TimeoutException, httpx.TransportError) as exc:
                latency = (time.perf_counter() - start) * 1000
                error = exc
            self._audit(url, payload, getattr(error, "body", None), "retryable_error",
                        latency, attempt, str(error), context=audit_context)
            if attempt < attempts:
                self._sleep(self.backoff_base_s * (2 ** (attempt - 1)))
        raise LLMError(f"{self.provider} request failed after {attempts} attempts: {error}")

    def _audit(
        self,
        url: str,
        payload: dict[str, Any],
        response: Any,
        status: str,
        latency_ms: float,
        attempt: int,
        error: str | None,
        usage: dict[str, Any] | None = None,
        context: dict[str, Any] | None = None,
    ) -> None:
        self.audit.record_llm_call(
            provider=self.provider,
            model=self.model,
            url=url,
            request_payload=payload,
            response_payload=response,
            status=status,
            latency_ms=latency_ms,
            attempt=attempt,
            error=error,
            usage=usage,
            estimated_cost_usd=self._estimated_cost(usage),
            context=context,
        )

    @staticmethod
    def _usage_tokens(usage: dict[str, Any]) -> tuple[int, int]:
        """Normalize provider usage shapes -> (input_tokens, output_tokens)."""
        input_tokens = usage.get("prompt_tokens", usage.get("promptTokenCount", 0)) or 0
        output_tokens = usage.get("completion_tokens", usage.get("candidatesTokenCount", 0)) or 0
        return int(input_tokens), int(output_tokens)

    def _estimated_cost(self, usage: dict[str, Any] | None) -> str | None:
        """USD estimate from per-mtok env prices; None when unpriced/unknown."""
        if not usage or (self.price_input_per_mtok == 0 and self.price_output_per_mtok == 0):
            return None
        input_tokens, output_tokens = self._usage_tokens(usage)
        cost = (
            Decimal(input_tokens) * self.price_input_per_mtok
            + Decimal(output_tokens) * self.price_output_per_mtok
        ) / Decimal(1_000_000)
        return str(cost.quantize(Decimal("0.000001")))

    @staticmethod
    def _sleep(seconds: float) -> None:
        if seconds > 0:
            time.sleep(seconds)

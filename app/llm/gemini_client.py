"""Gemini adapter — httpx against the native generateContent REST API.

Used for smoke tests / cheap runs. Gemini 3.x Flash models reject or ignore
custom sampling parameters, so this adapter NEVER sends temperature, top_p,
or top_k — generationConfig carries only the structured-output fields.
"""

from __future__ import annotations

import json
from typing import Any

from app.llm.base import BaseHTTPLLMClient, LLMError, Message

API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"

_STRIP_KEYS = {"title", "additionalProperties", "$defs", "definitions", "default"}


def _gemini_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Convert a Pydantic JSON schema to the OpenAPI subset Gemini accepts:
    inline $refs, drop unsupported keys."""
    defs = schema.get("$defs", schema.get("definitions", {}))

    def resolve(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                name = node["$ref"].split("/")[-1]
                return resolve(defs.get(name, {}))
            return {k: resolve(v) for k, v in node.items() if k not in _STRIP_KEYS}
        if isinstance(node, list):
            return [resolve(item) for item in node]
        return node

    return resolve(schema)


class GeminiClient(BaseHTTPLLMClient):
    provider = "gemini"

    def _build_request(
        self, messages: list[Message], schema_dict: dict[str, Any] | None
    ) -> tuple[str, dict[str, str], dict[str, Any]]:
        url = f"{API_BASE}/{self.model}:generateContent"
        headers = {
            "x-goog-api-key": self.api_key,
            "Content-Type": "application/json",
        }
        system_texts = [m["content"] for m in messages if m["role"] == "system"]
        contents = [
            {
                "role": "model" if m["role"] == "assistant" else "user",
                "parts": [{"text": m["content"]}],
            }
            for m in messages
            if m["role"] != "system"
        ]
        payload: dict[str, Any] = {"contents": contents}
        if system_texts:
            payload["systemInstruction"] = {"parts": [{"text": "\n\n".join(system_texts)}]}
        if schema_dict is not None:
            payload["generationConfig"] = {
                "responseMimeType": "application/json",
                "responseSchema": _gemini_schema(schema_dict),
            }
        return url, headers, payload

    @staticmethod
    def _extract(data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        candidates = data.get("candidates") or []
        if not candidates:
            raise LLMError(f"Gemini returned no candidates: {json.dumps(data)[:500]}")
        parts = candidates[0].get("content", {}).get("parts", [])
        text = "".join(p.get("text", "") for p in parts)
        return text, data.get("usageMetadata", {})

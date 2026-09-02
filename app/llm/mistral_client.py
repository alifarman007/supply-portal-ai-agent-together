"""Mistral adapter — httpx against the native chat-completions REST API.

Default provider for real work. Temperature is pinned to 0 (PLAN.md §7):
as deterministic as the provider allows.
"""

from __future__ import annotations

from typing import Any

from app.llm.base import Attachment, BaseHTTPLLMClient, LLMError, Message

API_URL = "https://api.mistral.ai/v1/chat/completions"


def _strict_schema(schema: dict[str, Any]) -> dict[str, Any]:
    """Recursively set additionalProperties=false on objects (strict json_schema mode)."""
    if isinstance(schema, dict):
        out = {k: _strict_schema(v) for k, v in schema.items()}
        if out.get("type") == "object" and "properties" in out:
            out.setdefault("additionalProperties", False)
        return out
    if isinstance(schema, list):
        return [_strict_schema(item) for item in schema]
    return schema


class MistralClient(BaseHTTPLLMClient):
    provider = "mistral"

    def _build_request(
        self,
        messages: list[Message],
        schema_dict: dict[str, Any] | None,
        attachments: list[Attachment] | None = None,
    ) -> tuple[str, dict[str, str], dict[str, Any]]:
        if attachments:
            # Refuse loudly. Silently dropping the file would make the model
            # answer about a document it never saw — the worst outcome for a
            # bill-reading feature.
            raise LLMError(
                "the Mistral adapter cannot send file attachments; set "
                "LLM_PROVIDER=gemini in .env to read PDF or image bills"
            )
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": list(messages),
            "temperature": 0,
        }
        if schema_dict is not None:
            payload["response_format"] = {
                "type": "json_schema",
                "json_schema": {
                    "name": schema_dict.get("title", "response"),
                    "schema": _strict_schema(schema_dict),
                    "strict": True,
                },
            }
        return API_URL, headers, payload

    @staticmethod
    def _extract(data: dict[str, Any]) -> tuple[str, dict[str, Any]]:
        content = data["choices"][0]["message"]["content"]
        if isinstance(content, list):  # content-parts form
            content = "".join(
                part.get("text", "") for part in content if isinstance(part, dict)
            )
        return content, data.get("usage", {})

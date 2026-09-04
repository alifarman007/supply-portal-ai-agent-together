"""Connectivity smoke test: `python -m app.llm.smoke`.

Sends one tiny schema-constrained request and prints the parsed result plus
latency and token usage. Exit code 0 on success. Flip LLM_PROVIDER in .env
to test the other provider — no code change.
"""

from __future__ import annotations

import json

from pydantic import BaseModel

from app.config import get_settings
from app.llm.base import LLMError
from app.llm.factory import get_llm_client


class SmokeReply(BaseModel):
    ok: bool
    provider: str
    model: str


def main() -> int:
    settings = get_settings()
    try:
        client = get_llm_client(settings)
    except (LLMError, ValueError) as err:
        print(f"SMOKE FAILED: {err}")
        return 1
    print(f"provider : {client.provider}")
    print(f"model    : {client.model}")

    messages = [
        {
            "role": "system",
            "content": "You are a connectivity smoke test. Reply with a single JSON object only.",
        },
        {
            "role": "user",
            "content": (
                "Return exactly this JSON object: "
                f'{{"ok": true, "provider": "{client.provider}", "model": "{client.model}"}}'
            ),
        },
    ]
    try:
        response = client.complete(messages, json_schema=SmokeReply)
    except LLMError as err:
        print(f"SMOKE FAILED: {err}")
        return 1

    print(f"reply    : {json.dumps(response.parsed_json)}")
    print(f"latency  : {response.latency_ms:.0f} ms")
    print(f"usage    : {response.usage}")
    ok = bool(response.parsed_json and response.parsed_json.get("ok"))
    print("SMOKE OK" if ok else "SMOKE FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    raise SystemExit(main())

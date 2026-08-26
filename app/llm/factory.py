"""Provider selection — reads LLM_PROVIDER, returns the matching adapter."""

from __future__ import annotations

import httpx

from app.audit.store import AuditStore
from app.config import Settings, get_settings
from app.llm.base import LLMClient
from app.llm.gemini_client import GeminiClient
from app.llm.mistral_client import MistralClient


def get_llm_client(
    settings: Settings | None = None,
    *,
    audit_store: AuditStore | None = None,
    transport: httpx.BaseTransport | None = None,
) -> LLMClient:
    settings = settings or get_settings()
    provider = settings.llm_provider.strip().lower()
    common = {
        "timeout_s": settings.llm_timeout_s,
        "max_retries": settings.llm_max_retries,
        "audit_store": audit_store,
        "transport": transport,
        "price_input_per_mtok": settings.llm_price_input_per_mtok,
        "price_output_per_mtok": settings.llm_price_output_per_mtok,
    }
    if provider == "mistral":
        return MistralClient(
            model=settings.mistral_model, api_key=settings.mistral_api_key, **common
        )
    if provider == "gemini":
        return GeminiClient(
            model=settings.gemini_model, api_key=settings.gemini_api_key, **common
        )
    raise ValueError(
        f"Unknown LLM_PROVIDER {settings.llm_provider!r} — expected 'gemini' or 'mistral'."
    )

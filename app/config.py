"""Application settings — entirely env-driven (see .env.example)."""

from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # LLM provider layer (PLAN.md §7)
    llm_provider: str = "gemini"  # gemini | mistral
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.6-flash"
    mistral_api_key: str = ""
    mistral_model: str = "mistral-large-2512"
    llm_timeout_s: float = 60.0
    llm_max_retries: int = 3
    # Optional USD prices per million tokens for the audit cost estimate
    # (PLAN.md §7). "0" = unpriced -> estimated_cost_usd is null in the audit log.
    llm_price_input_per_mtok: str = "0"
    llm_price_output_per_mtok: str = "0"

    # App
    app_db_url: str = "sqlite:///./billcheck.db"
    default_fiscal_year: str = "fy2026_27"
    tz: str = "Asia/Dhaka"
    treasury_webhook_url: str = ""
    outbox_dir: Path = Path("outbox")

    # Audit store (append-only JSONL)
    audit_log_dir: Path = Path("audit_log")


@lru_cache
def get_settings() -> Settings:
    return Settings()

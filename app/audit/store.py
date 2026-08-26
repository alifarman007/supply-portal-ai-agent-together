"""Append-only audit store.

Every LLM prompt and raw response is persisted here (PLAN.md §7, §13).
Records are JSON Lines appended to a per-day file; nothing in this module
ever rewrites or deletes an existing record. API keys and auth headers are
never written — callers pass only URLs, payloads, and responses.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.config import get_settings


class AuditStore:
    def __init__(self, directory: Path | str | None = None) -> None:
        self.directory = Path(directory) if directory is not None else get_settings().audit_log_dir

    def record(self, kind: str, payload: dict[str, Any]) -> str:
        """Append one event; returns its id."""
        now = datetime.now(UTC)
        entry = {
            "event_id": uuid.uuid4().hex,
            "ts": now.isoformat(),
            "kind": kind,
            **payload,
        }
        self.directory.mkdir(parents=True, exist_ok=True)
        path = self.directory / f"audit-{now.strftime('%Y%m%d')}.jsonl"
        with path.open("a", encoding="utf-8") as fh:
            fh.write(json.dumps(entry, ensure_ascii=False, default=str) + "\n")
        return entry["event_id"]

    def record_llm_call(
        self,
        *,
        provider: str,
        model: str,
        url: str,
        request_payload: dict[str, Any],
        response_payload: Any,
        status: str,
        latency_ms: float,
        attempt: int,
        error: str | None = None,
        usage: dict[str, Any] | None = None,
        estimated_cost_usd: str | None = None,
        context: dict[str, Any] | None = None,
    ) -> str:
        return self.record(
            "llm_call",
            {
                "provider": provider,
                "model": model,
                "url": url,
                "request": request_payload,
                "response": response_payload,
                "status": status,
                "latency_ms": round(latency_ms, 1),
                "attempt": attempt,
                "error": error,
                "usage": usage,
                "estimated_cost_usd": estimated_cost_usd,
                "context": context or {},
            },
        )

    def iter_llm_calls(self, run_id: str) -> list[dict[str, Any]]:
        """All llm_call records for a checking run, in append order — the
        replay data source (PLAN.md §13)."""
        records: list[dict[str, Any]] = []
        if not self.directory.is_dir():
            return records
        for path in sorted(self.directory.glob("audit-*.jsonl")):
            with path.open("r", encoding="utf-8") as fh:
                for line in fh:
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        record = json.loads(line)
                    except json.JSONDecodeError:
                        continue  # never let one corrupt line break replay
                    if (
                        record.get("kind") == "llm_call"
                        and record.get("context", {}).get("run_id") == run_id
                    ):
                        records.append(record)
        return records

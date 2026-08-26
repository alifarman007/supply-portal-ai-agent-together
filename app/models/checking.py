"""Checking run + result (PLAN.md §5). Populated by the Phase 2/3 pipeline."""

from __future__ import annotations

import datetime as dt
from enum import StrEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base


class RunStatus(StrEnum):
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"


class Severity(StrEnum):
    BLOCKER = "BLOCKER"
    REVIEW = "REVIEW"
    INFO = "INFO"


class Recommendation(StrEnum):
    CLEAR = "CLEAR"
    CLEAR_WITH_ADJUSTMENTS = "CLEAR_WITH_ADJUSTMENTS"
    REVIEW_REQUIRED = "REVIEW_REQUIRED"
    BLOCKED = "BLOCKED"


class CheckingRun(Base):
    __tablename__ = "checking_runs"

    run_id: Mapped[str] = mapped_column(String(40), primary_key=True)
    bill_id: Mapped[str] = mapped_column(ForeignKey("bills.id"))
    started_at: Mapped[dt.datetime] = mapped_column(DateTime)
    finished_at: Mapped[dt.datetime | None] = mapped_column(DateTime)
    git_sha: Mapped[str | None] = mapped_column(String(40))
    rules_version: Mapped[str | None] = mapped_column(String(64))
    llm_provider: Mapped[str | None] = mapped_column(String(20))
    llm_model: Mapped[str | None] = mapped_column(String(60))
    status: Mapped[RunStatus] = mapped_column(
        SAEnum(RunStatus, values_callable=lambda e: [m.value for m in e]),
        default=RunStatus.RUNNING,
    )

    result: Mapped[CheckingResult | None] = relationship(back_populates="run")


class CheckingResult(Base):
    __tablename__ = "checking_results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    run_id: Mapped[str] = mapped_column(ForeignKey("checking_runs.run_id"), unique=True)
    # Headline money figures (integer paisa); the full §5 breakdown
    # (adjustments, per-line vat/vds/tds, netting order) lives in breakdown JSON.
    gross_claimed_paisa: Mapped[int | None] = mapped_column(Integer)
    approved_base_paisa: Mapped[int | None] = mapped_column(Integer)
    net_payable_paisa: Mapped[int | None] = mapped_column(Integer)
    breakdown: Mapped[dict] = mapped_column(JSON, default=dict)
    exceptions: Mapped[list] = mapped_column(JSON, default=list)
    recommendation: Mapped[Recommendation | None] = mapped_column(
        SAEnum(Recommendation, values_callable=lambda e: [m.value for m in e])
    )
    report_md: Mapped[str | None] = mapped_column(Text)

    run: Mapped[CheckingRun] = relationship(back_populates="result")

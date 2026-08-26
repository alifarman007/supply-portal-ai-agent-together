"""CFO approval record (PLAN.md §5) — maker/checker preserved."""

from __future__ import annotations

import datetime as dt
from enum import StrEnum

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Decision(StrEnum):
    APPROVED = "approved"
    APPROVED_WITH_CHANGES = "approved_with_changes"
    RETURNED = "returned"
    REJECTED = "rejected"


class ApprovalRecord(Base):
    __tablename__ = "approval_records"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bill_id: Mapped[str] = mapped_column(ForeignKey("bills.id"))
    run_id: Mapped[str] = mapped_column(ForeignKey("checking_runs.run_id"))
    decision: Mapped[Decision] = mapped_column(
        SAEnum(Decision, values_callable=lambda e: [m.value for m in e])
    )
    decided_by: Mapped[str] = mapped_column(String(120))
    decided_at: Mapped[dt.datetime] = mapped_column(DateTime)
    comment: Mapped[str | None] = mapped_column(Text)
    final_net_payable_paisa: Mapped[int | None] = mapped_column(Integer)

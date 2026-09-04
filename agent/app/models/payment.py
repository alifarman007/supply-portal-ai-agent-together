"""Treasury payment instruction (PLAN.md §5) — the outbox contract for Phase L."""

from __future__ import annotations

import datetime as dt
from enum import StrEnum

from sqlalchemy import JSON, DateTime, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PaymentStatus(StrEnum):
    EMITTED = "emitted"
    ACKNOWLEDGED = "acknowledged"


class PaymentInstruction(Base):
    __tablename__ = "payment_instructions"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    # unique: DB-level backstop for §2.7 — one payment instruction per bill,
    # ever (a bill can never be re-checked/re-decided once instructed).
    bill_id: Mapped[str] = mapped_column(ForeignKey("bills.id"), unique=True)
    bank_details: Mapped[dict] = mapped_column(JSON, default=dict)  # supplier snapshot
    amount_paisa: Mapped[int] = mapped_column(Integer)
    currency: Mapped[str] = mapped_column(String(3), default="BDT")
    created_at: Mapped[dt.datetime] = mapped_column(DateTime)
    status: Mapped[PaymentStatus] = mapped_column(
        SAEnum(PaymentStatus, values_callable=lambda e: [m.value for m in e]),
        default=PaymentStatus.EMITTED,
    )
    outbox_path: Mapped[str | None] = mapped_column(String(400))
    webhook_response: Mapped[dict | None] = mapped_column(JSON)

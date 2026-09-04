"""Supplier ledger (advances, prior payments, retention, penalties) — PLAN.md §5."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, field_validator
from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LedgerType(StrEnum):
    ADVANCE = "advance"
    PAYMENT = "payment"
    RETENTION_HELD = "retention_held"
    ADJUSTMENT = "adjustment"
    PENALTY = "penalty"


class LedgerEntry(Base):
    __tablename__ = "ledger_entries"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"))
    po_id: Mapped[str | None] = mapped_column(ForeignKey("purchase_orders.id"))
    bill_id: Mapped[str | None] = mapped_column(ForeignKey("bills.id"))
    entry_type: Mapped[LedgerType] = mapped_column(
        SAEnum(LedgerType, values_callable=lambda e: [m.value for m in e])
    )
    amount_paisa: Mapped[int] = mapped_column(Integer)
    entry_date: Mapped[dt.date] = mapped_column(Date)
    ref: Mapped[str] = mapped_column(String(80))


class LedgerEntryIn(BaseModel):
    supplier_id: str
    po_id: str | None = None
    bill_id: str | None = None
    entry_type: LedgerType
    amount_tk: Decimal
    entry_date: dt.date
    ref: str

    @field_validator("amount_tk", mode="before")
    @classmethod
    def _no_float(cls, v):
        if isinstance(v, float):
            raise ValueError("float is banned for money — use a string in fixtures")
        return v

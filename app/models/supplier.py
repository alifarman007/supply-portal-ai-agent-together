"""Supplier master (PLAN.md §5)."""

from __future__ import annotations

from enum import StrEnum

from pydantic import BaseModel
from sqlalchemy import Boolean, String, Text
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class SupplierStatus(StrEnum):
    ACTIVE = "active"
    HOLD = "hold"
    BLACKLISTED = "blacklisted"


class Supplier(Base):
    __tablename__ = "suppliers"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    name: Mapped[str] = mapped_column(String(200))
    bin_no: Mapped[str | None] = mapped_column(String(40))  # VAT registration number
    etin: Mapped[str | None] = mapped_column(String(40))
    has_return_submission_proof: Mapped[bool] = mapped_column(Boolean, default=False)
    bank_account_name: Mapped[str | None] = mapped_column(String(200))
    bank_account_no: Mapped[str | None] = mapped_column(String(60))
    bank_name: Mapped[str | None] = mapped_column(String(120))
    bank_branch: Mapped[str | None] = mapped_column(String(120))
    status: Mapped[SupplierStatus] = mapped_column(
        SAEnum(SupplierStatus, values_callable=lambda e: [m.value for m in e]),
        default=SupplierStatus.ACTIVE,
    )
    notes: Mapped[str | None] = mapped_column(Text)


class SupplierIn(BaseModel):
    """Validated intake shape (seed fixtures now, portal/API later)."""

    id: str
    name: str
    bin_no: str | None = None
    etin: str | None = None
    has_return_submission_proof: bool = False
    bank_account_name: str | None = None
    bank_account_no: str | None = None
    bank_name: str | None = None
    bank_branch: str | None = None
    status: SupplierStatus = SupplierStatus.ACTIVE
    notes: str | None = None

"""Purchase Order + lines (PLAN.md §5)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, field_validator
from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, DecimalText


class PoStatus(StrEnum):
    OPEN = "open"
    PARTIALLY_BILLED = "partially_billed"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class PurchaseOrder(Base):
    __tablename__ = "purchase_orders"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"))
    order_date: Mapped[dt.date] = mapped_column(Date)
    status: Mapped[PoStatus] = mapped_column(
        SAEnum(PoStatus, values_callable=lambda e: [m.value for m in e]),
        default=PoStatus.OPEN,
    )
    lines: Mapped[list[PoLine]] = relationship(
        back_populates="po", cascade="all, delete-orphan", order_by="PoLine.line_no"
    )


class PoLine(Base):
    __tablename__ = "po_lines"
    __table_args__ = (UniqueConstraint("po_id", "line_no"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    po_id: Mapped[str] = mapped_column(ForeignKey("purchase_orders.id"))
    line_no: Mapped[int] = mapped_column(Integer)
    product_code: Mapped[str] = mapped_column(String(60))
    description: Mapped[str] = mapped_column(String(400))
    uom: Mapped[str] = mapped_column(String(20), default="pcs")
    qty: Mapped[Decimal] = mapped_column(DecimalText)
    unit_price_paisa: Mapped[int] = mapped_column(Integer)
    vat_category_id: Mapped[str] = mapped_column(String(60))
    tds_category_id: Mapped[str] = mapped_column(String(60))

    po: Mapped[PurchaseOrder] = relationship(back_populates="lines")


def _no_float(v):
    if isinstance(v, float):
        raise ValueError("float is banned for money/qty — use a string in fixtures")
    return v


class PoLineIn(BaseModel):
    line_no: int
    product_code: str
    description: str
    uom: str = "pcs"
    qty: Decimal
    unit_price_tk: Decimal
    vat_category_id: str
    tds_category_id: str

    _guard = field_validator("qty", "unit_price_tk", mode="before")(_no_float)


class PurchaseOrderIn(BaseModel):
    id: str
    supplier_id: str
    order_date: dt.date
    status: PoStatus = PoStatus.OPEN
    lines: list[PoLineIn]

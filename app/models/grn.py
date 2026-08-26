"""Goods Received Note + lines (PLAN.md §5)."""

from __future__ import annotations

import datetime as dt
from decimal import Decimal

from pydantic import BaseModel, field_validator
from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, DecimalText


class Grn(Base):
    __tablename__ = "grns"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    po_id: Mapped[str] = mapped_column(ForeignKey("purchase_orders.id"))
    grn_date: Mapped[dt.date] = mapped_column(Date)
    lines: Mapped[list[GrnLine]] = relationship(
        back_populates="grn", cascade="all, delete-orphan", order_by="GrnLine.po_line_no"
    )


class GrnLine(Base):
    __tablename__ = "grn_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    grn_id: Mapped[str] = mapped_column(ForeignKey("grns.id"))
    po_line_no: Mapped[int] = mapped_column(Integer)
    qty_received: Mapped[Decimal] = mapped_column(DecimalText)
    qty_accepted: Mapped[Decimal] = mapped_column(DecimalText)
    qty_rejected: Mapped[Decimal] = mapped_column(DecimalText)

    grn: Mapped[Grn] = relationship(back_populates="lines")


def _no_float(v):
    if isinstance(v, float):
        raise ValueError("float is banned for quantities — use a string in fixtures")
    return v


class GrnLineIn(BaseModel):
    po_line_no: int
    qty_received: Decimal
    qty_accepted: Decimal
    qty_rejected: Decimal = Decimal(0)

    _guard = field_validator("qty_received", "qty_accepted", "qty_rejected", mode="before")(
        _no_float
    )


class GrnIn(BaseModel):
    id: str
    po_id: str
    grn_date: dt.date
    lines: list[GrnLineIn]

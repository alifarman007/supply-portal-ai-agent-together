"""Supplier bill + lines (PLAN.md §5).

No DB unique constraint on (supplier_id, supplier_invoice_no): duplicates are
DETECTED by the checking pipeline (S5), not silently prevented — the duplicate
must be seedable and surfaced as a BLOCKER.
"""

from __future__ import annotations

import datetime as dt
from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, field_validator, model_validator
from sqlalchemy import JSON, Date, ForeignKey, Integer, String
from sqlalchemy import Enum as SAEnum
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, DecimalText


class BillStatus(StrEnum):
    RECEIVED = "RECEIVED"
    ASSIGNED = "ASSIGNED"
    CHECKING = "CHECKING"
    CHECKED = "CHECKED"
    PENDING_CFO = "PENDING_CFO"
    APPROVED = "APPROVED"
    RETURNED = "RETURNED"
    REJECTED = "REJECTED"
    PAYMENT_INSTRUCTED = "PAYMENT_INSTRUCTED"


class Bill(Base):
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(String(40), primary_key=True)
    supplier_id: Mapped[str] = mapped_column(ForeignKey("suppliers.id"))
    po_id: Mapped[str] = mapped_column(ForeignKey("purchase_orders.id"))
    supplier_invoice_no: Mapped[str] = mapped_column(String(80))
    invoice_date: Mapped[dt.date] = mapped_column(Date)
    mushak_6_3_no: Mapped[str | None] = mapped_column(String(80))
    claimed_total_paisa: Mapped[int] = mapped_column(Integer)
    attachments: Mapped[list] = mapped_column(JSON, default=list)
    status: Mapped[BillStatus] = mapped_column(
        SAEnum(BillStatus, values_callable=lambda e: [m.value for m in e]),
        default=BillStatus.RECEIVED,
    )
    scenario_tag: Mapped[str | None] = mapped_column(String(10))  # golden-fixture traceability

    lines: Mapped[list[BillLine]] = relationship(
        back_populates="bill", cascade="all, delete-orphan", order_by="BillLine.line_no"
    )


class BillLine(Base):
    __tablename__ = "bill_lines"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    bill_id: Mapped[str] = mapped_column(ForeignKey("bills.id"))
    line_no: Mapped[int] = mapped_column(Integer)
    description: Mapped[str] = mapped_column(String(400))
    product_code: Mapped[str | None] = mapped_column(String(60))  # None => LLM Node A maps it
    qty: Mapped[Decimal] = mapped_column(DecimalText)
    unit_price_paisa: Mapped[int] = mapped_column(Integer)
    amount_paisa: Mapped[int] = mapped_column(Integer)

    bill: Mapped[Bill] = relationship(back_populates="lines")


def _no_float(v):
    if isinstance(v, float):
        raise ValueError("float is banned for money/qty — use a string in fixtures")
    return v


def _max_2dp(v: Decimal) -> Decimal:
    """Money is paisa-exact: sub-paisa amounts would silently round during
    conversion and break the claimed == sum(lines) invariant in paisa."""
    if v.is_finite() and -v.as_tuple().exponent > 2:
        raise ValueError(f"money amount {v} has sub-paisa precision (max 2 decimals)")
    return v


class BillLineIn(BaseModel):
    line_no: int
    description: str
    product_code: str | None = None
    qty: Decimal
    unit_price_tk: Decimal
    amount_tk: Decimal

    _guard = field_validator("qty", "unit_price_tk", "amount_tk", mode="before")(_no_float)
    _paisa = field_validator("unit_price_tk", "amount_tk")(_max_2dp)


class BillIn(BaseModel):
    id: str
    supplier_id: str
    po_id: str
    supplier_invoice_no: str
    invoice_date: dt.date
    mushak_6_3_no: str | None = None
    claimed_total_tk: Decimal
    status: BillStatus = BillStatus.ASSIGNED  # checking starts after assignment
    scenario_tag: str | None = None
    lines: list[BillLineIn]

    _guard = field_validator("claimed_total_tk", mode="before")(_no_float)
    _paisa = field_validator("claimed_total_tk")(_max_2dp)

    @model_validator(mode="after")
    def _lines_sum_to_claimed(self) -> BillIn:
        total = sum((line.amount_tk for line in self.lines), Decimal(0))
        if total != self.claimed_total_tk:
            raise ValueError(
                f"bill {self.id}: claimed_total_tk {self.claimed_total_tk} != "
                f"sum of line amounts {total}"
            )
        return self

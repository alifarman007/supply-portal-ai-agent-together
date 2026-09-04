"""ErpGateway seam (PLAN.md §1, §6.1).

The checking core only ever talks to this protocol; Phase L swaps
MockErpGateway (seeded SQLite) for the real ERP with zero refactor.
"""

from __future__ import annotations

from typing import Protocol

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models import Bill, Grn, LedgerEntry, PurchaseOrder, Supplier


class ErpGateway(Protocol):
    def get_supplier(self, supplier_id: str) -> Supplier | None: ...

    def get_po(self, po_id: str) -> PurchaseOrder | None: ...

    def get_grns_for_po(self, po_id: str) -> list[Grn]: ...

    def get_bill(self, bill_id: str) -> Bill | None: ...

    def get_ledger_entries(
        self, supplier_id: str, po_id: str | None = None
    ) -> list[LedgerEntry]: ...

    def get_prior_bills(
        self, supplier_id: str, exclude_bill_id: str | None = None
    ) -> list[Bill]: ...


class MockErpGateway:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_supplier(self, supplier_id: str) -> Supplier | None:
        return self.session.get(Supplier, supplier_id)

    def get_po(self, po_id: str) -> PurchaseOrder | None:
        return self.session.scalars(
            select(PurchaseOrder)
            .where(PurchaseOrder.id == po_id)
            .options(selectinload(PurchaseOrder.lines))
        ).first()

    def get_grns_for_po(self, po_id: str) -> list[Grn]:
        return list(
            self.session.scalars(
                select(Grn)
                .where(Grn.po_id == po_id)
                .options(selectinload(Grn.lines))
                .order_by(Grn.grn_date, Grn.id)
            )
        )

    def get_bill(self, bill_id: str) -> Bill | None:
        return self.session.scalars(
            select(Bill).where(Bill.id == bill_id).options(selectinload(Bill.lines))
        ).first()

    def get_ledger_entries(
        self, supplier_id: str, po_id: str | None = None
    ) -> list[LedgerEntry]:
        stmt = select(LedgerEntry).where(LedgerEntry.supplier_id == supplier_id)
        if po_id is not None:
            stmt = stmt.where(LedgerEntry.po_id == po_id)
        return list(self.session.scalars(stmt.order_by(LedgerEntry.entry_date, LedgerEntry.id)))

    def get_prior_bills(
        self, supplier_id: str, exclude_bill_id: str | None = None
    ) -> list[Bill]:
        stmt = (
            select(Bill)
            .where(Bill.supplier_id == supplier_id)
            .options(selectinload(Bill.lines))
        )
        if exclude_bill_id is not None:
            stmt = stmt.where(Bill.id != exclude_bill_id)
        return list(self.session.scalars(stmt.order_by(Bill.invoice_date, Bill.id)))

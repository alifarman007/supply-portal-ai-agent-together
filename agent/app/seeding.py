"""Seed loader: seeds/scenarios.json -> validated Pydantic -> ORM rows.

Money in fixtures is Tk strings ("100.00"); it is converted to integer paisa
here via app.engines.money (never float). `seed()` is idempotent: it wipes
fixture tables and reinserts, so reseeding never duplicates rows.
"""

from __future__ import annotations

import json
from pathlib import Path

from sqlalchemy import delete
from sqlalchemy.orm import Session

from app.engines.money import to_paisa
from app.models import (
    Bill,
    BillIn,
    BillLine,
    Grn,
    GrnIn,
    GrnLine,
    LedgerEntry,
    LedgerEntryIn,
    PoLine,
    PurchaseOrder,
    PurchaseOrderIn,
    Supplier,
    SupplierIn,
)

SEEDS_PATH = Path(__file__).resolve().parent.parent / "seeds" / "scenarios.json"

# The portal-aligned demo universe: the same purchase orders the supplier portal
# shows, so a bill submitted there is checkable here. Generated - regenerate with
# `python scripts/generate_portal_demo_seed.py` from the repo root.
PORTAL_SEEDS_PATH = Path(__file__).resolve().parent.parent / "seeds" / "portal_demo.json"


def load_fixtures(path: Path | None = None) -> dict:
    raw = json.loads((path or SEEDS_PATH).read_text(encoding="utf-8"))
    return {
        "suppliers": [SupplierIn.model_validate(s) for s in raw["suppliers"]],
        "purchase_orders": [PurchaseOrderIn.model_validate(p) for p in raw["purchase_orders"]],
        "grns": [GrnIn.model_validate(g) for g in raw["grns"]],
        "bills": [BillIn.model_validate(b) for b in raw["bills"]],
        "ledger_entries": [LedgerEntryIn.model_validate(le) for le in raw["ledger_entries"]],
    }


def bill_from_in(b: BillIn) -> Bill:
    """Validated BillIn -> ORM Bill with paisa conversion (shared by the seed
    loader and the API intake endpoint)."""
    bill = Bill(
        **b.model_dump(exclude={"lines", "claimed_total_tk"}),
        claimed_total_paisa=to_paisa(b.claimed_total_tk),
    )
    bill.lines = [
        BillLine(
            **line.model_dump(exclude={"unit_price_tk", "amount_tk"}),
            unit_price_paisa=to_paisa(line.unit_price_tk),
            amount_paisa=to_paisa(line.amount_tk),
        )
        for line in b.lines
    ]
    return bill


def seed(session: Session, path: Path | None = None, *, wipe: bool = True) -> dict[str, int]:
    """Load a fixture file into the database.

    `wipe=False` adds a second data set alongside what is already there, which is how the
    portal-aligned demo universe is loaded on top of the golden S1-S12 fixtures. The two
    sets use disjoint ids (PO-S* / BILL-S* versus po-* / GRN-PORTAL-*), so they coexist.
    """
    fixtures = load_fixtures(path)

    if wipe:
        # Wipe fixture tables (children first) so reseeding is idempotent.
        for table in (LedgerEntry, BillLine, Bill, GrnLine, Grn, PoLine, PurchaseOrder, Supplier):
            session.execute(delete(table))

    for s in fixtures["suppliers"]:
        session.add(Supplier(**s.model_dump()))

    for p in fixtures["purchase_orders"]:
        po = PurchaseOrder(**p.model_dump(exclude={"lines"}))
        po.lines = [
            PoLine(
                **line.model_dump(exclude={"unit_price_tk"}),
                unit_price_paisa=to_paisa(line.unit_price_tk),
            )
            for line in p.lines
        ]
        session.add(po)

    for g in fixtures["grns"]:
        grn = Grn(**g.model_dump(exclude={"lines"}))
        grn.lines = [GrnLine(**line.model_dump()) for line in g.lines]
        session.add(grn)

    for b in fixtures["bills"]:
        session.add(bill_from_in(b))

    for le in fixtures["ledger_entries"]:
        session.add(
            LedgerEntry(
                **le.model_dump(exclude={"amount_tk"}),
                amount_paisa=to_paisa(le.amount_tk),
            )
        )

    session.commit()
    return {name: len(items) for name, items in fixtures.items()}

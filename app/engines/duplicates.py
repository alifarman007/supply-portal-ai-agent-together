"""Duplicate bill detection (PLAN.md §6.2). Detection, not prevention:
duplicates are seedable by design and surfaced as exceptions."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass
from decimal import Decimal

from app.engines.policy import CheckException


@dataclass(frozen=True)
class BillSummary:
    bill_id: str
    supplier_invoice_no: str
    invoice_date: dt.date
    claimed_total_tk: Decimal
    product_codes: frozenset[str]


def _signature_similar(a: frozenset[str], b: frozenset[str]) -> bool:
    """Jaccard >= 0.5 on product codes; unknowable (either side empty) counts
    as similar — a missing signature must not defeat fuzzy detection."""
    if not a or not b:
        return True
    return len(a & b) / len(a | b) >= 0.5


def check_duplicates(
    current: BillSummary,
    prior_bills: list[BillSummary],
    fuzzy_amount_pct: Decimal,
    fuzzy_days_window: int,
) -> list[CheckException]:
    exceptions: list[CheckException] = []
    invoice_no = current.supplier_invoice_no.strip().lower()

    for other in prior_bills:
        if other.bill_id == current.bill_id:
            continue
        if other.supplier_invoice_no.strip().lower() == invoice_no:
            exceptions.append(
                CheckException(
                    code="duplicate_exact",
                    message=(
                        f"Invoice no {current.supplier_invoice_no!r} already submitted "
                        f"by this supplier as bill {other.bill_id}"
                    ),
                    ref=other.bill_id,
                )
            )
            continue

        days_apart = abs((current.invoice_date - other.invoice_date).days)
        if days_apart > fuzzy_days_window:
            continue
        if other.claimed_total_tk == 0:
            continue
        relative_diff = abs(current.claimed_total_tk - other.claimed_total_tk) / max(
            current.claimed_total_tk, other.claimed_total_tk
        )
        if relative_diff > fuzzy_amount_pct:
            continue
        if not _signature_similar(current.product_codes, other.product_codes):
            continue
        exceptions.append(
            CheckException(
                code="duplicate_fuzzy",
                message=(
                    f"Possible duplicate of bill {other.bill_id} "
                    f"({other.supplier_invoice_no}): amounts within "
                    f"{fuzzy_amount_pct} and dates {days_apart} day(s) apart"
                ),
                ref=other.bill_id,
            )
        )
    return exceptions

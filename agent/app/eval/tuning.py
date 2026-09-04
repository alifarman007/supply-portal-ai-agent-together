"""Fuzzy-duplicate parameter tuning (PLAN.md §12).

Sweeps `duplicate_fuzzy.amount_pct` x `days_window` over labelled eval cases and
reports precision/recall at each setting, so the policy values are chosen from
evidence rather than taste.

Labels come from the eval cases themselves: a case whose `must_raise_codes`
contains `duplicate_fuzzy` is a true positive; one whose `must_not_raise_codes`
contains it is a true negative. Cases that say nothing either way are ignored —
guessing their label would corrupt the measurement.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from sqlalchemy.orm import Session

from app.engines.duplicates import BillSummary, check_duplicates
from app.engines.money import from_paisa
from app.eval.dataset import EvalCase
from app.models import Bill

DEFAULT_AMOUNT_PCTS = ["0.005", "0.01", "0.02", "0.05"]
DEFAULT_DAY_WINDOWS = [3, 7, 14, 30]


@dataclass
class SweepPoint:
    amount_pct: Decimal
    days_window: int
    true_positives: int = 0
    false_positives: int = 0
    true_negatives: int = 0
    false_negatives: int = 0

    @property
    def precision(self) -> float | None:
        flagged = self.true_positives + self.false_positives
        return None if flagged == 0 else self.true_positives / flagged

    @property
    def recall(self) -> float | None:
        actual = self.true_positives + self.false_negatives
        return None if actual == 0 else self.true_positives / actual

    @property
    def f1(self) -> float | None:
        p, r = self.precision, self.recall
        if p is None or r is None or p + r == 0:
            return None
        return 2 * p * r / (p + r)


def _summary(bill: Bill) -> BillSummary:
    return BillSummary(
        bill_id=bill.id,
        supplier_invoice_no=bill.supplier_invoice_no,
        invoice_date=bill.invoice_date,
        claimed_total_tk=from_paisa(bill.claimed_total_paisa),
        product_codes=frozenset(
            line.product_code.lower() for line in bill.lines if line.product_code
        ),
    )


def labelled_cases(cases: list[EvalCase]) -> list[tuple[EvalCase, bool]]:
    """(case, should_flag) for cases that carry an explicit fuzzy label."""
    labelled = []
    for case in cases:
        if "duplicate_fuzzy" in case.expectations.must_raise_codes:
            labelled.append((case, True))
        elif "duplicate_fuzzy" in case.expectations.must_not_raise_codes:
            labelled.append((case, False))
    return labelled


def sweep(
    session: Session,
    cases: list[EvalCase],
    amount_pcts: list[str] | None = None,
    day_windows: list[int] | None = None,
) -> list[SweepPoint]:
    pairs = labelled_cases(cases)
    points: list[SweepPoint] = []

    for pct_text in amount_pcts or DEFAULT_AMOUNT_PCTS:
        for days in day_windows or DEFAULT_DAY_WINDOWS:
            point = SweepPoint(amount_pct=Decimal(pct_text), days_window=days)
            for case, should_flag in pairs:
                bill = session.get(Bill, case.bill.id)
                if bill is None:
                    continue
                priors = [
                    _summary(other)
                    for other in session.query(Bill)
                    .filter(Bill.supplier_id == bill.supplier_id, Bill.id != bill.id)
                    .all()
                ]
                exceptions = check_duplicates(
                    _summary(bill), priors, point.amount_pct, point.days_window
                )
                flagged = any(e.code == "duplicate_fuzzy" for e in exceptions)
                if should_flag and flagged:
                    point.true_positives += 1
                elif should_flag and not flagged:
                    point.false_negatives += 1
                elif not should_flag and flagged:
                    point.false_positives += 1
                else:
                    point.true_negatives += 1
            points.append(point)
    return points


def render_sweep(points: list[SweepPoint], current: tuple[Decimal, int]) -> str:
    if not points:
        return (
            "## 5. Fuzzy-duplicate tuning\n\n"
            "_No labelled duplicate cases in the eval set — nothing to tune._\n"
        )

    lines = [
        "## 5. Fuzzy-duplicate tuning",
        "",
        "Swept over the labelled duplicate cases. **Precision** = of the bills we"
        " flagged, how many were real duplicates (low precision wastes CFO time)."
        " **Recall** = of the real duplicates, how many we caught (low recall risks"
        " paying twice).",
        "",
        "| amount_pct | days | TP | FP | FN | TN | Precision | Recall | F1 |",
        "|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]

    def fmt(value: float | None) -> str:
        return "—" if value is None else f"{value * 100:.0f}%"

    best: SweepPoint | None = None
    for p in points:
        marker = " ←current" if (p.amount_pct, p.days_window) == current else ""
        lines.append(
            f"| {p.amount_pct}{marker} | {p.days_window} | {p.true_positives} | "
            f"{p.false_positives} | {p.false_negatives} | {p.true_negatives} | "
            f"{fmt(p.precision)} | {fmt(p.recall)} | {fmt(p.f1)} |"
        )
        if p.f1 is not None and (best is None or (best.f1 or 0) < p.f1):
            best = p

    if best is not None:
        lines += [
            "",
            f"**Best F1 at amount_pct={best.amount_pct}, days_window={best.days_window}**"
            f" (precision {fmt(best.precision)}, recall {fmt(best.recall)}).",
            "",
            "Recall matters more than precision here: a missed duplicate can become a"
            " double payment, while a false flag costs one CFO click. Prefer the widest"
            " setting that keeps precision tolerable.",
            "",
        ]
    return "\n".join(lines)

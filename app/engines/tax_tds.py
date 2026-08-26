"""TDS (income tax deducted at source) from FY rule tables (PLAN.md §6.5).

Lines are aggregated per TDS category; the slab is selected on the aggregated
base per category (slab min/max are Tk amounts, max inclusive, null = open).
The uplift multiplier applies when the supplier has no return-submission
proof, and is reported with its citation.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.engines.matching import LineComputation
from app.engines.money import quantize_taka
from app.engines.policy import CheckException
from app.engines.tax_vat import VatLine
from app.rules.loader import RuleSet, TdsRule


@dataclass
class TdsDeduction:
    category_id: str
    law: str | None
    source_doc: str
    base_definition: str  # excl_vat | incl_vat
    base: Decimal
    slab_rate: Decimal
    uplift: Decimal
    uplift_applied: bool
    amount: Decimal
    line_nos: list[int]


def _slab_rate(rule: TdsRule, base: Decimal) -> Decimal:
    for slab in rule.slabs:
        if base >= slab.min and (slab.max is None or base <= slab.max):
            return slab.rate
    # Slabs are validated ordered at load; falling through means a table gap.
    raise ValueError(f"tds rule {rule.id}: no slab covers base {base}")


def compute_tds(
    lines: list[LineComputation],
    vat_lines: list[VatLine],
    ruleset: RuleSet,
    has_return_proof: bool,
) -> tuple[list[TdsDeduction], list[CheckException]]:
    deductions: list[TdsDeduction] = []
    exceptions: list[CheckException] = []
    vat_by_line = {v.line_no: v.amount for v in vat_lines}

    by_category: dict[str, list[LineComputation]] = {}
    for line in lines:
        by_category.setdefault(line.tds_category_id, []).append(line)

    for category_id, category_lines in sorted(by_category.items()):
        rule = ruleset.tds_rules.get(category_id)
        if rule is None:
            exceptions.append(
                CheckException(
                    code="unclassified_item",
                    message=(
                        f"TDS category {category_id!r} not found in "
                        f"{ruleset.fiscal_year} tds_rules.yaml "
                        f"(lines {[line.bill_line_no for line in category_lines]})"
                    ),
                )
            )
            continue
        base = sum((line.approved_amount for line in category_lines), Decimal(0))
        if rule.base == "incl_vat":
            base += sum(
                (vat_by_line.get(line.bill_line_no, Decimal(0)) for line in category_lines),
                Decimal(0),
            )
        rate = _slab_rate(rule, base)
        uplift_applied = not has_return_proof and rule.uplift_if_no_return_proof != 1
        uplift = rule.uplift_if_no_return_proof if uplift_applied else Decimal(1)
        amount = quantize_taka(base * rate * uplift)
        deductions.append(
            TdsDeduction(
                category_id=category_id,
                law=rule.law,
                source_doc=rule.source_doc,
                base_definition=rule.base,
                base=base,
                slab_rate=rate,
                uplift=uplift,
                uplift_applied=uplift_applied,
                amount=amount,
                line_nos=[line.bill_line_no for line in category_lines],
            )
        )
    return deductions, exceptions

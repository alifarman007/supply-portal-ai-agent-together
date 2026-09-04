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
    # set when Rule 4(1) proviso (kha) applies: the deduction shown is computed
    # on the total bill, but the law requires the GREATER of that and a rate on
    # the commission, which this system cannot see.
    higher_of_unresolved: bool = False


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
    is_natural_person: bool = False,
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
        # Rule 4(1) serials 1-3 rate a natural person differently from a company.
        if is_natural_person and rule.rate_natural_person is not None:
            rate = rule.rate_natural_person
        else:
            rate = _slab_rate(rule, base)

        uplift_applied = not has_return_proof and rule.uplift_if_no_return_proof != 1
        uplift = rule.uplift_if_no_return_proof if uplift_applied else Decimal(1)
        amount = quantize_taka(base * rate * uplift)

        # Rule 4(1) proviso (kha): where BOTH a commission and a total bill are
        # disclosed, the tax is the GREATER of the two computations. Bill lines
        # carry no commission split, so computing only the total-bill figure
        # could UNDER-deduct. Surface it instead of quietly choosing.
        higher_of_unresolved = rule.higher_of_commission_rate is not None
        if higher_of_unresolved:
            exceptions.append(
                CheckException(
                    code="tds_higher_of_commission_unresolved",
                    message=(
                        f"TDS category {category_id!r}: the rules require the GREATER of "
                        f"{rule.higher_of_commission_rate} x commission and {rate} x total "
                        f"bill. Only the total-bill figure ({amount} Tk) could be computed "
                        "because the bill shows no commission split — confirm no commission "
                        "element applies, or compute the deduction manually"
                    ),
                    rule_id=category_id,
                )
            )
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
                higher_of_unresolved=higher_of_unresolved,
            )
        )
    return deductions, exceptions

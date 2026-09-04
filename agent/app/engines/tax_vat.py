"""Per-line VAT from FY rule tables (PLAN.md §6.5). Rates come only from
vat_rates.yaml — never from code."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.engines.matching import LineComputation
from app.engines.money import quantize_taka
from app.engines.policy import CheckException
from app.rules.loader import RuleSet


@dataclass
class VatLine:
    line_no: int
    category_id: str
    rate: Decimal
    base: Decimal
    amount: Decimal
    source_doc: str


def compute_vat(
    lines: list[LineComputation], ruleset: RuleSet
) -> tuple[list[VatLine], list[CheckException]]:
    vat_lines: list[VatLine] = []
    exceptions: list[CheckException] = []
    include_vat = ruleset.policies.po_prices_include_vat

    for line in lines:
        rate_entry = ruleset.vat_rates.get(line.vat_category_id)
        if rate_entry is None:
            exceptions.append(
                CheckException(
                    code="unclassified_item",
                    message=(
                        f"Line {line.bill_line_no}: VAT category "
                        f"{line.vat_category_id!r} not found in "
                        f"{ruleset.fiscal_year} vat_rates.yaml"
                    ),
                    line_no=line.bill_line_no,
                )
            )
            continue
        if include_vat:
            # PO prices carry VAT: derive the exclusive base out of the amount.
            base = quantize_taka(line.approved_amount / (1 + rate_entry.rate))
            amount = quantize_taka(line.approved_amount - base)
        else:
            base = line.approved_amount
            amount = quantize_taka(base * rate_entry.rate)
        vat_lines.append(
            VatLine(
                line_no=line.bill_line_no,
                category_id=line.vat_category_id,
                rate=rate_entry.rate,
                base=base,
                amount=amount,
                source_doc=rate_entry.source_doc,
            )
        )
    return vat_lines, exceptions

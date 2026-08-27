"""VDS (VAT deducted at source) from FY rule tables (PLAN.md §6.5).

A vds_rules.yaml entry applies when every key in its `applies_if` matches the
bill context (withholding-entity flag from policies, Mushak 6.3 presence from
the bill). `action: no_deduction` withholds nothing; `action: {deduct_rate: R}`
withholds R x approved base. A matching rule may also carry
`severity_if_triggered` — surfaced as an exception (S12)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.engines.matching import LineComputation
from app.engines.money import quantize_taka
from app.engines.policy import CheckException
from app.rules.loader import RuleSet


@dataclass
class VdsDeduction:
    rule_id: str
    source_doc: str
    action: str  # "no_deduction" | "deduct"
    rate: Decimal | None
    base: Decimal
    amount: Decimal


def evaluate_vds(
    approved_base: Decimal, ruleset: RuleSet, mushak_6_3_present: bool
) -> tuple[VdsDeduction | None, list[CheckException]]:
    context = {
        "we_are_withholding_entity": ruleset.policies.we_are_withholding_entity,
        "mushak_6_3_present": mushak_6_3_present,
    }
    for rule in ruleset.vds_rules.values():
        if any(context.get(key) != value for key, value in rule.applies_if.items()):
            continue

        exceptions: list[CheckException] = []
        if not mushak_6_3_present:
            exceptions.append(
                CheckException(
                    code="missing_mushak_6_3",
                    message=(
                        "No Mushak 6.3 number on the bill; VDS treatment per rule "
                        f"{rule.id} ({rule.source_doc})"
                    ),
                    rule_id=rule.id,
                )
            )

        if rule.action == "no_deduction":
            return (
                VdsDeduction(
                    rule_id=rule.id,
                    source_doc=rule.source_doc,
                    action="no_deduction",
                    rate=None,
                    base=approved_base,
                    amount=Decimal("0.00"),
                ),
                exceptions,
            )
        if isinstance(rule.action, dict) and "deduct_rate" in rule.action:
            rate = Decimal(rule.action["deduct_rate"])
            return (
                VdsDeduction(
                    rule_id=rule.id,
                    source_doc=rule.source_doc,
                    action="deduct",
                    rate=rate,
                    base=approved_base,
                    amount=quantize_taka(approved_base * rate),
                ),
                exceptions,
            )
        exceptions.append(
            CheckException(
                code="vds_rule_unsupported_action",
                message=f"VDS rule {rule.id} has unsupported action {rule.action!r}",
                rule_id=rule.id,
            )
        )
        return None, exceptions

    return None, []  # no rule applies -> no VDS treatment


@dataclass
class VdsServiceDeduction:
    """VDS on ONE service line, keyed by its Rule 3(1) service code."""

    line_no: int
    service_code: str
    rate: Decimal
    base: Decimal
    amount: Decimal
    serial: str
    description_en: str


def evaluate_service_vds(
    lines: list[LineComputation],
    ruleset: RuleSet,
) -> tuple[list[VdsServiceDeduction], list[CheckException]]:
    """VDS on SERVICES — Rule 3(1) of the VDS Rules 2025.

    The chapeau requires deduction at the tabled rate "whether or not a Mushak
    6.3 exists", which is the OPPOSITE of the goods rule. A service bill with a
    perfectly valid VAT invoice still bears VDS, and treating it like goods
    under-deducts — our liability, at 2% per month.

    Three outcomes per line:
      * code resolves to ONE rate  -> deduct, and disclose that Rule 5's
        exemptions were not evaluated (they can switch a row off entirely)
      * code has SEVERAL rates     -> compute NOTHING and raise REVIEW naming
        the candidates. Hotel is 15% air-conditioned and 10% not, under the
        same code S001.10; guessing is a 5-point error on every hotel bill.
      * code not in the table      -> not a listed service, so Rule 5(ga)
        applies and the goods treatment governs. Left to the caller.
    """
    deductions: list[VdsServiceDeduction] = []
    exceptions: list[CheckException] = []

    for line in lines:
        code = (line.service_code or "").strip()
        if not code:
            continue
        entry = ruleset.vds_service_codes.get(code)
        if entry is None:
            exceptions.append(
                CheckException(
                    code="vds_service_code_unknown",
                    message=(
                        f"Line {line.bill_line_no}: service code {code!r} is not in the "
                        f"{ruleset.fiscal_year} Rule 3(1) table. If this really is a "
                        "listed service the deduction is being missed; if it is not "
                        "listed, the Mushak 6.3 rule for unlisted services applies"
                    ),
                    line_no=line.bill_line_no,
                    ref=code,
                )
            )
            continue

        if entry.is_ambiguous:
            candidates = ", ".join(
                f"{v.rate} ({v.description_en[:60]})" for v in entry.variants
            )
            exceptions.append(
                CheckException(
                    code="vds_service_rate_ambiguous",
                    message=(
                        f"Line {line.bill_line_no}: service code {code} carries more "
                        f"than one rate in Rule 3(1) and the code alone does not say "
                        f"which applies — candidates: {candidates}. No VDS computed; "
                        "choose the rate manually"
                    ),
                    line_no=line.bill_line_no,
                    ref=code,
                )
            )
            continue

        rate = entry.rate
        amount = quantize_taka(line.approved_amount * rate)
        deductions.append(
            VdsServiceDeduction(
                line_no=line.bill_line_no,
                service_code=code,
                rate=rate,
                base=line.approved_amount,
                amount=amount,
                serial=entry.variants[0].serial,
                description_en=entry.variants[0].description_en,
            )
        )
        exceptions.append(
            CheckException(
                code="vds_service_rule5_not_checked",
                message=(
                    f"Line {line.bill_line_no}: VDS of {amount} Tk deducted at {rate} "
                    f"under service code {code}. Rule 5's exemptions (attested Mushak "
                    "6.3, First Schedule items, zero-rated supplies, EFD invoices, "
                    "registered startups) are NOT evaluated by this system — confirm "
                    "none applies, or this over-deducts"
                ),
                line_no=line.bill_line_no,
                ref=code,
            )
        )

    return deductions, exceptions

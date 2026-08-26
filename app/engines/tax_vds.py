"""VDS (VAT deducted at source) from FY rule tables (PLAN.md §6.5).

A vds_rules.yaml entry applies when every key in its `applies_if` matches the
bill context (withholding-entity flag from policies, Mushak 6.3 presence from
the bill). `action: no_deduction` withholds nothing; `action: {deduct_rate: R}`
withholds R x approved base. A matching rule may also carry
`severity_if_triggered` — surfaced as an exception (S12)."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

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

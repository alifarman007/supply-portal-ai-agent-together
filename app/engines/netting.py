"""Deductions & netting -> NET PAYABLE (PLAN.md §6.6).

Fixed, documented order:
    approved_base -> + VAT -> - VDS -> - TDS -> - advance adjustment
    -> - retention -> - penalties/other -> - prior payments = NET PAYABLE
Every line carries a rule_id or ledger ref. The result self-checks: the sum
of all lines must equal net_payable exactly, else NettingError.

Advance offset is a FULL offset capped so the running total never goes below
zero (remaining advance stays open on the ledger) — recorded assumption
pending the owner's §14.4 policy answer.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.engines.money import quantize_taka
from app.engines.policy import CheckException
from app.engines.tax_tds import TdsDeduction
from app.engines.tax_vat import VatLine
from app.engines.tax_vds import VdsDeduction


class NettingError(ValueError):
    """The netting breakdown failed its reconciliation self-check."""


@dataclass(frozen=True)
class LedgerAmount:
    """A ledger-backed deduction input (advance, penalty, prior payment)."""

    amount_tk: Decimal
    ref: str


@dataclass
class NettingLine:
    label: str
    amount: Decimal  # signed; additions positive, deductions negative
    rule_id: str | None = None
    ref: str | None = None


@dataclass
class NettingResult:
    lines: list[NettingLine]
    approved_base: Decimal
    vat_total: Decimal
    vds_total: Decimal
    tds_total: Decimal
    advance_adjusted: Decimal  # >= 0, amount actually offset
    retention_held: Decimal
    other_deductions: Decimal
    prior_payments_offset: Decimal
    net_payable: Decimal
    exceptions: list[CheckException]


def build_netting(
    *,
    approved_base: Decimal,
    vat_lines: list[VatLine],
    vds: VdsDeduction | None,
    tds_deductions: list[TdsDeduction],
    advances: list[LedgerAmount],
    retention_pct: Decimal,
    penalties: list[LedgerAmount],
    prior_payments: list[LedgerAmount],
    advance_max_offset_pct: Decimal = Decimal(1),
) -> NettingResult:
    lines: list[NettingLine] = []
    exceptions: list[CheckException] = []

    running = quantize_taka(approved_base)
    lines.append(NettingLine("Approved base (after qty/price adjustments)", running))

    vat_total = quantize_taka(sum((v.amount for v in vat_lines), Decimal(0)))
    if vat_lines:
        for v in vat_lines:
            lines.append(
                NettingLine(
                    f"VAT on line {v.line_no} (rate {v.rate})",
                    v.amount,
                    rule_id=v.category_id,
                )
            )
        running += vat_total

    vds_total = Decimal("0.00")
    if vds is not None and vds.amount != 0:
        vds_total = vds.amount
        lines.append(NettingLine("VDS withheld", -vds.amount, rule_id=vds.rule_id))
        running -= vds.amount

    tds_total = quantize_taka(sum((t.amount for t in tds_deductions), Decimal(0)))
    for t in tds_deductions:
        label = f"TDS withheld ({t.category_id}"
        label += f", uplift x{t.uplift}" if t.uplift_applied else ""
        label += ")"
        lines.append(NettingLine(label, -t.amount, rule_id=t.category_id))
    running -= tds_total

    advance_adjusted = Decimal("0.00")
    # Recovery ceiling is a fraction of the payable at the moment advances are
    # applied (policy: 1.00 = full offset, <1 = proportional recovery).
    advance_ceiling = quantize_taka(running * advance_max_offset_pct) if running > 0 else Decimal(0)
    for advance in advances:
        headroom = min(running if running > 0 else Decimal(0), advance_ceiling)
        offset = min(advance.amount_tk, headroom)
        if offset <= 0:
            exceptions.append(
                CheckException(
                    code="advance_not_fully_offset",
                    message=(
                        f"Advance {advance.ref} ({advance.amount_tk} Tk) could not be "
                        "offset (payable exhausted); remains open on the ledger"
                    ),
                    ref=advance.ref,
                )
            )
            continue
        if offset < advance.amount_tk:
            exceptions.append(
                CheckException(
                    code="advance_partially_offset",
                    message=(
                        f"Advance {advance.ref}: offset {offset} of {advance.amount_tk} Tk; "
                        "remainder stays open on the ledger"
                    ),
                    ref=advance.ref,
                )
            )
        offset = quantize_taka(offset)
        lines.append(NettingLine("Advance adjustment", -offset, ref=advance.ref))
        advance_adjusted += offset
        running -= offset
        advance_ceiling -= offset

    retention_held = quantize_taka(approved_base * retention_pct)
    if retention_held != 0:
        lines.append(
            NettingLine("Retention/security held", -retention_held, rule_id="policy.retention_pct")
        )
        running -= retention_held

    other_deductions = Decimal("0.00")
    for penalty in penalties:
        amount = quantize_taka(penalty.amount_tk)
        lines.append(NettingLine("Penalty/other deduction", -amount, ref=penalty.ref))
        other_deductions += amount
        running -= amount

    prior_payments_offset = Decimal("0.00")
    for payment in prior_payments:
        amount = quantize_taka(payment.amount_tk)
        lines.append(NettingLine("Prior payment on this bill", -amount, ref=payment.ref))
        prior_payments_offset += amount
        running -= amount

    net_payable = quantize_taka(running)
    check = quantize_taka(sum((line.amount for line in lines), Decimal(0)))
    if check != net_payable:
        raise NettingError(
            f"netting does not reconcile: lines sum to {check}, net_payable {net_payable}"
        )

    return NettingResult(
        lines=lines,
        approved_base=quantize_taka(approved_base),
        vat_total=vat_total,
        vds_total=vds_total,
        tds_total=tds_total,
        advance_adjusted=quantize_taka(advance_adjusted),
        retention_held=retention_held,
        other_deductions=quantize_taka(other_deductions),
        prior_payments_offset=quantize_taka(prior_payments_offset),
        net_payable=net_payable,
        exceptions=exceptions,
    )

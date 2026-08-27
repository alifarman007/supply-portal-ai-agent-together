"""Mushak 6.3 (VAT tax invoice) modelling and validation — PLAN.md §6.5.

Built from two REAL invoices supplied by the owner (2026-08-27). Two things
those invoices taught us that the blank NBR form does not:

1. **The line description carries the tax classification code.** Suppliers
   write "S001.10-Guestroom Delux Couple" for a service or
   "2105.00.00-Chocolate Ice-cream Container" for goods — a VAT service code or
   an HS code, then a hyphen, then free text. That turns tax classification
   into a DETERMINISTIC lookup instead of something LLM Node B has to guess at.

2. **A real Mushak can be internally inconsistent.** On one of the two sample
   invoices the "Total Price with all Duty & VAT" column printed 4,000.00 for a
   line whose own figures give 4,000 + 400 SD + 330 VAT = 4,730. The supplier's
   stated total was simply wrong. So this module RECOMPUTES every figure and
   never trusts a printed total.

Pure deterministic engine: it may not import app.llm (enforced by
tests/unit/test_engine_purity.py).
"""

from __future__ import annotations

import datetime as dt
import re
from dataclasses import dataclass, field
from decimal import Decimal

from app.engines.money import quantize_taka
from app.engines.policy import CheckException

# NBR Business Identification Number: 9 digits, hyphen, 4 digits.
BIN_PATTERN = re.compile(r"^\d{9}-\d{4}$")
# Mushak serial: running number, slash, fiscal year — e.g. 1001/2024-2025.
MUSHAK_NO_PATTERN = re.compile(r"^\d+/(\d{4})-(\d{4})$")

# Line-description prefixes seen on the real invoices.
SERVICE_CODE = re.compile(r"^\s*(S\d{3}\.\d{2})\s*-\s*(.*)$", re.DOTALL)
HS_CODE = re.compile(r"^\s*(\d{4}\.\d{2}\.\d{2})\s*-\s*(.*)$", re.DOTALL)


@dataclass
class MushakLine:
    """One supply row. Column numbers refer to the printed NBR form."""

    sl_no: int
    raw_description: str          # col (2), including the code prefix
    uom: str                      # col (3)
    qty: Decimal                  # col (4)
    unit_price: Decimal           # col (5)
    total_price: Decimal          # col (6): price WITHOUT duty and VAT
    vat_rate_pct: Decimal         # col (9): a percentage, e.g. 7.5
    vat_amount: Decimal           # col (10)
    total_with_duty_vat: Decimal  # col (11)
    sd_rate_pct: Decimal = Decimal(0)  # col (7) supplementary duty rate
    sd_amount: Decimal = Decimal(0)    # col (8) supplementary duty amount

    @property
    def code(self) -> str | None:
        """The service or HS code the supplier put before the description."""
        for pattern in (SERVICE_CODE, HS_CODE):
            match = pattern.match(self.raw_description)
            if match:
                return match.group(1)
        return None

    @property
    def code_kind(self) -> str | None:
        if SERVICE_CODE.match(self.raw_description):
            return "service"
        if HS_CODE.match(self.raw_description):
            return "hs"
        return None

    @property
    def description(self) -> str:
        for pattern in (SERVICE_CODE, HS_CODE):
            match = pattern.match(self.raw_description)
            if match:
                return match.group(2).strip()
        return self.raw_description.strip()

    @property
    def vat_rate(self) -> Decimal:
        """The printed percentage as a fraction: 7.5 -> 0.075."""
        return self.vat_rate_pct / Decimal(100)


@dataclass
class Mushak63:
    mushak_no: str
    invoice_no: str
    issue_date: dt.date
    supplier_name: str
    supplier_bin: str
    purchaser_name: str
    purchaser_bin: str
    lines: list[MushakLine] = field(default_factory=list)

    @property
    def total_price(self) -> Decimal:
        return quantize_taka(sum((line.total_price for line in self.lines), Decimal(0)))

    @property
    def total_vat(self) -> Decimal:
        return quantize_taka(sum((line.vat_amount for line in self.lines), Decimal(0)))

    @property
    def recomputed_grand_total(self) -> Decimal:
        """What the invoice SHOULD total, derived from its own line figures."""
        return quantize_taka(
            sum(
                (line.total_price + line.sd_amount + line.vat_amount for line in self.lines),
                Decimal(0),
            )
        )


def validate_mushak(
    mushak: Mushak63,
    *,
    our_bin: str | None = None,
    supplier_bin: str | None = None,
    fiscal_year_of_invoice: str | None = None,
) -> list[CheckException]:
    """Deterministic validation of a supplier's VAT invoice.

    Every arithmetic figure is RECOMPUTED. One of the two real sample invoices
    printed a wrong grand total, so a printed figure is a claim, not a fact.
    """
    problems: list[CheckException] = []

    for label, value in (("Supplier", mushak.supplier_bin), ("Purchaser", mushak.purchaser_bin)):
        if not BIN_PATTERN.match(value or ""):
            problems.append(
                CheckException(
                    "mushak_bin_invalid",
                    f"{label} BIN {value!r} is not a valid NBR BIN "
                    "(expected 9 digits, hyphen, 4 digits)",
                    ref=mushak.mushak_no,
                )
            )

    if our_bin and mushak.purchaser_bin and mushak.purchaser_bin != our_bin:
        problems.append(
            CheckException(
                "mushak_purchaser_mismatch",
                f"Mushak 6.3 names purchaser BIN {mushak.purchaser_bin} "
                f"({mushak.purchaser_name}), but ours is {our_bin} — this invoice "
                "may have been issued to a different company",
                ref=mushak.mushak_no,
            )
        )
    if supplier_bin and mushak.supplier_bin and mushak.supplier_bin != supplier_bin:
        problems.append(
            CheckException(
                "mushak_supplier_mismatch",
                f"Mushak 6.3 was issued by BIN {mushak.supplier_bin} but the bill's "
                f"supplier is registered as {supplier_bin}",
                ref=mushak.mushak_no,
            )
        )

    match = MUSHAK_NO_PATTERN.match(mushak.mushak_no or "")
    if not match:
        problems.append(
            CheckException(
                "mushak_no_format_invalid",
                f"Mushak number {mushak.mushak_no!r} does not look like "
                "serial/YYYY-YYYY, e.g. 1001/2024-2025",
                ref=mushak.mushak_no,
            )
        )
    elif fiscal_year_of_invoice:
        stated = f"{match.group(1)}-{match.group(2)}"
        if stated != fiscal_year_of_invoice:
            problems.append(
                CheckException(
                    "mushak_fiscal_year_mismatch",
                    f"Mushak {mushak.mushak_no} is numbered for {stated} but the "
                    f"invoice date falls in {fiscal_year_of_invoice}",
                    ref=mushak.mushak_no,
                )
            )

    if not mushak.lines:
        problems.append(
            CheckException(
                "mushak_no_lines", "Mushak 6.3 has no supply lines", ref=mushak.mushak_no
            )
        )

    for line in mushak.lines:
        expected_total = quantize_taka(line.qty * line.unit_price)
        if expected_total != quantize_taka(line.total_price):
            problems.append(
                CheckException(
                    "mushak_line_arithmetic",
                    f"Mushak line {line.sl_no}: {line.qty} x {line.unit_price} = "
                    f"{expected_total} but the invoice states {line.total_price}",
                    line_no=line.sl_no,
                    ref=mushak.mushak_no,
                )
            )

        expected_sd = quantize_taka(line.total_price * line.sd_rate_pct / Decimal(100))
        if expected_sd != quantize_taka(line.sd_amount):
            problems.append(
                CheckException(
                    "mushak_sd_arithmetic",
                    f"Mushak line {line.sl_no}: supplementary duty at "
                    f"{line.sd_rate_pct}% of {line.total_price} is {expected_sd}, "
                    f"but the invoice states {line.sd_amount}",
                    line_no=line.sl_no,
                    ref=mushak.mushak_no,
                )
            )

        # VAT is charged on price PLUS supplementary duty.
        vat_base = line.total_price + line.sd_amount
        expected_vat = quantize_taka(vat_base * line.vat_rate)
        if expected_vat != quantize_taka(line.vat_amount):
            problems.append(
                CheckException(
                    "mushak_vat_arithmetic",
                    f"Mushak line {line.sl_no}: VAT at {line.vat_rate_pct}% of "
                    f"{vat_base} (price + SD) is {expected_vat}, but the invoice "
                    f"states {line.vat_amount}",
                    line_no=line.sl_no,
                    ref=mushak.mushak_no,
                )
            )

        expected_grand = quantize_taka(vat_base + line.vat_amount)
        if expected_grand != quantize_taka(line.total_with_duty_vat):
            problems.append(
                CheckException(
                    "mushak_total_mismatch",
                    f"Mushak line {line.sl_no}: price {line.total_price} + duty "
                    f"{line.sd_amount} + VAT {line.vat_amount} = {expected_grand}, "
                    f"but the invoice's own total-with-duty-and-VAT column says "
                    f"{line.total_with_duty_vat} — the supplier's stated total is wrong",
                    line_no=line.sl_no,
                    ref=mushak.mushak_no,
                )
            )

        if line.code is None:
            problems.append(
                CheckException(
                    "mushak_line_uncoded",
                    f"Mushak line {line.sl_no} ({line.description!r}) carries no "
                    "service code or HS code, so its VAT classification cannot be "
                    "verified from the invoice",
                    line_no=line.sl_no,
                    ref=mushak.mushak_no,
                )
            )

    return problems


def declared_vat_rates(mushak: Mushak63) -> dict[str, Decimal]:
    """code -> the VAT rate the SUPPLIER declared for it.

    Cross-checking this against our own rule tables catches a supplier charging
    the wrong rate — which is our exposure, not theirs, once we pay it.
    """
    return {line.code: line.vat_rate for line in mushak.lines if line.code}

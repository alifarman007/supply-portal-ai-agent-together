"""Mushak 6.3 validation, driven by the two REAL invoices the owner supplied
on 2026-08-27. These are not invented fixtures — every figure below is
transcribed from the actual PDFs.

INVOICE A — Kazi Farms Ltd -> ACI Limited, Mushak 1001/2024-2025
    2105.00.00-Chocolate Ice-cream Container (Za n Zee) 5000 ml
    25 x 160.00 = 4,000.00 | SD 10% = 400.00 | VAT 7.5% = 330.00
    printed "Total Price with all Duty & VAT" = 4,000.00   <-- WRONG

INVOICE B — BRAC Learning Centre -> FIX SERVICES LTD, Mushak 1000/2025-2026
    S001.10-Guestroom Delux Couple  1 x 5,000.00  VAT 15% =  750.00 -> 5,750.00
    S001.20-Dinner (Food)           1 x   400.00  VAT  5% =   20.00 ->   420.00
    totals 5,400.00 / 6,170.00   -- internally consistent
"""

import datetime as dt
from decimal import Decimal

from app.engines.mushak import Mushak63, MushakLine, declared_vat_rates, validate_mushak


def invoice_a() -> Mushak63:
    return Mushak63(
        mushak_no="1001/2024-2025",
        invoice_no="100000",
        issue_date=dt.date(2024, 11, 27),
        supplier_name="KAZI FARMS LTD.",
        supplier_bin="000828395-0207",
        purchaser_name="ACI Limited",
        purchaser_bin="001064787-0302",
        lines=[
            MushakLine(
                sl_no=1,
                raw_description="2105.00.00-Chocolate Ice-cream Container (Za n Zee) 5000 ml",
                uom="Each",
                qty=Decimal("25"),
                unit_price=Decimal("160.00"),
                total_price=Decimal("4000.00"),
                sd_rate_pct=Decimal("10"),
                sd_amount=Decimal("400.00"),
                vat_rate_pct=Decimal("7.5"),
                vat_amount=Decimal("330.00"),
                total_with_duty_vat=Decimal("4000.00"),  # as printed — and wrong
            )
        ],
    )


def invoice_b() -> Mushak63:
    return Mushak63(
        mushak_no="1000/2025-2026",
        invoice_no="100044",
        issue_date=dt.date(2025, 6, 3),
        supplier_name="BRAC Learning Centre",
        supplier_bin="123456789-011",  # short — not a valid BIN
        purchaser_name="FIX SERVICES LTD.",
        purchaser_bin="001821833-0401",
        lines=[
            MushakLine(
                sl_no=1,
                raw_description="S001.10-Guestroom Delux Couple",
                uom="Each",
                qty=Decimal("1"),
                unit_price=Decimal("5000.00"),
                total_price=Decimal("5000.00"),
                vat_rate_pct=Decimal("15"),
                vat_amount=Decimal("750.00"),
                total_with_duty_vat=Decimal("5750.00"),
            ),
            MushakLine(
                sl_no=2,
                raw_description="S001.20-Dinner (Food)",
                uom="Each",
                qty=Decimal("1"),
                unit_price=Decimal("400.00"),
                total_price=Decimal("400.00"),
                vat_rate_pct=Decimal("5"),
                vat_amount=Decimal("20.00"),
                total_with_duty_vat=Decimal("420.00"),
            ),
        ],
    )


def codes(problems):
    return [p.code for p in problems]


# ---- the classification code hidden in the description --------------------


def test_service_codes_are_extracted_from_the_description():
    """This is the discovery that matters: the supplier already tells us the
    tax classification, so Node B does not have to guess it."""
    lines = invoice_b().lines
    assert lines[0].code == "S001.10"
    assert lines[0].code_kind == "service"
    assert lines[0].description == "Guestroom Delux Couple"
    assert lines[1].code == "S001.20"
    assert lines[1].description == "Dinner (Food)"


def test_hs_code_is_extracted_for_goods():
    line = invoice_a().lines[0]
    assert line.code == "2105.00.00"
    assert line.code_kind == "hs"
    assert line.description == "Chocolate Ice-cream Container (Za n Zee) 5000 ml"


def test_uncoded_description_is_flagged_not_guessed():
    mushak = invoice_a()
    mushak.lines[0].raw_description = "Ice cream containers, assorted"
    assert mushak.lines[0].code is None
    assert "mushak_line_uncoded" in codes(validate_mushak(mushak))


# ---- invoice A: the supplier's own total is wrong -------------------------


def test_invoice_a_wrong_grand_total_is_caught():
    """4,000 price + 400 duty + 330 VAT = 4,730, but the invoice prints 4,000.
    Trusting the printed column would understate what we owe by 730 Tk."""
    problems = validate_mushak(invoice_a())
    assert "mushak_total_mismatch" in codes(problems)

    mismatch = next(p for p in problems if p.code == "mushak_total_mismatch")
    assert "4730.00" in mismatch.message
    assert "4000.00" in mismatch.message


def test_invoice_a_line_and_tax_arithmetic_are_otherwise_sound():
    """Only the total column is wrong — qty x price, the duty and the VAT all
    check out, so the validator must not cry wolf on those."""
    problems = codes(validate_mushak(invoice_a()))
    assert "mushak_line_arithmetic" not in problems   # 25 x 160 = 4,000
    assert "mushak_sd_arithmetic" not in problems     # 10% of 4,000 = 400
    assert "mushak_vat_arithmetic" not in problems    # 7.5% of 4,400 = 330


def test_vat_is_charged_on_price_plus_supplementary_duty():
    """The 330 VAT only reconciles if the base includes the 400 duty:
    7.5% of 4,000 would be 300, not 330."""
    line = invoice_a().lines[0]
    assert line.total_price * line.vat_rate == Decimal("300.000")
    assert (line.total_price + line.sd_amount) * line.vat_rate == Decimal("330.000")


def test_recomputed_grand_total_ignores_the_printed_one():
    assert invoice_a().recomputed_grand_total == Decimal("4730.00")


# ---- invoice B: a clean invoice, and a bad BIN ----------------------------


def test_invoice_b_arithmetic_is_clean():
    problems = codes(validate_mushak(invoice_b()))
    for code in ("mushak_line_arithmetic", "mushak_vat_arithmetic",
                 "mushak_total_mismatch", "mushak_line_uncoded"):
        assert code not in problems
    assert invoice_b().recomputed_grand_total == Decimal("6170.00")
    assert invoice_b().total_price == Decimal("5400.00")
    assert invoice_b().total_vat == Decimal("770.00")


def test_short_bin_is_rejected():
    """BRAC Learning Centre's BIN prints as 123456789-011 — three digits after
    the hyphen, not four."""
    problems = validate_mushak(invoice_b())
    assert "mushak_bin_invalid" in codes(problems)
    assert any("123456789-011" in p.message for p in problems)


def test_valid_bins_pass():
    assert "mushak_bin_invalid" not in codes(validate_mushak(invoice_a()))


# ---- identity checks ------------------------------------------------------


def test_invoice_addressed_to_another_company_is_caught():
    problems = validate_mushak(invoice_a(), our_bin="000111222-0333")
    assert "mushak_purchaser_mismatch" in codes(problems)


def test_invoice_addressed_to_us_passes():
    problems = validate_mushak(invoice_a(), our_bin="001064787-0302")
    assert "mushak_purchaser_mismatch" not in codes(problems)


def test_invoice_from_the_wrong_supplier_is_caught():
    problems = validate_mushak(invoice_a(), supplier_bin="000999888-0777")
    assert "mushak_supplier_mismatch" in codes(problems)


# ---- the Mushak number ----------------------------------------------------


def test_mushak_number_format_accepted():
    assert "mushak_no_format_invalid" not in codes(validate_mushak(invoice_a()))


def test_malformed_mushak_number_is_caught():
    mushak = invoice_a()
    mushak.mushak_no = "INV-2024-99"
    assert "mushak_no_format_invalid" in codes(validate_mushak(mushak))


def test_mushak_numbered_for_the_wrong_fiscal_year_is_caught():
    problems = validate_mushak(invoice_a(), fiscal_year_of_invoice="2026-2027")
    assert "mushak_fiscal_year_mismatch" in codes(problems)

    ok = validate_mushak(invoice_a(), fiscal_year_of_invoice="2024-2025")
    assert "mushak_fiscal_year_mismatch" not in codes(ok)


# ---- supplier-declared rates ---------------------------------------------


def test_declared_rates_are_exposed_for_cross_checking():
    """These are the rates the SUPPLIER claims. Comparing them with our own
    tables is how a supplier charging the wrong VAT gets caught — and the rates
    here match the FY2026-27 schedule we extracted (S001.10 hotel 15%,
    S001.20 restaurant 5%), which is a real corroboration of that extraction."""
    assert declared_vat_rates(invoice_b()) == {
        "S001.10": Decimal("0.15"),
        "S001.20": Decimal("0.05"),
    }
    assert declared_vat_rates(invoice_a()) == {"2105.00.00": Decimal("0.075")}

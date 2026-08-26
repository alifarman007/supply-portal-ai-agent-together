"""Duplicate detection: exact invoice-number match, fuzzy window/percent/signature."""

import datetime as dt
from decimal import Decimal

from app.engines.duplicates import BillSummary, check_duplicates

PCT = Decimal("0.01")
DAYS = 7


def summary(bill_id, invoice_no, date, total, codes=("pro-x",)):
    return BillSummary(
        bill_id=bill_id,
        supplier_invoice_no=invoice_no,
        invoice_date=date,
        claimed_total_tk=Decimal(total),
        product_codes=frozenset(codes),
    )


BASE = summary("BILL-A", "INV-001", dt.date(2026, 9, 1), "1000.00")


def test_exact_duplicate_detected_case_insensitive():
    other = summary("BILL-B", " inv-001 ", dt.date(2026, 9, 10), "999.00")
    excs = check_duplicates(BASE, [other], PCT, DAYS)
    assert [e.code for e in excs] == ["duplicate_exact"]
    assert excs[0].ref == "BILL-B"


def test_fuzzy_duplicate_s11_numbers():
    other = summary("BILL-B", "INV-002", dt.date(2026, 9, 4), "995.00")
    excs = check_duplicates(BASE, [other], PCT, DAYS)
    assert [e.code for e in excs] == ["duplicate_fuzzy"]


def test_fuzzy_outside_amount_window_ignored():
    other = summary("BILL-B", "INV-002", dt.date(2026, 9, 4), "985.00")  # 1.5% off
    assert check_duplicates(BASE, [other], PCT, DAYS) == []


def test_fuzzy_outside_date_window_ignored():
    other = summary("BILL-B", "INV-002", dt.date(2026, 9, 9), "1000.00")  # 8 days
    assert check_duplicates(BASE, [other], PCT, DAYS) == []


def test_fuzzy_dissimilar_signature_ignored():
    other = summary("BILL-B", "INV-002", dt.date(2026, 9, 3), "1000.00", codes=("other-z",))
    assert check_duplicates(BASE, [other], PCT, DAYS) == []


def test_fuzzy_unknown_signature_counts_as_similar():
    other = summary("BILL-B", "INV-002", dt.date(2026, 9, 3), "1000.00", codes=())
    excs = check_duplicates(BASE, [other], PCT, DAYS)
    assert [e.code for e in excs] == ["duplicate_fuzzy"]


def test_self_is_not_a_duplicate():
    assert check_duplicates(BASE, [BASE], PCT, DAYS) == []

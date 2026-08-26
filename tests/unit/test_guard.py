"""Numeric guard: tokenization, canonicalization, percent forms, violations."""

from app.agent.guard import find_violations, number_tokens


def test_tokenizes_money_and_percent_forms():
    assert number_tokens("Net payable is 1,625.00 Tk after 15% VAT") == {"1625", "15"}


def test_comma_and_plain_forms_are_equal():
    assert number_tokens("1,625.00") == number_tokens("1625.00") == {"1625"}


def test_identifier_digits_cancel_against_sources():
    """Identifiers tokenize on BOTH sides (no boundary tricks), so fragments
    cancel against the computed result / bill id instead of being invisible."""
    assert number_tokens("Bill BILL-S2 against PO-S2") == {"2"}
    assert find_violations("Bill BILL-S2 against PO-S2.", {"bill_id": "BILL-S2"}) == []


def test_markdown_emphasis_cannot_hide_numbers():
    breakdown = {"net_payable": "1625.00"}
    assert find_violations("Net payable is _9999_ Tk.", breakdown) == ["9999"]
    assert find_violations("Net payable is **9999** Tk.", breakdown) == ["9999"]


def test_glued_currency_cannot_hide_numbers():
    breakdown = {"net_payable": "1625.00"}
    assert find_violations("Pay Tk9999 now.", breakdown) == ["9999"]
    assert find_violations("Pay 9999Tk now.", breakdown) == ["9999"]


def test_scientific_notation_is_expanded_and_checked():
    breakdown = {"net_payable": "1625.00", "lines": [{"bill_line_no": 1}]}
    assert find_violations("Roughly 2E6 Tk is due.", breakdown) == ["2000000"]
    assert find_violations("Roughly 1.5e3 Tk is due.", breakdown) == ["1500"]


def test_lakh_grouping_is_one_token():
    breakdown = {"net_payable": "1625.00", "retention_held": "0.00", "lines": [{"line": 1}]}
    assert find_violations("Net payable is Tk 1,00,000 as agreed.", breakdown) == ["100000"]
    # the CORRECT amount in lakh convention is accepted
    assert find_violations("Pay Tk 1,10,000.", {"net_payable": "110000.00"}) == []


def test_plain_enumeration_is_not_misparsed_as_grouping():
    assert number_tokens("lines 1, 2 and 3") == {"1", "2", "3"}


def test_clean_report_has_no_violations():
    breakdown = {"net_payable": "1625.00", "approved_base": "1500.00", "vat": [{"rate": "0.15"}]}
    narrative = "Recommendation CLEAR: pay 1,625.00 Tk on a base of 1500.00 Tk (VAT 15%)."
    assert find_violations(narrative, breakdown) == []


def test_invented_number_is_a_violation():
    breakdown = {"net_payable": "1625.00"}
    assert find_violations("Pay 1625.00 Tk minus a 9999 Tk fee.", breakdown) == ["9999"]


def test_rate_may_be_written_as_percent():
    assert find_violations("A 7.5% VDS deduction applies.", {"rate": "0.075"}) == []
    assert find_violations("A 8% VDS deduction applies.", {"rate": "0.075"}) == ["8"]


def test_percent_derivation_never_whitelists_scaled_money():
    """Only fractional tokens (rates) get a x100 percent form — 1625.00 in the
    result must NOT admit an invented 162500."""
    breakdown = {"net_payable": "1625.00"}
    assert find_violations("Pay 162,500.00 Tk.", breakdown) == ["162500"]
    assert find_violations("Pay 162500 Tk.", breakdown) == ["162500"]


def test_sign_is_not_part_of_the_token():
    breakdown = {"price_adjustments": [{"amount": "-100.00"}]}
    assert find_violations("An over-billing cut of 100.00 Tk was applied.", breakdown) == []


def test_ledger_ref_fragments_cancel_out():
    breakdown = {"netting_order": [{"ref": "ADV-S6-001", "amount": "-500.00"}]}
    narrative = "An advance (ref ADV-S6-001) of 500.00 Tk was offset."
    assert find_violations(narrative, breakdown) == []


def test_exceptions_are_also_a_number_source():
    exceptions = [{"message": "billed unit price 120.00 Tk exceeds PO price 100.00 Tk"}]
    narrative = "The unit price of 120.00 Tk was cut to 100.00 Tk."
    assert find_violations(narrative, {}, exceptions) == []

"""Money engine: Decimal-only, ROUND_HALF_UP, integer paisa round-trips."""

from decimal import Decimal

import pytest

from app.engines.money import from_paisa, quantize_taka, taka, to_paisa


def test_to_paisa_exact():
    assert to_paisa("100.00") == 10000
    assert to_paisa("0.01") == 1
    assert to_paisa(Decimal("1500")) == 150000
    assert to_paisa(600) == 60000


def test_round_half_up():
    assert quantize_taka("0.005") == Decimal("0.01")
    assert quantize_taka("2.675") == Decimal("2.68")
    assert quantize_taka("2.674") == Decimal("2.67")
    assert to_paisa("99.995") == 10000


def test_from_paisa():
    assert from_paisa(60000) == Decimal("600.00")
    assert from_paisa(1) == Decimal("0.01")
    assert from_paisa(0) == Decimal("0.00")


def test_round_trip():
    for tk in ("0.01", "1.00", "123.45", "99999.99"):
        assert from_paisa(to_paisa(tk)) == Decimal(tk)


def test_float_is_banned():
    with pytest.raises(TypeError):
        taka(1.5)
    with pytest.raises(TypeError):
        to_paisa(100.0)
    with pytest.raises(TypeError):
        from_paisa(1.0)  # type: ignore[arg-type]
    with pytest.raises(TypeError):
        from_paisa(True)  # type: ignore[arg-type]


def test_bool_is_not_money():
    with pytest.raises(TypeError):
        taka(True)  # type: ignore[arg-type]

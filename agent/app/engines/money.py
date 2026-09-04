"""Deterministic Decimal money helpers (PLAN.md §13).

Money is Decimal in code and integer paisa in the DB, ROUND_HALF_UP to 0.01 Tk.
float is banned for money. Nothing in app/engines/ may import app/llm/.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal

TWO_DP = Decimal("0.01")
PAISA_PER_TAKA = 100


def taka(value: Decimal | int | str) -> Decimal:
    """Exact Decimal constructor for Tk amounts; rejects float outright."""
    if isinstance(value, bool):
        raise TypeError("bool is not a money amount")
    if isinstance(value, float):
        raise TypeError(
            f"float is banned for money (got {value!r}) — pass str, int, or Decimal"
        )
    return Decimal(value)


def quantize_taka(value: Decimal | int | str) -> Decimal:
    """Quantize to 0.01 Tk, ROUND_HALF_UP."""
    return taka(value).quantize(TWO_DP, rounding=ROUND_HALF_UP)


def to_paisa(value: Decimal | int | str) -> int:
    """Tk amount -> integer paisa (exact after 2-dp quantization)."""
    return int(quantize_taka(value) * PAISA_PER_TAKA)


def from_paisa(paisa: int) -> Decimal:
    """Integer paisa -> Tk Decimal with 2 decimal places."""
    if isinstance(paisa, bool) or not isinstance(paisa, int):
        raise TypeError(f"paisa must be int, got {type(paisa).__name__}")
    return (Decimal(paisa) / PAISA_PER_TAKA).quantize(TWO_DP)

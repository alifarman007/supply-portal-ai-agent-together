"""Numeric guard for LLM-written reports (PLAN.md §6.8).

Every number token in the narrative must already exist in the computed result.
Both sides are tokenized with the same regex and canonicalized through Decimal
("1,625.00" == "1625.00" == "1625"), so anything the model copies from the
breakdown is automatically allowed; percent forms of rates (0.15 -> 15) are
derived. Anything else is a violation.
"""

from __future__ import annotations

import json
import re
from decimal import Decimal, InvalidOperation
from typing import Any

# Deliberately boundary-free: EVERY digit run tokenizes, even glued to words,
# underscores, or markdown emphasis (_9999_, Tk9999, **15**) — a guard against
# an untrusted model must not depend on the model's formatting. Identifier
# fragments (BILL-S2's "2", ADV-S6-001's "001") tokenize on BOTH sides, so they
# cancel against the computed result / bill id rather than needing lookarounds.
# Alternatives, tried in order: scientific notation (2E6, 1.5e3 -> canonical
# expanded value), comma-grouped amounts (Western 1,625.00 AND lakh 1,00,000 —
# groups of 2 or 3), plain numbers. Signs are not part of the token.
NUMBER_TOKEN = re.compile(
    r"\d+(?:\.\d+)?[eE][+-]?\d+"
    r"|\d{1,3}(?:,\d{2,3})+(?:\.\d+)?"
    r"|\d+(?:\.\d+)?"
)


def _canon(token: str) -> str | None:
    try:
        return format(Decimal(token.replace(",", "")).normalize(), "f")
    except InvalidOperation:
        return None


def number_tokens(text: str) -> set[str]:
    tokens = set()
    for match in NUMBER_TOKEN.finditer(text):
        canon = _canon(match.group(0))
        if canon is not None:
            tokens.add(canon)
    return tokens


def allowed_numbers(*sources: Any) -> set[str]:
    """Canonical number tokens present in the computed result, plus the
    percent form (x100) of FRACTIONAL tokens only — rates like 0.15 may be
    written as 15%, but 1625.00 must never whitelist an invented 162500."""
    allowed: set[str] = set()
    for source in sources:
        text = source if isinstance(source, str) else json.dumps(source, default=str)
        allowed |= number_tokens(text)
    for token in list(allowed):
        try:
            value = Decimal(token)
        except InvalidOperation:
            continue
        if value < 1:
            allowed.add(format((value * 100).normalize(), "f"))
    return allowed


def find_violations(narrative: str, *sources: Any) -> list[str]:
    """Number tokens in the narrative that do not exist in the computed
    result. Empty list == the report is numerically safe."""
    allowed = allowed_numbers(*sources)
    return sorted(number_tokens(narrative) - allowed)

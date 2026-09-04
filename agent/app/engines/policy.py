"""Exceptions, severities, recommendation (PLAN.md §6.7).

Severities are data: resolved from policies.yaml `exception_severities`,
falling back to REVIEW for unknown codes (surfaced, never silently cleared).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from app.models.checking import Recommendation, Severity


@dataclass
class CheckException:
    code: str
    message: str
    severity: Severity = Severity.REVIEW
    rule_id: str | None = None
    line_no: int | None = None
    ref: str | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def as_dict(self) -> dict[str, Any]:
        return {
            "code": self.code,
            "severity": self.severity.value,
            "message": self.message,
            "rule_id": self.rule_id,
            "line_no": self.line_no,
            "ref": self.ref,
            **({"extra": self.extra} if self.extra else {}),
        }


def apply_severities(
    exceptions: list[CheckException], severities: dict[str, str]
) -> list[CheckException]:
    """Assign each exception its severity from the policy table (in place)."""
    for exc in exceptions:
        configured = severities.get(exc.code)
        if configured is not None:
            exc.severity = Severity(configured)
        else:
            exc.severity = Severity.REVIEW  # unknown code: surface for a human
    return exceptions


def recommend(exceptions: list[CheckException], has_adjustments: bool) -> Recommendation:
    severities = {exc.severity for exc in exceptions}
    if Severity.BLOCKER in severities:
        return Recommendation.BLOCKED
    if Severity.REVIEW in severities:
        return Recommendation.REVIEW_REQUIRED
    if has_adjustments:
        return Recommendation.CLEAR_WITH_ADJUSTMENTS
    return Recommendation.CLEAR

"""Policy engine: data-driven severities and the recommendation matrix."""

from app.engines.policy import CheckException, apply_severities, recommend
from app.models.checking import Recommendation, Severity

SEVERITIES = {"missing_grn": "BLOCKER", "qty_over_grn": "REVIEW", "price_over_po": "INFO"}


def exc(code):
    return CheckException(code=code, message=code)


def test_severities_come_from_policy_table():
    exceptions = [exc("missing_grn"), exc("qty_over_grn"), exc("price_over_po")]
    apply_severities(exceptions, SEVERITIES)
    assert [e.severity for e in exceptions] == [
        Severity.BLOCKER,
        Severity.REVIEW,
        Severity.INFO,
    ]


def test_unknown_code_defaults_to_review():
    exceptions = [exc("never_seen_before")]
    apply_severities(exceptions, SEVERITIES)
    assert exceptions[0].severity == Severity.REVIEW


def test_recommendation_matrix():
    blocker = CheckException("x", "x", severity=Severity.BLOCKER)
    review = CheckException("y", "y", severity=Severity.REVIEW)
    info = CheckException("z", "z", severity=Severity.INFO)

    assert recommend([blocker, review, info], True) == Recommendation.BLOCKED
    assert recommend([review, info], False) == Recommendation.REVIEW_REQUIRED
    assert recommend([info], True) == Recommendation.CLEAR_WITH_ADJUSTMENTS
    assert recommend([], True) == Recommendation.CLEAR_WITH_ADJUSTMENTS
    assert recommend([info], False) == Recommendation.CLEAR
    assert recommend([], False) == Recommendation.CLEAR

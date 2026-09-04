"""Opt-in LIVE API tests (cost real quota; need a key in .env).

Run with:  RUN_LLM_TESTS=1 python -m uv run pytest tests/llm -q
(PowerShell: $env:RUN_LLM_TESTS="1"; python -m uv run pytest tests/llm -q)
"""

import os
from decimal import Decimal

import pytest

from app.agent.pipeline import check_bill
from app.config import get_settings
from app.llm.factory import get_llm_client
from app.models import Recommendation, init_db, make_engine, make_session_factory
from app.seeding import seed

pytestmark = pytest.mark.skipif(
    not os.environ.get("RUN_LLM_TESTS"),
    reason="live LLM tests are opt-in: set RUN_LLM_TESTS=1 and a real API key in .env",
)


@pytest.fixture()
def session():
    engine = make_engine("sqlite:///:memory:")
    init_db(engine)
    with make_session_factory(engine)() as sess:
        seed(sess)
        yield sess


def test_s10_passes_live(session):
    """Phase 3 exit criterion: S10's free-text lines are mapped by the live
    Node A, deterministically re-validated, and the run completes CLEAR."""
    settings = get_settings()
    client = get_llm_client(settings)
    outcome = check_bill(session, "BILL-S10", llm=client)

    assert outcome.recommendation in (
        Recommendation.CLEAR,
        Recommendation.REVIEW_REQUIRED,  # a cautious low-confidence mapping is acceptable
    )
    if outcome.recommendation == Recommendation.CLEAR:
        assert outcome.approved_base == Decimal("2800.00")
        assert outcome.net_payable == Decimal("3080.00")
    print(outcome.report_md)

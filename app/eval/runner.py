"""Phase 6 evaluation harness (PLAN.md §12).

Runs every eval case through the real pipeline and reports:
  * CORRECTNESS  — outcome vs independently-derived ground truth
  * NODE A ACCURACY — LLM line-mapping vs ground truth, by difficulty, with
    confidence calibration (does the model's confidence predict correctness?)
  * NODE B SAFETY — do proposed tax categories resolve to real rule ids?
  * COST / LATENCY — per bill, from the audit trail (PLAN.md §13 targets:
    < 60 s and < ~$0.02 per bill)

Run deterministically (no API cost) with ground-truth mappings injected, or
with `--llm` to exercise and measure the real nodes.
"""

from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any

from sqlalchemy.orm import Session

from app.agent.nodes import propose_line_mappings
from app.agent.pipeline import check_bill
from app.audit.store import AuditStore
from app.engines.matching import BillLineData, MappingProposal, PoLineData
from app.engines.money import from_paisa
from app.eval.dataset import EvalCase
from app.llm.base import LLMClient, LLMError
from app.models import Bill, PurchaseOrder
from app.rules.loader import RuleSet


@dataclass
class MappingOutcome:
    difficulty: str
    expected: dict[int, int]
    actual: dict[int, int]
    confidences: dict[int, float]
    error: str | None = None

    @property
    def total(self) -> int:
        return len(self.expected)

    @property
    def measured(self) -> int:
        """Lines the model actually got a chance to answer. A transport or
        quota failure is NOT a wrong answer — counting it as one understates
        accuracy and hides the real cause."""
        return 0 if self.error else len(self.expected)

    @property
    def correct(self) -> int:
        if self.error:
            return 0
        return sum(1 for k, v in self.expected.items() if self.actual.get(k) == v)


@dataclass
class CostOutcome:
    llm_calls: int = 0
    input_tokens: int = 0
    output_tokens: int = 0
    cost_usd: Decimal | None = None
    llm_latency_ms: float = 0.0
    wall_ms: float = 0.0


@dataclass
class CaseResult:
    case_id: str
    bill_id: str
    title: str
    expected_recommendation: str
    actual_recommendation: str
    expected_net: Decimal | None
    actual_net: Decimal | None
    expected_base: Decimal | None
    actual_base: Decimal | None
    raised_codes: list[str]
    failures: list[str] = field(default_factory=list)
    mapping: MappingOutcome | None = None
    cost: CostOutcome = field(default_factory=CostOutcome)
    node_b_proposals: int = 0
    node_b_resolved: int = 0

    @property
    def passed(self) -> bool:
        return not self.failures


def _token_counts(usage: dict[str, Any] | None) -> tuple[int, int]:
    if not usage:
        return 0, 0
    inp = usage.get("prompt_tokens", usage.get("promptTokenCount", 0)) or 0
    out = usage.get("completion_tokens", usage.get("candidatesTokenCount", 0)) or 0
    return int(inp), int(out)


def _collect_cost(audit: AuditStore, run_ids: list[str], wall_ms: float) -> CostOutcome:
    """Sum every LLM call attributable to this case. Node A is measured OUTSIDE
    the pipeline run (to score it against ground truth), so its calls are
    audited under their own id and must be counted here too — otherwise the
    cost report silently understates the mapping node."""
    cost = CostOutcome(wall_ms=wall_ms)
    total = Decimal(0)
    priced = False
    for run_id in run_ids:
        for record in audit.iter_llm_calls(run_id):
            cost.llm_calls += 1
            inp, out = _token_counts(record.get("usage"))
            cost.input_tokens += inp
            cost.output_tokens += out
            cost.llm_latency_ms += float(record.get("latency_ms") or 0)
            estimate = record.get("estimated_cost_usd")
            if estimate:
                total += Decimal(str(estimate))
                priced = True
    cost.cost_usd = total if priced else None
    return cost


def _measure_node_a(
    session: Session,
    case: EvalCase,
    llm: LLMClient,
    run_id: str,
) -> tuple[MappingOutcome, dict[int, MappingProposal]]:
    """Call Node A exactly as the pipeline would, then score it."""
    bill = session.get(Bill, case.bill.id)
    po = session.get(PurchaseOrder, case.po.id)
    expected = {int(k): v for k, v in case.expectations.node_a_ground_truth.items()}

    po_codes = {line.product_code for line in po.lines}
    unmapped = [
        BillLineData(
            line_no=line.line_no,
            description=line.description,
            product_code=line.product_code,
            qty=line.qty,
            unit_price_tk=from_paisa(line.unit_price_paisa),
            amount_tk=from_paisa(line.amount_paisa),
        )
        for line in bill.lines
        if not line.product_code or line.product_code not in po_codes
    ]
    po_lines = [
        PoLineData(
            line_no=line.line_no,
            product_code=line.product_code,
            qty=line.qty,
            unit_price_tk=from_paisa(line.unit_price_paisa),
            vat_category_id=line.vat_category_id,
            tds_category_id=line.tds_category_id,
            description=line.description,
            uom=line.uom,
        )
        for line in po.lines
    ]
    try:
        proposals = propose_line_mappings(llm, unmapped, po_lines, run_id=run_id)
    except LLMError as err:
        return (
            MappingOutcome(
                difficulty=case.expectations.node_a_difficulty,
                expected=expected,
                actual={},
                confidences={},
                error=str(err),
            ),
            {},
        )
    return (
        MappingOutcome(
            difficulty=case.expectations.node_a_difficulty,
            expected=expected,
            actual={k: v.po_line_no for k, v in proposals.items()},
            confidences={k: v.confidence for k, v in proposals.items()},
        ),
        proposals,
    )


def run_case(
    session: Session,
    case: EvalCase,
    *,
    llm: LLMClient | None = None,
    ruleset: RuleSet | None = None,
    audit: AuditStore | None = None,
) -> CaseResult:
    audit = audit or AuditStore()
    expected = case.expectations

    mapping_outcome: MappingOutcome | None = None
    proposals: dict[int, MappingProposal] | None = None
    # Unique per invocation: the audit log is append-only and shared across
    # runs, so a stable id would make this run inherit an earlier run's calls
    # and overstate its cost.
    node_a_run_id = f"eval-{uuid.uuid4().hex[:12]}-{case.case_id}-nodeA"

    start = time.perf_counter()
    if case.needs_mapping:
        ground_truth = {int(k): v for k, v in expected.node_a_ground_truth.items()}
        if llm is not None:
            # measure the real node, then feed its proposals downstream so the
            # rest of the check reflects what the model actually decided
            mapping_outcome, proposals = _measure_node_a(
                session, case, llm, run_id=node_a_run_id
            )
        else:
            # deterministic mode: inject the ground truth at full confidence
            proposals = {
                k: MappingProposal(po_line_no=v, confidence=1.0)
                for k, v in ground_truth.items()
            }

    # `llm` is passed even when proposals are supplied: the pipeline skips Node A
    # when mapping_proposals is not None, but Nodes B and C must still run so the
    # report and tax-category paths are exercised and costed.
    outcome = check_bill(
        session,
        case.bill.id,
        ruleset=ruleset,
        mapping_proposals=proposals,
        llm=llm,
    )
    wall_ms = (time.perf_counter() - start) * 1000

    raised = [exc.code for exc in outcome.exceptions]
    result = CaseResult(
        case_id=case.case_id,
        bill_id=case.bill.id,
        title=case.title,
        expected_recommendation=expected.recommendation,
        actual_recommendation=outcome.recommendation.value,
        expected_net=expected.net_payable_tk,
        actual_net=outcome.net_payable,
        expected_base=expected.approved_base_tk,
        actual_base=outcome.approved_base,
        raised_codes=raised,
        mapping=mapping_outcome,
        cost=_collect_cost(audit, [outcome.run_id, node_a_run_id], wall_ms),
    )

    if outcome.recommendation.value != expected.recommendation:
        result.failures.append(
            f"recommendation: expected {expected.recommendation}, "
            f"got {outcome.recommendation.value}"
        )
    if expected.net_payable_tk is None:
        if outcome.net_payable is not None:
            result.failures.append(f"net payable: expected none, got {outcome.net_payable}")
    elif outcome.net_payable is None:
        result.failures.append(f"net payable: expected {expected.net_payable_tk}, got none")
    elif outcome.net_payable != expected.net_payable_tk:
        result.failures.append(
            f"net payable: expected {expected.net_payable_tk}, got {outcome.net_payable}"
        )
    if expected.approved_base_tk is not None and outcome.approved_base is not None:
        if outcome.approved_base != expected.approved_base_tk:
            result.failures.append(
                f"approved base: expected {expected.approved_base_tk}, got {outcome.approved_base}"
            )

    for code in expected.must_raise_codes:
        if code not in raised:
            result.failures.append(f"missing exception {code!r} (raised: {raised})")
    for code in expected.must_not_raise_codes:
        if code in raised:
            result.failures.append(f"unexpected exception {code!r}")

    # Node B safety: any proposed category must resolve to a real rule id.
    # tax_category_proposed only fires when the pipeline ACCEPTED a resolvable id.
    result.node_b_proposals = raised.count("tax_category_proposed") + raised.count(
        "unclassified_item"
    )
    result.node_b_resolved = raised.count("tax_category_proposed")

    return result


@dataclass
class EvalReport:
    results: list[CaseResult]
    mode: str

    @property
    def passed(self) -> int:
        return sum(1 for r in self.results if r.passed)

    @property
    def failed(self) -> list[CaseResult]:
        return [r for r in self.results if not r.passed]

    def mapping_stats(self) -> dict[str, dict[str, int]]:
        by_difficulty: dict[str, dict[str, int]] = {}
        for r in self.results:
            if r.mapping is None:
                continue
            bucket = by_difficulty.setdefault(
                r.mapping.difficulty,
                {"lines": 0, "measured": 0, "correct": 0, "cases": 0, "unmeasured": 0},
            )
            bucket["cases"] += 1
            bucket["lines"] += r.mapping.total
            bucket["measured"] += r.mapping.measured
            bucket["correct"] += r.mapping.correct
            bucket["unmeasured"] += r.mapping.total - r.mapping.measured
        return by_difficulty

    def confidence_calibration(self) -> dict[str, dict[str, int]]:
        """Does high confidence actually mean correct? The threshold is only
        trustworthy if wrong mappings cluster below it."""
        buckets = {
            ">=0.90": {"correct": 0, "wrong": 0},
            "0.75-0.89": {"correct": 0, "wrong": 0},
            "<0.75 (rejected)": {"correct": 0, "wrong": 0},
        }
        for r in self.results:
            if r.mapping is None:
                continue
            for line_no, expected_po in r.mapping.expected.items():
                if line_no not in r.mapping.actual:
                    continue
                confidence = r.mapping.confidences.get(line_no, 0.0)
                key = (
                    ">=0.90"
                    if confidence >= 0.90
                    else ("0.75-0.89" if confidence >= 0.75 else "<0.75 (rejected)")
                )
                hit = r.mapping.actual.get(line_no) == expected_po
                buckets[key]["correct" if hit else "wrong"] += 1
        return buckets

    def cost_stats(self) -> dict[str, Any]:
        with_llm = [r for r in self.results if r.cost.llm_calls > 0]
        if not with_llm:
            return {"bills_with_llm": 0}
        walls = sorted(r.cost.wall_ms for r in with_llm)
        costs = [r.cost.cost_usd for r in with_llm if r.cost.cost_usd is not None]
        return {
            "bills_with_llm": len(with_llm),
            "total_llm_calls": sum(r.cost.llm_calls for r in with_llm),
            "avg_calls_per_bill": sum(r.cost.llm_calls for r in with_llm) / len(with_llm),
            "total_input_tokens": sum(r.cost.input_tokens for r in with_llm),
            "total_output_tokens": sum(r.cost.output_tokens for r in with_llm),
            "avg_tokens_per_bill": (
                sum(r.cost.input_tokens + r.cost.output_tokens for r in with_llm) / len(with_llm)
            ),
            "median_wall_ms": walls[len(walls) // 2],
            "max_wall_ms": walls[-1],
            "bills_over_60s": sum(1 for w in walls if w > 60_000),
            "total_cost_usd": str(sum(costs)) if costs else None,
            "avg_cost_usd": str(sum(costs) / len(costs)) if costs else None,
            "bills_over_2_cents": (
                sum(1 for c in costs if c > Decimal("0.02")) if costs else None
            ),
        }

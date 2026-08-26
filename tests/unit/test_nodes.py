"""LLM nodes A/B/C with a fake client: schemas, audit context, repair prompt."""

import json
from decimal import Decimal

import pytest

from app.agent.nodes import (
    propose_line_mappings,
    propose_tax_categories,
    write_report,
)
from app.engines.matching import BillLineData, PoLineData
from app.llm.base import LLMError, LLMResponse
from app.rules.loader import load_ruleset


class FakeLLM:
    provider = "fake"
    model = "fake-model"

    def __init__(self, replies):
        self.replies = list(replies)
        self.calls = []

    def complete(self, messages, json_schema=None, audit_context=None):
        self.calls.append({"messages": messages, "context": audit_context})
        reply = self.replies.pop(0)
        if isinstance(reply, Exception):
            raise reply
        return LLMResponse(
            text=json.dumps(reply),
            parsed_json=reply,
            usage={},
            raw={},
            provider=self.provider,
            model=self.model,
            latency_ms=0.0,
        )


def bill_line(no, desc):
    return BillLineData(
        line_no=no,
        description=desc,
        product_code=None,
        qty=Decimal(1),
        unit_price_tk=Decimal("100.00"),
        amount_tk=Decimal("100.00"),
    )


def po_line(no, code):
    return PoLineData(
        line_no=no,
        product_code=code,
        qty=Decimal(1),
        unit_price_tk=Decimal("100.00"),
        vat_category_id="vat.standard_15",
        tds_category_id="tds.supply_of_goods.s89",
    )


def test_node_a_returns_proposals_with_audit_context():
    llm = FakeLLM(
        [
            {
                "mappings": [
                    {
                        "bill_line_no": 1,
                        "po_line_no": 2,
                        "confidence": 0.9,
                        "rationale": "same item",
                    }
                ]
            }
        ]
    )
    proposals = propose_line_mappings(
        llm, [bill_line(1, "adhesive drum")], [po_line(1, "X"), po_line(2, "ADH")], run_id="r1"
    )
    assert proposals[1].po_line_no == 2
    assert proposals[1].confidence == 0.9
    context = llm.calls[0]["context"]
    assert context["run_id"] == "r1"
    assert context["node"] == "A"
    assert context["prompt_version"]


def test_node_a_propagates_llm_failure():
    llm = FakeLLM([LLMError("down")])
    with pytest.raises(LLMError):
        propose_line_mappings(llm, [bill_line(1, "x")], [po_line(1, "X")], run_id="r1")


def test_node_b_returns_category_proposals():
    rules = load_ruleset("fy2026_27")
    llm = FakeLLM(
        [
            {
                "proposals": [
                    {
                        "line_no": 2,
                        "vat_category_id": "vat.reduced_10",
                        "tds_category_id": None,
                        "confidence": 0.85,
                        "rationale": "reduced-rate goods",
                    }
                ]
            }
        ]
    )
    proposals = propose_tax_categories(
        llm,
        [{"line_no": 2, "description": "cartons", "missing": "vat"}],
        rules,
        run_id="r2",
    )
    assert proposals[2].vat_category_id == "vat.reduced_10"
    assert llm.calls[0]["context"]["node"] == "B"
    # the prompt lists the allowed ids so the model can only choose from them
    assert "vat.reduced_10" in llm.calls[0]["messages"][1]["content"]


def test_node_c_writes_report_and_repair_prompt_mentions_rejection():
    llm = FakeLLM(
        [{"summary_md": "ok"}, {"summary_md": "fixed"}]
    )
    first = write_report(llm, "BILL-X", "CLEAR", {"net_payable": "1.00"}, [], run_id="r3")
    assert first == "ok"
    second = write_report(
        llm, "BILL-X", "CLEAR", {"net_payable": "1.00"}, [], run_id="r3",
        violations=["9999"],
    )
    assert second == "fixed"
    repair_prompt = llm.calls[1]["messages"][1]["content"]
    assert "REJECTED" in repair_prompt
    assert "9999" in repair_prompt
    assert llm.calls[0]["context"]["node"] == "C"

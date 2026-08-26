"""LLM nodes A/B/C (PLAN.md §3) — narrow contracts, JSON-schema outputs,
every call audited with run_id + node + prompt version.

The nodes only ever produce *proposals* and *prose*: Node A mappings are
re-validated deterministically in the matching engine, Node B categories must
resolve to existing rule-table ids, and Node C prose passes the numeric guard
or is replaced by the deterministic template. No node computes money.
No supplier bank details are ever sent to any LLM (PLAN.md §13).
"""

from __future__ import annotations

import hashlib
import json
import re
from pathlib import Path
from typing import Any

from pydantic import BaseModel, Field

from app.engines.matching import BillLineData, MappingProposal, PoLineData
from app.llm.base import LLMClient
from app.rules.loader import RuleSet

PROMPTS_DIR = Path(__file__).resolve().parent / "prompts"


def _prompt(name: str) -> tuple[str, str]:
    """Return (template, version) — version = content hash, recorded in audit."""
    text = (PROMPTS_DIR / f"{name}.md").read_text(encoding="utf-8")
    return text, hashlib.sha256(text.encode("utf-8")).hexdigest()[:12]


def _context(run_id: str | None, node: str, version: str) -> dict[str, Any]:
    return {"run_id": run_id, "node": node, "prompt_version": version}


_MARKER = re.compile(r"<<([A-Z_]+)>>")


def _fill(template: str, values: dict[str, str]) -> str:
    """Single-pass placeholder substitution. Unlike chained .replace(), a
    marker string occurring INSIDE inserted data (e.g. a supplier-controlled
    description containing '<<REPAIR>>') is never re-substituted — data stays
    data."""
    return _MARKER.sub(lambda m: values.get(m.group(1), m.group(0)), template)


SYSTEM = (
    "You are a precise assistant inside an accounts bill-checking pipeline. "
    "You never perform arithmetic and never invent data. Reply with a single "
    "JSON object only — no prose outside JSON, no code fences."
)


# ---- Node A: line mapper ---------------------------------------------------


class LineMappingItem(BaseModel):
    bill_line_no: int
    po_line_no: int
    confidence: float = Field(ge=0, le=1)
    rationale: str


class LineMappings(BaseModel):
    mappings: list[LineMappingItem]


def propose_line_mappings(
    llm: LLMClient,
    unmapped_bill_lines: list[BillLineData],
    po_lines: list[PoLineData],
    run_id: str | None = None,
) -> dict[int, MappingProposal]:
    template, version = _prompt("node_a_line_mapper")
    po_desc = "\n".join(
        f"- PO line {line.line_no}: code={line.product_code}, "
        f"description={line.description!r}, uom={line.uom}, qty={line.qty}, "
        f"unit_price={line.unit_price_tk} Tk"
        for line in po_lines
    )
    bill_desc = "\n".join(
        f"- Bill line {line.line_no}: description={line.description!r}, "
        f"qty={line.qty}, unit_price={line.unit_price_tk} Tk"
        for line in unmapped_bill_lines
    )
    prompt = _fill(template, {"PO_LINES": po_desc, "BILL_LINES": bill_desc})
    response = llm.complete(
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        json_schema=LineMappings,
        audit_context=_context(run_id, "A", version),
    )
    parsed = LineMappings.model_validate(response.parsed_json)
    return {
        item.bill_line_no: MappingProposal(
            po_line_no=item.po_line_no, confidence=item.confidence
        )
        for item in parsed.mappings
    }


# ---- Node B: tax category classifier ---------------------------------------


class CategoryProposalItem(BaseModel):
    line_no: int
    vat_category_id: str | None = None
    tds_category_id: str | None = None
    confidence: float = Field(ge=0, le=1)
    rationale: str


class CategoryProposals(BaseModel):
    proposals: list[CategoryProposalItem]


def propose_tax_categories(
    llm: LLMClient,
    lines: list[dict[str, Any]],  # {line_no, description, missing: "vat"|"tds"|"both"}
    ruleset: RuleSet,
    run_id: str | None = None,
) -> dict[int, CategoryProposalItem]:
    """Proposals are only usable if they resolve to an existing rule id —
    the pipeline re-checks against the ruleset before applying anything."""
    template, version = _prompt("node_b_tax_classifier")
    vat_desc = "\n".join(
        f"- {category_id}: {entry.description_en}"
        for category_id, entry in ruleset.vat_rates.items()
    )
    tds_desc = "\n".join(
        f"- {rule_id}: {rule.law or 'n/a'}" for rule_id, rule in ruleset.tds_rules.items()
    )
    lines_desc = "\n".join(
        f"- Line {line['line_no']}: description={line['description']!r} "
        f"(missing: {line['missing']})"
        for line in lines
    )
    prompt = _fill(
        template,
        {"VAT_CATEGORIES": vat_desc, "TDS_CATEGORIES": tds_desc, "LINES": lines_desc},
    )
    response = llm.complete(
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        json_schema=CategoryProposals,
        audit_context=_context(run_id, "B", version),
    )
    parsed = CategoryProposals.model_validate(response.parsed_json)
    return {item.line_no: item for item in parsed.proposals}


# ---- Node C: report writer -------------------------------------------------


class CfoReport(BaseModel):
    summary_md: str


def write_report(
    llm: LLMClient,
    bill_id: str,
    recommendation: str,
    breakdown: dict[str, Any],
    exceptions: list[dict[str, Any]],
    run_id: str | None = None,
    violations: list[str] | None = None,
) -> str:
    template, version = _prompt("node_c_report_writer")
    repair = ""
    if violations:
        repair = (
            "PREVIOUS ATTEMPT REJECTED: it contained numbers not present in the "
            f"computed result: {violations}. Write it again using ONLY numbers "
            "from the COMPUTED RESULT."
        )
    prompt = _fill(
        template,
        {
            "BILL_ID": bill_id,
            "RECOMMENDATION": recommendation,
            "BREAKDOWN": json.dumps(breakdown, indent=2, default=str),
            "EXCEPTIONS": json.dumps(exceptions, indent=2, default=str),
            "REPAIR": repair,
        },
    )
    response = llm.complete(
        [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
        json_schema=CfoReport,
        audit_context=_context(run_id, "C", version),
    )
    return CfoReport.model_validate(response.parsed_json).summary_md

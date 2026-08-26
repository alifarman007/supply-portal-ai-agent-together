"""FY rule-table loader (PLAN.md §8).

Rates are data, not code: engines get every rate from these YAML tables,
selected by bill date (fiscal year = July–June). Every entry must cite a
source document; entries without one are rejected at load time. PLACEHOLDER
citations are allowed until Phase 5 but flagged via RuleSet.is_placeholder.
"""

from __future__ import annotations

import hashlib
from datetime import date
from decimal import Decimal
from pathlib import Path
from typing import Any, Literal

import yaml
from pydantic import BaseModel, ConfigDict, field_validator, model_validator

from app.config import get_settings

RULES_DIR = Path(__file__).resolve().parent

# A citation starting with any of these means the figure has NOT been confirmed
# by a human against the source document. Phase 5 is not complete until every
# entry carries a plain citation with no marker.
UNVERIFIED_MARKERS = ("PLACEHOLDER", "DRAFT", "UNVERIFIED")


class RulesError(ValueError):
    """A rule table failed validation or could not be found."""


def _to_decimal(v: Any) -> Any:
    if isinstance(v, Decimal):
        return v
    if isinstance(v, float):
        # Tolerated for readability; converted via str() so 0.05 stays "0.05".
        return Decimal(str(v))
    if isinstance(v, (int, str)):
        return Decimal(v)
    return v


def _require_citation(v: str) -> str:
    if not isinstance(v, str) or not v.strip():
        raise ValueError("source_doc citation is required on every rule entry")
    return v.strip()


class TdsSlab(BaseModel):
    min: Decimal
    max: Decimal | None = None
    rate: Decimal

    _dec = field_validator("min", "max", "rate", mode="before")(_to_decimal)


class TdsRule(BaseModel):
    id: str
    law: str | None = None
    source_doc: str
    base: Literal["excl_vat", "incl_vat"]
    slabs: list[TdsSlab]
    uplift_if_no_return_proof: Decimal = Decimal(1)
    effective_from: date
    # Services, Rule 4(1) serials 1-3: a different rate applies when the payee
    # is a natural person rather than a company.
    rate_natural_person: Decimal | None = None
    # Services, Rule 4(1) proviso (kha), serials 4/12/13/18: the tax is the
    # GREATER of (this rate x commission) and (the table rate x total bill),
    # but only where BOTH are disclosed. We cannot see a commission split, so
    # the engine computes on the total bill and raises a REVIEW exception
    # rather than silently taking the lower of the two.
    higher_of_commission_rate: Decimal | None = None

    _dec = field_validator(
        "uplift_if_no_return_proof", "rate_natural_person",
        "higher_of_commission_rate", mode="before",
    )(_to_decimal)
    _cite = field_validator("source_doc")(_require_citation)

    @model_validator(mode="after")
    def _slabs_sane(self) -> TdsRule:
        if not self.slabs:
            raise ValueError(f"tds rule {self.id}: at least one slab required")
        ordered = sorted(self.slabs, key=lambda s: s.min)
        if ordered != self.slabs:
            raise ValueError(f"tds rule {self.id}: slabs must be ordered by min")
        for slab in self.slabs:
            if slab.max is not None and slab.max < slab.min:
                raise ValueError(f"tds rule {self.id}: slab max < min")
        return self


class VdsRule(BaseModel):
    model_config = ConfigDict(extra="allow")

    id: str
    source_doc: str
    applies_if: dict[str, Any] = {}
    action: str | dict[str, Any]
    severity_if_triggered: str | None = None

    _cite = field_validator("source_doc")(_require_citation)

    @field_validator("action", mode="before")
    @classmethod
    def _action_rates_decimal(cls, v):
        if isinstance(v, dict):
            return {k: _to_decimal(val) for k, val in v.items()}
        return v


class VatRate(BaseModel):
    rate: Decimal
    description_en: str
    description_bn: str | None = None
    source_doc: str

    _dec = field_validator("rate", mode="before")(_to_decimal)
    _cite = field_validator("source_doc")(_require_citation)


class DuplicateFuzzy(BaseModel):
    amount_pct: Decimal
    days_window: int

    _dec = field_validator("amount_pct", mode="before")(_to_decimal)


class Policies(BaseModel):
    model_config = ConfigDict(extra="allow")

    source_doc: str
    price_tolerance_tk: Decimal
    qty_tolerance: Decimal
    mapping_confidence_min: float
    duplicate_fuzzy: DuplicateFuzzy
    retention_pct: Decimal
    # Fraction of the running payable one advance may consume: 1.00 = full
    # offset, <1 = proportional recovery (§14.4). Defaulted for older files.
    advance_max_offset_pct: Decimal = Decimal(1)
    advance_scope: Literal["po_and_supplier", "po_only"] = "po_and_supplier"
    auto_clear_max_amount_tk: Decimal | None = None
    po_prices_include_vat: bool
    we_are_withholding_entity: bool
    exception_severities: dict[str, str] = {}

    _dec = field_validator(
        "price_tolerance_tk", "qty_tolerance", "retention_pct",
        "advance_max_offset_pct", "auto_clear_max_amount_tk", mode="before",
    )(_to_decimal)
    _cite = field_validator("source_doc")(_require_citation)

    @model_validator(mode="after")
    def _fractions_in_range(self) -> Policies:
        if not (0 < self.advance_max_offset_pct <= 1):
            raise ValueError(
                f"advance_max_offset_pct must be in (0, 1], got {self.advance_max_offset_pct}"
            )
        if not (0 <= self.retention_pct < 1):
            raise ValueError(f"retention_pct must be in [0, 1), got {self.retention_pct}")
        if not (0 <= self.mapping_confidence_min <= 1):
            raise ValueError(
                f"mapping_confidence_min must be in [0, 1], got {self.mapping_confidence_min}"
            )
        return self


class RuleSet(BaseModel):
    fiscal_year: str
    vat_rates: dict[str, VatRate]
    vds_rules: dict[str, VdsRule]
    tds_rules: dict[str, TdsRule]
    policies: Policies
    version_hash: str

    @property
    def is_placeholder(self) -> bool:
        docs = (
            [r.source_doc for r in self.vat_rates.values()]
            + [r.source_doc for r in self.vds_rules.values()]
            + [r.source_doc for r in self.tds_rules.values()]
            + [self.policies.source_doc]
        )
        return any(doc.upper().startswith(UNVERIFIED_MARKERS) for doc in docs)


def fy_for_date(d: date) -> str:
    """Bangladesh fiscal year (July–June): 2026-07-01..2027-06-30 -> fy2026_27."""
    start_year = d.year if d.month >= 7 else d.year - 1
    return f"fy{start_year}_{(start_year + 1) % 100:02d}"


def _read_yaml(path: Path) -> Any:
    if not path.exists():
        raise RulesError(f"missing rule table: {path}")
    with path.open("r", encoding="utf-8") as fh:
        return yaml.safe_load(fh)


def _require_mapping(doc: Any, path: Path) -> dict:
    if doc is None:
        return {}
    if not isinstance(doc, dict):
        raise RulesError(
            f"{path.name}: top level must be a mapping, got {type(doc).__name__}"
        )
    return doc


def _unique_by_id(entries: Any, path: Path) -> dict[str, dict]:
    if entries is None:
        return {}
    if not isinstance(entries, list):
        raise RulesError(
            f"{path.name}: top level must be a list of entries, got {type(entries).__name__}"
        )
    out: dict[str, dict] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise RulesError(f"{path.name}: entry must be a mapping: {entry!r}")
        entry_id = entry.get("id")
        if not entry_id:
            raise RulesError(f"{path.name}: entry without an id: {entry!r}")
        if entry_id in out:
            raise RulesError(f"{path.name}: duplicate rule id {entry_id!r}")
        out[entry_id] = entry
    return out


def load_ruleset(fy: str | None = None, rules_dir: Path | None = None) -> RuleSet:
    rules_dir = rules_dir or RULES_DIR
    fy = fy or get_settings().default_fiscal_year
    fy_dir = rules_dir / fy
    if not fy_dir.is_dir():
        available = sorted(
            p.name for p in rules_dir.iterdir() if p.is_dir() and p.name != "__pycache__"
        )
        raise RulesError(f"no rule tables for fiscal year {fy!r}; available: {available}")

    files = [
        fy_dir / "vat_rates.yaml",
        fy_dir / "vds_rules.yaml",
        fy_dir / "tds_rules.yaml",
        rules_dir / "policies.yaml",
    ]
    digest = hashlib.sha256()
    for path in files:
        if path.exists():
            digest.update(path.name.encode())
            digest.update(path.read_bytes())

    try:
        vat_raw = _require_mapping(_read_yaml(files[0]), files[0])
        vds_raw = _unique_by_id(_read_yaml(files[1]), files[1])
        tds_raw = _unique_by_id(_read_yaml(files[2]), files[2])
        policies_raw = _require_mapping(_read_yaml(files[3]), files[3])
        return RuleSet(
            fiscal_year=fy,
            vat_rates={
                cat: VatRate(**_require_mapping(spec, files[0]))
                for cat, spec in vat_raw.items()
            },
            vds_rules={rid: VdsRule(**spec) for rid, spec in vds_raw.items()},
            tds_rules={rid: TdsRule(**spec) for rid, spec in tds_raw.items()},
            policies=Policies(**policies_raw),
            version_hash=digest.hexdigest(),
        )
    except RulesError:
        raise
    except (ValueError, TypeError, AttributeError) as err:
        raise RulesError(f"rule tables for {fy} failed validation: {err}") from err


def ruleset_for_date(bill_date: date, rules_dir: Path | None = None) -> RuleSet:
    return load_ruleset(fy_for_date(bill_date), rules_dir=rules_dir)

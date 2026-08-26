"""Owner guarantee: every accounts policy value is tunable by editing
app/rules/policies.yaml alone — no code change, and the ruleset version_hash
records which policy each run used.

These tests edit a COPY of the rules directory and assert the behavior moves.
"""

import shutil
from decimal import Decimal
from pathlib import Path

import pytest

from app.engines.netting import LedgerAmount, build_netting
from app.rules.loader import RULES_DIR, RulesError, load_ruleset


@pytest.fixture()
def rules_dir(tmp_path: Path) -> Path:
    """A writable copy of the real rule tables."""
    shutil.copytree(RULES_DIR / "fy2026_27", tmp_path / "fy2026_27")
    shutil.copy(RULES_DIR / "policies.yaml", tmp_path / "policies.yaml")
    return tmp_path


def edit_policy(rules_dir: Path, old: str, new: str) -> None:
    path = rules_dir / "policies.yaml"
    text = path.read_text(encoding="utf-8")
    assert old in text, f"policy line {old!r} not found — test needs updating"
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


# ---- the recommended defaults actually in force ---------------------------


def test_recommended_defaults_are_loaded():
    policies = load_ruleset("fy2026_27").policies
    assert policies.price_tolerance_tk == Decimal("0")
    assert policies.qty_tolerance == Decimal("0")
    assert policies.advance_max_offset_pct == Decimal("1.00")  # full offset
    assert policies.retention_pct == Decimal("0")
    assert policies.po_prices_include_vat is False
    assert policies.we_are_withholding_entity is True
    assert policies.mapping_confidence_min == 0.75
    assert policies.duplicate_fuzzy.amount_pct == Decimal("0.01")
    assert policies.duplicate_fuzzy.days_window == 7
    assert policies.auto_clear_max_amount_tk is None


# ---- each knob genuinely moves behavior -----------------------------------


def test_price_tolerance_is_tunable(rules_dir: Path):
    assert load_ruleset("fy2026_27", rules_dir=rules_dir).policies.price_tolerance_tk == 0
    edit_policy(rules_dir, 'price_tolerance_tk: "0"', 'price_tolerance_tk: "5.00"')
    assert load_ruleset("fy2026_27", rules_dir=rules_dir).policies.price_tolerance_tk == Decimal(
        "5.00"
    )


def test_withholding_entity_is_tunable(rules_dir: Path):
    edit_policy(rules_dir, "we_are_withholding_entity: true", "we_are_withholding_entity: false")
    policies = load_ruleset("fy2026_27", rules_dir=rules_dir).policies
    assert policies.we_are_withholding_entity is False


def test_po_prices_include_vat_is_tunable(rules_dir: Path):
    edit_policy(rules_dir, "po_prices_include_vat: false", "po_prices_include_vat: true")
    assert load_ruleset("fy2026_27", rules_dir=rules_dir).policies.po_prices_include_vat is True


def test_severity_policy_is_tunable(rules_dir: Path):
    """Escalating price_over_po from INFO to REVIEW is a YAML edit."""
    edit_policy(rules_dir, "  price_over_po: INFO", "  price_over_po: REVIEW")
    policies = load_ruleset("fy2026_27", rules_dir=rules_dir).policies
    assert policies.exception_severities["price_over_po"] == "REVIEW"


def test_changing_policy_changes_the_version_hash(rules_dir: Path):
    """Every run records rules_version, so a policy change is traceable."""
    before = load_ruleset("fy2026_27", rules_dir=rules_dir).version_hash
    edit_policy(rules_dir, 'retention_pct: "0"', 'retention_pct: "0.05"')
    after = load_ruleset("fy2026_27", rules_dir=rules_dir).version_hash
    assert before != after


# ---- advance recovery: full offset vs proportional (§14.4) ----------------


def netting_with(advance_pct: Decimal, advance_tk: str = "500.00"):
    return build_netting(
        approved_base=Decimal("1000.00"),
        vat_lines=[],
        vds=None,
        tds_deductions=[],
        advances=[LedgerAmount(Decimal(advance_tk), "ADV-1")],
        retention_pct=Decimal("0"),
        penalties=[],
        prior_payments=[],
        advance_max_offset_pct=advance_pct,
    )


def test_full_offset_recovers_everything_available():
    result = netting_with(Decimal("1.00"))
    assert result.advance_adjusted == Decimal("500.00")
    assert result.net_payable == Decimal("500.00")


def test_proportional_recovery_caps_the_offset():
    """25% policy: only 250 of the 1000 payable goes to the advance, the
    supplier still gets paid, and the remainder stays open (flagged)."""
    result = netting_with(Decimal("0.25"))
    assert result.advance_adjusted == Decimal("250.00")
    assert result.net_payable == Decimal("750.00")
    assert [e.code for e in result.exceptions] == ["advance_partially_offset"]


def test_proportional_ceiling_is_shared_across_advances():
    result = build_netting(
        approved_base=Decimal("1000.00"),
        vat_lines=[],
        vds=None,
        tds_deductions=[],
        advances=[
            LedgerAmount(Decimal("200.00"), "ADV-1"),
            LedgerAmount(Decimal("200.00"), "ADV-2"),
        ],
        retention_pct=Decimal("0"),
        penalties=[],
        prior_payments=[],
        advance_max_offset_pct=Decimal("0.25"),
    )
    assert result.advance_adjusted == Decimal("250.00")  # 200 + 50, not 400
    assert result.net_payable == Decimal("750.00")


def test_advance_pct_is_tunable_from_yaml(rules_dir: Path):
    edit_policy(
        rules_dir, 'advance_max_offset_pct: "1.00"', 'advance_max_offset_pct: "0.25"'
    )
    policies = load_ruleset("fy2026_27", rules_dir=rules_dir).policies
    assert policies.advance_max_offset_pct == Decimal("0.25")


# ---- guard rails: a bad edit is rejected loudly, never silently applied ----


@pytest.mark.parametrize(
    ("old", "new"),
    [
        ('advance_max_offset_pct: "1.00"', 'advance_max_offset_pct: "1.5"'),
        ('advance_max_offset_pct: "1.00"', 'advance_max_offset_pct: "0"'),
        ('retention_pct: "0"', 'retention_pct: "1.5"'),
        ("mapping_confidence_min: 0.75", "mapping_confidence_min: 5"),
    ],
)
def test_out_of_range_policy_values_are_rejected(rules_dir: Path, old: str, new: str):
    edit_policy(rules_dir, old, new)
    with pytest.raises(RulesError):
        load_ruleset("fy2026_27", rules_dir=rules_dir)

"""Rule-table loader: FY selection, exact Decimal rates, citation enforcement."""

import shutil
from datetime import date
from decimal import Decimal
from pathlib import Path

import pytest

from app.rules.loader import RULES_DIR, RulesError, fy_for_date, load_ruleset, ruleset_for_date


def test_fy_boundaries():
    assert fy_for_date(date(2026, 6, 30)) == "fy2025_26"
    assert fy_for_date(date(2026, 7, 1)) == "fy2026_27"
    assert fy_for_date(date(2027, 6, 30)) == "fy2026_27"
    assert fy_for_date(date(2027, 7, 1)) == "fy2027_28"
    assert fy_for_date(date(2029, 12, 31)) == "fy2029_30"


def test_load_placeholder_ruleset():
    rules = load_ruleset("fy2026_27")
    assert rules.fiscal_year == "fy2026_27"
    assert rules.is_placeholder is True
    assert len(rules.version_hash) == 64

    assert rules.vat_rates["vat.standard_15"].rate == Decimal("0.15")
    assert rules.vat_rates["vat.reduced_10"].rate == Decimal("0.10")
    assert isinstance(rules.vat_rates["vat.standard_15"].rate, Decimal)

    goods = rules.tds_rules["tds.supply_of_goods.s89"]
    assert goods.slabs[0].rate == Decimal("0.05")
    assert goods.uplift_if_no_return_proof == Decimal("1.5")
    assert goods.base == "excl_vat"

    assert "vds.standard_goods" in rules.vds_rules
    assert rules.policies.price_tolerance_tk == Decimal("0")
    assert rules.policies.duplicate_fuzzy.amount_pct == Decimal("0.01")
    assert rules.policies.we_are_withholding_entity is True


def test_ruleset_for_date_selects_fy():
    rules = ruleset_for_date(date(2026, 9, 1))
    assert rules.fiscal_year == "fy2026_27"


def test_unknown_fy_raises_with_available_list():
    with pytest.raises(RulesError, match="fy2031_32"):
        load_ruleset("fy2031_32")


def test_missing_citation_rejected(tmp_path: Path):
    fy_dir = tmp_path / "fy2026_27"
    shutil.copytree(RULES_DIR / "fy2026_27", fy_dir)
    shutil.copy(RULES_DIR / "policies.yaml", tmp_path / "policies.yaml")

    tds = fy_dir / "tds_rules.yaml"
    text = tds.read_text(encoding="utf-8").replace(
        'source_doc: "PLACEHOLDER — Income Tax Paripatra FY2026-27, p.__"',
        'source_doc: ""',
    )
    tds.write_text(text, encoding="utf-8")

    with pytest.raises(RulesError, match="citation"):
        load_ruleset("fy2026_27", rules_dir=tmp_path)


def test_duplicate_rule_id_rejected(tmp_path: Path):
    fy_dir = tmp_path / "fy2026_27"
    shutil.copytree(RULES_DIR / "fy2026_27", fy_dir)
    shutil.copy(RULES_DIR / "policies.yaml", tmp_path / "policies.yaml")

    vds = fy_dir / "vds_rules.yaml"
    original = vds.read_text(encoding="utf-8")
    duplicate_entry = (
        '\n- id: vds.standard_goods\n'
        '  source_doc: "PLACEHOLDER — duplicate"\n'
        '  applies_if: {}\n'
        '  action: no_deduction\n'
    )
    vds.write_text(original + duplicate_entry, encoding="utf-8")

    with pytest.raises(RulesError, match="duplicate rule id"):
        load_ruleset("fy2026_27", rules_dir=tmp_path)


def test_wrong_top_level_shape_raises_ruleserror(tmp_path: Path):
    """A mapping-form file written as a list (or vice versa) must fail as
    RulesError naming the file, never a bare AttributeError."""
    fy_dir = tmp_path / "fy2026_27"
    shutil.copytree(RULES_DIR / "fy2026_27", fy_dir)
    shutil.copy(RULES_DIR / "policies.yaml", tmp_path / "policies.yaml")

    (fy_dir / "vat_rates.yaml").write_text(
        '- id: vat.standard_15\n  rate: "0.15"\n', encoding="utf-8"
    )
    with pytest.raises(RulesError, match="vat_rates.yaml"):
        load_ruleset("fy2026_27", rules_dir=tmp_path)

    shutil.rmtree(fy_dir)
    shutil.copytree(RULES_DIR / "fy2026_27", fy_dir)
    (fy_dir / "vds_rules.yaml").write_text(
        'vds.standard_goods:\n  action: no_deduction\n', encoding="utf-8"
    )
    with pytest.raises(RulesError, match="vds_rules.yaml"):
        load_ruleset("fy2026_27", rules_dir=tmp_path)


def test_version_hash_changes_when_rules_change(tmp_path: Path):
    fy_dir = tmp_path / "fy2026_27"
    shutil.copytree(RULES_DIR / "fy2026_27", fy_dir)
    shutil.copy(RULES_DIR / "policies.yaml", tmp_path / "policies.yaml")

    before = load_ruleset("fy2026_27", rules_dir=tmp_path).version_hash
    assert before == load_ruleset("fy2026_27", rules_dir=tmp_path).version_hash

    vat = fy_dir / "vat_rates.yaml"
    vat.write_text(
        vat.read_text(encoding="utf-8").replace('rate: "0.15"', 'rate: "0.16"'),
        encoding="utf-8",
    )
    assert load_ruleset("fy2026_27", rules_dir=tmp_path).version_hash != before

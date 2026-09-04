"""The progress screen's step list must stay honest.

The portal shows eight rows while a bill is checked, each mapping to a real pipeline step
and owning the exception codes that step can raise
(`portal/src/lib/billcheck/steps.ts`). Two ways that can rot:

  1. A new exception code is added here and belongs to no row, so it never reaches the
     supplier's screen — the check "passes" while quietly flagging something.
  2. A code is renamed and its row stops matching, with the same effect.

Both are silent. This test makes them loud.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest
import yaml

STEPS_TS = (
    Path(__file__).resolve().parents[3] / "portal" / "src" / "lib" / "billcheck" / "steps.ts"
)
POLICIES = Path(__file__).resolve().parents[2] / "app" / "rules" / "policies.yaml"

pytestmark = pytest.mark.skipif(
    not STEPS_TS.exists(), reason="portal/ is not present in this checkout"
)


def codes_claimed_by_the_progress_screen() -> set[str]:
    """Every code listed in a `codes: [...]` array in steps.ts."""
    text = STEPS_TS.read_text(encoding="utf-8")
    claimed: set[str] = set()
    for block in re.findall(r"codes:\s*\[(.*?)\]", text, flags=re.S):
        claimed.update(re.findall(r'"([a-z0-9_]+)"', block))
    return claimed


def codes_the_engine_can_raise() -> set[str]:
    severities = yaml.safe_load(POLICIES.read_text(encoding="utf-8"))["exception_severities"]
    return set(severities)


def test_the_progress_screen_claims_at_least_one_code():
    """Guards the regex itself — an empty parse would make every other test vacuous."""
    assert len(codes_claimed_by_the_progress_screen()) > 20


def test_every_exception_code_belongs_to_a_progress_step():
    """A code with no row is a finding the supplier never sees."""
    missing = codes_the_engine_can_raise() - codes_claimed_by_the_progress_screen()
    assert not missing, (
        "these exception codes are in policies.yaml but no progress step claims them, so "
        f"they would be invisible on the supplier's screen: {sorted(missing)}. "
        "Add each to the right step in portal/src/lib/billcheck/steps.ts."
    )


def test_no_progress_step_claims_a_code_that_cannot_be_raised():
    """A stale code means a row that will never light up — usually a rename."""
    # Codes not in policies.yaml default to REVIEW, so a handful are legitimately absent
    # from the severity table. Only flag ones that appear nowhere in the engine at all.
    engine_source = " ".join(
        path.read_text(encoding="utf-8", errors="ignore")
        for path in (Path(__file__).resolve().parents[2] / "app").rglob("*.py")
    )
    stale = {
        code
        for code in codes_claimed_by_the_progress_screen()
        if code not in codes_the_engine_can_raise() and f'"{code}"' not in engine_source
    }
    assert not stale, (
        f"these codes are claimed by a progress step but nothing raises them: {sorted(stale)}"
    )


def test_no_code_is_claimed_by_two_steps():
    """One finding, one row — otherwise a problem is reported twice."""
    text = STEPS_TS.read_text(encoding="utf-8")
    seen: dict[str, int] = {}
    for block in re.findall(r"codes:\s*\[(.*?)\]", text, flags=re.S):
        for code in re.findall(r'"([a-z0-9_]+)"', block):
            seen[code] = seen.get(code, 0) + 1
    duplicates = {code for code, count in seen.items() if count > 1}
    assert not duplicates, f"claimed by more than one step: {sorted(duplicates)}"


def test_blockers_are_owned_by_early_steps():
    """A blocker stops the pipeline, and every step after it is shown as not reached.

    If a BLOCKER-severity code were owned by, say, the netting step, the screen would show
    seven green ticks and then a blocker — implying work that never happened. Blockers
    belong to the early steps, which is where the pipeline actually raises them.
    """
    severities = yaml.safe_load(POLICIES.read_text(encoding="utf-8"))["exception_severities"]
    blockers = {code for code, sev in severities.items() if sev == "BLOCKER"}

    text = STEPS_TS.read_text(encoding="utf-8")
    blocks = re.findall(r'key:\s*"([a-z]+)".*?codes:\s*\[(.*?)\]', text, flags=re.S)
    order = [key for key, _ in blocks]

    for key, block in blocks:
        for code in re.findall(r'"([a-z0-9_]+)"', block):
            if code in blockers:
                position = order.index(key)
                assert position <= 4, (
                    f"{code!r} is a BLOCKER but is owned by step {position + 1} ({key}). "
                    "A blocker stops the run, so every later step is shown as not reached "
                    "— a blocker owned by a late step implies work that never happened."
                )

"""Rule 1 enforcement: the LLM never does money math.

app/engines/ must be pure deterministic Python — nothing in the package may
import app.llm or app.agent in ANY form: absolute (`import app.llm`,
`from app.llm import x`), via parent (`from app import llm`), or relative
(`from ..llm import x`, `from .. import llm`). Relative imports are resolved
against each file's real package and ImportFrom alias names are expanded, so
every spelling lands on the same absolute module path check.
"""

import ast
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
ENGINES_DIR = REPO_ROOT / "app" / "engines"
FORBIDDEN_PREFIXES = ("app.llm", "app.agent")


def _resolved_imports(source: str, package_parts: tuple[str, ...]) -> list[str]:
    """All modules a file could bind, as absolute dotted paths.

    package_parts is the package CONTAINING the file (e.g. ("app", "engines")
    for app/engines/money.py). For ImportFrom, both the base module and every
    `base.alias` combination are returned, so `from app import llm` resolves
    to "app.llm" and `from .. import llm` (inside app/engines) does too.
    """
    resolved: list[str] = []
    for node in ast.walk(ast.parse(source)):
        if isinstance(node, ast.Import):
            resolved.extend(alias.name for alias in node.names)
        elif isinstance(node, ast.ImportFrom):
            if node.level == 0:
                base = node.module or ""
            else:
                anchor = package_parts[: len(package_parts) - (node.level - 1)]
                base = ".".join((*anchor, node.module) if node.module else anchor)
            if base:
                resolved.append(base)
            resolved.extend(
                f"{base}.{alias.name}" if base else alias.name for alias in node.names
            )
    return resolved


def _is_forbidden(module: str) -> bool:
    return module in FORBIDDEN_PREFIXES or module.startswith(
        tuple(prefix + "." for prefix in FORBIDDEN_PREFIXES)
    )


def _offenders_in(source: str, package_parts: tuple[str, ...]) -> list[str]:
    return [m for m in _resolved_imports(source, package_parts) if _is_forbidden(m)]


def test_engines_package_exists_and_is_nonempty():
    files = list(ENGINES_DIR.rglob("*.py"))
    assert files, "app/engines/ must exist (money engine lives here)"


def test_engines_never_import_llm():
    offenders = []
    for py_file in ENGINES_DIR.rglob("*.py"):
        package_parts = py_file.parent.relative_to(REPO_ROOT).parts
        for module in _offenders_in(py_file.read_text(encoding="utf-8"), package_parts):
            offenders.append(f"{py_file.relative_to(REPO_ROOT)} imports {module}")
    assert not offenders, (
        "Deterministic engines must never touch the LLM layer (PLAN.md §2.1): "
        + "; ".join(offenders)
    )


# --- meta-tests: the checker itself must catch every bypass spelling ---------

ENGINE_PKG = ("app", "engines")


def test_checker_catches_absolute_imports():
    assert _offenders_in("import app.llm", ENGINE_PKG)
    assert _offenders_in("from app.llm import base", ENGINE_PKG)
    assert _offenders_in("from app.llm.base import LLMClient", ENGINE_PKG)
    assert _offenders_in("import app.agent", ENGINE_PKG)


def test_checker_catches_parent_package_form():
    assert _offenders_in("from app import llm", ENGINE_PKG)
    assert _offenders_in("from app import llm, config", ENGINE_PKG)


def test_checker_catches_relative_imports():
    assert _offenders_in("from ..llm import base", ENGINE_PKG)
    assert _offenders_in("from ..llm.base import LLMClient", ENGINE_PKG)
    assert _offenders_in("from .. import llm", ENGINE_PKG)
    assert _offenders_in("from ..agent import nodes", ENGINE_PKG)


def test_checker_allows_legitimate_imports():
    assert not _offenders_in("from decimal import Decimal", ENGINE_PKG)
    assert not _offenders_in("from app.rules.loader import load_ruleset", ENGINE_PKG)
    assert not _offenders_in("from . import money", ENGINE_PKG)
    assert not _offenders_in("from .money import to_paisa", ENGINE_PKG)
    assert not _offenders_in("from app import config", ENGINE_PKG)

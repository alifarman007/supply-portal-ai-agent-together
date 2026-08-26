"""Render an EvalReport as markdown (PLAN.md §12 deliverable)."""

from __future__ import annotations

from datetime import UTC, datetime

from app.eval.runner import EvalReport


def render(report: EvalReport, *, rules_version: str = "", llm_label: str = "") -> str:
    total = len(report.results)
    lines = [
        "# Bill-checking agent — evaluation report",
        "",
        f"- Generated: {datetime.now(UTC).isoformat(timespec='seconds')}",
        f"- Mode: **{report.mode}**" + (f" ({llm_label})" if llm_label else ""),
        f"- Rule tables: `{rules_version[:16]}`" if rules_version else "",
        "",
        "## 1. Correctness",
        "",
        f"**{report.passed}/{total} cases match their independently-derived ground truth.**",
        "",
    ]

    if report.failed:
        lines += [
            "### Disagreements",
            "",
            "Each row is either an implementation defect or a wrong expectation —",
            "both are worth reading before trusting the number above.",
            "",
            "| Case | Title | Disagreement |",
            "|---|---|---|",
        ]
        for r in report.failed:
            for failure in r.failures:
                lines.append(f"| {r.case_id} | {r.title} | {failure} |")
        lines.append("")

    lines += [
        "### All cases",
        "",
        "| Case | Title | Expected | Actual | Net (exp) | Net (act) | OK |",
        "|---|---|---|---|---:|---:|:--:|",
    ]
    for r in report.results:
        exp_net = r.expected_net if r.expected_net is not None else "—"
        act_net = r.actual_net if r.actual_net is not None else "—"
        lines.append(
            f"| {r.case_id} | {r.title} | {r.expected_recommendation} | "
            f"{r.actual_recommendation} | {exp_net} | {act_net} | "
            f"{'✅' if r.passed else '❌'} |"
        )
    lines.append("")

    # ---- Node A -----------------------------------------------------------
    stats = report.mapping_stats()
    if stats:
        lines += ["## 2. Node A — LLM line-mapping accuracy", ""]
        measured = any(r.mapping and r.mapping.confidences for r in report.results)
        if not measured:
            lines += [
                "_Deterministic mode: ground-truth mappings were injected, so this is a"
                " coverage count, not an accuracy measurement. Re-run with `--llm` to"
                " measure the model._",
                "",
            ]
        lines += [
            "Accuracy is over lines the model actually answered. A call that failed"
            " (quota, timeout) is counted as **not measured**, not as a wrong answer —"
            " those are different problems with different fixes.",
            "",
            "| Difficulty | Cases | Measured | Correct | Accuracy | Not measured |",
            "|---|---:|---:|---:|---:|---:|",
        ]
        total_measured = total_correct = total_unmeasured = 0
        for difficulty in ("easy", "medium", "hard", "ambiguous", "none"):
            bucket = stats.get(difficulty)
            if not bucket or bucket["lines"] == 0:
                continue
            total_measured += bucket["measured"]
            total_correct += bucket["correct"]
            total_unmeasured += bucket["unmeasured"]
            accuracy = (
                f"{bucket['correct'] / bucket['measured'] * 100:.0f}%"
                if bucket["measured"]
                else "—"
            )
            lines.append(
                f"| {difficulty} | {bucket['cases']} | {bucket['measured']} | "
                f"{bucket['correct']} | {accuracy} | {bucket['unmeasured']} |"
            )
        if total_measured or total_unmeasured:
            overall = (
                f"**{total_correct / total_measured * 100:.0f}%**"
                if total_measured
                else "—"
            )
            lines.append(
                f"| **overall** | | **{total_measured}** | **{total_correct}** | "
                f"{overall} | **{total_unmeasured}** |"
            )
        lines.append("")

        if measured:
            lines += [
                "### Confidence calibration",
                "",
                "The `mapping_confidence_min` threshold (0.75) is only trustworthy if"
                " wrong mappings cluster *below* it. Wrong mappings with high confidence"
                " are the dangerous quadrant.",
                "",
                "| Confidence | Correct | Wrong |",
                "|---|---:|---:|",
            ]
            for label, bucket in report.confidence_calibration().items():
                lines.append(f"| {label} | {bucket['correct']} | {bucket['wrong']} |")
            lines.append("")

        errors = [r for r in report.results if r.mapping and r.mapping.error]
        if errors:
            lines += [
                "### Node A calls that did not complete",
                "",
                "These are infrastructure failures, not model mistakes. In each case the"
                " pipeline degraded safely: the line was left unmapped and sent to human"
                " review rather than guessed.",
                "",
            ]
            for r in errors:
                detail = " ".join(str(r.mapping.error).split())[:300]
                lines.append(f"- **{r.case_id}**: {detail}")
            lines.append("")

    # ---- Node B -----------------------------------------------------------
    node_b_cases = [r for r in report.results if r.node_b_proposals]
    if node_b_cases:
        resolved = sum(r.node_b_resolved for r in node_b_cases)
        attempted = sum(r.node_b_proposals for r in node_b_cases)
        lines += [
            "## 3. Node B — tax-category safety",
            "",
            f"{len(node_b_cases)} case(s) presented an unclassified item. "
            f"{resolved}/{attempted} were resolved to a real rule id; the remainder "
            "stayed `unclassified_item` and went to human review.",
            "",
            "The safety property is that a proposed id **must** exist in the rule tables "
            "before it can affect money — an unresolvable proposal is discarded, never "
            "guessed at.",
            "",
        ]

    # ---- Cost / latency ---------------------------------------------------
    cost = report.cost_stats()
    lines += ["## 4. Cost and latency per bill", ""]
    if not cost.get("bills_with_llm"):
        lines += [
            "_No LLM calls in this run (deterministic mode) — the pipeline costs"
            " nothing and runs in milliseconds without the nodes._",
            "",
        ]
    else:
        lines += [
            f"- Bills using the LLM: **{cost['bills_with_llm']}**",
            f"- LLM calls: {cost['total_llm_calls']} total, "
            f"{cost['avg_calls_per_bill']:.1f} per bill",
            f"- Tokens: {cost['total_input_tokens']:,} in / "
            f"{cost['total_output_tokens']:,} out "
            f"({cost['avg_tokens_per_bill']:.0f} per bill)",
            f"- Wall time: median {cost['median_wall_ms'] / 1000:.1f}s, "
            f"max {cost['max_wall_ms'] / 1000:.1f}s",
            "",
            "### Against the PLAN.md §13 targets",
            "",
            "| Target | Result |",
            "|---|---|",
            f"| < 60 s per bill | {'✅ ' if cost['bills_over_60s'] == 0 else '❌ '}"
            f"{cost['bills_over_60s']} bill(s) exceeded 60 s |",
        ]
        if cost.get("total_cost_usd") is not None:
            lines.append(
                f"| < ~$0.02 per bill | {'✅ ' if not cost['bills_over_2_cents'] else '❌ '}"
                f"{cost['bills_over_2_cents']} bill(s) exceeded $0.02 "
                f"(avg ${cost['avg_cost_usd']}) |"
            )
        else:
            lines.append(
                "| < ~$0.02 per bill | ⚠️ not measurable — set "
                "`LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK` in `.env` "
                "to price the token counts above |"
            )
        lines.append("")

    return "\n".join(line for line in lines if line is not None)

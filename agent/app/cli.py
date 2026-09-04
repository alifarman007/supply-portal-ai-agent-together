"""Dev CLI: `python -m app.cli <command>`.

Commands: seed | list-bills | check-bill | replay | list-runs | smoke
"""

from __future__ import annotations

import argparse

from app.engines.money import from_paisa
from app.models import Bill, CheckingRun, init_db, make_engine, make_session_factory
from app.seeding import PORTAL_SEEDS_PATH, seed


def _session():
    engine = make_engine()
    init_db(engine)
    return make_session_factory(engine)()


def cmd_seed(args: argparse.Namespace) -> int:
    with _session() as session:
        counts = seed(session)
        print("Seeded golden fixtures (S1-S12):")
        for name, count in counts.items():
            print(f"  {name:<16} {count}")

        if getattr(args, "portal", False):
            if not PORTAL_SEEDS_PATH.exists():
                print(
                    f"\n{PORTAL_SEEDS_PATH.name} not found. Generate it first, from the "
                    "repo root:\n  python scripts/generate_portal_demo_seed.py"
                )
                return 1
            # Additive: the portal universe sits alongside the golden fixtures rather
            # than replacing them, so both demos work from one database.
            portal_counts = seed(session, PORTAL_SEEDS_PATH, wipe=False)
            print("\nSeeded the portal demo universe (matches the supplier portal):")
            for name, count in portal_counts.items():
                print(f"  {name:<16} {count}")
    return 0


def cmd_list_bills(_args: argparse.Namespace) -> int:
    with _session() as session:
        bills = session.query(Bill).order_by(Bill.id).all()
        if not bills:
            print("No bills — run `python -m app.cli seed` first.")
            return 0
        header = (
            f"{'BILL ID':<10} {'SCEN':<5} {'SUPPLIER':<9} {'INVOICE NO':<13} "
            f"{'DATE':<11} {'CLAIMED TK':>11}  STATUS"
        )
        print(header)
        print("-" * len(header))
        for b in bills:
            print(
                f"{b.id:<10} {b.scenario_tag or '-':<5} {b.supplier_id:<9} "
                f"{b.supplier_invoice_no:<13} {b.invoice_date.isoformat():<11} "
                f"{from_paisa(b.claimed_total_paisa):>11}  {b.status.value}"
            )
        print(f"\n{len(bills)} bill(s).")
    return 0


def cmd_check_bill(args: argparse.Namespace) -> int:
    from app.agent.pipeline import check_bill

    llm = None
    if args.llm:
        from app.llm.factory import get_llm_client

        llm = get_llm_client()
        print(f"LLM nodes ON: {llm.provider} / {llm.model}")
    try:
        with _session() as session:
            outcome = check_bill(session, args.bill_id, llm=llm)
    except ValueError as err:  # unknown bill / not checkable
        print(f"REFUSED: {err}")
        return 1
    print(outcome.report_md)
    print()
    print(f"run_id         : {outcome.run_id}")
    print(f"recommendation : {outcome.recommendation.value}")
    print(f"net payable Tk : {outcome.net_payable if outcome.net_payable is not None else '-'}")
    return 0


def cmd_replay(args: argparse.Namespace) -> int:
    """Re-execute a run offline: LLM responses come from the audit record."""
    from app.agent.pipeline import check_bill
    from app.audit.store import AuditStore
    from app.llm.replay import ReplayLLMClient
    from app.models import CheckingResult

    with _session() as session:
        original_run = session.get(CheckingRun, args.run_id)
        if original_run is None:
            print(f"run {args.run_id!r} not found")
            return 1
        original = (
            session.query(CheckingResult).filter_by(run_id=original_run.run_id).first()
        )
        records = AuditStore().iter_llm_calls(original_run.run_id)
        llm = ReplayLLMClient(records) if records else None
        print(
            f"Replaying run {original_run.run_id} (bill {original_run.bill_id}, "
            f"{len(records)} recorded LLM call(s))"
        )
        outcome = check_bill(session, original_run.bill_id, llm=llm)

        new_run = session.get(CheckingRun, outcome.run_id)
        if new_run.rules_version != original_run.rules_version:
            print(
                "WARNING: rule tables changed since the original run "
                f"({original_run.rules_version[:12]} -> {new_run.rules_version[:12]})"
            )
        original_net = original.net_payable_paisa if original else None
        new_result = (
            session.query(CheckingResult).filter_by(run_id=outcome.run_id).one()
        )
        same = (
            original is not None
            and new_result.net_payable_paisa == original_net
            and new_result.recommendation == original.recommendation
        )
        print(f"original : net={original_net} rec={original.recommendation if original else '?'}")
        print(f"replayed : net={new_result.net_payable_paisa} rec={new_result.recommendation}")
        print("REPLAY OK — identical result" if same else "REPLAY MISMATCH")
        return 0 if same else 1


def cmd_list_runs(_args: argparse.Namespace) -> int:
    with _session() as session:
        runs = session.query(CheckingRun).order_by(CheckingRun.started_at).all()
        if not runs:
            print("No checking runs yet (pipeline arrives in Phase 2/3).")
            return 0
        for r in runs:
            print(f"{r.run_id}  bill={r.bill_id}  status={r.status.value}  started={r.started_at}")
    return 0


def cmd_eval(args: argparse.Namespace) -> int:
    """Phase 6 evaluation: correctness, Node A/B accuracy, cost/latency, tuning."""
    from pathlib import Path

    from app.audit.store import AuditStore
    from app.eval.dataset import load_cases, materialize, validate_internal_consistency
    from app.eval.report import render
    from app.eval.runner import EvalReport, run_case
    from app.eval.tuning import render_sweep, sweep
    from app.models import init_db, make_engine, make_session_factory
    from app.rules.loader import load_ruleset

    cases = load_cases()
    problems = validate_internal_consistency(cases)
    if problems:
        print("EVAL FIXTURES ARE INCONSISTENT — refusing to run:")
        for problem in problems:
            print(f"  {problem}")
        return 1
    print(f"Loaded {len(cases)} eval cases.")

    llm = None
    llm_label = ""
    if args.llm:
        from app.llm.factory import get_llm_client

        llm = get_llm_client()
        llm_label = f"{llm.provider}/{llm.model}"
        print(f"LLM nodes ON: {llm_label}")

    # An isolated DB so the eval never touches the working database.
    engine = make_engine("sqlite:///./eval.db" if args.persist else "sqlite:///:memory:")
    init_db(engine)
    ruleset = load_ruleset(args.fiscal_year)
    audit = AuditStore()

    with make_session_factory(engine)() as session:
        materialize(session, cases)
        results = []
        for case in cases:
            result = run_case(session, case, llm=llm, ruleset=ruleset, audit=audit)
            results.append(result)
            mark = "ok  " if result.passed else "FAIL"
            print(f"  [{mark}] {result.case_id}  {result.title[:52]}")
            for failure in result.failures:
                print(f"          {failure}")

        report = EvalReport(results=results, mode="live LLM" if llm else "deterministic")
        markdown = render(report, rules_version=ruleset.version_hash, llm_label=llm_label)

        points = sweep(session, cases)
        markdown += "\n" + render_sweep(
            points,
            current=(ruleset.policies.duplicate_fuzzy.amount_pct,
                     ruleset.policies.duplicate_fuzzy.days_window),
        )

    out_dir = Path("eval_reports")
    out_dir.mkdir(exist_ok=True)
    suffix = "live" if llm else "deterministic"
    out_path = out_dir / f"eval_report_{suffix}.md"
    out_path.write_text(markdown, encoding="utf-8")

    print(f"\n{report.passed}/{len(results)} cases match ground truth.")
    cost = report.cost_stats()
    if cost.get("bills_with_llm"):
        print(
            f"LLM: {cost['total_llm_calls']} calls, "
            f"{cost['total_input_tokens'] + cost['total_output_tokens']:,} tokens, "
            f"median {cost['median_wall_ms'] / 1000:.1f}s/bill"
        )
    print(f"Report written to {out_path}")
    return 0 if not report.failed else 1


def cmd_show_policy(args: argparse.Namespace) -> int:
    """Print the tax tables + accounts policy currently in force."""
    from app.rules.loader import load_ruleset

    rules = load_ruleset(args.fiscal_year)
    policies = rules.policies
    print(f"Fiscal year   : {rules.fiscal_year}")
    print(f"Rules version : {rules.version_hash[:16]}  (recorded on every run)")
    print(f"Source        : {policies.source_doc}")
    if rules.is_placeholder:
        print("STATUS        : *** UNVERIFIED RATES - NOT AUTHORITATIVE ***")
        print("                Entries whose citation starts with PLACEHOLDER or")
        print("                DRAFT have not been confirmed by an accountant.")
    print("\n-- Accounts policy (edit app/rules/policies.yaml) --")
    for label, value in (
        ("price_tolerance_tk", policies.price_tolerance_tk),
        ("qty_tolerance", policies.qty_tolerance),
        ("advance_max_offset_pct", policies.advance_max_offset_pct),
        ("retention_pct", policies.retention_pct),
        ("po_prices_include_vat", policies.po_prices_include_vat),
        ("we_are_withholding_entity", policies.we_are_withholding_entity),
        ("mapping_confidence_min", policies.mapping_confidence_min),
        ("duplicate_fuzzy.amount_pct", policies.duplicate_fuzzy.amount_pct),
        ("duplicate_fuzzy.days_window", policies.duplicate_fuzzy.days_window),
        ("auto_clear_max_amount_tk", policies.auto_clear_max_amount_tk),
    ):
        print(f"  {label:<28} {value}")

    print("\n-- VAT categories (app/rules/{fy}/vat_rates.yaml) --")
    for category_id, entry in rules.vat_rates.items():
        print(f"  {category_id:<24} {entry.rate}   {entry.source_doc}")
    print("\n-- TDS rules (app/rules/{fy}/tds_rules.yaml) --")
    for rule_id, rule in rules.tds_rules.items():
        slabs = ", ".join(
            f"{s.min}-{s.max if s.max is not None else 'inf'} @ {s.rate}" for s in rule.slabs
        )
        print(f"  {rule_id:<28} base={rule.base} uplift={rule.uplift_if_no_return_proof}")
        print(f"    slabs: {slabs}")
        print(f"    cite : {rule.source_doc}")
    print("\n-- VDS rules (app/rules/{fy}/vds_rules.yaml) --")
    for rule_id, rule in rules.vds_rules.items():
        print(f"  {rule_id:<32} {rule.action}")
        print(f"    when : {rule.applies_if}")
        print(f"    cite : {rule.source_doc}")
    return 0


def cmd_smoke(_args: argparse.Namespace) -> int:
    from app.llm.smoke import main as smoke_main

    return smoke_main()


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    uvicorn.run("app.api.main:create_app", factory=True, host=args.host, port=args.port)
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="python -m app.cli", description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    seed_parser = sub.add_parser(
        "seed", help="create tables and load golden fixtures S1-S12"
    )
    seed_parser.add_argument(
        "--portal",
        action="store_true",
        help="also load the purchase orders the supplier portal shows, so a bill "
             "submitted in the portal can be checked here",
    )
    sub.add_parser("list-bills", help="show seeded bills")
    check_parser = sub.add_parser("check-bill", help="run the checking pipeline on one bill")
    check_parser.add_argument("bill_id", help="e.g. BILL-S2")
    check_parser.add_argument(
        "--llm",
        action="store_true",
        help="enable LLM nodes A/B/C (needs an API key in .env; default: deterministic only)",
    )
    replay_parser = sub.add_parser(
        "replay", help="re-execute a run with LLM calls replayed from the audit record"
    )
    replay_parser.add_argument("run_id")
    sub.add_parser("list-runs", help="show checking runs")
    policy_parser = sub.add_parser(
        "show-policy", help="print the tax tables + accounts policy in force"
    )
    policy_parser.add_argument("--fiscal-year", default=None, help="e.g. fy2026_27")
    eval_parser = sub.add_parser(
        "eval", help="run the Phase 6 evaluation set and write a report"
    )
    eval_parser.add_argument(
        "--llm", action="store_true", help="exercise and MEASURE the real LLM nodes"
    )
    eval_parser.add_argument("--fiscal-year", default=None)
    eval_parser.add_argument(
        "--persist", action="store_true", help="keep eval.db instead of an in-memory DB"
    )
    sub.add_parser("smoke", help="LLM connectivity smoke test (same as python -m app.llm.smoke)")
    serve_parser = sub.add_parser("serve", help="run the FastAPI app (CFO review UI)")
    serve_parser.add_argument("--host", default="127.0.0.1")
    serve_parser.add_argument("--port", type=int, default=8000)
    args = parser.parse_args(argv)
    handlers = {
        "seed": cmd_seed,
        "list-bills": cmd_list_bills,
        "check-bill": cmd_check_bill,
        "replay": cmd_replay,
        "list-runs": cmd_list_runs,
        "show-policy": cmd_show_policy,
        "eval": cmd_eval,
        "smoke": cmd_smoke,
        "serve": cmd_serve,
    }
    return handlers[args.command](args)


if __name__ == "__main__":
    raise SystemExit(main())

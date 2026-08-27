"""FastAPI app (PLAN.md §11): intake, checking, CFO review UI, decisions.

Run with:  python -m app.cli serve
      or:  python -m uv run uvicorn app.api.main:create_app --factory

No auth in v1 (single-user local tool); `decided_by` is a form field.
The UI is plain Jinja forms — every action works without JavaScript.
"""

from __future__ import annotations

from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation
from pathlib import Path
from urllib.parse import urlsplit

import httpx
from fastapi import Depends, FastAPI, Form, HTTPException, Request
from fastapi.responses import JSONResponse, RedirectResponse
from fastapi.templating import Jinja2Templates
from pydantic import ValidationError
from sqlalchemy import update as sa_update
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session

from app.adapters.treasury import emit_payment_instruction
from app.agent.pipeline import BillNotCheckableError, check_bill
from app.config import get_settings
from app.engines.money import from_paisa, to_paisa
from app.models import (
    ApprovalRecord,
    Bill,
    BillIn,
    BillStatus,
    CheckingResult,
    CheckingRun,
    Decision,
    PurchaseOrder,
    Supplier,
    init_db,
    make_engine,
    make_session_factory,
)
from app.rules.loader import UNVERIFIED_MARKERS
from app.seeding import bill_from_in

TEMPLATES_DIR = Path(__file__).resolve().parent / "templates"

DECIDABLE_STATUS = BillStatus.PENDING_CFO
PAY_DECISIONS = {Decision.APPROVED, Decision.APPROVED_WITH_CHANGES}


def create_app(
    engine: Engine | None = None,
    *,
    outbox_dir: Path | None = None,
    webhook_url: str | None = None,
    webhook_transport: httpx.BaseTransport | None = None,
) -> FastAPI:
    settings = get_settings()
    engine = engine or make_engine()
    init_db(engine)
    session_factory = make_session_factory(engine)
    resolved_outbox = Path(outbox_dir) if outbox_dir is not None else settings.outbox_dir
    resolved_webhook = webhook_url if webhook_url is not None else settings.treasury_webhook_url

    app = FastAPI(title="billcheck", docs_url="/docs")
    templates = Jinja2Templates(directory=str(TEMPLATES_DIR))

    @app.middleware("http")
    async def same_origin_guard(request: Request, call_next):
        """CSRF defense without dependencies: browsers send an Origin header on
        cross-origin form POSTs — reject any POST whose Origin host differs
        from the Host we are serving. Non-browser clients (curl, TestClient)
        send no Origin and pass."""
        if request.method == "POST":
            origin = request.headers.get("origin")
            if origin and urlsplit(origin).netloc != request.headers.get("host", ""):
                return JSONResponse(
                    {"detail": "cross-origin request rejected"}, status_code=403
                )
        response = await call_next(request)
        # clickjacking: the review UI must never render inside a frame
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Content-Security-Policy", "frame-ancestors 'none'")
        return response

    def get_session():
        with session_factory() as session:
            yield session

    # ---- helpers -----------------------------------------------------------

    def _bill_or_404(session: Session, bill_id: str) -> Bill:
        bill = session.get(Bill, bill_id)
        if bill is None:
            raise HTTPException(404, f"bill {bill_id!r} not found")
        return bill

    def _latest_run(session: Session, bill_id: str) -> CheckingRun | None:
        return (
            session.query(CheckingRun)
            .filter_by(bill_id=bill_id)
            .order_by(CheckingRun.started_at.desc())
            .first()
        )

    def _result_for(session: Session, run: CheckingRun | None) -> CheckingResult | None:
        if run is None:
            return None
        return session.query(CheckingResult).filter_by(run_id=run.run_id).first()

    def _tk(paisa: int | None) -> str | None:
        return None if paisa is None else str(from_paisa(paisa))


    def _pct(rate: str | None) -> str:
        """'0.075' -> '7.5%'. Exact Decimal throughout; never float."""
        if rate is None:
            return "—"
        value = (Decimal(rate) * 100).normalize()
        return f"{value:f}%"

    def _rates_applied(breakdown: dict) -> list[dict]:
        """Every tax rate this run actually applied, with the citation it came
        from and whether a human has confirmed it.

        This is what lets an accountant verify the tables against a REAL bill
        instead of against an abstract list — they see the rate, the amount it
        produced, and the gazette page it was read from, together.
        """
        rows: list[dict] = []
        for v in breakdown.get("vat") or []:
            rows.append({
                "tax": "VAT",
                "rule_id": v.get("category_id"),
                "rate": _pct(v.get("rate")),
                "applies_to": f"line {v.get('line_no')}",
                "base": v.get("base"),
                "amount": v.get("amount"),
                "source_doc": v.get("source_doc") or "",
            })
        for d in breakdown.get("vds_deducted") or []:
            rows.append({
                "tax": "VDS",
                "rule_id": d.get("rule_id"),
                "rate": _pct(d.get("rate")) if d.get("rate") else "no deduction",
                "applies_to": "whole bill",
                "base": d.get("base"),
                "amount": d.get("amount"),
                "source_doc": d.get("source_doc") or "",
            })
        for t in breakdown.get("tds_deducted") or []:
            note = ""
            if t.get("uplift_applied"):
                note = f" x{t.get('uplift')} (no return proof)"
            lines = ", ".join(str(n) for n in (t.get("line_nos") or []))
            rows.append({
                "tax": "TDS",
                "rule_id": t.get("category_id"),
                "rate": _pct(t.get("rate")) + note,
                "applies_to": f"lines {lines}" if lines else "whole bill",
                "base": t.get("base"),
                "amount": t.get("amount"),
                "source_doc": t.get("source_doc") or "",
                "law": t.get("law") or "",
            })
        for row in rows:
            row["unverified"] = row["source_doc"].upper().startswith(UNVERIFIED_MARKERS)
        return rows

    # ---- API: intake / check / status (JSON) -------------------------------

    @app.post("/bills", status_code=201)
    def create_bill(payload: dict, session: Session = Depends(get_session)):
        try:
            bill_in = BillIn.model_validate(payload)
        except ValidationError as err:
            raise HTTPException(422, str(err)) from err
        if session.get(Bill, bill_in.id) is not None:
            raise HTTPException(409, f"bill {bill_in.id!r} already exists")
        if session.get(Supplier, bill_in.supplier_id) is None:
            raise HTTPException(400, f"unknown supplier {bill_in.supplier_id!r}")
        if session.get(PurchaseOrder, bill_in.po_id) is None:
            raise HTTPException(400, f"unknown PO {bill_in.po_id!r}")
        # §5 status machine: intake NEVER honors a client-supplied lifecycle
        # status (a forged APPROVED bill would skip checking AND eat the GRN
        # allowance of genuine bills); scenario_tag is fixture-only.
        bill_in = bill_in.model_copy(
            update={"status": BillStatus.ASSIGNED, "scenario_tag": None}
        )
        bill = bill_from_in(bill_in)
        session.add(bill)
        session.commit()
        return {"id": bill.id, "status": bill.status.value}

    @app.post("/bills/{bill_id}/check")
    def check(
        bill_id: str,
        request: Request,
        llm: bool = False,
        session: Session = Depends(get_session),
    ):
        _bill_or_404(session, bill_id)
        client = None
        if llm:
            from app.llm.factory import get_llm_client

            client = get_llm_client()
        try:
            outcome = check_bill(session, bill_id, llm=client)
        except BillNotCheckableError as err:
            raise HTTPException(409, str(err)) from err
        content_type = request.headers.get("content-type", "")
        if content_type.startswith("application/x-www-form-urlencoded"):
            return RedirectResponse(f"/review/{bill_id}", status_code=303)
        return JSONResponse(
            {
                "run_id": outcome.run_id,
                "recommendation": outcome.recommendation.value,
                "net_payable_tk": str(outcome.net_payable)
                if outcome.net_payable is not None
                else None,
                "exceptions": [exc.as_dict() for exc in outcome.exceptions],
            }
        )

    @app.get("/bills/{bill_id}")
    def bill_status(bill_id: str, session: Session = Depends(get_session)):
        bill = _bill_or_404(session, bill_id)
        run = _latest_run(session, bill_id)
        result = _result_for(session, run)
        return {
            "id": bill.id,
            "status": bill.status.value,
            "supplier_id": bill.supplier_id,
            "po_id": bill.po_id,
            "supplier_invoice_no": bill.supplier_invoice_no,
            "claimed_total_tk": _tk(bill.claimed_total_paisa),
            "latest_run": None
            if run is None
            else {
                "run_id": run.run_id,
                "status": run.status.value,
                "started_at": run.started_at.isoformat(),
                "rules_version": run.rules_version,
                "llm_provider": run.llm_provider,
                "recommendation": result.recommendation.value
                if result is not None and result.recommendation is not None
                else None,
                "net_payable_tk": _tk(result.net_payable_paisa) if result else None,
            },
        }

    # ---- CFO review UI (HTML) ----------------------------------------------

    @app.get("/review")
    def review_queue(request: Request, session: Session = Depends(get_session)):
        bills = (
            session.query(Bill)
            .filter(Bill.status == BillStatus.PENDING_CFO)
            .order_by(Bill.id)
            .all()
        )
        rows = []
        for bill in bills:
            run = _latest_run(session, bill.id)
            result = _result_for(session, run)
            rows.append(
                {
                    "bill": bill,
                    "claimed_tk": _tk(bill.claimed_total_paisa),
                    "recommendation": result.recommendation.value
                    if result is not None and result.recommendation is not None
                    else "-",
                    "net_tk": _tk(result.net_payable_paisa) if result else None,
                }
            )
        return templates.TemplateResponse(
            request, "review_queue.html", {"rows": rows}
        )

    @app.get("/review/{bill_id}")
    def review_detail(
        bill_id: str, request: Request, session: Session = Depends(get_session)
    ):
        bill = _bill_or_404(session, bill_id)
        supplier = session.get(Supplier, bill.supplier_id)
        run = _latest_run(session, bill_id)
        result = _result_for(session, run)
        approvals = [
            {
                "decided_at": record.decided_at,
                "decision": record.decision.value,
                "decided_by": record.decided_by,
                "final_tk": _tk(record.final_net_payable_paisa),
                "comment": record.comment,
            }
            for record in session.query(ApprovalRecord)
            .filter_by(bill_id=bill_id)
            .order_by(ApprovalRecord.decided_at)
            .all()
        ]
        breakdown = result.breakdown if result is not None else {}
        return templates.TemplateResponse(
            request,
            "review_detail.html",
            {
                "bill": bill,
                "supplier": supplier,
                "run": run,
                "result": result,
                "breakdown": breakdown,
                "exceptions": result.exceptions if result is not None else [],
                "claimed_tk": _tk(bill.claimed_total_paisa),
                "net_tk": _tk(result.net_payable_paisa) if result else None,
                "rates_applied": _rates_applied(breakdown),
                "decidable": bill.status == DECIDABLE_STATUS and result is not None,
                "payable": result is not None and result.net_payable_paisa is not None,
                "approvals": approvals,
            },
        )

    @app.post("/review/{bill_id}/decision")
    def post_decision(
        bill_id: str,
        decision: str = Form(...),
        comment: str = Form(""),
        adjusted_net_payable_tk: str = Form(""),
        decided_by: str = Form("CFO"),
        run_id: str = Form(""),
        session: Session = Depends(get_session),
    ):
        bill = _bill_or_404(session, bill_id)
        if bill.status != DECIDABLE_STATUS:
            raise HTTPException(
                409, f"bill {bill_id} is {bill.status.value}, not PENDING_CFO"
            )
        try:
            chosen = Decision(decision)
        except ValueError as err:
            raise HTTPException(422, f"unknown decision {decision!r}") from err

        run = _latest_run(session, bill_id)
        result = _result_for(session, run)
        if run is None or result is None:
            raise HTTPException(409, "bill has no checking result to decide on")
        if run_id and run_id != run.run_id:
            raise HTTPException(
                409,
                "the checking result changed since you loaded the page — "
                "review the latest run before deciding",
            )
        comment = comment.strip()

        final_net_paisa: int | None = None
        if chosen in PAY_DECISIONS:
            if result.net_payable_paisa is None:
                raise HTTPException(
                    400,
                    "checking is BLOCKED — nothing computed to pay; return or reject",
                )
            final_net_paisa = result.net_payable_paisa
            if chosen == Decision.APPROVED_WITH_CHANGES:
                if not comment:
                    raise HTTPException(422, "approve-with-changes requires a comment")
                try:
                    adjusted = Decimal(adjusted_net_payable_tk.strip())
                except (InvalidOperation, AttributeError) as err:
                    raise HTTPException(
                        422, "approve-with-changes requires a valid adjusted amount (Tk)"
                    ) from err
                if not adjusted.is_finite() or adjusted <= 0:
                    raise HTTPException(422, "adjusted amount must be a positive number")
                final_net_paisa = to_paisa(adjusted)
            # post-quantization guard: '0.001' rounds to 0 paisa; a computed
            # net can legitimately be 0.00 (advance-exhausted) — neither is payable
            if final_net_paisa <= 0:
                raise HTTPException(
                    400, "net payable is not positive — nothing to pay; return or reject"
                )
        elif chosen == Decision.RETURNED and not comment:
            raise HTTPException(422, "returning a bill requires a comment")

        # ---- phase 1: ATOMIC status claim + durable approval record --------
        # The claim UPDATE is the single §2.7 no-double-payment gate: of any
        # number of concurrent decision posts, exactly one moves the bill out
        # of PENDING_CFO; the rest match zero rows and get 409.
        target = (
            BillStatus.APPROVED
            if chosen in PAY_DECISIONS
            else (BillStatus.RETURNED if chosen == Decision.RETURNED else BillStatus.REJECTED)
        )
        claimed = session.execute(
            sa_update(Bill)
            .where(Bill.id == bill.id, Bill.status == BillStatus.PENDING_CFO)
            .values(status=target)
        )
        if claimed.rowcount != 1:
            session.rollback()
            raise HTTPException(409, f"bill {bill_id} was decided concurrently")

        approval = ApprovalRecord(
            bill_id=bill.id,
            run_id=run.run_id,
            decision=chosen,
            decided_by=decided_by.strip() or "CFO",
            decided_at=datetime.now(UTC).replace(tzinfo=None),
            comment=comment or None,
            final_net_payable_paisa=final_net_paisa,
        )
        session.add(approval)
        session.commit()  # claim + approval are durable BEFORE any side effect

        # ---- phase 2: emit payment side effects, then finalize -------------
        # An emitted outbox file/webhook always has a committed APPROVED
        # record behind it; a crash here leaves the bill APPROVED (never
        # re-approvable), not double-payable.
        if chosen in PAY_DECISIONS:
            supplier = session.get(Supplier, bill.supplier_id)
            emit_payment_instruction(
                session,
                bill=bill,
                supplier=supplier,
                approval=approval,
                run_id=run.run_id,
                amount_paisa=final_net_paisa,
                outbox_dir=resolved_outbox,
                webhook_url=resolved_webhook,
                webhook_transport=webhook_transport,
            )
            session.execute(
                sa_update(Bill)
                .where(Bill.id == bill.id)
                .values(status=BillStatus.PAYMENT_INSTRUCTED)
            )
            session.commit()

        return RedirectResponse("/review", status_code=303)

    @app.get("/")
    def root():
        return RedirectResponse("/review", status_code=307)

    return app

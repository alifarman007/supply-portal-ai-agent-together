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
from fastapi import Depends, FastAPI, File, Form, HTTPException, Request, UploadFile
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
from app.ingest.parsers import (
    DraftBill,
    DraftLine,
    UploadError,
    check_size,
    draft_to_payload,
    needs_llm,
    parse_csv,
    parse_json,
    suffix_of,
)
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
from app.rules.loader import UNVERIFIED_MARKERS, RulesError
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
        except RulesError as err:
            # Most often: the bill's invoice date falls in a fiscal year we hold no rule
            # tables for. Saying so beats a bare 500, because the fix is obvious once the
            # message names the year - either the date is wrong or the tables are missing.
            raise HTTPException(
                422,
                f"Cannot check this bill: {err}. A bill is checked against the rules in "
                f"force on its invoice date, so an invoice dated outside the loaded "
                f"fiscal years has no rates to apply.",
            ) from err
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
        if request.query_params.get("format") == "json":
            return JSONResponse(
                [
                    {
                        "bill_id": row["bill"].id,
                        "supplier_id": row["bill"].supplier_id,
                        "po_id": row["bill"].po_id,
                        "supplier_invoice_no": row["bill"].supplier_invoice_no,
                        "invoice_date": row["bill"].invoice_date.isoformat()
                        if row["bill"].invoice_date
                        else None,
                        "status": row["bill"].status.value,
                        "claimed_total_tk": row["claimed_tk"],
                        "recommendation": None
                        if row["recommendation"] == "-"
                        else row["recommendation"],
                        "net_payable_tk": row["net_tk"],
                    }
                    for row in rows
                ]
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
        rates_applied = _rates_applied(breakdown)

        # The supplier portal renders this same information as React tabs, so the whole
        # payload is available as JSON. Deliberately the SAME assembled data the HTML page
        # uses rather than a parallel implementation: two views of one bill that could
        # disagree would be worse than one view.
        if request.query_params.get("format") == "json":
            return JSONResponse(
                {
                    "bill": {
                        "id": bill.id,
                        "status": bill.status.value,
                        "supplier_id": bill.supplier_id,
                        "supplier_name": supplier.name if supplier else None,
                        "po_id": bill.po_id,
                        "supplier_invoice_no": bill.supplier_invoice_no,
                        "invoice_date": bill.invoice_date.isoformat()
                        if bill.invoice_date
                        else None,
                        "mushak_6_3_no": bill.mushak_6_3_no,
                        "claimed_total_tk": _tk(bill.claimed_total_paisa),
                    },
                    "run": None
                    if run is None
                    else {
                        "run_id": run.run_id,
                        "status": run.status.value,
                        "started_at": run.started_at.isoformat(),
                        "finished_at": run.finished_at.isoformat()
                        if run.finished_at
                        else None,
                        "rules_version": run.rules_version,
                        "llm_provider": run.llm_provider,
                        "llm_model": run.llm_model,
                    },
                    "recommendation": result.recommendation.value
                    if result is not None and result.recommendation is not None
                    else None,
                    "net_payable_tk": _tk(result.net_payable_paisa) if result else None,
                    "gross_claimed_tk": _tk(result.gross_claimed_paisa) if result else None,
                    "approved_base_tk": _tk(result.approved_base_paisa) if result else None,
                    "breakdown": breakdown,
                    "exceptions": result.exceptions if result is not None else [],
                    "rates_applied": rates_applied,
                    "report_md": result.report_md if result is not None else None,
                    "approvals": [
                        {**record, "decided_at": record["decided_at"].isoformat()}
                        for record in approvals
                    ],
                    # Whether a decision can still be made, and where. Approval stays on
                    # this service: it writes a payment instruction, and the portal has no
                    # authentication to put in front of that.
                    "decidable": bill.status == DECIDABLE_STATUS and result is not None,
                    "review_url": str(request.url.remove_query_params("format")),
                }
            )

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
                "rates_applied": rates_applied,
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


    # ---- Upload a bill file -------------------------------------------------

    @app.get("/upload")
    def upload_form(request: Request, session: Session = Depends(get_session)):
        return templates.TemplateResponse(
            request,
            "upload.html",
            {
                "suppliers": session.query(Supplier).order_by(Supplier.id).all(),
                "purchase_orders": session.query(PurchaseOrder)
                .order_by(PurchaseOrder.id)
                .all(),
                "error": None,
            },
        )

    @app.post("/upload")
    async def upload_file(
        request: Request,
        upload: UploadFile = File(...),
        supplier_id: str = Form(""),
        po_id: str = Form(""),
        bill_id: str = Form(""),
        use_llm: str = Form(""),
        session: Session = Depends(get_session),
    ):
        """Parse the file into a DRAFT and show it for confirmation.

        This endpoint deliberately does NOT create a bill. Two of the three
        input paths involve reading a document, and a misread line on a
        supplier bill is money — so a person confirms every value first.
        """
        filename = upload.filename or ""
        content = await upload.read()
        try:
            check_size(content)
            suffix = suffix_of(filename)
            if suffix == ".json":
                draft = parse_json(content)
            elif suffix == ".csv":
                draft = parse_csv(content)
            elif needs_llm(filename):
                if not use_llm:
                    raise UploadError(
                        f"{filename} is a document, so reading it needs the AI "
                        "reader. Tick the box to allow it, or upload a CSV/JSON."
                    )
                from app.ingest.extract import extract_bill
                from app.llm.factory import get_llm_client

                draft = extract_bill(
                    get_llm_client(), filename=filename, content=content
                )
            else:
                raise UploadError(
                    f"unsupported file type {suffix or '(none)'} — upload a .csv, "
                    ".json, .pdf, .png or .jpg"
                )
        except UploadError as err:
            return templates.TemplateResponse(
                request,
                "upload.html",
                {
                    "suppliers": session.query(Supplier).order_by(Supplier.id).all(),
                    "purchase_orders": session.query(PurchaseOrder)
                    .order_by(PurchaseOrder.id)
                    .all(),
                    "error": str(err),
                },
                status_code=400,
            )

        # Form values win over anything read from the file: the person filling
        # them in knows which PO this bill belongs to; the document usually
        # does not say.
        draft.supplier_id = supplier_id.strip() or draft.supplier_id
        draft.po_id = po_id.strip() or draft.po_id
        draft.id = bill_id.strip() or draft.id
        if not draft.claimed_total_tk:
            draft.claimed_total_tk = draft.computed_total()

        return templates.TemplateResponse(
            request,
            "upload_preview.html",
            {
                "draft": draft,
                "filename": filename,
                "computed_total": draft.computed_total(),
                "suppliers": session.query(Supplier).order_by(Supplier.id).all(),
                "purchase_orders": session.query(PurchaseOrder)
                .order_by(PurchaseOrder.id)
                .all(),
            },
        )

    @app.post("/upload/confirm")
    async def upload_confirm(
        request: Request, session: Session = Depends(get_session)
    ):
        """Create the bill from the CONFIRMED values, then check it.

        Everything arrives as form fields a human has just looked at. It still
        goes through the same BillIn validation and the same status forcing as
        the JSON intake — confirmation is not a licence to skip checks.
        """
        form = await request.form()
        draft = DraftBill(
            id=str(form.get("id") or ""),
            supplier_id=str(form.get("supplier_id") or ""),
            po_id=str(form.get("po_id") or ""),
            supplier_invoice_no=str(form.get("supplier_invoice_no") or ""),
            invoice_date=str(form.get("invoice_date") or ""),
            mushak_6_3_no=str(form.get("mushak_6_3_no") or ""),
            claimed_total_tk=str(form.get("claimed_total_tk") or ""),
        )
        index = 0
        while f"line_{index}_qty" in form:
            draft.lines.append(
                DraftLine(
                    line_no=int(str(form.get(f"line_{index}_no") or index + 1) or index + 1),
                    description=str(form.get(f"line_{index}_description") or ""),
                    product_code=str(form.get(f"line_{index}_product_code") or ""),
                    qty=str(form.get(f"line_{index}_qty") or ""),
                    unit_price_tk=str(form.get(f"line_{index}_unit_price_tk") or ""),
                    amount_tk=str(form.get(f"line_{index}_amount_tk") or ""),
                )
            )
            index += 1

        if not draft.lines:
            raise HTTPException(400, "the bill has no lines")

        payload = draft_to_payload(draft)
        try:
            bill_in = BillIn.model_validate(payload)
        except ValidationError as err:
            raise HTTPException(422, f"the confirmed values are not valid: {err}") from err
        if session.get(Bill, bill_in.id) is not None:
            raise HTTPException(409, f"bill {bill_in.id!r} already exists")
        if session.get(Supplier, bill_in.supplier_id) is None:
            raise HTTPException(400, f"unknown supplier {bill_in.supplier_id!r}")
        if session.get(PurchaseOrder, bill_in.po_id) is None:
            raise HTTPException(400, f"unknown PO {bill_in.po_id!r}")

        bill_in = bill_in.model_copy(
            update={"status": BillStatus.ASSIGNED, "scenario_tag": None}
        )
        session.add(bill_from_in(bill_in))
        session.commit()

        try:
            check_bill(session, bill_in.id)
        except BillNotCheckableError as err:
            raise HTTPException(409, str(err)) from err
        return RedirectResponse(f"/review/{bill_in.id}", status_code=303)

    @app.get("/")
    def root():
        return RedirectResponse("/review", status_code=307)

    return app

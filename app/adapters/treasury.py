"""Treasury payment-instruction emitter (PLAN.md §11).

On CFO approval: write the instruction JSON to outbox/ (always) and POST it to
TREASURY_WEBHOOK_URL when set. The JSON is the contract Treasury Receive will
consume in Phase L. Amounts are integer paisa + exact Tk strings — no floats.
A webhook failure is recorded, never fatal: the outbox file is the source of
truth and the instruction stays 'emitted'.
"""

from __future__ import annotations

import json
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx
from sqlalchemy.orm import Session

from app.engines.money import from_paisa
from app.models import ApprovalRecord, Bill, PaymentInstruction, PaymentStatus, Supplier


def emit_payment_instruction(
    session: Session,
    *,
    bill: Bill,
    supplier: Supplier,
    approval: ApprovalRecord,
    run_id: str,
    amount_paisa: int,
    outbox_dir: Path,
    webhook_url: str = "",
    webhook_transport: httpx.BaseTransport | None = None,
) -> PaymentInstruction:
    instruction_id = f"PI-{uuid.uuid4().hex[:12]}"
    created_at = datetime.now(UTC)  # zone-aware in the contract; naive-UTC in DB
    bank_details = {
        "account_name": supplier.bank_account_name,
        "account_no": supplier.bank_account_no,
        "bank_name": supplier.bank_name,
        "bank_branch": supplier.bank_branch,
    }
    payload = {
        "instruction_id": instruction_id,
        "bill_id": bill.id,
        "run_id": run_id,
        "supplier_id": supplier.id,
        "supplier_name": supplier.name,
        "supplier_invoice_no": bill.supplier_invoice_no,
        "bank_details": bank_details,
        "amount_paisa": amount_paisa,
        "amount_tk": str(from_paisa(amount_paisa)),
        "currency": "BDT",
        "approved_by": approval.decided_by,
        # decided_at is stored naive-UTC; the wire contract carries the zone
        "approved_at": approval.decided_at.replace(tzinfo=UTC).isoformat(),
        "decision": approval.decision.value,
        "created_at": created_at.isoformat(),
    }

    outbox_dir = Path(outbox_dir)
    outbox_dir.mkdir(parents=True, exist_ok=True)
    outbox_path = outbox_dir / f"{instruction_id}.json"
    outbox_path.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8"
    )

    webhook_response = None
    if webhook_url:
        try:
            with httpx.Client(timeout=10, transport=webhook_transport) as client:
                # stream + cap: never buffer an unbounded response body
                with client.stream("POST", webhook_url, json=payload) as response:
                    body = b""
                    for chunk in response.iter_bytes():
                        body += chunk
                        if len(body) >= 2048:
                            break
                webhook_response = {
                    "status_code": response.status_code,
                    "body": body[:500].decode("utf-8", "replace"),
                }
        except Exception as err:  # noqa: BLE001 — the webhook must NEVER be
            # fatal (§11): httpx.InvalidURL and friends fall outside HTTPError,
            # and by this point the outbox file is already the source of truth.
            webhook_response = {"error": f"{type(err).__name__}: {err}"}

    instruction = PaymentInstruction(
        id=instruction_id,
        bill_id=bill.id,
        bank_details=bank_details,
        amount_paisa=amount_paisa,
        currency="BDT",
        created_at=created_at.replace(tzinfo=None),
        status=PaymentStatus.EMITTED,
        outbox_path=str(outbox_path),
        webhook_response=webhook_response,
    )
    session.add(instruction)
    return instruction

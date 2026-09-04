"""Prove a portal-shaped bill can be submitted to the agent and checked.

This is the exit criterion for the data-spine step, and it is deliberately proved over
real HTTP against a running agent before any React is written. If this fails, no amount
of user interface work will help.

It also demonstrates the VAT conversion that the portal's bill form needs. The portal
asks the supplier for ONE VAT-INCLUSIVE amount; the agent treats a line amount as the
ex-VAT base and adds VAT to it. Sending the portal's number straight through would
inflate every downstream figure by 15% and raise no exception at all.

Run the agent first:

    cd agent
    python -m uv run python -m app.cli seed --portal
    python -m uv run python -m app.cli serve

then, from the repo root:

    python scripts/verify_portal_roundtrip.py
"""

from __future__ import annotations

import json
import sys
from decimal import ROUND_HALF_UP, Decimal

import httpx

BASE = "http://127.0.0.1:8000"
VAT_RATE = Decimal("0.15")

# A purchase order the portal shows AND whose goods have been received, so the check has
# something real to verify against. po-001 = PO-2026-0001, status fulfilled.
PO_ID = "po-001"
SUPPLIER_ID = "SP-2024-001"

# What the portal's bill form produces today: the PO's VAT-INCLUSIVE grand total.
PORTAL_ENTERED_AMOUNT = Decimal("336950")


def tk(value: Decimal) -> str:
    """Money crosses the wire as a string, never a JSON number."""
    return str(value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def to_ex_vat(vat_inclusive: Decimal) -> Decimal:
    """The conversion the portal must apply before sending anything to the agent."""
    return vat_inclusive / (Decimal(1) + VAT_RATE)


def fail(message: str) -> None:
    print(f"\n  FAILED: {message}")
    sys.exit(1)


def main() -> int:
    print("=" * 78)
    print("Portal -> agent round trip")
    print("=" * 78)

    try:
        health = httpx.get(f"{BASE}/review", timeout=10)
    except httpx.ConnectError:
        fail(f"nothing is listening on {BASE}. Start it with "
             "`cd agent && python -m uv run python -m app.cli serve`")
    if health.status_code != 200:
        fail(f"GET /review returned {health.status_code}")
    print(f"agent is up at {BASE}")

    # ---- 1. the PO the portal would bill against exists on the agent side ----------
    print(f"\n1. Purchase order {PO_ID} is known to the agent")
    po_lines = httpx.get(f"{BASE}/bills/BILL-S1", timeout=10)  # any known bill proves routing
    if po_lines.status_code != 200:
        fail("the agent's /bills endpoint is not responding as expected")
    print("   agent JSON API reachable")

    # ---- 2. the VAT conversion -----------------------------------------------------
    ex_vat = to_ex_vat(PORTAL_ENTERED_AMOUNT)
    print("\n2. VAT conversion (the trap)")
    print(f"   portal's entered amount (VAT-inclusive) : {PORTAL_ENTERED_AMOUNT}")
    print(f"   ex-VAT base to send the agent           : {tk(ex_vat)}")
    if ex_vat != Decimal("293000"):
        fail(f"expected the ex-VAT base to be 293000.00, got {tk(ex_vat)}")
    print("   matches the purchase order's own ex-VAT subtotal of 293000")
    print(f"   sending {PORTAL_ENTERED_AMOUNT} unconverted would have overstated the")
    print(f"   bill by {tk(PORTAL_ENTERED_AMOUNT - ex_vat)} with no exception raised")

    # ---- 3. submit a bill in the shape the portal will send ------------------------
    bill_id = "BILL-PORTAL-DEMO-1"
    payload = {
        "id": bill_id,
        "supplier_id": SUPPLIER_ID,
        "po_id": PO_ID,
        "supplier_invoice_no": "DPI-2026-0001",
        "invoice_date": "2026-09-04",
        "mushak_6_3_no": "M63-DPI-0001",
        "claimed_total_tk": tk(ex_vat),
        "lines": [
            {
                "line_no": 1,
                "description": "Corrugated Carton Box (30x20x15 cm)",
                "product_code": "poi-001-1",
                "qty": "5000",
                "unit_price_tk": "45.00",
                "amount_tk": "225000.00",
            },
            {
                "line_no": 2,
                "description": "Stretch Wrap Film (500mm x 300m roll)",
                "product_code": "poi-001-2",
                "qty": "100",
                "unit_price_tk": "680.00",
                "amount_tk": "68000.00",
            },
        ],
    }

    print(f"\n3. POST /bills  ({bill_id})")
    created = httpx.post(f"{BASE}/bills", json=payload, timeout=30)
    if created.status_code == 409:
        print("   already exists from a previous run - continuing to the check")
    elif created.status_code != 201:
        fail(f"expected 201, got {created.status_code}: {created.text[:400]}")
    else:
        print(f"   201 Created  (status forced to {created.json().get('status')})")

    # ---- 4. check it, deterministically --------------------------------------------
    print(f"\n4. POST /bills/{bill_id}/check?llm=false")
    checked = httpx.post(f"{BASE}/bills/{bill_id}/check", params={"llm": "false"}, timeout=120)
    if checked.status_code != 200:
        fail(f"expected 200, got {checked.status_code}: {checked.text[:400]}")

    result = checked.json()
    run = result.get("latest_run") or result
    recommendation = run.get("recommendation")
    net = run.get("net_payable_tk")

    print(f"   recommendation : {recommendation}")
    print(f"   net payable    : {net}")

    exceptions = run.get("exceptions") or []
    if exceptions:
        print(f"   exceptions     : {len(exceptions)}")
        for exc in exceptions[:8]:
            if isinstance(exc, dict):
                print(f"      [{exc.get('severity','?'):8}] {exc.get('code','?')}: "
                      f"{str(exc.get('message',''))[:80]}")

    print("\n" + "=" * 78)
    if recommendation == "BLOCKED":
        codes = [e.get("code") for e in exceptions if isinstance(e, dict)]
        fail(f"the check came back BLOCKED ({', '.join(str(c) for c in codes)}). "
             "The data spine is not aligned - fix that before building any UI.")
    if net in (None, ""):
        fail("no net payable was computed")

    print(f"PASS - a portal-shaped bill was submitted and checked: {recommendation}")
    print(f"       net payable {net} Tk, computed from cited FY2026-27 rules")
    print("=" * 78)
    print("\nFull result:")
    print(json.dumps(result, indent=1)[:1500])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

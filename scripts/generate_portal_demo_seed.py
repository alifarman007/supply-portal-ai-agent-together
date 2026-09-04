"""Generate the agent seed that mirrors the portal's demo purchase orders.

WHY THIS EXISTS
---------------
The portal and the agent were built separately and invented their own demo data. A bill
submitted in the portal against `po-001` was uncheckable by the agent, which had never
heard of it: `POST /bills` rejects an unknown PO with a 400, a PO with no goods receipt is
a `missing_grn` BLOCKER, and a PO line with no tax category yields `unclassified_item` and
charges no tax at all. So aligning the two data sets is a precondition for the user
interface, not a tidy-up afterwards.

This script reads the portal's mock purchase orders and emits an agent seed file with
matching suppliers, purchase orders, PO lines and goods receipts. Run it again whenever
the portal's mock data changes:

    python scripts/generate_portal_demo_seed.py
    cd agent && python -m uv run python -m app.cli seed --portal

WHAT IT DOES NOT DO
-------------------
It emits no bills. Bills are what the *user* creates through the portal — seeding them
would defeat the point of the demo.

It does not touch `agent/seeds/scenarios.json`. Those are the golden S1-S12 fixtures that
306 tests depend on, and they stay exactly as they are.

PARSING NOTE
------------
The portal's mock data is TypeScript, so this parses it with regular expressions. That is
normally a bad idea. It is acceptable here only because every number extracted is checked
against the source file's own subtotal / VAT / grand-total arithmetic before anything is
written — if the parse drifts, the script fails loudly rather than seeding wrong money.
"""

from __future__ import annotations

import json
import re
import sys
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
PORTAL_DB = ROOT / "portal" / "src" / "lib" / "mock" / "db.ts"
OUT = ROOT / "agent" / "seeds" / "portal_demo.json"

# --- classification -----------------------------------------------------------------
# Every line in the portal's demo data is packaging material: cartons, stretch wrap,
# woven and kraft bags, bubble wrap, foam protectors, labels, tape, poly bags, shrink
# film. Under the FY2026-27 Withholding Tax Rules that is Rule 3(1) serial 17 - "supply
# of raw materials and packing materials used in industrial production" - at 3%, not the
# 5% residual. VAT is the standard 15% band, which the portal's own mock arithmetic
# already assumes (every PO has vatAmount == subtotal * 0.15 exactly).
VAT_CATEGORY = "vat.standard_15"
TDS_CATEGORY = "tds.goods.s89.serial_17"

# --- PO status ----------------------------------------------------------------------
# The portal's status describes DELIVERY progress; the agent's describes BILLING progress.
# They are different axes, and conflating them is a trap: mapping the portal's "fulfilled"
# (goods fully received, therefore ready to bill) onto the agent's "closed" would make
# every real bill fail with a `po_not_open` BLOCKER. A PO is billable in the agent while
# it is `open` or `partially_billed`; nothing has been billed yet in the demo, so every
# live PO maps to `open`.
STATUS_MAP = {
    "issued": "open",
    "acknowledged": "open",
    "partially_fulfilled": "open",
    "fulfilled": "open",
    "cancelled": "cancelled",
    "draft": "cancelled",
}

# --- goods receipts -----------------------------------------------------------------
# A GRN is proof the goods arrived, so only POs whose goods actually arrived get one.
# That keeps the demo honest and shows both paths: bill a fulfilled PO and the check
# clears; bill an `issued` one and you get the `missing_grn` BLOCKER, which is the
# correct answer - you cannot pay for goods you have not received.
GRN_FRACTION = {
    "fulfilled": Decimal("1.00"),
    "partially_fulfilled": Decimal("0.60"),
}

ITEM_RE = re.compile(
    r'\{\s*id:\s*"(?P<id>[^"]+)",\s*'
    r'description:\s*"(?P<description>[^"]*)",\s*'
    r'unit:\s*"(?P<unit>[^"]*)",\s*'
    r'quantity:\s*(?P<quantity>[\d.]+),\s*'
    r'unitPrice:\s*(?P<unitPrice>[\d.]+),\s*'
    r'totalPrice:\s*(?P<totalPrice>[\d.]+)\s*\}'
)


def _scalar(chunk: str, name: str, quoted: bool = False) -> str | None:
    pattern = rf'{name}:\s*"([^"]*)"' if quoted else rf'{name}:\s*([\d.]+)'
    match = re.search(pattern, chunk)
    return match.group(1) if match else None


def parse_purchase_orders(text: str) -> list[dict]:
    block = text[text.index("export const purchaseOrders"):text.index("export const invoices")]
    starts = [m.start() for m in re.finditer(r'\n  \{\n\s*id: "po-', block)] + [len(block)]

    orders = []
    for start, end in zip(starts, starts[1:]):
        chunk = block[start:end]
        po_id = _scalar(chunk, "id", quoted=True)
        if not po_id or not po_id.startswith("po-"):
            continue
        orders.append({
            "id": po_id,
            "po_number": _scalar(chunk, "poNumber", quoted=True),
            "status": _scalar(chunk, "status", quoted=True),
            "issued_date": _scalar(chunk, "issuedDate", quoted=True),
            "subtotal": _scalar(chunk, "subtotal"),
            "vat_amount": _scalar(chunk, "vatAmount"),
            "grand_total": _scalar(chunk, "grandTotal"),
            "items": [m.groupdict() for m in ITEM_RE.finditer(chunk)],
        })
    return orders


def verify(orders: list[dict]) -> list[str]:
    """Check the parse against the source file's own arithmetic."""
    problems: list[str] = []
    for po in orders:
        if not po["items"]:
            problems.append(f"{po['id']}: no line items parsed")
            continue
        for item in po["items"]:
            qty, price, total = (Decimal(item[k]) for k in ("quantity", "unitPrice", "totalPrice"))
            if qty * price != total:
                problems.append(f"{po['id']}/{item['id']}: {qty} x {price} != {total}")
        line_sum = sum(Decimal(i["totalPrice"]) for i in po["items"])
        if line_sum != Decimal(po["subtotal"]):
            problems.append(f"{po['id']}: lines total {line_sum} != subtotal {po['subtotal']}")
        if Decimal(po["subtotal"]) + Decimal(po["vat_amount"]) != Decimal(po["grand_total"]):
            problems.append(f"{po['id']}: subtotal + VAT != grandTotal")
        if not STATUS_MAP.get(po["status"] or ""):
            problems.append(f"{po['id']}: unmapped portal status {po['status']!r}")
    return problems


def parse_supplier(text: str) -> dict:
    block = text[text.index("export const supplierProfile"):]
    block = block[:block.index("};") + 2]
    return {
        "id": _scalar(block, "id", quoted=True),
        "name": _scalar(block, "companyName", quoted=True),
        "bin_no": _scalar(block, "binNumber", quoted=True),
        "etin": _scalar(block, "tinNumber", quoted=True),
        "bank_name": _scalar(block, "bankName", quoted=True),
        "bank_branch": _scalar(block, "bankBranch", quoted=True),
        "bank_account_no": _scalar(block, "accountNumber", quoted=True),
        "bank_account_name": _scalar(block, "accountHolderName", quoted=True),
    }


def build(orders: list[dict], supplier: dict) -> dict:
    trimmed = lambda q: str(Decimal(q).normalize())  # noqa: E731 - "5000" not "5000.0"

    purchase_orders = []
    grns = []
    for po in orders:
        purchase_orders.append({
            "id": po["id"],
            "supplier_id": supplier["id"],
            "order_date": (po["issued_date"] or "2026-06-01")[:10],
            "status": STATUS_MAP[po["status"]],
            "lines": [
                {
                    "line_no": n,
                    "product_code": item["id"],
                    "description": item["description"],
                    "uom": item["unit"],
                    "qty": trimmed(item["quantity"]),
                    "unit_price_tk": f"{Decimal(item['unitPrice']):.2f}",
                    "vat_category_id": VAT_CATEGORY,
                    "tds_category_id": TDS_CATEGORY,
                }
                for n, item in enumerate(po["items"], start=1)
            ],
        })

        fraction = GRN_FRACTION.get(po["status"] or "")
        if fraction is None:
            continue  # goods have not arrived; billing this PO SHOULD block
        grns.append({
            "id": po["id"].replace("po-", "GRN-PORTAL-"),
            "po_id": po["id"],
            "grn_date": (po["issued_date"] or "2026-06-01")[:10],
            "lines": [
                {
                    "po_line_no": n,
                    "qty_received": trimmed(Decimal(item["quantity"]) * fraction),
                    "qty_accepted": trimmed(Decimal(item["quantity"]) * fraction),
                    "qty_rejected": "0",
                }
                for n, item in enumerate(po["items"], start=1)
            ],
        })

    return {
        "_comment": (
            "GENERATED FILE - do not edit by hand. Regenerate with "
            "`python scripts/generate_portal_demo_seed.py`. Mirrors the portal's demo "
            "purchase orders (portal/src/lib/mock/db.ts) so a bill submitted in the "
            "portal is checkable by the agent. Every line is packaging material, "
            f"classified {TDS_CATEGORY} (3%) and {VAT_CATEGORY}. POs whose goods have "
            "not arrived deliberately have NO goods receipt, so billing them returns the "
            "missing_grn BLOCKER - which is the correct answer."
        ),
        "suppliers": [{
            **supplier,
            "has_return_submission_proof": True,
            "is_natural_person": False,
            "status": "active",
        }],
        "purchase_orders": purchase_orders,
        "grns": grns,
        "bills": [],
        "ledger_entries": [],
    }


def main() -> int:
    if not PORTAL_DB.exists():
        print(f"cannot find the portal's mock data at {PORTAL_DB}", file=sys.stderr)
        return 1

    text = PORTAL_DB.read_text(encoding="utf-8")
    orders = parse_purchase_orders(text)
    supplier = parse_supplier(text)

    problems = verify(orders)
    if problems:
        print(f"*** parse failed its own arithmetic check ({len(problems)} problems) ***",
              file=sys.stderr)
        for problem in problems[:20]:
            print(f"    {problem}", file=sys.stderr)
        print("Refusing to write a seed file from an untrusted parse.", file=sys.stderr)
        return 1

    if not supplier["id"] or not supplier["name"]:
        print("could not parse the portal's supplier profile", file=sys.stderr)
        return 1

    payload = build(orders, supplier)
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")

    billable = sum(1 for po in payload["purchase_orders"] if po["status"] == "open")
    print(f"supplier   : {supplier['name']} ({supplier['id']}, BIN {supplier['bin_no']})")
    print(f"POs        : {len(payload['purchase_orders'])} "
          f"({billable} open, {len(payload['purchase_orders']) - billable} cancelled)")
    print(f"PO lines   : {sum(len(po['lines']) for po in payload['purchase_orders'])}")
    print(f"goods recd : {len(payload['grns'])} GRNs "
          f"(the rest block on missing_grn, by design)")
    print(f"wrote      : {OUT.relative_to(ROOT)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

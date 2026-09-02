"""Turn an uploaded bill file into a DRAFT the user can check and correct.

Nothing here creates a bill. Every path produces a draft that is rendered back
for a human to confirm, because two of the three paths involve reading a
document rather than being handed structured data — and a misread line on a
supplier bill is money.

Three input shapes:
  JSON  — the same object POST /bills accepts. Deterministic.
  CSV   — the bill LINES only; the header fields come from the form.
          Deterministic.
  PDF / image — read by the LLM (Gemini). Never trusted: the extracted values
          are shown for confirmation and the file's own arithmetic is
          recomputed rather than believed.
"""

from __future__ import annotations

import csv
import io
import json
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation
from typing import Any

# Upload limits. A Mushak 6.3 is a page or two; anything far larger is either a
# mistake or an attempt to exhaust memory.
MAX_UPLOAD_BYTES = 8 * 1024 * 1024
TEXT_SUFFIXES = {".json", ".csv"}
FILE_SUFFIXES = {".pdf", ".png", ".jpg", ".jpeg", ".webp"}
MIME_BY_SUFFIX = {
    ".pdf": "application/pdf",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
}


class UploadError(ValueError):
    """The uploaded file could not be turned into a draft bill."""


@dataclass
class DraftLine:
    line_no: int = 0
    description: str = ""
    product_code: str = ""
    qty: str = ""
    unit_price_tk: str = ""
    amount_tk: str = ""


@dataclass
class DraftBill:
    """A proposed bill awaiting human confirmation. Strings throughout: these
    are unvalidated values a person is about to check, and coercing them early
    would hide what the file actually said."""

    id: str = ""
    supplier_id: str = ""
    po_id: str = ""
    supplier_invoice_no: str = ""
    invoice_date: str = ""
    mushak_6_3_no: str = ""
    claimed_total_tk: str = ""
    lines: list[DraftLine] = field(default_factory=list)
    source: str = ""            # "json" | "csv" | "llm:<model>"
    notes: list[str] = field(default_factory=list)

    def computed_total(self) -> str:
        """Sum of the line amounts, recomputed. Never the file's own total."""
        total = Decimal(0)
        for line in self.lines:
            try:
                total += Decimal(line.amount_tk or "0")
            except InvalidOperation:
                return ""
        return str(total)


def suffix_of(filename: str) -> str:
    name = (filename or "").lower().strip()
    dot = name.rfind(".")
    return name[dot:] if dot != -1 else ""


def needs_llm(filename: str) -> bool:
    return suffix_of(filename) in FILE_SUFFIXES


def mime_for(filename: str) -> str:
    suffix = suffix_of(filename)
    if suffix not in MIME_BY_SUFFIX:
        raise UploadError(f"unsupported file type {suffix or '(none)'}")
    return MIME_BY_SUFFIX[suffix]


def check_size(content: bytes) -> None:
    if len(content) > MAX_UPLOAD_BYTES:
        raise UploadError(
            f"file is {len(content) // 1024} KB; the limit is "
            f"{MAX_UPLOAD_BYTES // 1024} KB"
        )
    if not content:
        raise UploadError("the file is empty")


def _text(content: bytes) -> str:
    try:
        return content.decode("utf-8-sig")
    except UnicodeDecodeError as err:
        raise UploadError(
            "the file is not readable as UTF-8 text — if it is a scan or PDF, "
            "upload it with a .pdf/.png/.jpg extension instead"
        ) from err


def parse_json(content: bytes) -> DraftBill:
    """A full bill object, the same shape POST /bills accepts."""
    try:
        payload = json.loads(_text(content))
    except json.JSONDecodeError as err:
        raise UploadError(f"not valid JSON: {err}") from err
    if not isinstance(payload, dict):
        raise UploadError("expected a JSON object describing one bill")

    draft = DraftBill(source="json")
    for attr in (
        "id", "supplier_id", "po_id", "supplier_invoice_no",
        "invoice_date", "mushak_6_3_no", "claimed_total_tk",
    ):
        value = payload.get(attr)
        setattr(draft, attr, "" if value is None else str(value))

    raw_lines = payload.get("lines")
    if not isinstance(raw_lines, list) or not raw_lines:
        raise UploadError("the JSON has no lines array — expected a lines: [...] field")
    for index, raw in enumerate(raw_lines, start=1):
        if not isinstance(raw, dict):
            raise UploadError(f"line {index} is not an object")
        draft.lines.append(
            DraftLine(
                line_no=int(raw.get("line_no") or index),
                description=str(raw.get("description") or ""),
                product_code=(
                    "" if raw.get("product_code") in (None, "")
                    else str(raw["product_code"])
                ),
                qty=str(raw.get("qty") or ""),
                unit_price_tk=str(raw.get("unit_price_tk") or ""),
                amount_tk=str(raw.get("amount_tk") or ""),
            )
        )
    return draft


# Accepted CSV headers, lower-cased. Several spellings so a hand-made file
# from a spreadsheet does not fail on a column name.
_CSV_ALIASES = {
    "line_no": {"line_no", "line", "sl", "sl no", "sl_no", "serial"},
    "description": {"description", "details", "item", "particulars", "details of supply"},
    "product_code": {"product_code", "code", "product", "item_code", "sku"},
    "qty": {"qty", "quantity", "qnty", "quantity in pcs"},
    "unit_price_tk": {"unit_price_tk", "unit_price", "rate", "price", "unit price (taka)"},
    "amount_tk": {"amount_tk", "amount", "total", "total price", "total price (taka)", "value"},
}


def _column_map(fieldnames: list[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for raw in fieldnames or []:
        key = (raw or "").strip().lower()
        for target, aliases in _CSV_ALIASES.items():
            if key in aliases:
                mapping[target] = raw
                break
    return mapping


def parse_csv(content: bytes) -> DraftBill:
    """The bill LINES. Header fields (PO, supplier, dates) come from the form."""
    reader = csv.DictReader(io.StringIO(_text(content)))
    columns = _column_map(list(reader.fieldnames or []))

    missing = {"description", "qty", "unit_price_tk"} - set(columns)
    if missing:
        raise UploadError(
            "the CSV is missing column(s) " + ", ".join(sorted(missing))
            + ". Expected headers like: line_no, description, product_code, "
            "qty, unit_price_tk, amount_tk"
        )

    draft = DraftBill(source="csv")
    for index, row in enumerate(reader, start=1):
        if not any((value or "").strip() for value in row.values()):
            continue  # skip blank rows a spreadsheet export often leaves behind

        def cell(target: str, _row=row) -> str:
            column = columns.get(target)
            return (_row.get(column) or "").strip() if column else ""

        qty, price = cell("qty"), cell("unit_price_tk")
        amount = cell("amount_tk")
        if not amount:
            # Derive it rather than leaving it blank, and say so.
            try:
                amount = str(Decimal(qty) * Decimal(price))
            except (InvalidOperation, ValueError):
                amount = ""
        raw_line_no = cell("line_no")
        draft.lines.append(
            DraftLine(
                line_no=int(raw_line_no) if raw_line_no.isdigit() else index,
                description=cell("description"),
                product_code=cell("product_code"),
                qty=qty,
                unit_price_tk=price,
                amount_tk=amount,
            )
        )

    if not draft.lines:
        raise UploadError("the CSV has a header but no data rows")
    if "amount_tk" not in columns:
        draft.notes.append(
            "The CSV had no amount column, so each line amount was computed as "
            "quantity x unit price. Check them."
        )
    return draft


def draft_to_payload(draft: DraftBill) -> dict[str, Any]:
    """DraftBill -> the dict BillIn validates. Called only AFTER a human has
    confirmed the values in the form."""
    return {
        "id": draft.id.strip(),
        "supplier_id": draft.supplier_id.strip(),
        "po_id": draft.po_id.strip(),
        "supplier_invoice_no": draft.supplier_invoice_no.strip(),
        "invoice_date": draft.invoice_date.strip(),
        "mushak_6_3_no": draft.mushak_6_3_no.strip() or None,
        "claimed_total_tk": draft.claimed_total_tk.strip(),
        "lines": [
            {
                "line_no": line.line_no,
                "description": line.description.strip(),
                "product_code": line.product_code.strip() or None,
                "qty": line.qty.strip(),
                "unit_price_tk": line.unit_price_tk.strip(),
                "amount_tk": line.amount_tk.strip(),
            }
            for line in draft.lines
        ],
    }

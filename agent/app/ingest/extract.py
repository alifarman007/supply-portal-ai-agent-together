"""Node E — read a PDF or scanned bill into a DRAFT (PLAN.md §9, Phase L).

PLAN.md permits LLM field extraction from PDF and scanned bills, "human-
verified". That qualifier is the whole design: this module never creates a
bill. It produces a draft that is rendered back into a form for a person to
correct, and every figure it returns is treated as a claim.

Two guardrails beyond the prompt:
  * the model is told NOT to calculate. If a line has qty and price but no
    printed amount, it leaves the amount empty and WE derive it — visibly, and
    flagged — rather than trusting arithmetic done inside a language model.
  * the file's own totals are never adopted. The draft's total is recomputed
    from the lines, and a disagreement with the printed total is surfaced.
    A real supplier invoice in this project's sample set has a wrong total.
"""

from __future__ import annotations

import base64
from decimal import Decimal, InvalidOperation

from pydantic import BaseModel, Field

from app.agent.nodes import SYSTEM, _context, _fill, _prompt
from app.ingest.parsers import DraftBill, DraftLine, UploadError, mime_for
from app.llm.base import Attachment, LLMClient, LLMError


class ExtractedLine(BaseModel):
    line_no: int = 0
    description: str = ""
    product_code: str = ""
    qty: str = ""
    unit_price_tk: str = ""
    amount_tk: str = ""


class ExtractedBill(BaseModel):
    supplier_name: str = ""
    supplier_bin: str = ""
    purchaser_name: str = ""
    purchaser_bin: str = ""
    supplier_invoice_no: str = ""
    invoice_date: str = ""
    mushak_6_3_no: str = ""
    printed_total_tk: str = Field(
        default="", description="the grand total as PRINTED; treated as a claim"
    )
    lines: list[ExtractedLine] = Field(default_factory=list)
    uncertain_fields: list[str] = Field(default_factory=list)


def extract_bill(
    llm: LLMClient,
    *,
    filename: str,
    content: bytes,
    run_id: str | None = None,
) -> DraftBill:
    """Read the document and return a draft for a human to confirm."""
    template, version = _prompt("node_e_bill_extractor")
    prompt = _fill(template, {"EXTRA": ""})

    attachment = Attachment(
        filename=filename,
        mime_type=mime_for(filename),
        data_b64=base64.b64encode(content).decode("ascii"),
    )
    try:
        response = llm.complete(
            [{"role": "system", "content": SYSTEM}, {"role": "user", "content": prompt}],
            json_schema=ExtractedBill,
            audit_context=_context(run_id, "E", version),
            attachments=[attachment],
        )
    except LLMError as err:
        raise UploadError(
            f"could not read {filename}: {err}. You can still enter the bill by "
            "hand, or upload it as CSV or JSON."
        ) from err

    parsed = ExtractedBill.model_validate(response.parsed_json)
    draft = DraftBill(
        source=f"llm:{llm.model}",
        supplier_invoice_no=parsed.supplier_invoice_no,
        invoice_date=parsed.invoice_date,
        mushak_6_3_no=parsed.mushak_6_3_no,
    )

    derived_any = False
    for index, line in enumerate(parsed.lines, start=1):
        amount = (line.amount_tk or "").strip()
        if not amount:
            # The model was told not to multiply. Do it here, in the open.
            try:
                amount = str(Decimal(line.qty) * Decimal(line.unit_price_tk))
                derived_any = True
            except (InvalidOperation, ValueError):
                amount = ""
        draft.lines.append(
            DraftLine(
                line_no=line.line_no or index,
                description=line.description.strip(),
                product_code=line.product_code.strip(),
                qty=line.qty.strip(),
                unit_price_tk=line.unit_price_tk.strip(),
                amount_tk=amount,
            )
        )

    # Our own total, from the lines. The printed one is only ever compared.
    draft.claimed_total_tk = draft.computed_total()

    draft.notes.append(
        f"Read from {filename} by {llm.model}. Every value below is the model's "
        "reading of the document and has NOT been verified — check it against "
        "the file before saving."
    )
    if derived_any:
        draft.notes.append(
            "One or more line amounts were not printed on the document and were "
            "computed as quantity x unit price. Check those lines especially."
        )
    if parsed.uncertain_fields:
        draft.notes.append(
            "The reader was unsure about: " + ", ".join(parsed.uncertain_fields)
        )
    printed = (parsed.printed_total_tk or "").strip()
    if printed and draft.claimed_total_tk:
        try:
            if Decimal(printed) != Decimal(draft.claimed_total_tk):
                draft.notes.append(
                    f"The document prints a total of {printed}, but its own lines "
                    f"add up to {draft.claimed_total_tk}. The line total is used. "
                    "A real supplier invoice in this project had exactly this "
                    "defect, so check which figure is right."
                )
        except InvalidOperation:
            pass
    if parsed.supplier_bin or parsed.purchaser_bin:
        draft.notes.append(
            f"Document names supplier BIN {parsed.supplier_bin or '(none)'} "
            f"({parsed.supplier_name or 'unnamed'}) and purchaser BIN "
            f"{parsed.purchaser_bin or '(none)'} "
            f"({parsed.purchaser_name or 'unnamed'}). Confirm the purchaser is us."
        )
    return draft

You map supplier bill lines to purchase-order lines for an accounts team.

Some bill lines have no product code. For EACH bill line listed below, propose
which PO line it corresponds to, with a confidence between 0 and 1.

Rules:
- Judge only by description, unit of measure, quantity, and unit price.
- Every bill line gets exactly one proposal; every PO line may be used at most once.
- If you are unsure, still answer but give a LOW confidence (below 0.5).
- Do not compute any amounts. Do not invent PO lines.

PO lines:
<<PO_LINES>>

Bill lines to map:
<<BILL_LINES>>

Reply with JSON only, matching the required schema:
{"mappings": [{"bill_line_no": <int>, "po_line_no": <int>, "confidence": <0..1>, "rationale": "<short reason>"}]}

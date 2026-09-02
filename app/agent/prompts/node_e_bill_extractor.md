You are reading a supplier bill so an accounts clerk can check it. Extract only
what the document actually shows.

RULES — a wrong figure here becomes a wrong payment:
- Copy every number EXACTLY as printed. Do not round, convert, or tidy.
- Do NOT calculate anything. If a line shows a quantity and a unit price but no
  amount, leave the amount empty rather than multiplying it yourself.
- If a field is absent, unreadable, or you are unsure, leave it EMPTY and say so
  in `uncertain_fields`. An empty field a human fills in is far better than a
  confident guess.
- Do not invent a purchase-order number, a supplier code, or a bill reference
  that is not printed on the document.
- Dates: return as YYYY-MM-DD. Bangladeshi invoices often print DD/MM/YYYY, so
  27/11/2024 is 2024-11-27. If the order is genuinely ambiguous, leave it empty
  and note it.
- Money: digits and a decimal point only. Strip commas and currency words, so
  "৳ 4,000.00" becomes 4000.00.

A Mushak 6.3 tax invoice usually shows: the supplier ("Name of Registered
Person") with a BIN, the purchaser with a BIN, a Mushak number like
1001/2024-2025, an invoice number, a date of issue, and a table of supply lines.
On that table, the line description often begins with a classification code —
either a service code such as S001.10 or an HS code such as 2105.00.00 —
followed by a hyphen and the item name. Put the WHOLE description, code
included, in `description`.

Column (6) "Total Price" is the price BEFORE duty and VAT. That is the one to
use for `amount_tk`. Do NOT use column (11) "Total Price with all Duty & VAT",
and do not treat VAT or supplementary duty as part of the line amount.

<<EXTRA>>

Reply with JSON only, matching the required schema.

# NBR source documents

Drop the official NBR PDFs in this folder. They are the **evidence** behind every
tax rate the agent applies; the YAML rule tables in `app/rules/` cite them by name
in each entry's `source_doc` field.

Nothing here is read at runtime — PLAN.md §8 forbids the running system from
touching nbr.gov.bd. The flow is deliberately offline and human-gated:

```
official NBR PDF  →  extraction (may be LLM-assisted)  →  HUMAN REVIEW
                  →  committed YAML with citation  →  loader validates  →  engines
```

## Why this matters

Every rate here becomes real money withheld from a real supplier and remitted to
the government. A wrong figure means either under-deducting (our liability, with
penalties) or over-deducting (the supplier is short-paid). **No rate enters the
YAML tables without a human reading it in the official document.** Rates found on
the web — including anything researched by an AI assistant — are a starting point
for locating the right document, never a substitute for it.

Until real documents land here, all tables are marked `PLACEHOLDER` and
`python -m app.cli show-policy` prints a loud warning.

## What is needed (PLAN.md §14.1) and what each document feeds

| # | Document | Bangla name | Feeds |
|---|---|---|---|
| 1 | **Income Tax Paripatra, FY2026-27** | আয়কর পরিপত্র ২০২৬-২৭ | `fy2026_27/tds_rules.yaml` — the whole file |
| 2 | **TDS / withholding rate chart** (Income Tax Act 2023, esp. supply of goods & services) | উৎসে কর কর্তন হার | `tds_rules.yaml` → `slabs[]`, `base`, `law` |
| 3 | **Higher-rate rule when supplier has no Proof of Return Submission (PSR)** | রিটার্ন দাখিলের প্রমাণ না থাকলে বর্ধিত হার | `tds_rules.yaml` → `uplift_if_no_return_proof` |
| 4 | **Annual VDS guideline, FY2026-27** | উৎসে ভ্যাট কর্তন ও আদায় নির্দেশিকা | `fy2026_27/vds_rules.yaml` — the whole file |
| 5 | **Current VAT rate schedule + reduced-rate SROs** | ভ্যাট হার তফসিল / এসআরও | `fy2026_27/vat_rates.yaml` → `rate` per category |
| 6 | **Industry-specific SROs** (if any apply to our suppliers) | এসআরও | extra entries in `vat_rates.yaml` / `vds_rules.yaml` |
| 7 | **One sample Mushak 6.3 invoice** | মূসক ৬.৩ চালানপত্র | validation rules for `bill.mushak_6_3_no`; VDS `applies_if.mushak_6_3_present` |

Also useful, though not blocking:

- The **Finance Act / Ordinance 2026** (the June 2026 budget text) — confirms which
  rates actually changed for FY2026-27.
- **Mushak 6.6** — the VDS certificate we must issue to the supplier after
  withholding. Needed when the system starts producing certificates.

## How to file a document here

Keep the original filename where it is meaningful, or rename as
`fy2026_27_<topic>_<source>.pdf`, e.g.:

```
nbr_documents/
├── README.md                                  (this file)
├── research_notes.md                          (AI-assisted web research — NOT authoritative)
├── fy2026_27_income_tax_paripatra.pdf
├── fy2026_27_vds_guideline.pdf
├── fy2026_27_vat_reduced_rate_sro.pdf
└── mushak_6_3_sample.pdf
```

PDFs are gitignored (they can be large and are often marked for internal use);
the YAML citations that reference them are committed.

## Ingestion procedure (Phase 5)

1. File the PDF here.
2. Extract the relevant table (LLM assistance is fine at this step).
3. **A human — ideally the accountant — reads the official PDF and confirms every
   figure**, including the base definition (VAT-inclusive vs exclusive) and any
   thresholds.
4. Write the YAML entry with an exact `source_doc` citation: document name,
   fiscal year, and page/section, e.g.
   `source_doc: "Income Tax Paripatra FY2026-27, p.42, Table 3 row 'Supply of goods'"`.
   The loader **rejects** any entry with an empty citation.
5. Remove the `PLACEHOLDER` marker from that entry.
6. Re-baseline the golden expectations: `python -m uv run pytest` — the S1–S12
   fixtures encode expected amounts computed from the placeholder rates, so real
   rates will change them. That test churn is expected and is the point: it shows
   exactly which amounts moved.
7. Record the sign-off (who confirmed, when, against which document version).

## Sign-off log

Fill this in as documents are verified. This is the audit trail an auditor will
ask for.

| Date | Document | Verified by | Tables updated | Notes |
|---|---|---|---|---|
| _(pending)_ | | | | |

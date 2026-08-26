# PLAN.md — Accounts Bill Checking AI Agent (Purchase-to-Pay Automation)

> Status: v1 draft · Runs locally first (Claude Code on dev PC) · ERP / Supplier Portal / BPMN integration deferred to Phase L.
> This file is the single source of truth. Claude Code: read this fully before writing any code, and keep the Phase checkboxes in §13 updated.

---

## 0. Summary

We are automating the **Accounts "Bill Checking" step** of a Purchase-to-Pay flow. After a supplier bill is submitted and assigned, an AI agent must: validate the bill against PO + GRN (3-way match), compute VAT / VDS / TDS and all deductions per Bangladesh NBR rules, adjust for advances and previous payments, produce a final payable amount with a full explanation and audit trail, flag anything needing human attention, and route the result to CFO approval. On approval, it emits a Treasury payment instruction.

**The single most important design rule: the LLM never computes or invents money amounts.** All arithmetic, rates, matching tolerances, and final numbers come from deterministic, unit-tested Python + versioned rule tables. The LLM is used only for interpretation, mapping, classification, explanation, and orchestration — every LLM output that affects money is re-verified deterministically.

---

## 1. Business context (from the whiteboard)

```
Supply chain : Purchase Order (PO)
Store        : GRN → Invoice (auto)
Accounts     : Bill Submission → Bill Assignment → [ BILL CHECKING ← AI AGENT ] → CFO Approval
Treasury     : Treasury Receive → Treasury Payment → SCB Maker (bank maker/checker)
```

Worked example from the whiteboard (this becomes golden test data, §10):

- PO: `Pro X` 10 qty × 100 Tk = 1,000 (VAT 15%, TDS 5%); `Pro Y` 5 qty × 100 Tk = 500 (VAT 10%, TDS 5%)
- Supplier bill: `X` 10 qty = 1,000 ✔ matches; `Y` 5 qty = **600 ✘** (implied unit price 120 vs PO 100 → **100 Tk over-billing to cut**)
- Netting concept on the board: `Bill 1,100 − 500 (deduction/advance) = 600 pay`

The whiteboard numbers are conceptual, not arithmetically consistent — §10 defines clean, exact scenarios that encode the same ideas (price over-billing cut, per-line VAT/TDS, advance/deduction netting).

**Out of scope now (Phase L):** Supplier Portal ↔ ERP integration orchestrated via BPMN 2.0 (ERP→Portal PO push, ERP→Portal GRN push, Portal→ERP bill submission). We only build the seams (adapter interfaces, webhooks, status model) so this plugs in later with zero refactor of the checking core.

---

## 2. Non-negotiable design principles

1. **No LLM money math.** Amounts, rates, totals, deductions, and the final payable are computed only by deterministic Python using `Decimal`. Any number appearing in an LLM-written report must already exist in the computed result (enforced by a validator, §6 step 8).
2. **Every taka is traceable.** Each deduction/adjustment line carries a `rule_id` that resolves to a rule-table entry with a source citation (NBR document, section, fiscal year) or to a policy in `policies.yaml`.
3. **Rates are data, not code.** VAT/VDS/TDS rates and slabs live in `rules/fy{YYYY_YY}/*.yaml`, versioned per fiscal year, selected by bill date. Code never hardcodes a tax rate. Placeholder tables are clearly marked `PLACEHOLDER` until real NBR documents are ingested (§8).
4. **Human in the loop, maker/checker preserved.** The agent is the *maker* of the checking result. The CFO (checker) approves, adjusts, or returns every bill in v1. Exceptions are surfaced, never silently auto-resolved.
5. **Full audit trail.** Every run persists: input snapshots, rule-table versions, git SHA, every LLM prompt + raw response, every tool call, and the computed result. A run must be reproducible.
6. **Provider-agnostic LLM layer.** One interface, two adapters: Mistral (default for dev + production) and Gemini (used for the first smoke tests). Switch with a single env var. No API key ever committed.
7. **Idempotent & safe.** Re-checking the same bill produces a new run without corrupting state; duplicate submissions are detected, not double-paid.

---

## 3. Architecture

**Pipeline-first, not free-roaming agent.** The backbone is a fixed, deterministic pipeline (auditable, testable). The LLM is invoked at exactly four defined nodes, each with a narrow contract and structured (JSON-schema) output:

```
                ┌────────────────────────────────────────────────────────────┐
                │                    BILL CHECKING PIPELINE                  │
 Bill (assigned)│                                                            │
 ──────────────▶│ 1 Fetch context      (PO, GRNs, ledger, supplier master)   │
                │ 2 Validate & dedupe  (fields, duplicate bill, PO status)   │
                │ 3 Line matching      (deterministic; LLM node A on gaps)   │
                │ 4 3-way match        (qty vs GRN, price vs PO, tolerances) │
                │ 5 Tax engine         (VAT, VDS, TDS from FY rule tables;   │
                │                       LLM node B suggests category only)   │
                │ 6 Deductions/netting (adjustments, advances, retention,    │
                │                       prior payments → NET PAYABLE)        │
                │ 7 Exceptions & rec.  (severity policy → recommendation)    │
                │ 8 Report             (LLM node C writes CFO summary,       │
                │                       numeric guard validates it)          │
                └───────────────┬────────────────────────────────────────────┘
                                ▼
                    CFO review UI (approve / adjust / return)
                                ▼
                    Payment Instruction → outbox (Treasury Receive, later)
```

LLM nodes (all temperature-pinned, JSON-schema output, fully logged):
- **Node A — Line mapper:** when bill lines lack product codes, propose bill-line → PO-line mapping with confidence. Deterministic re-validation follows; low confidence ⇒ exception, never a guess.
- **Node B — Tax category classifier:** propose which rule-table category a line belongs to. The proposal must resolve to an existing rule-table entry ID; otherwise ⇒ exception "unclassified item".
- **Node C — Report writer:** turn the computed JSON into a clear CFO-facing summary (English, optionally Bangla). May not introduce numbers (guard in §6 step 8).
- **Node D — Exception investigator (Phase 3+, optional):** given an exception, call read-only tools (ledger history, prior bills) to write a better explanation. Read-only; cannot change any computed value.

---

## 4. Repository layout

```
billcheck/
├── PLAN.md                      # this file
├── CLAUDE.md                    # conventions, how to run, current status (Claude Code maintains)
├── .env.example                 # never commit real keys
├── pyproject.toml               # uv-managed; pip fallback documented in CLAUDE.md
├── app/
│   ├── config.py                # pydantic-settings; env-driven
│   ├── models/                  # SQLAlchemy ORM + Pydantic schemas
│   │   ├── supplier.py  po.py  grn.py  bill.py  ledger.py  checking.py  approval.py  payment.py
│   ├── engines/                 # DETERMINISTIC — no LLM imports allowed here
│   │   ├── money.py             # Decimal helpers, quantize, paisa conversion
│   │   ├── matching.py          # line matching + 3-way match
│   │   ├── tax_vat.py  tax_vds.py  tax_tds.py
│   │   ├── netting.py           # deductions, advances, retention → net payable
│   │   ├── duplicates.py
│   │   └── policy.py            # exceptions, severities, recommendation
│   ├── llm/
│   │   ├── base.py              # LLMClient protocol: complete(messages, json_schema, tools)
│   │   ├── mistral_client.py    # httpx → https://api.mistral.ai/v1/chat/completions
│   │   ├── gemini_client.py     # httpx → generativelanguage.googleapis.com ...:generateContent
│   │   ├── factory.py           # reads LLM_PROVIDER
│   │   └── smoke.py             # `python -m app.llm.smoke`
│   ├── agent/
│   │   ├── pipeline.py          # steps 1–8 orchestration
│   │   ├── nodes.py             # LLM nodes A–D (prompts + schemas)
│   │   └── prompts/             # versioned prompt templates
│   ├── rules/
│   │   ├── fy2026_27/           # vat_rates.yaml vds_rules.yaml tds_rules.yaml  (PLACEHOLDER first)
│   │   ├── policies.yaml        # tolerances, thresholds, severities
│   │   └── loader.py            # FY selection by bill date; schema validation on load
│   ├── adapters/
│   │   ├── erp.py               # ErpGateway protocol + MockErpGateway (seed data)
│   │   ├── treasury.py          # PaymentInstruction emitter → outbox/ JSON (+ optional webhook)
│   │   └── portal.py            # stub only (Phase L)
│   ├── audit/                   # run store: prompts, responses, versions, hashes
│   ├── api/                     # FastAPI: intake, status, review UI (Jinja + HTMX), approve/return
│   └── cli.py                   # `check-bill`, `seed`, `smoke`, `list-runs`
├── seeds/                       # golden-scenario fixtures (JSON/CSV)
├── outbox/                      # emitted payment instructions (gitignored)
└── tests/
    ├── unit/                    # engines: exhaustive
    ├── golden/                  # §10 scenarios end-to-end (mock LLM where possible)
    └── llm/                     # schema-conformance tests (opt-in, needs API key)
```

---

## 5. Data model (core entities)

All money stored as **integer paisa** in DB; `Decimal` in code; `ROUND_HALF_UP` quantized to 0.01 Tk. Timezone `Asia/Dhaka`. Text fields must handle Bangla + English.

- **Supplier**: id, name, BIN (VAT reg. no), eTIN, `has_return_submission_proof: bool` (drives TDS uplift), bank account details, status (`active|hold|blacklisted`), notes.
- **PurchaseOrder**: id, supplier_id, date, status (`open|partially_billed|closed|cancelled`), lines → **PoLine**(line_no, product_code, description, uom, qty, unit_price, `vat_category_id`, `tds_category_id`).
- **GRN**: id, po_id, date, lines → **GrnLine**(po_line_no, qty_received, qty_accepted, qty_rejected).
- **Bill**: id, supplier_id, po_id, supplier_invoice_no, invoice_date, `mushak_6_3_no` (nullable), claimed_total, attachments, lines → **BillLine**(description, product_code?, qty, unit_price, amount).
- **LedgerEntry**: supplier_id, po_id?, bill_id?, type (`advance|payment|retention_held|adjustment|penalty`), amount, date, ref. (Feeds "previous payments / outstanding / advance to adjust".)
- **CheckingRun**: run_id, bill_id, started/finished, git_sha, rules_version, llm_provider+model, status.
- **CheckingResult**: per-line match results; computed breakdown: `gross_claimed`, `price_adjustments[]`, `qty_adjustments[]`, `approved_base`, `vat[]`, `vds_deducted[]`, `tds_deducted[]`, `advance_adjusted`, `retention_held`, `other_deductions[]`, `prior_payments_offset`, **`net_payable`**; exceptions[] (each: code, severity `BLOCKER|REVIEW|INFO`, message, rule_id?); recommendation (`CLEAR | CLEAR_WITH_ADJUSTMENTS | REVIEW_REQUIRED | BLOCKED`); report_md.
- **ApprovalRecord**: bill_id, run_id, decision (`approved|approved_with_changes|returned|rejected`), decided_by, decided_at, comment, final_net_payable.
- **PaymentInstruction**: id, bill_id, supplier bank details snapshot, amount, currency BDT, created_at, status (`emitted|acknowledged`), outbox path / webhook response.

Statuses on Bill: `RECEIVED → ASSIGNED → CHECKING → CHECKED → PENDING_CFO → APPROVED | RETURNED | REJECTED → PAYMENT_INSTRUCTED`.

---

## 6. The checking pipeline, step by step

1. **Fetch context** via `ErpGateway` (mock now): PO + lines, all GRNs for the PO, supplier master, ledger history for supplier & PO (advances, prior payments against this PO/bill, retention, penalties), prior bills for duplicate check.
2. **Validate & dedupe**: required fields present; supplier active (hold/blacklist ⇒ BLOCKER); PO open; exact duplicate `(supplier_id, supplier_invoice_no)` ⇒ BLOCKER; fuzzy duplicate (same supplier, amount within 1%, invoice date within 7 days, similar line signature) ⇒ REVIEW.
3. **Line matching**: match bill lines to PO lines by `product_code`; if missing/ambiguous, LLM Node A proposes mapping (with confidence). Deterministic re-check: UoM compatible, qty plausible, one-to-one mapping. Confidence < threshold (policies.yaml) ⇒ REVIEW exception, line excluded from auto-computation.
4. **3-way match** per matched line:
   - Qty: `billed_qty ≤ GRN accepted qty (cumulative, minus previously billed qty)` and `≤ PO qty`. Excess ⇒ qty_adjustment (pay only supported qty) + exception.
   - Price: `|bill unit_price − PO unit_price| ≤ tolerance` (default 0 from policies.yaml). Over-billing ⇒ price_adjustment `(bill − PO) × qty` cut + exception. Under-billing ⇒ pay billed price + INFO exception.
   - Missing GRN entirely ⇒ BLOCKER (cannot verify receipt).
5. **Tax engine** per line, using FY tables selected by invoice date:
   - **VAT**: line's `vat_category_id` → rate. If bill's VAT treatment differs from expected, flag. Config flag `po_prices_include_vat: bool` (open question §15) controls base derivation.
   - **VDS (VAT deducted at source)**: applies per `vds_rules.yaml` entry — depends on category/service code, whether we are a withholding entity, and whether a valid Mushak 6.3 exists. Output: vds amount withheld from payment (deposited to govt), with rule_id.
   - **TDS (income tax at source)**: line's `tds_category_id` → section entry in `tds_rules.yaml`: slabs by base amount, base definition (`excl_vat|incl_vat` — set per NBR paripatra), uplift multiplier when `supplier.has_return_submission_proof == false`, minimum thresholds. Output: tds amount withheld, with rule_id + section citation.
6. **Deductions & netting** (order fixed and documented in output):
   `approved_base (after qty/price adjustments) → + VAT payable to supplier (if applicable) → − VDS withheld → − TDS withheld → − advance adjustment (open advances on this PO/supplier per policy) → − retention/security (policy %) → − penalties/other ledger deductions → − prior partial payments on this bill → = NET PAYABLE`. Every subtraction line carries rule_id/ledger ref.
7. **Exceptions & recommendation** (`engines/policy.py`): any BLOCKER ⇒ `BLOCKED`; any REVIEW ⇒ `REVIEW_REQUIRED`; only adjustments ⇒ `CLEAR_WITH_ADJUSTMENTS`; clean ⇒ `CLEAR`. (v1: everything still goes to CFO; `policies.yaml` reserves an `auto_clear_max_amount` for a later delegation feature.)
8. **Report** (LLM Node C): CFO-facing summary from the computed JSON only. **Numeric guard**: extract every number token from the narrative; each must exist in the computed result (or whitelist: percentages from rule tables, qty). Violation ⇒ regenerate once ⇒ else fall back to a deterministic template report. Store both.

---

## 7. LLM provider layer

```
# .env.example
LLM_PROVIDER=gemini                  # gemini | mistral  ← start with gemini for the first smoke tests, then switch to mistral
GEMINI_API_KEY=
GEMINI_MODEL=gemini-3.6-flash
MISTRAL_API_KEY=
MISTRAL_MODEL=mistral-large-2512     # Mistral Large 3 pinned ID (alias mistral-large-latest also works)
LLM_TIMEOUT_S=60
LLM_MAX_RETRIES=3
APP_DB_URL=sqlite:///./billcheck.db
DEFAULT_FISCAL_YEAR=fy2026_27
TZ=Asia/Dhaka
TREASURY_WEBHOOK_URL=                # optional; outbox/ JSON always written
```

- One `LLMClient` protocol: `complete(messages, json_schema=None, temperature=0.0) -> LLMResponse{text, parsed_json, usage, raw}`. Thin `httpx` adapters against each provider's native REST API — no heavy SDKs, symmetric behavior, easy to log.
- **Structured output**: use the provider's native JSON/schema mode where available; always ALSO validate locally against the Pydantic schema; on failure retry once with the validation error appended; then raise → pipeline records an exception instead of guessing.
- **Provider quirk**: Gemini 3.x Flash models ignore/reject custom `temperature`, `top_p`, `top_k` — the Gemini adapter must omit sampling params entirely. The Mistral adapter pins `temperature=0`.
- Retries with exponential backoff on 429/5xx; hard timeout; token usage + cost estimate logged per call; **every prompt and raw response persisted to the run's audit record**.
- `python -m app.llm.smoke`: sends a tiny schema-constrained request ("return {ok:true, provider, model}") and prints result + latency. Acceptance: passes on Gemini first, then on Mistral after flipping `LLM_PROVIDER`.
- Model IDs live only in env; upgrading (e.g., to a newer Flash) is a config change, not a code change.

---

## 8. Tax rules: NBR ingestion & YAML schemas

Runtime never scrapes nbr.gov.bd. The flow is: **owner provides official NBR PDFs → (offline, optional LLM-assisted extraction) → human reviews → committed YAML with citations → loader validates schema → engines consume.**

```yaml
# rules/fy2026_27/tds_rules.yaml   (PLACEHOLDER until real paripatra ingested)
- id: tds.supply_of_goods.s89
  law: "Income Tax Act 2023, s.89"           # citation
  source_doc: "PLACEHOLDER — Income Tax Paripatra FY2026-27, p.__"
  base: excl_vat                              # confirm from paripatra
  slabs:                                      # PLACEHOLDER numbers
    - {min: 0,        max: 5000000,  rate: 0.03}
    - {min: 5000001,  max: null,     rate: 0.05}
  uplift_if_no_return_proof: 1.5              # confirm exact provision
  effective_from: 2026-07-01
```

```yaml
# rules/fy2026_27/vds_rules.yaml (PLACEHOLDER)
- id: vds.standard_goods
  source_doc: "PLACEHOLDER — NBR VDS Guideline FY2026-27, para __"
  applies_if: {we_are_withholding_entity: true, mushak_6_3_present: true}
  action: no_deduction          # or {deduct_rate: 0.075} etc. per guideline table
```

`vat_rates.yaml`: category_id → {rate, description_bn, description_en, source}. `policies.yaml`: price_tolerance, qty_tolerance, mapping_confidence_min, duplicate fuzzy params, retention_pct, exception severities, auto_clear_max_amount (reserved).

Every YAML entry requires `source_doc`; loader rejects tables where any live (non-PLACEHOLDER) entry lacks a citation. Golden tests pin a rules version so tax changes never silently alter historical expectations.

---

## 9. What the LLM is used for — and never for

| Used for | Never used for |
|---|---|
| Bill-line → PO-line mapping proposals (re-verified) | Any arithmetic or totals |
| Tax category suggestions (must resolve to a rule ID) | Choosing/knowing a tax rate |
| CFO report & exception explanations (numeric-guarded) | Final payable or deduction amounts |
| Exception investigation via read-only tools | Approving anything |
| (Later) field extraction from PDF/scanned bills, human-verified | Duplicate/hold decisions |

---

## 10. Golden test scenarios (seed data; all must pass)

| # | Scenario | Expected outcome |
|---|---|---|
| S1 | Perfect match: X 10×100, Y 5×100; GRN full; VAT 15%/10%; TDS 5%/5% | `CLEAR`; adjustments 0; net payable computed with per-line VAT/TDS breakdown |
| S2 | **Whiteboard over-billing**: Y billed 600 for 5 qty (120/unit) vs PO 100 | price_adjustment −100 with rule_id `policy.price_over_po`; `CLEAR_WITH_ADJUSTMENTS` |
| S3 | Billed qty 12 > GRN accepted 10 | qty_adjustment to 10; REVIEW exception |
| S4 | No GRN exists for PO | BLOCKER `missing_grn`; `BLOCKED`; no payable computed |
| S5 | Duplicate invoice number from same supplier | BLOCKER `duplicate_exact` |
| S6 | **Whiteboard netting**: approved 1,100; open advance 500 | advance_adjusted −500; net 600 (before taxes as configured); ledger ref attached |
| S7 | Supplier lacks return-submission proof | TDS uplifted per rule; uplift visible with citation |
| S8 | Mixed VAT categories in one bill (15% + 10%) | correct per-line VAT; totals reconcile |
| S9 | Supplier on `hold` | BLOCKER before any computation |
| S10 | Bill line with free-text description, no product code | Node A maps it; low-confidence variant ⇒ REVIEW |
| S11 | Fuzzy duplicate (amount within 1%, 3 days apart) | REVIEW `duplicate_fuzzy` |
| S12 | Missing Mushak 6.3 where VDS rule requires it | REVIEW/BLOCKER per rule table; VDS treatment flagged |

Unit tests additionally cover: Decimal rounding edges, slab boundaries (amount exactly on a slab edge), FY boundary (invoice dated June 30 vs July 1), partial billing across multiple bills against one PO.

---

## 11. API + CFO review UI (Phase 4)

FastAPI + Jinja2 + HTMX (no SPA build step):
- `POST /bills` (intake, used by seeds/CLI now; portal later) · `POST /bills/{id}/check` · `GET /bills/{id}` (status + latest result)
- `GET /review` — queue of `PENDING_CFO` bills. `GET /review/{id}` — computed breakdown table (every line with rule_id), exceptions, LLM report, run metadata.
- `POST /review/{id}/decision` — approve / approve-with-changes (CFO can edit adjustable lines; edits logged) / return (with comment).
- Approval ⇒ create `PaymentInstruction`, write JSON to `outbox/`, POST to `TREASURY_WEBHOOK_URL` if set. This JSON is the contract Treasury Receive will consume in Phase L.

---

## 12. Phases & milestones

- [x] **Phase 0 — Scaffold + LLM layer.** Repo, `pyproject.toml` (uv), config, logging, `.env.example`, LLM base + Mistral + Gemini adapters, factory, smoke CLI. *Exit: smoke passes on Gemini; flip env; passes on Mistral. `ruff` clean.* (**Gemini smoke VERIFIED LIVE 2026-08-25** — `gemini-3.6-flash`, 4.3s, SMOKE OK. Mistral half pending the owner's key; flipping `LLM_PROVIDER=mistral` is the only step.)
- [x] **Phase 1 — Domain + seed data.** Models, SQLite migrations, repositories, seed loader with S1–S12 fixtures, `MockErpGateway`. *Exit: `python -m app.cli seed && list-bills` shows fixtures.* (Verified: seed + list-bills shows all 14 fixture bills.)
- [x] **Phase 2 — Deterministic engines.** money, matching, 3-way, tax engines on PLACEHOLDER tables, netting, duplicates, policy. *Exit: unit tests + S1–S9 pass end-to-end with LLM nodes mocked.* (All of S1–S12 pass end-to-end — S10 with mocked Node A proposals; pipeline skeleton + `check-bill` CLI included.)
- [x] **Phase 3 — LLM nodes + pipeline.** Nodes A/B/C (+D optional), numeric guard, audit persistence of prompts/responses. *Exit: S10 passes live; full run reproducible from audit record.* (**BOTH VERIFIED LIVE 2026-08-25 on gemini-3.6-flash**: Node A mapped S10's two free-text lines correctly, Node C's narrative passed the numeric guard with no template fallback, net 3080.00 = the deterministic expectation, 0 exceptions; `replay <run_id>` then reproduced it identically offline from the audit record. Node D not built, was optional.)
- [x] **Phase 4 — API + CFO UI + treasury emitter.** Review queue, decisions, payment instruction outbox. *Exit: demo — seed → check → CFO approves in browser → JSON appears in `outbox/`.* (Exit demo automated in tests/api; live server verified serving /review. `python -m app.cli serve` to run it.)
- [ ] **Phase 5 — Real NBR tables.** Ingest owner-provided paripatra / VDS guideline / VAT schedules into `fy2026_27` YAML with citations; remove PLACEHOLDER; re-baseline golden expectations. *Exit: loader passes citation check; accountant/owner sign-off on 3 sample bills.*
- [x] **Phase 6 — Hardening.** 20–30 synthetic bill eval set, Node A/B accuracy report, fuzzy-duplicate tuning, idempotency tests, cost/latency report per bill. (28-case set in `seeds/eval_cases.json`, every expectation independently recomputed by a second author; `python -m app.cli eval [--llm]` → `eval_reports/`. **Deterministic: 28/28.** Live on gemini-3.6-flash: Node A 8/8 correct on answered lines, all at confidence ≥0.90; 1 call lost to a free-tier quota cap and degraded safely to review. Fuzzy tuning: the current 1%/7-day setting measured 100% precision AND 100% recall. Cost/latency: 3.1 calls and ~1,026 tokens per bill, median 15.4 s, 0 bills over the 60 s target. Found and fixed 2 real system issues (advance scope, silently-dropped ledger entries) + 3 harness bugs of my own.)
- [ ] **Phase L — Later.** Supplier Portal + BPMN 2.0 orchestration (Camunda/Zeebe or similar) driving statuses via the existing API; real `ErpGateway` implementation replacing the mock; PDF/OCR bill intake.

Dependencies: `fastapi uvicorn sqlalchemy pydantic pydantic-settings httpx pyyaml jinja2 python-multipart pytest ruff`. Anything else requires explicit approval.

---

## 13. Non-functional requirements

- **Money**: `Decimal` only, never float; DB stores integer paisa; `ROUND_HALF_UP` to 0.01; totals must reconcile (sum of parts == whole) with an assertion in the pipeline.
- **Security**: keys via env only; `.env` gitignored; audit records immutable (append-only); no supplier bank details sent to any LLM.
- **Reproducibility**: run records pin git SHA + rules version + model ID; `python -m app.cli replay <run_id>` re-executes deterministically (LLM calls replayed from stored responses).
- **Locale**: Bangla + English text throughout; dates in `Asia/Dhaka`; fiscal year = July–June.
- **Performance target**: < 60s and < ~$0.02 LLM cost per typical bill (Mistral Large 3 pricing class).

---

## 14. Inputs needed from the project owner (blockers marked ⛔ for Phase 5 only)

1. ⛔ NBR documents (see chat message / README-NBR list): Income Tax Paripatra for the current FY, TDS/withholding rate chart (esp. payments to suppliers/contractors and services under the Income Tax Act 2023, incl. the higher-rate rule when the supplier has no proof of return submission), the annual VDS (VAT deduction at source) guideline, current reduced-rate VAT schedule, any industry-specific SROs, and one sample Mushak 6.3 invoice.
2. Whether our company is a **withholding entity** for VDS purposes (almost certainly yes — confirm).
3. Whether PO unit prices are **VAT-inclusive or exclusive** (sets `po_prices_include_vat`).
4. Accounts policy values: price/qty tolerances, retention/security %, advance-adjustment policy (full offset vs proportional), penalty/LD rules if any.
5. 3–5 anonymized real PO + GRN + bill sets (CSV/JSON/PDF) to turn into additional golden fixtures.
6. Later (Phase L): how the ERP exposes data — DB views, REST API, or file export — to implement the real `ErpGateway`.

---

## 15. Definition of done (v1)

A bill seeded into the system is checked end-to-end: 3-way matched, taxed from citation-backed FY tables, netted against advances/prior payments, explained in a CFO report whose every number is machine-verified, approved in the review UI, and emitted as a payment instruction JSON — with a complete, replayable audit trail, on either Mistral Large 3 or Gemini Flash via a one-line env change.

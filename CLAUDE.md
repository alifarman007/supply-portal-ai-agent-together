# CLAUDE.md — Conventions, How to Run, Status

> Companion to PLAN.md (the spec / source of truth). This file records conventions,
> run instructions, recorded assumptions, and current phase status.

## Current status

- **Phase 0 — DONE.** Scaffold, env-driven config, LLM layer (LLMClient protocol,
  Mistral + Gemini httpx adapters, factory on `LLM_PROVIDER`, retries/backoff,
  JSON-schema outputs with one repair retry, append-only audit store), smoke CLI.
  **Gemini smoke VERIFIED LIVE 2026-08-25** (`gemini-3.6-flash`, SMOKE OK, 4.3s).
  Mistral half pending its key — only `LLM_PROVIDER=mistral` in `.env` changes.
  NOTE: keys belong in `.env` (gitignored), never `.env.example` (the committed
  template — keep its values blank).
- **Phase 1 — DONE.** SQLAlchemy models for all §5 entities, money engine
  (Decimal/paisa), PLACEHOLDER rule tables + FY-aware loader with citation
  enforcement, `MockErpGateway`, golden fixtures S1–S12, CLI `seed` / `list-bills`.
  `ruff` clean; 54 tests passing (post-review hardening: HTTP-200-bad-body
  responses are audited + raised as LLMError; purity test catches relative/
  parent-package import bypasses; loader rejects wrong top-level YAML shapes
  as RulesError; audit records carry usage + estimated_cost_usd).
- **Phase 2 — DONE.** Deterministic engines (`matching` incl. 3-way, `tax_vat`,
  `tax_vds`, `tax_tds`, `netting`, `duplicates`, `policy`) + the pipeline
  skeleton `app/agent/pipeline.py` (§6 steps 1–8; LLM Node A is an injectable
  `mapping_proposals` dict, report is the deterministic §6.8 template).
  CLI `check-bill <BILL-ID>` added. ALL golden scenarios S1–S12 pass
  end-to-end (S10 via mocked proposals). `ruff` clean; 108 tests passing.
- **Phase 3 — DONE, VERIFIED LIVE 2026-08-25.** S10 ran end-to-end on
  `gemini-3.6-flash`: Node A mapped both free-text lines correctly, Node C's
  narrative passed the numeric guard (no template fallback), net 3080.00 =
  deterministic expectation, 0 exceptions; `replay <run_id>` then reproduced
  the run identically offline from the audit record (2 recorded calls). LLM nodes
  A (line mapper) / B (tax classifier) / C (report writer) in `app/agent/nodes.py`
  with versioned prompt templates in `app/agent/prompts/`; numeric guard
  (`app/agent/guard.py`, §6.8: token-level check + one repair + template
  fallback); every node call audited with `context` = run_id + node +
  prompt_version; `ReplayLLMClient` + CLI `replay <run_id>` re-executes a run
  offline from the audit record (verified identical); `check-bill --llm` turns
  the nodes on. Node failures degrade to deterministic behavior with INFO flags
  (`llm_node_failed`, `report_numeric_guard_failed`); LLM proposals are always
  re-validated deterministically (Node B ids must exist in the ruleset; Node A
  goes through `match_lines` + 3-way). Node D skipped (optional).
  Live check: `$env:RUN_LLM_TESTS="1"; python -m uv run pytest tests/llm -q`.
  Post-review hardening (two adversarial passes): numeric guard rewritten
  boundary-free — markdown emphasis (_9999_), glued currency (Tk9999),
  scientific notation (2E6 -> 2000000) and lakh grouping (1,00,000) all
  tokenize; identifiers cancel by tokenizing both sides + bill id as a source;
  percent derivation only for fractional tokens; free-text exception messages
  EXCLUDED from the guard allowlist (supplier descriptions can't whitelist
  numbers). match_lines is two-pass: deterministic product_code matches claim
  PO lines before any Node A proposal (a proposal can never displace a code
  match); Node A is only offered unclaimed PO lines; a proposal-mapped line
  that then needs price/qty adjustment raises `proposal_mapping_suspect`
  (REVIEW — never auto-clears, unlike code-matched S2 cuts). Node prompt
  templates filled in a single pass (`_fill`) so markers inside supplier data
  are never substituted. Regression tests: all of the above + Node A/B/C
  failure degradation, Node B id re-validation, run-scoped audit lookup,
  replay queues, §6.8 regenerate-once bound, repair-call audit linkage,
  §13 no-bank-details-to-LLM, and CLI replay consuming recorded calls.
- **Phase 4 — DONE.** FastAPI app (`app/api/main.py`, factory `create_app`):
  §11 endpoints — `POST /bills` (BillIn-validated intake), `POST /bills/{id}/check`
  (JSON, or 303→review for form posts; `?llm=true` enables nodes), `GET /bills/{id}`,
  `GET /review` (PENDING_CFO queue), `GET /review/{id}` (breakdown/netting/
  exceptions tables with rule_ids, report, run metadata, decision form),
  `POST /review/{id}/decision` (approve / approve-with-changes / return / reject).
  Approval ⇒ ApprovalRecord + PaymentInstruction + outbox JSON
  (`app/adapters/treasury.py`) + webhook POST when `TREASURY_WEBHOOK_URL` set
  (failure recorded, never fatal — ANY exception; response read capped). Jinja
  templates in `app/api/templates/` (plain forms, autoescaped). CLI `serve`.
  Safety added post-review (two passes): §2.7 re-check gate
  (`BillNotCheckableError` — decided/paid bills cannot be re-checked; RETURNED
  can); decision endpoint is race-proof — atomic `UPDATE … WHERE
  status='PENDING_CFO'` claim (concurrent double-submit ⇒ exactly one wins,
  tested with real threads) + two-phase commit (approval durable BEFORE the
  outbox/webhook side effects) + unique constraint on
  payment_instructions.bill_id; intake NEVER honors client-supplied status
  (forced ASSIGNED, scenario_tag stripped) or sub-paisa money; zero/quantized-
  to-zero amounts unpayable; stale-run guard (hidden run_id field, 409 if a
  newer run exists); same-origin CSRF middleware + X-Frame-Options/CSP
  frame-ancestors; NaN/Infinity rejected; Treasury JSON pinned by test (full
  key set) with zone-marked UTC timestamps. Run: `python -m app.cli serve`
  → http://127.0.0.1:8000/review. `ruff` clean; 172 tests passing.
  NOTE: schema changed (unique payment_instructions.bill_id) — billcheck.db
  was regenerated via `seed`; delete + reseed any stale copy.
- **Phase 5 — RATES EXTRACTED 2026-08-26; AWAITING ACCOUNTANT SIGN-OFF.**
  16 official PDFs downloaded to `nbr_documents/` (gitignored) + `MANIFEST.md`
  and a 60 KB `research_notes.md`. Key discoveries: the **FY2026-27 Income Tax
  Paripatra does not exist** (latest is FY2025-26) — withholding rates come from
  উৎসে কর বিধিমালা ২০২৬ instead; **no standalone FY2026-27 VDS guideline** (use
  VDS Rules 2025 + SRO 140/2026); and a **two-SRO trap** — SRO 210 (June) vs
  **SRO 273 (July, operative)** differ on service rates (4% vs 2% on the serial-5
  basket). Rates HAVE now been extracted into the YAML as DRAFT entries — see the
  next bullet — but none is signed off, so Phase 5's exit is still open.
  Still needed from the owner: a FILLED Mushak 6.3 sample (owner will supply
  later — ASK AGAIN). Supply categories: owner says suppliers sell varied items,
  so no narrowing is possible — the system must stay safe for unclassified goods,
  which `tests/golden/test_unknown_category_safety.py` now pins: an unknown VAT or
  TDS category yields REVIEW_REQUIRED with the line and category named, charges
  NO invented tax, and never silently skips a deduction.
- **Phase 5 extraction results (2026-08-26).** Five readers rasterised the
  Bangla gazette PDFs (legacy Bijoy encoding defeats text extraction) and
  cross-checked every digit against the text layer; 10 load-bearing figures were
  then independently re-read by a second agent and ALL 10 AGREED at high
  confidence. Written into the YAML as DRAFT entries with page-level citations:
  * `tds_rules.yaml` — the full **Rule 3(1) goods table, all 20 serials**
    (MS scrap 0.5%, petroleum marketing 0.6%, cement/iron 2%, industrial raw &
    packing materials 3%, manufacturing/construction 5%, tobacco raw 10%,
    **serial 20 residual 5%**). Serial 20 keeps the id `tds.supply_of_goods.s89`
    that the engines and fixtures already use, so behaviour is unchanged.
    Confirmed: NO de-minimis floor — the chapeau applies the rates to base
    value of ANY amount.
  * `vat_rates.yaml` — standard 15%, plus real reduced bands 10% / 7.5% / 5%
    and exempt, each cited to its SRO.
  * `vds_rules.yaml` — CONFIRMED we are a withholding entity (Rule 2(1)(kha)
    covers "any limited company", any turnover).
  🔴 **THE VAT-BASE QUESTION IS NOW ANSWERED AGAINST US.** ITA 2023 s.140(5)
  defines base value as the HIGHEST of (i) contract value, (ii) the amount in
  the bill or invoice, (iii) payment — and is COMPLETELY SILENT on VAT. A sweep
  of all 287 pages found only three VAT references, none a withholding-base
  rule, while s.152(3) shows the drafter DID write "minus VAT and SD" when that
  was intended. Read literally, "the amount in the bill or invoice" is a Mushak
  6.3 total, which is VAT-INCLUSIVE. Our `base: excl_vat` is practitioner
  convention with no statutory support. If it flips, every TDS figure rises by
  ~15% and under-deduction carries 2%/month under s.143(3). PUT THIS TO THE
  ACCOUNTANT FIRST.
  ⚠️ **Two things deliberately NOT modelled** (documented in the YAML headers):
  the VDS **services override** — Rule 3(1)'s ~44 service codes must be deducted
  "whether or not a Mushak 6.3 exists", so SERVICE bills would be under-deducted
  and must not be run through this system yet; and the Rule 3(2)/(3) netting of
  import-stage tax paid under s.120/s.94. The VDS missing-Mushak rate (7.5%) is
  explicitly labelled a carried-over GUESS, not a sourced figure.
  Loader now treats PLACEHOLDER, DRAFT and UNVERIFIED citation prefixes alike,
  so `show-policy` keeps warning until a human signs each entry off.
- **Services support added 2026-08-26 (closes a real under-deduction hole).**
  Before this, a SERVICE bill hit a placeholder `tds.services.s90` carrying a
  3%/5% amount band that exists nowhere in the 2026 Rules — it computed a
  confidently wrong deduction. Replaced with the real Rule 4(1) table (19
  serials) plus the two structural features services need:
  * **serials 1-3 rate a NATURAL PERSON differently** (15% vs 7.5%/10%) —
    new `Supplier.is_natural_person` (default False = company) and
    `TdsRule.rate_natural_person`.
  * **serials 4/12/13/18 charge the GREATER of a rate on the commission and a
    rate on the total bill** (proviso (kha)). A bill line has no commission
    split, so the engine computes the total-bill figure — a number the CFO can
    act on — and raises `tds_higher_of_commission_unresolved` (REVIEW) rather
    than silently taking what may be the lower of the two.
  * serial 19 residual 10% keeps the id `tds.services.s90`, so existing PO
    lines resolve.
  Amount slabs are GONE from the real tables (the company's 2021 workbook shows
  the old 3/5/7% cumulative bands; the 2026 Rules are purely commodity/service
  keyed), so `test_tds_slab_boundary_exact_edge` now exercises the engine's
  slab logic against a SYNTHETIC rule rather than table data.
  Still NOT modelled and flagged in the YAML: proviso (ka) financial-sector
  carve-out, and serial 19's "not deductible under any other section" condition.
- **VDS SERVICES SUPPORT added 2026-08-27 — the owner confirmed they DO receive
  service bills, so this was a live under-deduction.** Rule 3(1) of the VDS
  Rules 2025 requires deduction at the tabled rate *"whether or not a Mushak 6.3
  exists"* — the OPPOSITE of the goods rule. A service bill with a valid VAT
  invoice was previously deducted NOTHING.
  * `app/rules/fy2026_27/vds_service_codes.yaml` — 46 codes / 51 rows, read by
    TWO independent agents (one top-down, one bottom-up at high DPI) and
    reconciled by a third. GROUND TRUTH PASSED: the owner's real BRAC invoice
    shows S001.10=15% and S001.20=5%; both match.
  * `PoLine.service_code` + `evaluate_service_vds()` (per line, not per bill).
  * 🔴 **A CODE DOES NOT ALWAYS DETERMINE A RATE.** S001.10 is 15% for an AC
    hotel and 10% for a non-AC hotel under the SAME code; S010.20 is 2%/4.5%/2%
    by floor area; S048.00 is 5% for petroleum carriage vs 15% otherwise (3x).
    For these the engine computes NOTHING and raises `vds_service_rate_ambiguous`
    (REVIEW) naming the candidates — guessing would be a 5-point error on every
    hotel bill.
  * Rule 5 exemptions (attested Mushak, First Schedule, zero-rated, EFD
    invoices, startups) are NOT evaluated, so every applied service rate is
    disclosed via `vds_service_rule5_not_checked` (INFO) — it may OVER-deduct.
  * Sub-rules 3(2)–(5) carry 15% obligations that are NOT table rows (premises
    rent, imported services, licence fees) — a bill for those finds no code and
    is UNDER-deducted. Documented in the YAML header, not silently missed.
  * The extraction's own honest caveat, kept: three readings of ONE document is
    not independent verification, and the 51-row table is a hand-merge of the
    2025 base rules with SRO 140/2026 — no consolidated official text exists.
- **Rates now shown in the CFO UI for verification (2026-08-27).** The review
  page lists every rate a run applied (VAT per line, VDS, TDS) with its rule id,
  what it applied to, the amount produced, and the full citation naming the SRO
  and gazette page — badged NOT CONFIRMED while the citation carries a
  PLACEHOLDER/DRAFT/UNVERIFIED marker. The owner asked for verification on the
  frontend rather than a static checklist, which is the better instinct: a rate
  is far easier to check against a real bill than in the abstract.
- **Mushak 6.3 validation added 2026-08-27** (`app/engines/mushak.py`), built
  from TWO REAL invoices the owner supplied. Two findings drove the design:
  * **The line description carries the tax classification code.** Suppliers
    write `S001.10-Guestroom Delux Couple` (VAT service code) or
    `2105.00.00-Chocolate Ice-cream Container` (HS code). So classification can
    be a DETERMINISTIC lookup instead of an LLM guess — Node B becomes a
    fallback for uncoded lines rather than the primary route.
  * **A real Mushak can be internally inconsistent.** On the Kazi Farms invoice
    the printed "Total Price with all Duty & VAT" column said 4,000.00 for a
    line whose own figures give 4,000 + 400 SD + 330 VAT = 4,730. The engine
    therefore RECOMPUTES every figure and treats printed totals as claims.
  Also learned: VAT is charged on price PLUS supplementary duty (7.5% of 4,400,
  not of 4,000 — that is the only way the printed 330 reconciles); the BRAC
  invoice's BIN `123456789-011` is short and fails BIN validation; and the
  declared rates S001.10=15% / S001.20=5% MATCH our extracted FY2026-27 VAT
  schedule, which independently corroborates that extraction.
  Validation covers: BIN format both sides, purchaser/supplier identity
  (BLOCKER — an invoice issued to another company cannot support our input VAT),
  Mushak number format and fiscal year, per-line qty x price, SD, VAT, and
  grand-total arithmetic, and uncoded lines (INFO).
  ⚠️ NOT WIRED INTO THE PIPELINE YET: `Bill` still stores only
  `mushak_6_3_no` as a string. Capturing the full invoice (lines, codes,
  declared rates) needs a data-model change and a source for that data — the
  supplier portal or OCR intake in Phase L. The engine and its tests are ready
  for that moment.
- **Phase 6 — DONE 2026-08-26.** Eval harness in `app/eval/` + CLI
  `python -m app.cli eval [--llm] [--persist]` → markdown in `eval_reports/`.
  Dataset: `seeds/eval_cases.json`, 28 cases (E01–E28) covering 3-way-match
  edges, a Node A difficulty ladder, duplicate positives/negatives, and
  tax/netting/BLOCKER paths. Every expectation was written from the documented
  rules by one author and INDEPENDENTLY RECOMPUTED by a second
  (`ground_truth_verified: true` on all 28), so a disagreement is evidence, not
  the system grading itself.
  RESULTS — deterministic **28/28**; live (gemini-3.6-flash) 27/28, the one miss
  being a free-tier 429 (20 req/day/model) that degraded safely to review.
  Node A: **8/8 correct on answered lines**, all at confidence ≥0.90 (easy 1/1,
  medium 3/3, hard 3/3, ambiguous 1/1 answered). Fuzzy tuning sweep: the current
  `1% / 7 days` is optimal at **100% precision and 100% recall** — tighter misses
  duplicates, wider adds false positives. Cost/latency: 3.1 LLM calls and ~1,026
  tokens per bill, median 15.4 s, max 44.7 s, **0 bills over the §13 60 s
  target**; the $0.02 target needs `LLM_PRICE_*_PER_MTOK` set to evaluate.
  Idempotency: `tests/golden/test_idempotency.py`.
  TWO REAL SYSTEM ISSUES FOUND AND FIXED (see below): advance scope, and
  silently-dropped ledger entries. Three harness bugs of my own were also found
  and fixed (eval bills created as RECEIVED so uncheckable; Node A token cost
  attributed to a separate audit id; stale audit records inflating a later run's
  cost because the Node A run id was stable across runs).
- Next: finish Phase 5 (extract rates → accountant sign-off → remove
  PLACEHOLDER). Owner still to supply a FILLED Mushak 6.3 sample.

## Known limitations (accepted for now, revisit in Phase 6 hardening)

- **Prompt-injection surface:** supplier-controlled bill-line descriptions are
  serialized into Node A/C prompts. The blast radius is bounded — no LLM output
  can change a computed amount (deterministic re-validation everywhere), the
  guard blocks invented numbers, and description text can no longer whitelist
  numbers or expand template markers — but a hostile description could still
  slant the Node C prose stylistically. The CFO UI must always show the
  deterministic breakdown table alongside the narrative.
- **Guard granularity:** a proposal-mapped line whose billed price exactly
  equals the wrong PO line's price produces no adjustment and hence no
  `proposal_mapping_suspect` — an exact-price mis-mapping is indistinguishable
  from a correct one by amounts alone (Phase 6: Node A accuracy eval).
- Bill lines carry no UoM in the §5 data model, so §6.3's "UoM compatible"
  re-check can only compare against the PO side (Node A sees PO uom; a
  deterministic bill-vs-PO UoM check needs a data-model change — ask owner).

## How to run

Prereqs: Python 3.11+ (dev machine has 3.13), `uv` (installed via `pip install --user uv`;
invoke as `python -m uv` if `uv` is not on PATH).

```powershell
python -m uv sync --group dev          # create .venv + install pinned deps
Copy-Item .env.example .env            # then fill in GEMINI_API_KEY / MISTRAL_API_KEY

python -m uv run python -m app.llm.smoke     # LLM connectivity smoke test
python -m uv run python -m app.cli seed      # create tables + load golden fixtures S1-S12
python -m uv run python -m app.cli list-bills
python -m uv run python -m app.cli list-runs

python -m uv run ruff check .
python -m uv run pytest
```

Pip fallback (no uv): `python -m venv .venv; .venv\Scripts\Activate.ps1;
pip install fastapi uvicorn sqlalchemy pydantic pydantic-settings httpx pyyaml jinja2 python-multipart pytest ruff`
then the same `python -m ...` commands inside the venv.

Switching LLM provider: edit `LLM_PROVIDER` in `.env` (`gemini` | `mistral`). Model IDs
come only from env (`GEMINI_MODEL`, `MISTRAL_MODEL`) — never from code.

## Conventions

- **No LLM money math.** All arithmetic in `app/engines/` (pure deterministic Python,
  `Decimal` only). `app/engines/` must never import `app.llm` or `app.agent` —
  enforced by `tests/unit/test_engine_purity.py` (AST walk).
- **Money**: `Decimal` in code, integer paisa in DB (`*_paisa` columns),
  `ROUND_HALF_UP` to 0.01 Tk (`app/engines/money.py`). `float` raises `TypeError`.
  Non-money exact quantities (qty) use the `DecimalText` column type (TEXT-backed
  Decimal — SQLite NUMERIC would round-trip through float).
- **Rates are data**: only in `app/rules/fy*/**.yaml` + `app/rules/policies.yaml`,
  every entry with a `source_doc` citation (loader rejects missing citations).
  All current tables are clearly marked PLACEHOLDER until Phase 5 NBR ingestion.
  Rates are YAML *strings* ("0.15") so they parse as exact Decimal, never float.
- **Every policy value is owner-tunable by editing `policies.yaml` alone** — no
  code change, enforced by `tests/unit/test_policy_tunability.py`. Out-of-range
  values are rejected at load (RulesError), never silently applied. Editing a
  value changes the ruleset `version_hash`, so each run stays traceable to the
  policy it used. `python -m app.cli show-policy` prints what is in force.
- **Fixtures**: money in `seeds/scenarios.json` is Tk strings ("100.00"); the seed
  loader converts to paisa; floats are rejected by the Pydantic `*In` schemas.
  `BillIn` validates that line amounts sum to the claimed total.
- **Audit**: every LLM prompt + raw response (including failed/retried attempts AND
  HTTP-200 responses with unusable bodies) is appended to
  `audit_log/audit-YYYYMMDD.jsonl`, with token usage and a per-call cost estimate
  (set optional `LLM_PRICE_INPUT_PER_MTOK` / `LLM_PRICE_OUTPUT_PER_MTOK` in `.env`;
  unset ⇒ `estimated_cost_usd: null`). Auth headers/API keys are never logged.
- **No duplicate-prevention constraint** on `(supplier_id, supplier_invoice_no)`:
  duplicates must be seedable (S5) and are *detected* by the pipeline as BLOCKER.
- Tests live in `tests/unit/` (fast, no IO beyond tmp), `tests/golden/` (S1–S12
  fixtures + gateway), `tests/llm/` (reserved for opt-in live-API schema tests).

## Recorded assumptions (smallest-reasonable, per owner instruction)

0. **Phase 4 scope choices:** no auth in v1 (local single-user tool; `decided_by`
   is a form field) — CSRF is still blocked by the same-origin middleware.
   "CFO can edit adjustable lines" implemented as approve-with-changes editing
   the FINAL net payable + mandatory comment (logged in ApprovalRecord);
   per-line editing deferred. HTMX omitted — plain forms work without JS.
   Outbox payment JSON carries run_id + supplier_invoice_no for Treasury
   reconciliation (Phase L contract).

1. **No Alembic** — not on the approved dependency list, so "SQLite migrations" =
   `Base.metadata.create_all` (greenfield DB). Revisit only with explicit approval.
2. **`po_prices_include_vat: false` and TDS `base: excl_vat` — RESOLVED
   2026-08-26 by the company's own working paper.** The owner supplied
   `application_example/Application of withholding tax and VAt-19.10.2021.xls`
   (Kazi Farms Group, Finance Act 2021). Its Cement sheet computes:
   invoice 5,750,000 (1.15) − VAT 750,000 (0.15) = purchase price 5,000,000
   (1.00) − withholding 150,000 (3% of the EX-VAT price) = payable 5,600,000.
   That settles both questions: the PO price is ex-VAT with VAT added to reach
   the invoice, and withholding is computed on the VAT-EXCLUSIVE price.
   Our engine reproduces those figures exactly —
   `tests/golden/test_company_worked_example.py`, which also fails if anyone
   flips the base (incl_vat would deduct 172,500, a 15% overstatement).
   ⚠️ Residual caveat only: the workbook is FY2021-22 under the OLD Ordinance
   1984 (ss.52/52AA/52U). Under the current ITA 2023, s.140(5) is silent on VAT,
   so the treatment rests on continuous practice rather than the words of the
   current Act. Worth one confirmation that the practice carried over.
   The workbook also corroborates two other findings: for SERVICES the company
   withholds VDS even where a VAT challan exists (matching the Rule 3(1)
   services override we have NOT modelled), and the old law's amount slabs
   (3%/5%/7% by cumulative value) were removed by the 2026 Rules, which are
   purely commodity-keyed — so our per-bill aggregation is safe under the new
   law. NOTE: `application_example/` is gitignored — it is an internal company
   document and should not be pushed to a code host.
3. **`we_are_withholding_entity: true`** (§14.2) — owner-delegated recommended
   default; limited companies are withholding entities under the VAT & SD Act
   2012 regime.
4. **TDS placeholder for goods is a flat 5%** (`tds.supply_of_goods.s89`) so the
   whiteboard scenarios (S1/S2: TDS 5%) compute cleanly; `tds.services.s90` keeps a
   3%/5% slab boundary for edge-case tests. Real rates replace these in Phase 5.
   **2026-08-25 research update** (see `nbr_documents/research_notes.md`): the real
   Rule 3(1) table is keyed to COMMODITY TYPE across 20 serials, not to amount
   slabs — so `tds_rules.yaml` needs a data-model change (engines unaffected).
   Serial 20 is a residual 5% for anything unlisted, which is why the flat-5%
   placeholder computes correctly for generic goods today. There is no de-minimis
   floor. Services (s.90) additionally need "higher of X% commission or Y% of total
   bill" logic that no engine implements yet.
   🔴 **`base: excl_vat` is UNSUPPORTED by primary sources** — ITA ss.89/90/140(5)
   and the 2026 Rules never mention VAT in defining base value. Practitioner
   convention says bill-minus-VAT; the law does not say it. Flagged as the largest
   financial risk in the research. Ask the accountant this first.
5. **Audit store is JSONL-file-based** in Phase 0 (append-only, §13); run-record
   linkage (run_id on each LLM call) arrives with the Phase 3 pipeline.
6. **Seed loader lives in `app/seeding.py`** (not in §4's layout, which only lists
   `seeds/` data); Pydantic intake schemas (`*In`) live beside their ORM models.
7. **Bills seed as `ASSIGNED`** — checking starts post-assignment (§1 flow).
8. `policies.yaml` sits at `app/rules/policies.yaml` (shared across fiscal years),
   exactly as §4 shows; its values are included in the ruleset `version_hash`.
9. **`price_over_po` severity is INFO** (not REVIEW): the over-billed amount is
   cut automatically and the adjustment itself yields `CLEAR_WITH_ADJUSTMENTS`,
   which is what §10 S2 expects. The flag stays visible in the CFO breakdown.
10. **"Previously billed" qty** (3-way cumulative check) counts only bills with
    status `APPROVED`/`PAYMENT_INSTRUCTED` — a pending or duplicate submission
    must not eat the GRN allowance for the bill being checked.
11. **Advance offset is a full offset capped at the running payable** (never
    below zero; remainder stays open on the ledger, flagged INFO). §14.4's
    "full vs proportional" is now a POLICY KNOB, not an assumption:
    `advance_max_offset_pct` ("1.00" = full offset, recommended default;
    "0.25" = recover at most 25% per bill = proportional recovery).
    **Advance SCOPE is a second knob, added in Phase 6** (`advance_scope`).
    §6.6 says "advances on this PO/supplier per policy" and the two readings pay
    differently. Default changed to `po_only` after BOTH an eval author and an
    independent verifier read §6.6 as PO-scoped: a general supplier advance is
    no longer auto-recovered against an unrelated PO's bill — it is left on the
    ledger and DISCLOSED. Set `po_and_supplier` to restore the old behavior.
    ⚠️ Worth confirming with Accounts.
14. **No ledger entry may vanish silently** (Phase 6). Any entry in scope for a
    bill that the netting did not consume is surfaced: an unlinked PAYMENT on
    the PO raises `ledger_payment_not_applied` (REVIEW — possible double
    payment), anything else raises `ledger_entry_not_applied` (INFO — the
    computation is complete, the entry is merely disclosed). Before this,
    `retention_held` and `adjustment` entries were dropped without trace, since
    no netting rule consumes them. Pinned by `tests/golden/test_ledger_scope.py`.
12. **TDS slabs apply per category on the per-bill aggregated base** (not per
    line, not per fiscal-year cumulative) until the paripatra says otherwise.
13. Bills stay checkable while their PO is `open` OR `partially_billed`;
    any other PO status is a `po_not_open` BLOCKER.

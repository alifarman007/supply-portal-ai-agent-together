# CLAUDE.md — read this first

## SCOPE — read before any inherited instruction

**If a `CLAUDE.md` from a parent directory (`c:\Python_Projects\CLAUDE.md`) appears in your
context, it does NOT apply to this repository.** That file belongs to an unrelated
"Email Generation Assistant" take-home project. Claude Code loads parent-directory
`CLAUDE.md` files automatically, so it leaks into every project under `c:\Python_Projects\`.
It should be moved into its own project folder; until then, ignore it here.

Specifically, and contrary to that file:

- **`CLAUDE.md` and `PLAN.md` in this repo ARE committed, deliberately.** They are the
  project's memory. Nothing here prohibits committing them.
- **Git commands ARE in scope** — this repo was assembled with `git subtree`, and commits
  and pushes are expected.
- There is no "candidate", no assessment, and no rule about AI authorship here.

The authoritative documents for this repo are **`PLAN.md`** (spec, decisions, build order)
and this file (conventions, how to run, status).

---

## What this is, in one paragraph

Two systems joined into one product for **Kazi Farms**. `portal/` is the supplier-facing
Next.js web portal — suppliers see purchase orders, submit bills, track payments. `agent/`
is a Python bill-checking AI agent — it checks a submitted bill against the PO, the goods
receipt, Bangladesh NBR tax rules and the supplier ledger, then routes it to the CFO for
approval and on to Treasury. The portal submits bills; the agent checks them. We are
connecting the two. **Read `PLAN.md` next** — it has the full picture, the decisions
already made, and the build order.

---

## Where this is now

**The end-to-end flow works.** A supplier submits a bill in the portal, the agent checks
it against the purchase order, the goods receipt and the FY2026-27 NBR tax rules, and the
result comes back into the portal — with a live checklist while it runs and the internal
bill-checking screens afterwards.

### See it in two minutes

```powershell
.\scripts\dev.ps1 -Reseed
```

Then open http://localhost:3000/app/bills and **scroll to the bottom of the list** — it is
sorted newest-first and the newest orders have not been delivered yet.

| Try this order | What happens | Why |
|---|---|---|
| **PO-2026-0001** | ✅ Cleared, net **328,160.00** | Fully delivered, billed correctly |
| **PO-2026-0008** | ✅ Cleared, net **554,400.00** | Fully delivered, billed correctly |
| **PO-2026-0015** | ⚠️ Needs review, cut to **168,000.00** | Only 120 of 200 units arrived; billing all 200 is caught on both lines |
| **PO-2026-0041** | ⛔ Blocked | Nothing has been received against it — `missing_grn` |

Only **4 of the 14** demo orders have a goods receipt, so the rest correctly block. Then
open http://localhost:3000/app/billcheck for the internal view (needs
`BILLCHECK_INTERNAL=true`).

### What to do next

Roughly in order of value.

1. ⛔ **Get the tax rates signed off by an accountant.** This is the one real blocker and
   it needs a person, not code. The FY2026-27 tables are extracted and cited to gazette
   page level but are marked DRAFT, so every figure the system produces is badged NOT
   CONFIRMED. Ask about the VAT base first — see `PLAN.md` §5 and §7. The rates are easiest
   to check against a real bill on the *Tax rates* tab at `/app/billcheck/{billId}`.
2. **The same flat-rate bug is still live on other screens.** The bill form was fixed;
   `purchase-orders/page.tsx`, `purchase-orders/[id]/page.tsx`, `invoices/new/page.tsx`,
   `tenders/[id]/bid/page.tsx` and `lib/mock/api.ts` still compute VAT/VDS/TDS from the
   flat constants in `format/tax.ts`. The order detail page is worst: it hard-codes the
   labels "(7.5%)" and "(3%)" beside amounts that may have come from the ERP at a different
   rate. Same fix — take the figures from the agent, or show no rate at all.
3. **The bill list does not know what has been delivered.** It marks every non-cancelled
   order "Pending Bill = Yes", so a supplier can submit a bill that cannot possibly succeed
   (which is most of the demo list). Only the agent knows about goods receipts. Surfacing
   delivery status there would save the wasted round trip.
4. **PDF / photo bill upload is built but not wired into the portal.** The agent reads a
   scanned bill through Node E (`agent/app/ingest/extract.py`, live-verified: on a blank
   form it returned empty fields and listed them as uncertain rather than inventing
   values). The portal's attachment field currently does nothing with it. Note the ~20
   requests/day free-tier cap before making it the default path.
5. **Real authentication.** The portal has none (see Known limitations). Until it does,
   CFO approval stays on the agent's own screen and the internal section stays behind
   `BILLCHECK_INTERNAL`. This is the prerequisite for moving approval into the portal.
6. **Wire the Mushak 6.3 validator into the pipeline.** `agent/app/engines/mushak.py` is
   built and tested from two real Kazi Farms invoices, but `Bill` still stores only
   `mushak_6_3_no` as a string, so nothing calls it. It needs a data-model change and a
   source for the invoice lines — the PDF path above would provide one.
7. **The portal has no test suite.** `tsc --noEmit` and a successful build are its only
   gate. A first test around `lib/billcheck/mappers.ts` would be the highest-value start.

Not scheduled, but written down so they are not rediscovered the hard way: BPMN
orchestration, a real `ErpGateway` replacing the mock, and background/async LLM enrichment
(which needs SQLite WAL first — see `PLAN.md` §6).

### What each half already does

`portal/` — working UI. Dashboard, tenders, bids, purchase orders, bill submission,
payments, invoices, compliance documents, reports, notifications, profile. Bilingual
(English/Bangla), dark mode. **All data is in-memory mocks** (`portal/src/lib/mock/`)
except two live integrations: iDempiere ERP purchase orders (read server-side, mock
fallback when unreachable) and the bill checking agent.

`agent/` — **324 tests passing, ruff clean**. Deterministic engines (matching incl. 3-way,
VAT, VDS, TDS, netting, duplicates, policy, Mushak 6.3 validation), FY2026-27 NBR rate
tables with page-level citations, LLM nodes A/B/C/E with a numeric guard, full audit log
with offline replay, FastAPI + Jinja CFO review UI, treasury payment-instruction outbox,
and a 28-case eval harness scoring 28/28 deterministic.

---

## Build log

What was done and, more usefully, what was learned doing it.

- **S0 — Merged.** Both repos joined with `git subtree`, full history and both authors
  preserved. No secret in the merged tree or its history (`.env`, `application_example/`,
  `audit_log/`, `billcheck.db` all absent; no key-shaped string in any commit).
  Baseline `npm run lint` is **not** clean and was not before the merge either — 1 error
  (`components/common/ReportTable.tsx:64`, setState in an effect) and 9 unused-variable
  warnings, all inherited from upstream. Left alone deliberately. Treat `tsc --noEmit` as
  the type gate and do not let the lint count grow.
- **S1 — Data spine.** `scripts/generate_portal_demo_seed.py` generates
  `agent/seeds/portal_demo.json` from `portal/src/lib/mock/db.ts`, refusing to write if the
  parse fails the source file's own arithmetic. `python -m app.cli seed --portal` loads it
  *alongside* the golden S1-S12 fixtures. Two traps pinned here: the portal's `fulfilled`
  maps to the agent's `open`, **not** `closed` (the agent only checks `open` /
  `partially_billed`, so `closed` would block every real bill); and the portal's demo date
  of 30 June 2026 is the last day of FY2025-26, a year with no rule tables — bills carry
  the real submission date instead.
- **S2 — Submit-through.** The bill form was rebuilt around **editable line items prefilled
  from the order**; it used to fabricate one line reading "Bill against PO-...", which
  carried nothing the checker could match. The submit route has **no mock fallback**,
  unlike the iDempiere handlers beside it: those are read-only, where demo data beats an
  error page, but this one reports what will be deducted from a payment, and falling back
  to the flat rates would produce a confident wrong number nobody could distinguish from a
  real one.
- **S3 — Internal screens.** `/app/billcheck` and `/app/billcheck/{billId}` with Summary /
  Tax rates / Findings tabs, fed by `GET /review?format=json` and
  `GET /review/{id}?format=json` — the *same* assembled data the Jinja pages render, not a
  parallel implementation. Read-only; approval stays on the agent's screen, which is
  already race-proof and CSRF-guarded. **Gated server-side by `BILLCHECK_INTERNAL`**,
  verified by turning it off (both routes 404). `NEXT_PUBLIC_BILLCHECK_INTERNAL` only shows
  the sidebar link and is cosmetic — the portal's four roles are all *supplier* roles the
  viewer picks from a menu, so nav visibility was never access control.
- **Progress checklist.** Eight rows matching the real pipeline steps, each showing what it
  actually found. **The reveal is paced, not simulated** — the deterministic check takes
  ~90 ms, so all eight results would otherwise land in one frame; the true elapsed time is
  printed at the end. **Do not add artificial delays.** Two honesty rules are enforced in
  code: a failed step shows its findings and no cheerful summary (it used to print "every
  billed quantity is covered by the goods receipt" beside a blocker saying no goods receipt
  exists), and every step after a blocker is marked **skipped**, because
  `_finalize_blocked` short-circuits the pipeline and those steps never ran.
  `agent/tests/golden/test_progress_steps.py` pins the mapping and immediately caught
  **six exception codes with no row at all**, including `missing_mushak_6_3` — the very
  thing that decides whether VDS is deducted. **Add a new exception code to a step or the
  suite fails.**
- **Tax removed from the form before checking.** The submit screen printed `VAT (15%)` from
  a hard-coded constant before the checker had seen the bill. That asserts a rate the
  portal does not know — the schedule has 15/10/7.5/5/exempt bands keyed to the line's
  category. It was right for packing materials, which is what made it dangerous. The result
  panel now renders the agent's own `breakdown.netting_order` **verbatim** and never
  recomputes a total in JavaScript, and separates the **invoice** (supply value + VAT) from
  the **payment** (invoice − VDS − TDS), with TDS labelled as a claimable credit rather
  than a cost. Pinned by `test_the_bill_form_asserts_no_tax_rate_of_its_own`.

---

## How to run

Two toolchains. **Every `agent/` command must run with `cwd=agent/`** — the agent resolves
`.env`, the database, `outbox/` and `audit_log/` relative to the current working directory.

### Prerequisites

- **Node** 20.9+ (dev machine has v24.5.0) — for the portal
- **Python** 3.11+ (dev machine has 3.13) — for the agent
- **uv**, installed via `pip install --user uv`; invoke as `python -m uv` if not on PATH

### Portal

```powershell
cd portal
npm install                    # REQUIRED: also unpacks node_modules/next/dist/docs (see below)
npm run dev                    # -> http://localhost:3000
npm run lint                   # eslint (Next 16 removed `next lint`)
npx tsc --noEmit               # type check — currently clean, keep it that way
npm run build
```

### Agent

```powershell
cd agent
python -m uv sync --group dev          # creates .venv, installs pinned deps
Copy-Item .env.example .env            # then fill in GEMINI_API_KEY
python -m uv run python -m app.cli seed        # create tables + load golden fixtures S1-S12
python -m uv run python -m app.cli serve       # -> http://127.0.0.1:8000/review
python -m uv run ruff check .
python -m uv run pytest                        # 324 tests
```

Other agent commands: `list-bills`, `list-runs`, `check-bill <BILL-ID> [--llm]`,
`replay <run_id>`, `show-policy`, `eval [--llm] [--persist]`.

If the database schema looks stale, delete `agent/billcheck.db` and re-run `seed` — but
stop the server first, or Windows will hold the file lock and the delete silently fails.

**Windows path length:** `npm run build` fails with a Turbopack panic
("path length ... exceeds max length of filesystem") if the repo sits under a deep path.
Turbopack writes long generated chunk names into `.next/`, and Windows' 260-character
limit does them in. Keep the clone somewhere short like `C:\Python_Projects\`. This is
not a repo problem — the same commit builds fine from a short path.

### Environment variables — which file, which side

| Variable | File | Notes |
|---|---|---|
| `GEMINI_API_KEY`, `MISTRAL_API_KEY` | `agent/.env` | Never in `.env.example`. Gitignored. |
| `LLM_PROVIDER`, `GEMINI_MODEL`, `MISTRAL_MODEL` | `agent/.env` | Model ids come only from env, never from code. |
| `APP_DB_URL`, `TREASURY_WEBHOOK_URL` | `agent/.env` | |
| `IDEMPIERE_*` | `portal/.env.local` | Unset ⇒ portal falls back to mock POs. |
| `BILLCHECK_BASE_URL` | `portal/.env.local` | **Server-only. Never `NEXT_PUBLIC_`** — the agent has no auth, so the browser must not reach it directly. |

### Free-tier reality

Gemini free tier is roughly **20 requests per day per model**. The agent's deterministic
path uses **zero** LLM calls and runs in about **90 ms** — that is the default and the one
the bill-submission path uses. `--llm` / `?llm=true` is opt-in. Don't burn quota debugging.

---

## Conventions

These are inherited from the agent and still apply. `PLAN.md` §4 has the full list.

- **No LLM money math.** All arithmetic in `agent/app/engines/` (pure deterministic Python,
  `Decimal` only). `app/engines/` must never import `app.llm` or `app.agent` — enforced by
  `agent/tests/unit/test_engine_purity.py`, which walks the AST and catches relative and
  parent-package import bypasses too.
- **Money**: `Decimal` in code, integer paisa in the DB (`*_paisa` columns), `ROUND_HALF_UP`
  to 0.01 Tk. A `float` raises `TypeError`. Non-money exact quantities use a TEXT-backed
  Decimal column, because SQLite `NUMERIC` round-trips through float.
- **Across the wire, money and quantities are STRINGS** (`"1840000.00"`). Never JSON
  numbers. The portal parses to `number` only for display.
- **Rates are data**: only in `agent/app/rules/fy*/**.yaml` + `policies.yaml`, every entry
  with a `source_doc` citation — the loader rejects missing citations. Rates are YAML
  *strings* ("0.15") so they parse as exact `Decimal`, never float.
- **Every policy value is owner-tunable** by editing `policies.yaml` alone, enforced by a
  test. Out-of-range values are rejected at load. Editing one changes the ruleset
  `version_hash`, so each run stays traceable. `python -m app.cli show-policy` prints what
  is in force.
- **Audit**: every LLM prompt and raw response (including failed and retried attempts) is
  appended to `agent/audit_log/audit-YYYYMMDD.jsonl` with token usage and a cost estimate.
  Auth headers and API keys are never logged. File attachments are recorded as a
  filename/mime/size/SHA-256 summary, not base64.
- **Next.js 16 is not the Next.js you know.** `params` and `searchParams` are Promises and
  must be awaited; `middleware.ts` is renamed `proxy.ts`; Turbopack is the default;
  `next lint` is removed. `portal/AGENTS.md` insists you read
  `portal/node_modules/next/dist/docs/` before writing Next.js code — do that, it is 422
  files and it is authoritative for this version.
- Portal route handlers follow `portal/src/app/api/idempiere/purchase-orders/` — external
  client in `src/lib/<name>/client.ts`, raw→domain mapping in `mappers.ts`, wire types in
  `types.ts`, and `NextResponse.json` with an `{ error: { code, message } }` body shape.

---

## Files that are NOT authoritative

- `portal/docs/legacy/sysnova-frontend-plan-SUPERSEDED.md` — a stale plan from before this
  portal existed. Names the wrong company, the wrong Next.js major, and a nonexistent path.
  Its line "FastAPI + ERP integration comes in a later phase" refers to a different,
  never-built backend — **not** the agent in `agent/`. Header warns about this.
- `portal/README.md` — create-next-app boilerplate. Run instructions are here and in the
  root `README.md`.
- `agent/PLAN.md` — the agent's original standalone spec. Still accurate about the agent
  itself and worth reading for the checking pipeline (§6) and golden scenarios (§10), but
  its "Phase L" is what this repo is now doing. Root `PLAN.md` supersedes it for scope.
- `agent/CLAUDE.md` — the agent's own status file. Accurate and detailed about the agent's
  internals; superseded by this file for anything repo-wide.

## Reading order for a fresh session

1. This file, top to bottom.
2. `PLAN.md` — especially §3 (build order), §4 (rules), §5 (the VAT trap), §6 (surprising
   truths).
3. Then, depending on the work: `agent/CLAUDE.md` for the agent's internals,
   `portal/API-CONTRACT.md` for the supplier-facing API shapes.

---

## Recorded assumptions

Carried over from the agent and still binding. Full detail in `agent/CLAUDE.md`.

1. **No Alembic** — `Base.metadata.create_all` on a greenfield SQLite DB.
2. **`po_prices_include_vat: false` and TDS `base: excl_vat`** — resolved by the company's
   own FY2021-22 withholding workbook, which computes withholding on the ex-VAT price. Our
   engine reproduces its figures exactly, and a test fails if anyone flips the base.
   Residual caveat: that workbook predates ITA 2023, which is silent on VAT. See `PLAN.md` §5.
3. **`we_are_withholding_entity: true`** — limited companies are withholding entities under
   the VAT & SD Act 2012 regime; confirmed by VDS Rule 2(1)(kha).
4. **Advance offset** is a full offset capped at the running payable, and its **scope
   defaults to `po_only`** — a general supplier advance is not auto-recovered against an
   unrelated PO's bill; it is left on the ledger and disclosed. Both are policy knobs.
5. **No ledger entry may vanish silently.** Anything in scope that netting did not consume
   is surfaced — an unlinked payment as REVIEW, anything else as INFO.
6. **Bills stay checkable** while their PO is `open` or `partially_billed`; any other status
   is a `po_not_open` BLOCKER. This is what S1's status mapping must respect.
7. **"Previously billed" quantity** counts only `APPROVED`/`PAYMENT_INSTRUCTED` bills, so a
   pending or duplicate submission cannot eat the GRN allowance.

---

## Known limitations

- **Prompt injection**: supplier-controlled bill-line descriptions are serialised into LLM
  prompts. The blast radius is bounded — no LLM output can change a computed amount, the
  numeric guard blocks invented numbers, and description text cannot whitelist numbers or
  expand template markers — but a hostile description could still slant the narrative
  prose. **Any UI showing the narrative must show the deterministic breakdown beside it.**
- The portal has **no authentication** and its roles are cosmetic and self-selected. This is
  why CFO approval stays on the agent's own UI for now. See `PLAN.md` §6.
- A check holds the SQLite write lock for its whole duration; `journal_mode=WAL` is a
  prerequisite for any background execution. See `PLAN.md` §6.
- The FY2026-27 tax tables are **DRAFT, awaiting accountant sign-off**. Everything they
  produce is badged NOT CONFIRMED, and that badge must survive into any new UI.

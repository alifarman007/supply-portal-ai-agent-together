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

## Current status

- **S0 — Merge and document: DONE.** Both repos merged with `git subtree` (full history,
  both authors preserved — 25 commits). Root docs written. Stale plan retired to
  `portal/docs/legacy/`. No secret in the merged history (verified: `.env`,
  `application_example/`, `audit_log/`, `billcheck.db` all absent; no key-shaped string in
  any commit).
  Verified after the merge: agent `306 passed, 1 skipped`, `ruff` clean, `seed` loads 14
  bills; portal `npm install` OK (422 Next docs unpacked), `npx tsc --noEmit` **clean**.
  Baseline `npm run lint` is **not** clean and was not clean before the merge either —
  1 pre-existing error (`src/components/common/ReportTable.tsx:64`, setState inside an
  effect) and 9 unused-variable warnings, all inherited from upstream. Left alone
  deliberately: they are upstream's code, not ours. Treat `tsc --noEmit` as the type gate
  and do not let the lint count grow.
- **S1 — Data spine: NEXT.** Align one purchase-order universe across both sides so a
  portal-submitted bill is actually checkable. See `PLAN.md` §3 — this must be done before
  any UI work, or every bill comes back `BLOCKED`.
- **S2 — Submit-through, S3 — Bill-checking tabs, S4 — Release:** not started.

### What each half already does

`portal/` — 14 commits, working UI. Dashboard, tenders, bids, purchase orders, bill
submission, payments, invoices, compliance documents, reports, notifications, profile.
Bilingual (English/Bangla), dark mode, RBAC-flavoured nav. **All data is in-memory mocks**
(`portal/src/lib/mock/`) except one live integration: iDempiere ERP purchase orders, read
server-side with a mock fallback when the host is unreachable.

`agent/` — 11 commits, **306 tests passing, ruff clean**. Phases 0–4 and 6 complete:
deterministic engines (matching incl. 3-way, VAT, VDS, TDS, netting, duplicates, policy,
Mushak 6.3 validation), FY2026-27 NBR rate tables with page-level citations, LLM nodes
A/B/C/E with a numeric guard, full audit log with offline replay, FastAPI + Jinja CFO
review UI, treasury payment-instruction outbox, and a 28-case eval harness scoring 28/28
deterministic. Phase 5 (accountant sign-off on the tax tables) is the one open item.

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
python -m uv run pytest                        # 306 tests
```

Other agent commands: `list-bills`, `list-runs`, `check-bill <BILL-ID> [--llm]`,
`replay <run_id>`, `show-policy`, `eval [--llm] [--persist]`.

If the database schema looks stale, delete `agent/billcheck.db` and re-run `seed` — but
stop the server first, or Windows will hold the file lock and the delete silently fails.

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

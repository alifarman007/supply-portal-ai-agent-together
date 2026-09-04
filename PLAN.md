# PLAN.md — Kazi Farms Supplier Portal + Bill Checking AI Agent

> **This file and `CLAUDE.md` are the source of truth for this repository.**
> Both are committed on purpose. See the SCOPE note at the top of `CLAUDE.md` first.

---

## 1. What this repository is

Two working systems that were built separately and are being joined into one product.

| | `portal/` | `agent/` |
|---|---|---|
| What it is | Kazi Farms Supplier Portal | Accounts Bill Checking AI Agent |
| Who uses it | **Suppliers** (external) | **Accounts + CFO** (internal) |
| Stack | Next.js 16.2.9, React 19, TypeScript 5, Tailwind 4, shadcn/ui | Python 3.11+, FastAPI, SQLAlchemy, SQLite, Pydantic v2 |
| State today | Working UI, data is in-memory mocks + one live ERP read | Working end-to-end, 306 tests passing |
| Origin | github.com/shawon9324/kazifarms-supplier-portal | github.com/alifarman007/supply-portal-and-erp-ai-agent |

Both histories were merged with `git subtree`, so every original commit and author is
preserved and upstream changes can still be pulled (see §9).

### Why they belong together

The agent's own spec describes the Purchase-to-Pay flow:

```
PO → GRN → Bill Submission → Bill Assignment → Bill Checking → CFO Approval → Treasury
         └──── portal ────┘                  └──────────── agent ────────────┘
```

The portal owns bill **submission**. The agent owns bill **checking and approval**. They
are two halves of one flow. The agent was always designed for this join — its original
plan calls it "Phase L", built so the portal "plugs in later with zero refactor of the
checking core".

Both are Kazi Farms. The agent was validated against Kazi Farms' own withholding-tax
workbook and two real Kazi Farms Mushak 6.3 invoices.

### The point of joining them

The portal currently tells a supplier their net payable using flat hard-coded rates in
`portal/src/lib/format/tax.ts`:

```ts
export const VAT_RATE = 0.15;
export const AIT_RATE = 0.03;
export const VDS_RATE = 0.075;
export const TDS_RATE = 0.03;
```

The agent's research into the FY2026-27 NBR gazettes found that TDS on goods is
commodity-keyed across **20 serials** (0.5%–10%, residual 5%), TDS on services across
**19 serials**, and VDS on services across **46 codes** (2%–15%) — and that the 7.5% VDS
figure is explicitly a **guess** carried over from older placeholder data.

**A measured example**, from the round trip in `scripts/verify_portal_roundtrip.py` on
PO-2026-0001 (ex-VAT subtotal 293,000 Tk, all packing materials):

| | Portal, flat rates | Agent, cited rules |
|---|---|---|
| TDS | 3% → **8,790.00** | serial 17, packing materials, 3% → **8,790.00** |
| VDS | 7.5% → **21,975.00** | valid Mushak 6.3 present → **0.00** |

Be precise about what this shows. The **TDS figures agree here by coincidence** — packing
materials happen to sit at 3%, the same as the portal's hard-coded AIT. Change the
commodity and they diverge: cement and iron are 2%, MS scrap 0.5%, tobacco 10%, and
anything unlisted 5%.

The **VDS figures do not agree, and the gap is 21,975 Tk on this one order.** Under VDS
Rules 2025 Rule 5, no VAT is deducted at source when the supplier issues a Mushak 6.3 —
so the portal is showing a deduction that should not be taken at all. That is the real
win, and it is worth more than the headline "flat rates are wrong" framing: the agent
knows *when a deduction does not apply*, which no flat rate can express.

Joined, the supplier sees the real deduction, computed from cited gazette rules, with the
citation attached — before they submit.

⚠️ **But those rates are still DRAFT** and awaiting accountant sign-off. See §7.

---

## 2. What we are building

**The goal:** a supplier submits a bill in the portal → the agent checks it against the
PO, the GRN, the tax rules and the ledger → the result appears in new bill-checking tabs
in the portal.

### Decisions already made (do not relitigate without asking the owner)

| Decision | Choice | Why |
|---|---|---|
| Repo shape | Monorepo, `portal/` + `agent/`, HTTP between them | Two toolchains (npm vs uv), two test regimes. Rewriting the agent in TypeScript would throw away 306 tests, the Decimal money engine, cited rate tables, audit/replay — and JS `number` is a float, exactly what the money engine forbids. |
| Direction | **Portal calls agent. Agent never calls portal.** | One-way keeps the agent standalone and testable. The treasury webhook is the agent's only outbound call and is unchanged. |
| Transport | Next.js **server-side** route handlers proxy to the agent | The agent has no auth and no CORS. `BILLCHECK_BASE_URL` is server-only, never `NEXT_PUBLIC_`. Copies the existing iDempiere pattern. |
| First upload path | **The typed bill form**, not PDF reading | The form is the backbone; PDF extraction feeds the same screen later, and free-tier Gemini is only ~20 reads/day. |
| CFO approval | **Stays on the agent's own UI** (`localhost:8000/review`) | The portal has *no authentication at all* (§6). Approval writes a payment instruction — it does not belong behind a gate that does not exist. Portal tabs are read-only; link out to approve. |
| Language | Supplier screens stay bilingual; **internal screens English-only** | ~100 new labels would each need a Bangla string or the build fails. Tax terminology in Bangla is easy to get wrong. Still wired through the label system so Bangla can be added later. |
| LLM | **Off by default.** Deterministic check is the submit path | Measured: deterministic check ≈ **90 ms**; the LLM path is 15–45 s and capped at ~20 free requests/day. |

---

## 3. Build order

The order matters and is not obvious. **Seed alignment comes first**, because without it
every portal-submitted bill returns `BLOCKED`, and the UI would be built against a system
that refuses to work.

### S0 — Merge and document ✅ DONE

Both trees under `portal/` and `agent/` with full history. Root `PLAN.md`, `CLAUDE.md`,
`README.md`, `.gitignore`. Stale plan retired to `portal/docs/legacy/`. Both toolchains
still run exactly as before.

**Exit:** `npm run dev` works in `portal/`; `pytest` passes in `agent/`; no secret in the
merged history.

### S1 — Data spine ✅ DONE

One shared purchase-order universe, so a bill submitted in the portal is checkable by the
agent. Without this, everything downstream returns `BLOCKED`.

What must line up:

- **A GRN must exist per PO.** `agent/app/agent/pipeline.py` raises `missing_grn`, and
  `agent/app/rules/policies.yaml` sets its severity to `BLOCKER`, which short-circuits the
  whole check and leaves `net_payable = None`.
- **Every PO line needs a tax category.** `vat_category_id` and `tds_category_id` are
  non-nullable in `agent/app/models/po.py`. An id absent from the rule tables yields
  `unclassified_item` (REVIEW) and charges no tax. The portal's PO lines carry no
  classification at all — mock lines have only description/unit/quantity/price.
- **PO status must map correctly.** The portal treats `issued | acknowledged |
  partially_fulfilled | fulfilled` as billable. The agent only checks POs that are `open`
  or `partially_billed`; anything else is a `po_not_open` BLOCKER. Mapping the portal's
  `fulfilled` to the agent's `closed` would block every real bill.
- **Supplier and PO ids must resolve.** `POST /bills` rejects an unknown PO or supplier
  outright with a 400.

**Exit — PASSED.** `scripts/generate_portal_demo_seed.py` builds the agent seed from the
portal's own mock data (verifying every figure against the source file's arithmetic
before writing), `python -m app.cli seed --portal` loads it alongside the golden
fixtures, and `scripts/verify_portal_roundtrip.py` proves the round trip over real HTTP:
a portal-shaped bill posts `201`, checks `CLEAR`, net payable **328,160.00 Tk**, zero
exceptions, TDS applied from `tds.goods.s89.serial_17` with its gazette citation.
Proved before a line of React was written, exactly as intended.

14 purchase orders, 23 lines, one supplier (Dhaka Packaging Industries Ltd.). Only the
4 POs whose goods actually arrived have a GRN — billing the others returns the
`missing_grn` BLOCKER, which is the correct answer and demonstrates both paths.

### S2 — Submit-through ✅ DONE

- `portal/src/lib/billcheck/{client,types,mappers}.ts` — typed client, wire types, and the
  mapping layer (ids, statuses, money).
- `portal/src/app/api/billcheck/**/route.ts` — the portal's **first POST handler**. Reads
  `BILLCHECK_BASE_URL` inside the handler (not at module scope).
- Bill form gains **editable line items prefilled from the PO**. The agent requires lines,
  and requires `sum(line.amount_tk) == claimed_total_tk` exactly.
- **The VAT conversion, named and tested.** See §5 — this is a silent 15% error if missed.
- **No mock fallback on any money-bearing call.** See §4.

**Exit — PASSED**, verified live against both servers through the portal's own route
handler:

| Scenario | Result |
|---|---|
| PO-2026-0001, goods fully received, billed in full | `CLEAR`, net **328,160.00** |
| PO-2026-0015, only 60% received, billed in full | `REVIEW_REQUIRED`, `qty_over_grn` on **both** lines, payable cut to **168,000.00** |
| PO-2026-0041, issued, nothing received | `BLOCKED`, `missing_grn` |

Pinned by `agent/tests/golden/test_portal_contract.py` (12 tests), which needs neither
server running — the payloads are exactly what `mappers.ts` emits.

Two real bugs surfaced during this step and were fixed: the seed generator wrote
quantities in scientific notation (`Decimal.normalize()` turns 5000 into `5E+3`), and the
portal's frozen `DEMO_NOW` of 30 June 2026 is the last day of FY2025-26 — a year with no
rule tables — so every submitted bill produced an opaque 500. Bills now carry the real
submission date, and the agent answers a missing-fiscal-year with a 422 that names it.

### S3 — Bill-checking tabs (read-only) ✅ DONE

- Agent: a `?format=json` branch on the review detail route. Cheap — the handler already
  assembles `breakdown`, `exceptions`, `rates_applied` (with citations and an `unverified`
  flag) and `report_md`, and both `breakdown` and `exceptions` are already JSON columns.
- Portal: `/app/billcheck` (queue) and `/app/billcheck/{billId}` with **three** tabs:
  - **Summary** — recommendation, net payable, the agent's narrative
  - **Taxes** — every applied rate with rule id, what it applied to, the amount, the full
    citation, and a **NOT CONFIRMED** badge while the citation is DRAFT/UNVERIFIED
  - **Exceptions** — severity-badged, with rule ids
- Internal routes must **404 unless a server-only env flag is set**, because the portal has
  no auth. Nav visibility is not access control.

**Exit — PASSED.** `/app/billcheck` lists the queue and `/app/billcheck/{billId}` shows
Summary / Tax rates / Findings. Verified live through the portal: the queue returns all
three demo bills with their different outcomes, and the detail view shows claimed
250,000 -> approved base 150,000 -> net 168,000 with all 4 applied rates badged NOT
CONFIRMED and carrying their gazette citations.

**The gate is server-side and was tested by turning it off**: with `BILLCHECK_INTERNAL`
unset, both API routes return 404 even though the pages exist. `NEXT_PUBLIC_BILLCHECK_
INTERNAL` only hides the sidebar link and is explicitly documented as cosmetic — the
portal's four roles are all supplier roles the viewer picks from a menu, so nav
visibility could never have been the control.

### S4 — Release ⬅ NEXT

`npx tsc --noEmit` clean, `npm run build` succeeds, `ruff check .` clean, `pytest` passes,
one contract test proving a portal-shaped payload round-trips, README a stranger can
follow, tagged commit.

### Later (not scheduled)

PDF/photo bill reading through the portal (the agent already does this — Node E); real
authentication and internal roles; moving CFO approval into the portal; async LLM
enrichment (needs SQLite WAL first, see §6); BPMN orchestration; a real `ErpGateway`.

---

## 4. Rules that must not be broken

1. **The LLM never does money math.** All arithmetic lives in `agent/app/engines/`, which
   may not import `app.llm` or `app.agent`. Enforced by an AST-walking test.
2. **Money is `Decimal`, stored as integer paisa.** Passing a float raises `TypeError`.
   **Quantities too** — `qty` is exact Decimal, so a fractional quantity (2.5 kg) must also
   cross the wire as a string.
3. **Money crosses the wire as strings.** `"1840000.00"`, never a JSON number. JS `number`
   is an IEEE-754 double and cannot represent 0.1 exactly. The portal parses to `number`
   only for display, and never sends a parsed value back.
4. **No money-bearing mock fallback.** The iDempiere fallback precedent is *read-only*.
   Falling back to `tax.ts`'s flat 3% when the agent is down would produce a *different,
   wrong, confident number* — in exactly the place this project exists to fix. Rule:
   **GET/preview may fall back with a visible banner; anything money-bearing fails loudly.**
5. **Tax rates are data, never code.** Only in `agent/app/rules/**/*.yaml`, every entry
   carrying a `source_doc` citation. The loader rejects uncited entries.
6. **The NOT CONFIRMED badge survives the trip.** Every rate shown to a supplier carries
   its citation and `unverified` flag. A release that launders DRAFT rates into a confident
   supplier-facing number is worse than the flat 3% it replaces.
7. **Nothing is saved from a file alone.** Every upload path produces a draft a human
   confirms before anything is written.

---

## 5. The VAT trap (read this before touching the bill form)

The portal's bill form asks for **one VAT-inclusive amount** and derives the rest:

```ts
// portal/src/app/app/bills/[id]/page.tsx
const subtotal = Math.round(amount / (1 + VAT_RATE));   // amount INCLUDES VAT
```

The agent's policy is `po_prices_include_vat: false`, so it treats a line amount as the
**ex-VAT base and adds VAT to it**.

Post the portal's number straight into `claimed_total_tk` and **every downstream figure is
15% too high, and no exception is raised.** The bill looks fine and is wrong.

This is settled, not a guess: Kazi Farms' own FY2021-22 withholding workbook computes
invoice 5,750,000 − VAT 750,000 = purchase price 5,000,000, then withholds 3% of the
**ex-VAT** 5,000,000. The agent reproduces those exact figures in
`agent/tests/golden/test_company_worked_example.py`, which fails if anyone flips the base.

**So:** the conversion belongs in `mappers.ts` as a named, tested function — not as an
inline division.

---

## 6. Things that are true and surprising

- **The portal has no authentication.** `portal/src/store/auth.ts` initialises
  `isAuthed: true` with a hard-coded demo user. The login form validates only that the
  email looks like an email and the password is ≥6 characters, then logs you in
  unconditionally. There is no `middleware.ts`. The only gate is a client-side `useEffect`
  redirect.
- **The portal's roles are cosmetic and self-selected.** All four roles in
  `portal/src/lib/rbac.ts` are *supplier* roles, and the user picks their own from the
  avatar menu. `RequirePermission` is a client-side redirect, not access control. There is
  no internal role to attach a CFO section to; one would have to be invented, and
  `SupplierRole` is a closed union used by four exhaustive maps.
- **The agent has no auth either**, by design — it was a single-user local tool. The
  approver's name is a free-text form field.
- **A check holds the SQLite write lock for its whole duration.** There is no
  `journal_mode=WAL` and no `busy_timeout`. Running a 15–45 s LLM check in the background
  would block bill intake and CFO decisions with "database is locked". This is invisible
  today only because every check is a foreground, one-at-a-time action. **WAL is a
  prerequisite for any background execution.**
- **Tax figures have three possible sources, not two.** When `IDEMPIERE_SUPPLIER_CODE` is
  set, the portal's PO screens show `vdsAmount`/`tdsAmount` **from the ERP**, falling back
  to `tax.ts` otherwise — and the ERP also carries per-line exempt flags the agent knows
  nothing about. So "the agent is the source of truth" creates a three-way disagreement.
  A disagreement between two authorities on a withholding amount must be shown, not
  silently resolved. (`portal/src/app/app/purchase-orders/[id]/page.tsx` also hard-codes
  the labels "(7.5%)" and "(3%)" next to amounts that may have come from the ERP at a
  different rate — a pre-existing display bug to fix, not inherit.)
- **The portal has no test suite.** `package.json` has `dev/build/start/lint` only. "Both
  suites green" means the Python suite plus `tsc --noEmit` and `npm run build`, until a
  portal test runner is added.
- **`portal/README.md` is create-next-app boilerplate.** Run instructions are in the root
  `README.md`.

---

## 7. Open with the owner

1. ⛔ **Accountant sign-off on the FY2026-27 tax tables.** They are extracted, cited to
   gazette page level, and marked DRAFT. Until signed off, everything shows NOT CONFIRMED.
   Ask about the VAT base first (§5) — it is settled by the company's own workbook, but
   that workbook is FY2021-22 under the old Ordinance, and ITA 2023 s.140(5) is silent on
   VAT.
2. A filled Mushak 6.3 sample (two real invoices supplied so far; the validation engine is
   built and tested but not yet wired into the pipeline).
3. Mistral API key — only `LLM_PROVIDER=mistral` in `agent/.env` changes.
4. Whether the ERP or the agent wins when they disagree on a withholding amount (§6).

---

## 8. Not modelled yet (documented, not silently missed)

Written up in the YAML headers in `agent/app/rules/fy2026_27/`:

- VDS Rule 5 exemptions (attested Mushak, First Schedule, zero-rated, EFD, startups) — so
  an applied service rate may **over**-deduct; disclosed as an INFO flag.
- VDS sub-rules 3(2)–(5): premises rent, imported services, licence fees carry 15%
  obligations that are not table rows — a bill for those finds no code and would be
  **under**-deducted.
- TDS Rule 3(1) petrol-pump proviso; Rule 3(2)/(3) import-stage netting; s.142(2)
  non-bank-transfer uplift; serial 19's "not deductible under any other section" condition;
  proviso (ka) financial-sector carve-out.
- Bill lines carry no unit of measure, so §6.3's "UoM compatible" re-check can only compare
  against the PO side.

---

## 9. Working with the merged history

Both sub-projects came in via `git subtree`, so upstream changes can still be pulled:

```bash
git subtree pull --prefix=portal https://github.com/shawon9324/kazifarms-supplier-portal.git main
git subtree pull --prefix=agent  https://github.com/alifarman007/supply-portal-and-erp-ai-agent.git main
```

A `subtree add`/`pull` needs a **clean working tree** and at least one commit on the
branch. We never push back to `shawon9324/kazifarms-supplier-portal` — that repo and its
Vercel deployment are left untouched, by the owner's instruction.

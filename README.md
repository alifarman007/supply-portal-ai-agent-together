# Kazi Farms Supplier Portal + Bill Checking AI Agent

One repository, two applications:

- **`portal/`** — the supplier-facing web portal. Suppliers view purchase orders, submit
  bills, and track payments. Next.js 16 / React 19 / TypeScript / Tailwind.
- **`agent/`** — the accounts-side bill checking agent. Checks a submitted bill against the
  purchase order, the goods receipt, Bangladesh NBR tax rules and the supplier ledger, then
  routes it to the CFO and on to Treasury. Python / FastAPI / SQLite.

The portal submits bills. The agent checks them.

```
PO → GRN → Bill Submission → Bill Assignment → Bill Checking → CFO Approval → Treasury
         └──── portal ────┘                  └──────────── agent ────────────┘
```

**Start with [`PLAN.md`](PLAN.md) and [`CLAUDE.md`](CLAUDE.md)** — they carry the full
context: what is built, what is being built next, and the decisions behind it.

---

## Quick start

You need **Node 20.9+**, **Python 3.11+**, and `uv` (`pip install --user uv`).

First time, install and configure both halves:

```powershell
cd portal;  npm install;  Copy-Item .env.example .env.local;  cd ..
cd agent;   python -m uv sync --group dev;  Copy-Item .env.example .env;  cd ..
```

Then edit `agent/.env` to add your `GEMINI_API_KEY` (only the AI features need it —
bill checking itself is deterministic and needs no key), and set
`BILLCHECK_INTERNAL=true` and `NEXT_PUBLIC_BILLCHECK_INTERNAL=true` in
`portal/.env.local` if you want the internal Bill Checking screens.

Now start everything:

```powershell
.\scripts\dev.ps1 -Reseed
```

That seeds the database and starts both services:

| | |
|---|---|
| Supplier portal | http://localhost:3000/app/bills |
| Bill checking (internal) | http://localhost:3000/app/billcheck |
| Approve a bill | http://127.0.0.1:8000/review |

Stop with `.\scripts\dev.ps1 -Stop`.

### Try it

1. Open **http://localhost:3000/app/bills** and pick **PO-2026-0001**. The line items fill
   in from the order. Submit — the bill is checked and comes back **Cleared**, net payable
   328,160.00 Tk.
2. Now try **PO-2026-0015**. Only 60% of that order was actually delivered, so billing it
   in full comes back **Needs review**, with the over-billing caught on both lines and the
   payable cut from 250,000 to 168,000.
3. Try **PO-2026-0041**, which has been issued but nothing received. **Blocked** — you
   cannot pay for goods that have not arrived.
4. Open **http://localhost:3000/app/billcheck** to see all three, and the *Tax rates* tab
   to see every rate applied with the gazette page it came from.

### Running the halves separately

```powershell
cd portal;  npm run dev                                    # http://localhost:3000
cd agent;   python -m uv run python -m app.cli serve       # http://127.0.0.1:8000/review
```

Every `agent/` command must be run from inside `agent/` — it resolves its database,
`.env`, outbox and audit log relative to the working directory.

## Checks

```powershell
cd portal;  npm run lint;  npx tsc --noEmit;  npm run build
cd agent;   python -m uv run ruff check .;  python -m uv run pytest
```

The agent has 318 tests, including `tests/golden/test_portal_contract.py`, which pins the
contract between the two halves without either server running. The portal has no test
suite yet — `tsc --noEmit` and a successful build are its gate.

## Two things worth knowing

**Money never crosses as a number.** The agent holds money as a Python `Decimal` in
integer paisa and refuses a float outright; a JavaScript `number` is a double and cannot
represent 0.1 exactly. So amounts and quantities cross the wire as strings, and the portal
parses them only to display them.

**The tax rates are not signed off yet.** The FY2026-27 NBR tables in
`agent/app/rules/fy2026_27/` were extracted from the official gazettes and carry
page-level citations, but no accountant has confirmed them. Everything computed from them
is badged **NOT CONFIRMED** in the UI, with the source named, so a rate can be checked
against a real bill. Do not remove that badge until the rates are signed off.

## Useful agent commands

```powershell
python -m uv run python -m app.cli list-bills          # what is in the database
python -m uv run python -m app.cli check-bill BILL-S1  # check one bill (add --llm for AI nodes)
python -m uv run python -m app.cli replay <run_id>     # re-run a past check offline from the audit log
python -m uv run python -m app.cli show-policy         # print the tuneable policy in force
python -m uv run python -m app.cli eval                # run the 28-case evaluation set
```

## History

This repository was assembled from two projects using `git subtree`, so the full history
and authorship of both is preserved:

- `portal/` ← [shawon9324/kazifarms-supplier-portal](https://github.com/shawon9324/kazifarms-supplier-portal)
- `agent/` ← [alifarman007/supply-portal-and-erp-ai-agent](https://github.com/alifarman007/supply-portal-and-erp-ai-agent)

Upstream changes can still be pulled — see `PLAN.md` §9.

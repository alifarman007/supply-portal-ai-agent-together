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

Run the two in separate terminals.

### Portal → http://localhost:3000

```powershell
cd portal
npm install
npm run dev
```

### Agent → http://127.0.0.1:8000/review

```powershell
cd agent
python -m uv sync --group dev
Copy-Item .env.example .env      # then add your GEMINI_API_KEY
python -m uv run python -m app.cli seed
python -m uv run python -m app.cli serve
```

Every `agent/` command must be run from inside `agent/` — it resolves its database,
`.env`, outbox and audit log relative to the working directory.

## Checks

```powershell
cd portal;  npm run lint;  npx tsc --noEmit;  npm run build
cd agent;   python -m uv run ruff check .;  python -m uv run pytest
```

The agent has 306 tests. The portal has no test suite yet — `tsc --noEmit` and a successful
build are its gate.

## Useful agent commands

```powershell
python -m uv run python -m app.cli list-bills          # what is in the database
python -m uv run python -m app.cli check-bill BILL-S1  # check one bill (add --llm for AI nodes)
python -m uv run python -m app.cli replay <run_id>     # re-run a past check offline from the audit log
python -m uv run python -m app.cli show-policy         # print the tuneable policy in force
python -m uv run python -m app.cli eval                # run the 28-case evaluation set
```

## A note on the tax rates

The FY2026-27 NBR rate tables in `agent/app/rules/fy2026_27/` were extracted from the
official gazettes and carry page-level citations, but they are **DRAFT and awaiting
accountant sign-off**. Anything computed from them is badged **NOT CONFIRMED** in the UI.
Do not remove that badge until the rates are signed off.

## History

This repository was assembled from two projects using `git subtree`, so the full history
and authorship of both is preserved:

- `portal/` ← [shawon9324/kazifarms-supplier-portal](https://github.com/shawon9324/kazifarms-supplier-portal)
- `agent/` ← [alifarman007/supply-portal-and-erp-ai-agent](https://github.com/alifarman007/supply-portal-and-erp-ai-agent)

Upstream changes can still be pulled — see `PLAN.md` §9.

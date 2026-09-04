# NBR source documents — manifest

**Status: 16 documents downloaded 2026-08-25.** Every file below was fetched from
the official source, verified to be a real PDF, and is present in this folder.
They are gitignored (size + internal-use); the YAML citations referencing them
are committed.

---

**Full research report: [`research_notes.md`](research_notes.md)** (60 KB) — what was
read, which figures survived independent verification, and what did not. Read §3a
and §3d of that report before touching the tax tables.

---

## 🔴 Findings that affect THIS project's design

**A. Our `base: excl_vat` assumption is not supported by any primary source.**
`tds_rules.yaml` currently says the TDS base is VAT-exclusive. The researchers read
ITA 2023 ss.89, 90, 140(5) and the whole operative part of the 2026 Rules: **none
of them mentions VAT** in connection with base value. Practitioner consensus says
"bill minus VAT", but that is convention, not law — and s.152 (which *expressly*
says gross-minus-VAT for cigarette manufacturers) cuts against reading a silent
carve-out into s.140(5). The report calls this *"the single biggest financial risk
in the entire research."* **Ask the accountant this specific question first.**

**B. TDS on goods is a commodity table, not amount slabs.**
Rule 3(1) of the 2026 Rules is a **20-serial table keyed to what is being supplied**
(MS scrap 0.5%, petroleum by marketing company 0.6%, cement/iron 2%, industrial raw
& packing materials 3%, tobacco raw material 10%, …), with **serial 20 = residual
5% for everything not listed**. There is **no de-minimis floor** — the rates apply
to a base value of any amount.

*Correction to an earlier note:* this needs **no data-model change**. Our
`tds_rules.yaml` is already keyed by category id, and a flat commodity rate is
expressible as a single open slab (`min: 0, max: null`) — exactly what the current
placeholder does. Ingestion is therefore just adding one entry per serial and
pointing each PO line's `tds_category_id` at the right one. Unlisted goods keep
using the residual, which is what the placeholder already computes.

**C. Services (s.90) need higher-of logic we do not have.**
Rule 4(1) serials 4, 12, 13 and 18 are *"10% of commission **or** 1% of total bill,
whichever is higher"*. The netting engine has no concept of that yet. Not urgent —
our fixtures are all goods — but it is a real gap before services bills are checked.

**D. Third-party rate charts are actively wrong.** `taxpertbd.com` publishes 7% for
serial 18 (manufacturing/construction/engineering) where both gazette readings give
**5%**, and carries a stale serial 6 citing the 2024 rules. Never source rates from
aggregator sites.

---

## ⚠️ Two findings that changed the plan

**1. The Income Tax Paripatra for FY2026-27 does not exist.**
PLAN.md §14.1 asks for it, but NBR's paripatra index still shows **FY2025-26 as
the latest published** as of 2026-08-25.

*What replaces it:* FY2026-27 withholding rates come from **উৎসে কর বিধিমালা, ২০২৬
(Withholding Tax Rules, 2026)** — file 1 below. Re-check the index later; when the
paripatra appears it adds NBR's worked interpretation but does not override the Rules.
→ https://nbr.gov.bd/taxtypes/income-tax/income-tax-paripatra/eng

**2. There is no standalone FY2026-27 "VDS Guideline" handbook.**
VDS is governed by the **VAT Deduction at Source & Collection Rules, 2025** (still
in force) **as amended by SRO 140 of 2026** — files 4 and 5. Both are needed;
either alone is misleading.

**3. TWO different SROs are both titled উৎসে কর বিধিমালা, ২০২৬** and both claim
effect from 1 July 2026 — SRO 210 (8 June) and **SRO 273 (5 July, the operative
one, labelled সংশোধিত)**. Their goods tables are identical, but their **services
tables differ materially**: the serial-5 basket (catering, PR, event management,
training, courier, packing & shifting, collection agency) is **4% in SRO 210 and
2% in SRO 273** — double the correct rate. Anyone who ingested the June PDF has
wrong service rates today. Always cite SRO 273.

---

## Downloaded files

### Priority 1 — required to replace the PLACEHOLDER tax tables

| # | File | Document | Feeds |
|---|---|---|---|
| 1 | `fy2026_27_withholding_tax_rules_2026.pdf` | উৎসে কর বিধিমালা, ২০২৬ — S.R.O. 273-Ain/Aykar-5/2026 | `tds_rules.yaml` (the whole file) |
| 2 | `fy2026_27_finance_act_2026.pdf` | অর্থ আইন, ২০২৬ — Act No. 96 of 2026, gazetted 30 Jun 2026, 151pp | confirms what changed this FY |
| 3 | `income_tax_act_2023_english.pdf` | Income Tax Act 2023 (Act XII of 2023), authentic English | s.89/s.90 base text; PSR uplift |
| 4 | `vds_rules_2025_base.pdf` | S.R.O. 182-Ain/2025/310-Mushak — VDS Rules 2025 | `vds_rules.yaml` (base) |
| 5 | `fy2026_27_vds_amendment_sro_140.pdf` | S.R.O. 140-Ain/2026/345-Mushak, eff. 1 Jul 2026 | `vds_rules.yaml` (FY amendment) |
| 6 | `fy2026_27_vat_instruction.pdf` | NBR VAT Instruction FY2026-27 (guidance to VAT officers) | plain-language cross-check |
| 7 | `mushak_6_3_form.pdf` | মূসক-৬.৩ কর চালানপত্র — blank form | `mushak_6_3_no` validation |

### Priority 2 — VAT rates

| # | File | Document |
|---|---|---|
| 8 | `fy2026_27_vat_exemption_sro_127.pdf` | SRO 127-Ain/2026/332-Mushak — annual omnibus VAT exemptions |
| 9 | `fy2026_27_vat_rules_amendment_sro_125.pdf` | SRO 125-Ain/2026/330-Mushak — amends VAT & SD Rules 2016 |
| 10 | `fy2026_27_vat_sro_146_ac_refrigerator.pdf` | SRO 146 — AC / refrigerator / compressor manufacture |
| 11 | `fy2026_27_vat_sro_147_startup.pdf` | SRO 147 — registered startup exemption |

### Priority 3 — reference texts

| # | File | Note |
|---|---|---|
| 12 | `vat_sd_rules_2016_authentic_english.pdf` | Consolidated to Nov 2025 (i.e. FY2025-26 law) |
| 13 | `vat_sd_act_2012_english.pdf` | ⚠️ Original 2012 text, **not** consolidated |
| 14 | `income_tax_paripatra_2025_26_PRIORYEAR.pdf` | Prior year, for comparison only |
| 15 | `fy2026_27_finance_bill_bilingual.pdf` | Finance Bill (pre-enactment), bilingual |
| 16 | `SUPERSEDED_sro_210_do_not_use.pdf` | 🚨 See warning below — kept only so nobody re-downloads it by mistake |

---

## 🚨 The SRO 210 trap

**S.R.O. 210-Ain/Aykar-1/2026** (issued 8 June 2026) was **superseded by SRO 273**
before it took effect. Both remain live on the NBR site with no "withdrawn"
banner. It is downloaded here **only** as `SUPERSEDED_sro_210_do_not_use.pdf` so
that its status is unambiguous. Never cite it in the YAML tables.

This is the general hazard: NBR does not mark withdrawn notifications. Before
trusting any single SRO, check the index for a higher-numbered notification on
the same subject:
- VAT SROs: https://nbr.gov.bd/regulations/sros/vat-sros/eng
- Income Tax SROs: https://nbr.gov.bd/regulations/sros/income-tax-sros/eng
- VAT General Orders: https://nbr.gov.bd/regulations/gos/vat-gos/eng

---

## Still needed from the owner

1. **A filled sample Mushak 6.3** from a real supplier. The blank form (file 7)
   doesn't show how suppliers actually complete it, which is what the validation
   rules must tolerate.
2. **Your supply categories.** The FY2026-27 VAT SRO set runs 125→148 of 2026;
   which ones bind depends on what your suppliers actually sell. Tell me the main
   categories and I'll pull the specific SROs.

---

## Known extraction hazard

Bangla PDFs from NBR use **legacy Bijoy/SutonnyMJ ASCII-mapped encoding, not
Unicode**. Extracted text comes out as mojibake (`evsjv‡`k` rather than বাংলাদেশ),
so automated extraction of the Bangla rate tables is unreliable. The English
documents (files 3, 12, 13) extract cleanly. This is precisely why a human must
read and confirm every figure before it enters the YAML tables.

## Next step

The rates still need to be read out of these PDFs and written into
`app/rules/fy2026_27/*.yaml` with exact citations, then **confirmed by you or
your accountant** against the PDF (PLAN.md Phase 5 exit requires this sign-off).
Only then do the PLACEHOLDER markers come off.

## Sign-off log

| Date | Document | Verified by | Tables updated | Notes |
|---|---|---|---|---|
| 2026-08-25 | (all 16 downloaded) | — | none yet | Files retrieved; no figures extracted or signed off |

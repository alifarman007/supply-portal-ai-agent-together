# Bill-checking agent — evaluation report

- Generated: 2026-08-27T10:47:36+00:00
- Mode: **deterministic**
- Rule tables: `c39687290e487bfc`

## 1. Correctness

**28/28 cases match their independently-derived ground truth.**

### All cases

| Case | Title | Expected | Actual | Net (exp) | Net (act) | OK |
|---|---|---|---|---:|---:|:--:|
| E01 | Clean three-line construction bill, exact PO and full GRN acceptance | CLEAR | CLEAR | 17715.00 | 17715.00 | ✅ |
| E02 | Unit price billed above PO on one line only, with an advance to net off | CLEAR_WITH_ADJUSTMENTS | CLEAR_WITH_ADJUSTMENTS | 11170.00 | 11170.00 | ✅ |
| E03 | Billed quantity exceeds GRN-accepted quantity after a partial rejection | REVIEW_REQUIRED | REVIEW_REQUIRED | 17655.00 | 17655.00 | ✅ |
| E04 | Same line billed at both the wrong price and the wrong quantity | REVIEW_REQUIRED | REVIEW_REQUIRED | 18480.00 | 18480.00 | ✅ |
| E05 | Supplier bills BELOW the PO price - pay the lower price, INFO only | CLEAR | CLEAR | 19140.00 | 19140.00 | ✅ |
| E06 | Half-up rounding at 2 decimals on line amounts, VAT and TDS | CLEAR | CLEAR | 763.95 | 763.95 | ✅ |
| E07 | Partial delivery across two GRNs, bill claims exactly the cumulative accepted quantity | CLEAR | CLEAR | 28646.00 | 28646.00 | ✅ |
| E08 | Easy mapping — free-text "Portland cement 50kg bag" against PO "Cement, Portland, 50kg bag" | CLEAR | CLEAR | 18920.00 | 18920.00 | ✅ |
| E09 | Medium mapping — "half-inch GI pipe, 20 foot length" against PO "GI PIPE 1/2IN 20FT" | CLEAR | CLEAR | 12430.00 | 12430.00 | ✅ |
| E10 | Medium mapping, two free-text lines — packaging synonym plus chemical-name synonym (caustic soda / sodium hydroxide) | CLEAR | CLEAR | 23000.00 | 23000.00 | ✅ |
| E11 | Hard mapping — construction trade shorthand "R/F rod 12 dia, Gr-60" against PO "MS deformed bar, B500DWR grade, 12mm dia" | CLEAR | CLEAR | 9960.00 | 9960.00 | ✅ |
| E12 | Hard mapping — Bangla-English (Banglish) transliterated safety-gear descriptions, plus TDS uplift for a supplier with no return proof | CLEAR | CLEAR | 14835.00 | 14835.00 | ✅ |
| E13 | Ambiguous mapping — "Electrical cable, copper — 2 coil" where the PO holds both 2.5mm2 and 4.0mm2 coils | CLEAR | CLEAR | 15070.00 | 15070.00 | ✅ |
| E14 | Ambiguous mapping — "A4 offset paper, 500 sheet ream" where the PO holds both 70 GSM and 80 GSM reams | CLEAR | CLEAR | 16599.00 | 16599.00 | ✅ |
| E15 | Exact duplicate - the original copy, retroactively blocked (and masking two fuzzy hits) | BLOCKED | BLOCKED | — | — | ✅ |
| E16 | Exact duplicate by invoice-number re-use - different goods, different amount, five weeks later | BLOCKED | BLOCKED | — | — | ✅ |
| E17 | Fuzzy duplicate just INSIDE the window - 0.60% on amount, 3 days on date | REVIEW_REQUIRED | REVIEW_REQUIRED | 27665.00 | 27665.00 | ✅ |
| E18 | Borderline - amount 0.96% apart and dates EXACTLY 7 days apart: falls INSIDE, flags | REVIEW_REQUIRED | REVIEW_REQUIRED | 27236.00 | 27236.00 | ✅ |
| E19 | Near miss on AMOUNT - 2.50% apart, only 1 day apart, same goods: must NOT flag | CLEAR | CLEAR | 26812.50 | 26812.50 | ✅ |
| E20 | Near miss on DATE - identical 25,000.00 total, same goods, 10 days apart: must NOT flag | CLEAR | CLEAR | 27500.00 | 27500.00 | ✅ |
| E21 | Near miss on GOODS - same 25,000.00 total, same invoice date, genuinely different products: must NOT flag | CLEAR | CLEAR | 27500.00 | 27500.00 | ✅ |
| E22 | Mixed VAT categories in one bill (15% + 10% + exempt) — totals must reconcile | CLEAR | CLEAR | 33300.00 | 33300.00 | ✅ |
| E23 | Supplier without return-submission proof — TDS uplifted x1.5 (5% -> 7.5%) | CLEAR | CLEAR | 29240.00 | 29240.00 | ✅ |
| E24 | Missing mushak 6.3 — VDS 7.5% withheld and missing_mushak_6_3 raised (REVIEW_REQUIRED) | REVIEW_REQUIRED | REVIEW_REQUIRED | 17835.00 | 17835.00 | ✅ |
| E25 | Advance smaller than the payable — offset in full, no INFO flag, CLEAR | CLEAR | CLEAR | 16780.00 | 16780.00 | ✅ |
| E26 | Advance larger than the payable — offset capped at zero, advance_partially_offset (INFO), net 0.00 | CLEAR | CLEAR | 0.00 | 0.00 | ✅ |
| E27 | BLOCKER: supplier on hold — no amounts computed at all, net_payable null | BLOCKED | BLOCKED | — | — | ✅ |
| E28 | Unclassified item — unknown VAT category id: no VAT on that line, still paid, TDS still on the full base | REVIEW_REQUIRED | REVIEW_REQUIRED | 26870.00 | 26870.00 | ✅ |

## 3. Node B — tax-category safety

1 case(s) presented an unclassified item. 0/1 were resolved to a real rule id; the remainder stayed `unclassified_item` and went to human review.

The safety property is that a proposed id **must** exist in the rule tables before it can affect money — an unresolvable proposal is discarded, never guessed at.

## 4. Cost and latency per bill

_No LLM calls in this run (deterministic mode) — the pipeline costs nothing and runs in milliseconds without the nodes._

## 5. Fuzzy-duplicate tuning

Swept over the labelled duplicate cases. **Precision** = of the bills we flagged, how many were real duplicates (low precision wastes CFO time). **Recall** = of the real duplicates, how many we caught (low recall risks paying twice).

| amount_pct | days | TP | FP | FN | TN | Precision | Recall | F1 |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0.005 | 3 | 0 | 0 | 3 | 4 | — | 0% | — |
| 0.005 | 7 | 0 | 0 | 3 | 4 | — | 0% | — |
| 0.005 | 14 | 1 | 1 | 2 | 3 | 50% | 33% | 40% |
| 0.005 | 30 | 1 | 1 | 2 | 3 | 50% | 33% | 40% |
| 0.01 | 3 | 2 | 0 | 1 | 4 | 100% | 67% | 80% |
| 0.01 ←current | 7 | 3 | 0 | 0 | 4 | 100% | 100% | 100% |
| 0.01 | 14 | 3 | 1 | 0 | 3 | 75% | 100% | 86% |
| 0.01 | 30 | 3 | 1 | 0 | 3 | 75% | 100% | 86% |
| 0.02 | 3 | 2 | 0 | 1 | 4 | 100% | 67% | 80% |
| 0.02 | 7 | 3 | 0 | 0 | 4 | 100% | 100% | 100% |
| 0.02 | 14 | 3 | 2 | 0 | 2 | 60% | 100% | 75% |
| 0.02 | 30 | 3 | 2 | 0 | 2 | 60% | 100% | 75% |
| 0.05 | 3 | 2 | 1 | 1 | 3 | 67% | 67% | 67% |
| 0.05 | 7 | 3 | 1 | 0 | 3 | 75% | 100% | 86% |
| 0.05 | 14 | 3 | 2 | 0 | 2 | 60% | 100% | 75% |
| 0.05 | 30 | 3 | 2 | 0 | 2 | 60% | 100% | 75% |

**Best F1 at amount_pct=0.01, days_window=7** (precision 100%, recall 100%).

Recall matters more than precision here: a missed duplicate can become a double payment, while a false flag costs one CFO click. Prefer the widest setting that keeps precision tolerable.

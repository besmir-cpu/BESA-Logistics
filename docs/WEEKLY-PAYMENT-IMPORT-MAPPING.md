# BESA weekly payment sheet — import and invoicing mapping

Source reviewed: user-supplied `Weekly payment details.xlsx` workbook (read-only). This specification contains **no driver names, personal identifiers, financial transactions or individual earnings**.

## Workbook structure
- 97 worksheets: weeks covering 2025 and 2026, several invoice-audit sheets, plus a driver reference worksheet.
- Historical week templates vary. Import must detect columns from **header labels** rather than assuming all years use fixed letters.
- More recent sheets use row 5 headers and store rate settings in the top section.
- A separate driver reference worksheet is used for identity lookups. The source contains sensitive personal identifiers. **Never place its data in a public GitHub repository, source code, logs or browser bundle.**

## Recent weekly template (observed in Week 40)
| Column | Source label | Proposed application field |
| --- | --- | --- |
| A | Ref / accountant complete | external_reference (optional) |
| B | Name of the driver | source_driver_name (match to stable driver ID before import) |
| C | NI Number | sensitive identifier; excluded from routine payment import unless documented legal need |
| D | No of Routes | routes_count |
| E | classroom/ridealong | training_units |
| F | Lead driver incentive | lead_incentive |
| G | Performance Incentive | performance_incentive |
| H | Other Pay | other_pay |
| I | Other deduction | other_deduction |
| J | Van damages | van_damage_adjustment |
| K | Invoice pay | source_invoice_pay |
| L | Actual pay | source_actual_pay |
| M | notes | source_notes; review before migration |

Top-of-week rate inputs are labelled **Route rate** and **Training/ridealong rate** (two distinct inputs); rates change across time. Store rate cards with effective dates, not a single hardcoded value.

## Observed calculation — exact spreadsheet formula structure
One ordinary formula in the more recent sheets calculates K6 using the current week:
`(D6 * $D$1) + (E6 * $D$2) + F6 + G6 + H6 - I6 - J6`.

This is a description of the **spreadsheet's** numerical calculation, **not** yet the authorised invoice calculation or VAT treatment. The workbook uses row-specific formulas, copied/shared formulas and occasional manual adjustments in historic weeks.

## Invoice pay vs actual pay
- **Keep both fields separate** in the data model, interface and reconciliations.
- In the scanned Week 40 sheet, the cached totals match across the 50 populated driver rows in the inspected range. This does **not** establish that the amounts always match.
- Some older weeks contain different or missing actual-pay calculations, so the application must flag differences and support explicit explanations.
- Separate invoice-value adjustments from payment settlement/withholdings after accountant review.

## Import requirements
1. Upload file to private backend; never save uploaded personal rows inside the public repository.
2. Preview import with week/year, heading variations, driver matching confidence and row warnings.
3. Suppress unnecessary personal identifiers (including the reference worksheet) from imports.
4. Validate unit counts, signed adjustments, decimal currency and missing/unmatched drivers.
5. Record source version, uploader and import batch; duplicate import must not duplicate invoices.
6. Reconcile computed invoice pay with source K and settlement/pay with source L.
7. Initially create **drafts only**; no invoices issued or payments sent automatically.
8. Compare draft outputs against genuine SAM invoices with accountant sign-off before replacing SAM.

## Remaining questions
- Obtain one **redacted** SAM-generated invoice for comparison, including its VAT/no-VAT treatment and the issuer wording.
- Confirm which amounts (van damage/other deductions) belong on the supplier invoice vs settlement ledger.
- Confirm whether this is formal self-billing by BESA or invoice generation as agent for suppliers.
- Confirm any driver-specific rate exceptions, bonuses, arrears and payment timing.

Status: analysis only; database and current operational spreadsheets unchanged. Android development deferred.

# BESA office rota / scheduling — first working code milestone

Status: **code in development only**. Not deployed, database migration **not applied** and browser/database integration **not tested**. Google Sheets remains the operational source of truth.

## What has been added
- New office page at `rota.html`; responsive weekly Sunday–Saturday scheduling grid.
- Uses existing `besa_drivers` roster and `besa_vehicles` vehicle register for selections, with no automatic imports or source edits.
- Daily shift assignment with a separate vehicle and optional note, edits and clearing.
- Prevents duplicate vehicle selections within the office UI; reports any duplicate working-vehicle assignments already present in the database.
- Daily C1/C2 target entry, working totals and differences; standalone week CSV export.
- Login requires BESA administrator membership, and tables use server-side RLS (after database migration).
- Basic edit-conflict detection by `updated_at` for concurrent office users.
- Test-only Rota and Finance workflows. The coding tests are **not** a staging security/database test.

## Relevant Google Sheet source reviewed (read-only)
Workbook: `ROTA`, tab `ROTA`. Summaries above driver schedule use:
- **Target** = Target C1 + Target C2.
- **Working** = W + RA + NL1 + NL2 + NL3 + C1 + C2 + EW. The Google Sheet has a day-offset EW reference in some formulas; our new weekly planner counts EW on the assigned date. **Confirm this difference** during reconciliation.
- **Cycle 1** = C1 + RA + EW.
- **Cycle 2** = C2.
- **C1 Difference** = Cycle 1 − Target C1.
- **C2 Difference** = Cycle 2 − Target C2.
- **Total Difference** = Working − Target.
- **SB** standby and **NOT R** not-rostered counts are tracked separately.
- Scheduling codes: W, RA, NL1, NL2, NL3, C1, C2, EW, SB, R, NOT R, Office, OFF.

**This is more extensive than the earlier rough EW/RA/C1/C2-only rule**; the actual spreadsheet formulas also count W and NL1–NL3 as working. Do not use rota counts as payable routes until payment rules are independently mapped.

## Deployment checklist
1. Confirm `besa_drivers.id` and `besa_vehicles.id` are UUIDs in your staging database.
2. Apply `supabase/migrations/001_driver_portal.sql` in **staging** (the admin helper is required).
3. Apply `supabase/migrations/002_office_rota.sql` in **staging**.
4. Configure the staging redirect URL for `rota.html`.
5. Test logged-out, administrator and unapproved-user access, including RLS reads/writes.
6. Test edit-conflict handling with two administrators and repeated writes.
7. Enter representative historical weeks without overwriting the original Google Sheets.
8. Verify target/count parity against the source workbook, especially EW and mixed C1/RA/W/NL codes.
9. Resolve source differences and sign off the scheduling workflow with BESA before any cutover.
10. Define driver publication and permission mapping as a **separate** controlled task. This office page **does not publish into the existing portal shifts table**.

## Safety / limitations
- The current website on `main` remains unchanged.
- The migration only creates separate rota tables; it does not modify `besa_drivers` or `besa_vehicles` contents.
- This page does not send messages, change driver invoices, create payroll or sync back to Sheets.
- Live browser usability, database permissions, deployment, automatic Google Sheets import, records recovery and rollout are still pending.
- Do not merge the branch or turn off Google Sheets until security testing and business approval.

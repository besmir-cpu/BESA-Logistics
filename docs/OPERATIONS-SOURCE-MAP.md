# BESA Operations — Current System and Migration Map
_Last reviewed 17 October 2026. Read-only inventory. No Google Sheets or financial records were changed._

## Business process confirmed by BESA
- Rota, vehicle data and onboarding: managed primarily with Google Sheets.
- Payments: BESA supplies a spreadsheet to accountants. Accountants use a third-party system called SAM to generate driver invoices. BESA wants to bring this workflow in-house.
- Android application postponed until the website is complete, tested and reliable.
- Must retain current operational spreadsheets and SAM process until reconciliation and go-live approval.

## Located source documents (metadata only)
These are *candidate sources*: verify which are currently authoritative and current before migration.

| Business workflow | Drive spreadsheet | Relevant tabs seen | Spreadsheet ID |
| --- | --- | --- | --- |
| Weekly rota and allocations | ROTA | ROTA; Van Allocation; Drivers; other inventory tabs | `1XgTCYhm827X8LnOyWnXe54kZYfWql5rCNEQbJbAzBOY` |
| Driver onboarding | Onboarding tracker | Onboarding DA tracker; MOTs/ services; DT log; Performance tracker | `1jQQ7Sh_CWUuRSb3hKACxNWqMEr8HFL5A6wjHJ1jZxvs` |
| Fleet history | Van archive | Fleet Tracker; Vehicle archive | `19xDTz_ENYu2uRVikWC-d7mLPPvsM-0gcydyBgKiJCIY` |
| Vehicle checks | Weekly Van checks | Summary; week-specific checks | `1JPs2T1R5uyw4iLd0umJFKZtqk8HnV9JVD8W_qh0pfdg` |
| Payments | BESA PAYMENT TRACKER | Week-specific sheets | `1jil7MkVLaRCZ4ICQy8mb5jrdHzZV3Tjqj5emmowesU4` |
| Weekly payment submissions | Weekly payment details | Week-specific sheets | `1y58qGupKErcEc_2iPhoJ4Pfkc51kskcn5oq0YpJdjqY` |

Other candidate records include VAN DAMAGE TRACKER, BESA onboarding form responses and invoice templates. **Do not migrate any password-storage tabs, credentials or unrelated personal data.**

## Target workflows, in build order
1. **Reliable platform**: private backend, role-based access, per-driver isolation, audit trail, database + storage backups, restore exercise, staging environment, monitoring, immutable ledger-style payment records, tests and migration plan.
2. **Driver master register**: stable driver identity (including Amazon Transporter ID where authorised), onboarding state and vehicle assignments. Approval required before a new portal profile is linked to an office driver record.
3. **Rota**: week view, shift allocation and revisions, import/export, lock periods, permissions, audit log. Currently known shift rules: EW/RA/C1/C2 counted as working; Office excluded from the requested driving-day count.
4. **Fleet**: vehicle register, allocations, MOT/service compliance, damage/check history.
5. **Payments — shadow mode**: import existing weekly sheet, configure per-contract rate cards, bonus/deduction lines, corrections and VAT statuses; generate **draft** invoice or self-billing documents; reconcile line-by-line and totals against accountant/SAM outputs. No automatic issuance until review. Determine whether SAM output is invoices *from* drivers to BESA (self-billing) or invoices *from* BESA to drivers and get accountant approval of document format and handling.
6. **In-house payment workflow**: office review, approval, issuing documents, exports for banking/accountants, period locking, audit/reissue/credit-note workflow, tax and accounting integration boundaries. Accountant continues to handle statutory obligations unless separately agreed.
7. **Parallel run and cutover**: at least several representative historical weeks and real weekly parallel cycles; signed off by business owner and accountant; drill failure and rollback; migrate gradual modules.
8. **Android app**: only after web site stable and signed off (explicitly deferred).

## Non-negotiable rollout checks
- Live Sheets and SAM workflow remain authoritative until BESA explicitly approves cutover.
- Snapshot/test with representative data, validate missing/duplicate records, and document mappings.
- Verify RLS tests across office/manager/driver roles and storage access.
- Confirm reconciliation for zero-shift, mixed-shift, rate change, late correction, deductions, credits, VAT and contractor-status cases before invoices.
- Establish owner-approved recovery point, recovery time and tested backups, plus named support/maintenance responsibility.
- No payroll, bank transfers or driver invoice issuance from development or staging.

## Open high-impact question
What does SAM actually generate and who is the legal invoice issuer (driver/self-billing vs BESA invoicing driver)? Obtain one **redacted** representative SAM output and matching weekly input to define correct document, accounting and approval rules.

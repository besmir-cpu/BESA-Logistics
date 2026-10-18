# BESA reliability release plan — development branch only

## Safety boundary
Branch: `development/performance-reliability`; draft PR #2, based on current live main.
**Do not merge or run migrations without office owner approval.**
The GitHub Pages website and Supabase database remain unchanged until this release is reviewed. The Google Sheets and SAM remain authoritative; no invoicing, VAT determination or payments are triggered.

## 1. Navigation and speed
- Dashboard now renders detailed Vehicles, Drivers, Compliance and Activity **on demand** rather than all at once. Switching back to a previously rendered section does not rebuild it until data changes.
- Supabase driver/van/activity refresh remains authoritative and has not been replaced with a stale cache.
- Date-based reminders refresh only on a day change while the tab is visible; they no longer rebuild every table each minute.
- ExcelJS (~megabyte class dependency) is fetched only on XLSX import; CSV can work without that download.
- Standalone pages keep consistent navigation, update the Rota/Van selected tab on hash changes, and prefetch public page shells when a pointer, focus or touch indicates likely navigation.
- This is **not yet** a full one-document SPA; distinct operations pages still perform a document navigation. This phase avoids risky page rewrites before launch.

### Speed acceptance gates
- Reproduce the staff-reported ~3-second delay using Chrome Android on the same connection.
- Record first load and subsequent navigations with `Speed info` UI (privacy-first; in-browser memory only).
- Benchmark cold load, warm load, and Dashboard↔Rota↔Van Allocation↔Payments; check 400 synthetic drivers in 4-week Rota on CI desktop (<3000 ms render target).
- Verify no JavaScript errors, no blank sidebar and no loss of draft edits during section transitions.
- Chromium CI desktop measurements are **not** valid stand-ins for 4G mobile or real Supabase query latency.
- If warm navigation remains >2 seconds, consider a unified app-shell/router after collecting the baseline.

## 2. Secure draft storage and history
Schema (optional only): `supabase/migrations/003_secure_workspace_drafts_optional.sql`.

When installed after written approval, the office pages provide:
- Explicit `Load saved` and `Save securely` with admin sign-in; no unattended background transfer of spreadsheet data.
- Revisions tracked per Rota/Van master draft, per Sunday week for Payment Tracker and one Working Hours review summary.
- Server-side optimistic concurrency; staff B is denied if staff A saved since B loaded. Staff B must export or review before retrying.
- Version history, with user-initiated restoration of earlier history to the browser. Re-saving a recovered version creates a NEW latest version rather than erasing history.
- RLS/admin checks on reads and saves, restricted RPC, no anonymous write access.
- Finance drafts are *not* invoices, remittances or SAM submissions.

**Important limitations:** The migration is not installed or tested with real Supabase administrator and non-admin sessions yet. These pages continue in memory-only mode until then. The existing driver evidence migration is also optional and unapplied. The interface intentionally refuses insecure attempts.

## 3. Backup and disaster recovery (must be configured outside the public repo)
Audit history is not a true backup. An owner with authorised access must:
1. Check Supabase plan and database size. Confirm whether automated backups/PITR are included; do not infer entitlements.
2. Enable scheduled database backups, with encryption and access restricted to a designated recovery administrator. Configure retention and location in line with BESA's data-retention policy.
3. Back up private driver evidence storage using approved secure file storage (database backups alone may not include file blobs).
4. Perform a test restore into a **separate staging Supabase project**, not over the live database; confirm restored users, Rota, vehicle allocation, payment drafts and row-level policies.
5. Set and document actual recovery point and time targets (RPO/RTO) after testing, not guesses.
6. Record backup completion and failure alerts in a private monitoring service, never in a public repository or personal email containing records.
7. Require two-person review for restoring financial or personal records to production. Never turn on invoice issuance by restoring an old draft.

## 4. Privacy and security tests before merge
- Test admin, non-admin, expired session, anonymous session for each draft table and RPC. Verify no non-admin can read history, upload evidence or access signable private URLs.
- Verify that opening another browser session after sign-out cannot view personal recruitment data.
- Check missing migrations fail closed (no plain-text browser persistence); no Google Sheets or SAM writes.
- Test 2 concurrent administrators editing the same week and that conflict is shown without overwriting.
- Check retention/legal review for staff names, licence images, right-to-work and payment notes. Do not put NI, addresses, financial records or screenshots in the public GitHub repo.
- Apply a strict content security policy compatible with Supabase and approved CDNs in a staged hosting environment after inline JS dependencies are audited.
- Enable MFA for authorised administrator accounts and review Supabase project policies/service credentials outside this public repo.
- Confirm Supabase site origin and redirect URLs match current and future approved domains.

## 5. Monitoring and error handling
Local `Speed info` exposes:
- Time to DOM content loaded
- Main dashboard data-load time (includes network and client-side work)
- Average recent navigation/data timing
- Number of long tasks (>=50 ms) and uncaught errors
No driver name, contact details, URL with tokens, or financial data is transmitted or persisted by this module.

For ongoing production monitoring, select a privacy-reviewed error/performance monitoring service and alerts **after** consent, budget and data-processing controls are approved. Do not add third-party reporting to a public page without privacy review.

## Launch acceptance checklist
- [ ] Existing frontend, browser smoke and synthetic-load checks all green
- [ ] Real Android baseline before/after (cold and warm visits)
- [ ] Real Rota/Payment import tests with sanitised copies, reconciled to Sheets
- [ ] Supabase migration independently reviewed and tested with admin/non-admin
- [ ] Backup, private document retention and staging restore verified
- [ ] Product owner approves live database migration explicitly
- [ ] Product owner approves main-branch release explicitly
- [ ] Monitor user experience after release; rollback plan reviewed

## Hosting upgrade
**Defer any paid hosting migration** until functionality is complete and benchmark evidence supports it. This development plan avoids committing BESA to unnecessary increased capacity. When ready for production, assess a host suited to authenticated business workflows, private evidence and monitoring, then migrate in a separately approved release.

## Read-only production Supabase audit (2026-10-18)
- Healthy BESA LOGISTICS project on Free organisation plan; no development branches or recorded migration history reported.
- 57 vehicle records and just 1 driver record in the current BESA database. Reconcile where the full driver list is stored before activating permanent saving.
- Optional secure workspace draft schema and saving RPC have NOT been installed. No GitHub proposal migrations were executed.
- Security Advisor flags public.rls_auto_enable() as an anon-executable SECURITY DEFINER function. Read-only catalog check confirmed anon and authenticated execution permission. Review use and privileges carefully before modifying grants; do not invoke this function casually.
- besa_is_admin() is SECURITY DEFINER and executable for authenticated (not anon); validate the intended privilege boundary.
- Legacy documents and signatures tables have RLS enabled but no policies and currently zero rows. Keep them closed until workflows are reviewed.
- Leaked-password protection disabled; review authentication mode and settings before changing anything.
- Performance Advisor flags legacy drivers policies, two foreign-key indexes missing on empty legacy tables, one unused driver index. These are not evidence of current 3-second page navigation latency with such a small database.
- The read-only audit changed NO live data, policies, permissions or backup settings.

## Approved database deployment — 2026-10-18
The BESA owner explicitly authorised controlled secure database changes, separate from website release. Supabase migrations were applied to the existing **BESA LOGISTICS** project:
- `besa_secure_workspace_drafts` — created only new `besa_workspace_drafts` and `besa_workspace_draft_history` tables, administrator-only SELECT RLS policies, and approved write RPC with version checks. Reuses the existing `public.besa_is_admin()` gate; no existing vehicle, driver, payment or invoice records were modified.
- `besa_restrict_rls_maintenance_function` — revoked public, anonymous and authenticated EXECUTE on the existing SECURITY DEFINER RLS-maintenance function; did not remove its event-trigger use.

Checks completed: no anonymous table read permissions; no direct authenticated INSERT to either new table; only authenticated users can invoke the explicitly admin-gated save RPC; synthetic unauthorised request rejected; synthetic authorised save v1, stale-write conflict and update v2 validated with two audit revisions inside a rolled-back transaction. No test records remain: both new tables contain **zero records**.

Supabase Security Advisor no longer flags anonymous SECURITY DEFINER execution. Remaining auth password-protection, legacy documents/signatures RLS and approved authenticated definer warnings need separate review. Auth gateway behaviour with genuine signed-in staff JWTs, concurrent editors, file imports, backup restoration and mobile performance remain release gates.

**The development frontend remains in a draft PR and is NOT published to the live website.** No automatic saving, Google Sheet replacement, SAM invoice issuance or financial processing was enabled. Production database setup alone does not make the secure save buttons available on the live site.

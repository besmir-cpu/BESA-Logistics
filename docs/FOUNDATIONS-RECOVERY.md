# BESA foundations and recovery

BESA uses GitHub for source and release checks, Netlify for the company site and office, and Supabase for authentication, private records and documents. The foundations release keeps these platforms and preserves existing records.

## Access and hosting

Office administrators are linked to their Supabase user UUID. Database policies require administrator membership and a verified authenticator session once enrolled; the global MFA requirement is enabled after the new sign-in screen is published. Candidate invitations remain separate expiring capabilities and do not create office accounts. Public account registration is disabled.

Netlify builds the locked dependencies with `npm ci` and `npm run build`. The published folder contains only allowlisted website assets. Office and candidate pages are served directly with CSP, no-store, frame restrictions, HSTS and no-referrer headers. Browser scripts load from the company domain. GitHub Pages publishes only redirects for old bookmarks, preserving invitation fragments to the fixed company domain.

Shared driver checklists use versioned saves. A stale editor gets a conflict and keeps their browser draft. Reload saved progress replaces the draft only after confirmation; a failed load retains it. Driver evidence is private, limited to 8 MB PDF/JPEG/PNG/WebP, checked for file signatures and linked to a driver UUID. Saved evidence is not publicly addressable. Existing candidate document access remains private and expires after 60 seconds.

## Daily encrypted backups

The `Encrypted BESA backup and restore rehearsal` GitHub workflow runs at 01:43 UTC daily and can be run manually. GitHub schedules can be delayed. A failed run must be investigated; a missing or failed run is not a successful backup. Keep GitHub Actions failure notifications enabled for the repository owner.

Each successful run exports a consistent snapshot of all public business tables, authentication users and identities, MFA factors, security settings, schema metadata and every BESA Storage object's actual bytes. It encrypts the bundle on Supabase using the recovery public key. The runner decrypts only in memory, checks required tables and every document's SHA-256 and byte count, then reconstructs rows in an isolated schema and compares their content. It removes that schema in the same transaction. Only encrypted `.pgp` archives and non-personal verification manifests are uploaded as GitHub artifacts, retained for 90 days.

The job token permits export and isolated rehearsal; it cannot restore or overwrite production. Its hash and recovery public key are stored in the private database schema. The private key and passphrase are GitHub encrypted Actions secrets, never public repository files. A second local copy uses a passphrase-encrypted private key and Windows user-bound DPAPI protection outside the repository. Losing the Windows account requires recovery through an owner-controlled GitHub workflow using the existing secrets; GitHub does not display secret values again.

The free plan has no Supabase managed database backups or point-in-time recovery. BESA chose to remain on free. The export currently fails closed above 64 MB of document bytes or approximately 96 MB of serialized content; increase capacity or adopt a streaming backup before approaching these limits. A database-only export must never be labelled a complete document backup.

## Recovery procedure

1. Stop writes during a real recovery incident. Record the last successful workflow, archive timestamp, verification manifest and deployed Git commit. Preserve the original archive.
2. Download a successful encrypted artifact from GitHub Actions. Verify its SHA-256 against its manifest. Use the recovery key and passphrase through an owner-controlled process; never paste them into chat, public logs or repository files.
3. Decrypt in a private recovery environment. For an integrity check, run `scripts/run-backup-job.mjs` with the established secrets; it exports and rehearses without modifying production. The pre-release local checkpoint can be validated with `scripts/recovery-key.mjs verify PATH` on the protected Windows account.
4. Build a separate recovery project with the recorded migrations and schema metadata. Recreate authentication users, identities and factors through supported Supabase administration procedures. Restore table rows with dependencies in order; upload document bytes to private buckets and check hashes. Restore policies and grants before exposing application access.
5. Test administrator MFA, non-admin denial, anonymous denial, candidate invitation boundaries, all operational workspaces, row counts and each private document. The daily rehearsal verifies row content against current table types; it does not prove an entire fresh-project restore, constraints, authentication login or document re-upload. Those require a separate staging recovery exercise. No measured full-disaster recovery time is claimed.
6. Have the BESA owner review the verified recovery before switching production. Never restore over live records as a test. Restored finance drafts remain drafts and do not issue payments or invoices.

## Release and rollback

Changes must pass the `foundations` check before merging to main. Netlify then builds from main. Verify the deployed commit and security headers on `/`, `/office/`, `/office/rota.html` and `/onboarding/`. Roll back website code using Netlify's previous successful deploy if necessary. Keep the additive database schema and backups; do not drop tables to roll back a visual release. Emergency authenticator recovery is an owner identity-verification procedure in Supabase, not a bypass in the public app.

Runtime dependency auditing reports no production dependency vulnerabilities at this release. Four low-severity development advisories remain in Browserify's unused elliptic/signing dependency chain. Excel's browser bundle includes only its required hashing and random-salt implementations, excluding that signing code. Leaked-password checking is unavailable on the chosen free plan. Password policy, MFA and restricted registration still apply.

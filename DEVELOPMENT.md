# BESA Operations — Verion-inspired development foundation

This branch is **not production-ready**. It preserves the current GitHub Pages `main` branch and adds an isolated starting point for the office/driver application.

## Implemented in this branch

- `driver.html`: mobile-first driver portal, authenticated with the existing Supabase project. Driver details, private file uploads, document status and read-only rota.
- `office.html`: authorised office page for driver portal profiles, document approval and shift publishing.
- `supabase/migrations/001_driver_portal.sql`: new tables, row-level security policies, private Storage bucket and shift working-day calculation.
- `driver/portal.js`, `driver/office.js`, `driver/portal.css`: logic and layout for the two new pages.

## What is **not** done

- SQL migration has **not** been executed against your database.
- Driver invitation/identity verification and account provisioning are not automated yet. An authorised operator must invite or create accounts in Supabase Auth; `shouldCreateUser:false` prevents open email signup.
- End-to-end integration testing with real accounts and a staging Supabase environment is outstanding.
- The driver portal is a responsive web page, **not yet an Android app published to Google Play**.
- Production document compliance requires an agreed retention policy, authorised access review, backups, breach/incident procedures, and professional legal/security assessment.
- The Verion product document describes functions, not source code. Payroll, invoices, Amazon imports, direct HMRC integrations, and full fleet controls are still future milestones.

## Setup in a non-production Supabase project FIRST

1. Create a database backup and use a disposable staging Supabase project to validate this migration.
2. Ensure `public.besa_admins` exists with an `email` column (used by the existing office app). Seed only authorised office email addresses.
3. Run `supabase/migrations/001_driver_portal.sql` using the Supabase SQL editor in **staging**. Inspect policy behaviour before any production application.
4. Configure site redirect URLs for `driver.html` and `office.html` under Auth settings in staging.
5. Create an **invited** driver account through Auth management. Do not enable public account creation.
6. Set the staging project URL and public anon key in a local/staging `config.js`. **Never commit service-role keys**.
7. Test with two separate users: an administrator and an invited driver. Confirm the driver cannot list other profiles/documents, alter approval decisions, write rota rows or open another user's storage objects.
8. Only after proper review should a production migration and release be scheduled.

### Integration note

The current live admin interface uses `besa_drivers`, `besa_vehicles` and related legacy tables. This prototype deliberately uses **separate** `besa_portal_*` tables so accidental updates cannot corrupt your live driver register. Before operational rollout, create a supervised matching/approval workflow using the existing driver's unique identifier. Do **not** join sensitive records by names alone.

### Shift rules

`EW`, `RA`, `C1` and `C2` are counted as working days. `Office` and `OFF` are not counted as *driving* workdays, per the current requested logic. Confirm the actual BESA payroll/rota interpretation before payment calculations; **no payment calculation** is performed in this milestone.

## Android release path

After validating office/driver permissions and the API, build an **Expo / React Native** Android client against the same Supabase database (or wrap a mature PWA only after evaluating Play Store policies and mobile UX). Deliver an internal Android test package first, then Play Console closed testing, then release after review. The mobile app must not embed privileged server credentials, and should use restricted short-lived file access.

## Review checklist

- [ ] Run staging migration successfully
- [ ] Permission tests for driver A vs driver B and office administrator
- [ ] Verify original names of uploaded files never create storage paths
- [ ] Verify every uploaded document is privately stored and accessible only to its owner/admin
- [ ] Test network errors, wrong file types, 10 MB boundary, signed URLs and multiple sessions
- [ ] Define onboarding evidence expiry, storage retention and access audit trail
- [ ] Agree driver invite process and consent/signature requirements
- [ ] UI/browser testing on desktop, Android Chrome and iPhone Safari
- [ ] Design and implement Google Play app separately

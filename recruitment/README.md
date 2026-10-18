# Driver Recruitment & Onboarding — source map and rollout boundary

## Sources reviewed (read-only)
Two connected, owner-accessible Google Sheets:
- **Driver_Recruitment_Tracker** / tab **Driver Recruitment Tracker**, ten headed columns, frozen header row: Driver, Phone Number, Requirements, SAM First Part, Amazon Account, Accurate DBS, Amiigo Training, Sam 2nd Part, Notes, Status.
- **Onboarding tracker** / tab **Onboarding DA tracker**, eighteen headed columns, frozen header row: Email, Phone number, Driver, CT date, Day, Week, Vendor, CT completed, SAM, DVLA/BGC, RA 1, RA 2, RA Completed, Active, Notes, Review flags, Transporter ID, H&S completed.

Related but not yet merged: **Interview Tracker** and the separate onboarding form responses, which include more sensitive identifiers, tax/bank details and ID material. **Do not** import those into a public static site.

## Combined office screen
URL: `recruitment.html`, linked from the BESA administrator dashboard. Access is verified against existing Supabase authentication and the `besa_admins` roster before any records are requested or shown. Admin credentials/roles must also be enforced by existing Supabase RLS.

- Read current `besa_drivers` records whose existing status is `Onboarding`. Show them in the recruitment queue. This is **not evidence of an actual invitation** and does not create or send any invitation.
- Import one recruitment .xlsx and one onboarding .xlsx directly into **browser memory**, retaining their separate fields on a combined candidate row.
- Match by unique email, then unique normalised UK phone; a unique, non-conflicting name is currently a fallback. Conflicting or ambiguous identities remain separate with review flags.
- Review pipeline status, source statuses, classroom-training dates/providers, SAM/DBS/Amazon checks, RA dates, H&S and activation indicators. Editing is draft-only.
- Local draft CSV export contains personal data; staff must keep this file confidential and comply with company retention policy.
- **No Google Sheet writes, candidate invitations, permanent recruitment records, identity document uploads, account creation, approval or driver activation.**

## Next work for production recruitment
1. Determine what action constitutes 'invited to the system': the BESA admin invite workflow and its authoritative event, not merely a driver's `Onboarding` status.
2. Add an admin-only, audited invitation table with a verified event and applicant ID, linked to existing driver records. A pending invite should appear even before the candidate accepts.
3. Add separate role-limited applicant access and verified invitation handling. Do not use a public, guessable enrolment link.
4. Store recruitment and onboarding checklist state securely in Supabase tables with RLS, created/updated audit fields, invitation expiry and safe recovery/backups.
5. Keep applicants and office staff separated by role. Protect personal details, ID documents, right-to-work checks, UK GDPR retention and deletion.
6. Test duplicate name/contact resolution with office staff and import from *each* original tracker, reconciling statuses against source data.
7. Test from invite sent to accepted, submitted, reviewed, classroom training, ridealong, activated. Require explicit human sign-off before activating an applicant or promoting to payable driver.
8. Only after acceptance and access review, consider replacing the existing Google trackers.

**No live database migrations were applied for this feature.** This is a verified admin-facing prototype that reads existing onboarding-status drivers and works locally with imported data.

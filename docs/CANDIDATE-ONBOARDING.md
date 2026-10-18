# BESA private candidate onboarding — release and operations guide

## Staff workflow
1. Sign into the existing BESA dashboard as an administrator. Under **Drivers & Onboarding**, add a new driver using their name and email with status **Onboarding**, then open their profile.
2. Open **Candidate invitation** and choose **Generate private invitation link**. A 256-bit unpredictable token is generated on the server and stored only as a SHA-256 hash.
3. Copy the link or create an email draft in your mail app. The system does not silently send email. **Do not post this link in public groups.** It expires after 7 days. Generating another link revokes previous unsubmitted links.
4. Candidate opens the mobile form, enters personal details, dates and eligibility info, uploads both sides of driving licence and either passport or other RTW evidence. Extra DVLA and proof-of-address files are optional. Accepted PDF/JPEG/PNG/WEBP; max 8 MB each.
5. Candidate confirms the use of information and declaration, then submits once. Submission creates a **review-only** office record; does not change the driver table, payroll, Rota or SAM.
6. Staff reopen **Candidate invitation** within the driver profile, see submitted fields and documents, and use 60-second signed links for private file viewing. Verify details against source documents, perform the actual UK statutory right-to-work check and driving licence verification, then update existing operational status manually when authorised.
7. Staff can revoke unfinished invitations. Revoking does not delete already uploaded evidence or override an earlier submitted application.

## Technical privacy model
- Candidate static page loads only same-site CSS/JS. Strict HTML CSP and no third-party analytics, cookies or browser local/session storage for applicant data.
- Secret token is stored in URL **fragment** only; fragment is not sent to a server in page requests. Every Edge action gets it in a POST body.
- Edge Function `besa-candidate-intake` has `verify_jwt=false` specifically because candidate users lack accounts. **It authenticates every request itself** with either a 256-bit hashed, expiring/revocable invite or a Supabase Auth-verified admin JWT plus the existing BESA admin allowlist.
- Browser never receives Supabase service credentials. Service-role client exists only in Edge. Reject unknown HTTP verbs, unexpected origins, oversized bodies, invalid MIME and file magic bytes. Bucket is **private** and has no public/anon/authenticated Storage access policies.
- New tables `besa_candidate_invites` and `besa_candidate_documents` have RLS enabled; direct user-role reads require admin membership, direct writes forbidden. Candidate data writable only through the vetted Edge Function.
- Files are kept in `besa-candidate-private`, with filenames randomised and metadata linked to invitation and BESA driver UUID. Signed reviewer URLs expire after 60 seconds.
- No real candidate data, passwords or document images are checked into GitHub.

## Important operational/legal controls
- **Identity is NOT cryptographically verified by possession of an invitation link.** Anyone forwarded the link could submit details. Staff should personally confirm documents and candidate identity; consider identity proofing/OTP for next release.
- Right-to-work pictures and share codes are **unverified evidence**, not statutory RTW approval. BESA must perform the relevant Home Office process and retain the prescribed evidence.
- No antivirus/malware scanning pipeline yet; only file type/size/signature restrictions. Staff must treat PDFs as untrusted and ideally use an approved scanner.
- BESA must supply its own applicant privacy notice, lawful basis/retention policy, UK GDPR access and erasure process, and backup/incident response plan before broad recruitment use.
- Supabase Free plan capacity is finite (uploaded files can add up quickly). Monitor `storage` usage after initial invites. Avoid promising unlimited uploads.
- Changes to driver profile, SAM accounts, invoices, payments or Google Sheets are deliberately excluded.
- Admin login requirement: an existing BESA driver record with an email address must be created first. This prevents unauthorised public visitors from creating driver accounts.
- Expired links cannot upload or resubmit. Do not copy or screenshot links into public tickets or logs.
- BESA owner should send **one test invite** privately, complete it with fictional data and files, then verify staff review/expiry in the browser before inviting actual candidates.

## Test evidence
GitHub PR #3 automated security and Playwright mobile tests use fictional candidate information and mocked files; they do not transmit actual passports. RLS and bucket checks must be verified separately after database migration. The invitation function must be deployed before the form will accept real links.

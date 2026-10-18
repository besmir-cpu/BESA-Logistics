# BESA Logistics — Secure Driver Onboarding (Netlify)

This is a self-contained, static candidate onboarding frontend copied from the BESA Logistics release. Deploy it as a **NEW SEPARATE Netlify project**, not over the company homepage or the office portal.

1. In Netlify under your BESA-owned team, choose Add new project > Deploy manually.
2. Upload this folder (unzip the ZIP first if Netlify requests a folder). Netlify should display a temporary https://...netlify.app address.
3. In that **new onboarding project**, choose Domain management > Add a domain you already own > **onboarding.besalogistics.co.uk**. The parent besalogistics.co.uk DNS is already administered in Netlify; Netlify can manage the new subdomain under its DNS zone. Don't edit root or WWW records.
4. Once the domain shows HTTPS enabled, open https://onboarding.besalogistics.co.uk/ with no token: it must refuse access, not display blank source code.
5. Ask the BESA maintainer to switch the invitation Edge Function to LINK_BASE=https://onboarding.besalogistics.co.uk/#invite= once this URL and its CORS allowance are verified. **Until that step, staff-issued links will still use the existing GitHub Pages address.**
6. Complete one private test invite using dummy data and non-identity test PDFs to confirm upload and staff review before using actual passports or licences.

No Supabase secret credentials, candidate records or identity documents are included. Candidate photos upload only to the private Supabase service when a valid expiring token is supplied.

Security: the invitation code is in the # fragment (not the URL query). Do not forward it, post it publicly, or paste it into support tickets.

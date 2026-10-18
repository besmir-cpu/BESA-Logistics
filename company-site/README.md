# BESA Logistics — independent company website

This is a **separate public-facing company website**, created for BESA Logistics Ltd and stored in the BESA-controlled GitHub repository:
`besmir-cpu/BESA-Logistics/company-site/`.

**The old `besalogistics.co.uk` domain/site and the private BESA operations dashboard have not been modified.** The preview under `/BESA-Logistics/company-site/` is not the final branded domain.

## What is included

- Original BESA-branded, responsive company homepage
- Services: last-mile delivery, driver support and fleet coordination
- About the business using verified company registration details
- Careers section explaining the invitation-only secure driver onboarding workflow
- Contact section configured from a simple editable file
- Mobile navigation, accessible section links, SVG logo, metadata and keyboard support
- No third-party scripts, trackers, forms collecting data or public driver document URLs

## What you can change without asking the original developer

Open the repository in your own GitHub account. Your connected account has **admin rights** to this repository. Open `company-site/site-config.js`, click the pencil/edit icon, enter the **verified** BESA contact email and phone, then **Commit changes**. The website will show the links automatically.

For service descriptions and page text, edit `company-site/index.html` in GitHub. Design colours/fonts are in `company-site/styles.css`.

Avoid entering personal candidate/driver details, passwords, bank records or API keys in any of these public files.

### Edit these contact settings
```js
window.BESA_COMPANY_SITE = Object.freeze({
  companyName: 'BESA Logistics',
  contactEmail: '', // add a working BESA email AFTER confirming ownership
  contactPhone: '', // add a working business phone AFTER confirming
  heroStatement: '...'
});
```

Do not invent/assume an email address. Contact placeholders deliberately show until the owner confirms real contact channels. The preview is marked **DESIGN PREVIEW** and set to `noindex,nofollow` so search engines do not treat it as the official launch.

## Publish on a BESA-owned domain (separate from BESA operations)

Recommended final arrangement:
- `besalogistics.co.uk` and `www.besalogistics.co.uk` — public company website
- `onboarding.besalogistics.co.uk` — candidate **private-invitation** form (handled separately with updated Supabase allowed-origin and link settings)
- A BESA staff/operations domain later, after its own security/hosting review

### Safe launch checklist

1. Verify you **own and can log into the domain registrar/DNS account** for `besalogistics.co.uk`. If the original designer owns the domain, request its transfer to a company-controlled registrar account. Website source ownership and domain ownership are separate.
2. Choose a **BESA-owned hosting account** (e.g. Cloudflare Pages or Netlify) linked to the BESA GitHub repository. This static site can be deployed with the publish/root directory set to `company-site` and no build command.
3. Before changing DNS, check **all existing DNS records**, particularly MX/SPF/DKIM/DMARC for company email and any other subdomains. Back them up. **Do not replace nameservers or delete records blindly.**
4. Confirm the real public contact email and phone; review business copy, company facts and applicant privacy wording with the company owner.
5. Remove the preview banner and the `<meta name="robots" content="noindex,nofollow">` directive in the **separate production copy**, then configure HTTPS and attach `besalogistics.co.uk` / `www` to the public site.
6. Verify TLS, homepage/mobile performance, navigation, contact links, email delivery and any pre-existing website redirects.
7. Separately move the candidate portal to the branded `onboarding.` subdomain; update the Edge Function `WEB_ORIGIN`, CSP and invitation base URL before sending new links; honour old invitation links for their remaining life.
8. Retain the GitHub repository and DNS registrar under company-controlled accounts; require MFA and at least one backup admin. Export a backup of the old site's content before final cutover.

### Important architectural note

GitHub Pages for the **existing BESA operations** repository publishes the repository root. Adding a CNAME to that same GitHub Pages deployment would put the **operations dashboard**, not this public site, at the company domain. **Do not do that.** Use a separate static-site hosting project publishing `company-site` or create a dedicated BESA-owned website repository for production.

### Verified legal source

BESA LOGISTICS LTD, company number 14938271, incorporated in 2023, registered office 203 Kilburn High Road, London, NW6 7HY:
https://find-and-update.company-information.service.gov.uk/company/14938271

The registered office is **not represented as the trading/dispatch location**. Service language is general to the BESA delivery-operations context; no invented fleet numbers, customer logos, delivery guarantees or partnerships are claimed.

## Technical handover

All public page code is self-contained, HTML/CSS/JS and editable by the owner, with no build-time vendor accounts or paid libraries. There are no personal files or private secrets in the source. To back it up, download the `company-site` directory or clone/export the GitHub repository.

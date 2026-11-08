# StayNas commercial website phase

## Scope
- Adds the StayNas module catalogue and interactive guest-journey walkthrough.
- Adds architecture, trust/security and commercial plan pages.
- Adds a public demo-request form, server-side validation, a durable request table and a founder-only request inbox.
- Updates product-domain SEO metadata, sitemap and robots policy.

## Demo request pipeline
1. The public form posts to `/api/public/staynas-demo-request`.
2. The server validates and normalises the submission, requires explicit contact consent, applies a honeypot, suppresses repeat submissions from the same email within ten minutes, and limits each hashed request origin to five submissions per hour.
3. The server writes the request to `public.staynas_website_demo_requests` using the server-only Supabase service-role client.
4. If `RESEND_API_KEY`, `STAYNAS_DEMO_NOTIFICATION_EMAIL` and `STAYNAS_DEMO_FROM_EMAIL` are configured, the server sends an email notification after the durable write.
5. Founder users can review and update request status at `/admin/website-demo-requests`. Access is gated by `is_staynas_founder_ai_admin()`.

## Release requirements
- Review and apply `supabase/review/20261107100000_staynas_website_demo_requests.sql` through the approved database migration process before enabling public submissions.
- Configure the optional Resend notification variables in the deployment environment if email alerts are required.
- Run the marketing validation tests, full CI, generated route verification and production build.
- Verify apex and www domains, all product routes, the demo request path, founder inbox access and existing tenant guest booking entry points.
- Do not claim external security certification or connector availability unless separately evidenced.
- No production database migration is applied by this change itself.

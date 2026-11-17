# Strangers email deliverability publisher

Source: `a30f18321747f71a7c162b4ab050a6377d1dd804`
Base: `81d3bf37f211fbb00f4923a0d7492930caae9a75`
Branch: `fix/email-deliverability-2026-11-17`

Publishes the frozen email-feedback, suppression and authentication-setup change using the existing encrypted saved-user access. Identity, write permission, exact-head and destination guards, full normal Tests and saved-user squash remain mandatory. Existing narrow CI fixture retry safeguards are unchanged; application or browser assertion failures are never bypassed.

416 local API/unit tests, typecheck and all 319 browser tests passed. Phone/iPad light/dark focused checks passed. Migration 31 adds only feedback metadata and suppression state; transactional backups exclude credentials and message bodies. Sender overrides, frozen dispatch payloads, provider idempotency and staff/customer privacy remain intact. PR168's diary changes and PR169's deployed asset fix are preserved.

The host confirmed sales@strangerscoffee.com as the DMARC reporting inbox. Exact TXT records and a signed Resend webhook setup are supplied in Admin Email health and README-deploy.md. No DNS change or new secret is applied by this publisher; provider account access is unavailable. No real mail, Slack message or order is submitted. No new dependency or paid service.

After normal CI and saved-user merge, verify the merged tree, Cloudflare build and read-only live resources/authentication. The app reports feedback as unconfigured until the external webhook/signing secret is configured.

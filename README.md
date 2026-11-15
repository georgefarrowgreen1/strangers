# Strangers mobile wholesale Orders fix publisher

Source: `dfe2cd382cdb160fcc4dbe6038d2fb6ee21d6d96`
Base: `b128c705377ee311140450d8bda18a1f7799eb30`
Branch: `fix/admin-wholesale-mobile-overflow`
Title: Fix mobile wholesale order controls and clipped rows

Publishes this frozen CSS/browser-test change after complete local validation. Existing encrypted saved-user access verifies the collaborator and write permission, creates a ready PR, waits for complete normal Tests, and squash-merges under the saved user identity. Cloudflare then deploys main. No secret, migration, dependency, service, or DNS change.

The Orders header no longer expands the list track beyond its panel. Phone actions occupy two rows, all settings remain visible, compact labels fit, and prices/statuses/preparation buttons stay inside the panel. Ten new responsive regressions cover phone, tablet and desktop in both themes. The complete local API suite passed (386 plus typecheck) and the complete normal browser suite passed (286). Final phone/iPad light/dark visual review precedes publication; complete GitHub Tests remain mandatory.

Publisher identity, frozen branch/head checks, secret redaction and narrow single test-fixture retry safeguards remain unchanged. No generic application assertion or browser failure is bypassed. Verify exact merged tree, successful Cloudflare build and read-only live checks. Never submit real production orders or verification email.

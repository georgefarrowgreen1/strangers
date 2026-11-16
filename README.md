# Strangers production audit fixes publisher

Source: `868706b6400b34593b7cf2199c028eef1b1230f0`
Base: `c2ee2bd00bf1436c83d07e452e798fbc17c2c356`
Branch: `fix/production-audit-2026-11-16`
Title: Fix all seven production audit findings

Publishes the frozen production-audit fixes after complete local validation. Existing encrypted saved-user access verifies collaborator identity and write permission, creates a ready PR, waits for the complete normal Tests workflow, and squash-merges under the saved user identity. Cloudflare then deploys main.

The change validates current standing-order catalogue eligibility before repricing, retains reviewed fulfilment batch versions and confirms actual saves, persists/retries dispatch email events atomically, recovers interrupted Slack claims through explicit review, snapshots all backup reads in one transaction and bounds streaming PDF/photo uploads. Migration 30 appends email-outbox and Slack-lease tables; shipped migrations and existing records/IDs/snapshots are preserved. Order alerts adds recovery controls that preserve unsaved settings. Old ambiguous Slack sent markers are retained without automatic replay; identifiable legacy dispatch failures have explicit reviewed recovery. No new dependency, secret, service or DNS change.

The complete local API/unit suite passed (402 plus typecheck) and the complete normal browser suite passed (306). The final scoped long-name wrapping fix then passed all 15 related browser checks; complete normal GitHub Tests on this final head remains mandatory before merge. Phone/iPad light/dark screenshots were inspected. A real forced port-collision regression also covers bounded fixture startup recovery and verifies that a competing HTTP process cannot impersonate the test Worker.

Publisher identity, frozen branch/head checks, secret redaction and existing narrow CI infrastructure retry safeguards remain unchanged. Application assertions and browser failures are never bypassed. Verify the exact merged tree, successful Cloudflare build and read-only live checks. Never submit production orders, emails or Slack test messages.

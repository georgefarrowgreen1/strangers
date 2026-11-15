# Strangers production audit fixes publisher

Source: `3b6d72c0d286292fff310aad2a0feff987986131`
Base: `ec3db40b7054c8e8f15dd99a2b1c7ccb39eb3740`
Branch: `fix/production-audit-findings`
Title: Fix production audit findings in orders, payroll and planning

Publishes only this frozen bundle to strangerscoffee/StrangersRepo after local validation. Existing encrypted STRANGERS_DEPLOY_TOKEN access verifies the saved collaborator and write permission, creates the PR, requires the complete normal Tests workflow and squash-merges under the saved user identity. Cloudflare then deploys main. No secret, additional migration, dependency, external service or DNS change; the newer announcement feature already on main is retained.

All nine audited issues are covered by focused regressions: catalogue/photo isolation, stock/grind increases, transactional repeat-order creation/recovery, invoice race guards, dated roast demand, cross-month payroll conservation, stale actual-hour saves, spreadsheet-safe text and frozen staff request recovery. Local full API passed again (383 plus typecheck), full browser passed (271 before final closure addition), and the expanded staff-order browser suite passed (15). The final merged API suite passed (386 plus typecheck) and all affected browser suites passed (33), with final phone/iPad light/dark visual review. Normal complete GitHub Tests on the final frozen head is required before merge.

Publisher identity, frozen branch/head checks, secret redaction and narrow single test-fixture retry safeguards are unchanged. No generic application assertion or browser failure is bypassed. Verify exact main tree and Cloudflare build, then use the adapted read-only HTTP/security-header/browser scripts. Never place production orders or send verification emails.

The first full GitHub run passed all 386 API and 276 browser cases but failed during session-security fixture teardown (an intercepted request outlived its browser context). The fixture now releases and awaits route callbacks before context disposal; all assertions remain intact, and its focused concurrent browser checks passed (13). The complete normal GitHub Tests must pass again on this final head before merge.

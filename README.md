# Wholesale UI refinement publisher

Publishes the verified `feature/compact-mobile-wholesale-header` commit `34d5ce1652180f8aaca08e3b6a821e1f2610fc1d` through the existing Tests-gated PR and squash merge. Cloudflare Workers Builds deploys main.

The approved mobile header is one 64 px row with the Strangers mark, Coffee/Orders, cart and a native account menu. Existing account controls, staff-preview Admin access, session privacy and desktop inline controls are preserved. Local verification covers 470 API/browser tests, a Worker dry build and 18 light/dark responsive layout checks.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

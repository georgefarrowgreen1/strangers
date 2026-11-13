# Wholesale UI refinement publisher

Publishes the verified `fix/center-wholesale-signin-logo` commit `bb2e8120fe2ce6901364c67577b0442ee2f316c5` through the existing Tests-gated PR and squash merge. Cloudflare Workers Builds deploys main.

The wholesale sign-in logo is centred using the existing image and theme. Staff order print/selection tools stay beside desktop filters, with horizontally scrollable filters and 44 px actions; narrow layouts wrap cleanly. This follows the already deployed compact footer and maintenance-note release.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

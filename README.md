# Compact wholesale footer publisher

Publishes the verified `fix/compact-wholesale-footer` commit `9470a2be7bd7f193cac828bafaacde3de55a0f4c` through the existing Tests-gated PR and squash merge. Cloudflare Workers Builds deploys main.

The approved footer becomes a slim Strangers mark, Terms and Website row using the existing theme, with 44 px targets. Header order history retains email deep links; there are no backend, schema or configuration changes.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

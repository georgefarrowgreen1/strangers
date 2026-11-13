# Strangers verified release publisher

Publishes the verified `feature/rota-leave-management` source through the existing Tests-gated PR and squash merge. Cloudflare Workers Builds deploys main. Frozen source: `d62fad1d76a5c9c768d430ef60b2f36f4ed12c4a`; tree `6a412fe6628a7dc6b2e9dcda9d90a9ed4c919af8`, based on main `467c3c4fab83f92c458f4b089765faaee79992fe`.

This release adds native rota holiday management, individual days-based balances, approvals, blackout/capacity rules, private absence types and inclusive bank-holiday days in lieu. Migration 24 preserves legacy records. No real employee allowances or Who’s Off data are imported; admins configure individual years and reconcile opening balances before enabling requests. Validation covers 503 API/browser tests, type checking and a Worker dry build.


Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

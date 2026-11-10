# Strangers page loader publisher

Publishes the tested `feature/faster-branded-loader` commit `2655958f6629385be1a8521316a0898966457cf2` to `strangerscoffee/StrangersRepo` through a normal Tests-gated pull request and squash merge. Cloudflare Workers Builds deploys main.

The shared loader shows the existing Strangers logo, uses smaller identity proofs and fewer startup requests, and recovers from interrupted checks. Every new activation still requires fresh verification before private content or owner-bound queues can be accessed.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A single migration-fixture `SQLITE_BUSY` failure may rerun its normal Tests job once. Other failures stop publication, and a failed retry cannot merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

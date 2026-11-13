# Strangers security and privacy publisher

Publishes the verified `security/data-access-review` commit `da54be88d3854861206e39a8fbd6b3f88af1d27f` through the existing Tests-gated PR and squash merge. Cloudflare Workers Builds deploys main.

Customer ordering gains fresh identity proofs, request/body guards and a native privacy shield. Origin checks use exact configured origins; authenticated files are no-store, protected resources reject cross-origin embedding, and streamed JSON bodies stop at their size limit. The dated security review documents evidence, encryption and remaining administrative controls. The same release includes the real browser favicon, bounded branding recovery, narrow browser-autofill noise handling and a 10 px gap between Rota email actions. Browser-history restoration delegates navigation to the session guard.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A single migration-fixture `SQLITE_BUSY` failure may rerun its normal Tests job once. Other failures stop publication, and a failed retry cannot merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

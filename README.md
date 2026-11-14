# Publish approved wholesale recovery and header fixes

Frozen source: `6845acd7d5399deb5bdee3ee406b8de1f93b7157`, based on main `a7f4facd6a75a8cdf40bca4994a6aa81c665fa15`.

Registers automatic migration 28 for the existing password-reset table/index and includes the reset API/browser tests in the normal CI commands. Keeps the phone header in one row with Orders & invoices in the account menu, labels the header Strangers Wholesale at every width, and labels the footer Strangers Coffee Company. Desktop keeps its history shortcut. Uses the existing database and email setup; no new secret, service or configuration is required.

Local validation: typecheck and all 349 API tests pass; all 221 browser tests pass. Nine focused recovery/migration/mobile-header checks and seven catalogue checks pass. Phone/tablet/desktop visual checks pass in light and dark with short and long names. The normal full GitHub Tests workflow must pass before merge.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

Release merges use the verified saved deployment identity after the required full Tests pass. The publisher disables native bot auto-merge on its exact open head, since bot-origin merges can suppress downstream workflow/deployment events. It never disables required tests or changes target workflows. A changed PR head is refused before changing merge settings.

# Publish wholesale module fix and path migration

Frozen source: `9fb7d2bd73cf910e40d944e0107ead5d69beb7e2`, based on main `02bfe5ec8a81f10997a1418cd735d1d1eb181cd4`.

Moves all browser files and active links to `/wholesale/`, keeps cached asset URLs and emailed document queries compatible, and fixes session-expiry module redirects without exposing catalogue data. The source-price snapshot is server-only and errors identify Strangers Wholesale. No database, cookie or browser basket/pending-request keys change; no secret, DNS, dependency or API changes are required.

Local validation: typecheck and all 351 API tests pass; all 228 browser tests pass, including the session-expiry race, authenticated legacy snapshot imports, compatibility asset/page paths, and phone/iPad light and dark journeys. The normal GitHub Tests workflow must pass before merge. Live verification reads public assets and auth pages without submitting forms or sending emails.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

Release merges use the verified saved deployment identity after the required full Tests pass. The publisher disables native bot auto-merge on its exact open head, since bot-origin merges can suppress downstream workflow/deployment events. It never disables required tests or changes target workflows. A changed PR head is refused before changing merge settings.

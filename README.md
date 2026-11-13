# Publish approved wholesale follow-up UI

Frozen source: `978bd838b646905aba597db79270d5d4c489f850`, based on main `49caf1f8d5dff68ce88770b2297109ca4ee6390b`.

Publishes the contact-name greeting, aligned desktop quantity/Add controls, clearer category filters and photo labels, and frame-filling images. Greetings refresh after contact saves, render names as text, handle blank/long names, and clear visible and accessible identity data on session invalidation. No migration, dependency, service or configuration changes are required.

Local validation includes typecheck, 340 API tests, contact-save and identity-privacy checks, and eight actual-source visual checks across phone/tablet/desktop light and dark layouts. The full local browser regression passed all 219 tests; after making the greeting journey wait for a freshly open account sheet and a confirmed successful profile save, all 14 affected catalogue and privacy browser checks passed; the normal full GitHub Tests workflow must pass before merge.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

Release merges use the verified saved deployment identity after the required full Tests pass. The publisher disables native bot auto-merge on its exact open head, since bot-origin merges can suppress downstream workflow/deployment events. It never disables required tests or changes target workflows. A changed PR head is refused before changing merge settings.

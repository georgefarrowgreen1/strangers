# Publish approved wholesale UI polish

Frozen source: `e16da01e2e2853dc9b8ef88d201ce6b5fb28113e`, based on main `34164d2ee0a2c29720f933d9b03e04efab7ac389`.

Implements the approved desktop/mobile refinements in the existing catalogue: softer card edges, tighter spacing, quieter typography/photo labels, larger desktop photos, consistent controls, account-menu history navigation and a scroll-only header shadow. Add keeps the brand colour, shows a brief check and gently updates the basket badge, respecting reduced motion and session shielding. Existing live catalogue, pricing, permissions, menus and checkout remain. No demo data, migrations, dependencies or configuration changes.

Local validation: typecheck and all 352 API tests pass; all 232 browser tests pass. Nine focused browser journeys and ten layout checks pass across320/393/820/1440/1920px in light and dark. The normal required GitHub Tests must also pass before squash merge.

Deployment access uses the encrypted Actions repository secret `STRANGERS_DEPLOY_TOKEN`. It must be a classic GitHub token for `georgefarrowgreen1` with `public_repo` access (the target is public and is owned by a different personal account). Add or rotate it in this repository’s Settings → Secrets and variables → Actions; never paste it into chat or commit it. Future runs read the secret automatically without device sign-in codes. Token expiry, revocation or permission changes require updating that secret. Missing access stops with setup guidance instead of prompting for another code.

The token is supplied only to the publishing step, held in its subprocess environment, redacted from reported errors and never persisted in the checkout. Temporary GitHub configuration is removed after each run; the reusable secret remains encrypted in GitHub. The expected account ID, target repository, source commit and destination branch are still verified. All changes use the normal Tests-gated PR and squash merge; no target workflow is changed or bypassed.

A narrowly identified migration-fixture `SQLITE_BUSY` failure or the invoice fixture's single-port startup collision may rerun its normal Tests job once. The retry is allowed only from the first workflow attempt, so restarting this publisher cannot grant further retries. Assertion failures and other failures stop publication; a successful full test run remains required before merge. A brief GitHub API replica delay when updating a newly created progress check is retried separately.

Release merges use the verified saved deployment identity after the required full Tests pass. The publisher disables native bot auto-merge on its exact open head, since bot-origin merges can suppress downstream workflow/deployment events. It never disables required tests or changes target workflows. A changed PR head is refused before changing merge settings.

# Strangers deployment publisher

This release publishes `feat/admin-daily-overview` to `strangerscoffee/StrangersRepo` through the persistent encrypted `STRANGERS_DEPLOY_TOKEN` Actions secret. It verifies the expected collaborator and write access, checks the frozen bundle and destination branch, creates a ready pull request and waits for the full required Tests workflow before a saved-user squash merge. Cloudflare then deploys main.

Source: `cf5ffe9820f410495c3621105cf67d800751b93d`
Base: `04773ea6dd9b3b754ec5b3b0cc3db54bcec4068e`
Title: Make Admin Overview focus on daily operations

The source is the actual application, not the illustrative mockup. No data migration, configuration, external service or secret change is needed.

Local release validation completed: 355 API tests plus typecheck passed; all 241 browser tests passed. Safeguard unit tests: 14 passed. Focused browser checks: 14 passed; Admin host/API checks: 10 passed; complete staff journey: 1 passed; new API/DST checks: 3 passed. Eight actual phone/iPad/desktop light/dark layouts were verified.

After merge, confirm the exact main commit’s Cloudflare production build succeeds, then run 123 read-only HTTP checks and four read-only live browser journeys. Protected admin assets must remain protected; authenticated layouts are verified locally. Do not place production orders or send emails during verification.

The first target CI attempt hit one local SQLite lock while the migration fixture used Wrangler to read invoice settings (no assertion failure). The publisher now recognises only that exact local read/query/test combination and can rerun the normal required Tests once. It still refuses assertion failures, other queries, multiple failures or a second retry. Source stays cf5ffe9; no application change is needed.

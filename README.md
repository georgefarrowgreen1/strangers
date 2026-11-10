# Strangers QuickBooks app settings publisher

Publishes the tested `feature/quickbooks-admin-credentials` commit `996c5b86dbca71f205a0ff90fdb30f6a6f4cbe7b` to `strangerscoffee/StrangersRepo` through a normal Tests-gated pull request and squash merge. Cloudflare Workers Builds deploys main.

Admins manage separate Sandbox/Live client IDs, write-only client secrets and webhook verifier tokens, with encrypted D1 storage, safe metadata, copyable Intuit URLs, version checks and a disconnect requirement for auth credential replacement. The existing independent hosting encryption key remains outside the database. This does not configure real Intuit credentials, grant consent or activate Live.

Device authentication uses the collaborator’s GitHub CLI login; credentials remain on the temporary runner and are removed when it finishes. The source head is verified before push and merge. No target workflow is changed or bypassed.

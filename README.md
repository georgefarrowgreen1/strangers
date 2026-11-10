# Strangers wholesale domain publisher

This temporary runner publishes the tested `feature/wholesale-trade-domain` commit `419deadf5766c0801e1e8256c5a6c102b6eda215` to `strangerscoffee/StrangersRepo` using the collaborator’s GitHub CLI device login. It creates a normal pull request, waits for Tests, verifies the exact head, then squash merges. Cloudflare Workers Builds deploys main through the existing production setup.

The change uses strangerscoffee.trade for customer ordering while keeping the old hostname operational for origin-local baskets and pending checkout recovery. Staff/Admin domains, records, employee privacy, invoice snapshots and QuickBooks URLs stay separate. No target workflow is changed or bypassed. Login credentials remain only on the temporary runner and are removed when it finishes. The device sign-in is a fresh authentication because the previous run has already cleared its credentials.

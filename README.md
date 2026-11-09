# Strangers wholesale publisher

Temporary publisher in georgefarrowgreen1/strangers for the tested change to strangerscoffee/StrangersRepo. Uses the existing isolated Actions branch and GitHub CLI device sign-in on a temporary hosted runner. Only georgefarrowgreen1 (292799750) is accepted. Credentials stay on that runner and are removed when it finishes.

Source: `6b7be8e8842c80b931e1afb3f396b6318d9fcb53` on `feature/wholesale-desktop`, based on deployed main `d6564c8d4374002b8242691dac88809c5ebffd26`. The Git bundle contains the exact frozen source and has been verified locally. The exact source passed full validation before publication.

This release adds configurable supplier/VAT settings, reviewed invoice issuance and protected PDF downloads, separate manual payment records and customer-owned invoice/due views. Invoice numbers/snapshots are immutable and backed up; migration13 adds the native D1 tables. Desktop workspaces/editors use more width, native choice sheets preserve drafts, review notifications sit beside Customers, and long baskets keep totals/Review reachable.

The new target branch has no allowed prior head (PRIOR=None). Unknown remote work is refused. The job pushes the exact verified commit without force, opens a normal PR, waits for Tests and squash-merges with an expected-head guard. Existing auto-merge races are rechecked safely. Cloudflare deploys main using its existing configuration. No direct main push or branch-rule bypass.

Validation: `npm test` passed all 144 API/PDF tests, including TypeScript; `npm run test:e2e` passed all 61 browser tests (205 total). The Worker dry build passed. Phone/iPad and 1280/1440/1920 px desktop views were checked in light/dark mode, including 32 additional desktop/iPad visual states. Native invoice PDF logo, VAT fields, pagination, geometry and byte stability were verified. No new service, DNS, billing, external payment or secret changes.

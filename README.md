# Strangers wholesale publisher

Temporary publisher in georgefarrowgreen1/strangers for the tested change to
strangerscoffee/StrangersRepo. It uses existing Actions settings and does not
change repository visibility or billing settings.

Source: `6cd16a313731fc9ec4a185146119f062521bd0ec` on `feature/wholesale-ux`,
based on deployed main `18adf9f2467b183e8b242ed2e3cf2700491e8f52`.
The verified Git bundle includes the UX, header-removal, admin-deletion and saved-order journey commits.
The job uses GitHub CLI device sign-in on a temporary GitHub-hosted runner. Only
georgefarrowgreen1 (user ID 292799750) is accepted. Credentials remain on the
runner, are never printed or sent to the Codex workspace, and are removed at the
end. No credentials are stored in this repository.

The job pushes the verified branch, opens a normal PR into main, waits for Tests
and requests squash merge without overriding branch rules. Cloudflare deploys
main using the existing target configuration. It does not push to main or force
any branch.

The beta keeps the existing preview.staffstrangerscoffee.com address and shared
Liquid Glass design. This release adds compact customer history with progress,
expandable saved details and owned pagination/counts. Repeat ordering confirms a
basket at refreshed prices, explains unavailable/limited bags, preserves existing
items and requires another review when prices, availability or the basket change.
Native Admin gains packing lists and version-checked status shortcuts with busy,
conflict/reload and focus safeguards, and removes the requested ordering-link
button from its Wholesale header. Cached pages and profile saves recheck the
current identity. Existing approval, privacy and durable checkout recovery remain.

Admins can remove customer and staff test orders through native confirmation and
a version-checked DELETE. Removed orders leave active reads, lists, counts and
preparation totals. Original records remain as audit/idempotency tombstones in
backups; matching UUID retries return 410 instead of recreating them. Removing
an order does not initiate a payment, refund or shipping action.

The publisher tolerates the target repository's auto-merge winning the merge race,
rechecking the same PR head and merged state before declaring success. It always
waits for Tests and uses the expected-head guard; it never overrides branch rules.

Validation passed: 126 API/model/security tests and 49 browser tests, a Worker
dry build, git diff --check and phone/iPad light/dark UI review. No DNS, billing,
schema, secret or additional service changes are required; payments and shipping
remain manual.

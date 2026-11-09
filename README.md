# Strangers wholesale publisher

Temporary publisher in georgefarrowgreen1/strangers for the tested change to
strangerscoffee/StrangersRepo. It uses existing Actions settings and does not
change repository visibility or billing settings.

Source: `74d4fb5e17cbeff5221fb55c62be7275df067362` on `feature/wholesale-beta`, in the verified Git bundle.
The job uses GitHub CLI device sign-in on a temporary GitHub-hosted runner. Only
georgefarrowgreen1 (user ID 292799750) is accepted. Credentials remain on the
runner, are never printed or sent to the Codex workspace, and are removed at the
end. No credentials are stored in this repository.

The job pushes the verified branch, opens a normal PR into main, waits for Tests
and requests squash merge without overriding branch rules. Cloudflare deploys
main using the existing target configuration. It does not push to main or force
any branch.

The beta keeps the existing preview.staffstrangerscoffee.com address with Beta
labelling and brings customer ordering and native Admin → Wholesale into the
shared Liquid Glass design system. Approved customers place real orders;
registration approval, stock controls, catalogue photos/prices and payment terms
remain operational. Interrupted checkout persists the same request and recovers
its receipt, including malformed replies and account-switch protection. Admin
search and pagination reach older orders/customers, with totals from all records.

The publisher tolerates the target repository's auto-merge winning the merge race,
rechecking the same PR head and merged state before declaring success. It always
waits for Tests and uses the expected-head guard; it never overrides branch rules.

Final validation passed: all 119 API tests and 37 browser tests, a Worker dry
build and phone/iPad light/dark UI review. Sign-in and registration were also
checked at four widths in both themes. No DNS, billing, schema, secret or
additional service changes are required.
